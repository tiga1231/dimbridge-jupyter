# standard lib
import importlib.metadata
import pathlib

# computational
import numpy as np
import pandas as pd

# anywidget / UI
import anywidget
import traitlets
from traitlets import observe
from traitlets import (
    Int,
    List,
    Dict,
    Float,
    Set,
    Callable,
    Instance,
    Any,
    Unicode,
    Bool,
)

# custom modules
from .datautils import numpy2json, pandas2json

try:
    __version__ = importlib.metadata.version("dimbridge")
except importlib.metadata.PackageNotFoundError:
    __version__ = "unknown"


class Dimbridge(anywidget.AnyWidget):
    """User interface widget"""

    # JS esm and css files
    _esm = pathlib.Path(__file__).parent / "static" / "widget.js"
    _css = pathlib.Path(__file__).parent / "static" / "widget.css"

    # input attributes
    data = Instance(pd.DataFrame).tag(sync=True, to_json=pandas2json)
    x = Instance(np.ndarray).tag(sync=True, to_json=numpy2json)
    y = Instance(np.ndarray).tag(sync=True, to_json=numpy2json)
    c = Instance(np.ndarray).tag(sync=True, to_json=numpy2json)  # mark color
    s = Instance(np.ndarray).tag(sync=True, to_json=numpy2json)  # mark size

    xticks = Int(5).tag(sync=True)
    yticks = Int(5).tag(sync=True)
    xlabel = Unicode("xlabel").tag(sync=True)
    ylabel = Unicode("ylabel").tag(sync=True)
    title = Unicode("").tag(sync=True)

    # output attributes
    selected = List([]).tag(sync=True)

    # styles/layout traits
    width = Float(500).tag(sync=True)
    height = Float(305).tag(sync=True)
    square_scale = Bool(True).tag(sync=True)

    # response to value change
    @observe("selected")
    def _observe_selected(self, change):
        # print("selected: ", change)
        pass

    def __repr__(self):
        """bypass ipywidget's __repr__() from printing Pandas DataFrame"""
        return "DimBridge()"
