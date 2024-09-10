import * as d3 from "d3";
import { default as crossfilter } from "https://cdn.skypack.dev/crossfilter2@1.5.4?min";
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
} from "../lib.js";

import {
    define_arrowhead,
    update_brush_history,
    clear_selected,
    set_selected,
    set_selected2,
    get_selected,
    update_point_style,
    draw_boxes,
    set_pred,
} from "./view-utils.js";

import { compute_predicates } from "../PredicateEngine.js";

export default class ProjectionView {
    constructor(
        data,
        {
            x, //array of x coordinates for the DR projection
            y,
        } = {},
        controller,
        config,
    ) {
        /*
    - Takes projection coordinates and reorder it
    - Knows hwo to color points within it
    - Returns brushed data points
    - For now (maybe move to somewhere else in the future), its brush also ask backend for predicates and retain that knowledge of predicates
  */
        this.data = data;
        this.x = x;
        this.y = y;
        this.controller = controller;
        this.config = config;
        this.attributes = Object.keys(data[0]);

        this.cf = this.init_crossfilter(data);
        this.node = this.init_node();
        this.draw();
        this.brush = this.init_brush();
        this.brush_mode = "single"; //TODO support "contrustive" and "curve"
        this.predicate_mode = "data extent"; // TODO "predicate regression"

        return this;
    }

    init_crossfilter(data) {
        //Take all keys in data[0] as attributes,
        //Returns
        //this.crossfilter_dimensions - an object with keys being attributes,
        //and values beinging the corresponding crossfilter dimension objects
        let cf_attributes = Object.keys(data[0]);
        let cf = crossfilter(data);
        let cf_dimensions = cf_attributes.map((attr) =>
            cf.dimension((d) => d[attr]),
        );
        cf_attributes.push("x", "y");
        cf_dimensions.push(
            cf.dimension((d, i) => this.x[i]),
            cf.dimension((d, i) => this.y[i]),
        );
        this.crossfilter_dimensions = Object.fromEntries(
            zip(cf_attributes, cf_dimensions),
        );
        return cf;
    }

    init_node() {
        let {
            width,
            scatter_width,
            scatter_height,
            font_size,
            scatter_padding,
        } = this.config;

        //layout configs
        // width measures include margins assigned to frame
        this.plot_width = width * scatter_width; //width of main scatter plot and SPLOM
        this.plot_height = width * scatter_height + 2.6 * font_size; // "+ 2.6 * fs" makes sure the scatter plot is squared
        //paddings controls how much space we give the scatter plot within the frame.
        this.padding_left = 1 + scatter_padding;
        this.padding_right = 1 + scatter_padding;
        this.padding_bottom = scatter_padding;
        this.padding_top = font_size * 1.6 + scatter_padding;

        this.svg = d3
            .create("svg")
            .attr("width", this.plot_width) //give enough margin for frame shadow
            .attr("height", this.plot_height)
            .style("overflow", "visible");
        define_arrowhead(this.svg);

        let return_node = this.svg.node();
        // set_value(return_node, {}); //initial empty value

        this.projection_g = this.svg.append("g");
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
        let sc = (d) => d3.schemeCategory10[0]; //TODO variable me

        //draw projection scatter plot
        this.sca = scatter(this.projection_g, data, {
            x: (d, i) => this.x[i],
            y: (d, i) => this.y[i],
            s: (d) => 5,
            width: this.plot_width,
            height: this.plot_height,
            padding_left: this.padding_left,
            padding_right: this.padding_right,
            padding_bottom: this.padding_bottom,
            padding_top: this.padding_top,
            scales: { sc },
            is_square_scale: false,
            // xlabel: scatter_attr_x,
            // ylabel: scatter_attr_y
        });
        this.sca.selectAll(".tick text").remove();
    }

    init_brush() {
        //BRUSH
        this.n_boxes = 1;
        this.full_brush_history = [];
        this.sample_brush_history = [];
        this.g_brush = this.svg.append("g").attr("class", "brush");
        this.g_brush_path = this.svg.append("g"); // arrow drawn for contrastive and curve brush

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

    brush_start() {
        this.full_brush_history = [];
        clear_selected(this.data);
        //clear all cross filters
        for (let dimension of Object.values(this.crossfilter_dimensions)) {
            dimension.filterAll();
        }
        // reveal brush bounding box
        this.g_brush.selectAll(".selection").attr("display", null);

        //set n_boxes based on brush mode
        if (event.mode === "handle") {
            //brush resize, single predicate mode
            this.n_boxes = 1;
            this.g_brush_path.call(clear_path);
        } else if (event.mode === "drag") {
            //brush drag=>contrastive/multiple predicates mode
            if (this.brush_mode == "single") {
                this.n_boxes = 1;
            } else if (this.brush_mode == "contrastive") {
                this.n_boxes = 2;
            } else {
                this.n_boxes = 12;
            }
        }
    }

    async brushed(event) {
        console.log("brushed, this.n_boxes", this.n_boxes);
        if (this.n_boxes > 1 && event.mode !== "drag") {
            return;
        }

        console.assert(
            event.selection !== null,
            "[function brushed(event)] event.selection is null. ",
        );

        //grab selection
        let brushed_region;
        brushed_region = this.get_brushed_region(
            event.selection,
            this.sca.scales.sx,
            this.sca.scales.sy,
        );
        this.sample_brush_history = update_brush_history(
            this.full_brush_history,
            brushed_region,
            this.n_boxes,
        );

        //update the .selected attribute in data base on brush selection
        if (this.brush_mode === "single") {
            clear_selected(this.data);
        }
        set_selected(
            this.data,
            brushed_region,
            this.sca.x,
            this.sca.y,
            this.cf,
            this.crossfilter_dimensions,
        );

        if (this.n_boxes == 1 && this.predicate_mode === "data extent") {
            update_point_style(this.sca, "selection");
        }

        //draw fancy brush stroke (arrow, and shaded stroke)
        if (this.n_boxes > 1) {
            this.g_brush_path.call(draw_path, this.sample_brush_history, {
                //hide the broad brush stroke if n_boxes = 2 i.e. contrastive mode
                size:
                    this.n_boxes == 2
                        ? 0
                        : this.full_brush_history[0].brush_size,
                "stroke-width": 3,
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

        //eager draw: in 'data extent' mode, draw highlights on splom immediately
        if (this.predicate_mode === "data extent") {
            //compute predicates based on selected data
            //TODO fixme elsewhere
            this.data.forEach((d, i) => {
                d.x = this.x[i];
                d.y = this.y[i];
            });
            let { predicates, attributes, qualities } =
                await compute_predicates(
                    this.data,
                    this.full_brush_history,
                    this.n_boxes,
                    this.predicate_mode,
                    this.attributes,
                    { x: (d, i) => d.x, y: (d, i) => d.y },
                );

            if (predicates !== undefined && predicates.length >= 1) {
                //Color scatter plot points by false positives, false negatives, etc.
                let last_predicate = predicates[predicates.length - 1];
                set_pred(this.data, last_predicate);
                update_point_style(this.sca, "selection");
            }

            console.log("projection view updating other views...");
            console.log("predicates", predicates);
            console.log("attributes", attributes);

            //update other views
            this.controller.on_projection_view_change({
                predicates,
                attributes,
                qualities,
                n_boxes: this.n_boxes,
                full_brush_history: this.full_brush_history,
                sample_brush_history: this.sample_brush_history,
                x: (d, i) => this.x[i],
                y: (d, i) => this.y[i],
            });
        }
    }

    async brush_end(event) {
        if (this.n_boxes > 1 && event.mode !== "drag") {
            // In contrastive or curve mode (n_boxes > 1), if the brush is resized rather than dragged, do nothing.
            return;
        }

        // optionally, remove brush bounding boxes (bboxes)
        this.sca.selectAll(".bbox").remove();

        if (this.n_boxes > 1 && event.mode === "drag") {
            //hide brush
            this.g_brush.selectAll(".selection").attr("display", "none");

            if (this.n_boxes == 2) {
                //annotate brush-selected data by .first_brush and .second_brush and .selected
                set_selected_2(
                    this.data,
                    this.sample_brush_history,
                    this.x,
                    this.y,
                );
            }
        }
        //compute predicates based on selected data
        let { predicates, attributes, qualities } = await compute_predicates(
            this.data,
            this.full_brush_history,
            this.n_boxes,
            this.predicate_mode,
            this.attributes,
            { x: (d, i) => this.x[i], y: (d, i) => this.y[i] },
        );

        if (predicates !== undefined && predicates.length >= 1) {
            //Color scatter plot points by false positives, false negatives, etc.
            let last_predicate = predicates[predicates.length - 1];
            set_pred(this.data, last_predicate);

            if (this.n_boxes == 1) {
                if (this.predicate_mode === "data extent") {
                    update_point_style(this.sca, "selection");
                } else {
                    //color points by false netagivity, false postivity, etc.
                    update_point_style(this.sca, "confusion");
                }
            } else if (this.n_boxes == 2) {
                //color two sets of points by 2 brush boxes
                update_point_style(this.sca, "contrastive");
            } else {
                //highligh all selected points by brush curve
                update_point_style(this.sca, "selection");
            }

            //update other views
            this.controller.on_projection_view_change({
                predicates,
                attributes,
                qualities,
                n_boxes: this.n_boxes,
                full_brush_history: this.full_brush_history,
                sample_brush_history: this.sample_brush_history,
                x: (d, i) => this.x[i],
                y: (d, i) => this.y[i],
            });
        }

        //when brush get cleared, clear data selection and crossfilter
        if (event.selection === null) {
            this.crossfilter_dimensions["x"].filterAll();
            this.crossfilter_dimensions["y"].filterAll();
            clear_selected(this.data);
            // this.sca.redraw(); // TODO
        }
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
        return { x0, x1, y0, y1, cx, cy, brush_size };
    }
}