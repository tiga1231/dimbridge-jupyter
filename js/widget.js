// third party
import * as d3 from "https://esm.sh/d3@7";
import numeric from "https://cdn.skypack.dev/numeric@1.2.6?min";
import math from "./lib/math.js";

// custom
import "./widget.css";
import * as lib from "./lib.js";
import { C, reshape, create_svg, linspace, zip, flexbox } from "./lib.js";
import { ProjectionView, PredicateView, SplomView } from "./views.js";
import { InteractionController } from "./controller.js";

// ----------- View Components ------------
// --------------- Widget -----------------

let cell_width;

// layout config
let config = {
    margin_outer: 10,
    margin_inner: 4,
    scatter_padding: 2,
    font_size: 16,
    gap: 10,
};

export default {
    initialize({ model }) {
        console.log("init");
        console.log("output width");
        cell_width = d3.select(".jp-OutputArea-output").style("width");
    },

    cleanup() {
        // Optional. Cleanup callback.
        // Executed any time the view is removed from the DOM
    },

    render({ model, el }) {
        let width = cell_width;
        console.log("MODEL", model);
        console.log("EL", el);
        let controller = new InteractionController();
        let projection_view = new ProjectionView(controller);
        let predicate_view = new PredicateView(controller);
        let splom_view = new SplomView(projection_view, controller);
        // let controller manage between-view interactions
        controller.add_views(projection_view, predicate_view, splom_view);

        //add margins between view components
        d3.select(projection_view.node).style(
            "margin-right",
            `${config.gap}px`,
        );
        d3.select(predicate_view.node).style("margin-right", `${config.gap}px`);
        //return main view
        let return_node = flexbox(
            [projection_view.node, predicate_view.node, splom_view.node],
            width,
        );
        // set_value(return_node, { projection_view, predicate_view, splom_view });

        return cleanup;

        //// get plot data
        //let x = lib.numpy2array(model.get("x"));
        //let y = lib.numpy2array(model.get("y"));
        //let c = lib.numpy2array(model.get("c")); // color
        //let s = lib.numpy2array(model.get("s")); // mark size

        //// style data
        //let width = model.get("width");
        //let height = model.get("height");
        //let xticks = model.get("xticks");
        //let yticks = model.get("yticks");
        //let xlabel = model.get("xlabel");
        //let ylabel = model.get("ylabel");
        //let title = model.get("title");
        //let square_scale = model.get("square_scale");

        //// append DOM
        //let svg = create_svg(width, height);
        //el.appendChild(svg.node());

        //let scatter_data = d3
        //    .range(x.length)
        //    .map((i) => ({ index: i, x: x[i], y: y[i], c: c[i] }));

        ////color scale
        //let sc;
        //if (model.get("c").dtype.includes("int")) {
        //    //discrete color scale
        //    sc = (d, i) => C[c[i]];
        //} else {
        //    //continuous color scale
        //    let vmin = math.min(c);
        //    let vmax = math.max(c);
        //    let vdiff = vmax - vmin;
        //    sc = (d, i) => d3.interpolateViridis((d.c - vmin) / vdiff);
        //}

        //// draw
        //let sca = lib.scatter(svg, scatter_data, {
        //    x: (d) => d.x,
        //    y: (d) => d.y,
        //    label_fontsize: 14,
        //    padding_top: 14 * 2,
        //    title: title,
        //    xlabel: xlabel,
        //    ylabel: ylabel,
        //    width: width,
        //    height: height,
        //    s: (d, i) => s[i],

        //    xticks: xticks,
        //    yticks: yticks,
        //    // x_tickvalues: linspace(0, 1, 4),

        //    scales: { sc: sc },
        //    is_square_scale: square_scale,
        //    brush: true,
        //    brush_highlight: true,
        //    brush_listeners: {
        //        brush: (brushed_data1) => {},
        //        end: (brushed_data1) => {
        //            console.log("brush end", brushed_data1);
        //            //update selection attr
        //            model.set(
        //                "selected",
        //                brushed_data1.map((d) => d.index),
        //            );
        //            model.set("new_value", 13);
        //            model.save_changes();
        //        },
        //    },
        //});

        //model.on("change:x", function () {
        //    console.log(arguments);

        //    // callback of x value change
        //    let new_x = model.get("x");
        //    data.forEach((d, i) => (d[0] = new_x[i]));
        //    sca.update_position(data);
        //});

        //model.on("msg:custom", (msg) => {
        //    // custom message handling from python's
        //    console.log("custom msg", msg);
        //    // widget.send({ "type": "my-event", "foo": "bar" })
        //});
    },
}; // end of export defailt
