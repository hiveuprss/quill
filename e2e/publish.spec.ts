import { PrivateKey } from '@hiveio/dhive';
import { expect, test } from '@playwright/test';

async function mockHiveRpc(
  page: import('@playwright/test').Page,
  account: Record<string, unknown>,
) {
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

      let result: unknown = { id: 'e2e-tx-id', block_num: 1, trx_num: 0 };
      if (raw.includes('get_dynamic_global_properties') || method.includes('get_dynamic')) {
        // dhive signs txs from head_block_id (hex) — incomplete props crash Buffer.from
        result = {
          head_block_number: 50_000_000,
          head_block_id: '02faf080c8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8',
          time: '2026-08-01T00:00:00',
        };
      } else if (raw.includes('get_accounts') || method.includes('get_accounts')) {
        result = [account];
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id, result }),
      });
    });
  }

async function clearVault(page: import('@playwright/test').Page) {
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
}

test.describe('publish gates', () => {
  test('offline blocks publish continue', async ({ page, context }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Start writing|New draft/i }).first().click();
    await page.getByLabel(/^Title$/i).fill('Offline post');
    await page.locator('.ProseMirror').click();
    await page.keyboard.type(
      'Body long enough to pass the publish content gate before we go offline. '.repeat(2),
    );
    await context.setOffline(true);
    await page.getByRole('button', { name: /^Publish$/i }).click();
    await expect(page.getByRole('button', { name: /Offline/i })).toBeDisabled();
  });

  test('enroll compose publish happy path with mocked RPC', async ({ page }) => {
    test.setTimeout(180_000);

    const priv = PrivateKey.fromSeed('hivequill-e2e-publish-seed');
    const wif = priv.toString();
    const pub = priv.createPublic().toString();
    const account = {
      name: 'e2epub',
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

    await mockHiveRpc(page, account);
    await page.goto('/auth');
    await clearVault(page);
    await page.reload();

    await page.getByLabel(/Hive username/i).fill('e2epub');
    await page.getByRole('button', { name: /^Continue$/i }).click();
    await expect(page.getByText(/found\. Paste the posting/i)).toBeVisible({ timeout: 15_000 });
    await page.getByLabel(/Posting private key/i).fill(wif);
    await page.getByRole('button', { name: /^Continue$/i }).click();
    await page.getByLabel(/^Passphrase/i).fill('E2ePassphrase!99');
    await page.getByLabel(/Confirm passphrase/i).fill('E2ePassphrase!99');
    await page.getByRole('button', { name: /Encrypt/i }).click();
    await expect.poll(async () => page.url(), { timeout: 150_000 }).not.toContain('/auth');

    await page.getByRole('button', { name: /Start writing|New draft/i }).first().click();
    await page.getByLabel(/^Title$/i).fill('E2E Publish Post');
    await page.locator('.ProseMirror').click();
    await page.keyboard.type(
      'This is a long enough body for the Quill publish content gate in end-to-end tests. ',
    );
    await page.getByRole('button', { name: /^Publish$/i }).click();
    await expect(page.getByRole('heading', { name: /^Publish$/i })).toBeVisible();
    await page.getByRole('button', { name: /^Continue$/i }).click();
    await page.getByLabel(/Passphrase \(required/i).fill('E2ePassphrase!99');
    await page.getByRole('button', { name: /Confirm publish/i }).click();
    await expect
      .poll(async () => {
        const published = await page.getByText(/^Published/i).count();
        if (published > 0) return 'ok';
        const danger = page.locator('.banner.danger');
        if (await danger.count()) return `err:${await danger.first().innerText()}`;
        return 'wait';
      }, { timeout: 60_000 })
      .toBe('ok');
    await expect(page.getByRole('link', { name: /Open on PeakD/i })).toBeVisible();
  });
});
