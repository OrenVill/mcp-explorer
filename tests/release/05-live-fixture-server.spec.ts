import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

test.describe.serial('§3.5 — Live MCP fixture server', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
  });

  test.afterAll(() => ctx.close());

  test('fixture server connects successfully', async () => {
    const serverItem = page.locator('aside li').filter({ hasText: 'Fixture' });
    await expect(serverItem.locator('.bg-emerald-400')).toBeVisible();
  });

  test('tools list is non-empty', async () => {
    await page.getByRole('button', { name: 'Tools' }).click();
    await expect(page.locator('text=/\\d+ tool/i').or(page.locator('[class*="tool"]').first())).toBeVisible({ timeout: 5_000 });
  });

  test('Resources tab appears and is non-empty', async () => {
    const resourcesTab = page.getByRole('button', { name: /Resources/i });
    await expect(resourcesTab).toBeVisible({ timeout: 5_000 });
    await resourcesTab.click();
    await page.screenshot({ path: 'test-results/05-resources-tab.png', fullPage: true });
  });

  test('Prompts tab appears', async () => {
    const promptsTab = page.getByRole('button', { name: /Prompts/i });
    await expect(promptsTab).toBeVisible({ timeout: 5_000 });
    await promptsTab.click();
    await page.screenshot({ path: 'test-results/05-prompts-tab.png', fullPage: true });
  });
});
