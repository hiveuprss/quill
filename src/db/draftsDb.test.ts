import { beforeEach, describe, expect, it } from 'vitest';
import {
  DraftSchema,
  deleteDraft,
  draftsDb,
  getDraft,
  getSettings,
  listDrafts,
  newDraftId,
  saveDraft,
  saveSettings,
  slugifyPermlink,
  type Draft,
} from './draftsDb';

function sample(partial: Partial<Draft> = {}): Draft {
  const now = Date.now();
  return {
    id: newDraftId(),
    title: 'Hello',
    bodyMarkdown: 'Body',
    tags: ['blog'],
    status: 'local',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe('draftsDb', () => {
  beforeEach(async () => {
    await draftsDb.drafts.clear();
  });

  it('slugifyPermlink normalizes titles', () => {
    expect(slugifyPermlink('Hello World!')).toBe('hello-world');
    expect(slugifyPermlink('!!!')).toMatch(/^post-/);
  });

  it('rejects invalid drafts via Zod', () => {
    expect(() => DraftSchema.parse({ id: '' })).toThrow();
  });

  it('save/list/get/delete', async () => {
    const d = sample({ title: 'One' });
    await saveDraft(d);
    expect(await listDrafts()).toHaveLength(1);
    expect(await getDraft(d.id)).toMatchObject({ title: 'One' });
    await deleteDraft(d.id);
    expect(await getDraft(d.id)).toBeNull();
  });

  it('defaults and persists locale in settings', async () => {
    await draftsDb.settings.clear();
    const defaults = await getSettings();
    expect(defaults.locale).toBe('system');
    await saveSettings({ key: 'app', idleTimeoutMin: 10, locale: 'es', theme: 'honey' });
    expect(await getSettings()).toMatchObject({
      locale: 'es',
      idleTimeoutMin: 10,
      theme: 'honey',
    });
  });
});
