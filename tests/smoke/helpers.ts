import { expect, type Locator, type Page } from "@playwright/test";

export type SmokeAccount = {
  email: string;
  password: string;
};

export type SmokeFixture = {
  baseUrl: string;
  campaignId: string;
  gd: SmokeAccount;
  player: SmokeAccount;
  stashManager: SmokeAccount;
  playerCharacterId?: string;
  gdCharacterId?: string;
  otherPlayerCharacterId?: string;
};

export const REQUIRED_SMOKE_ENV = [
  "SMOKE_CAMPAIGN_ID",
  "SMOKE_GD_EMAIL",
  "SMOKE_GD_PASSWORD",
  "SMOKE_PLAYER_EMAIL",
  "SMOKE_PLAYER_PASSWORD",
  "SMOKE_STASH_MANAGER_EMAIL",
  "SMOKE_STASH_MANAGER_PASSWORD",
] as const;

export function missingSmokeEnv(extraKeys: string[] = []) {
  return [...REQUIRED_SMOKE_ENV, ...extraKeys].filter((key) => !process.env[key]?.trim());
}

export function readSmokeFixture(): SmokeFixture {
  return {
    baseUrl: process.env.SMOKE_BASE_URL ?? "http://localhost:3000",
    campaignId: process.env.SMOKE_CAMPAIGN_ID ?? "",
    gd: {
      email: process.env.SMOKE_GD_EMAIL ?? "",
      password: process.env.SMOKE_GD_PASSWORD ?? "",
    },
    player: {
      email: process.env.SMOKE_PLAYER_EMAIL ?? "",
      password: process.env.SMOKE_PLAYER_PASSWORD ?? "",
    },
    stashManager: {
      email: process.env.SMOKE_STASH_MANAGER_EMAIL ?? "",
      password: process.env.SMOKE_STASH_MANAGER_PASSWORD ?? "",
    },
    playerCharacterId: process.env.SMOKE_PLAYER_CHARACTER_ID,
    gdCharacterId: process.env.SMOKE_GD_CHARACTER_ID,
    otherPlayerCharacterId: process.env.SMOKE_OTHER_PLAYER_CHARACTER_ID,
  };
}

export async function resetSession(page: Page) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

export async function login(page: Page, account: SmokeAccount) {
  await resetSession(page);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: /^login$/i }).click();
  await expect(page).toHaveURL(/\/dashboard(?:$|\?)/);
}

export async function gotoCampaign(page: Page, campaignId: string) {
  await page.goto(`/campaign/${encodeURIComponent(campaignId)}`);
  await expectTestIdVisible(page, "campaign-members-panel");
}

export async function gotoPartyInventory(page: Page, campaignId: string) {
  await page.goto(`/campaign/${encodeURIComponent(campaignId)}/inventory`);
  await expectTestIdVisible(page, "party-inventory-page");
}

export async function gotoCharacterBuilder(page: Page, campaignId: string, characterId: string) {
  await page.goto(
    `/campaign/${encodeURIComponent(campaignId)}/characters/${encodeURIComponent(characterId)}/builder`,
  );
  await expectTestIdVisible(page, "character-builder-root");
}

export async function expectTestIdVisible(page: Page, testId: string) {
  const locator = page.getByTestId(testId);
  try {
    await expect(locator).toBeVisible();
  } catch (error) {
    const url = page.url();
    const title = await page.title().catch(() => "(title unavailable)");
    const body = await page
      .locator("body")
      .innerText({ timeout: 1000 })
      .catch(() => "(body unavailable)");
    const snippet = body.replace(/\s+/g, " ").slice(0, 700);
    const detail =
      error instanceof Error ? error.message : "Expected test id was not visible.";

    throw new Error(
      `Expected [data-testid="${testId}"] to be visible.\nURL: ${url}\nTitle: ${title}\nBody: ${snippet}\n\n${detail}`,
    );
  }
}

export async function expectVisible(locator: Locator) {
  await expect(locator).toBeVisible();
}

export async function expectHidden(locator: Locator) {
  await expect(locator).toHaveCount(0);
}

export async function expectEmailPrivate(page: Page, email: string) {
  if (!email.trim()) return;
  await expect(page.getByText(email, { exact: false })).toHaveCount(0);
}
