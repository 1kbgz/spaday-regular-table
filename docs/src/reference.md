# API reference

## `RegularTable`

Tag: `<spaday-regular-table>`.

| Python argument | Browser prop  | Type                                        | Default  |
| --------------- | ------------- | ------------------------------------------- | -------- |
| `rows`          | `rows`        | list of records                             | `[]`     |
| `columns`       | `columns`     | keys or `{key, label, cell}` mappings       | inferred |
| `row_patch`     | `rowPatch`    | revisioned row-operation batch              | `None`   |
| `stream_url`    | `streamUrl`   | SSE endpoint returning row patches          | `None`   |
| `virtual_mode`  | `virtualMode` | `both`, `horizontal`, `vertical`, or `none` | `both`   |
| `row_header`    | `rowHeader`   | record key or `None`                        | `None`   |
| `row_height`    | `rowHeight`   | positive number or `None`                   | `None`   |

```{eval-rst}
.. autoclass:: spaday_regular_table.RegularTable
   :members:
```

## Browser methods

| Method                         | Return                           | Description                                                  |
| ------------------------------ | -------------------------------- | ------------------------------------------------------------ |
| `updateRow(index, changes)`    | `boolean`                        | Merges fields into an existing row.                          |
| `insertRow(index, row)`        | `boolean`                        | Inserts a row at an exact virtual index.                     |
| `removeRow(index)`             | row or `undefined`               | Removes and returns one row.                                 |
| `getMeta(element)`             | metadata or `undefined`          | Resolves a rendered cell or descendant.                      |
| `getCellAtPoint(x, y)`         | metadata or `undefined`          | Hit-tests a body cell or row header at viewport coordinates. |
| `getRowAtPoint(x, y)`          | number or `undefined`            | Returns the virtual row index at viewport coordinates.       |
| `getRowBounds(index)`          | `TableItemBounds` or `undefined` | Returns geometry for a rendered row.                         |
| `getCellBounds(index, column)` | `TableItemBounds` or `undefined` | Returns geometry for a rendered data cell by column key.     |

Mutation methods return `false` or `undefined` for a non-integer or out-of-range index. Successful
mutations schedule one animation-frame-coalesced viewport redraw.

Geometry queries never select, scroll, or render missing rows. They return `undefined` for invalid
indices, missing columns, disconnected tables, and items outside the rendered or visible viewport.
Hit-testing follows rich-cell shadow content and rejects column headers and covered cells.

`TableItemBounds` contains `bounds` (the full rendered rectangle) and `visibleBounds` (clipped against
the browser viewport and ancestors with non-visible overflow), both in viewport coordinates. Bounds
do not account for unrelated elements covering the table; use hit-testing to check a particular point.
Virtual row indices refer to the current `rows` array. Map indices to stable record IDs in application
code when sharing positions across clients with different row ordering.

## Cell descriptors

The optional `cell` mapping on a column accepts:

| Key              | Value                           | Effect                                               |
| ---------------- | ------------------------------- | ---------------------------------------------------- |
| `tag`            | HTML or custom-element tag name | Wraps displayed value in that element.               |
| `class`          | string                          | Class on wrapped element.                            |
| `cell_class`     | string                          | Class on the table cell.                             |
| `title`          | string                          | Title on wrapped element.                            |
| `event`          | string                          | Extra event emitted with cell metadata.              |
| `attributes`     | string mapping                  | Attributes on wrapped element.                       |
| `format`         | `number` or `percent`           | Numeric display format.                              |
| `digits`         | non-negative integer            | Fixed displayed decimal places.                      |
| `signed`         | boolean                         | Adds `+` to positive formatted values.               |
| `positive_class` | string                          | Cell class for values greater than or equal to zero. |
| `negative_class` | string                          | Cell class for negative values.                      |

Descriptors are serializable Python data. They are applied only to currently rendered cells.

## Row patches

`rowPatch` has `revision` and `operations`. Supported operations are:

```python
{"type": "update", "index": 4, "changes": {"price": 101.2}}
{"type": "insert", "index": 0, "row": {"id": 9, "price": 99.5}}
{"type": "remove", "index": 12}
```

Operations run in array order. Reassigning the same defined revision is ignored. Invalid indices return
the same no-op behavior as the matching browser method.

`streamUrl` opens an `EventSource`; every message must contain a JSON row patch. The wrapper emits
`row-patch` after a non-empty patch and `row-stream-error` when a message is not valid JSON.

## Events

`cell-click` detail contains `type`, virtual `x` and `y`, `column`, `value`, and `row`.

`table-draw` fires after cell descriptors have been applied to every rendered viewport, including user
scrolling. It has no detail; the event listener's current target is the `RegularTable` element.

`viewport-change` bubbles and crosses shadow boundaries after table draws and internal scrolling.
Notifications are coalesced per animation frame and stop while the table is disconnected. Re-query
geometry when it fires. For external layout changes, also observe ancestor scrolling and resizing.

## Cell values

Strings, numbers, booleans, and `null` are passed as scalar values. `undefined` renders as an empty
string. Other values are JSON-encoded for display.

## `package`

`spaday_regular_table.package` is named `regular-table`. It serves the Material table CSS followed by
the self-contained browser registration bundle. Its `components` collection contains `RegularTable`;
`catalog` returns the wrapper's property, event, and slot schema.
