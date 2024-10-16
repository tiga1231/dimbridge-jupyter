# standard lib
import importlib.metadata
import pathlib

# computational
import numpy as np
import pandas as pd

# anywidget / UI
import anywidget
import traitlets
from traitlets import observe, default
from traitlets import (
    Any,
    Bool,
    Callable,
    Dict,
    Enum,
    Float,
    Instance,
    Int,
    List,
    Set,
    Unicode,
)

# custom modules
from .datautils import numpy2json, pandas2json

# try:
#     __version__ = importlib.metadata.version("dimbridge")
# except importlib.metadata.PackageNotFoundError:
__version__ = "0.1.3"


class Dimbridge(anywidget.AnyWidget):
    """User interface widget"""

    # JS esm and css files
    _esm = pathlib.Path(__file__).parent / "static" / "widget.js"
    # _css = pathlib.Path(__file__).parent / "static" / "widget.css"

    # input attributes
    # .tag(sync=True) is required by AnyWidget to have them in sync with the JavaScript model
    predicate_host = Unicode("http://localhost:9001").tag(sync=True)
    dataset_name = Unicode("dummy_dataset_name").tag(sync=True)

    data = Instance(pd.DataFrame).tag(sync=True, to_json=pandas2json)
    x = Instance(np.ndarray).tag(sync=True, to_json=numpy2json)
    y = Instance(np.ndarray).tag(sync=True, to_json=numpy2json)
    c = Instance(np.ndarray).tag(sync=True, to_json=numpy2json)  # mark color
    # s = Instance(np.ndarray).tag(sync=True, to_json=numpy2json)  # mark size
    s = Float(4).tag(sync=True)

    # splom mark size
    splom_mark_size = Float(6.0).tag(sync=True)

    # color map
    cmap = Enum(["viridis", "set10"], default_value="viridis").tag(sync=True)

    predicate_mode = Enum(
        [
            "data extent",
            "predicate regression",
        ],
        default_value="data extent",
    ).tag(sync=True)

    brush_mode = Enum(
        [
            "single",
            "contrastive",
            "curve",
        ],
        default_value="single",
    ).tag(sync=True)

    # plot settings
    xticks = Int(5).tag(sync=True)
    yticks = Int(5).tag(sync=True)
    xlabel = Unicode("xlabel").tag(sync=True)
    ylabel = Unicode("ylabel").tag(sync=True)
    title = Unicode("").tag(sync=True)

    # styles/layout traits
    width = Float(500).tag(sync=True)
    height = Float(305).tag(sync=True)
    square_scale = Bool(True).tag(sync=True)

    splom_attributes = List([]).tag(sync=True)
    image_urls = List([]).tag(sync=True)
    # output attributes
    selected = List([]).tag(sync=True)

    @default("splom_attributes")
    def _default_splom_attributes(self):
        return self.data.columns[:5].tolist()

    @default("s")
    def _default_s(self):
        return np.zeros_like(self.x) + 6

    @default("c")
    def _default_c(self):
        return np.repeat([[31, 119, 180]], self.x.shape[0], 0).astype(np.int32)

    # response to value change
    @observe("selected")
    def _observe_selected(self, change):
        # print("selected: ", change)
        pass

    def __repr__(self):
        """bypass ipywidget's __repr__() from printing Pandas DataFrame"""
        return "DimBridge()"
