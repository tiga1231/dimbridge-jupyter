import * as d3 from "d3";

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
    splom_gl2,
    create_canvas,
} from "../lib.js";

import {
    // define_arrowhead,
    // compute_predicates,
    // update_brush_history,
    // clear_selected,
    // set_selected,
    // set_selected2,
    // get_selected,
    // update_point_style,
    // draw_boxes,
    // set_pred,
    get_point_style,
} from "./view-utils.js";

export default class SplomView {
    constructor(data, controller, config) {
        /*
    - Take data points and a list of attributes (e.g., predicates, or manual selection of attributes)
    - Renders data points in SPLOM
    - Knows how to color its points
    */
        console.log("new SplomView");
        this.data = data;
        this.config = config;
        this.node = this.init_node();
    }

    init_node() {
        let {
            width,
            scatter_width,
            scatter_height,
            font_size,
            scatter_padding,
            gap,
            predicate_view_subplot_height,
            margin_outer,
            margin_inner,
            splom_mark_size,
        } = this.config;

        let n_boxes = 1;
        //gap between subplots in splot, measured in proportion (0 to 1) to the size of a subplot
        let splom_spacing = 0.03;
        this.plot_width = width * scatter_width - gap; //width of main scatter plot and SPLOM
        this.plot_height = width * scatter_height + 2.6 * font_size;

        // controls padding in svg for the frames
        //controls how frames are spaced
        let margin_left = margin_inner;
        let margin_top = margin_inner;
        let margin_bottom = margin_inner;
        let margin_right = margin_inner;

        //paddings controls how much space we give the scatter plot within the frame.
        this.padding_left = scatter_padding;
        this.padding_right = scatter_padding;
        this.padding_bottom = scatter_padding;
        this.padding_top = scatter_padding;

        let container_div = d3
            .create("div")
            .style("height", `${this.plot_height}px`)
            .style("position", "relative");

        this.predicate_mode = "data extent"; //TODO FIXME later
        let color_mode =
            n_boxes == 1 && this.predicate_mode !== "data extent"
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
            font_size,
            true,
        );
        container_div.node().appendChild(frame_svg.node());

        this.splom = container_div
            .append("div")
            .style("position", "absolute")
            .style("top", `${2.3 * font_size}px`);

        return container_div.node();
    }

    recolor() {
        this.splom.recolor(
            this.data.map((d) => [1, 0, 0, 1]),
            { depths: this.data.map((d) => Math.random()) },
        );
    }

    draw(splom_attributes) {
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
        let splom_obj = splom_gl2(this.splom, this.data, {
            depth: (d, i) =>
                d.brushed ||
                d.first_brush ||
                d.second_brush ||
                d.pred ||
                d.selected
                    ? -0.99
                    : i / this.data.length,
            padding_left: this.padding_left,
            padding_right: this.padding_right,
            padding_bottom: this.padding_bottom,
            padding_top: this.padding_top,
            layout: "lower", //'upper', 'lower', or 'both',
            width: this.plot_width,
            height: this.plot_width,
            s: (d) => this.config.splom_mark_size, //size of circle marks
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
