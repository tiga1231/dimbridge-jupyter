// third party
import * as d3 from "d3";
import numeric from "https://cdn.skypack.dev/numeric@1.2.6?min";
import math from "./lib/math.js";
import {DataExtentPredicate} from "./predicate_engine/DataExtentPredicate.js";
import {PredicateRegression} from "./predicate_engine/PredicateRegression.js";

// custom
// import "./widget.css";
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
    hex2rgb,
} from "./lib.js";

import ProjectionView from "./views/ProjectionView.js";
import PredicateView from "./views/PredicateView.js";
import SplomView from "./views/SplomView.js";
import {InteractionController} from "./controller.js";

let cell_width;

// layout config
let config = {
    //between-view configs
    margin_outer: 10,
    margin_inner: 4,
    font_size: 16,
    gap: 10,

    //projection view
    scatter_padding: 1,
    scatter_width: 0.4,
    scatter_height: 0.4,

    //predicate view
    predicate_view_subplot_height: 20,
    predicate_view_fontsize: 14,
};

// widget
function initialize({model}) {
    console.log("DimBridge init");
    //set the dimbridge width to be Jupyter notebook cell width
    let cell = d3.selectAll(".jp-OutputArea-output");
    let cell_width = parseFloat(cell.style("width")) || 1000;

    //other configs from python side
    config = {
        ...config,
        width: cell_width - 18, //leave some space for shadow
        xticks: model.get("xticks"),
        yticks: model.get("yticks"),
        splom_mark_size: model.get("splom_mark_size"),
    };
    console.log("Widget Config:", config);
}

function cleanup() {
    // Optional. Cleanup callback.
    // Executed any time the view is removed from the DOM
}

function render({model, el}) {
    let width = cell_width;
    console.log("DimBridge render", model, el);

    //get data from python
    let data = pandas2array(model.get("data"));
    let attributes = Object.keys(data[0]);
    let x = numpy2array(model.get("x"));
    let y = numpy2array(model.get("y"));

    //augment data object
    data.forEach((d, i) => {
        d.x = x[i];
        d.y = y[i];
        d.index = i;
    });

    let s = numpy2array(model.get("s")); //mark size, array of numbers
    let c = numpy2array(model.get("c")); //mark color, array of 3-tuples [r,g,b], or array of numbers

    if (typeof c[0] === "number") {
        //if c is 1-d array, convert scalar values in c to 3-tuple rgb
        let cmap = model.get("cmap");
        let [vmin, vmax] = d3.extent(c);
        if (cmap === "viridis") {
            cmap = (x) => d3.interpolateViridis(normalize(x, vmin, vmax));
        } else if (cmap === "set10") {
            cmap = (i) => d3.schemeCategory10[i];
        }
        c = c.map((d) => {
            return hex2rgb(cmap(d));
        });
    }

    let predicate_mode = model.get("predicate_mode"); // 'data extent' or 'predicate regression'
    let brush_mode = model.get("brush_mode"); // 'single', 'contrastive' or 'curve'

    // predicate
    let predicate_engine =
        predicate_mode === "data extent"
            ? new DataExtentPredicate(data, attributes)
            : new PredicateRegression(data, attributes);

    //init controller
    let controller = new InteractionController();

    //init views
    let projection_view = new ProjectionView(
        data,
        {x, y, s, c, brush_mode, predicate_engine},
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
    d3.select(projection_view.node).style("margin-right", `${config.gap}px`);
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
}

export default {
    initialize,
    config,
    cleanup,
    render,
}; // end of export defalt
