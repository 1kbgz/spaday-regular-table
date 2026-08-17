import ast
from pathlib import Path

from spaday import CallEndpoint, event_value, generate
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


def test_generated_ast_normalizes_optional_annotations():
    legacy = "from typing import Optional\nvalue: Optional[str]"
    modern = "from typing import Optional\nvalue: str | None"
    assert _generated_ast(legacy) == _generated_ast(modern)


def test_regular_table_serializes_rich_columns_row_patch_and_event():
    node = (
        RegularTable(
            columns=["id", {"key": "price", "label": "Last", "cell": {"format": "number", "digits": 2}}],
            rows=[{"id": 1, "price": 3.5}],
            row_patch={"revision": 1, "operations": [{"type": "update", "index": 0, "changes": {"price": 4.5}}]},
            stream_url="/api/table/stream",
            row_header="id",
        )
        .on("price-click", CallEndpoint("POST", "/api/click", event_value()))
        .to_node()
    )
    assert node["tag"] == "spaday-regular-table"
    assert node["props"]["rows"]["List"][0]["Map"]["id"] == {"Int": 1}
    assert node["props"]["rowPatch"]["Map"]["operations"]["List"][0]["Map"]["type"] == {"Str": "update"}
    assert node["props"]["streamUrl"] == {"Str": "/api/table/stream"}
    assert node["events"]["price-click"]["kind"] == "call"


def test_package_drives_bootstrap_assets():
    html = bootstrap(packages=[package])
    assert [(schema.tag, schema.class_name) for schema in package.catalog] == [("spaday-regular-table", "RegularTable")]
    assert 'href="/components/regular-table/css/material.css"' in html
    assert 'src="/components/regular-table/cdn/index.js"' in html


def test_generated_component_is_current():
    root = Path(__file__).parent.parent
    fresh = generate(str(root / "components.cem.json"))
    assert _generated_ast(fresh) == _generated_ast((root / "components.py").read_text(encoding="utf-8"))
