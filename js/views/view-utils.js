/*
 * Shared utility functions across multiple view components
 *
 * TODO move functions unique to some view to the corresponding view class files
 */

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
} from "../lib.js";

export function set_pred(data, predicate) {
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

export function set_selected(data, brush_data, cf, crossfilter_dimensions) {
    // update d.selected and d.brushed attributes for all points d in data
    crossfilter_dimensions["x"].filter(brush_data.x_extent);
    crossfilter_dimensions["y"].filter(brush_data.y_extent);
    data.forEach((d, i) => {
        let is_within_extent = cf.isElementFiltered(i);
        // d.selected records current brush
        d.selected = is_within_extent;
        //d.brushed records current brush union with other brushes before next clearance
        d.brushed = d.brushed || is_within_extent;
    });
}

export function set_selected_2(
    data,
    sample_brush_history,
    cf,
    crossfilter_dimensions,
) {
    //update first_brush and second_brush based on two brushed regions in sample_brush_history
    console.assert(sample_brush_history.length == 2);
    crossfilter_dimensions["x"].filter(sample_brush_history[0].x_extent);
    crossfilter_dimensions["y"].filter(sample_brush_history[0].y_extent);
    data.forEach((d, i) => {
        let is_within_extent = cf.isElementFiltered(i);
        d.first_brush = is_within_extent;
    });
    crossfilter_dimensions["x"].filter(sample_brush_history[1].x_extent);
    crossfilter_dimensions["y"].filter(sample_brush_history[1].y_extent);
    data.forEach((d, i) => {
        let is_within_extent = cf.isElementFiltered(i);
        d.second_brush = is_within_extent;
        d.selected = d.first_brush || d.second_brush;
    });
}

export function clear_path(g) {
    g.selectAll("path").attr("display", "none");
}

export function draw_path(g, path_data, path_style) {
    let line_generator = d3
        .line()
        .x((d) => d.cx)
        .y((d) => d.cy)
        // .curve(d3.curveCatmullRom)
        .curve(d3.curveBasis);

    // a thicker stroke on the background
    // and a think stroke with arrow head
    let path_styles = [
        {
            // stroke: "#1f78b4",
            // stroke: "#00ff00",
            stroke: "#333",
            "stroke-width": path_style.size,
            opacity: 0.3,
            "marker-end": "",
        },
        {
            stroke: "#000",
            "stroke-width": path_style["stroke-width"],
            opacity: 1,
            "marker-end": "url(#arrowhead)",
        },
    ];

    let path = g
        .selectAll("path")
        .data(path_styles)
        .join("path")
        .attr("fill", "none")
        .attr("display", "")
        .attr("stroke", (d) => d.stroke)
        .attr("stroke-width", (d) => d["stroke-width"])
        .attr("stroke-linecap", "round")
        .attr("marker-end", (d) => d["marker-end"])
        .attr("opacity", (d) => d.opacity)
        .attr("d", line_generator(path_data));
    return path;
}

export function clear_selected(data) {
    //reset all brush-related attributes
    data.forEach((d) => {
        d.selected = false;
        d.brushed = false;
        d.first_brush = false;
        d.second_brush = false;
    });
}

export function subsample(array, limit = 10) {
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

export function get_selected(data, brush_data, {x, y} = {}) {
    //return list of boolean based on brush selection
    // x, y are coordinate getter functions for points in data
    let {x_extent, y_extent} = brush_data;
    let [x0, x1] = x_extent;
    let [y0, y1] = y_extent;
    return data.map((d, i) => {
        let xi = x(d, i);
        let yi = y(d, i);
        return x0 < xi && xi < x1 && y0 < yi && yi < y1;
    });
}

export function define_arrowhead(svg) {
    //def #arrowhead
    let marker_style = {w: 4, h: 4};
    let m = marker_style;
    svg.append("defs").node().innerHTML = `<marker id="arrowhead" 
    markerWidth="${m.w}" markerHeight="${m.h}" 
    refX="${m.w / 5}" refY="${m.h / 2}" orient="auto"> \
    <polygon points="\
    0 0, ${m.w} ${m.h / 2}, 0 ${m.h}, ${m.w / 5} ${m.h / 2}"\
    /></marker>
  `;
}

export function update_brush_history(
    full_brush_history,
    brushed_region,
    n_boxes,
) {
    let {x0, x1, y0, y1, cx, cy, brush_size} = brushed_region;
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

//export function update_point_style(sca, mode = "confusion") {
//    let style = get_point_style(mode);
//    sca.update_style(style);
//    //raise
//    sca.selectAll(".point")
//        .filter((d) => d.brushed)
//        .raise();
//    sca.selectAll(".point")
//        .filter((d) => d.pred == 1 && d.selected) //true postives
//        .raise();
//}

export function update_point_style_gl(sca_gl, mode = "confusion") {
    let style = get_point_style(mode);
    let sc = (d, i) => style(d, i).fill;
    sca_gl.recolor(sc);
}

export function get_point_style(mode = "confusion") {
    let style;
    if (mode === "confusion") {
        //set style - color by confusion (tp, tn, fp, fn)
        style = (d, i) =>
            d.pred && d.selected //tp = true positive
                ? {fill: d3.rgb(116, 43, 122), stroke: "#eee"}
                : !d.pred && !d.selected //tn
                  ? {fill: d3.rgb(204, 204, 204), stroke: "#eee"}
                  : !d.pred && d.selected //fn
                    ? {fill: d3.rgb(49, 111, 200), stroke: "#eee"}
                    : //fp
                      {fill: d3.rgb(167, 61, 47), stroke: "#eee"};
    } else if (mode === "selection") {
        //color by selected vs. unselected
        style = (d, i) =>
            d.selected
                ? {fill: d3.schemeCategory10[0], stroke: "#eee"}
                : {fill: "#aaa", stroke: "#eee"};
    } else if (mode === "contrastive") {
        style = (d, i) =>
            d.first_brush
                ? {fill: d3.schemeCategory10[0], stroke: "#eee"}
                : d.second_brush
                  ? {fill: d3.schemeCategory10[1], stroke: "#eee"}
                  : {fill: "#aaa", stroke: "#eee"};
    } else if (mode === "brush") {
        //color by selected vs. unselected
        style = (d, i) =>
            d.brushed
                ? {fill: d3.schemeCategory10[0], stroke: "#eee"}
                : {fill: "#aaa", stroke: "#eee"};
    }
    return style;
}

export function draw_boxes(sca, intervals, {stroke_width = 2} = {}) {
    let {sx, sy} = sca.scales;
    let n = intervals.length;
    let sc = d3.interpolateViridis;
    // let sc = d3.interpolateCividis;
    // let sc = d3.interpolateBlues;

    sca.overlay.selectAll(".bbox").remove();
    sca.overlay
        .selectAll(".bbox")
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
