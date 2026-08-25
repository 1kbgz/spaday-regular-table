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

test("runs the Python table with streaming and row actions", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:8014");
  const table = page.locator("spaday-regular-table");
  await expect(table.locator("tbody button").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator("#stream-status")).toHaveText(
    "Applied server row patch",
    { timeout: 6_000 },
  );

  await table.locator("tbody button").first().click();
  await expect(page.locator(".action-status")).toContainText(
    "Server received click",
  );
  await page.getByRole("button", { name: "Insert row" }).click();
  await expect(page.locator(".action-status")).toContainText("Server inserted");
});

test("the material theme follows the wa-dark page mode", async ({ page }) => {
  await page.goto("/dist/index.html");
  await page.evaluate(() => {
    const table = document.createElement("spaday-regular-table");
    table.style.cssText = "display:block;width:400px;height:200px";
    table.columns = ["id"];
    table.rows = [{ id: 1 }, { id: 2 }];
    document.body.appendChild(table);
  });
  const th = page
    .locator("spaday-regular-table thead tr:last-child th")
    .first();
  const inner = page.locator("spaday-regular-table table").first();
  await expect(th).toBeVisible();
  await expect(th).toHaveCSS("border-bottom-color", "rgb(221, 221, 221)"); // material's light #ddd
  await expect(inner).toHaveCSS("color", "rgb(102, 102, 102)"); // #666

  await page.evaluate(() => document.documentElement.classList.add("wa-dark"));
  await expect(th).toHaveCSS("border-bottom-color", "rgb(51, 59, 69)"); // #333b45, the shell's dark border
  await expect(inner).toHaveCSS("color", "rgb(154, 163, 173)"); // #9aa3ad, the shell's dark muted

  // a wa-light island flips back
  await page.evaluate(() => {
    const island = document.createElement("div");
    island.className = "wa-light";
    island.appendChild(document.querySelector("spaday-regular-table"));
    document.body.appendChild(island);
  });
  await expect(th).toHaveCSS("border-bottom-color", "rgb(221, 221, 221)");

  await page.evaluate(() =>
    document.documentElement.classList.remove("wa-dark"),
  );
  await expect(inner).toHaveCSS("color", "rgb(102, 102, 102)");
});

test("survives another bundle registering regular-table first", async ({
  page,
}) => {
  await page.goto("/dist/index.html");
  const r = await page.evaluate(async () => {
    // simulate spaday-perspective's viewer-datagrid having won the registration
    // race for the regular-table engine element
    const rig = document.createElement("iframe");
    document.body.appendChild(rig);
    const win = rig.contentWindow;
    const errors = [];
    win.addEventListener("error", (e) => errors.push(String(e.message)));
    win.customElements.define(
      "regular-table",
      class extends win.HTMLElement {},
    );
    let imported = true;
    try {
      await win.eval(`import("${location.origin}/dist/cdn/index.js")`);
    } catch (error) {
      imported = false;
      errors.push(String(error));
    }
    return {
      imported,
      wrapperDefined: !!win.customElements.get("spaday-regular-table"),
      defineRestored: String(win.customElements.define).includes("native code"),
      errors,
    };
  });
  expect(r.errors).toEqual([]);
  expect(r.imported).toBe(true); // the bundle no longer dies on the duplicate define
  expect(r.wrapperDefined).toBe(true);
  expect(r.defineRestored).toBe(true); // the guard did not leak past the engine import
});
