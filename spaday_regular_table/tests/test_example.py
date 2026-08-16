import asyncio

import httpx

from spaday_regular_table import example


async def request(method: str, path: str, **kwargs):
    transport = httpx.ASGITransport(app=example.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://example") as client:
        return await client.request(method, path, **kwargs)


def test_example_serves_table_and_round_trips_row_actions():
    response = asyncio.run(request("GET", "/tree.json"))
    assert response.status_code == 200
    assert "spaday-regular-table" in response.text

    initial_length = len(example.rows)
    response = asyncio.run(request("POST", "/api/table/update", json={"source": "test"}))
    assert response.status_code == 200
    assert response.json()["patch"]["operations"][0]["type"] == "update"

    response = asyncio.run(request("POST", "/api/table/insert", json={"source": "test"}))
    inserted = example.rows[0]
    assert len(example.rows) == initial_length + 1
    assert response.json()["patch"]["operations"][0]["row"] == inserted

    response = asyncio.run(request("POST", "/api/table/click", json={"row": inserted}))
    assert response.json() == {"message": f"Server received click on {inserted['symbol']}"}

    response = asyncio.run(request("POST", "/api/table/remove", json={"source": "test"}))
    assert response.json()["patch"]["operations"][0]["type"] == "remove"
    assert len(example.rows) == initial_length
