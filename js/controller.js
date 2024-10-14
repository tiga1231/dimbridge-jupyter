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

    constructor(data, x, y, image_urls) {
        this.data = data;
        this.x = x;
        this.y = y;
        this.image_urls = image_urls;
        this.predicates_prev = undefined;
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
            let skip = Math.max(1, Math.floor(this.data[0].brushed.length / 6));
            for (let i = 0; i < this.data[0].brushed.length; i += skip) {
                let brushed_data = this.data.filter((d) => d.brushed[i]);
                images.push(brushed_data.map((d) => this.image_urls[d.index]));
            }
            this.image_view.draw(images);
        }

        //update splom view
        if (data_size < 100000) {
            let splom_attributes;
            if (this.predicate_mode === "predicate regression") {
                // let subplot_limit = 6;
                splom_attributes = Object.keys(predicates[0]); //.slice(0, subplot_limit);
            } else if (this.predicate_mode === "data extent") {
                splom_attributes = this.splom_view.splom_attributes;
            }

            if (
                this.predicates_prev !== undefined &&
                !same_key(this.predicates_prev[0], predicates[0])
            ) {
                // force redraw SPLOM if predicates are different
                // this will remove and redraw SPLOM
                this.splom_view.splom_obj = undefined;
                this.splom_view.draw(splom_attributes, predicates, "brush");
            } else {
                // this will only recolor the current SPLOM
                this.splom_view.draw(splom_attributes, predicates, "brush");
            }
        }
        this.predicates_prev = predicates;
    }

    on_predicate_view_change(data) {
        console.log("predicate view changed");

        //update projection view
        crossfilter_dimensions["x"].filterAll();
        crossfilter_dimensions["y"].filterAll();
        update_point_style(this.projection_view.sca, "selection");
    }

    on_splom_view_change() {}
}
