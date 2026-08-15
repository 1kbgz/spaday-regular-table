import asyncio
import json
import logging
from typing import Any

import uvicorn
from spaday import CallEndpoint, SetProp, by_id, element, event_value
from spaday.backends.starlette import serve
from starlette.responses import JSONResponse, StreamingResponse
from starlette.routing import Route

from spaday_regular_table import RegularTable, package

logger = logging.getLogger("uvicorn.error")

venues = ("XNAS", "XNYS", "ARCX", "BATS")
states = ("Open", "Working", "Filled")
rows = [
    {
        "id": index,
        "symbol": f"SYM{index:05d}",
        "venue": venues[index % len(venues)],
        "price": round(98 + index / 100 + (index % 7) * 0.13, 2),
        "change": round(((index % 19) - 9) / 10, 2),
        "volume": 25_000 + (index * 7_919) % 4_000_000,
        "state": states[index % len(states)],
    }
    for index in range(100_000)
]


def market_row(index: int, symbol: str | None = None) -> dict[str, Any]:
    return {
        "id": index,
        "symbol": symbol or f"LIVE{index:05d}",
        "venue": venues[index % len(venues)],
        "price": round(102 + (index % 97) * 0.11, 2),
        "change": round(((index % 17) - 8) / 10, 2),
        "volume": 50_000 + (index * 3_571) % 3_000_000,
        "state": states[index % len(states)],
    }


revision = 0
subscribers: set[asyncio.Queue] = set()


def publish(*operations: dict[str, Any]) -> dict[str, Any]:
    global revision
    revision += 1
    patch = {"revision": revision, "operations": list(operations)}
    for subscriber in subscribers:
        subscriber.put_nowait(patch)
    return patch


next_stream_id = 100_000


async def row_stream(_request):
    queue: asyncio.Queue = asyncio.Queue()
    subscribers.add(queue)

    async def events():
        try:
            while True:
                patch = await queue.get()
                yield f"data: {json.dumps(patch)}\n\n"
        finally:
            subscribers.discard(queue)

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


async def stream_rows() -> None:
    global next_stream_id
    while True:
        await asyncio.sleep(2)
        row = market_row(next_stream_id)
        next_stream_id += 1
        rows.insert(0, row)
        rows.pop()
        publish(
            {"type": "insert", "index": 0, "row": row},
            {"type": "remove", "index": 100_000},
        )
        logger.info("Table row streamed from server: %s", row["symbol"])


next_inserted_id = -1


async def table_action(request):
    global next_inserted_id
    action = request.path_params["action"]
    payload = await request.json()
    if action == "click":
        logger.info("Table cell click received from browser: %s", payload)
        row = payload.get("row", {})
        return JSONResponse({"message": f"Server received click on {row.get('symbol', 'a cell')}"})

    if action == "update":
        changes = {"price": round(float(rows[0]["price"]) + 1, 2), "change": 1}
        rows[0] = {**rows[0], **changes}
        patch = publish({"type": "update", "index": 0, "changes": changes})
        message = f"Server updated {rows[0]['symbol']} to ${rows[0]['price']:.2f}"
    elif action == "insert":
        row = market_row(next_inserted_id, f"NEW{abs(next_inserted_id)}")
        next_inserted_id -= 1
        rows.insert(0, row)
        patch = publish({"type": "insert", "index": 0, "row": row})
        message = f"Server inserted {row['symbol']}"
    elif action == "remove":
        removed = rows.pop(0)
        patch = publish({"type": "remove", "index": 0})
        message = f"Server removed {removed['symbol']}"
    else:
        return JSONResponse({"message": f"Unknown action: {action}"}, status_code=404)

    logger.info("Table %s received from browser: %s", action, payload)
    return JSONResponse({"message": message, "patch": patch})


table = (
    RegularTable(
        columns=[
            {
                "key": "symbol",
                "label": "Symbol",
                "cell": {
                    "tag": "button",
                    "class": "symbol-button",
                    "title": "Send this row to Python",
                    "event": "symbol-click",
                    "attributes": {"type": "button"},
                },
            },
            {"key": "venue", "label": "Venue"},
            {"key": "price", "label": "Last price", "cell": {"format": "number", "digits": 2}},
            {
                "key": "change",
                "label": "Change",
                "cell": {
                    "format": "percent",
                    "digits": 2,
                    "signed": True,
                    "positive_class": "positive",
                    "negative_class": "negative",
                },
            },
            {"key": "volume", "label": "Volume", "cell": {"format": "number"}},
            {"key": "state", "label": "Status", "cell": {"tag": "span", "class": "state-badge"}},
        ],
        rows=rows,
        row_header="id",
        row_height=36,
        stream_url="/api/table/stream",
        id="orders",
    )
    .bind("rowPatch", "action_result.body.patch")
    .on("symbol-click", CallEndpoint("POST", "/api/table/click", event_value(), result="action_result"))
    .on("row-patch", SetProp(by_id("stream-status"), "textContent", "Applied server row patch"))
)


def action_button(label: str, action: str):
    return (
        element("button")
        .text(label)
        .on(
            "click",
            CallEndpoint("POST", f"/api/table/{action}", {"source": "toolbar"}, result="action_result"),
        )
    )


page = element(
    "main",
    element(
        "header",
        element("div", element("p", class_="eyebrow").text("VIRTUALIZED BLOTTER"), element("h1").text("Regular Table")),
        element("div", element("strong").text("100,000"), element("span").text(" browser-side rows"), class_="record-count"),
        class_="page-header",
    ),
    element("p", class_="lede").text("Rich cells and granular row patches, authored entirely in Python."),
    element(
        "section",
        element(
            "div",
            action_button("Update first row", "update"),
            action_button("Insert row", "insert"),
            action_button("Remove first row", "remove"),
            class_="toolbar-actions",
        ),
        element(
            "div",
            element("span", id="stream-status", class_="status").text("Connecting to server stream"),
            element("span", class_="status action-status").bind("textContent", "action_result.body.message"),
            class_="statuses",
        ),
        class_="toolbar",
    ),
    element("section", table, class_="table-shell"),
    element("p", class_="footnote").text("Buttons, formatting, REST actions, and live row patches are Python-authored serializable data."),
    class_="page",
)


styles = """
<style>
  body { margin: 0; min-height: 100vh; background: #eef2f6; color: #172033;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  .page { box-sizing: border-box; max-width: 72rem; margin: 0 auto; padding: 2.5rem 1.25rem; }
  .page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; }
  .eyebrow { margin: 0; color: #2563eb; font-size: .72rem; font-weight: 800; letter-spacing: .16em; }
  h1 { margin: .2rem 0 0; font-size: clamp(2rem, 5vw, 3rem); letter-spacing: -.04em; }
  .lede { margin: .5rem 0 1.5rem; color: #64748b; }
  .record-count { padding: .7rem 1rem; border: 1px solid #cbd5e1; border-radius: .75rem; background: #fff; box-shadow: 0 6px 18px rgba(15,23,42,.05); }
  .record-count strong { font-size: 1.15rem; } .record-count span { color: #64748b; font-size: .82rem; }
  .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .85rem 1rem;
    border: 1px solid #dbe3ee; border-bottom: 0; border-radius: .9rem .9rem 0 0; background: #fff; }
  .toolbar-actions { display: flex; gap: .55rem; }
  button { border: 1px solid #cbd5e1; border-radius: .55rem; padding: .55rem .8rem; background: #fff; color: #334155; cursor: pointer; font-weight: 700; }
  button:hover { border-color: #2563eb; color: #1d4ed8; background: #eff6ff; }
  .status { color: #64748b; font-size: .82rem; text-align: right; }
  .statuses { display: grid; gap: .2rem; }
  .action-status { color: #2563eb; min-height: 1rem; }
  .table-shell { height: min(68vh, 38rem); overflow: hidden; border: 1px solid #dbe3ee; border-radius: 0 0 .9rem .9rem;
    background: #fff; box-shadow: 0 18px 45px rgba(15,23,42,.08); }
  #orders { width: 100%; height: 100%; min-width: 0; }
  #orders regular-table { box-sizing: border-box; padding: 0; background: #fff; scrollbar-color: #94a3b8 #f1f5f9; }
  #orders regular-table table { color: #334155; border-collapse: separate; border-spacing: 0; }
  #orders .rt-col-0 { width: 4rem; min-width: 4rem; max-width: 4rem; }
  #orders .rt-col-1 { width: 12rem; min-width: 12rem; max-width: 12rem; }
  #orders .rt-col-2 { width: 9rem; min-width: 9rem; max-width: 9rem; }
  #orders .rt-col-3 { width: 11rem; min-width: 11rem; max-width: 11rem; }
  #orders .rt-col-4 { width: 10rem; min-width: 10rem; max-width: 10rem; }
  #orders .rt-col-5 { width: 12rem; min-width: 12rem; max-width: 12rem; }
  #orders .rt-col-6 { width: 10rem; min-width: 10rem; max-width: 10rem; }
  #orders regular-table td, #orders regular-table th { height: 36px; padding-inline: 12px; font-size: 13px; border-bottom: 1px solid #edf2f7; }
  #orders regular-table thead tr:last-child th { height: 40px; border-bottom: 1px solid #cbd5e1; background: #f8fafc; color: #475569; font-weight: 800; }
  #orders regular-table tbody tr:hover td { background: #eff6ff; }
  #orders regular-table td.positive { color: #047857; font-weight: 700; }
  #orders regular-table td.negative { color: #be123c; font-weight: 700; }
  .symbol-button { border: 0; padding: .25rem .45rem; background: transparent; color: #1d4ed8; font: inherit; font-weight: 800; }
  .state-badge { display: inline-block; min-width: 3.8rem; padding: .18rem .45rem; border-radius: 999px; background: #e0e7ff; color: #3730a3; text-align: center; font-size: .72rem; font-weight: 800; }
  .footnote { margin: .75rem .25rem 0; color: #64748b; font-size: .8rem; }
  @media (max-width: 700px) { .page { padding: 1rem .5rem; } .page-header, .toolbar { align-items: flex-start; flex-direction: column; }
    .toolbar-actions { flex-wrap: wrap; } .status { text-align: left; } }
</style>
"""

app = serve(
    page,
    packages=[package],
    routes=[
        Route("/api/table/stream", row_stream),
        Route("/api/table/{action}", table_action, methods=["POST"]),
    ],
    background=[stream_rows()],
    store={"action_result": {"body": {"message": "Actions round-trip through Python"}}},
    head=styles,
    title="spaday-regular-table example",
)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8014)
