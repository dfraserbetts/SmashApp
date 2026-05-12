import { expect, test, type Page } from "@playwright/test";

import {
  expectEmailPrivate,
  expectTestIdVisible,
  gotoCampaign,
  gotoPartyInventory,
  login,
  missingSmokeEnv,
  readSmokeFixture,
} from "./helpers";

const missing = missingSmokeEnv();
test.skip(missing.length > 0, `Missing smoke env vars: ${missing.join(", ")}`);

async function waitForPartyStashReady(page: Page) {
  await expect(page.getByText("Loading Party Stash...")).toHaveCount(0, { timeout: 15000 });

  const loadError = page.locator('[data-testid="party-inventory-page"] .text-red-400').first();
  if (await loadError.isVisible().catch(() => false)) {
    throw new Error(`Party Stash failed to load: ${await loadError.innerText()}`);
  }

  await expectTestIdVisible(page, "party-stash-panel");
}

test.describe("campaign member privacy", () => {
  test("Game Director can see member admin details", async ({ page }) => {
    const smoke = readSmokeFixture();

    await login(page, smoke.gd);
    await gotoCampaign(page, smoke.campaignId);

    await expectTestIdVisible(page, "campaign-members-panel");
    await expect(page.getByText("Add Player by Supabase User ID")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Party Stash" })).toBeVisible();
    await expect(page.getByText(smoke.player.email, { exact: false })).toBeVisible();
  });

  test("Player sees member names without private member controls", async ({ page }) => {
    const smoke = readSmokeFixture();

    await login(page, smoke.player);
    await gotoCampaign(page, smoke.campaignId);

    await expectTestIdVisible(page, "campaign-members-panel");
    expect(await page.getByTestId("campaign-member-row").count()).toBeGreaterThan(0);
    await expect(page.getByText("Add Player by Supabase User ID")).toHaveCount(0);
    await expect(page.getByText("Remove Player")).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Status" })).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Party Stash" })).toHaveCount(0);
    await expectEmailPrivate(page, smoke.gd.email);
    await expectEmailPrivate(page, smoke.stashManager.email);
  });
});

test.describe("party stash permissions", () => {
  test("normal Player sees read-only Party Stash", async ({ page }) => {
    const smoke = readSmokeFixture();

    await login(page, smoke.player);
    await gotoPartyInventory(page, smoke.campaignId);

    await expectTestIdVisible(page, "party-inventory-page");
    await waitForPartyStashReady(page);
    await expect(page.getByText("Add to Party Inventory")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Add Item/i })).toHaveCount(0);
    await expect(page.getByTestId("party-stash-assign-column")).toHaveCount(0);
    await expect(page.getByTestId("party-stash-assignment-controls")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Assign to Character/i })).toHaveCount(0);
  });

  test("Stash Manager sees assignment surface without member emails", async ({ page }) => {
    const smoke = readSmokeFixture();

    await login(page, smoke.stashManager);
    await gotoPartyInventory(page, smoke.campaignId);

    await expectTestIdVisible(page, "party-inventory-page");
    await waitForPartyStashReady(page);
    await expectTestIdVisible(page, "party-stash-manager-indicator");
    await expectEmailPrivate(page, smoke.gd.email);
    await expectEmailPrivate(page, smoke.player.email);

    if ((await page.getByText("No unassigned Party Stash items are available.").count()) === 0) {
      try {
        await expectTestIdVisible(page, "party-stash-assign-column");
        const assignmentControls = page.getByTestId("party-stash-assignment-controls");
        expect(await assignmentControls.count()).toBeGreaterThan(0);
        await expect(assignmentControls.first()).toBeVisible();
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
          "Expected Party Stash assignment controls. SMOKE_STASH_MANAGER user must have canManagePartyStash=true and campaign must have at least one unassigned stash item.\n\n" +
            detail,
        );
      }
    }
  });
});
