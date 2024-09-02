import { C, reshape, create_svg, linspace, zip } from "./lib.js";

export class ProjectionView {
    constructor(controller) {
        /*
    - Takes projection coordinates and reorder it
    - Knows hwo to color points within it
    - Returns brushed data points
    - For now (maybe move to somewhere else in the future), its brush also ask backend for predicates and retain that knowledge of predicates
  */
        this.controller = controller;
        this.node = this.init_node();
        this.x = (d) => d[scatter_attr_x];
        this.y = (d) => d[scatter_attr_y];
        this.draw();
        this.brush = this.init_brush();
        return this;
    }

    init_node() {
        //layout configs
        // width measures include margins assigned to frame
        this.plot_width = width * scatter_width; //width of main scatter plot and SPLOM
        this.plot_height = width * scatter_height + 2.6 * config.font_size; // "+ 2.6 * fs" makes sure the scatter plot is squared
        //paddings controls how much space we give the scatter plot within the frame.
        this.padding_left = 1 + config.scatter_padding;
        this.padding_right = 1 + config.scatter_padding;
        this.padding_bottom = config.scatter_padding;
        this.padding_top = config.font_size * 1.6 + config.scatter_padding;

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
            config.font_size,
            true,
        );
        return return_node;
    }

    draw() {
        //draw projection scatter plot
        this.sca = scatter(this.projection_g, data, {
            x: this.x,
            y: this.y,
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
        clear_selected(data);
        //clear all cross filters
        for (let dimension of Object.values(crossfilter_dimensions)) {
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
            if (brush_mode == "single") {
                this.n_boxes = 1;
            } else if (brush_mode == "contrastive") {
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
        if (brush_mode === "single") {
            clear_selected(data);
        }
        set_selected(data, brushed_region, this.sca.x, this.sca.y);

        if (this.n_boxes == 1 && predicate_mode === "data extent") {
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
        if (predicate_mode === "data extent") {
            //compute predicates based on selected data
            let x = (d) => d[scatter_attr_x];
            let y = (d) => d[scatter_attr_y];
            let { predicates, attributes, qualities } =
                await compute_predicates(
                    this.full_brush_history,
                    this.n_boxes,
                    get_selected,
                    { x, y },
                );

            if (predicates !== undefined && predicates.length >= 1) {
                //Color scatter plot points by false positives, false negatives, etc.
                let last_predicate = predicates[predicates.length - 1];
                set_pred(data, last_predicate);
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
                x: this.x,
                y: this.y,
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
                set_selected_2(data, this.sample_brush_history, this.x, this.y);
            }
        }
        //compute predicates based on selected data
        let { predicates, attributes, qualities } = await compute_predicates(
            this.full_brush_history,
            this.n_boxes,
            get_selected,
            { x: this.x, y: this.y },
        );

        if (predicates !== undefined && predicates.length >= 1) {
            //Color scatter plot points by false positives, false negatives, etc.
            let last_predicate = predicates[predicates.length - 1];
            set_pred(data, last_predicate);

            if (this.n_boxes == 1) {
                if (predicate_mode === "data extent") {
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
                x: this.x,
                y: this.y,
            });
        }

        //when brush get cleared, clear data selection and crossfilter
        if (event.selection === null) {
            crossfilter_dimensions["x"].filterAll();
            crossfilter_dimensions["y"].filterAll();
            clear_selected(data);
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

export class PredicateView {
    svg;
    view_g;
    controller;
    node;
    plot_width;
    plot_height;
    constructor(controller) {
        console.log("new PredicateView");
        this.controller = controller;
        this.node = this.init_node();
        return this;
    }

    init_node() {
        this.plot_width = width * (1 - scatter_width * 2) - config.gap; //width of predicate view
        this.plot_height = width * scatter_height + 2.6 * config.font_size; // "+ 2.6 * fs" makes sure the scatter plot is squared

        let padding_left = 1 + config.scatter_padding;
        let padding_right = 1 + config.scatter_padding;
        this.padding_bottom = config.scatter_padding;
        this.padding_top = config.font_size * 1.6 + config.scatter_padding;

        let return_node = d3
            .create("div")
            .style("width", `${this.plot_width}px`)
            .style("height", `${this.plot_height}px`)
            .style("position", "relative")
            .node();

        let frame = create_svg(this.plot_width, this.plot_height).style(
            "overflow",
            "visible",
        );
        frame
            .append("g")
            .call(
                make_bridge_frame,
                0,
                0,
                this.plot_width,
                this.plot_height,
                "Predicate View",
                config.font_size,
                true,
            );
        return_node.appendChild(frame.node());

        this.svg = create_svg(this.plot_width, this.plot_height);
        //predicate view
        this.view_g = this.svg.append("g");
        let ob = overflow_box(this.svg.node(), width * scatter_height);
        d3.select(ob)
            .style("position", "absolute")
            .style("top", `${this.padding_top}px`)
            .style("left", "0");
        return_node.appendChild(ob);

        return return_node;
    }

    draw(n_boxes, predicates, attributes, sample_brush_history, x, y) {
        // draw(n_boxes, predicates) {

        /*
    Takes predicates data (see first line of code) from projection_view.
    Renders predicate view depending on brush mode/state indicated by n_boxes
    For every predicate attribute, 
      when n_boxes=1, predicate view displays a range bar horizontally
      when n_boxes=2, it displays a _pair_ of categorically colored range bars horizontally
      when n_boxes>2, it displays a sequence of range bars _vertivally_ like a time steries
    */

        //resize height of the overflowed svg
        let subplot_height =
            n_boxes > 2
                ? predicate_view_subplot_height * 4.1
                : predicate_view_subplot_height;
        let svg_height =
            subplot_height *
            (attributes !== undefined ? attributes.length + 2 : 1000);
        this.svg.attr("height", svg_height + 300);
        if (data[0].image_url) {
            svg_height += 300;
        }

        //limit the number of attributes plot in both predicate view and splom
        if (attributes !== undefined) {
            let max_n_predicates = Infinity;
            attributes = attributes.slice(0, max_n_predicates);
        }

        //draw
        if (predicates !== undefined) {
            let predicate_view_style = {
                padding_top: this.padding_top,
                padding_bottom: this.padding_bottom,
                width: this.plot_width,
                height: this.plot_height,
                font_size: predicate_view_fontsize,
                subplot_height: predicate_view_subplot_height,
                x_shift: this.plot_width,
            };
            //assign predicate_view different draw functions depending on brush number
            if (n_boxes == 1) {
                this.view_g.call(
                    predicate_single,
                    this.controller,
                    predicate_view_style,
                );
            } else if (n_boxes == 2) {
                this.view_g.call(predicate_contrastive, predicate_view_style);
            } else {
                this.view_g.call(predicate_multiple, predicate_view_style);
            }
            if (n_boxes == 1) {
                let selected_data = get_selected(
                    data,
                    sample_brush_history[sample_brush_history.length - 1],
                    { x, y },
                );
                this.view_g.draw(predicates, attributes, selected_data);
            } else if (n_boxes == 2) {
                let selected_TODO = undefined;
                this.view_g.draw(
                    predicates,
                    attributes,
                    n_boxes,
                    selected_TODO,
                );
            } else {
                this.view_g.draw(predicates, attributes, n_boxes);
            }
        }
    }

    draw2() {}
}

export class SplomView {
    constructor(controller) {
        /*
    - Take data points and a list of attributes (e.g., predicates, or manual selection of attributes)
    - Renders data points in SPLOM
    - Knows how to color its points
    */
        console.log("SplomView init");
        this.node = this.init_node();
    }

    init_node() {
        let n_boxes = 1;

        //gap between subplots in splot, measured in proportion (0 to 1) to the size of a subplot
        let splom_spacing = 0.03;
        this.plot_width = width * scatter_width - config.gap; //width of main scatter plot and SPLOM
        this.plot_height = width * scatter_height + 2.6 * config.font_size;

        // controls padding in svg for the frames
        let margin_outer = config.margin_outer;
        let margin_inner = config.margin_inner;
        //controls how frames are spaced
        let margin_left = margin_inner;
        let margin_top = margin_inner;
        let margin_bottom = margin_inner;
        let margin_right = margin_inner;

        //paddings controls how much space we give the scatter plot within the frame.
        this.padding_left = config.scatter_padding;
        this.padding_right = config.scatter_padding;
        this.padding_bottom = config.scatter_padding;
        this.padding_top = config.scatter_padding;

        let container_div = d3
            .create("div")
            .style("height", `${this.plot_height}px`)
            .style("position", "relative");

        let color_mode =
            n_boxes == 1 && predicate_mode !== "data extent"
                ? "confusion"
                : n_boxes == 2
                  ? "contrastive"
                  : "selection";
        let style = get_point_style(color_mode);
        this.sc = (d, i) => style(d, i).fill;

        let frame_svg = create_svg(this.plot_width, this.plot_height);
        frame_svg.style("overflow", "visible");
        frame_svg.call(
            make_frame,
            0,
            0,
            this.plot_width,
            this.plot_height,
            "SPLOM View",
            config.font_size,
            true,
        );
        container_div.node().appendChild(frame_svg.node());

        this.splom = container_div
            .append("div")
            .style("position", "absolute")
            .style("top", `${2.3 * config.font_size}px`);

        return container_div.node();
    }

    recolor() {
        this.splom.recolor(
            data.map((d) => [1, 0, 0, 1]),
            { depths: data.map((d) => Math.random()) },
        );
    }

    draw(splom_attributes) {
        //DUMMY
        // let { n_boxes, predicates } = projection_view.value;
        let n_boxes = 1;
        let predicates = [];

        if (predicates !== undefined) {
            //attach dummy ranges if certain clause doesn't exist for some brush t
            for (let predicate_t of predicates) {
                for (let attr of attributes) {
                    if (!(attr in predicate_t)) {
                        predicate_t[attr] = extent[attr];
                    }
                }
            }
        }

        //draw splom
        this.splom.selectAll("*").remove();
        let splom_obj = splom_gl2(this.splom, data, {
            depth: (d, i) =>
                d.brushed ||
                d.first_brush ||
                d.second_brush ||
                d.pred ||
                d.selected
                    ? -0.99
                    : i / data.length,
            padding_left: this.padding_left,
            padding_right: this.padding_right,
            padding_bottom: this.padding_bottom,
            padding_top: this.padding_top,
            layout: "both", //'upper', 'lower', or 'both',
            width: this.plot_width,
            height: this.plot_width,
            s: (d) => splom_mark_size, //size of circle marks
            attrs: splom_attributes,
            x_tickvalues: linspace(0, 1, 4),
            ticks: 3,
            wspace: 0.0, //splom_spacing,
            hspace: 0.0, //splom_spacing,
            scales: { sc: this.sc },
            label_fontsize: 12,
            stroke: "#eee",
            stroke_width: 1,
        });

        //draw a predicate arrow path on each subplot of SPLOM
        if (
            n_boxes > 1 &&
            splom_attributes !== undefined &&
            predicates !== undefined
        ) {
            draw_predicates(
                splom_obj.subplots.map((row) => row.map((plot) => plot.frame)),
                splom_obj.subplots.map((row) =>
                    row.map((plot) => plot.overlay),
                ),
                predicates,
                splom_attributes,
                n_boxes,
            );
        }
    }
}
