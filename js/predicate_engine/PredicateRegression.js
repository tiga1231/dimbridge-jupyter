import * as d3 from "d3";

import {zip} from "../lib.js";
import {subsample, get_selected} from "../views/view-utils.js";
import {default as crossfilter} from "https://cdn.skypack.dev/crossfilter2@1.5.4?min";

import {
    // C,
    // reshape,
    // create_svg,
    // linspace,
    // zip,
    // flexbox,
    // numpy2array,
    // pandas2array,
    // hex2rgb,
    fetch_json,
} from "../lib.js";

// function data_extent_predicate(data, selected, attributes) {}
export class PredicateRegression {
    //From brush data, produce predicates derived base on data extent only.
    //Front end only. No backend server
    constructor(data, attributes, model) {
        console.log("PredicateRegression init");

        this.model = model;
        this.mode = "predicate regression";
        this.data = data;
        this.attributes = attributes;
        this.extent = Object.fromEntries(
            attributes.map((attr) => [
                attr,
                d3.extent(this.data, (d) => d[attr]),
            ]),
        );

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

    async compute_predicates(brush_history) {
        ////dummy
        //return brush_history.map((b) => {
        //    let dummy_predicate = this.attributes.map((k) => [k, [0, 1e-4]]);
        //    dummy_predicate = Object.fromEntries(dummy_predicate);
        //    return dummy_predicate;
        //});

        let dataset_name = this.model.get("dataset_name");
        let predicate_host = this.model.get("predicate_host");

        let response = await fetch_json(`${predicate_host}/get_predicates`, {
            body: {
                subsets: brush_history.map((brush_data) => {
                    let selected = get_selected(
                        this.data,
                        brush_data,
                        this.cf,
                        this.dim_x,
                        this.dim_y,
                    );
                    return selected;
                }),
                dataset: dataset_name,
            },
        });

        // let qualities = response.qualities;
        //find union of predicate attributes in response.predicates
        let attributes_union = d3
            .groups(response.predicates.flat(), (d) => d.attribute)
            .map((d) => d[0]);

        // set predicates to be an array of {attr_name:interval}
        // objects, indexed by brush time
        let predicates = response.predicates.map((predicate_t) => {
            let key_value_pairs = predicate_t.map((p) => [
                p.attribute,
                p.interval,
            ]);
            let predicate = Object.fromEntries(key_value_pairs);
            for (let attr of attributes_union) {
                if (predicate[attr] === undefined) {
                    console.log("attr", this.extent, this.extent[attr]);
                    predicate[attr] = this.extent[attr];
                }
            }
            return predicate;
        });
        return predicates;
        // return d3.range(brush_data.length).map((_) => ({x: [1, 2]}));
    }
}
