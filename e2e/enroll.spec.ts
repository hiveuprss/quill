import { PrivateKey } from '@hiveio/dhive';
import { expect, test } from '@playwright/test';

test.describe('enroll', () => {
  test('enrolls with mocked Hive RPC', async ({ page }) => {
    test.setTimeout(180_000);

    const priv = PrivateKey.fromSeed('hivequill-e2e-enroll-seed');
    const wif = priv.toString();
    const pub = priv.createPublic().toString();
    const account = {
      name: 'e2euser',
      posting: { weight_threshold: 1, account_auths: [], key_auths: [[pub, 1]] },
      active: {
        weight_threshold: 1,
        account_auths: [],
        key_auths: [['STM1111111111111111111111111111111114T1Anm', 1]],
      },
      owner: {
        weight_threshold: 1,
        account_auths: [],
        key_auths: [['STM1111111111111111111111111111111114T1Anm', 1]],
      },
    };

    await page.route('**/*', async (route) => {
      const req = route.request();
      if (req.method() !== 'POST') {
        await route.continue();
        return;
      }
      const raw = req.postData() || '';
      if (!raw.includes('jsonrpc') && !raw.includes('condenser_api')) {
        await route.continue();
        return;
      }
      let id: string | number = 1;
      let method = '';
      try {
        const body = JSON.parse(raw) as { id?: string | number; method?: string };
        id = body.id ?? 1;
        method = body.method || '';
      } catch {
        /* keep defaults */
      }

      let result: unknown = [account];
      if (method.includes('get_dynamic_global_properties') || raw.includes('get_dynamic')) {
        result = { head_block_number: 1 };
      } else if (method.includes('get_accounts') || raw.includes('get_accounts')) {
        result = [account];
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id, result }),
      });
    });

    await page.goto('/auth');
    await page.evaluate(async () => {
      await Promise.all(
        ['hivequill_vault', 'hivequill_drafts'].map(
          (name) =>
            new Promise<void>((resolve) => {
              const req = indexedDB.deleteDatabase(name);
              req.onsuccess = () => resolve();
              req.onerror = () => resolve();
              req.onblocked = () => resolve();
            }),
        ),
      );
    });
    await page.reload();

    await page.getByLabel(/Hive username/i).fill('e2euser');
    await page.getByRole('button', { name: /^Continue$/i }).click();
    await expect(page.getByText(/found\. Paste the posting/i)).toBeVisible({ timeout: 15_000 });
    await page.getByLabel(/Posting private key/i).fill(wif);
    await page.getByRole('button', { name: /^Continue$/i }).click();
    await page.getByLabel(/^Passphrase/i).fill('E2ePassphrase!99');
    await page.getByLabel(/Confirm passphrase/i).fill('E2ePassphrase!99');
    await page.getByRole('button', { name: /Encrypt/i }).click();

    await expect
      .poll(async () => page.url(), { timeout: 150_000 })
      .not.toContain('/auth');
    await page.getByRole('link', { name: /^Settings$/i }).click();
    await expect(page.getByText(/Enrolled as/i)).toBeVisible();
  });
});
