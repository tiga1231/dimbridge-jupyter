import * as d3 from "d3";
import {subsample} from "./views/view-utils.js";

function same_key(a, b) {
    return same_set(new Set(Object.keys(a)), new Set(Object.keys(b)));
}

function same_set(xs, ys) {
    return xs.size === ys.size && [...xs].every((x) => ys.has(x));
}

export class InteractionController {
    //fields
    projection_view;
    predicate_view;
    splom_view;
    predicates_prev;

    constructor(data, image_urls, predicate_mode) {
        this.data = data;
        this.image_urls = image_urls;
        this.predicates_prev = undefined;
        this.predicate_mode = predicate_mode;
        return this;
    }

    add_views(projection_view, predicate_view, splom_view, image_view) {
        this.projection_view = projection_view;
        this.predicate_view = predicate_view;
        this.splom_view = splom_view;
        this.image_view = image_view;
    }

    on_predicate_view_brushed(predicates, data_size = 1000) {
        let splom_attributes = Object.keys(predicates[0]);
    }

    on_projection_view_brush_start() {
        this.splom_view.hide_arrows();
    }

    on_projection_view_change(predicates, data_size = 1000) {
        //get projection view brush-selected data
        //start predicate computation
        //update predicate view
        this.predicate_view.draw(predicates);

        if (this.image_view !== undefined) {
            // let brushed_data = this.projection_view.brush_cf.allFiltered();
            let images = [];
            let n_brushes = predicates.length;
            let sample_brushes = subsample(d3.range(n_brushes), 6);
            for (let brush_index of sample_brushes) {
                let brushed_data = this.data.filter(
                    (d) => d.brushed[brush_index],
                );
                images.push(brushed_data.map((d) => this.image_urls[d.index]));
            }
            console.log(predicates);
            console.log("images", images);
            this.image_view.draw(images);
        }

        //update splom view
        // if (data_size < 100000) {
        if (true) {
            let splom_attributes;
            if (this.predicate_mode === "predicate regression") {
                // let subplot_limit = 6;
                splom_attributes = Object.keys(predicates[0]); //.slice(0, subplot_limit);
            } else if (this.predicate_mode === "data extent") {
                splom_attributes = this.splom_view.splom_attributes;
            }

            if (
                this.predicates_prev !== undefined &&
                !same_set(
                    new Set(this.predicates_prev),
                    new Set(splom_attributes),
                )
            ) {
                // force redraw SPLOM if predicates are different
                // this will remove and redraw SPLOM
                this.splom_view.splom_obj = undefined;
                this.splom_view.draw(splom_attributes, predicates);
            } else {
                // this will only recolor the current SPLOM
                this.splom_view.draw(splom_attributes, predicates);
            }
            this.predicates_prev = splom_attributes;
        }
    }

    on_predicate_view_change(data) {
        //update projection view
        crossfilter_dimensions["x"].filterAll();
        crossfilter_dimensions["y"].filterAll();
        update_point_style(this.projection_view.sca, "selection");
    }

    on_splom_view_change() {}
}
