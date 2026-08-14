# Build a 100,000-row table

In this tutorial, we will serve 100,000 records while rendering only the rows visible in the browser.

## Install the packages

```bash
pip install "spaday[examples]" spaday-regular-table
```

## Create the table

Save this as `table_app.py`:

```python
import uvicorn

from spaday.backends.starlette import serve
from spaday_regular_table import RegularTable

rows = [
    {"id": index, "symbol": f"SYM{index}", "price": index / 10}
    for index in range(100_000)
]

table = RegularTable(
    columns=[
        "id",
        "symbol",
        {"key": "price", "label": "Last price"},
    ],
    rows=rows,
    row_header="id",
    style="height: 32rem",
)

app = serve(table, packages=["regular-table"])

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
```

Run it:

```bash
python table_app.py
```

Open `http://127.0.0.1:8000`. You should see the first rows immediately. Drag the scrollbar near the
bottom; rows around 100,000 appear without creating 100,000 DOM rows.

You now have a viewport-virtualized table backed by ordinary serializable records. Continue with
[Add rich action cells and hot row updates](how-to.md) to customize visible cells.
