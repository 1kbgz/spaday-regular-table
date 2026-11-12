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

## Edit shared records

Install the example dependencies and start the [collaborative example](../../spaday_regular_table/collaboration.py):

```bash
python -m pip install -e ".[examples]"
python -m spaday_regular_table.collaboration
```

Open `http://127.0.0.1:8042` as Alice, `/bob` in another tab, and `/viewer` for read-only access.
Edit a title as Alice and its note as Bob: both fields converge in all three tabs. Select a different
record as Bob to verify that selection stays local. Delete `docs/README.md` to remove that record
from every tab while keeping `src/README.md` and its edits.

To adapt this example:

- Keep a stable, unique `id` on each record. Declare `records` as a CRDT keyed set and `details` as a
  nested map. Set iteration order is not a record identity or a persisted display order.
- Render editors with `Each(..., field="board.records", key="id")`. Bind inputs to `item("title")`
  and `item("details.note")` in two-way mode. These writes target the record identity after another
  record is deleted or the collection order changes.
- Keep selection in the page's local `store`, outside the `board` wire namespace.
- Apply deletion on the server using the submitted ID and a fresh CRDT snapshot. Diff that snapshot
  and pass its operations to `hub.mutate_shared_crdt()`. A repeated deletion returns 404.
- Grant `WRITE` only to editors on the Hub and check the same role in the HTTP deletion endpoint.
  Replace URL-selected demo roles with authenticated identities before deployment.

`Wire(reconnect=True)` replays queued field edits after a temporary disconnect. To try this, take
Alice's tab offline, edit its title, change Bob's note, then reconnect Alice. Both changes should
appear. Deletion uses an HTTP request and requires a connection; it is not queued offline.
The example keeps data in memory, so restarting the server resets it.

Bind `RegularTable.rows` to `board.records`. A button cell emits `edit-record`; use
`SetField("selected", event_value("row.id"))` to open the corresponding editor. This small shared
collection uses whole `rows` projections for rendering. For large server-owned datasets, keep the
streamed row-patch approach above.

The people list shows connected users, their selected records, and the title or note field they have
focused. Multiple tabs for the same user share one indicator with a tab count and their activities.
Viewer appears with read-only activity. Names and colors belong to this example; the demo
roles still come from its URLs.

The Python page renders the indicators from local `people` state. Its small `collaboration.ts` adapter
listens for `spaday:wire-client` and uses the existing client's awareness API to publish selection and
focus. Awareness is separate from CRDT records, clears on disconnect or page navigation, and
republishes on reconnect or restoration from the browser’s back/forward cache.
No additional WebSocket or durable presence fields are needed.

Move the mouse over a record row or a title/note input to show a labeled cursor and target outline
in the other browser. Positions are relative to that record's row or field, so different window
sizes and scroll positions remain aligned. A cursor disappears when its target is hidden, deleted,
or outside the visible viewport, or when its sender leaves the target, blurs, or disconnects.
The pointer layer does not capture clicks. Mouse updates are coalesced to at most 25 per second;
keyboard focus is still shown in the people list.
