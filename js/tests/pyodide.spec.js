import fs from "fs";
import { expect, test } from "@playwright/test";

const built = fs.existsSync("dist/lite/index.html");

test("runs the complete example in Pyodide", async ({ page }) => {
  test.skip(!built, "run `make pyodide-example` first");
  test.setTimeout(180_000);

  await page.goto("/dist/lite/index.html");
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.ready === "true" ||
      document.querySelector("#pyodide-status")?.textContent ===
        "Unable to start",
    undefined,
    { timeout: 150_000 },
  );
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  await expect(page.getByText("Regular Table", { exact: true })).toBeVisible();
  await expect(page.getByText("100,000", { exact: true })).toBeVisible();
  await expect(page.locator("spaday-regular-table")).toBeVisible();

  await page.getByRole("button", { name: "Update first row" }).click();
  await expect(page.locator(".action-status")).toContainText("Server updated");
  await expect(page.locator("#stream-status")).toHaveText(
    "Applied server row patch",
  );
});
