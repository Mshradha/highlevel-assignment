import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/**
 * Runs only in the "mobile" project (a phone: 412px wide, touch screen).
 * Checks layout properties that functional tests can't see: nothing wider than
 * the screen, cards instead of the table, touch-sized targets.
 */
const run = Date.now().toString(36);

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

async function expectTapTargetsAtLeast(page: Page, selector: string, min: number) {
  const sizes = await page
    .locator(selector)
    .evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect()).map((r) => [r.width, r.height]),
    );
  expect(sizes.length).toBeGreaterThan(0);
  for (const [w, h] of sizes) {
    expect(w).toBeGreaterThanOrEqual(min);
    expect(h).toBeGreaterThanOrEqual(min);
  }
}

test("contact list fits a phone screen and shows cards", async ({ page }) => {
  await page.goto("/contacts");
  const cards = page.getByRole("list", { name: "Contacts" });
  await expect(cards.getByRole("listitem")).toHaveCount(20);
  await expect(page.getByRole("table")).toHaveCount(0);

  await expectNoHorizontalScroll(page);
  await expectTapTargetsAtLeast(page, "input[type=checkbox]", 24);
  await expectTapTargetsAtLeast(page, "[role=search] input, [role=search] select", 44);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test("a phone user can select contacts, bulk-tag them, and open one", async ({ page }) => {
  const tag = `mobile ${run}`;
  await page.goto("/contacts?q=chris&sortBy=name");
  const cards = page.getByRole("list", { name: "Contacts" });
  await expect(cards.getByRole("listitem").first()).toBeVisible();

  const names = (await cards.getByRole("link").allTextContents()).slice(0, 2);
  for (const name of names)
    await page
      .getByRole("checkbox", { name: `Select ${name}` })
      .first()
      .tap();
  await expect(page.getByText("2 selected")).toBeVisible();
  await expectNoHorizontalScroll(page); // the bulk bar wraps instead of widening the page

  await page.getByLabel("Tag to add to the selected contacts").fill(tag);
  await page.getByRole("button", { name: "Add tag to 2" }).tap();
  await expect(page.getByText(`Added “${tag}” to 2 contacts.`)).toBeVisible();

  await cards.getByRole("link", { name: names[0] }).first().tap();
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTapTargetsAtLeast(page, "button[aria-label^='Remove tag']", 24);
  await expectTapTargetsAtLeast(page, "form button, form input", 44);
});
