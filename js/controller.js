export class InteractionController {
    //fields
    projection_view;
    predicate_view;
    splom_view;

    constructor() {
        return this;
    }

    add_views(projection_view, predicate_view, splom_view) {
        this.projection_view = projection_view;
        this.predicate_view = predicate_view;
        this.splom_view = splom_view;
    }

    on_projection_view_change({
        predicates,
        attributes,
        // qualities,
        n_boxes,
        // full_brush_history,
        sample_brush_history,
        x,
        y,
    } = {}) {
        //get projection view brush-selected data
        //start predicate computation

        //update predicate view
        this.predicate_view.draw(
            n_boxes,
            predicates,
            attributes,
            sample_brush_history,
            x,
            y,
        );

        //update splom view
        let predicate_attributes = attributes;
        //The dimension of splom attributes
        let splom_attributes;
        let manual_splom_attributes = ["d1", "d2", "d3"]; //TODO
        if (predicate_attributes !== undefined) {
            splom_attributes = predicate_attributes;
        } else if (manual_splom_attributes) {
            splom_attributes = manual_splom_attributes;
        } else {
            let all_attributes = attributes;
            let numerical_attributes = attributes.filter(
                (attr) => typeof data[0][attr] === "number",
            );
            splom_attributes = numerical_attributes.slice(0, 5);
        }
        //limit the maximum number of attributes plot in both predicate view and splom
        let subplot_limit = 9;
        if (splom_attributes !== undefined) {
            splom_attributes = splom_attributes.slice(0, subplot_limit);
        }

        this.splom_view.draw(splom_attributes);
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
