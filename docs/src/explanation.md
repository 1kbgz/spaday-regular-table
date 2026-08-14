# Why viewport virtualization matters

A conventional HTML table creates one DOM row for every record. That model is straightforward for a
few hundred rows, but layout, paint, and memory costs grow with the entire dataset even though the user
can see only a small viewport.

Regular Table inverts that relationship. It asks a data listener for coordinates around the current
viewport and reuses a bounded set of cells while the user scrolls. The spaday wrapper keeps records in a
browser-side array and copies only the requested row and column slice into each response. A 100,000-row
dataset therefore does not imply 100,000 DOM rows.

Rich cells follow the same constraint. `table-draw` runs after the viewport is rendered, allowing an
application to decorate only visible cells. When scrolling reuses those cells, the handler runs again.
This is why rich renderers should be small, deterministic browser functions rather than component trees
for every offscreen row.

The wrapper deliberately omits pivoting, sorting, and aggregation. Perspective is a better fit when the
browser needs an analytical engine. Regular Table is the smaller choice when application code already
owns row order and needs fast display, direct record mutation, and custom visible-cell behavior.
