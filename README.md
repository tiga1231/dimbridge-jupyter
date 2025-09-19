# dimbridge

A Jupyter lab widget for interpreting visual patterns in dimensionality reduction plots

Based on the work:
[DimBridge: Interactive Explanation of Visual Patterns in Dimensionality Reductions with Predicate Logic
](https://arxiv.org/abs/2404.07386)

## Example
```
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation

%matplotlib inline

import numpy as np
import pandas as pd
from umap import UMAP

from dimbridge import Dimbridge

plt.style.use("ggplot")
plt.style.use("seaborn-v0_8-colorblind")

n = int(1e4)

## data
R = 2
P = 3
eps = 0.5
u = np.random.rand(n) * np.pi * 2
v = np.random.rand(n) * np.pi * 2

x = R * (np.cos(u / 2) * np.cos(v) - np.sin(u / 2) * np.sin(2 * v))
y = R * (np.sin(u / 2) * np.cos(v) + np.cos(u / 2) * np.sin(2 * v))
z = P * np.cos(u) * (1 + eps * np.sin(v))
w = P * np.sin(u) * (1 + eps * np.sin(v))

## construct pandas dataframe and compute UMAP
df = pd.DataFrame(dict(x1=x, x2=y, x3=z, x4=w))
# xy = UMAP(n_neighbors=50, min_dist=0.3).fit_transform(df.to_numpy())
xy = np.c_[u, v]

## validate UMAP
plt.figure(figsize=[3, 3])
plt.scatter(xy[:, 0], xy[:, 1], s=1)
plt.axis("equal")
plt.show()

dimbridge = Dimbridge(
    data=df,
    x=xy[:, 0],
    y=xy[:, 1],
    s=4,  # projection plot mark size
    splom_s=1,
    predicate_mode="data extent",  # "data extent", "predicate regression"
    brush_mode="single",  # 'single', "contrastive", "curve",
)
dimbridge
```
See details in [example.ipynb](./example.ipynb)


## Installation

- install jupyter lab: [[JupyterLab]](https://jupyter.org/install)

- Install DimBridge

```sh
pip install dimbridge
```

- Enable widgets extension
jupyter labextension enable widgetsnbextension

## Development installation

Create a virtual environment. Rather than using pip, install the dimbridge under this repo in *editable* mode with the
 development dependencies:

```sh
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

You then need to install the JavaScript dependencies and keep the development server running. 
```sh
npm install
npm run dev
```
This will bundle the JS code and monitor edits in JS code to keep the dev version of the widget updated

Open `example.ipynb` in JupyterLab, VS Code, or your favorite editor to start developing. 
Changes made in `js/` will be reflected in the notebook.
