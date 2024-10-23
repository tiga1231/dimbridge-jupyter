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
    color2gl,
    create_canvas,
} from "../lib.js";

import {
    draw_path,
    get_point_style,
    depth_func,
    subsample,
} from "./view-utils.js";

export default class SplomView {
    constructor(data, splom_attributes, model, controller, config) {
        /*
    - Take data points and a list of attributes (e.g., predicates, or manual selection of attributes)
    - Renders data points in SPLOM
    - Knows how to color its points
    */
        console.log("new SplomView");
        this.data = data;
        this.model = model;
        this.config = config;
        this.node = this.init_node();
        this.splom_attributes = splom_attributes;
    }

    init_node() {
        let {
            width,
            scatter_width,
            scatter_height,
            font_size,
            gap,
            predicate_view_subplot_height,
            margin_outer,
            margin_inner,
            splom_mark_size,
            splom_spacing,
            splom_font_size,
        } = this.config;

        //gap between subplots in splot, measured in proportion (0 to 1) to the size of a subplot
        this.plot_width = width * scatter_width - gap; //width of main scatter plot and SPLOM
        this.plot_height = width * scatter_height + 2.6 * font_size;

        // controls padding in svg for the frames
        //controls how frames are spaced
        let margin_left = margin_inner;
        let margin_top = margin_inner;
        let margin_bottom = margin_inner;
        let margin_right = margin_inner;

        //paddings controls how much space we give the scatter plot within the frame.
        this.padding_left = splom_spacing;
        this.padding_right = splom_spacing;
        this.padding_bottom = splom_spacing;
        this.padding_top = splom_spacing;

        let container_div = d3
            .create("div")
            .style("height", `${this.plot_height}px`)
            .style("position", "relative");

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

    recolor(mode = "selection") {
        let style = get_point_style(mode);

        let sc = (d, i) => style(d, i).fill;
        let sc_gl = (d, i) => {
            let c = sc(d, i);
            return [...color2gl(c), 1.0];
        };
        let depth = depth_func(mode);
        let new_colors = this.data.map((d, i) => sc_gl(d, i)); // array of RGBA tuples
        let new_depths = this.data.map((d, i) => depth(d, i));
        this.splom_obj.recolor(new_colors, {depths: new_depths});
        // kde_filters: [(d) => true],
        // kde_strokes: [C[0]], //stroke colors
    }

    redraw_kde(mode = "selection") {
        let style = get_point_style(mode);
        let sc = (d, i) => style(d, i).fill;
        let n_brushes = this.data[0].brushed.length;
        let kde_filters, kde_strokes;

        if (mode === "selection") {
            kde_filters = [(d) => d.selected, (d) => !d.selected];
            kde_strokes = [sc({selected: true}), sc({selected: false})];
        } else if (mode === "contrastive") {
            kde_filters = [
                (d) => !d.first_brush && !d.second_brush,
                (d) => d.first_brush,
                (d) => d.second_brush,
            ];
            kde_strokes = [
                sc({first_brush: false, second_brush: false}),
                sc({first_brush: true, second_brush: false}),
                sc({first_brush: false, second_brush: true}),
            ];
        } else if (mode === "confusion") {
            kde_filters = [
                (d) => d.pred && d.selected, //true pos
                (d) => !d.pred && !d.selected, // true neg
                (d) => !d.pred && d.selected, // false neg
                (d) => d.pred && !d.selected, // false posk
            ];
            kde_strokes = [
                sc({pred: true, selected: true}),
                sc({pred: false, selected: false}),
                sc({pred: false, selected: true}),
                sc({pred: true, selected: false}),
            ];
        } else if (mode === "brush") {
            kde_filters = d3.range(n_brushes).map((i) => (d) => d.brushed[i]);
            kde_strokes = d3.range(n_brushes).map((i) => {
                return sc({median_brush: i, brushed: d3.range(n_brushes)});
            });
            kde_filters = subsample(kde_filters, 6);
            kde_strokes = subsample(kde_strokes, 6);
        }
        this.splom_obj.redraw_kde(kde_filters, kde_strokes);
    }

    draw(splom_attributes = [], predicates = []) {
        if (splom_attributes.length == 0) {
            splom_attributes = this.splom_attributes;
        }
        // let { n_boxes, predicates } = projection_view.value;
        let n_boxes = predicates.length;

        this.predicate_mode = "data extent"; //TODO FIXME later
        let color_mode;

        if (n_boxes == 1) {
            if (this.predicate_mode === "data extent") {
                // color_mode = "selection";
                color_mode = "confusion";
            } else if (this.predicate_mode === "predicate regression") {
                color_mode = "confusion";
            }
        } else if (n_boxes == 2) {
            color_mode = "contrastive";
        } else if (n_boxes > 2) {
            color_mode = "brush";
        }

        let style = get_point_style(color_mode);
        this.sc = (d, i) => style(d, i).fill;

        //draw SPLOM
        if (this.splom_obj === undefined) {
            console.log("SPLOM redrawing...");
            console.log("attributes", splom_attributes);
            this.splom.selectAll("*").remove();
            this.splom_obj = splom_gl2(this.splom, this.data, {
                s: (d) => this.config.splom_mark_size, //size of circle marks
                stroke: "#eee",
                stroke_width: 0.001,
                depth: depth_func(color_mode),
                padding_left: this.padding_left,
                padding_right: this.padding_right,
                padding_bottom: this.padding_bottom,
                padding_top: this.padding_top,
                layout: "both", //'upper', 'lower', or 'both',
                width: this.plot_width,
                height: this.plot_width,

                // kde_filters: [(d) => d.selected, (d) => !d.selected],
                kde_filters: [(d) => true],
                kde_strokes: [C[0]], //stroke colors

                attrs: splom_attributes,
                // x_tickvalues: linspace(0, 1, 4),
                xticks: 3,
                yticks: 3,
                wspace: this.config.splom_spacing,
                hspace: this.config.splom_spacing,
                scales: {sc: this.sc},
                label_fontsize: 8,
                dpi_scale: 1.0,
            });
            if (color_mode === "confusion") {
                this.redraw_kde("selection");
            } else {
                this.redraw_kde(color_mode);
            }
        } else {
            this.recolor(color_mode);
            if (color_mode === "confusion") {
                this.redraw_kde("selection");
            } else {
                this.redraw_kde(color_mode);
            }
        }

        //draw a predicate arrow path on each subplot of SPLOM
        if (n_boxes > 1) {
            this.draw_predicate_arrows(
                this.splom_obj.subplots,
                predicates,
                splom_attributes,
            );
        }
    }

    hide_arrows() {
        if (this.splom_obj == undefined) {
            return;
        }
        let subplots = this.splom_obj.subplots;
        for (let i = 0; i < subplots.length; i++) {
            for (let j = 0; j < subplots[0].length; j++) {
                if (subplots[i][j] === undefined) continue;
                if (i == j) continue;
                subplots[i][j].overlay
                    .selectAll("g.brush-path")
                    .attr("display", "none");
            }
        }
    }

    draw_predicate_arrows(
        subplots,
        predicates,
        splom_attributes,
        // n_boxes = 1,
        // sample_brush_history
        //
    ) {
        let n_boxes = predicates.length;
        let data = this.data;
        //for each plot:
        for (let i = 0; i < subplots.length; i++) {
            for (let j = 0; j < subplots[0].length; j++) {
                if (subplots[i][j] === undefined) continue;
                if (i == j) continue;

                let aj = splom_attributes[j];
                let ai = splom_attributes[i];
                let intervals = predicates.map((d) => {
                    let predicate_exist_for_plot = ai in d && aj in d;
                    if (
                        !predicate_exist_for_plot ||
                        Object.keys(d).length == 0
                    ) {
                        return {
                            x0: 0,
                            x1: 0,
                            y0: 0,
                            y1: 0,
                        };
                    } else {
                        return {
                            // x0: d[splom_attributes[j]][0],
                            x0: d[aj][0],
                            x1: d[aj][1],
                            y0: d[ai][0],
                            y1: d[ai][1],
                        };
                    }
                });

                if (n_boxes > 1) {
                    // draw_boxes(splo.plots[i][j], intervals);
                    let {sx, sy} = subplots[i][j].scales;
                    let path_data;
                    if (n_boxes == 2) {
                        //show data mean, instead of predicate
                        let first_cx = sx(
                            d3.mean(
                                data.filter((d) => d.first_brush),
                                (d) => d[aj],
                            ),
                        );
                        let first_cy = sy(
                            d3.mean(
                                data.filter((d) => d.first_brush),
                                (d) => d[ai],
                            ),
                        );
                        let second_cx = sx(
                            d3.mean(
                                data.filter((d) => d.second_brush),
                                (d) => d[aj],
                            ),
                        );
                        let second_cy = sy(
                            d3.mean(
                                data.filter((d) => d.second_brush),
                                (d) => d[ai],
                            ),
                        );
                        path_data = [
                            {
                                cx: first_cx,
                                cy: first_cy,
                            },
                            {
                                cx: second_cx,
                                cy: second_cy,
                            },
                        ];
                    } else {
                        // n_boxes>2
                        path_data = predicates.map((d) => ({
                            cx: sx(d3.mean(d[aj])),
                            cy: sy(d3.mean(d[ai])),
                        }));
                    }
                    // path_data = subsample(path_data, 6);
                    let path_style = {
                        size: 0,
                        "stroke-width": 2,
                    };

                    subplots[i][j].overlay
                        .selectAll("g.brush-path")
                        .data([0])
                        .join("g")
                        .attr("class", "brush-path")
                        .attr("display", null)
                        .call(draw_path, path_data, path_style);

                    //TODO update color
                    //splo.plots[i][j].update_style(...)
                }
            }
        }
    }
}
