def numpy2json(data, widget):
    return dict(
        data=data.tobytes(),
        shape=data.shape,
        dtype=str(data.dtype),
    )


def pandas2json(df, widget=None):
    columns = df.columns.to_list()
    return dict(
        columns=columns,
        dtypes=[str(dt) for dt in df.dtypes],
        data=[df[col].to_numpy().tobytes() for col in columns],
        shape=[len(df), len(columns)],
    )
