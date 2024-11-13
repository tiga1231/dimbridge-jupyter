# dimbridge

A Jupyter lab widget for interpreting visual patterns in dimensionality reduction plots

Based on the work:
[DimBridge: Interactive Explanation of Visual Patterns in Dimensionality Reductions with Predicate Logic
](https://arxiv.org/abs/2404.07386)

## Example
```
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

Create a virtual environment and and install dimbridge in *editable* mode with the
optional development dependencies:

```sh
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

You then need to install the JavaScript dependencies and run the development server.

```sh
npm install
npm run dev
```

Open `example.ipynb` in JupyterLab, VS Code, or your favorite editor
to start developing. Changes made in `js/` will be reflected
in the notebook.
