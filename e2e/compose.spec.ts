import { expect, test } from '@playwright/test';

test.describe('compose smoke', () => {
  test('toolbar bold and preview', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Start writing|New draft/i }).first().click();
    const editor = page.locator('.ProseMirror');
    await editor.click();
    await page.keyboard.type('Hello Hivequill');
    await page.getByRole('button', { name: /^Bold$/i }).click();
    await page.getByRole('button', { name: /^Preview$/i }).click();
    await expect(page.locator('iframe.preview-frame')).toBeVisible();
  });
});
