import Dexie, { type Table } from 'dexie';
import { z } from 'zod';

export const DraftSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  bodyMarkdown: z.string(),
  tags: z.array(z.string()).max(8),
  community: z.string().optional(),
  description: z.string().optional(),
  coverImageUrl: z.string().optional(),
  permlink: z.string().optional(),
  status: z.enum(['local', 'published', 'edited_locally']),
  createdAt: z.number(),
  updatedAt: z.number(),
  publishedAt: z.number().optional(),
  publishedPermlink: z.string().optional(),
});

export type Draft = z.infer<typeof DraftSchema>;

export const SettingsSchema = z.object({
  key: z.literal('app'),
  idleTimeoutMin: z.number().min(5).max(15).default(10),
  locale: z.enum(['system', 'en', 'es']).default('system'),
  theme: z.enum(['light', 'dark', 'honey', 'nocturne']).default('light'),
  /** When set, Quill uses Hive Keychain for this account (no local WIF vault). */
  keychainUsername: z.string().min(1).optional(),
});

export type AppSettings = z.infer<typeof SettingsSchema>;

export type MediaRow = {
  id: string;
  username: string;
  url: string;
  alt?: string;
  createdAt: number;
};

class DraftsDatabase extends Dexie {
  drafts!: Table<Draft, string>;
  settings!: Table<AppSettings, string>;
  media!: Table<MediaRow, string>;

  constructor() {
    super('hivequill_drafts');
    this.version(1).stores({
      drafts: 'id, updatedAt, status',
      settings: 'key',
    });
    this.version(2).stores({
      drafts: 'id, updatedAt, status',
      settings: 'key',
      media: 'id, username, createdAt, [username+createdAt]',
    });
  }
}

export const draftsDb = new DraftsDatabase();

export async function listDrafts(): Promise<Draft[]> {
  const rows = await draftsDb.drafts.orderBy('updatedAt').reverse().toArray();
  return rows
    .map((row) => {
      const parsed = DraftSchema.safeParse(row);
      return parsed.success ? parsed.data : null;
    })
    .filter((d): d is Draft => d !== null);
}

export async function getDraft(id: string): Promise<Draft | null> {
  const row = await draftsDb.drafts.get(id);
  if (!row) return null;
  const parsed = DraftSchema.safeParse(row);
  return parsed.success ? parsed.data : null;
}

export async function saveDraft(draft: Draft): Promise<void> {
  const parsed = DraftSchema.parse(draft);
  await draftsDb.drafts.put(parsed);
}

export async function deleteDraft(id: string): Promise<void> {
  await draftsDb.drafts.delete(id);
}

const defaultSettings: AppSettings = {
  key: 'app',
  idleTimeoutMin: 10,
  locale: 'system',
  theme: 'light',
};

export async function getSettings(): Promise<AppSettings> {
  const row = await draftsDb.settings.get('app');
  const parsed = SettingsSchema.safeParse(row ?? defaultSettings);
  return parsed.success ? parsed.data : { ...defaultSettings };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await draftsDb.settings.put(SettingsSchema.parse(settings));
}

export function newDraftId(): string {
  return `draft_${crypto.randomUUID()}`;
}

export function slugifyPermlink(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
  return base || `post-${Date.now().toString(36)}`;
}
