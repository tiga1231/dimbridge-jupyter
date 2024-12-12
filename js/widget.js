// third party
import * as d3 from "d3";
import numeric from "https://cdn.skypack.dev/numeric@1.2.6?min";
import math from "./lib/math.js";

import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// custom
import {DataExtentPredicate} from "./predicate_engine/DataExtentPredicate.js";
import {PredicateRegression} from "./predicate_engine/PredicateRegression.js";

import ProjectionView from "./views/ProjectionView.js";
import PredicateView from "./views/PredicateView.js";
import SplomView from "./views/SplomView.js";
import ImageView from "./views/ImageView.js";

import {InteractionController} from "./controller.js";

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
    normalize,
} from "./lib.js";
// import "./widget.css";

let config;

// widget
function initialize({model}) {
    console.log("DimBridge init");
    //set the dimbridge width to be Jupyter notebook cell width
    // let cell = d3.select(".jp-OutputArea-output");
    //
    //jupyterlab 3.0.0
    let cell, cell_width;
    cell = d3.selectAll(".jp-Cell-outputWrapper");
    cell_width = parseFloat(cell.style("width"));
    if (isNaN(cell_width)) {
        //jupyterlab 4.*
        cell = d3.select(".jp-WindowedPanel-viewport");
        if (cell._groups[0] !== null) {
            cell_width = cell.node().getBoundingClientRect().width;
        } else {
            cell_width = 1000;
        }
    }
    console.log("cell_width", cell_width);

    let ui_width = cell_width - 120;

    // layout config
    config = {
        //between-view configs
        margin_outer: 10,
        margin_inner: 4,
        font_size: 16,
        gap: 10,

        //projection view
        scatter_padding: 14,
        scatter_width: 0.4,
        scatter_height: 0.4,

        //predicate view
        predicate_view_subplot_height: 50,
        predicate_view_fontsize: 12,

        splom_spacing: 4,
        splom_font_size: 12,
        width: ui_width, //leave some space for shadow
        cell_width: cell_width,
        xticks: model.get("xticks"),
        yticks: model.get("yticks"),
        splom_mark_size: model.get("splom_s"),

        // image view
        image_view_width: ui_width,
        n_cols: 12,
        n_rows: 2,
        border_width: 4,
        padding: 4,
    };
    console.log("Widget Config:", config);
}

function cleanup() {
    // Optional. Cleanup callback.
    // Executed any time the view is removed from the DOM
}

//WIP
function generatePDF(element, {width = 400, height = 400} = {}) {
    html2canvas(element).then((canvas) => {
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF("l", "px", [width, height]);
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
        pdf.save("download.pdf");
    });
}

function render({model, el}) {
    let width = config.cell_width;
    console.log("DimBridge render", model, el);

    //get data from python
    let data = pandas2array(model.get("data"));
    let attributes = Object.keys(data[0]);
    let x = numpy2array(model.get("x"));
    let y = numpy2array(model.get("y"));
    let c = numpy2array(model.get("c")); //mark color, array of 3-tuples [r,g,b], or array of numbers
    let s = model.get("s"); //mark size, array of numbers
    let image_urls = model.get("image_urls");

    let splom_attributes = model.get("splom_attributes");

    //augment data object
    data.forEach((d, i) => {
        d.x = x[i];
        d.y = y[i];
        d.index = i;
    });

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
            : new PredicateRegression(data, attributes, model);

    //init controller
    let controller = new InteractionController(
        data,
        image_urls,
        predicate_mode,
    );

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
    let splom_view = new SplomView(
        data,
        splom_attributes,
        model,
        controller,
        config,
    );
    let image_view = image_urls.length > 0 ? new ImageView(config) : undefined;

    // tell controller to manage between-view interactions
    controller.add_views(
        projection_view,
        predicate_view,
        splom_view,
        image_view,
    );

    // add margins between view components
    d3.select(projection_view.node).style("margin-right", `${config.gap}px`);
    d3.select(predicate_view.node).style("margin-right", `${config.gap}px`);

    // return main view
    let views;
    if (image_view !== undefined) {
        d3.select(image_view.node).style("margin-top", `${config.gap}px`);
        views = [
            projection_view.node,
            predicate_view.node,
            splom_view.node,
            image_view.node,
        ];
    } else {
        views = [projection_view.node, predicate_view.node, splom_view.node];
    }
    let return_node = flexbox(views, width);
    d3.select(return_node).style("padding", "8px"); // give some space for shadow effects
    el.appendChild(return_node);

    // let export_button = d3.create("button").text("export");
    // export_button.on("click", () => {
    //     generatePDF(el);
    // });
    // el.appendChild(export_button.node());

    //model.on("change:x", function () {
    //    console.log(arguments);
    //    // callback of x value change
    //    let new_x = model.get("x");
    //    data.forEach((d, i) => (d[0] = new_x[i]));
    //    sca.update_position(data);
    //});
    // model.on("msg:custom", (msg) => {
    //     // custom message handling from python's
    //     // widget.send({ "type": "my-event", "foo": "bar" })
    //     console.log("custom msg", msg);
    // });
    // return cleanup;
    return;
}

export default {
    initialize,
    config,
    cleanup,
    render,
}; // end of export defalt
