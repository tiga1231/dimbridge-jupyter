# PyPI publishing Notes


## Versioning
format: major.minor.patch

### automatrically bump up a version in all relevant files
```sh
bumpver update --patch
bumpver update --minor
bumpver update --major
```

### configure versioned files
```sh
vim pyproject.toml
```
Look for `[tool.bumpver]` and `[tool.bumpver.file_patterns]` entries




## Publish on pip

### build wheel for pip:
```sh
python -m build
```

### upload to PyPI or TestPyPI
```sh
twine upload -r testpypi dist/*
twine upload dist/*
```


