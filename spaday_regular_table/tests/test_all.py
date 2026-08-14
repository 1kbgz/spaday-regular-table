import ast
from pathlib import Path

from spaday import NamedJs, generate
from spaday.bootstrap import bootstrap

from spaday_regular_table import RegularTable, package


def test_regular_table_serializes_virtualized_records_and_event():
    node = (
        RegularTable(columns=["id", {"key": "price", "label": "Last"}], rows=[{"id": 1, "price": 3.5}], row_header="id")
        .on("cell-click", NamedJs("inspectCell"))
        .to_node()
    )
    assert node["tag"] == "spaday-regular-table"
    assert node["props"]["rows"]["List"][0]["Map"]["id"] == {"Int": 1}
    assert node["events"]["cell-click"] == {"kind": "js", "handler": "inspectCell"}


def test_package_drives_bootstrap_assets():
    html = bootstrap(packages=[package])
    assert 'href="/components/regular-table/css/material.css"' in html
    assert 'src="/components/regular-table/cdn/index.js"' in html


def test_generated_component_is_current():
    root = Path(__file__).parent.parent
    fresh = generate(str(root / "components.cem.json"))
    assert ast.dump(ast.parse(fresh)) == ast.dump(ast.parse((root / "components.py").read_text(encoding="utf-8")))
