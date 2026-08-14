import ast
from pathlib import Path

from spaday import NamedJs, generate
from spaday.bootstrap import bootstrap

from spaday_regular_table import RegularTable, package


def _generated_ast(source: str) -> str:
    class Normalize(ast.NodeTransformer):
        def visit_ImportFrom(self, node):
            if node.module == "typing":
                node.names = [name for name in node.names if name.name != "Optional"]
            return node

        def visit_Subscript(self, node):
            node = self.generic_visit(node)
            if isinstance(node.value, ast.Name) and node.value.id == "Optional":
                return ast.BinOp(left=node.slice, op=ast.BitOr(), right=ast.Constant(value=None))
            return node

        def visit_Assign(self, node):
            node = self.generic_visit(node)
            if any(isinstance(target, ast.Name) and target.id == "__all__" for target in node.targets):
                node.value.elts.sort(key=ast.unparse)
            return node

    return ast.dump(Normalize().visit(ast.parse(source)))


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
    assert _generated_ast(fresh) == _generated_ast((root / "components.py").read_text(encoding="utf-8"))
