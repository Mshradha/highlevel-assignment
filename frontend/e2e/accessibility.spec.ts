import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Automated accessibility checks (axe-core, WCAG 2.1 A/AA rules) on each main
 * screen, including the states with extra UI. Automated checks catch roughly
 * the mechanical problems (labels, roles, contrast, names); they don't replace
 * trying the app with a keyboard and a screen reader.
 */
async function expectNoViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );
  expect(summary).toEqual([]);
}

test("contact list, with filters and a selection, has no detectable violations", async ({
  page,
}) => {
  await page.goto("/contacts?q=ann&tags=vip");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await page.locator("tbody input[type=checkbox]").first().check(); // shows the bulk bar
  await expectNoViolations(page);
});

test("contact detail page has no detectable violations", async ({ page }) => {
  await page.goto("/contacts?sortBy=name");
  await page.locator("tbody tr").first().getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Save changes" }).click(); // shows a field error
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
  await expectNoViolations(page);
});
