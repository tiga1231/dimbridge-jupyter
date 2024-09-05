// Credit: Adapted from
// https://observablehq.com/@mattberger/fancy-frames
import * as d3 from "https://esm.sh/d3@7";

let top_rounded_d = (x, y, width, height, ar) => {
    let top_left_arc = "a " + ar + "," + ar + " 0 0 1 " + ar + "," + -ar;
    let top_right_arc = "a " + ar + "," + ar + " 0 0 1 " + ar + "," + ar;
    return (
        "M " +
        x +
        " " +
        (y + height) +
        " v " +
        (-height + ar) +
        " " +
        top_left_arc +
        " h " +
        (width - 2 * ar) +
        " " +
        top_right_arc +
        " v " +
        (height - ar) +
        " Z"
    );
};

let top_sharp_d = (x, y, width, height) => {
    return (
        "M " +
        x +
        " " +
        (y + height) +
        " v " +
        -height +
        " h " +
        width +
        " v " +
        height +
        " Z"
    );
};

let make_frame = (
    parent_elem,
    x,
    y,
    width,
    height,
    title,
    fs,
    is_drop_shadow,
) => {
    let frame_g = parent_elem
        .append("g")
        .attr("class", "mainframe")
        .attr("transform", "translate(" + x + "," + y + ")");

    let ds_id = "ds";
    if (is_drop_shadow) {
        parent_elem
            .append("defs")
            .append("filter")
            .attr("id", ds_id)
            .append("feDropShadow")
            .attr("dx", 0)
            .attr("dy", 0)
            .attr("stdDeviation", fs / 4)
            .style("flood-color", d3.hcl(0, 0, 44))
            .attr("flood-opacity", 0.8);
    }

    let frame_path = frame_g
        .append("path")
        .attr("class", "framepath")
        .attr("d", top_rounded_d(0, 0, width, height, fs / 2))
        .attr("fill", d3.hcl(0, 0, 100))
        .attr("stroke", "none");

    if (is_drop_shadow) frame_path.style("filter", "url(#" + ds_id + ")");

    let fs_spacing = 0.2 * fs;

    frame_g
        .append("path")
        .attr("class", "titlepath")
        .attr("d", top_rounded_d(0, 0, width, 3 * fs_spacing + fs, fs / 2))
        .attr("fill", d3.hcl(0, 0, 92));

    frame_g
        .append("text")
        .attr("class", "frametext")
        .attr("x", 3 * fs_spacing)
        .attr("y", fs_spacing + fs)
        .style("font-size", fs)
        .style("fill", d3.hcl(0, 0, 40))
        .style("font-weight", "bold")
        .text(title);

    frame_g
        .append("path")
        .attr("class", "frameboundary")
        .attr("d", top_rounded_d(0, 0, width, height, fs / 2))
        .attr("stroke", d3.hcl(0, 0, 20))
        .attr("fill", "none")
        .attr("stroke-width", 0.75);

    return frame_g;
};

let make_bridge_frame = (
    parent_elem,
    x,
    y,
    width,
    height,
    title,
    fs,
    is_drop_shadow,
) => {
    let frame_g = parent_elem
        .append("g")
        .attr("class", "mainframe")
        .attr("transform", "translate(" + x + "," + y + ")");

    let ds_id = "ds";
    if (is_drop_shadow) {
        parent_elem
            .append("defs")
            .append("filter")
            .attr("id", ds_id)
            .append("feDropShadow")
            .attr("dx", 0)
            .attr("dy", 0)
            .attr("stdDeviation", fs / 4)
            .style("flood-color", d3.hcl(0, 0, 44))
            .attr("flood-opacity", 0.8);
    }

    let frame_path = frame_g
        .append("path")
        .attr("class", "framepath")
        .attr("d", top_rounded_d(0, 0, width, height, fs / 2))
        .attr("fill", d3.hcl(0, 0, 100))
        .attr("stroke", "none");

    if (is_drop_shadow) frame_path.style("filter", "url(#" + ds_id + ")");

    let fs_spacing = 0.2 * fs;

    frame_g
        .append("path")
        .attr("class", "titlepath")
        .attr("d", top_rounded_d(0, 0, width, 3 * fs_spacing + fs, fs / 2))
        .attr("fill", d3.hcl(0, 0, 92));

    frame_g
        .append("text")
        .attr("class", "frametext")
        .attr("x", 3 * fs_spacing)
        .attr("y", fs_spacing + fs)
        .style("font-size", fs)
        .style("fill", d3.hcl(0, 0, 40))
        .style("font-weight", "bold")
        .text(title);

    frame_g
        .append("g")
        .attr("transform", `translate(${width - 32},0) scale(0.05)`)
        .append("path")
        .attr(
            "d",
            "M492,260.351h-52.449v-29.086c1.995,1.456,4.018,2.866,6.091,4.183c1.663,1.056,3.518,1.56,5.352,1.56    c3.308,0,6.546-1.641,8.451-4.641c2.961-4.662,1.582-10.842-3.081-13.802c-35.837-22.759-59.911-73.46-59.911-106.535    c0-0.193-0.018-0.381-0.029-0.57v-0.309c0-5.523-4.477-10-10-10h-30.728c-5.523,0-10,4.477-10,10v0.319    c-0.01,0.187-0.028,0.371-0.028,0.561c0,43.955-42.468,79.715-94.668,79.715s-94.668-35.76-94.668-79.715    c0-0.189-0.018-0.374-0.028-0.561v-0.319c0-5.523-4.477-10-10-10h-30.728c-5.523,0-10,4.477-10,10v0.309    c-0.011,0.19-0.029,0.378-0.029,0.57c0,22.769-11.268,52.763-28.706,76.415c-11.323,15.358-34.949,41.122-65.962,41.122    c-5.523,0-10,4.477-10,10s4.477,10,10,10c18.026,0,35.915-6.542,52.449-18.868v29.653H10c-5.523,0-10,4.477-10,10v35.182    c0,5.523,4.477,10,10,10h95.576v75.318c0,5.523,4.477,10,10,10h30.728c5.523,0,10-4.477,10-10v-75.318h189.393v75.318    c0,5.523,4.477,10,10,10h30.728c5.523,0,10-4.477,10-10v-75.318H492c5.523,0,10-4.477,10-10v-35.182    C502,264.828,497.523,260.351,492,260.351z M419.551,213.179v47.171h-23.127v-79.878    C402.789,192.096,410.551,203.285,419.551,213.179z M376.424,121.149v139.201h-10.728V121.149H376.424z M345.696,168.196v92.155    h-23.567v-70.166C331.195,183.933,339.15,176.516,345.696,168.196z M260.75,211.38v29.97c0,5.523,4.477,10,10,10s10-4.477,10-10    v-33.016c7.452-1.742,14.606-4.122,21.38-7.07v59.086H240.31v-49.043c3.521,0.284,7.085,0.437,10.69,0.437    C254.284,211.745,257.534,211.617,260.75,211.38z M220.31,208.113v52.238h-20.439V222c0-5.523-4.477-10-10-10s-10,4.477-10,10    v38.351h-23.567v-92.155C171.385,187.363,193.95,201.738,220.31,208.113z M136.304,121.149v139.201h-10.728V121.149H136.304z     M83.323,212.189c3.297-3.705,6.509-7.661,9.617-11.877c4.639-6.293,8.867-12.936,12.636-19.764v79.802H83.329v-48.051    C83.329,212.262,83.323,212.226,83.323,212.189z M136.304,380.851h-10.728v-65.318h10.728V380.851z M376.424,380.851h-10.728    v-65.318h10.728V380.851z M482,295.533H20v-15.182h462V295.533z",
        )
        .attr("fill", "black")
        .attr("stroke", "none");

    frame_g
        .append("path")
        .attr("class", "frameboundary")
        .attr("d", top_rounded_d(0, 0, width, height, fs / 2))
        .attr("stroke", d3.hcl(0, 0, 20))
        .attr("fill", "none")
        .attr("stroke-width", 0.75);

    return frame_g;
};

let make_sub_frame = (parent_elem, x, y, width, height, title, fs) => {
    let frame_g = parent_elem
        .append("g")
        .attr("class", "subframe")
        .attr("transform", "translate(" + x + "," + y + ")");

    let frame_path = frame_g
        .append("path")
        .attr("class", "framepath")
        .attr("d", top_sharp_d(0, 0, width, height))
        .attr("fill", d3.hcl(0, 0, 100))
        .attr("stroke", "none");

    let fs_spacing = 0.2 * fs;

    frame_g
        .append("path")
        .attr("class", "titlepath")
        .attr("d", top_sharp_d(0, 0, width, 3 * fs_spacing + fs))
        .attr("fill", d3.hcl(0, 0, 96));

    frame_g
        .append("text")
        .attr("class", "frametext")
        .attr("x", 3 * fs_spacing)
        .attr("y", fs_spacing + fs)
        .style("font-size", fs)
        .style("fill", d3.hcl(0, 0, 52))
        .style("font-weight", "bold")
        .text(title);

    frame_g
        .append("path")
        .attr("class", "frameboundary")
        .attr("d", top_sharp_d(0, 0, width, height))
        .attr("stroke", d3.hcl(0, 0, 88))
        .attr("fill", "none")
        .attr("stroke-width", 3);

    return frame_g;
};

export { make_frame, make_sub_frame, make_bridge_frame };
