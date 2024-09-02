def numpy2json(data, widget):
    return dict(
        data=data.tobytes(),
        shape=data.shape,
        dtype=str(data.dtype),
    )


def pandas2json(data, widget):
    raise NotImplementedError


