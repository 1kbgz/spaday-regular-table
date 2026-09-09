from pathlib import Path
from typing import Any

from spaday import ComponentPackage
from spaday.component import Child

from .components import SpadayRegularTable

__version__ = "0.2.1"


class RegularTable(SpadayRegularTable):
    """Python-friendly constructor for the viewport-virtualized table."""

    def __init__(
        self,
        *children: Child,
        key: str | None = None,
        columns: Any = None,
        rows: Any = None,
        row_patch: Any = None,
        stream_url: str | None = None,
        virtual_mode: str | None = None,
        row_header: str | None = None,
        row_height: float | None = None,
        **props: Any,
    ) -> None:
        super().__init__(
            *children,
            key=key,
            columns=columns,
            rows=rows,
            rowPatch=row_patch,
            streamUrl=stream_url,
            virtualMode=virtual_mode,
            rowHeader=row_header,
            rowHeight=row_height,
            **props,
        )


package = ComponentPackage(
    name="regular-table",
    assets_dir=Path(__file__).parent / "extension",
    assets=(("css", "css/material.css"), ("css", "css/theme.css"), ("js", "cdn/index.js")),
    components=(RegularTable,),
)


#: ``css()`` kwarg → (CSS custom property, what it controls), in the shape of
#: :data:`spaday.theme.SHELL_TOKENS`. Each defaults to the shell token it belongs to, so re-theming
#: the shell carries the table with it; set these to theme the table alone.
TOKENS = {
    "spa_regular_table_text": ("--spa-regular-table-text", "cell text color (defaults to --spa-muted)"),
    "spa_regular_table_border": ("--spa-regular-table-border", "header rule under the last header row (defaults to --spa-border)"),
    "spa_regular_table_row_hover": ("--spa-regular-table-row-hover", "hovered row background (defaults to --spa-surface-2)"),
    "spa_regular_table_row_hover_text": ("--spa-regular-table-row-hover-text", "hovered row text color"),
    "spa_regular_table_scrollbar": ("--spa-regular-table-scrollbar", "scrollbar thumb color"),
    "spa_regular_table_scrollbar_hover": ("--spa-regular-table-scrollbar-hover", "scrollbar thumb color while hovered"),
}

__all__ = ["TOKENS", "RegularTable", "package"]
