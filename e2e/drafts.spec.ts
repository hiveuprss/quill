import { expect, test } from '@playwright/test';

test.describe('drafts lifecycle', () => {
  test('create, edit title, delete with confirm', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Start writing|New draft/i }).first().click();
    await expect(page).toHaveURL(/\/compose\//);
    await page.getByLabel(/^Title$/i).fill('E2E Draft');
    await page.getByRole('link', { name: /^Drafts$/i }).click();
    await expect(page.getByText('E2E Draft')).toBeVisible();
    await page.getByRole('button', { name: /Delete draft E2E Draft/i }).click();
    await expect(page.getByRole('heading', { name: /Delete this draft/i })).toBeVisible();
    await page.getByRole('button', { name: /^Cancel$/i }).click();
    await expect(page.getByText('E2E Draft')).toBeVisible();
    await page.getByRole('button', { name: /Delete draft E2E Draft/i }).click();
    await page.getByRole('button', { name: /^Delete draft$/i }).click();
    await expect(page.getByText('E2E Draft')).toHaveCount(0);
  });
});
