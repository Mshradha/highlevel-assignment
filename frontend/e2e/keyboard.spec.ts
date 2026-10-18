import { expect, test } from "@playwright/test";

/**
 * Keyboard-only use: after submitting with Enter, focus must stay where the
 * user is working. If a focused control is disabled during the save, the
 * browser drops focus to <body> and the user has to navigate back.
 */
const run = Date.now().toString(36);

async function openFirstContact(page: import("@playwright/test").Page, q: string) {
  await page.goto(`/contacts?q=${q}&sortBy=name`);
  await page.locator("tbody tr").first().getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
}

test("adding tags with Enter keeps focus in the tag input", async ({ page }) => {
  await openFirstContact(page, "omar");
  const input = page.getByRole("region", { name: "Tags" }).getByLabel("New tag");

  await input.click();
  await page.keyboard.type(`kb1 ${run}`);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: `Remove tag kb1 ${run}` })).toBeVisible();

  await expect(input).toBeFocused();
  await page.keyboard.type(`kb2 ${run}`); // typed straight away, no re-focusing
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: `Remove tag kb2 ${run}` })).toBeVisible();
});

test("saving the form with Enter keeps focus in the field", async ({ page }) => {
  await openFirstContact(page, "fatima");
  const company = page.getByLabel("Company");

  await company.fill(`Keyboard Co ${run}`);
  await company.press("Enter");
  await expect(page.getByText("Unsaved changes")).toHaveCount(0); // saved

  await expect(company).toBeFocused();
});
