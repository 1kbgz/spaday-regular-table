# spaday-regular-table

Viewport-virtualized data tables for spaday, powered by `regular-table`.

[![Build Status](https://github.com/1kbgz/spaday-regular-table/actions/workflows/build.yaml/badge.svg?branch=main&event=push)](https://github.com/1kbgz/spaday-regular-table/actions/workflows/build.yaml)
[![codecov](https://codecov.io/gh/1kbgz/spaday-regular-table/branch/main/graph/badge.svg)](https://codecov.io/gh/1kbgz/spaday-regular-table)
[![License](https://img.shields.io/github/license/1kbgz/spaday-regular-table)](https://github.com/1kbgz/spaday-regular-table)
[![PyPI](https://img.shields.io/pypi/v/spaday-regular-table.svg)](https://pypi.python.org/pypi/spaday-regular-table)

## Documentation

- [Build a 100,000-row table](docs/src/tutorial.md) — guided virtual-table example.
- [Add rich action cells and hot row updates](docs/src/how-to.md) — task-focused Python configuration.
- [API reference](docs/src/reference.md) — props, events, methods, and metadata.
- [Why viewport virtualization matters](docs/src/explanation.md) — performance model and tradeoffs.

## Quick example

```python
from spaday import CallEndpoint, event_value, serve
from spaday_regular_table import RegularTable

rows = [{"id": i, "symbol": f"SYM{i}", "price": i / 10} for i in range(100_000)]

table = RegularTable(
    columns=[
        "id",
        {
            "key": "symbol",
            "label": "Symbol",
            "cell": {"tag": "button", "class": "symbol-button", "event": "symbol-click"},
        },
        {"key": "price", "label": "Last price", "cell": {"format": "number", "digits": 2}},
    ],
    rows=rows,
    row_header="id",
    style="height: 32rem",
).on("symbol-click", CallEndpoint("POST", "/api/click", event_value()))

serve(table, packages=["regular-table"])
```

Only cells requested for the current viewport are copied into `regular-table` and rendered. `rows`
remains a browser-side record array. `columns` accepts keys or `{key, label, cell}` objects and is
inferred from the first row when omitted. A `cell` descriptor can wrap the displayed value in an HTML
or custom-element tag, apply classes and attributes, or format numeric values. The wrapper performs
that work only for visible cells.

For hot server pushes, set `stream_url` to an SSE endpoint whose messages are row patches. You can also
bind `rowPatch` to `CallEndpoint(result=...)` state for request/response updates. Each patch contains
revisioned `update`, `insert`, and `remove` operations, so a 100,000-row list is not recopied. The
browser methods remain available to integration authors, but applications need no JavaScript callback.

`cell-click` exposes `event.detail` with `type`, virtual `x`/`y`, `column`, `value`, and the source `row`, so normal spaday actions can handle interactions. `virtual_mode` supports upstream `both`, `horizontal`, `vertical`, and `none`; keep `both` for large datasets.

## Run the local example

```bash
python -m pip install -e ".[examples]"
python -m spaday_regular_table.example
```

Open `http://127.0.0.1:8014` to inspect the [complete market-blotter example](spaday_regular_table/example.py): 100,000
virtualized rows, a server row stream, full-width sizing, rich cells, and server-authoritative update,
insert, remove, and click operations. All interaction is authored in Python; there is no companion
`example.js`. It passes the local package descriptor directly, so it does not install or resolve the
integration from GitHub.
