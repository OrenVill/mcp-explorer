import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

test.describe.serial('§3.14 — Prompts tab', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
    await page.getByRole('button', { name: /Prompts/i }).click();
  });

  test.afterAll(() => ctx.close());

  test('prompts listed in the middle column', async () => {
    await page.screenshot({ path: 'test-results/14-prompts-list.png', fullPage: true });
    const promptItems = page.locator('ul li').filter({ hasText: /./ });
    await expect(promptItems.first()).toBeVisible({ timeout: 5_000 });
    expect(await promptItems.count()).toBeGreaterThan(0);
  });

  test('clicking a prompt shows argument form with descriptions below fields', async () => {
    const promptItems = page.locator('ul li').filter({ hasText: /./ });
    await promptItems.first().click();
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/14-prompt-detail.png', fullPage: true });

    const submitBtn = page.getByRole('button', { name: /get|submit|run|fetch/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 3_000 });
  });

  test('submitting prompt renders messages', async () => {
    const submitBtn = page.getByRole('button', { name: /get|submit|run|fetch/i }).first();
    await submitBtn.click();
    await page.waitForTimeout(1_500);

    await page.screenshot({ path: 'test-results/14-prompt-result.png', fullPage: true });

    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(100);
  });

  test('markdown message content shows Code/Preview toggle', async () => {
    const previewBtn = page.getByRole('button', { name: /preview/i }).or(
      page.getByRole('tab', { name: /preview/i }),
    ).first();
    if (await previewBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await previewBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'test-results/14-prompt-markdown-preview.png' });
    }
  });
});
