# API reference

## `RegularTable`

Tag: `<spaday-regular-table>`.

| Python argument | Browser prop  | Type                                        | Default  |
| --------------- | ------------- | ------------------------------------------- | -------- |
| `rows`          | `rows`        | list of records                             | `[]`     |
| `columns`       | `columns`     | keys or `{key, label}` mappings             | inferred |
| `virtual_mode`  | `virtualMode` | `both`, `horizontal`, `vertical`, or `none` | `both`   |
| `row_header`    | `rowHeader`   | record key or `None`                        | `None`   |
| `row_height`    | `rowHeight`   | positive number or `None`                   | `None`   |

```{eval-rst}
.. autoclass:: spaday_regular_table.RegularTable
   :members:
```

## Browser methods

| Method                      | Return                  | Description                              |
| --------------------------- | ----------------------- | ---------------------------------------- |
| `updateRow(index, changes)` | `boolean`               | Merges fields into an existing row.      |
| `insertRow(index, row)`     | `boolean`               | Inserts a row at an exact virtual index. |
| `removeRow(index)`          | row or `undefined`      | Removes and returns one row.             |
| `getMeta(element)`          | metadata or `undefined` | Resolves a rendered cell or descendant.  |

Mutation methods return `false` or `undefined` for a non-integer or out-of-range index. Successful
mutations schedule one animation-frame-coalesced viewport redraw.

## Events

`cell-click` detail contains `type`, virtual `x` and `y`, `column`, `value`, and `row`.

`table-draw` fires after every rendered viewport, including user scrolling. It has no detail; the event
listener's current target is the `RegularTable` element.

## Cell values

Strings, numbers, booleans, and `null` are passed as scalar values. `undefined` renders as an empty
string. Other values are JSON-encoded for display.

## `package`

`spaday_regular_table.package` is named `regular-table`. It serves the Material table CSS followed by
the self-contained browser registration bundle.
