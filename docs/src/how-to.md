# How to add rich action cells and hot row updates

This guide shows how to place browser buttons in visible cells and update one row without replacing the
full dataset.

Add an action column and handle `table-draw` with a named JavaScript handler:

```python
from spaday import NamedJs
from spaday_regular_table import RegularTable

table = RegularTable(
    columns=["symbol", "price", {"key": "action", "label": ""}],
    rows=rows,
    style="height: 32rem",
).on("table-draw", NamedJs("render-actions"))
```

Register the handler in `table-actions.js`:

```javascript
import { registerHandler } from "/js/dist/esm/index.js";

registerHandler("render-actions", (_event, table) => {
  for (const cell of table.querySelectorAll("tbody td")) {
    const meta = table.getMeta(cell);
    if (meta?.column !== "action") continue;

    const button = document.createElement("button");
    button.textContent = "Bump price";
    button.onclick = () => {
      table.updateRow(meta.y, { price: meta.row.price + 1 });
    };
    cell.replaceChildren(button);
  }
});
```

Expose that module through the host application and load it with `scripts`:

```python
app = serve(
    table,
    packages=["regular-table"],
    scripts=["/static/table-actions.js"],
)
```

The draw handler runs again after scrolling and redraws, so buttons are attached only to reused visible
cells. Use `insertRow(index, row)` and `removeRow(index)` for other single-record changes.

Refer to the [API reference](reference.md) for return values and event detail.
