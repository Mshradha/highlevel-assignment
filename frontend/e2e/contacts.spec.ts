import { expect, type Page, test } from "@playwright/test";

/**
 * The main user journeys, end to end: real browser → Vite → Express → MongoDB
 * (`crm_e2e`, re-seeded with 300 deterministic contacts before the run).
 * Each test works on different contacts and uses unique tag names, so tests
 * don't depend on each other's changes.
 */

const run = Date.now().toString(36); // unique per run: tags and values never collide

const summary = (page: Page) => page.getByText(/^Showing \d+–\d+ of [\d,]+$/);
const rowNames = (page: Page) => page.locator("tbody tr td:nth-child(2)");
const versionText = (page: Page) => page.getByText(/Version \d+/);

async function openListAt(page: Page, query = "") {
  await page.goto(`/contacts${query}`);
  await expect(summary(page)).toBeVisible();
}

/** Opens the first contact matching `q` and returns its displayed version number. */
async function openContact(page: Page, q: string): Promise<number> {
  await openListAt(page, `?q=${encodeURIComponent(q)}&sortBy=name`);
  await page.locator("tbody tr").first().getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
  return Number((await versionText(page).textContent())!.match(/Version (\d+)/)![1]);
}

test.describe("browsing", () => {
  test("lists all seeded contacts, 20 per page", async ({ page }) => {
    await openListAt(page);
    await expect(summary(page)).toHaveText("Showing 1–20 of 300");
    await expect(rowNames(page)).toHaveCount(20);
  });

  test("searches by name prefix and filters by tag, on the server", async ({ page }) => {
    await openListAt(page);

    await page.getByRole("searchbox", { name: "Search" }).fill("ann");
    await expect(page).toHaveURL(/\?q=ann$/);
    const names = await rowNames(page).allTextContents();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name.toLowerCase()).toMatch(/^ann|^\S+ ann/);

    await page.getByLabel("Has tags").fill("VIP");
    await page.getByLabel("Has tags").press("Enter");
    await expect(page).toHaveURL(/tags=vip/);
    await expect(page.getByRole("button", { name: "Remove tag vip" }).first()).toBeVisible();
    for (const row of await page.locator("tbody tr").all()) {
      await expect(row.getByText("vip", { exact: true })).toBeVisible();
    }

    await page.getByRole("button", { name: "Clear filters" }).first().click();
    await expect(summary(page)).toHaveText("Showing 1–20 of 300");
    await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue("");
  });

  test("sorts by name, pages forward, and the back button restores the view", async ({ page }) => {
    await openListAt(page);
    await page.getByLabel("Sort").selectOption("name:asc");
    await expect(page).toHaveURL(/sortBy=name/);
    const firstOnPage1 = await rowNames(page).first().textContent();

    await page.getByRole("button", { name: "Next" }).click();
    await expect(summary(page)).toHaveText("Showing 21–40 of 300");
    await expect(page).toHaveURL(/page=2/);

    await page.goBack();
    await expect(summary(page)).toHaveText("Showing 1–20 of 300");
    await expect(rowNames(page).first()).toHaveText(firstOnPage1!);
    await expect(page.getByLabel("Sort")).toHaveValue("name:asc");
  });
});

test.describe("navigation", () => {
  test("'Back to contacts' returns to the same filtered, sorted page", async ({ page }) => {
    await openListAt(page, "?q=jo&sortBy=name&page=2");
    await expect(summary(page)).toHaveText(/^Showing 21–/);
    await page.locator("tbody tr").first().getByRole("link").click();
    await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();

    await page.getByRole("link", { name: "← Back to contacts" }).click();
    await expect(page).toHaveURL(/\/contacts\?q=jo&sortBy=name&page=2$/);
    await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue("jo");
    await expect(summary(page)).toHaveText(/^Showing 21–/);
  });
});

test.describe("contact details", () => {
  test("updates a contact, records the change, and keeps it after a reload", async ({ page }) => {
    const version = await openContact(page, "aarav");
    const company = `E2E Co ${run}`;

    await page.getByLabel("Company").fill(company);
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(versionText(page)).toContainText(`Version ${version + 1}`);
    const activity = page.getByRole("region", { name: "Recent activity" });
    await expect(activity.getByText(`→ “${company}”`)).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Company")).toHaveValue(company);
  });

  test("rejects an invalid email in the browser without sending a request", async ({ page }) => {
    await openContact(page, "ethan");
    const patches: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "PATCH") patches.push(r.url());
    });

    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
    expect(patches).toEqual([]);
  });

  test("adds and removes a tag, recording both in the activity", async ({ page }) => {
    await openContact(page, "hiroshi");
    const tag = `e2e ${run}`;
    const tags = page.getByRole("region", { name: "Tags" });
    const activity = page.getByRole("region", { name: "Recent activity" });

    await tags.getByLabel("New tag").fill(tag.toUpperCase()); // normalized to lowercase
    await tags.getByLabel("New tag").press("Enter");
    await expect(tags.getByRole("button", { name: `Remove tag ${tag}` })).toBeVisible();
    await expect(activity.getByText(`Added tag “${tag}”`)).toBeVisible();

    await tags.getByRole("button", { name: `Remove tag ${tag}` }).click();
    await expect(tags.getByRole("button", { name: `Remove tag ${tag}` })).toHaveCount(0);
    await expect(activity.getByText(`Removed tag “${tag}”`)).toBeVisible();

    await page.reload();
    await expect(page.getByRole("region", { name: "Tags" }).getByText(tag)).toHaveCount(0);
  });
});

test.describe("bulk tagging", () => {
  test("assigns a tag to selected contacts and the tag filter finds exactly them", async ({
    page,
  }) => {
    const tag = `bulk ${run}`;
    await openListAt(page, "?q=sophia&sortBy=name");
    const names = (await rowNames(page).allTextContents()).slice(0, 3);
    expect(names).toHaveLength(3);

    for (const name of names) {
      await page
        .getByRole("checkbox", { name: `Select ${name}` })
        .first()
        .check();
    }
    await expect(page.getByText("3 selected")).toBeVisible();
    await page.getByLabel("Tag to add to the selected contacts").fill(tag);
    await page.getByRole("button", { name: "Add tag to 3" }).click();

    await expect(page.getByText(`Added “${tag}” to 3 contacts.`)).toBeVisible();
    await expect(page.getByText("3 selected")).toHaveCount(0);

    await openListAt(page, `?tags=${encodeURIComponent(tag)}`);
    await expect(summary(page)).toHaveText("Showing 1–3 of 3");
    expect((await rowNames(page).allTextContents()).sort()).toEqual([...names].sort());
  });
});

test.describe("concurrent edits", () => {
  test("a stale save is rejected, the draft survives, and 'keep my changes' merges", async ({
    browser,
  }) => {
    // Two separate browser sessions = two users.
    const userA = await (await browser.newContext()).newPage();
    const userB = await (await browser.newContext()).newPage();

    const version = await openContact(userA, "yuki");
    await userB.goto(userA.url());
    await expect(userB.getByRole("heading", { name: "Details" })).toBeVisible();

    // A starts editing but hasn't saved yet.
    const phoneA = "(555) 010-2030";
    await userA.getByLabel("Phone").fill(phoneA);

    // B saves first.
    const companyB = `B Corp ${run}`;
    await userB.getByLabel("Company").fill(companyB);
    await userB.getByRole("button", { name: "Save changes" }).click();
    await expect(versionText(userB)).toContainText(`Version ${version + 1}`);

    // A saves with the version they loaded: conflict, nothing overwritten.
    await userA.getByRole("button", { name: "Save changes" }).click();
    await expect(
      userA.getByText("Someone else changed this contact while you were editing."),
    ).toBeVisible();
    await expect(userA.getByRole("cell", { name: companyB })).toBeVisible();
    await expect(userA.getByLabel("Phone")).toHaveValue(phoneA);

    // Keep my changes: A's phone on top of B's company, then save.
    await userA.getByRole("button", { name: "Keep my changes" }).click();
    await expect(userA.getByLabel("Company")).toHaveValue(companyB);
    await userA.getByRole("button", { name: "Save changes" }).click();
    await expect(versionText(userA)).toContainText(`Version ${version + 2}`);

    // Both users' changes are stored.
    await userB.reload();
    await expect(userB.getByLabel("Company")).toHaveValue(companyB);
    await expect(userB.getByLabel("Phone")).toHaveValue(phoneA);
  });
});
