import { expect, test, type Locator } from "@playwright/test";

import {
  expectTestIdVisible,
  gotoCharacterBuilder,
  login,
  missingSmokeEnv,
  readSmokeFixture,
} from "./helpers";

const missing = missingSmokeEnv(["SMOKE_PLAYER_CHARACTER_ID"]);
test.skip(missing.length > 0, `Missing smoke env vars: ${missing.join(", ")}`);

async function isDetailsOpen(details: Locator) {
  return details.evaluate((node) => node instanceof HTMLDetailsElement && node.open);
}

async function ensureDetailsOpen(details: Locator) {
  if (!(await isDetailsOpen(details))) {
    await details.locator("summary").click();
  }
}

test.describe("character builder", () => {
  test("assigned Player can load core builder sections", async ({ page }) => {
    const smoke = readSmokeFixture();

    await login(page, smoke.player);
    await gotoCharacterBuilder(page, smoke.campaignId, smoke.playerCharacterId ?? "");

    await expectTestIdVisible(page, "character-builder-root");
    await expectTestIdVisible(page, "save-character-button");
    await expectTestIdVisible(page, "character-builder-section-attributes");
    await expectTestIdVisible(page, "character-builder-section-traits");
    await expectTestIdVisible(page, "character-builder-section-equipment");
    await expectTestIdVisible(page, "character-builder-section-powers");
    await expectTestIdVisible(page, "character-builder-section-narrative");
    const editor = page.locator("form");
    await expect(editor.getByRole("heading", { name: "Character Details" })).toBeVisible();
    await expect(editor.getByRole("heading", { name: "Narrative Details" })).toBeVisible();
    await expect(editor.getByRole("heading", { name: "Characteristics" })).toBeVisible();
    expect(await page.locator("details").count()).toBeGreaterThanOrEqual(7);

    const narrativeSection = page.getByTestId("character-builder-section-narrative");
    const narrativeSummary = narrativeSection.locator("summary");
    const narrativeBody = page.getByTestId("character-builder-section-narrative-body");
    const bodyWasVisible = await narrativeBody.isVisible();

    await narrativeSummary.click();
    if (bodyWasVisible) {
      await expect(narrativeBody).not.toBeVisible();
    } else {
      await expect(narrativeBody).toBeVisible();
    }

    await narrativeSummary.click();
    if (bodyWasVisible) {
      await expect(narrativeBody).toBeVisible();
    } else {
      await expect(narrativeBody).not.toBeVisible();
    }
  });

  test("assigned Player can see power budget controls and incomplete power validation", async ({ page }) => {
    const smoke = readSmokeFixture();

    await login(page, smoke.player);
    await gotoCharacterBuilder(page, smoke.campaignId, smoke.playerCharacterId ?? "");

    const powersSection = page.getByTestId("character-builder-section-powers");
    await expect(powersSection).toBeVisible();
    await ensureDetailsOpen(powersSection);

    await expect(powersSection.getByText("Power Pool")).toBeVisible();
    await expect(powersSection.getByRole("button", { name: "Add Power" })).toBeVisible();

    const initialPowerCardCount = await powersSection.getByTestId("character-power-card").count();
    await powersSection.getByRole("button", { name: "Add Power" }).click();

    await expect
      .poll(() => powersSection.getByTestId("character-power-card").count())
      .toBeGreaterThan(initialPowerCardCount);
    await expect(powersSection.getByTestId("character-power-invalid-summary").last()).toBeVisible();
    await expect(
      powersSection.getByText(/Attack requires at least one damage type|Invalid \/ missing damage type/i).last(),
    ).toBeVisible();
  });
});
