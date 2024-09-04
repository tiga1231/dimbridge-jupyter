import * as d3 from "https://esm.sh/d3@7";

export default class PredicateView {
    svg;
    view_g;
    controller;
    node;
    plot_width;
    plot_height;

    constructor(data, controller, config) {
        console.log("new PredicateView");
        this.data = data;
        this.controller = controller;
        this.config = config;

        this.extent = Object.fromEntries(
            Object.keys(data[0]).map((attr) => [
                attr,
                d3.extent(data, (d) => d[attr]),
            ]),
        );
        this.node = this.init_node();
        return this;
    }

    init_node() {
        let {
            width,
            scatter_width,
            scatter_height,
            font_size,
            scatter_padding,
            gap,
        } = this.config;
        this.plot_width = width * (1 - scatter_width * 2) - gap; //width of predicate view
        this.plot_height = width * scatter_height + 2.6 * font_size; // "+ 2.6 * fs" makes sure the scatter plot is squared
        // let padding_left = 1 + scatter_padding;
        // let padding_right = 1 + scatter_padding;
        this.padding_bottom = scatter_padding;
        this.padding_top = font_size * 1.6 + scatter_padding;

        let return_node = d3
            .create("div")
            .style("width", `${this.plot_width}px`)
            .style("height", `${this.plot_height}px`)
            .style("position", "relative")
            .node();

        let frame = create_svg(this.plot_width, this.plot_height).style(
            "overflow",
            "visible",
        );
        frame
            .append("g")
            .call(
                make_bridge_frame,
                0,
                0,
                this.plot_width,
                this.plot_height,
                "Predicate View",
                font_size,
                true,
            );
        return_node.appendChild(frame.node());

        this.svg = create_svg(this.plot_width, this.plot_height);
        //predicate view
        this.view_g = this.svg.append("g");
        let ob = overflow_box(this.svg.node(), width * scatter_height);
        d3.select(ob)
            .style("position", "absolute")
            .style("top", `${this.padding_top}px`)
            .style("left", "0");
        return_node.appendChild(ob);

        return return_node;
    }

    draw(n_boxes, predicates, attributes, sample_brush_history, x, y) {
        console.log("predicate view drawing...", arguments);
        // draw(n_boxes, predicates) {

        /*
    Takes predicates data (see first line of code) from projection_view.
    Renders predicate view depending on brush mode/state indicated by n_boxes
    For every predicate attribute, 
      when n_boxes=1, predicate view displays a range bar horizontally
      when n_boxes=2, it displays a _pair_ of categorically colored range bars horizontally
      when n_boxes>2, it displays a sequence of range bars _vertivally_ like a time steries
    */

        //resize height of the overflowed svg
        let subplot_height =
            n_boxes > 2
                ? this.config.predicate_view_subplot_height * 4.1
                : this.config.predicate_view_subplot_height;
        let svg_height =
            subplot_height *
            (attributes !== undefined ? attributes.length + 2 : 1000);
        this.svg.attr("height", svg_height + 300);
        if (this.data[0].image_url) {
            svg_height += 300;
        }

        //limit the number of attributes plot in both predicate view and splom
        if (attributes !== undefined) {
            let max_n_predicates = Infinity;
            attributes = attributes.slice(0, max_n_predicates);
        }

        //draw
        if (predicates !== undefined) {
            let predicate_view_style = {
                padding_top: this.padding_top,
                padding_bottom: this.padding_bottom,
                width: this.plot_width,
                height: this.plot_height,
                font_size: this.config.predicate_view_fontsize,
                subplot_height: this.config.predicate_view_subplot_height,
                x_shift: this.plot_width,
            };
            //assign predicate_view different draw functions depending on brush number
            if (n_boxes == 1) {
                this.view_g.call(
                    predicate_single,
                    this.controller,
                    this.extent,
                    predicate_view_style,
                );
            } else if (n_boxes == 2) {
                this.view_g.call(predicate_contrastive, predicate_view_style);
            } else {
                this.view_g.call(predicate_multiple, predicate_view_style);
            }
            if (n_boxes == 1) {
                let selected_data = get_selected(
                    this.data,
                    sample_brush_history[sample_brush_history.length - 1],
                    { x, y },
                );
                this.view_g.draw(predicates, attributes, selected_data);
            } else if (n_boxes == 2) {
                let selected_TODO = undefined;
                this.view_g.draw(
                    predicates,
                    attributes,
                    n_boxes,
                    selected_TODO,
                );
            } else {
                this.view_g.draw(predicates, attributes, n_boxes);
            }
        }
    }

    draw2() {}
}
