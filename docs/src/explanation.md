# Why viewport virtualization matters

A conventional HTML table creates one DOM row for every record. That model is straightforward for a
few hundred rows, but layout, paint, and memory costs grow with the entire dataset even though the user
can see only a small viewport.

Regular Table inverts that relationship. It asks a data listener for coordinates around the current
viewport and reuses a bounded set of cells while the user scrolls. The spaday wrapper keeps records in a
browser-side array and copies only the requested row and column slice into each response. A 100,000-row
dataset therefore does not imply 100,000 DOM rows.

Rich cells follow the same constraint. Serializable `cell` descriptors are interpreted by the wrapper
after the viewport is rendered. When scrolling reuses cells, it recreates only their small visible
content. Python therefore controls the element tag, formatting, classes, attributes, and spaday action
attached to the table without shipping an application callback script.

Granular row changes use the same adapter boundary. Python sends a small `rowPatch` operation batch
through a bound action result or an SSE `stream_url`; the wrapper translates it to regular-table's
imperative row methods. spaday remains responsible for serializable UI configuration, while the peer
package owns library-specific DOM, streaming, and redraw mechanics.

The wrapper deliberately omits pivoting, sorting, and aggregation. Perspective is a better fit when the
browser needs an analytical engine. Regular Table is the smaller choice when application code already
owns row order and needs fast display, direct record mutation, and custom visible-cell behavior.
