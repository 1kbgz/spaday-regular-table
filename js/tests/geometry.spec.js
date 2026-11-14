import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/dist/index.html");
  await page.evaluate(() => {
    customElements.define(
      "rich-value",
      class extends HTMLElement {
        connectedCallback() {
          (this.shadowRoot ?? this.attachShadow({ mode: "open" })).innerHTML =
            "<button>Value</button>";
        }
      },
    );
    const table = document.createElement("spaday-regular-table");
    table.id = "records";
    table.style.cssText = "width:600px;height:250px";
    table.columns = ["id", { key: "value", cell: { tag: "rich-value" } }];
    table.rows = Array.from({ length: 10000 }, (_, id) => ({
      id: `record-${id}`,
      value: id,
    }));
    window.viewportEvents = 0;
    table.addEventListener("viewport-change", () => window.viewportEvents++);
    document.body.append(table);
  });
  await expect(page.locator("tbody td").first()).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.viewportEvents))
    .toBeGreaterThan(0);
});

test("public geometry resolves virtual records and rich cells without selecting", async ({
  page,
}) => {
  const result = await page.locator("#records").evaluate((table) => {
    const row = table.getRowBounds(0);
    const cell = table.getCellBounds(0, "value");
    const button = table
      .querySelector("rich-value")
      .shadowRoot.querySelector("button")
      .getBoundingClientRect();
    const x = button.x + button.width / 2,
      y = button.y + button.height / 2;
    const header = table.querySelector("thead th").getBoundingClientRect();
    return {
      rowWidth: row.bounds.width,
      cellWidth: cell.bounds.width,
      hit: table.getCellAtPoint(x, y),
      index: table.getRowAtPoint(x, y),
      header: table.getRowAtPoint(header.x + 2, header.y + 2),
      invalid: [
        table.getRowAtPoint(NaN, 0),
        table.getRowAtPoint(0, Infinity),
        table.getRowAtPoint(-1, -1),
        table.getRowBounds(-1),
        table.getRowBounds(0.5),
        table.getRowBounds(9999),
        table.getCellBounds(0, "missing"),
      ],
      scroll: table.querySelector("regular-table").scrollTop,
    };
  });
  expect(result.rowWidth).toBeGreaterThan(result.cellWidth);
  expect(result.hit).toMatchObject({
    y: 0,
    column: "value",
    row: { id: "record-0" },
  });
  expect(result.index).toBe(0);
  expect(result.header).toBeUndefined();
  expect(result.invalid.every((value) => value === undefined)).toBe(true);
  expect(result.scroll).toBe(0);

  await page
    .locator("#records")
    .evaluate((table) => table.insertRow(0, { id: "new", value: -1 }));
  await expect(page.locator("tbody td").first()).toHaveText("new");
  expect(
    await page.locator("#records").evaluate((table) => {
      const index = table.rows.findIndex((row) => row.id === "record-0");
      const { visibleBounds: b } = table.getCellBounds(index, "id");
      return table.getCellAtPoint(b.x + b.width / 2, b.y + b.height / 2).row.id;
    }),
  ).toBe("record-0");
});

test("bounds follow virtualization, clipping, hidden content, and hit occlusion", async ({
  page,
}) => {
  await page.locator("#records").evaluate((table) => {
    window.viewportEvents = 0;
    table.querySelector("regular-table").scrollTop = 1500;
  });
  await expect
    .poll(() => page.evaluate(() => window.viewportEvents))
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.locator("#records").evaluate((table) => table.getRowBounds(0)),
    )
    .toBeUndefined();
  expect(
    await page.locator("#records").evaluate((table) => {
      const { y } = table.getMeta(table.querySelector("tbody td"));
      return y;
    }),
  ).toBeGreaterThan(0);
  await page.locator("#records").evaluate((table) => {
    table.querySelector("regular-table").scrollTop = 0;
  });
  await expect
    .poll(() =>
      page.locator("#records").evaluate((table) => !!table.getRowBounds(0)),
    )
    .toBe(true);

  const clipped = await page.locator("#records").evaluate((table) => {
    const { bounds } = table.getRowBounds(0);
    const wrapper = document.createElement("div");
    wrapper.style.cssText = `overflow:hidden;width:200px;height:${bounds.top + bounds.height / 2 - table.getBoundingClientRect().top}px`;
    table.before(wrapper);
    wrapper.append(table);
    const result = table.getRowBounds(0);
    return {
      width: result.visibleBounds.width,
      height: result.visibleBounds.height,
      fullHeight: result.bounds.height,
    };
  });
  expect(clipped.width).toBeLessThanOrEqual(200);
  expect(clipped.height).toBeGreaterThan(0);
  expect(clipped.height).toBeLessThan(clipped.fullHeight);
  expect(
    await page.locator("#records").evaluate((table) => {
      const b = table.getRowBounds(0).visibleBounds;
      const cover = document.createElement("div");
      cover.style.cssText =
        "position:fixed;inset:0;z-index:100;background:white";
      document.body.append(cover);
      const hit = table.getRowAtPoint(b.x + 1, b.y + 1);
      cover.remove();
      table.style.visibility = "hidden";
      return { hit, hidden: table.getRowBounds(0) };
    }),
  ).toEqual({ hit: undefined, hidden: undefined });
});

test("viewport notifications stop on disconnect and resume after reconnect", async ({
  page,
}) => {
  const result = await page.locator("#records").evaluate(async (table) => {
    const frame = () =>
      new Promise((resolve) => requestAnimationFrame(resolve));
    await frame();
    await frame();
    table.querySelector("regular-table").dispatchEvent(new Event("scroll"));
    table.remove();
    window.viewportEvents = 0;
    await frame();
    await frame();
    const disconnected = {
      events: window.viewportEvents,
      bounds: table.getRowBounds(0),
      hit: table.getRowAtPoint(20, 60),
    };
    document.body.append(table);
    return disconnected;
  });
  expect(result).toEqual({ events: 0, bounds: undefined, hit: undefined });
  await expect
    .poll(() => page.evaluate(() => window.viewportEvents))
    .toBeGreaterThan(0);
});

test("cell geometry follows horizontal virtualization and row headers", async ({
  page,
}) => {
  await page.locator("#records").evaluate((table) => {
    table.columns = Array.from({ length: 100 }, (_, i) => `column-${i}`);
    table.rows = Array.from({ length: 5 }, (_, id) =>
      Object.fromEntries([
        ["id", `record-${id}`],
        ...table.columns.map(({ key }) => [key, `value-${key}`]),
      ]),
    );
    table.rowHeader = "id";
  });
  await expect(page.locator("tbody th").first()).toHaveText("record-0");
  expect(
    await page.locator("#records").evaluate((table) => {
      const b = table.querySelector("tbody th").getBoundingClientRect();
      return {
        row: table.getRowAtPoint(b.x + 2, b.y + b.height / 2),
        missing: table.getCellBounds(0, "column-99"),
      };
    }),
  ).toEqual({ row: 0, missing: undefined });
  await page.locator("#records").evaluate((table) => {
    const inner = table.querySelector("regular-table");
    inner.scrollLeft = inner.scrollWidth;
  });
  await expect
    .poll(() =>
      page
        .locator("#records")
        .evaluate((table) => table.getMeta(table.querySelector("tbody td")).x),
    )
    .toBeGreaterThan(0);
  const result = await page.locator("#records").evaluate((table) => {
    const { column } = table.getMeta(table.querySelectorAll("tbody td")[2]);
    const b = table.getCellBounds(0, column).visibleBounds;
    return {
      column,
      hit: table.getCellAtPoint(b.x + b.width / 2, b.y + b.height / 2).column,
      missing: table.getCellBounds(0, "column-0"),
    };
  });
  expect(result.hit).toBe(result.column);
  expect(result.missing).toBeUndefined();
});
