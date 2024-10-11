import * as d3 from "d3";

import {zip} from "../lib.js";
import {subsample} from "../views/view-utils.js";
import {default as crossfilter} from "https://cdn.skypack.dev/crossfilter2@1.5.4?min";

// function data_extent_predicate(data, selected, attributes) {}
export class DataExtentPredicate {
    //From brush data, produce predicates derived base on data extent only.
    //Front end only. No backend server
    constructor(data, attributes) {
        console.log("DataExtentPredicate init");

        this.mode = "data extent";
        this.data = data;
        this.attributes = attributes;

        this.cf = crossfilter(data);
        this.dimensions = Object.fromEntries(
            attributes.map((a) => {
                return [a, this.cf.dimension((d) => d[a])];
            }),
        );
        this.dim_x = this.cf.dimension((d) => d.x);
        this.dim_y = this.cf.dimension((d) => d.y);
    }

    compute_predicates(brush_history) {
        return brush_history.map((b) => {
            let {x_extent, y_extent} = b;
            let [x0, x1] = x_extent;
            let [y0, y1] = y_extent;
            this.dim_x.filter([x0, x1]);
            this.dim_y.filter([y0, y1]);
            if (this.dim_x.top(1).length === 0) {
                let dummy_predicate = Object.fromEntries(
                    this.attributes.map((k) => [k, [0, 1e-4]]),
                );
                return dummy_predicate;
            } else {
                let intervals = this.attributes.map((attr) => {
                    let dim = this.dimensions[attr];
                    return [dim.bottom(1)[0][attr], dim.top(1)[0][attr]];
                });
                return Object.fromEntries(zip(this.attributes, intervals));
            }
        });
    }
}
