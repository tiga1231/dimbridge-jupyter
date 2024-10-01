import * as d3 from "d3";

import {zip} from "../lib.js";
import {subsample} from "../views/view-utils.js";
import {default as crossfilter} from "https://cdn.skypack.dev/crossfilter2@1.5.4?min";

//function get_selected(brush_data, cf, dim_x, dim_y) {
//    //return list of boolean based on brush selection
//    // x, y are coordinate getter functions for points in data
//    let {x_extent, y_extent} = brush_data;
//    dim_x.filter(x_extent);
//    dim_y.filter(y_extent);
//    return cf.filterAll();
//}

// function data_extent_predicate(data, selected, attributes) {}
export class PredicateRegression {
    //From brush data, produce predicates derived base on data extent only.
    //Front end only. No backend server
    constructor(data, attributes) {
        console.log("DataExtentPredicate init");

        this.mode = "predicate regression";
        this.data = data;
        this.attributes = attributes;

        //init crossfilter
        this.cf = crossfilter(data);
        this.dimensions = Object.fromEntries(
            attributes.map((a) => {
                return [a, this.cf.dimension((d) => d[a])];
            }),
        );
        this.dim_x = this.cf.dimension((d) => d.x);
        this.dim_y = this.cf.dimension((d) => d.y);
    }

    async compute_predicates(brush_data) {
        //dummy
        return {a: [1, 2]};
    }
}
