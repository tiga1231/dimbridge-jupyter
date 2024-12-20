import * as d3 from "d3";
import {default as crossfilter} from "https://cdn.skypack.dev/crossfilter2@1.5.4?min";
import {
    make_frame,
    make_sub_frame,
    make_bridge_frame,
} from "../lib/fancy-frames.js";

import {
    C,
    reshape,
    create_svg,
    linspace,
    zip,
    scatter,
    overflow_box,
    scatter_gl,
} from "../lib.js";

import {
    clear_path,
    clear_selected,
    define_arrowhead,
    draw_boxes,
    draw_path,
    get_point_style,
    set_pred,
    set_selected,
    set_selected_2,
    set_brushed,
    update_brush_history,
    update_point_style_gl,
    depth_func,
} from "./view-utils.js";

export default class ProjectionView {
    constructor(
        data,
        {
            x, //array of x coordinates for the DR projection
            y,
            c,
            s,
            predicate_engine,
            predicate_mode = "data extent",
            brush_mode = "single",
        } = {},
        model,
        controller,
        config,
    ) {
        /*
    - Takes projection coordinates and reorder it
    - Knows hwo to color points within it
    - Returns brushed data points
    - For now (maybe move to somewhere else in the future), its brush also ask backend for predicates and retain that knowledge of predicates
  */
        console.log("new ProjectionView");
        this.data = data;
        this.model = model; // the python model
        this.x = x;
        this.y = y;

        this.s = s; //size
        this.c = c; //color

        this.controller = controller;
        this.config = config;
        this.attributes = Object.keys(data[0]);

        this.brush_cf = this.init_brush_crossfilter(data, this.attributes);
        this.predicate_cf = this.init_predicate_crossfilter(
            data,
            this.attributes,
        );
        this.node = this.init_node();

        this.draw();
        this.brush = this.init_brush();

        this.predicate_engine = predicate_engine;
        this.set_predicate_callback();

        this.predicate_mode = this.predicate_engine.mode; // TODO"predicate regression"
        this.brush_mode = brush_mode;

        return this;
    }

    set_predicate_callback() {
        this.model.on("change:predicates", (event, data) => {
            let {predicates, qualities} = data;
            console.log("PREDICATES", predicates);
            //find union of predicate attributes in response.predicates
            let attributes_union = d3
                .groups(predicates.flat(), (d) => d.attribute)
                .map((d) => d[0]);
            // set predicates to be an array of {attr_name:interval} objects, indexed by brush time
            predicates = predicates.map((predicate_t) => {
                let key_value_pairs = predicate_t.map((p) => [
                    p.attribute,
                    p.interval,
                ]);
                let predicate = Object.fromEntries(key_value_pairs);
                for (let attr of attributes_union) {
                    if (predicate[attr] === undefined) {
                        predicate[attr] = this.predicate_engine.extent[attr];
                    }
                }
                return predicate;
            });
            //update plots
            if (predicates !== undefined && predicates.length >= 1) {
                //Color scatter plot points by false positives, false negatives, etc.
                let last_predicate = predicates[predicates.length - 1];
                set_selected(
                    this.data,
                    this.sample_brush_history,
                    this.brush_cf,
                    this.brush_cf_dimensions,
                );
                set_pred(
                    this.data,
                    last_predicate,
                    this.attributes,
                    this.predicate_cf,
                    this.predicate_cf_dimensions,
                );
                if (this.n_boxes == 1) {
                    if (this.predicate_mode === "data extent") {
                        update_point_style_gl(this.sca, "confusion");
                    } else {
                        //color points by false netagivity, false postivity, etc.
                        update_point_style_gl(this.sca, "confusion");
                    }
                } else if (this.n_boxes == 2) {
                    //color two sets of points by 2 brush boxes
                    update_point_style_gl(this.sca, "contrastive");
                } else {
                    //highligh all selected points by brush curve
                    update_point_style_gl(this.sca, "brush");
                }
                //inform other views
                this.controller.on_projection_view_change(predicates);
            }
        });
    }

    init_brush_crossfilter(data, attributes) {
        //Take all data and an awway of attribute strings
        //Returns
        //this.brush_cf_dimensions - an object with keys being attributes,
        //and values beinging the corresponding crossfilter dimension objects
        let cf_attributes = attributes.slice();
        let cf = crossfilter(data);
        // let cf_dimensions = cf_attributes.map((attr) =>
        // cf.dimension((d) => d[attr]),
        // );
        // cf_attributes.push("x", "y");
        // cf_dimensions.push(
        // cf.dimension((d, i) => this.x[i]),
        // cf.dimension((d, i) => this.y[i]),
        // );
        // this.brush_cf_dimensions = Object.fromEntries(
        //     zip(cf_attributes, cf_dimensions),
        // );
        this.brush_cf_dimensions = {
            x: cf.dimension((d, i) => this.x[i]),
            y: cf.dimension((d, i) => this.y[i]),
        };
        return cf;
    }

    init_predicate_crossfilter(data, attributes) {
        //Take all data and an awway of attribute strings
        //Returns
        //this.brush_cf_dimensions - an object with keys being attributes,
        //and values beinging the corresponding crossfilter dimension objects
        let cf_attributes = attributes.slice();
        let cf = crossfilter(data);
        let cf_dimensions = cf_attributes.map((attr) =>
            cf.dimension((d) => d[attr]),
        );
        this.predicate_cf_dimensions = Object.fromEntries(
            zip(cf_attributes, cf_dimensions),
        );
        return cf;
    }

    init_node() {
        let {width, scatter_width, scatter_height, font_size, scatter_padding} =
            this.config;

        //layout configs
        // width measures include margins assigned to frame
        this.plot_width = width * scatter_width; //width of main scatter plot and SPLOM
        this.plot_height = width * scatter_height + 2.6 * font_size; // "+ 2.6 * fs" makes sure the scatter plot is squared

        //paddings controls how much space we give the scatter plot within the frame.
        this.padding_left = scatter_padding;
        this.padding_right = scatter_padding;
        this.padding_bottom = scatter_padding;
        this.padding_top = font_size * 1.6 + scatter_padding;

        this.fancy_frame = d3
            .create("svg")
            .attr("width", this.plot_width) //give enough margin for frame shadow
            .attr("height", this.plot_height)
            .style("overflow", "visible");

        let return_node = d3.create("div").node();
        return_node.appendChild(this.fancy_frame.node());
        // let return_node = this.fancy_frame.node();
        // set_value(return_node, {}); //initial empty value

        this.projection_g = this.fancy_frame.append("g");
        make_frame(
            this.projection_g,
            0,
            0,
            this.plot_width,
            this.plot_height,
            "Projection View",
            font_size,
            true,
        );
        return return_node;
    }

    draw() {
        let data = this.data;
        // sc = (d, i) => d3.schemeCategory10[0];
        let sc = (d, i) => this.c[i];

        // let style = get_point_style("selection");
        // let sc = (d, i) => style(d, i).fill;
        this.sca = scatter_gl(d3.select(this.node), data, {
            x: (d, i) => this.x[i],
            y: (d, i) => this.y[i],
            s: (d, i) => this.s,
            stroke_width: 0.8,
            width: this.plot_width,
            height: this.plot_height,
            padding_left: this.padding_left,
            padding_right: this.padding_right,
            padding_bottom: this.padding_bottom,
            padding_top: this.padding_top,
            scales: {sc},
            is_square_scale: true,

            dpi_scale: 2.0,

            xticks: this.config.xticks,
            yticks: this.config.yticks,
        });
        this.sca.overlay.selectAll(".tick text").remove(); // remove tick marks as dim-reduction axes are arbitrary
        define_arrowhead(this.sca.overlay);
        return this.sca;
    }

    init_brush() {
        //BRUSH
        this.n_boxes = 1;
        this.full_brush_history = [];
        this.sample_brush_history = [];
        this.g_brush = this.sca.overlay.append("g").attr("class", "brush");
        this.g_brush_path = this.sca.overlay.append("g"); // arrow drawn for contrastive and curve brush

        //bounding box of the plot rectangle in the svg, in pixels
        let plot_extent_x = [
            this.padding_left,
            this.plot_width - this.padding_right,
        ];
        let plot_extent_y = [
            this.padding_top,
            this.plot_height - this.padding_bottom,
        ];

        let brush = d3
            .brush()
            .extent([
                [plot_extent_x[0], plot_extent_y[0]],
                [plot_extent_x[1], plot_extent_y[1]],
            ])
            .on("start", (event) => this.brush_start(event))
            .on("brush", (event) => this.brushed(event))
            .on("end", (event) => this.brush_end(event));

        this.g_brush.call(brush);
        this.g_brush //remove brush UI stroke
            .select("rect.selection")
            .attr("stroke", "none");

        return brush;
    }

    brush_start(event) {
        this.full_brush_history = [];
        clear_selected(this.data);

        //clear all cross filters
        for (let dimension of Object.values(this.brush_cf_dimensions)) {
            dimension.filterAll();
        }

        // reveal brush bounding box
        this.g_brush.selectAll(".selection").attr("display", null);

        if (event.mode === "handle") {
            //brush resized, single predicate mode
            this.n_boxes = 1;
            this.g_brush_path.call(clear_path);
        } else if (event.mode === "drag") {
            //brush drag=>contrastive/multiple predicates mode
            //set n_boxes based on brush mode
            if (this.brush_mode == "single") {
                this.n_boxes = 1;
            } else if (this.brush_mode == "contrastive") {
                this.n_boxes = 2;
            } else if (this.brush_mode == "curve") {
                this.n_boxes = 12;
            }
        }
        this.controller.on_projection_view_brush_start();
    }

    async brushed(event) {
        console.log("brushed n_boxes:", this.n_boxes);
        if (this.n_boxes > 1 && event.mode !== "drag") {
            return;
        }

        //grab selection
        let brushed_region = this.get_brushed_region(
            event.selection,
            this.sca.scales.sx,
            this.sca.scales.sy,
        );
        //update brush history
        this.sample_brush_history = update_brush_history(
            this.full_brush_history,
            brushed_region,
            this.n_boxes,
        );

        //draw fancy brush stroke (arrow, and shaded stroke)
        if (this.n_boxes == 2) {
            this.g_brush_path.call(draw_path, this.sample_brush_history, {
                size: 0,
                "stroke-width": 4,
            });
        } else if (this.n_boxes > 2) {
            this.g_brush_path.call(draw_path, this.sample_brush_history, {
                size: this.full_brush_history[0].brush_size,
                "stroke-width": 4,
            });
        }

        //draw boxes in the main scatter plot
        draw_boxes(
            this.sca,
            this.sample_brush_history.map((b) => ({
                x0: b.x_extent[0],
                x1: b.x_extent[1],
                y0: b.y_extent[0],
                y1: b.y_extent[1],
            })),
        );
        //raise the drawn brush rectangle on top
        this.g_brush.raise();

        //eager draw: in single brush, draw highlights on splom immediately
        if (this.predicate_mode === "data extent") {
            //compute predicates based on selected data
            let n_brushes = this.full_brush_history.length;
            let predicates = this.predicate_engine.compute_predicates(
                this.sample_brush_history,
            );

            if (this.n_boxes == 1) {
                //update data - the d.selected and d.brushed attribute base on brush
                set_selected(
                    this.data,
                    this.sample_brush_history,
                    this.brush_cf,
                    this.brush_cf_dimensions,
                );
                set_pred(
                    this.data,
                    predicates[predicates.length - 1],
                    this.attributes,
                    this.predicate_cf,
                    this.predicate_cf_dimensions,
                );
                set_brushed(
                    this.data,
                    this.sample_brush_history,
                    this.brush_cf,
                    this.brush_cf_dimensions,
                );
                update_point_style_gl(this.sca, "confusion");
            } else if (this.n_boxes == 2) {
                set_selected_2(
                    this.data,
                    this.sample_brush_history,
                    this.brush_cf,
                    this.brush_cf_dimensions,
                );
                set_brushed(
                    this.data,
                    this.sample_brush_history,
                    this.brush_cf,
                    this.brush_cf_dimensions,
                );
                update_point_style_gl(this.sca, "contrastive");
            } else {
                set_brushed(
                    this.data,
                    this.sample_brush_history,
                    this.brush_cf,
                    this.brush_cf_dimensions,
                );
                update_point_style_gl(this.sca, "brush");
            }
            //update other views
            this.controller.on_projection_view_change(
                predicates,
                this.data.length,
            );
        }
    }

    async brush_end(event) {
        //sync with backend
        //dragging brushed region
        if (this.n_boxes == 1) {
            set_selected(
                this.data,
                this.sample_brush_history,
                this.brush_cf,
                this.brush_cf_dimensions,
            );
            // let selected = this.brush_cf.allFiltered().map((d) => d.index);
            // let selected = this.data.map((d) => d.selected);
        } else if (this.n_boxes == 2) {
            //annotate brush-selected data by .first_brush and .second_brush
            set_selected_2(
                this.data,
                this.sample_brush_history,
                this.brush_cf,
                this.brush_cf_dimensions,
            );
        }
        //update data - the d.selected and d.brushed attribute base on brush
        set_brushed(
            this.data,
            this.sample_brush_history,
            this.brush_cf,
            this.brush_cf_dimensions,
        );

        if (event.selection === null) {
            // remove brush bounding boxes (bboxes) after brush cancelled
            this.sca.overlay.selectAll(".bbox").remove();

            //when brush get cleared, clear data selection and crossfilter
            // this.brush_cf_dimensions["x"].filterAll();
            // this.brush_cf_dimensions["y"].filterAll();
            // clear_selected(this.data);
            //redraw
            // let sc = (d) => d3.schemeCategory10[0];
            // this.sca.recolor(sc, {depth: depth_func("selection")});
            return;
        }

        // optionally, remove brush bounding boxes (bboxes) after brush end (e.g, mouse release)
        this.sca.overlay.selectAll(".bbox").remove();

        // In contrastive or curve mode (n_boxes > 1),
        // if the brush is resized rather than dragged, do nothing.
        if (this.n_boxes > 1 && event.mode !== "drag") {
            return;
        } else if (this.n_boxes > 1 && event.mode === "drag") {
            //dragging brushed region
            //hide brush
            this.g_brush.selectAll(".selection").attr("display", "none");
        }
        //compute predicates based on selected data points
        this.predicate_engine.compute_predicates(this.sample_brush_history);
    }

    get_brushed_region(selection, sx, sy) {
        let [[x0, y0], [x1, y1]] = selection;
        let cx = (x0 + x1) / 2;
        let cy = (y0 + y1) / 2;
        let brush_size = 1.2 * Math.sqrt(Math.abs((x0 - x1) * (y0 - y1)));
        x0 = sx.invert(x0);
        x1 = sx.invert(x1);
        y0 = sy.invert(y0);
        y1 = sy.invert(y1);
        [y0, y1] = [Math.min(y0, y1), Math.max(y0, y1)];
        return {x0, x1, y0, y1, cx, cy, brush_size};
    }
}
