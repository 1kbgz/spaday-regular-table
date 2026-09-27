import json
from pathlib import Path
from typing import Any

from spaday import ComponentPackage, Token
from spaday.component import Child

from .components import SpadayRegularTable

__version__ = "0.3.0"


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


# the exact version of each JS library the package serves, written by its JS build
_VERSIONS = Path(__file__).parent / "extension" / "versions.json"

package = ComponentPackage(
    name="regular-table",
    assets_dir=Path(__file__).parent / "extension",
    assets=(("css", "css/material.css"), ("css", "css/theme.css"), ("js", "cdn/index.js")),
    components=(RegularTable,),
    provides=json.loads(_VERSIONS.read_text(encoding="utf-8")) if _VERSIONS.exists() else {},
)


#: ``css()`` kwarg → (CSS custom property, what it controls). Each defaults to the shell token it belongs to, so re-theming
#: the shell carries the table with it; set these to theme the table alone.
TOKENS = {
    "spa_regular_table_text": Token("--spa-regular-table-text", "cell text color", fallback="--spa-text"),
    "spa_regular_table_border": Token("--spa-regular-table-border", "header rule under the last header row", fallback="--spa-border"),
    "spa_regular_table_row_hover": Token("--spa-regular-table-row-hover", "hovered row background", fallback="--spa-surface-2"),
    "spa_regular_table_row_hover_text": Token("--spa-regular-table-row-hover-text", "hovered row text color"),
    "spa_regular_table_scrollbar": Token("--spa-regular-table-scrollbar", "scrollbar thumb color"),
    "spa_regular_table_scrollbar_hover": Token("--spa-regular-table-scrollbar-hover", "scrollbar thumb color while hovered"),
}

__all__ = ["TOKENS", "RegularTable", "package"]
