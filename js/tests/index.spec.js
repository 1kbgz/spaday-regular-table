import { expect, test } from "@playwright/test";

test("renders rich cells and applies Python-shaped row patches", async ({
  page,
}) => {
  await page.goto("/dist/index.html");
  await page.evaluate(() => {
    window.EventSource = class {
      constructor(url) {
        this.url = url;
        this.listeners = {};
        window.__stream = this;
      }
      addEventListener(name, listener) {
        this.listeners[name] = listener;
      }
      close() {}
      emit(name, data) {
        this.listeners[name]?.({ data });
      }
    };
    const table = document.createElement("spaday-regular-table");
    table.style.cssText = "display:block;width:800px;height:300px";
    table.columns = [
      "id",
      {
        key: "symbol",
        label: "Symbol",
        cell: {
          tag: "button",
          class: "symbol-button",
          event: "symbol-activate",
          attributes: { type: "button" },
        },
      },
      {
        key: "price",
        label: "Last",
        cell: { format: "number", digits: 2, positive_class: "gain" },
      },
    ];
    table.rows = Array.from({ length: 100_000 }, (_, id) => ({
      id,
      symbol: `SYM${id}`,
      price: id / 10,
    }));
    table.streamUrl = "/rows";
    table.addEventListener("cell-click", (event) => {
      window.__cell = event.detail;
    });
    table.addEventListener("symbol-activate", (event) => {
      window.__symbol = event.detail;
    });
    table.addEventListener("row-patch", (event) => {
      window.__patch = event.detail;
    });
    document.body.appendChild(table);
  });

  await expect(
    page.locator("spaday-regular-table tbody td").first(),
  ).toBeVisible();
  expect(
    await page.locator("spaday-regular-table tbody tr").count(),
  ).toBeLessThan(100);

  await page.locator("spaday-regular-table tbody td").first().click();
  await expect.poll(() => page.evaluate(() => window.__cell?.y)).toBe(0);
  expect(await page.evaluate(() => window.__cell.row.id)).toBe(0);
  const symbolButton = page
    .locator("spaday-regular-table tbody button")
    .first();
  await expect(symbolButton).toHaveText("SYM0");
  await expect(symbolButton).toHaveAttribute("type", "button");
  await symbolButton.click();
  await expect
    .poll(() => page.evaluate(() => window.__cell?.column))
    .toBe("symbol");
  await expect
    .poll(() => page.evaluate(() => window.__symbol?.row.symbol))
    .toBe("SYM0");
  await expect(
    page.locator("spaday-regular-table tbody td.gain").first(),
  ).toHaveText("0.00");

  await page.locator("spaday-regular-table").evaluate((table) => {
    table.rowPatch = {
      revision: 1,
      operations: [
        { type: "update", index: 0, changes: { symbol: "UPDATED" } },
      ],
    };
  });
  await expect(page.locator("spaday-regular-table tbody")).toContainText(
    "UPDATED",
  );

  expect(
    await page.locator("spaday-regular-table").evaluate((table) => {
      table.rowPatch = {
        revision: 2,
        operations: [
          {
            type: "insert",
            index: 0,
            row: { id: -1, symbol: "INSERTED", price: 1 },
          },
          { type: "remove", index: 1 },
        ],
      };
      return { first: table.rows[0].symbol, length: table.rows.length };
    }),
  ).toEqual({ first: "INSERTED", length: 100_000 });
  await expect(page.locator("spaday-regular-table tbody")).toContainText(
    "INSERTED",
  );

  await page.evaluate(() => {
    window.__stream.emit(
      "message",
      JSON.stringify({
        revision: 3,
        operations: [
          {
            type: "insert",
            index: 0,
            row: { id: -2, symbol: "STREAMED", price: 2 },
          },
        ],
      }),
    );
  });
  await expect(page.locator("spaday-regular-table tbody")).toContainText(
    "STREAMED",
  );
  expect(await page.evaluate(() => window.__stream.url)).toBe("/rows");
  expect(await page.evaluate(() => window.__patch.revision)).toBe(3);

  await page.locator("spaday-regular-table").evaluate((table) => {
    table.rowPatch = {
      revision: 2,
      operations: [{ type: "remove", index: 0 }],
    };
  });
  expect(
    await page
      .locator("spaday-regular-table")
      .evaluate((table) => table.rows[0].symbol),
  ).toBe("STREAMED");
});
