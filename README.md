# spaday-regular-table

Viewport-virtualized data tables for spaday, powered by `regular-table`.

[![Build Status](https://github.com/1kbgz/spaday-regular-table/actions/workflows/build.yaml/badge.svg?branch=main&event=push)](https://github.com/1kbgz/spaday-regular-table/actions/workflows/build.yaml)
[![codecov](https://codecov.io/gh/1kbgz/spaday-regular-table/branch/main/graph/badge.svg)](https://codecov.io/gh/1kbgz/spaday-regular-table)
[![License](https://img.shields.io/github/license/1kbgz/spaday-regular-table)](https://github.com/1kbgz/spaday-regular-table)
[![PyPI](https://img.shields.io/pypi/v/spaday-regular-table.svg)](https://pypi.python.org/pypi/spaday-regular-table)

## Documentation

- [Build a 100,000-row table](docs/src/tutorial.md) — guided virtual-table example.
- [Add rich action cells and hot row updates](docs/src/how-to.md) — task-focused browser integration.
- [API reference](docs/src/reference.md) — props, events, methods, and metadata.
- [Why viewport virtualization matters](docs/src/explanation.md) — performance model and tradeoffs.

## Quick example

```python
from spaday import NamedJs, serve
from spaday_regular_table import RegularTable

rows = [{"id": i, "symbol": f"SYM{i}", "price": i / 10} for i in range(100_000)]

table = RegularTable(
    columns=["id", "symbol", {"key": "price", "label": "Last price"}],
    rows=rows,
    row_header="id",
    style="height: 32rem",
).on("cell-click", NamedJs("inspectCell")).on(
    "table-draw", NamedJs("renderCells")
)

serve(table, packages=["regular-table"], scripts=["/static/table-actions.js"])
```

Only cells requested for the current viewport are copied into `regular-table` and rendered. `rows` remains a browser-side record array; updating a bound `rows` prop redraws while preserving measured column widths. `columns` accepts keys or `{key, label}` objects and is inferred from the first row when omitted.

For hot updates, the element exposes `updateRow(index, changes)`, `insertRow(index, row)`, and `removeRow(index)`. These mutate one browser-side record and redraw only the viewport; they do not replace or recopy the full dataset. A named handler can call them directly:

```javascript
import { registerHandler } from "/js/dist/esm/index.js";

registerHandler("bump-price", (event, table) => {
  const { row, y } = event.detail;
  table.updateRow(y, { price: row.price + 1 });
});
```

`table-draw` runs after every render, including scrolling. Use `table.getMeta(cell)` to map each visible `<td>` back to its virtual row and column, then decorate only those cells with buttons or other rich DOM. This stays on regular-table's viewport-sized hot path:

```javascript
registerHandler("renderCells", (_event, table) => {
  for (const cell of table.querySelectorAll("tbody td")) {
    const meta = table.getMeta(cell);
    if (meta?.column !== "symbol") continue;

    const button = document.createElement("button");
    button.textContent = meta.row.symbol;
    button.onclick = () => openOrder(meta.row.id);
    cell.replaceChildren(button);
  }
});
```

`cell-click` exposes `event.detail` with `type`, virtual `x`/`y`, `column`, `value`, and the source `row`, so normal spaday actions can handle interactions. `virtual_mode` supports upstream `both`, `horizontal`, `vertical`, and `none`; keep `both` for large datasets.
