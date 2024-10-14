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
    clip,
} from "../lib.js";

import {get_selected} from "./view-utils.js";

export default class PredicateView {
    svg;
    view_g;
    controller;
    node;
    plot_width;
    plot_height;

    constructor(data, model, controller, config) {
        console.log("new PredicateView");
        this.data = data;
        this.model = model;
        this.controller = controller;
        this.config = config;

        this.extent = Object.fromEntries(
            Object.keys(data[0]).map((attr) => {
                let ex = d3.extent(data, (d) => d[attr]);
                ex[0] = Number(ex[0]);
                ex[1] = Number(ex[1]);
                return [attr, ex];
            }),
        );
        this.node = this.init_node();
        return this;
    }

    init_node() {
        let {
            width,
            scatter_width,
            scatter_height,
            font_size,
            scatter_padding,
            gap,
        } = this.config;
        this.plot_width = width * (1 - scatter_width * 2) - gap; //width of predicate view
        this.plot_height = width * scatter_height + 2.6 * font_size; // "+ 2.6 * fs" makes sure the scatter plot is squared
        // let padding_left = 1 + scatter_padding;
        // let padding_right = 1 + scatter_padding;
        this.padding_bottom = scatter_padding;
        this.padding_top = font_size * 1.6 + scatter_padding;

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
                font_size,
                true,
            );
        return_node.appendChild(frame.node());

        this.svg = create_svg(this.plot_width, this.plot_height);
        //predicate view
        this.view_g = this.svg.append("g");
        let ob = overflow_box([this.svg.node()], width * scatter_height);
        d3.select(ob)
            .style("position", "absolute")
            .style("top", `${this.padding_top}px`)
            .style("left", "0");
        return_node.appendChild(ob);

        return return_node;
    }

    draw(predicates) {
        // Takes predicates data (see first line of code) from projection_view.
        // Renders predicate view depending on brush mode/state indicated by n_boxes
        // For every predicate attribute,
        // when n_boxes=1, predicate view displays a range bar horizontally
        // when n_boxes=2, it displays a _pair_ of categorically colored range bars horizontally
        // when n_boxes>2, it displays a sequence of range bars _vertivally_ as a series of intervals

        let n_boxes = predicates.length;
        let attributes = Object.keys(predicates[0]);

        //resize height of the overflowed svg
        let subplot_height =
            n_boxes > 2
                ? this.config.predicate_view_subplot_height * 4.1
                : this.config.predicate_view_subplot_height;
        let svg_height =
            subplot_height *
            (attributes !== undefined ? attributes.length + 2 : 1000);
        this.svg.attr("height", svg_height + 300);
        if (this.data[0].image_url) {
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
                font_size: this.config.predicate_view_fontsize,
                // subplot_height: this.config.predicate_view_subplot_height,
                x_shift: this.plot_width,
            };

            //assign predicate_view different draw functions depending on brush number
            if (n_boxes == 1) {
                this.view_g.call(
                    predicate_single,
                    this.controller,
                    this.extent,
                    predicate_view_style,
                );
            } else if (n_boxes == 2) {
                this.view_g.call(
                    predicate_contrastive,
                    this.controller,
                    this.extent,
                    predicate_view_style,
                );
            } else {
                this.view_g.call(
                    predicate_multiple,
                    this.controller,
                    this.extent,
                    predicate_view_style,
                );
            }

            this.view_g.draw(predicates, attributes);
        }
    }
}

function predicate_single(
    g_container,
    controller,
    extent,
    {
        width = 100,
        height = 100,
        padding_top = 10,
        padding_left = 10,
        padding_right = 10,
        font_size = 10,
        subplot_height = 40,
    } = {},
) {
    g_container.selectAll("g.predicate-view").remove(); //clear itself, keep the fancy frame
    let g = g_container
        .selectAll("g.predicate-view")
        .data([0])
        .join("g")
        .attr("class", "predicate-view");

    g_container.draw = function (
        predicates,
        attributes,
        // selected,
        // should_draw_images,
    ) {
        // predicates: one-element-array that contains an attr:interval pairs in an Object
        // splom_attributes: union of attributes in a sequence of brushes

        let n_attributes = attributes.length;
        let predicate = predicates[0];
        let attribute_text_max_length = d3.max(attributes, (d) => d.length);

        //origin at interval min
        let interval_start_x = padding_left + 10;
        let interval_stop_x = width - interval_start_x;
        // font_size * 0.5 * (2 + attribute_text_max_length);

        let sx = d3
            .scaleLinear()
            .domain([0, 1])
            .range([interval_start_x, interval_stop_x]);
        let sy = d3
            .scaleLinear()
            .domain([0, n_attributes])
            .range([padding_top, padding_top + n_attributes * subplot_height]);

        let interval_data = attributes.map((a) => {
            return {
                attr: a,
                vmin: extent[a][0] - 1e-6,
                vmax: extent[a][1] + 1e-6,
                interval_min: predicate[a][0],
                interval_max: predicate[a][1],
            };
        });

        //background rect
        let intervals_g = g
            .selectAll(".bg-rect")
            .data(interval_data)
            .join("rect")
            .attr("class", "bg-rect")
            .attr("x", padding_left)
            .attr("y", (d, i) => sy(i) - 15)
            .attr("width", width - padding_left - padding_right)
            .attr("height", subplot_height - 5) //n_attributes * subplot_height + 10)
            .attr("rx", 4)
            .attr("fill", "#eee");

        // draw the interval bars
        let intervals_bg = g
            .selectAll(".interval-bg")
            .data(interval_data)
            .join("line")
            .attr("class", "interval-bg")
            .attr("x1", (d) => sx.domain([d.vmin, d.vmax])(d.vmin))
            .attr("x2", (d) => sx.domain([d.vmin, d.vmax])(d.vmax))
            .attr("y1", (d, i) => sy(i))
            .attr("y2", (d, i) => sy(i))
            .attr("stroke-linecap", "round")
            .attr("stroke", "#fff")
            .attr("stroke-width", 10);

        let intervals_fg = g
            .selectAll(".interval-fg")
            .data(interval_data)
            .join("line")
            .attr("class", "interval-fg")
            .attr("x1", (d) => sx.domain([d.vmin, d.vmax])(d.interval_min))
            .attr("x2", (d) => sx.domain([d.vmin, d.vmax])(d.interval_max))
            .attr("y1", (d, i) => sy(i))
            .attr("y2", (d, i) => sy(i))
            .attr("stroke-linecap", "round")
            .attr("stroke", "#1f78b4")
            .attr("stroke-width", 10);

        //WIP draw the interval controls
        let control_circle_radii = 5;

        let drag_min = d3.drag().on("drag", function (event, d) {
            let new_interval_min = sx.domain([d.vmin, d.vmax]).invert(event.x);
            d.interval_min = clip(new_interval_min, d.vmin, d.vmax);
            d3.select(this).attr(
                "cx",
                sx.domain([d.vmin, d.vmax])(d.interval_min),
            );
            intervals_fg.attr("x1", (d) =>
                sx.domain([d.vmin, d.vmax])(d.interval_min),
            );
            crossfilter_dimensions[d.attr].filter(
                (value) => value >= d.interval_min && value <= d.interval_max,
            );
            data.forEach((d, i) => {
                d.selected = cf.isElementFiltered(i);
                d.brushed = d.selected; //TODO later
            });
            controller.on_predicate_view_change(data);
        });
        let controls_start_circles = g
            .selectAll("control-start")
            .data(interval_data)
            .join("circle")
            .attr("class", "control-start")
            .attr("cx", (d) => sx.domain([d.vmin, d.vmax])(d.interval_min))
            .attr("cy", (d, i) => sy(i))
            .attr("r", (d, i) => control_circle_radii)
            .attr("fill", "#fff")
            .attr("stroke-linecap", "round")
            .attr("stroke", "#1f78b4")
            .attr("stroke-width", 1)
            .style("cursor", "grab")
            .call(drag_min);

        let drag_max = d3.drag().on("drag", function (event, d) {
            console.log("[max dragged]");
            let {dx, dy} = event;
            let new_interval_max = sx.domain([d.vmin, d.vmax]).invert(event.x);
            d.interval_max = clip(new_interval_max, d.vmin, d.vmax);
            d3.select(this).attr(
                "cx",
                sx.domain([d.vmin, d.vmax])(d.interval_max),
            );
            intervals_fg.attr("x2", (d) =>
                sx.domain([d.vmin, d.vmax])(d.interval_max),
            );
            crossfilter_dimensions[d.attr].filter(
                (value) => value >= d.interval_min && value <= d.interval_max,
            );
            data.forEach((d, i) => {
                d.selected = cf.isElementFiltered(i);
                d.brushed = d.selected; //TODO FIXME
            });
            controller.on_predicate_view_change(data);
        });
        let controls_end_circles = g
            .selectAll("control-end")
            .data(interval_data)
            .join("circle")
            .attr("class", "control-end")
            .attr("cx", (d) => sx.domain([d.vmin, d.vmax])(d.interval_max))
            .attr("cy", (d, i) => sy(i))
            .attr("r", (d, i) => control_circle_radii)
            .attr("fill", "orange")
            .attr("stroke-linecap", "round")
            .attr("stroke", "#1f78b4")
            .attr("stroke-width", 1)
            .style("cursor", "grab")
            .call(drag_max);

        intervals_fg.call(
            d3.drag().on("drag", (event, d) => {
                console.log("interval dragged", event, d);
                drag_min.on("drag")();
                drag_max.on("drag")();
            }),
        );

        let labels = g
            .selectAll(".label")
            .data(attributes)
            .join("text")
            .attr("class", "label")
            .attr("x", (interval_start_x + interval_stop_x) / 2)
            .attr("y", (d, i) => sy(i) + font_size * 1.5)
            .attr("text-anchor", "middle")
            .attr("fill", "#888")
            // .attr("alignment-baseline", "central")
            .style("font-size", `${font_size}px`)
            .style("text-transform", "uppercase")
            .style("font-family", "sans-serif")
            .style("font-weight", 600)
            .style("font-style", "italic")
            .style("opacity", 0.7)
            .text((d) => d);
    };

    function draw_background_rect(
        container,
        {height, width, top = 0, left = 0} = {},
    ) {
        height = height || container.height;
        width = width || container.width;
        container
            .selectAll(".bg-rect")
            .data([0])
            .join("rect")
            .attr("class", "bg-rect")
            .attr("x", left)
            .attr("y", top)
            .attr("width", width)
            .attr("height", height)
            .attr("rx", 4)
            .attr("fill", "#eee");
        // .attr("stroke", "#777")
        // .attr("stroke-width", 1);
    }

    return g_container;
}

function predicate_contrastive(
    g_container,
    controller,
    extent,
    {
        width = 100,
        height = 100,
        padding_top = 2,
        padding_left = 10,
        padding_right = 10,
        padding_bottom = 10,
        font_size = 12,
        subplot_height = 60,
    } = {},
) {
    g_container.selectAll("g.predicate-view").remove(); //clear itself, keep the fancy frame
    let g = g_container
        .selectAll("g.predicate-view")
        .data([0])
        .join("g")
        .attr("class", "predicate-view");

    g_container.draw = function (
        predicates,
        splom_attributes,
        // selected,
        // should_draw_images,
    ) {
        let n_attributes = splom_attributes.length;
        let y_shift = 14;
        // predicates: two-element-array that contains an attr:interval pairs in an Object
        // splom_attributes: union of attributes in a sequence of brushes
        //for each of the two predicates, draw intervals in a given color
        let sy = d3
            .scaleLinear()
            .domain([0, n_attributes])
            .range([
                padding_top,
                padding_top + n_attributes * subplot_height, //give more space compare to single predicate
            ]);

        //background-rect
        g.selectAll("g.bg-rect")
            .data(splom_attributes)
            .join("g")
            .attr("class", "bg-rect")
            ._groups[0].forEach((g, i) => {
                g = d3.select(g);
                g.call(draw_background_rect, {
                    top: sy(i) - 10,
                    left: 6,
                    height: subplot_height - 10,
                    width: width - 6 * 2,
                });
            });

        let attribute_text_max_length = d3.max(
            splom_attributes,
            (d) => d.length,
        );
        //origin at interval min
        // let interval_start_x = font_size * 10; //width/2.5;
        let interval_start_x = padding_left + 10;
        let interval_stop_x = width - interval_start_x;
        // font_size * 0.5 * (2 + attribute_text_max_length); //width/2.5;

        //draw label
        let labels = g
            .selectAll(".label")
            .data(splom_attributes)
            .join("text")
            .attr("class", "label")
            .attr("x", (interval_start_x + interval_stop_x) / 2)
            .attr("y", (d, i) => sy(i) + font_size * 3)
            .style("font-size", `${font_size}px`)
            .attr("text-anchor", "middle")
            // .attr("alignment-baseline", "central")
            .attr("fill", "#888")
            .style("font-size", `${font_size}px`)
            .style("text-transform", "uppercase")
            .style("font-family", "sans-serif")
            .style("font-weight", 600)
            .style("font-style", "italic")
            .style("opacity", 0.7)
            .text((d) => d);

        g.selectAll("g.predicate-view-contrastive")
            .data([0, 1])
            .join("g")
            .attr("class", "predicate-view-contrastive")
            ._groups[0].forEach((g, i) => {
                g = d3.select(g);
                g.call(draw_intervals, {
                    attributes: splom_attributes,
                    predicate: predicates[i],
                    stroke: d3.schemeCategory10[i],
                    y_shift: i * y_shift,
                    i: i,
                    sy,
                    interval_start_x,
                    subplot_height: subplot_height,
                });
            });
    };

    function draw_intervals(
        g,
        {
            predicate, //attr:interval pairs in an Object
            attributes, //union of attributes in a sequence of brushes
            i = 0,
            y_shift = 0,
            stroke = "#1f78b4",
            sy,
            interval_start_x,
        } = {},
    ) {
        let n_attributes = attributes.length;
        //origin at interval min
        let sx = d3
            .scaleLinear()
            .domain([0, 1])
            .range([interval_start_x, width - 19]);

        let interval_data = attributes.map((a) => ({
            attr: a,
            vmin: extent[a][0],
            vmax: extent[a][1],
            interval_min: a in predicate ? predicate[a][0] : extent[a][0],
            interval_max: a in predicate ? predicate[a][1] : extent[a][1],
        }));

        let intervals_bg = g
            .selectAll(".interval-bg")
            .data(interval_data)
            .join("line")
            .attr("class", "interval-bg")
            .attr("x1", (d) => sx.domain([d.vmin, d.vmax])(d.vmin))
            .attr("x2", (d) => sx.domain([d.vmin, d.vmax])(d.vmax))
            .attr("y1", (d, i) => sy(i) + y_shift)
            .attr("y2", (d, i) => sy(i) + y_shift)
            .attr("stroke-linecap", "round")
            .attr("stroke", "#fff")
            .attr("stroke-width", 10);

        let intervals_fg = g
            .selectAll(".interval-fg")
            .data(interval_data)
            .join("line")
            .attr("class", "interval-fg")
            .attr("x1", (d) => sx.domain([d.vmin, d.vmax])(d.interval_min))
            .attr("x2", (d) => sx.domain([d.vmin, d.vmax])(d.interval_max))
            .attr("y1", (d, i) => sy(i) + y_shift)
            .attr("y2", (d, i) => sy(i) + y_shift)
            .attr("stroke-linecap", "round")
            .attr("stroke", stroke)
            .attr("stroke-width", 10);
    }

    function draw_background_rect(
        container,
        {height, width, top = 0, left = 0} = {},
    ) {
        height = height || container.height;
        width = width || container.width;
        container
            .selectAll(".bg-rect")
            .data([0])
            .join("rect")
            .attr("class", "bg-rect")
            .attr("x", left)
            .attr("y", top)
            .attr("width", width)
            .attr("height", height)
            .attr("rx", 4)
            .attr("fill", "#eee");
        // .attr("stroke", "#777")
        // .attr("stroke-width", 1);
    }
    return g_container;
}

function predicate_multiple(
    g_container,
    controller,
    extent,
    {
        width = 100,
        height = 100,
        padding_top = 2,
        padding_bottom = 2,
        x_shift = 10,
        font_size = 12,
    } = {},
) {
    // let height = attributes.length * 50;
    // let width = Math.max(200, (predicates.length + 2) * 40);
    //draw histogram and interval view;

    g_container.selectAll("g.predicate-view").remove(); //clear itself, keep the fancy frame
    let g = g_container
        .selectAll("g.predicate-view")
        .data([0])
        .join("g")
        .attr("class", "predicate-view");
    g_container.node().value = {};

    g_container.draw = function (predicates, attributes) {
        // predicates: array that contains objects of attr:interval pairs
        // attributes: union of attributes in a sequence of brushes
        let spacing = 32;
        let padding_left = 8;
        let padding_right = 8;

        let subplot_height = 100;
        //take up the full space
        // subplot_height = (height - padding_top - padding_bottom + spacing) / attributes.length;
        // (height - padding_top - padding_bottom + 10) / attributes.length;

        let subplot_width = width - padding_left - padding_right;
        let subplots = [];
        //horizontal shift from the (0,0) in svg coordinate;
        // let x_shift = padding_left + parseFloat(g.attr('transform').split(',')[0].split('(')[1]);

        let g_interval_views = g
            .selectAll("g.interval_view")
            .data(attributes)
            .join("g")
            .attr("class", "interval_view");

        g_interval_views._groups[0].forEach((g, i) => {
            g = d3.select(g);
            let attr_name = g.datum();
            //just two convient variables for internal use
            // no effect on the actual d3 selection
            g.width = subplot_width;
            g.height = subplot_height - spacing;
            g.attr(
                "transform",
                `translate(${padding_left}, ${padding_top + i * (g.height + spacing)})`,
            )
                .call(draw_background_rect, {
                    top: -2,
                    height: subplot_height - 8,
                })
                .call(draw_intervals, {
                    x_tick_labels: i == attributes.length - 1,
                    extent: extent[attr_name],
                    intervals: predicates.map((pt) =>
                        attr_name in pt
                            ? pt[attr_name]
                            : [undefined, undefined],
                    ),
                    // n_boxes: n_boxes,
                })
                .call(draw_attribute_label);

            subplots.push(g);
        });
    };

    function draw_time_cursor(
        container,
        {height, width, other_containers = [], vmax = 4, x_shift = 0} = {},
    ) {
        let {sx, sy} = container.scales; //this was given by draw_intervals() as a side effect
        let cursor = container
            .selectAll(".time-cursor")
            .data([0])
            .join("line")
            .attr("class", "time-cursor")
            .attr("x1", 0)
            .attr("x2", 0)
            .attr("y1", d3.min(sy.range()) - 10)
            .attr("y2", d3.max(sy.range()) + 10)
            .attr("stroke", "#555")
            .attr("stroke-width", 1);
        container.time_cursor = cursor;
        container.update_time_cursor = function (position) {
            cursor.attr("x1", sx(position)).attr("x2", sx(position));
        };

        let t_prev = -1;
        container.on("mousemove", (event) => {
            let x = sx.invert(event.clientX - x_shift);
            let t = Math.round(x); //snap to closes (integer) time stamp
            t = Math.max(Math.min(vmax, t), 0);
            container.update_time_cursor(t);
            other_containers.forEach((other) => {
                if (other !== container && other.update_time_cursor) {
                    other.update_time_cursor(t);
                }
            });
            if (t != t_prev) {
                //only dispatch event then the cursor actually changed
                g.node().value.time = t;
                g.node().dispatchEvent(new Event("input"), {});
                t_prev = t;
            }
        });
        return container;
    }

    function draw_attribute_label(container, {height, width} = {}) {
        height = height || container.height;
        width = width || container.width;
        container
            .selectAll(".attr-label")
            .data([container.datum()])
            .join("text")
            .attr("class", "attr-label")
            .text((d) => d)
            //bottom
            .attr("x", width / 2)
            .attr("y", height + font_size)
            .attr("fill", "#888")
            .attr("text-anchor", "middle")
            // .attr("alignment-baseline", "hanging")
            .style("text-transform", "uppercase")
            .style("font-family", "sans-serif")
            .style("font-weight", 600)
            .style("font-size", `${font_size}px`)
            .style("font-style", "italic")
            .style("opacity", 0.7);
    }

    function draw_background_rect(container, {top = 0, height, width} = {}) {
        height = height || container.height;
        width = width || container.width;
        container
            .selectAll(".bg-rect")
            .data([0])
            .join("rect")
            .attr("class", "bg-rect")
            .attr("x", 0)
            .attr("y", top)
            .attr("width", width)
            .attr("height", height)
            .attr("rx", 4)
            .attr("fill", "#eee");
        // .attr("fill", "none")
        // .attr("stroke", "#777");
    }

    function draw_intervals(
        container,
        {
            height,
            width,
            x_ticks = 3,
            x_tick_labels = true,
            extent = [0, 1],
            intervals,
        } = {},
    ) {
        height = height || container.height;
        width = width || container.width;
        let interval_stroke_width = clip(width / (intervals.length + 2), 2, 6);
        let margin_left = interval_stroke_width;
        let margin_right = interval_stroke_width;
        let margin_top = interval_stroke_width;
        let margin_bottom = interval_stroke_width;
        let interval_data = intervals;

        let sx = d3
            .scaleLinear()
            .domain([0, interval_data.length - 1])
            .range([margin_left, width - margin_right]);
        let sy = d3
            .scaleLinear()
            .domain(d3.extent(extent))
            .range([height - margin_bottom, margin_top]);
        container.scales = {sx, sy};

        // y axis
        let ay = d3.axisRight(sy).ticks(0).tickSizeInner(-width);
        let gy = container
            .selectAll(".y-axis")
            .data([0])
            .join("g")
            .attr("class", "y-axis")
            .attr("transform", `translate(${width - 2},${0})`)
            .call(ay);
        // gy.selectAll("text").style("font-size", 8);
        gy.selectAll(".tick text").remove();
        gy.selectAll(".domain").remove();
        gy.selectAll(".tick line")
            .attr("stroke", "#cdcdcd")
            .attr("stroke-dasharray", "5 4")
            .attr("stroke-width", 0.5);

        // x axis
        // let ax = d3.axisBottom(sx).ticks(1);
        // let gx = container
        //   .append("g")
        //   .attr("transform", `translate(${0},${height - margin_bottom})`)
        //   .call(ax);
        // if (!x_tick_labels) {
        //   gx.selectAll("text").remove();
        // }

        let intervals_bgs = container
            .selectAll("line.interval-bg")
            .data(interval_data)
            .join("line")
            .attr("class", "interval-bg")
            .attr("x1", (d, i) => sx(i))
            .attr("x2", (d, i) => sx(i))
            .attr("y1", (d) => d3.min(sy.range()))
            .attr("y2", (d) => d3.max(sy.range()))
            .attr("display", (d) => (d[0] === undefined ? "none" : ""))
            .attr("stroke-width", interval_stroke_width)
            .attr("stroke", "#fff")
            .attr("stroke-linecap", "round");
        // .attr("opacity", 0.7);

        let sc = d3.interpolateViridis;

        let n_intervals = interval_data.length;
        let intervals_fg = container
            .selectAll("line.interval")
            .data(interval_data)
            .join("line")
            .attr("class", "interval")
            .attr("x1", (d, i) => sx(i))
            .attr("x2", (d, i) => sx(i))
            .attr("y1", (d) => sy(d[0]))
            .attr("y2", (d) => sy(d[1]))
            .attr("display", (d) => (d[0] === undefined ? "none" : ""))
            .attr("stroke-width", interval_stroke_width)
            .attr("stroke", (d, i) => sc(i / (n_intervals - 1)))
            .attr("stroke-linecap", "round");
        // .attr("opacity", 0.7);
    }

    return g_container;
}
