import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

test.describe.serial('§3.9 — Bookmarks persistence', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
    await page.getByRole('button', { name: 'Tools' }).click();
    await page.locator('ul li').filter({ hasText: /./ }).first().click();
    await page.waitForTimeout(300);
  });

  test.afterAll(() => ctx.close());

  test('clicking bookmark icon changes its state', async () => {
    const bookmarkBtn = page
      .getByRole('button', { name: /bookmark/i })
      .or(page.getByTitle(/bookmark/i))
      .first();

    await expect(bookmarkBtn).toBeVisible({ timeout: 5_000 });

    const before = await bookmarkBtn.getAttribute('aria-pressed')
      ?? await bookmarkBtn.getAttribute('class');

    await bookmarkBtn.click();
    await page.waitForTimeout(300);

    const after = await bookmarkBtn.getAttribute('aria-pressed')
      ?? await bookmarkBtn.getAttribute('class');

    expect(before).not.toEqual(after);
    await page.screenshot({ path: 'test-results/09-bookmarked.png' });
  });

  test('bookmark persists after hard reload', async () => {
    const bookmarkBtn = page
      .getByRole('button', { name: /bookmark/i })
      .or(page.getByTitle(/bookmark/i))
      .first();
    const stateBefore = await bookmarkBtn.getAttribute('aria-pressed')
      ?? await bookmarkBtn.getAttribute('class');

    await page.reload();
    await page.waitForTimeout(2_000);

    const unlockBtn = page.getByRole('button', { name: /unlock/i });
    if (await unlockBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await page.getByLabel('Passphrase').fill('test-release-pass-123');
      await unlockBtn.click();
      await page.waitForTimeout(1_000);
    }

    await page.locator('aside li').filter({ hasText: 'Fixture' }).click();
    await page.getByRole('button', { name: 'Tools' }).click();
    await page.locator('ul li').filter({ hasText: /./ }).first().click();
    await page.waitForTimeout(300);

    const bookmarkBtnAfter = page
      .getByRole('button', { name: /bookmark/i })
      .or(page.getByTitle(/bookmark/i))
      .first();
    const stateAfter = await bookmarkBtnAfter.getAttribute('aria-pressed')
      ?? await bookmarkBtnAfter.getAttribute('class');

    await page.screenshot({ path: 'test-results/09-bookmark-persisted.png' });
    expect(stateAfter).toEqual(stateBefore);
  });
});
