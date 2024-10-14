import * as d3 from "d3";
// import {default as crossfilter} from "https://cdn.skypack.dev/crossfilter2@1.5.4?min";
import {
    make_frame,
    // make_sub_frame,
    // make_bridge_frame,
} from "../lib/fancy-frames.js";

import {
    C,
    // reshape,
    create_svg,
    // linspace,
    // zip,
    // scatter,
    // scatter_gl,
    flexbox,
    overflow_box,
} from "../lib.js";

export default class ImageView {
    constructor(config) {
        this.config = config;
        // this.config = {
        //     n_cols: 8,
        //     n_rows: 12,
        //     border_width: 1,
        //     padding: 0,
        //     width: 900,
        // };
        this.node = this.init_node(this.config);
    }

    init_node({
        n_cols = 8,
        n_rows = 12,
        border_width = 0,
        padding = 10,
        image_view_width = 200,
    } = {}) {
        // this.image_size =
        //     (image_view_width - 2 * padding - border_width * 2) / n_cols;
        // // let frame = make_frame(d3.select(fb));
        this.ob = overflow_box([], image_view_width * 0.5);
        // d3.select(this.ob).style("overflow", "visible");

        return this.ob;
    }

    draw(image_urls) {
        if (image_urls.length == 1) {
            this.draw_single(image_urls[0]);
        } else {
            this.draw_multiple(image_urls);
        }
    }

    clear() {
        if (Array.isArray(this.fb)) {
            for (let fb of this.fb) {
                d3.select(fb).remove();
            }
        } else {
            d3.select(this.fb).remove();
        }
    }

    draw_single(image_urls) {
        this.clear();
        let block_width = this.config.image_view_width - 1;
        this.image_size = block_width / this.config.n_cols;
        // this.config.n_cols;
        this.fb = flexbox([], this.config.image_view_width);
        d3.select(this.fb)
            // .style("margin-left", `${this.config.padding}px`)
            // .style("margin-right", `${this.config.padding}px`)
            .style("border", `solid 1px`)
            .style("filter", "drop-shadow(0 0 4px rgb(48,48,48)");
        this.node.appendChild(this.fb);
        image_urls = image_urls.slice(
            0,
            this.config.n_rows * this.config.n_cols,
        );
        d3.select(this.fb)
            .selectAll("img")
            .data(image_urls)
            .join("img")
            .attr("width", this.image_size) //minus border width on both sides
            .style("max-width", `${this.image_size}px`)
            .style("max-height", `${this.image_size}px`)
            .style("object-fit", "contain") //keep original aspect ratio
            .style("border", "solid white 0px")
            .attr("src", (d) => d);
    }

    draw_multiple(image_urls) {
        let n_blocks = image_urls.length;
        let block_width =
            this.config.image_view_width / n_blocks -
            2 * this.config.padding -
            2 * this.config.border_width;
        this.image_size = block_width / (this.config.n_cols / n_blocks);

        //array of array of images for each block.
        this.clear();
        this.fb = image_urls.map((images_per_brush, i) => {
            let fb = flexbox([], block_width);
            let border_color;
            if (n_blocks == 2) {
                border_color = C[i];
            } else {
                border_color = d3.interpolateViridis(i / (n_blocks - 1));
            }
            d3.select(fb)
                .style("margin-left", `${this.config.padding}px`)
                .style("margin-right", `${this.config.padding}px`)
                .style("margin-bottom", `${this.config.padding}px`)
                .style(
                    "border",
                    `solid ${border_color} ${this.config.border_width}px`,
                )
                .style("filter", "drop-shadow(0 0 4px rgb(48,48,48)");
            images_per_brush = images_per_brush.slice(
                0,
                this.config.n_rows * this.config.n_cols,
            );
            d3.select(fb)
                .selectAll("img")
                .data(images_per_brush)
                .join("img")
                .attr("width", this.image_size) //minus border width on both sides
                .style("max-width", `${this.image_size}px`)
                .style("max-height", `${this.image_size}px`)
                .style("object-fit", "contain") //keep original aspect ratio
                .style("border", "solid black 0px")
                .attr("src", (d) => d);
            return fb;
        });

        for (let fb of this.fb) {
            this.node.appendChild(fb);
        }
    }
}

// d3.select(fb).style('height', '500px') //TODO overflow scroll
//TODO, optional: better ordering to preserve consistency between updates
//e.g., append new selection to the end, remove unselected using animation
function init_image_view_multiple(n_cols) {
    let n_grid_x = n_cols == 2 ? 4 : 2;
    let n_grid_y = 3;
    let spacing = 2;
    let subview_border_width = 1;
    let image_border_width = 0;

    let sample_brush = subsample(
        main_view.projection_view.sample_brush_history,
        n_cols,
    );
    let padding = config.margin_outer;

    let n_images_per_brush = n_grid_x * n_grid_y;
    let subview_width = Math.floor(
        (width - spacing * 2 * n_cols - subview_border_width * 2 * n_cols) /
            n_cols,
    );
    // let image_size = Math.min(width / n_cols, subview_width / n_grid_x);
    let image_size = Math.floor(
        subview_width / n_grid_x - image_border_width * 2,
    );

    let selected = d3.range(n_cols).map((t) => {
        // let st = main_view.get_selected(data, sample_brush[t]);
        let st = get_selected(data, sample_brush[t], {
            x: main_view.projection_view.x,
            y: main_view.projection_view.y,
        });
        let d = data.filter((d, i) => st[i]);
        // .sort((a, b) => d3.ascending(a.x, b.x))
        d = d.slice(0, n_images_per_brush);
        if (d.length < n_images_per_brush) {
            for (let i = d.length; i < n_images_per_brush; i++) {
                d.push({image_url: "dummy"});
            }
        }
        return d.slice(0, n_images_per_brush);
    });

    let container_div = d3.create("div").node();

    for (let selected_t of selected) {
        let selected_images = selected_t;
        if (selected_images.length > n_grid_x * n_grid_y) {
            // selected_images = _.shuffle(selected_images);
            selected_images = selected_images.slice(0, n_grid_x * n_grid_y); //limit to n_grid^2 images
        }
        let images = selected_images.map((d) => {
            return d3
                .create("img")
                .attr("width", image_size)
                .style("max-width", `${image_size}px`)
                .style("max-height", `${image_size}px`)
                .style("border", `solid ${image_border_width}px`)
                .attr("src", d.image_url !== "dummy" ? d.image_url : "")
                .style("object-fit", "contain") //keep original aspect ratio
                .node();
        });
        let fb = flex_box(images, subview_width);
        d3.select(fb)
            .style("float", "left")
            .style("margin-left", `${spacing}px`)
            .style("margin-right", `${spacing}px`)
            .style("border", `solid ${subview_border_width}px`);
        // .style("filter", "drop-shadow(0 0mm 3px rgb(48,48,48)"); //drop shadow

        container_div.appendChild(fb);
    }

    d3.select(container_div);

    // .style('background', `white`)
    // .style('margin-left', `${padding}px`)
    // .style('margin-right', `${padding}px`)
    // .style('border', `solid ${border_width}px`)
    // .style('filter', "drop-shadow(0 0mm 3px rgb(48,48,48)")

    return container_div;
}
