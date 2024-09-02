## bump up a version
bumpver update --minor
bumpver update --major

## build wheel for pip:
python -m build
 
## upload to PyPI or TestPyPI
twine upload -r testpypi dist/*
twine upload dist/*
