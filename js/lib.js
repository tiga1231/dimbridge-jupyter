// partial copy of https://observablehq.com/@tiga1231/lib

import * as d3 from "d3";
import {default as crossfilter} from "https://cdn.skypack.dev/crossfilter2@1.5.4?min";
import regl2 from "regl";

// ------------ Constants ---------------
const pyplot_cycles = [
    "#1f77b4",
    "#ff7f0e",
    "#2ca02c",
    "#d62728",
    "#9467bd",
    "#8c564b",
    "#e377c2",
    "#7f7f7f",
    "#bcbd22",
    "#17becf",
];
export const C = pyplot_cycles;

// --------------- data utils ---------------
export function normalize(d, vmin, vmax, eps = 1e-4) {
    return (d - vmin) / (vmax - vmin + eps);
}

export function pandas2array(data_obj) {
    //parse individual column data from DataView to arrays
    for (let j = 0; j < data_obj.shape[1]; j++) {
        data_obj.data[j] = numpy2array({
            dtype: data_obj.dtypes[j],
            shape: [data_obj.shape[0]],
            data: data_obj.data[j],
        });
    }
    //construct an array of objects
    // data = [{column_name: column_value}...];
    let data = [];
    for (let i = 0; i < data_obj.shape[0]; i++) {
        let datum = Object.fromEntries(
            data_obj.columns.map((c, j) => [c, data_obj.data[j][i]]),
        );
        data.push(datum);
    }

    return data;
}

export function numpy2array(data_obj) {
    // parameters
    // data_obj - { dtype: "float64", shape: [2, 3], data: DatavView }
    //
    let {dtype, shape, data} = data_obj;
    if (dtype === "float64") {
        data = new Float64Array(data.buffer);
    } else if (dtype === "int64") {
        data = new BigInt64Array(data.buffer);
    } else if (dtype === "uint8") {
        data = new Uint8Array(data.buffer);
    } else if (dtype === "int8") {
        data = new Int8Array(data.buffer);
    } else if (dtype === "uint16") {
        data = new Uint16Array(data.buffer);
    } else if (dtype === "int16") {
        data = new Int16Array(data.buffer);
    } else if (dtype === "uint32") {
        data = new Uint32Array(data.buffer);
    } else if (dtype === "int32") {
        data = new Int32Array(data.buffer);
    } else if (dtype === "float32") {
        data = new Float32Array(data.buffer);
    }
    data = reshape(Array.from(data), shape);
    return data;
}

export function zip(a, b) {
    return a.map((ai, i) => [ai, b[i]]);
}

export function linspace(a, b, n) {
    return d3.range(n).map((i) => (i / (n - 1)) * (b - a) + a);
}

export function reshape(arr, size) {
    size = size.slice();
    if (size.length <= 1) {
        return arr;
    } else if (size.length == 2) {
        return reshape2d(arr, size[0], size[1]);
    } else {
        let res = [];
        let m = size.pop();
        for (let i = 0; i < arr.length; i = i + m) {
            res.push(arr.slice(i, i + m));
        }
        return reshape(res, size);
    }
}

function reshape2d(arr, r, c) {
    let res = [];
    let k = 0;
    for (let i = 0; i < r; i++) {
        let row = [];
        for (let j = 0; j < c; j++) {
            row.push(arr[k]);
            k++;
        }
        res.push(row);
    }
    return res;
}

// --------------- Vis Utils -----------------

export function kde(
    sel,
    data,
    {
        x = (d) => d, //x value accessor,
        normalize = false,
        bandwidth = undefined,
        evaluation_points = undefined,
        width = 300,
        height = 300,
        padding_left = 0,
        padding_right = 0,
        padding_top = 0,
        padding_bottom = 0,
        stroke = "#1f77b4",
        stroke_width = 2,
        is_framed = true,
        histtype = "bar", // 'bar' or 'step',
        xticks = undefined,
        yticks = undefined,
        scales = {},
        title = "",
        frame_kwargs = "#eef",
        label_fontsize = 12,
    } = {},
) {
    let kde_values = data.map((seq) => seq.map((d) => x(d)));
    if (evaluation_points === undefined) {
        let extent = d3.extent(kde_values.flat());
        // let r = extent[1] - extent[0];
        let r = 0;
        evaluation_points = linspace(
            extent[0] - 0.1 * r,
            extent[1] + 0.1 * r,
            100,
        );
    }

    let lines_data = [];
    for (let values of kde_values) {
        lines_data.push(
            compute_kde(values, {evaluation_points, bandwidth, normalize}),
        );
    }

    return lines(sel, lines_data, {
        is_framed,
        width,
        height,
        stroke,
        stroke_width,
        // data accessors:
        x: (d) => d[0],
        y: (d) => d[1],
        xticks,
        yticks,
        title,
        padding_left,
        padding_bottom,
        padding_right,
        padding_top,
        label_fontsize,
        //scales
        // scales: { sx, sy }
    });

    // sel.scales = { sx, sy };

    return sel;
}

function compute_kde(
    data,
    {
        evaluation_points = undefined,
        bandwidth = undefined,
        kernel = gaussian_kernel,
        normalize = true,
    } = {},
) {
    if (bandwidth === undefined) {
        let extent = d3.extent(data);
        let range = extent[1] - extent[0];
        bandwidth = Math.pow(data.length, -0.2); // scotts rule, n**(-1./(d+4)),
        bandwidth *= range / 5;
        console.log("KDE using default bandwidth", bandwidth);
    }

    if (evaluation_points === undefined) {
        evaluation_points = linspace(...d3.extent(data), 100);
    }
    if (normalize) {
        return evaluation_points.map((x) => [
            x,
            d3.mean(data, (d) => kernel(d - x, bandwidth)),
        ]);
    } else {
        return evaluation_points.map((x) => [
            x,
            d3.sum(data, (d) => kernel(d - x, bandwidth)),
        ]);
    }
}

function gaussian_kernel(x, bandwidth = 1) {
    let h = bandwidth;
    let z = h * Math.sqrt(2 * Math.PI); // normalizing factor
    return (1 / z) * Math.exp((-x * x) / (2 * h * h));
}

// Draw multiple polylines
function lines(
    container = undefined,
    data = [
        // array of polylines, where each polyline containes array of nodes. e.g.,
        d3.range(10).map((i) => ({x: i, y: Math.random() * 2 - 0.5})),
        [
            {x: 3, y: 0.5},
            {x: 4, y: -0.5},
            {x: 5, y: 0},
            {x: 6, y: 0},
        ],
    ],

    //kwargs
    {
        // plotting styles
        is_framed = true,
        width = 400,
        height = 200,
        stroke = (line_data, i) => C[i],
        stroke_width = 4,
        // data accessors:
        x = (d) => d.x,
        y = (d) => d.y,
        //scales
        scales = {sx: undefined, sy: undefined},
        xticks,
        yticks,

        padding_left = 50,
        padding_right = 0,
        padding_top = 0,
        padding_bottom = 12,
        label_fontsize = 2,
    } = {},
) {
    if (container === undefined) {
        container = create_svg(width, height);
    }
    if (is_framed) {
        let frame1 = container.call(frame, data.flat(), {
            is_square_scale: false,
            scales,
            width,
            height,
            x,
            y,
            xticks,
            yticks,
            padding_left,
            padding_right,
            padding_top,
            padding_bottom,
            label_fontsize,
        });
        scales.sx = frame1.scales.sx;
        scales.sy = frame1.scales.sy;
    } else {
        if (scales.sx === undefined) {
            scales.sx = create_scale(data.flat(), {
                value_accessor: (d) => x(d),
                range: [0, width],
            });
        }
        if (scales.sy === undefined) {
            scales.sy = create_scale(data.flat(), {
                value_accessor: (d) => y(d),
                range: [height, 0],
            });
        }
    }

    container
        .selectAll(".line")
        .data(data)
        .join("path")
        .attr("class", "line")
        .attr("fill", "none")
        .attr("stroke", stroke)
        .attr("stroke-width", stroke_width)
        .attr(
            "d",
            d3
                .line()
                .x(function (d) {
                    return scales.sx(x(d));
                })
                .y(function (d) {
                    return scales.sy(y(d));
                }),
        );

    return container;
}

export function create_scatter_gl_program(regl) {
    let vert = `
    precision mediump float;
    attribute vec2 position;
    attribute vec4 color;
    attribute float size;
    attribute float depth;
    varying float v_size;
    varying vec4 v_color;

    void main() {
      gl_Position = vec4(position, depth, 1.0);
      gl_PointSize = size;
      v_color = color;
      v_size = size;
    }`;

    let frag = `
    precision mediump float;
    varying vec4 v_color;
    varying float v_size;
    uniform vec3 u_stroke;
    uniform float u_stroke_width;

    void main() {
      float eps = 0.01;
  
      //round marks
      vec2 pointCoord = (gl_PointCoord.xy-0.5)*2.0;
      float dist = length(pointCoord); // distance to point center, normalized to [0,1]
      if (dist>1.0) discard;
      gl_FragColor = v_color;
      // if (v_size > 6.0){ //border color if marker size > 2.0
      float stroke = u_stroke_width / v_size; //normalized stroke width
      float mix_factor = smoothstep(1.0-stroke-eps, 1.0-stroke+eps, dist);
      gl_FragColor = mix(
          v_color, 
          vec4(u_stroke, 1.0), 
          mix_factor
      );
      // debug depth:
      // gl_FragColor = vec4(vec3(gl_FragCoord.z), 1.0);
      float alpha = 1.0 - smoothstep(1.0-stroke+stroke*0.8, 1.0, dist);
      gl_FragColor.a = alpha;
      //}
    }`;

    let render_func = regl({
        attributes: {
            position: regl.prop("positions"),
            color: regl.prop("colors"),
            size: regl.prop("size"),
            depth: regl.prop("depth"),
        },
        uniforms: {
            u_stroke: regl.prop("stroke"),
            u_stroke_width: regl.prop("stroke_width"),
        },
        count: regl.prop("count"),
        primitive: "points",
        vert,
        frag,

        depth: {
            enable: true,
            mask: true,
            func: "<",
            range: [0, 1],
        },

        //alpha blend
        blend: {
            enable: true,
            func: {
                srcRGB: "src alpha",
                srcAlpha: 1,
                dstRGB: "one minus src alpha",
                dstAlpha: 1,
            },
            equation: {
                rgb: "add",
                alpha: "add",
            },
            color: [0, 0, 0, 0],
        },
    });

    return render_func;
}

export function scatter_frame(
    container = undefined,
    data = undefined,
    {
        background = "#eee",
        xticks = 5,
        yticks = 5,
        x_tickvalues = undefined,
        y_tickvalues = undefined,
        x = (d) => d.x,
        y = (d) => d.y,
        scales = {},
        width = 500,
        height = 500,
        padding_bottom = 18,
        padding_left = 40,
        padding_right = 0,
        padding_top = 0,
        pad = 0.1,
        title = undefined,
        is_square_scale = false,
        is_log_scale = false,
        xlabel = undefined,
        ylabel = undefined,
        label_fontsize = 12,
    } = {},
) {
    if (container === undefined) {
        container = create_svg(width, height);
    }
    container.call(frame, data, {
        background,
        xticks,
        yticks,
        x_tickvalues,
        y_tickvalues,
        x,
        y,
        scales,
        width,
        height,
        padding_bottom,
        padding_left,
        padding_right,
        padding_top,
        pad,
        title,
        is_square_scale,
        is_log_scale,
        xlabel,
        ylabel,
        label_fontsize,
    });

    let return_node = container.node();
    return_node.scales = container.scales;
    return return_node;
}

export function hex2rgb(color) {
    let c = d3.rgb(d3.color(color));
    return [c.r, c.g, c.b];
}

export function color2gl(color) {
    let c;
    if (typeof color === "string") {
        c = d3.rgb(d3.color(color));
    } else if (typeof color === "object") {
        if (color.length !== undefined) {
            //3-tuple
            c = d3.rgb(...color);
        } else {
            //rgb object
            c = color;
        }
    }
    return [c.r / 255, c.g / 255, c.b / 255];
}

export function clip(value, vmin, vmax) {
    return Math.min(Math.max(vmin, value), vmax);
}

export function fetch_json(url, {body = null, callback = (json) => json} = {}) {
    let args = {
        method: body === null ? "GET" : "POST",
        headers: {
            "Content-Type": "application/json",
        },
        // mode: "cors",
    };
    if (body !== null) {
        args.body = JSON.stringify(body);
    }
    return fetch(`${url}`, args)
        .then((response) => response.json())
        .then((arr) => {
            return callback(arr);
        });
}

export function create_canvas(width, height, dpi_scale = 1.0) {
    let canvas = document.createElement("canvas");
    canvas.width = width * window.devicePixelRatio * dpi_scale;
    canvas.height = height * window.devicePixelRatio * dpi_scale;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    return canvas;
}

export function overlay(container = undefined, nodes = []) {
    /*
    Take a list of DOM nodes.
    return a div, with children following the <selections> order.
    Following the HTML convention, later children are overlaid on top of early children.
  */
    if (container === undefined) {
        container = d3.create("div");
    }
    container.style("position", "relative");

    nodes = [...container.node().children, ...nodes];
    let container_height = 0;
    nodes.forEach((node, i) => {
        let sel = d3.select(node);
        sel.style("position", i == 0 ? "relative" : "absolute")
            .style("top", "0")
            .style("left", "0");
        let h;
        if (sel.style("height") !== "") {
            h = parseFloat(sel.style("height"));
        } else {
            h = parseFloat(sel.attr("height"));
        }
        container_height = Math.max(h, container_height);
        container.node().appendChild(sel.node());
    });
    container.style("height", `${container_height}px`);
    return container.node();
}

export function scatter_gl(
    container = undefined,
    data = undefined,
    {
        is_framed = true,
        background = "#eee",
        xticks = 5,
        yticks = 5,
        x_tickvalues = undefined,
        y_tickvalues = undefined,
        x = (d, i) => d.x,
        y = (d, i) => d.y,
        s = (d, i) => 10, //marker size
        depth = undefined, //(d, i) => i / 100,
        scales = {},
        width = 500,
        height = 500,
        padding_bottom = 18,
        padding_left = 40,
        padding_right = 0,
        padding_top = 0,
        pad = 0.1,
        title = undefined,
        is_square_scale = false,
        is_log_scale = false,
        xlabel = undefined,
        ylabel = undefined,
        label_fontsize = 12,
        stroke = "white",
        stroke_width = 1.0,
        dpi_scale = 1.0,
    } = {},
) {
    if (depth === undefined) {
        //by default, last point gets drawn on the top
        depth = (d, i) => -i / data.length;
    }
    if (container === undefined) {
        container = d3.create("div");
    }

    // underlay;
    // canvas;
    // overlay;
    let underlay = create_svg(width, height);
    let overlay1 = create_svg(width, height);
    underlay.call(frame, data, {
        background,
        xticks,
        yticks,
        x_tickvalues,
        y_tickvalues,
        x,
        y,
        scales,
        width,
        height,
        padding_bottom,
        padding_left,
        padding_right,
        padding_top,
        pad,
        title,
        is_square_scale,
        is_log_scale,
        xlabel,
        ylabel,
        label_fontsize,
    });

    if (!is_framed) {
        underlay.selectAll(".scatter").remove();
    }

    // Scales
    // From data to pixel coords on svg;
    let {sx, sy} = underlay.scales;

    //From pixels to GL's clip space
    let sx_svg2gl = d3.scaleLinear().domain([0, width]).range([-1, 1]);
    let sy_svg2gl = d3.scaleLinear().domain([0, height]).range([1, -1]);
    // From data to clip space
    let sx_gl = d3
        .scaleLinear()
        .domain(sx.domain())
        .range([sx_svg2gl(sx.range()[0]), sx_svg2gl(sx.range()[1])]);
    let sy_gl = d3
        .scaleLinear()
        .domain(sy.domain())
        .range([sy_svg2gl(sy.range()[0]), sy_svg2gl(sy.range()[1])]);

    let sc = scales.sc || ((d) => C[0]);
    let sc_gl = (d, i) => {
        let c = sc(d, i);
        return [...color2gl(c), 1.0];
    };

    let canvas = create_canvas(width, height, dpi_scale);
    let regl = regl2({canvas: canvas});

    // let res = d3.select(canvas);
    let res = overlay(container, [underlay.node(), canvas, overlay1.node()]);
    //method defs
    res.underlay = underlay;
    res.overlay = overlay1;
    res.scales = {...underlay.scales, sx_gl, sy_gl, sc_gl};
    res.clear = () => {
        // regl._gl.clearColor(0, 0, 0, 1);
        regl.clear({
            color: [0, 0, 0, 0],
            depth: 1,
            stencil: 0,
        });
    };
    res._render = create_scatter_gl_program(regl);

    //rendering APIs
    res.render = ({
        positions,
        colors,
        size,
        stroke,
        stroke_width,
        depth,
    } = {}) => {
        res._render({
            positions: positions.map((d) => [sx_gl(d[0]), sy_gl(d[1])]),
            colors,
            count: positions.length,
            size: size.map((s) => s * window.devicePixelRatio * dpi_scale),
            stroke,
            stroke_width: stroke_width * window.devicePixelRatio * dpi_scale,
            depth,
        });
    };

    res.redraw = (data) => {
        res.render({
            // attributes
            positions: data.map((d, i) => [x(d, i), y(d, i)]), //array of two numbers
            colors: data.map((d, i) => sc_gl(d, i)), // array of RGBA tuples
            size: data.map((d, i) => s(d, i)), // array of numbers
            depth: data.map((d, i) => depth(d, i)),
            stroke: color2gl(stroke),
            stroke_width,
        });
    };

    res.recolor = (new_sc, {depth} = {}) => {
        // update color scale
        sc = new_sc;
        sc_gl = (d, i) => {
            let c = sc(d, i);
            return [...color2gl(c), 1.0];
        };
        // re-render
        res.render({
            // attributes
            positions: data.map((d, i) => [x(d, i), y(d, i)]), //array of two numbers
            colors: data.map((d, i) => sc_gl(d, i)), // array of RGBA tuples
            size: data.map((d, i) => s(d, i)), // array of numbers
            depth: data.map((d, i) => depth(d, i)),
            stroke: color2gl(stroke),
            stroke_width,
        });
    };

    //draw
    res.clear();
    res.redraw(data);

    return res;
}

export function splom_gl2(
    container_div = undefined,
    data = undefined,
    {
        width = 800,
        height = 800,
        attrs = ["column_a", "column_b", "column_c"], //list of keys in data
        depth = undefined, //(d) => 0.0,
        //Show histogram on the diagonal or not.
        //Currently, this only affects the layout and plotting histogram is not supported yet
        // histogram = false, //TODO
        layout = "upper", //'lower', 'upper' or 'both'
        // margin_left = 600,
        padding_left = 16,
        padding_right = 0,
        padding_bottom = 20,
        padding_top = 0,
        // wspace = 1, //The amount of width reserved for space between subplots. Similar to pyplot
        // hspace = 0.1,

        //x and y axes
        scales = {sc: undefined}, // todo: flexible for individual subplots
        is_square_scale = false,
        is_log_scale = false,
        xticks = 5,
        yticks = 5,

        //color styles,
        s = () => 5, //mark size,
        stroke = "#eee",
        stroke_width = 1,
        //todo:
        //fill
        //cmap
        //c
        dpi_scale = 1.0,

        kde_filters = [(d) => true],
        //texts
        label_fontsize = 10,
    } = {},
) {
    let n_attrs = attrs.length;
    let plot_width, plot_height;
    // if (histogram || layout === "both") {
    plot_width = (width - padding_left - padding_right) / n_attrs;
    plot_height = (height - padding_top - padding_bottom) / n_attrs;
    // } else {
    //   plot_width = (width - padding_left - padding_right) / (n_attrs - 1);
    //   plot_height = (height - padding_top - padding_bottom) / (n_attrs - 1);
    // }

    if (depth === undefined) {
        //by default, last point gets drawn on the top
        depth = (d, i) => -i / data.length;
    }

    //DOM layout:
    // <div> container_div
    // - <div> frame_container
    //    - <svg> subplot frames
    //    - ...
    // - <canvas> BIG ASS gl canvas
    // - overlay_container (div)
    //     - overlays for brushes, arrows (svg)
    if (container_div === undefined) {
        container_div = d3.create("div").style("height", `${height}px`);
    }
    let frame_container = container_div
        .append("div")
        .attr("class", "frame-container")
        .style("position", "relative");

    //create a canvas, gl, with render functionality
    let canvas = create_canvas(width, height, dpi_scale);
    let regl = regl2({canvas: canvas});
    d3.select(canvas).style("position", "absolute");
    container_div.node().appendChild(canvas);

    let overlay_container = container_div
        .append("div")
        .attr("class", "overlay-container");
    let _render = create_scatter_gl_program(regl);

    function draw_subplots() {
        regl.clear({
            color: [0, 0, 0, 0],
            depth: 1,
            stencil: 0,
        });

        let subplots = d3.range(n_attrs).map((_) => []);
        for (let i = 0; i < n_attrs; i++) {
            for (let j = 0; j < n_attrs; j++) {
                if (
                    (layout === "lower" && i > j) ||
                    (layout === "upper" && i < j)
                ) {
                    continue;
                }

                if (i == j) {
                    //WIP histogram on the diagonal subplots
                    let kde_plot = kde(
                        undefined,
                        kde_filters.map((f) => data.filter(f)),
                        {
                            x: (d) => d[attrs[i]],
                            height: plot_height,
                            width: plot_width,
                            padding_top,
                            padding_bottom,
                            padding_left,
                            padding_right,
                            stroke: (seq, i) => C[i],
                            stroke_width: 2,
                            yticks: 2,
                            xticks,
                            label_fontsize,
                        },
                    );
                    kde_plot.style("overflow", "visible");
                    kde_plot.select(".y-axis").selectAll("text").remove();
                    if (j !== 0) {
                        kde_plot.select(".x-axis").selectAll("text").remove();
                    }

                    subplots[i][j] = kde_plot;

                    let left = padding_left + j * plot_width;
                    let top = padding_top + (n_attrs - 1 - i) * plot_height;
                    kde_plot
                        .attr("class", "kde")
                        .style("position", "absolute")
                        .style("overflow", "visible")
                        .style("left", `${left}px`)
                        .style("top", `${top}px`);
                    frame_container.node().appendChild(kde_plot.node());
                } else {
                    //subplot background frame
                    let frame = scatter_frame(undefined, data, {
                        x: (d) => d[attrs[j]],
                        y: (d) => d[attrs[i]],
                        width: plot_width,
                        height: plot_height,
                        xlabel: attrs[j],
                        ylabel: attrs[i],
                        is_square_scale,
                        xticks: xticks,
                        yticks: yticks,
                        padding_top,
                        padding_bottom,
                        padding_left,
                        padding_right,
                        title: "",
                        label_fontsize,
                    });
                    frame_container.node().appendChild(frame);
                    //compute offset on the big gl canvas pixel coordinate
                    let left = padding_left + j * plot_width;
                    let top = padding_top + (n_attrs - 1 - i) * plot_height;
                    d3.select(frame)
                        .attr("class", "frame")
                        .style("position", "absolute")
                        .style("overflow", "visible")
                        .style("left", `${left}px`)
                        .style("top", `${top}px`);

                    d3.select(frame)
                        .selectAll("text")
                        .style("font-size", `${label_fontsize}px`);

                    if (i !== 0) {
                        d3.select(frame)
                            .selectAll(".x-axis .tick text")
                            .style("display", "none");
                    }
                    if (j !== 0) {
                        d3.select(frame)
                            .selectAll(".y-axis .tick text")
                            .style("display", "none");
                    }

                    // gl render here
                    let {sx, sy} = frame.scales; //updated sx, sy;
                    let pixel2clip_x = d3
                        .scaleLinear()
                        .domain([0, width])
                        .range([-1, 1]);
                    let pixel2clip_y = d3
                        .scaleLinear()
                        .domain([0, height])
                        .range([1, -1]);
                    // From data to clip space
                    let sx_gl = d3
                        .scaleLinear()
                        .domain(sx.domain())
                        .range([
                            pixel2clip_x(sx.range()[0] + left),
                            pixel2clip_x(sx.range()[1] + left),
                        ]);
                    let sy_gl = d3
                        .scaleLinear()
                        .domain(sy.domain())
                        .range([
                            pixel2clip_y(sy.range()[0] + top),
                            pixel2clip_y(sy.range()[1] + top),
                        ]);
                    let sc = scales.sc || ((d) => C[0]);
                    let sc_gl = (d) => {
                        let c = sc(d);
                        return [...color2gl(c), 1.0];
                    };
                    _render({
                        positions: data.map((d) => [
                            sx_gl(d[attrs[j]]),
                            sy_gl(d[attrs[i]]),
                        ]),
                        colors: data.map((d) => sc_gl(d)),
                        count: data.length,
                        size: data.map(
                            (d, i) =>
                                s(d, i) * window.devicePixelRatio * dpi_scale,
                        ),
                        stroke: color2gl(stroke),
                        stroke_width:
                            stroke_width * window.devicePixelRatio * dpi_scale,
                        depth: data.map((d, i) => depth(d, i)),
                    });

                    //create subplot overlay
                    let overlay_ij = create_svg(plot_width, plot_height)
                        .attr("class", "overlay")
                        .style("position", "absolute")
                        .style("left", `${padding_left + j * plot_width}px`)
                        .style(
                            "top",
                            `${padding_top + (n_attrs - 1 - i) * plot_height}px`,
                        );
                    overlay_container.node().appendChild(overlay_ij.node());

                    // let { sx, sy } = sca.scales;
                    let plot = {};
                    plot.data = data;
                    plot.x = (d) => d[attrs[j]];
                    plot.y = (d) => d[attrs[i]];
                    plot.frame = frame;
                    plot.overlay = overlay_ij;

                    plot.scales = {
                        sx: frame.scales.sx,
                        sy: frame.scales.sy,
                        sc: scales.sc,
                        sx_gl,
                        sy_gl,
                        sc_gl,
                    };
                    plot.render = (data, {} = {}) => {
                        _render({
                            positions: data.map((d) => [
                                sx_gl(d[attrs[j]]),
                                sy_gl(d[attrs[i]]),
                            ]),
                            colors: data.map((d) => sc_gl(d)),
                            count: data.length,
                            size: data.map(
                                (d, i) =>
                                    s(d, i) *
                                    window.devicePixelRatio *
                                    dpi_scale,
                            ),
                            stroke: color2gl(stroke),
                            stroke_width:
                                stroke_width * window.devicePixelRatio,
                            depth: data.map((d, i) => depth(d, i)),
                        });
                    };

                    plot.recolor = (colors, {depths} = {}) => {
                        _render({
                            positions: data.map((d) => [
                                sx_gl(d[attrs[j]]),
                                sy_gl(d[attrs[i]]),
                            ]),
                            colors: colors,
                            count: data.length,
                            size: data.map(
                                (d, i) =>
                                    s(d, i) *
                                    window.devicePixelRatio *
                                    dpi_scale,
                            ),
                            stroke: color2gl(stroke),
                            stroke_width:
                                stroke_width * window.devicePixelRatio,
                            depth: depths || data.map((d, i) => depth(d, i)),
                        });
                    };

                    subplots[i][j] = plot;
                }
            }
        }
        return subplots;
    }

    //prepare return
    let return_node = container_div.node();
    return_node.data = data;
    return_node.subplots = draw_subplots();
    return_node.clear = () => {
        // regl._gl.clearColor(0, 0, 0, 1);
        regl.clear({
            color: [0, 0, 0, 0],
            depth: 1,
            stencil: 0,
        });
    };

    // the entire splom recolor
    return_node.recolor = (colors, {depths} = {}) => {
        return_node.clear();
        return_node.subplots.forEach((row, i) => {
            row.forEach((subplot, j) => {
                if (subplot !== undefined && i != j) {
                    subplot.recolor(colors, {depths: depths});
                }
            });
        });
    };

    return return_node;
}

export function overflow_box(nodes, height, width = undefined) {
    let wrapping_div = d3
        .create("div")
        .classed("overflow", true)
        .style("height", `${height}px`)
        .style("overflow", "auto")
        .style("scrollbar-width", "none"); ///* Firefox, hide scroll bar */

    if (width !== undefined) {
        wrapping_div.style("width", `${width}px`);
    }

    for (let node of nodes) {
        wrapping_div.node().appendChild(node);
    }
    return wrapping_div.node();
}

export function flexbox(items, width) {
    // wrap items in a div with flexbox properties
    let res = d3
        .create("div")
        .style("width", `${width}px`)
        .style("display", "inline-flex")
        .style("flex-direction", "row")
        .style("flex-wrap", "wrap");
    items.forEach((i) => {
        res.node().appendChild(i);
    });
    return res.node();
}

export function create_svg(width = 400, height = 300, bg = undefined) {
    let svg = d3.create("svg").attr("width", width).attr("height", height);
    if (bg) {
        svg.style("background", bg);
    }
    return svg;
}

export function scatter(
    sel = undefined,
    data = undefined,
    {
        xticks = 5,
        yticks = 5,
        background = "#eee",
        x_tickvalues = undefined,
        y_tickvalues = undefined,
        x = (d) => d.x,
        y = (d) => d.y,
        text = undefined, // text to be show along side markers (d)=>d.text
        scales = {},
        width = undefined,
        height = undefined,
        padding_bottom = 18,
        padding_left = 40,
        padding_right = 0,
        padding_top = 0,
        pad = 0.1,
        // crossfilter = undefined,
        // plots = [],
        s = (d, i) => 10, //marker size
        return_obj = "g",
        title = undefined,
        is_square_scale = false,
        is_log_scale = false,
        xlabel = undefined,
        ylabel = undefined,
        label_fontsize = 12,
        stroke = "#fff",
        stroke_width = 0.5,
        zoom = false,
        brush = false,
        brush_highlight = true,
        brush_listeners = {
            start: () => {},
            brush: (brushed_data) => {
                console.log("brushed_data", brushed_data);
            },
            end: () => {},
        },
    } = {},
) {
    if (sel === undefined) {
        width = width || 500;
        height = height || 500;
        sel = d3.create("svg").attr("width", width).attr("height", height);
    } else {
        width = width || sel.attr("width") || 500;
        height = height || sel.attr("height") || 500;
    }
    let res = sel;
    let sc = scales.sc || ((d, i) => C[0]);

    let main = sel.append("g").attr("class", "scatter");
    let bg = main.append("g").attr("class", "bg"); // g that draws frame (axes and ticks)
    let fg = main.append("g").attr("class", "fg"); // g that draws marks
    // let inter = main.append("g").attr("class", "interaction");

    //draw a frame
    bg.call(frame, data, {
        background,
        xticks,
        yticks,
        x_tickvalues,
        y_tickvalues,
        x,
        y,
        scales,
        width,
        height,
        padding_bottom,
        padding_left,
        padding_right,
        padding_top,
        pad,
        title,
        is_square_scale,
        is_log_scale,
        xlabel,
        ylabel,
        label_fontsize,
    });
    let {sx, sy} = bg.scales;

    //marks
    let r = (d, i) => Math.sqrt(s(d, i));
    console.log("x function", sx(x(0, 1)));
    let points = fg
        .selectAll(".point")
        .data(data, (d, i) => (d.id !== undefined ? d.id : i))
        .join("circle")
        .attr("class", "point")
        .attr("cx", (d, i) => sx(x(d, i)))
        .attr("cy", (d, i) => sy(y(d, i)))
        .attr("fill", (d, i) => sc(d, i))
        .attr("stroke-width", stroke_width)
        .attr("stroke", stroke)
        .attr("r", (d, i) => r(d, i));

    // Zoom
    let {ax, ay, gx, gy} = bg;
    if (zoom) {
        zoom = d3
            .zoom()
            .scaleExtent([0.3, 20])
            .on("zoom", function zoomed({transform}) {
                fg.attr("transform", transform);
                points
                    .attr("r", (d) => r(d) / Math.sqrt(transform.k))
                    .attr(
                        "stroke-width",
                        stroke_width / Math.sqrt(transform.k),
                    );
                gx.call(ax.scale(transform.rescaleX(sx)));
                gy.call(ay.scale(transform.rescaleY(sy)));

                sel.selectAll(".tick > line").style(
                    "stroke",
                    d3.color(background).brighter(),
                );
                sel.selectAll("path.domain").style("display", "none");
            });
        sel.call(zoom); //assuming sel is the svg;

        res.reset = function reset() {
            sel.transition()
                .duration(750)
                .call(zoom.transform, d3.zoomIdentity);
        };
    }

    // Brush
    if (brush) {
        let extent = [
            [padding_left, padding_top],
            [width - padding_right, height - padding_bottom],
        ];

        let cross = crossfilter(data);
        let dim_x = cross.dimension((d) => x(d));
        let dim_y = cross.dimension((d) => y(d));
        brush = d3
            .brush()
            .extent(extent)
            .on("start", () => {
                if (brush_listeners["start"]) {
                    brush_listeners["start"](res.brushed_data);
                }
            })
            .on("brush", ({selection}) => {
                //get brushed region
                let [bx0, bx1] = [selection[0][0], selection[1][0]];
                let [by0, by1] = [selection[0][1], selection[1][1]];
                //invert brush to data domain
                let [x0, x1] = [sx.invert(bx0), sx.invert(bx1)];
                let [y0, y1] = [sy.invert(by0), sy.invert(by1)];
                [y0, y1] = [Math.min(y0, y1), Math.max(y0, y1)];
                //filter
                dim_x.filter([x0, x1]);
                dim_y.filter([y0, y1]);
                //update selection
                let brushed_data = dim_x.bottom(Infinity);
                data.forEach((d) => {
                    d.brushed = false;
                });
                brushed_data.forEach((d) => {
                    d.brushed = true;
                });
                if (brush_highlight) {
                    res.update_style1("fill", (d, i) =>
                        d.brushed ? scales.sc(d, i) : "#aaa",
                    );
                }
                //save brushed_data to returned object (res)
                res.brushed_data = brushed_data;
                //call listener, if any
                if (brush_listeners["brush"]) {
                    brush_listeners["brush"](res.brushed_data);
                }
                // set_value(res, { brush: { selected: selected_data } });
            })
            .on("end", (e) => {
                if (e.selection === null) {
                    //brush cleared
                    res.update_style1("fill", (d, i) => scales.sc(d, i));
                    if (brush_listeners["end"]) {
                        brush_listeners["end"]([]);
                    }
                } else {
                    if (brush_listeners["end"]) {
                        brush_listeners["end"](res.brushed_data);
                    }
                }
            });
        main.append("g").attr("class", "brush").call(brush);
    }

    function update_style1(attr_name, attr_func) {
        points.attr(attr_name, attr_func);
    }

    function update_style(style) {
        points
            .attr("fill", (d, i) => style(d)["fill"])
            .attr("stroke", (d, i) => style(d)["stroke"] || stroke);
    }

    function update_position(data, {duration = 600, autoscale = true} = {}) {
        if (autoscale) {
            // TODO
        }
        points
            .data(data)
            .transition()
            .duration(duration)
            .attr("cx", (d) => sx(x(d)))
            .attr("cy", (d) => sy(y(d)));
    }

    //expose functions and attribute
    res.update_position = update_position;
    res.update_style = update_style;
    res.update_style1 = update_style1;
    res.scales = {sx, sy, sc};
    res.x = x;
    res.y = y;
    res.r = r;
    res.ax = bg.ax;
    res.ay = bg.ay;
    res.gx = bg.gx;
    res.gy = bg.gy;

    res.fg = fg;
    res.bg = bg;

    res.points = points;
    res.styles = {
        stroke_width,
        background,
        plot_width: width,
        plot_height: height,
        padding_left: padding_left,
        padding_right: padding_right,
        padding_top: padding_top,
        padding_bottom: padding_bottom,
    };
    return res;
}

export function frame(
    sel = undefined,
    data = undefined,
    {
        background = "#eee",
        xticks = 5,
        yticks = 5,
        x_tickvalues = undefined,
        y_tickvalues = undefined,
        x = (d) => d.x,
        y = (d) => d.y,
        scales = {},
        width = 200,
        height = 200,
        padding_bottom = 18,
        padding_left = 40,
        padding_right = 0,
        padding_top = 0,
        pad = 0.1,
        // crossfilter = undefined,
        // plots = [],
        s = (d) => 10, //marker size
        return_obj = "g",
        // brush = false,
        title = undefined,
        font_family = "sans-serif",
        font_size = 14,
        is_square_scale = false,
        is_log_scale = false,
        xlabel = undefined,
        ylabel = undefined,
        label_fontsize = 12,
        stroke = "#fff",
        stroke_width = 0.2,
    } = {},
) {
    if (sel === undefined) {
        sel = create_svg(width, height);
    }
    //domain / extent
    let ex = data !== undefined ? d3.extent(data, (d, i) => x(d, i)) : [0, 1];
    let ey = data !== undefined ? d3.extent(data, (d, i) => y(d, i)) : [0, 1];
    if (x_tickvalues !== undefined) {
        ex[0] = Math.min(ex[0], d3.min(x_tickvalues));
        ex[1] = Math.max(ex[1], d3.max(x_tickvalues));
    }
    if (y_tickvalues !== undefined) {
        ey[0] = Math.min(ey[0], d3.min(y_tickvalues));
        ey[1] = Math.max(ey[1], d3.max(y_tickvalues));
    }
    ex = [ex[0] - (ex[1] - ex[0]) * pad, ex[1] + (ex[1] - ex[0]) * pad];
    ey = [ey[0] - (ey[1] - ey[0]) * pad, ey[1] + (ey[1] - ey[0]) * pad];
    //range
    let rx = [padding_left, width - padding_right];
    let ry = [height - padding_bottom, padding_top];
    let sx, sy;
    if (is_square_scale) {
        let [sx0, sy0] = square_scale(ex, ey, rx, ry);
        sx = scales.sx || sx0;
        sy = scales.sy || sy0;
    } else {
        sx = is_log_scale ? d3.scaleLog() : d3.scaleLinear();
        sy = is_log_scale ? d3.scaleLog() : d3.scaleLinear();
        sx = scales.sx || sx.domain(ex).range(rx);
        sy = scales.sy || sy.domain(ey).range(ry);
    }

    let main = sel.append("g").attr("class", "frame");
    //bg
    main.selectAll(".bg-rect")
        .data([0])
        .join("rect")
        .attr("class", "bg-rect")
        .attr("x", padding_left)
        .attr("y", padding_top)
        .attr("width", width - padding_left - padding_right)
        .attr("height", height - padding_top - padding_bottom)
        .attr("fill", background);
    let g_axes = main.append("g").attr("class", "axes");
    let g_labels = main.append("g").attr("class", "labels");

    // Axes
    let ax = d3
        .axisBottom(sx)
        .ticks(xticks)
        .tickSizeInner(-(height - padding_bottom - padding_top));
    if (x_tickvalues !== undefined) {
        ax.tickValues(x_tickvalues);
    }
    let gx = g_axes
        .append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${height - padding_bottom})`)
        .call(ax);
    let ay = d3
        .axisLeft(sy)
        .ticks(yticks)
        .tickSizeInner(-(width - padding_left - padding_right));
    if (y_tickvalues !== undefined) {
        ay.tickValues(y_tickvalues);
    }
    let gy = g_axes
        .append("g")
        .attr("class", "y-axis")
        .attr("transform", `translate(${padding_left},0)`)
        .call(ay);

    //TODO not good practice, polluted other views
    // sel.append("style").node().innerHTML = `
    //     .tick > line{
    //       stroke: ${d3.color(background).brighter()};
    //     }
    //     path.domain{
    //       display: none;
    //     }
    //   `;
    sel.selectAll(".tick > line").style(
        "stroke",
        stroke || d3.color(background).brighter(),
    );
    sel.selectAll("path.domain").style("display", "none");

    // g_axes.selectAll(".tick > line").attr("stroke", d3.color(background).brighter());
    // g_axes.selectAll("path.domain").attr("display", "none");

    if (title) {
        g_labels
            .selectAll(".title")
            .data([title])
            .join("text")
            .attr("class", "title")
            .attr(
                "transform",
                `translate(${
                    padding_left + (width - padding_right - padding_left) / 2
                },${padding_top - font_size / 2})`,
            )
            .attr("alignment-baseline", "top")
            .attr("text-anchor", "middle")
            .style("font-size", `${font_size}px`)
            .style("font-family", font_family)
            .text((d) => d);
    }

    if (xlabel !== undefined) {
        g_labels
            .selectAll(".xlabel")
            .data([xlabel])
            .join("text")
            .attr("class", "xlabel")
            .attr(
                "transform",
                `translate(${d3.mean(sx.range())},${height - padding_bottom - 2})`,
            )
            // .attr("alignment-baseline", "top")
            .attr("text-anchor", "middle")
            .attr("fill", "#666")
            .style("font-size", `${label_fontsize}px`)
            .text((d) => d);
    }
    if (ylabel !== undefined) {
        g_labels
            .selectAll(".ylabel")
            .data([ylabel])
            .join("text")
            .attr("class", "ylabel")
            .attr(
                "transform",
                `translate(${padding_left + 2},${d3.mean(sy.range())}) rotate(90)`,
            )
            .attr("alignment-baseline", "bottom")
            .attr("text-anchor", "middle")
            .attr("fill", "#666")
            .style("font-size", `${label_fontsize}px`)
            .text((d) => d);
    }

    let res = sel;
    res.scales = {sx, sy};
    res.x = x;
    res.y = y;
    res.ax = ax;
    res.ay = ay;
    res.gx = gx;
    res.gy = gy;

    res.styles = {
        plot_width: width,
        plot_height: height,
        padding_left: padding_left,
        padding_right: padding_right,
        padding_top: padding_top,
        padding_bottom: padding_bottom,
    };
    return res;
}

export function square_scale(x_extent, y_extent, width_extent, height_extent) {
    //centers
    let cx = (x_extent[0] + x_extent[1]) / 2;
    let cy = (y_extent[0] + y_extent[1]) / 2;
    let cw = (width_extent[0] + width_extent[1]) / 2;
    let ch = (height_extent[0] + height_extent[1]) / 2;

    //radii/range
    let rx = (x_extent[1] - x_extent[0]) / 2;
    let ry = (y_extent[1] - y_extent[0]) / 2;
    let rw = (width_extent[1] - width_extent[0]) / 2;
    let rh = (height_extent[1] - height_extent[0]) / 2;
    let sx, sy;
    if (Math.abs(rw / rh) > rx / ry) {
        sy = d3
            .scaleLinear()
            .domain([cy - ry, cy + ry])
            .range([ch - rh, ch + rh]);
        sx = d3
            .scaleLinear()
            .domain([cx - ry, cx + ry])
            .range([
                cw - Math.abs(rh) * Math.sign(rw),
                cw + Math.abs(rh) * Math.sign(rw),
            ]);
    } else {
        sx = d3
            .scaleLinear()
            .domain([cx - rx, cx + rx])
            .range([cw - rw, cw + rw]);
        sy = d3
            .scaleLinear()
            .domain([cy - rx, cy + rx])
            .range([
                ch - Math.abs(rw) * Math.sign(rh),
                ch + Math.abs(rw) * Math.sign(rh),
            ]);
    }
    return [sx, sy];
}
