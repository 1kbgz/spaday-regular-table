# How to add rich action cells and hot row updates

Use a `cell` descriptor when a visible value should be an interactive element. This creates real
buttons inside the virtualized viewport; scrolling reuses and rerenders them automatically.

```python
from spaday import CallEndpoint, event_value
from spaday_regular_table import RegularTable

table = RegularTable(
    columns=[
        {
            "key": "symbol",
            "label": "Symbol",
            "cell": {
                "tag": "button",
                "class": "symbol-button",
                "event": "symbol-click",
                "attributes": {"type": "button"},
            },
        },
        {"key": "price", "label": "Last", "cell": {"format": "number", "digits": 2}},
    ],
    rows=rows,
    style="height: 32rem",
).on(
    "symbol-click",
    CallEndpoint("POST", "/api/click", event_value()),
)
```

`event_value()` sends the `symbol-click` detail, including `column`, `value`, virtual `x` and `y`, and
the source `row`. The endpoint can act on the exact record without a browser callback.

## Apply a patch returned by an endpoint

Have the endpoint return a small revisioned operation batch:

```python
return JSONResponse({
    "message": "Price updated",
    "patch": {
        "revision": 1,
        "operations": [
            {"type": "update", "index": 3, "changes": {"price": 103.25}},
        ],
    },
})
```

Capture the response in normal spaday state and bind its patch to the table:

```python
table.bind("rowPatch", "action_result.body.patch")

button.on(
    "click",
    CallEndpoint("POST", "/api/update", result="action_result"),
)
```

## Stream row patches from Python

Set `stream_url` to a Server-Sent Events endpoint:

```python
table = RegularTable(rows=rows, stream_url="/api/table/stream")
```

Each `data` message is one JSON patch. A streamed insert-and-trim operation looks like this:

```python
patch = {
    "revision": 2,
    "operations": [
        {"type": "insert", "index": 0, "row": new_row},
        {"type": "remove", "index": 100_000},
    ],
}
yield f"data: {json.dumps(patch)}\n\n"
```

The browser applies each batch to its existing record array and redraws one viewport. Use a new
`revision` for every patch so reconnects or duplicate endpoint/stream delivery cannot apply an operation
twice.

See the [complete example](../../spaday_regular_table/example.py) for an SSE broadcaster, toolbar REST
actions, click logging, styles, and a 100,000-row dataset—all authored in Python.
