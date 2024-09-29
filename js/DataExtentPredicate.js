import * as d3 from "d3";

import {zip} from "./lib.js";
import {subsample} from "./views/view-utils.js";
import {default as crossfilter} from "https://cdn.skypack.dev/crossfilter2@1.5.4?min";

function get_selected(brush_data, cf, dim_x, dim_y) {
    //return list of boolean based on brush selection
    // x, y are coordinate getter functions for points in data
    let {x_extent, y_extent} = brush_data;
    let [x0, x1] = x_extent;
    let [y0, y1] = y_extent;
    dim_x.filter([x0, x1]);
    dim_y.filter([y0, y1]);
    return cf.filterAll();
}

// function data_extent_predicate(data, selected, attributes) {}
export class DataExtentPredicate {
    //From brush data, produce predicates derived base on data extent only.
    //Front end only. No backend server
    constructor(data, attributes) {
        console.log("DataExtentPredicate init");

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

    compute_predicates(brush_data) {
        let {x_extent, y_extent} = brush_data;
        let [x0, x1] = x_extent;
        let [y0, y1] = y_extent;
        this.dim_x.filter([x0, x1]);
        this.dim_y.filter([y0, y1]);

        if (this.dim_x.top(1).length === 0) {
            return {};
        } else {
            let intervals = this.attributes.map((attr) => {
                let dim = this.dimensions[attr];
                return [dim.bottom(1)[0][attr], dim.top(1)[0][attr]];
            });
            return Object.fromEntries(zip(this.attributes, intervals));
        }
    }
}

export async function compute_predicates(
    data,
    full_brush_history,
    n_boxes,
    predicate_mode,
    manual_attributes = ["d1", "d2", "d3", "d4"],
    {x, y} = {},
) {
    full_brush_history = full_brush_history.filter((brush_data) => {
        //filter and consider non-empty brushes only
        let selected = get_selected(data, brush_data, {x, y});
        return d3.sum(selected) > 0;
    });
    if (full_brush_history.length === 0) {
        return [{}];
    }
    let sample_brush_history = subsample(full_brush_history, n_boxes);

    if (predicate_mode === "data extent") {
        //data extent as predicate
        let attributes = manual_attributes;
        // let selected_data = data.filter((d, i) => selected[i]);
        let predicates = sample_brush_history.map((brush_data) => {
            let selected = get_selected(data, brush_data, {x, y});
            return data_extent_predicate(data, selected, attributes);
        });
        return {predicates, attributes};
    } else {
        // "predicate regression"
        let response = await fetch_json(`${predicate_host}/get_predicates`, {
            //query server
            body: {
                subsets: sample_brush_history.map((brush_data) => {
                    return get_selected(data, brush_data, {x, y});
                }),
                dataset: dataset_name,
            },
        });
        let qualities = response.qualities;
        //find union of predicate attributes in response.predicates
        let attributes = d3
            .groups(response.predicates.flat(), (d) => d.attribute)
            .map((d) => d[0]);
        //set predicates to be an array of {attr_name:interval} dictionaries indexed by brush time
        let predicates = response.predicates.map((predicate_t) => {
            let key_value_pairs = predicate_t.map((p) => [
                p.attribute,
                p.interval,
            ]);
            return Object.fromEntries(key_value_pairs);
        });
        return {predicates, qualities, attributes};
    }
}
