import * as d3 from "https://esm.sh/d3@7";
import { default as crossfilter } from "https://cdn.skypack.dev/crossfilter2@1.5.4?min";

import {
    make_frame,
    make_sub_frame,
    make_bridge_frame,
} from "./fancy-frames.js";

import {
    C,
    reshape,
    create_svg,
    linspace,
    zip,
    scatter,
    overflow_box,
} from "./lib.js";

// ------------ View Utils --------------------
function predicate_single(
    g_container,
    controller,
    extent,
    {
        width = 100,
        height = 100,
        padding_top = 2,
        font_size = 12,
        subplot_height = 20,
    } = {},
) {
    g_container.selectAll("g.predicate-view").remove(); //clear itself, keep the fancy frame
    let g = g_container
        .selectAll("g.predicate-view")
        .data([0])
        .join("g")
        .attr("class", "predicate-view");

    g_container.draw = function (predicates, splom_attributes, selected) {
        // predicates: one-element-array that contains an attr:interval pairs in an Object
        // splom_attributes: union of attributes in a sequence of brushes

        let n_attributes = splom_attributes.length;
        let predicate = predicates[0];
        let attributes = splom_attributes;

        //origin at interval min
        let interval_start_x = font_size * 10; //width/2.5;

        let sx = d3
            .scaleLinear()
            .domain([0, 1])
            .range([interval_start_x, width - 19]);
        let sy = d3
            .scaleLinear()
            .domain([0, n_attributes])
            .range([
                padding_top + 12,
                padding_top + 12 + n_attributes * subplot_height,
            ]);

        let interval_data = attributes.map((a) => ({
            attr: a,
            vmin: extent[a][0] - 1e-6,
            vmax: extent[a][1] + 1e-6,
            interval_min: predicate[a][0],
            interval_max: predicate[a][1],
        }));

        g.call(draw_background_rect, {
            top: sy(0) - 16,
            left: 6,
            height: n_attributes * subplot_height + 10,
            width: width - 6 * 2,
        });

        //draw the interval bars
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
            console.log("[dragged]");
            console.log("event", event);
            console.log("d", d);
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
                d.brushed = d.selected;
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
            console.log("[dragged]");
            console.log("event", event);
            console.log("d", d);
            let { dx, dy } = event;
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
                d.brushed = d.selected;
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
            .attr("x", interval_start_x - 14)
            .attr("y", (d, i) => sy(i) + font_size / 3)
            .attr("text-anchor", "end")
            // .attr("alignment-baseline", "central")
            .style("font-size", `${font_size}px`)
            .text((d) => attr2label[d]);

        //draw images
        if (selected && data[0].image_url !== undefined) {
            let n_cols = 2,
                remaining_height = height - sy.range()[1],
                pad = 5,
                actual_width = width - 2 * pad,
                img_size = actual_width / 2;
            let n_rows = Math.floor(remaining_height / img_size);
            let selected_images = data
                .filter((d, i) => selected[i])
                .sort((a, b) => d3.ascending(a.x, b.x));
            // selected_images = _.shuffle(selected_images);
            selected_images = selected_images.slice(
                0,
                Math.min(n_rows * n_cols, selected_images.length),
            );
            let img_selection = g
                .selectAll(".imggrid")
                .data(selected_images)
                .join("image")
                .classed("imggrid", true)
                .attr("width", img_size)
                .attr("height", img_size)
                .attr("x", (_, i) => pad + (i % n_cols) * img_size)
                .attr(
                    "y",
                    (_, i) => Math.floor(i / n_cols) * img_size + sy.range()[1],
                )
                .attr("href", (d) => d.image_url);
            img_selection.exit().remove();
        }
    };

    function draw_background_rect(
        container,
        { height, width, top = 0, left = 0 } = {},
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
    {
        width = 100,
        height = 100,
        padding_top = 2,
        font_size = 12,
        subplot_height = 20,
    } = {},
) {
    g_container.selectAll("g.predicate-view").remove(); //clear itself, keep the fancy frame
    let g = g_container
        .selectAll("g.predicate-view")
        .data([0])
        .join("g")
        .attr("class", "predicate-view");

    g_container.draw = function (predicates, splom_attributes, selected) {
        let n_attributes = splom_attributes.length;
        let y_shift = 14;
        // predicates: two-element-array that contains an attr:interval pairs in an Object
        // splom_attributes: union of attributes in a sequence of brushes
        //for each of the two predicates, draw intervals in a given color
        let sy = d3
            .scaleLinear()
            .domain([0, n_attributes])
            .range([
                padding_top + 12,
                padding_top + 12 + n_attributes * subplot_height * 1.8, //give more space compare to single predicate
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
                    height: y_shift + 20,
                    width: width - 6 * 2,
                });
            });

        let interval_start_x = font_size * 10; //width/2.5;
        //draw label
        let labels = g
            .selectAll(".label")
            .data(splom_attributes)
            .join("text")
            .attr("class", "label")
            .attr("x", interval_start_x - 14)
            .attr("y", (d, i) => sy(i) + font_size / 3)
            .attr("text-anchor", "end")
            // .attr("alignment-baseline", "central")
            .style("font-size", `${font_size}px`)
            .text((d) => attr2label[d]);

        g.selectAll("g.predicate-view-single")
            .data([0, 1])
            .join("g")
            .attr("class", "predicate-view-single")
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
                    subplot_height: subplot_height * 1.5,
                });
            });
        if (data[0].image_url !== undefined) {
            g.call(draw_images, { sy, width, height });
        }
    };

    function draw_images(container, { width, height, sy } = {}) {
        let first_brush_data = data.filter((d) => d.first_brush);
        let second_brush_data = data.filter((d) => d.second_brush);
        let selected_by_group = [first_brush_data, second_brush_data];

        let remaining_height = height - sy.range()[1];
        let remaining_height_per_group = remaining_height / 2;
        let n_cols = 2;
        let pad = 5;
        let actual_width = width - 2 * pad;
        let actual_height = remaining_height_per_group - pad;
        let img_size = Math.min(actual_height, actual_width) / n_cols;
        let n_rows = Math.floor(remaining_height_per_group / img_size);
        let x_shift = width / 2 - (img_size * n_cols) / 2; //middle

        let frame_stroke_width = 8;
        g.selectAll(".imggrid").remove();
        selected_by_group.forEach((selected, group_index) => {
            // selected = _.shuffle(selected);
            selected = selected.slice(0, n_rows * n_cols);
            let g = container
                .append("g")
                .classed("imggrid", true)
                .attr(
                    "transform",
                    `translate(${x_shift},${
                        sy.range()[1] +
                        group_index * img_size * n_rows +
                        (group_index - 1) * Math.max(pad, frame_stroke_width)
                    })`,
                );

            //draw image frame
            g.selectAll("rect")
                .data([0])
                .join("rect")
                .attr("x", 0)
                .attr("y", 0)
                .attr("width", img_size * n_cols)
                .attr("height", img_size * n_rows)
                .attr("fill", "none")
                .attr("stroke-width", frame_stroke_width)
                .attr("stroke", d3.schemeCategory10[group_index]);

            g.selectAll("image")
                .data(selected)
                .join("image")
                .attr("width", img_size)
                .attr("height", img_size)
                .attr("x", (_, i) => (i % n_cols) * img_size)
                .attr("y", (_, i) => Math.floor(i / n_cols) * img_size)
                .attr("href", (d) => d.image_url);
            // img_selection.exit().remove();
        });
    }

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
            vmin: this.extent[a][0],
            vmax: this.extent[a][1],
            interval_min: a in predicate ? predicate[a][0] : this.extent[a][0],
            interval_max: a in predicate ? predicate[a][1] : this.extent[a][1],
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
        { height, width, top = 0, left = 0 } = {},
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
    {
        width = 100,
        height = 100,
        padding_top = 2,
        padding_bottom = 2,
        x_shift = 10,
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

    g_container.draw = function (predicates, attributes, n_boxes, selected) {
        // predicates: array that contains objects of attr:interval pairs
        // attributes: union of attributes in a sequence of brushes
        let spacing = 32;
        let padding_left = 8;
        let padding_right = 8;

        let subplot_height;
        if (n_boxes == 2) {
            //take up some space at leave room for images
            subplot_height = 50;
        } else {
            //take up the full space
            // subplot_height = (height - padding_top - padding_bottom + spacing) / attributes.length;
            subplot_height = 100;
            // (height - padding_top - padding_bottom + 10) / attributes.length;
        }

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
                    extent: this.extent[attr_name],
                    intervals: predicates.map((pt) =>
                        attr_name in pt
                            ? pt[attr_name]
                            : [undefined, undefined],
                    ),
                    n_boxes: n_boxes,
                })
                .call(draw_attribute_label);

            subplots.push(g);
            // g.call(draw_time_cursor, {other_containers:subplots, vmax:predicates.length-1, x_shift});
        });

        // if (n_boxes==2 && selected) {
        //   g_container.call(draw_images, selected);
        // }
    };

    function draw_images(selected, sy) {
        let n_cols = 2,
            remaining_height = height - sy.range()[1],
            pad = 5,
            actual_width = width - 2 * pad,
            img_size = actual_width / 2;
        let n_rows = Math.floor(remaining_height / img_size);
        let selected_images = data
            .filter((d, i) => selected[i])
            .sort((a, b) => d3.ascending(a.x, b.x));
        // selected_images = _.shuffle(selected_images);
        selected_images = selected_images.slice(
            0,
            Math.min(n_rows * n_cols, selected_images.length),
        );
        let img_selection = g
            .selectAll(".imggrid")
            .data(selected_images)
            .join("image")
            .classed("imggrid", true)
            .attr("width", img_size)
            .attr("height", img_size)
            .attr("x", (_, i) => pad + (i % n_cols) * img_size)
            .attr(
                "y",
                (_, i) => Math.floor(i / n_cols) * img_size + sy.range()[1],
            )
            .attr("href", (d) => d.image_url);
        img_selection.exit().remove();
    }

    function draw_time_cursor(
        container,
        { height, width, other_containers = [], vmax = 4, x_shift = 0 } = {},
    ) {
        let { sx, sy } = container.scales; //this was given by draw_intervals() as a side effect
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

    function draw_attribute_label(container, { height, width } = {}) {
        height = height || container.height;
        width = width || container.width;
        let font_size = 18;
        container
            .selectAll(".attr-label")
            .data([container.datum()])
            .join("text")
            .attr("class", "attr-label")
            .text((d) => attr2label[d])
            //bottom
            .attr("x", width / 2)
            .attr("y", height + font_size)
            .attr("fill", "#888")
            .attr("text-anchor", "middle")
            // .attr("alignment-baseline", "hanging")
            .style("text-transform", "uppercase")
            .style("font-family", "sans-serif")
            .style("font-weight", 600)
            .style("font-size", font_size)
            .style("font-style", "italic")
            .style("opacity", 0.7);
        //middle
        // .attr("x", 6)
        // .attr("y", height / 2)
        // .attr("fill", "#888")
        // .attr("alignment-baseline", "central")
        // .style("text-transform", "uppercase")
        // .style("font-family", "sans-serif")
        // .style("font-weight", 600)
        // .style("font-size", 22)
        // .style("font-style", "italic")
        // .style("opacity", 0.7)
    }

    function draw_background_rect(container, { top = 0, height, width } = {}) {
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
            n_boxes,
        } = {},
    ) {
        height = height || container.height;
        width = width || container.width;
        let margin_left = 0;
        let margin_right = 2;
        let margin_top = 2;
        let margin_bottom = 2;
        let interval_data = intervals;
        let interval_stroke_width = 8;

        let sx = d3
            .scaleLinear()
            .domain([-0.4, interval_data.length - 1 + 0.4])
            .range([margin_left, width]);
        let sy = d3
            .scaleLinear()
            .domain(d3.extent(extent))
            .range([
                height - margin_bottom,
                margin_top + interval_stroke_width / 2,
            ]);
        container.scales = { sx, sy };

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
            .attr("stroke", (d, i) =>
                n_boxes == 2 ? d3.schemeCategory10[i] : "#1f78b4",
            )
            .attr("stroke-linecap", "round");
        // .attr("opacity", 0.7);
    }

    return g_container;
}

function set_pred(data, predicate) {
    // compute prediction from given predicate
    // and set to d.pred for each item in data
    data.forEach((d, i) => {
        d.pred = true;
        for (let attr of Object.keys(predicate)) {
            let [a0, a1] = predicate[attr];
            if (d[attr] < a0 || d[attr] > a1) {
                // if ever d[attr] falls outside of predicate[attr] interval,
                // it is considered unselected/false by predicate
                d.pred = false;
                break;
            }
        }
    });
}

function data_extent_predicate(data, selected, attributes) {
    //From brush data, produce predicates derived base on data extent only.
    //Front end only. No backend server
    let selected_data = data.filter((d, i) => selected[i]);
    if (selected_data.length == 0) {
        return {};
    } else {
        // let attr_interval_pairs = Object.keys(selected_data[0]).map(
        let attr_interval_pairs = attributes.map((attr) => {
            let interval;
            if (typeof selected_data[0][attr] === "string") {
                interval = new Set(selected_data.map((d) => d[attr]));
            } else {
                interval = d3.extent(selected_data, (d) => +d[attr]);
            }
            return [attr, interval];
        });
        let predicate = Object.fromEntries(attr_interval_pairs);
        return predicate;
    }
}

function set_selected(data, brushed_region, x, y, cf, crossfilter_dimensions) {
    let { x0, x1, y0, y1 } = brushed_region;
    crossfilter_dimensions["x"].filter((v) => v >= x0 && v <= x1);
    crossfilter_dimensions["y"].filter((v) => v >= y0 && v <= y1);
    data.forEach((d, i) => {
        // let is_within_extent = x0 < x(d) && x(d) < x1 && y0 < y(d) && y(d) < y1;
        let is_within_extent = cf.isElementFiltered(i);
        d.brushed = d.brushed || is_within_extent;
        d.selected = is_within_extent;
    });
}

function set_selected_2(data, sample_brush_history, x, y) {
    if (sample_brush_history.length < 2) return;
    data.forEach((d) => {
        d.selected = false;
        d.first_brush = false;
        d.second_brush = false;
        let x0, x1, y0, y1;
        [[x0, x1], [y0, y1]] = [
            sample_brush_history[0].x_extent,
            sample_brush_history[0].y_extent,
        ];
        d.first_brush = x0 < x(d) && x(d) < x1 && y0 < y(d) && y(d) < y1;
        [[x0, x1], [y0, y1]] = [
            sample_brush_history[1].x_extent,
            sample_brush_history[1].y_extent,
        ];
        d.second_brush = x0 < x(d) && x(d) < x1 && y0 < y(d) && y(d) < y1;
        d.selected = d.first_brush || d.second_brush;
    });
}

function clear_selected(data) {
    data.forEach((d) => {
        d.brushed = false;
        d.selected = false;
        d.first_brush = false;
        d.second_brush = false;
    });
}

function subsample(array, limit = 10) {
    // Usage:
    // subsample(d3.range(50), 10) // => [0, 5, 11, 16, 22, 27, 33, 38, 44, 49]

    let n = array.length;
    if (n <= limit) {
        return array;
    }
    if (limit == 1) {
        return [array[n - 1]];
    } else if (limit == 2) {
        return [array[0], array[n - 1]];
    } else {
        // let first = array[0];
        // let last = array[n-1];
        // let m = limit - 1;
        // let step = n/m;
        // let indices = d3.range(0, n, step).map(x=>Math.round(x)).slice(1,);
        // let middle = indices.map(i=>array[i]);
        let indices = linspace(0, n - 1, limit).map((x) => Math.round(x));
        return indices.map((i) => array[i]);
        // return [first, ...middle, last];
    }
}

function get_selected(data, brush_data, { x, y } = {}) {
    //return list of boolean based on brush selection
    // x, y are coordinate getter functions for points in data
    let { x_extent, y_extent } = brush_data;
    let [x0, x1] = x_extent;
    let [y0, y1] = y_extent;
    return data.map((d, i) => {
        let xi = x(d, i);
        let yi = y(d, i);
        return x0 < xi && xi < x1 && y0 < yi && yi < y1;
    });
}

function define_arrowhead(svg) {
    //def #arrowhead
    let marker_style = { w: 4, h: 4 };
    let m = marker_style;
    svg.append("defs").node().innerHTML = `<marker id="arrowhead" 
    markerWidth="${m.w}" markerHeight="${m.h}" 
    refX="${m.w / 5}" refY="${m.h / 2}" orient="auto"> \
    <polygon points="\
    0 0, ${m.w} ${m.h / 2}, 0 ${m.h}, ${m.w / 5} ${m.h / 2}"\
    /></marker>
  `;
}

function update_brush_history(full_brush_history, brushed_region, n_boxes) {
    let { x0, x1, y0, y1, cx, cy, brush_size } = brushed_region;
    full_brush_history.push({
        x_extent: [x0, x1],
        y_extent: [y0, y1],
        cx: cx,
        cy: cy,
        brush_size: brush_size,
        // selected: JSON.parse(JSON.stringify(data.map((d) => d.selected)))
        // selected: data.map((d) => d.selected)
    });
    let sample_brush_history = subsample(full_brush_history, n_boxes);
    return sample_brush_history;
}

async function compute_predicates(
    data,
    full_brush_history,
    n_boxes,
    predicate_mode,
    { x, y } = {},
) {
    //filter and consider non-empty brushes only
    full_brush_history = full_brush_history.filter((brush_data) => {
        let selected = get_selected(data, brush_data, { x, y });
        return d3.sum(selected) > 0;
    });

    if (full_brush_history.length === 0) {
        return [{}];
    }

    let predicates, qualities, attributes;
    let manual_splom_attributes = Object.keys(data[0]).slice(0, 5); //TODO
    let sample_brush_history = subsample(full_brush_history, n_boxes);
    if (predicate_mode == "data extent") {
        // let selected_data = data.filter((d, i) => selected[i]);
        predicates = sample_brush_history.map((brush_data) => {
            let selected = get_selected(data, brush_data, { x, y });
            return data_extent_predicate(
                data,
                selected,
                manual_splom_attributes,
            );
        });
        attributes = manual_splom_attributes;
    } else {
        // "predicate regression"
        let response = await fetch_json(`${predicate_host}/get_predicates`, {
            //query server
            body: {
                subsets: sample_brush_history.map((brush_data) => {
                    return get_selected(data, brush_data, { x, y });
                }),
                dataset: dataset_name,
            },
        });
        qualities = response.qualities;

        //find union of predicate attributes in response.predicates
        attributes = d3
            .groups(response.predicates.flat(), (d) => d.attribute)
            .map((d) => d[0]);

        //set predicates to be an array of {attr_name:interval} dictionaries indexed by brush time
        predicates = response.predicates.map((predicate_t) => {
            let key_value_pairs = predicate_t.map((p) => [
                p.attribute,
                p.interval,
            ]);
            return Object.fromEntries(key_value_pairs);
        });
    }
    return { predicates, qualities, attributes };
}

function update_point_style(sca, mode = "confusion") {
    let style = get_point_style(mode);
    sca.update_style(style);
    //raise
    sca.selectAll(".point")
        .filter((d) => d.brushed)
        .raise();
    sca.selectAll(".point")
        .filter((d) => d.pred == 1 && d.selected) //true postives
        .raise();
}

function get_point_style(mode = "confusion") {
    let style;
    if (mode === "confusion") {
        //set style - color by confusion (tp, tn, fp, fn)
        style = (d, i) =>
            d.pred && d.selected //tp = true positive
                ? { fill: d3.rgb(116, 43, 122), stroke: "#eee" }
                : !d.pred && !d.selected //tn
                  ? { fill: d3.rgb(204, 204, 204), stroke: "#eee" }
                  : !d.pred && d.selected //fn
                    ? { fill: d3.rgb(49, 111, 200), stroke: "#eee" }
                    : //fp
                      { fill: d3.rgb(167, 61, 47), stroke: "#eee" };
    } else if (mode === "selection") {
        //color by selected vs. unselected
        style = (d, i) =>
            d.brushed
                ? { fill: d3.schemeCategory10[0], stroke: "#eee" }
                : { fill: "#aaa", stroke: "#eee" };
    } else if (mode === "contrastive") {
        style = (d, i) =>
            d.first_brush
                ? { fill: d3.schemeCategory10[0], stroke: "#eee" }
                : d.second_brush
                  ? { fill: d3.schemeCategory10[1], stroke: "#eee" }
                  : { fill: "#aaa", stroke: "#eee" };
    }
    return style;
}

function draw_boxes(sca, intervals, { stroke_width = 2 } = {}) {
    let { sx, sy } = sca.scales;
    let n = intervals.length;
    let sc = d3.interpolateViridis;
    // let sc = d3.interpolateCividis;
    // let sc = d3.interpolateBlues;

    sca.selectAll(".bbox").remove();
    sca.selectAll(".bbox")
        .data(intervals)
        .join("rect")
        .attr("class", "bbox")
        .attr("x", (d) => sx(d.x0))
        .attr("y", (d) => sy(d.y1))
        .attr("width", (d) => Math.abs(sx(d.x0) - sx(d.x1)))
        .attr("height", (d) => Math.abs(sy(d.y0) - sy(d.y1)))
        .attr("fill", "none")
        // .attr('fill-opacity', (d,i)=> i==n-1 ? 0.1 : 0.0)
        .attr("stroke", (d, i) => {
            return sc(Math.pow(i / n, 0.3));
        }) //the darker the more recent, and less dark boxes
        .attr("stroke-width", stroke_width);
    // .attr("stroke-width", (d, i) => {
    //   return 0.3 + (1.2 * i) / n;
    // });
}

// views
export class ProjectionView {
    constructor(data, { x, y } = {}, controller, config) {
        /*
    - Takes projection coordinates and reorder it
    - Knows hwo to color points within it
    - Returns brushed data points
    - For now (maybe move to somewhere else in the future), its brush also ask backend for predicates and retain that knowledge of predicates
  */
        this.data = data;
        this.controller = controller;
        this.config = config;

        this.node = this.init_node();
        this.x = x;
        this.y = y;
        this.draw();
        this.brush = this.init_brush();
        this.brush_mode = "single"; //TODO support "contrustive" and "curve"
        this.predicate_mode = "data extent"; // TODO "predicate regression"

        //crossfilter init
        //given attributes and cf (crossfilter);
        //return an object with keys being attributes,
        //and values beinging the corresponding crossfilter dimension objects
        let attributes = Object.keys(data[0]);
        let cf = crossfilter(data);
        let cf_dimensions = attributes.map((attr) =>
            cf.dimension((d) => d[attr]),
        );

        attributes.push("x", "y");
        cf_dimensions.push(
            cf.dimension((d, i) => x[i]),
            cf.dimension((d, i) => y[i]),
        );

        this.cf = cf;
        this.crossfilter_dimensions = Object.fromEntries(
            zip(attributes, cf_dimensions),
        );

        return this;
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
            let { predicates, attributes, qualities } =
                await compute_predicates(
                    this.data,
                    this.full_brush_history,
                    this.n_boxes,
                    this.predicate_mode,
                    { x: (d, i) => this.x[i], y: (d, i) => this.y[i] },
                );

            if (predicates !== undefined && predicates.length >= 1) {
                //Color scatter plot points by false positives, false negatives, etc.
                let last_predicate = predicates[predicates.length - 1];
                set_pred(this.data, last_predicate);
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
                x: this.x,
                y: this.y,
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

export class PredicateView {
    svg;
    view_g;
    controller;
    node;
    plot_width;
    plot_height;

    constructor(data, controller, config) {
        console.log("new PredicateView");
        this.data = data;
        this.controller = controller;
        this.config = config;

        this.extent = Object.fromEntries(
            Object.keys(data[0]).map((attr) => [
                attr,
                d3.extent(data, (d) => d[attr]),
            ]),
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
        let ob = overflow_box(this.svg.node(), width * scatter_height);
        d3.select(ob)
            .style("position", "absolute")
            .style("top", `${this.padding_top}px`)
            .style("left", "0");
        return_node.appendChild(ob);

        return return_node;
    }

    draw(n_boxes, predicates, attributes, sample_brush_history, x, y) {
        console.log("predicate view drawing...", arguments);
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
                subplot_height: this.config.predicate_view_subplot_height,
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
                this.view_g.call(predicate_contrastive, predicate_view_style);
            } else {
                this.view_g.call(predicate_multiple, predicate_view_style);
            }
            if (n_boxes == 1) {
                let selected_data = get_selected(
                    this.data,
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
        } = this.config;

        let n_boxes = 1;

        //gap between subplots in splot, measured in proportion (0 to 1) to the size of a subplot
        let splom_spacing = 0.03;
        this.plot_width = width * scatter_width - gap; //width of main scatter plot and SPLOM
        this.plot_height = width * scatter_height + 2.6 * font_size;

        // controls padding in svg for the frames
        let margin_outer = margin_outer;
        let margin_inner = margin_inner;
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
        return; //TODO continue
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
