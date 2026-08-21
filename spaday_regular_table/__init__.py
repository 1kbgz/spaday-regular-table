from pathlib import Path
from typing import Any

from spaday import ComponentPackage
from spaday.component import Child

from .components import SpadayRegularTable

__version__ = "0.2.0"


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


__all__ = ["RegularTable", "package"]
