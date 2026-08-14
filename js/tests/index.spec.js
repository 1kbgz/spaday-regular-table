import { expect, test } from "@playwright/test";

test("virtualizes large record sets, redraws, and reports cell metadata", async ({
  page,
}) => {
  await page.goto("/dist/index.html");
  await page.evaluate(() => {
    const table = document.createElement("spaday-regular-table");
    table.style.cssText = "display:block;width:800px;height:300px";
    table.columns = ["id", "symbol", { key: "price", label: "Last" }];
    table.rows = Array.from({ length: 100_000 }, (_, id) => ({
      id,
      symbol: `SYM${id}`,
      price: id / 10,
    }));
    table.addEventListener("table-draw", () => {
      for (const cell of table.querySelectorAll("tbody td")) {
        const meta = table.getMeta(cell);
        if (meta?.column !== "symbol" || meta.y !== 0) continue;
        const button = document.createElement("button");
        button.textContent = meta.row.symbol;
        button.addEventListener("click", () => {
          window.__buttonClicks = (window.__buttonClicks || 0) + 1;
        });
        cell.replaceChildren(button);
      }
    });
    table.addEventListener("cell-click", (event) => {
      window.__cell = event.detail;
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
  await page.locator("spaday-regular-table tbody button").click();
  await expect.poll(() => page.evaluate(() => window.__buttonClicks)).toBe(1);

  await page.locator("spaday-regular-table").evaluate((table) => {
    table.updateRow(0, { symbol: "UPDATED" });
  });
  await expect(page.locator("spaday-regular-table tbody")).toContainText(
    "UPDATED",
  );

  expect(
    await page.locator("spaday-regular-table").evaluate((table) => {
      const inserted = table.insertRow(0, {
        id: -1,
        symbol: "INSERTED",
        price: 0,
      });
      const removed = table.removeRow(1);
      return { inserted, removed: removed.symbol, length: table.rows.length };
    }),
  ).toEqual({ inserted: true, removed: "UPDATED", length: 100_000 });
  await expect(page.locator("spaday-regular-table tbody")).toContainText(
    "INSERTED",
  );
});
