// third party
import * as d3 from "d3";
import numeric from "https://cdn.skypack.dev/numeric@1.2.6?min";
import math from "./lib/math.js";
import {DataExtentPredicate} from "./DataExtentPredicate.js";

// custom
import "./widget.css";
import * as lib from "./lib.js";
import {
    C,
    reshape,
    create_svg,
    linspace,
    zip,
    flexbox,
    numpy2array,
    pandas2array,
} from "./lib.js";

import ProjectionView from "./views/ProjectionView.js";
import PredicateView from "./views/PredicateView.js";
import SplomView from "./views/SplomView.js";
import {InteractionController} from "./controller.js";

// ----------- View Components ------------
// --------------- Widget -----------------

let cell_width;

// layout config
let config = {
    margin_outer: 10,
    margin_inner: 4,
    font_size: 16,
    gap: 10,

    width: 900,
    scatter_padding: 1,
    scatter_width: 0.4,
    scatter_height: 0.4,

    predicate_view_subplot_height: 20,
    predicate_view_fontsize: 14,

    splom_mark_size: 2,
};

// widget
function cleanup() {
    // Optional. Cleanup callback.
    // Executed any time the view is removed from the DOM
}

export default {
    initialize({model}) {
        console.log("DimBridge widget init");
        let cell = d3.selectAll(".jp-OutputArea-output");
        let cell_width = parseFloat(cell.style("width")) || 1000;
        console.log("Jupyter output cell width", cell_width);
        //set the dimbridge width to be Jupyter notebook cell width
        config.width = cell_width - 18; //leave some space for shadow
    },

    render({model, el}) {
        let width = cell_width;
        console.log("MODEL", model);
        console.log("EL", el);

        //get data from python
        let data = pandas2array(model.get("data"));
        let attributes = Object.keys(data[0]);
        let x = numpy2array(model.get("x"));
        let y = numpy2array(model.get("y"));
        let s = numpy2array(model.get("s"));
        let c = numpy2array(model.get("c"));

        data.forEach((d, i) => {
            d.x = x[i];
            d.y = y[i];
        });

        // predicate
        let predicate_mode = "data extent"; // 'predicate regression'
        let predicate_engine =
            predicate_mode === "data extent"
                ? new DataExtentPredicate(data, attributes)
                : new DataExtentPredicate(data, attributes); // TODO

        //init controller
        let controller = new InteractionController(predicate_engine);

        //init views
        let projection_view = new ProjectionView(
            data,
            {x, y, s, c},
            model,
            controller,
            config,
        );
        let predicate_view = new PredicateView(data, model, controller, config);
        // let splom_view = {node: create_svg().node(), draw: () => {}}; //dummy view
        let splom_view = new SplomView(data, model, controller, config);

        // tell controller to manage between-view interactions
        controller.add_views(projection_view, predicate_view, splom_view);

        // add margins between view components
        d3.select(projection_view.node).style(
            "margin-right",
            `${config.gap}px`,
        );
        d3.select(predicate_view.node).style("margin-right", `${config.gap}px`);

        // return main view
        let return_node = flexbox(
            [
                projection_view.node,
                predicate_view.node,
                splom_view.node, //
            ],
            width,
        );
        d3.select(return_node).style("padding", "8px"); // give some space for shadow effects

        el.appendChild(return_node);
        return cleanup;

        //// get plot data
        //let c = numpy2array(model.get("c")); // color
        //let s = numpy2array(model.get("s")); // mark size

        //// style data
        //let width = model.get("width");
        //let height = model.get("height");
        //let xticks = model.get("xticks");
        //let yticks = model.get("yticks");
        //let xlabel = model.get("xlabel");
        //let ylabel = model.get("ylabel");
        //let title = model.get("title");
        //let square_scale = model.get("square_scale");

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
}; // end of export defalt
