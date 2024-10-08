// function data_extent_predicate(data, selected, attributes) {}
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
