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

    constructor() {
        this.predicates_prev = undefined;

        return this;
    }

    add_views(projection_view, predicate_view, splom_view) {
        this.projection_view = projection_view;
        this.predicate_view = predicate_view;
        this.splom_view = splom_view;
    }

    on_projection_view_brush_start() {
        this.splom_view.hide_arrows();
    }

    on_predicate_view_brushed(predicates, data_size = 1000) {
        let splom_attributes = Object.keys(predicates[0]);
    }

    on_projection_view_change(predicates, data_size = 1000) {
        //get projection view brush-selected data
        //start predicate computation
        //update predicate view
        this.predicate_view.draw(predicates);

        //update splom view
        if (data_size < 100000) {
            let predicate_attributes = Object.keys(predicates[0]);
            let subplot_limit = 7;
            let splom_attributes = predicate_attributes;
            splom_attributes = splom_attributes.slice(0, subplot_limit);

            //force redraw SPLOM if predicates are different
            if (
                this.predicates_prev !== undefined &&
                !same_key(this.predicates_prev[0], predicates[0])
            ) {
                console.log("NOT SAME KEY!!!");
                this.splom_view.splom_obj = undefined;
                this.splom_view.draw(splom_attributes, predicates, "brush");
            } else {
                // this will only recolor
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
