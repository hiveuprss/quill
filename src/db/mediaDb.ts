import { z } from 'zod';
import { isAllowedImageUrl } from '../hive/upload';
import { draftsDb } from './draftsDb';

export const MEDIA_CAP = 50;

export const MediaItemSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  url: z.string().url(),
  alt: z.string().optional(),
  createdAt: z.number(),
});

export type MediaItem = z.infer<typeof MediaItemSchema>;

export async function listMedia(username: string): Promise<MediaItem[]> {
  if (!username) return [];
  const rows = await draftsDb.media.where('username').equals(username).toArray();
  const parsed = rows
    .map((row) => {
      const r = MediaItemSchema.safeParse(row);
      return r.success ? r.data : null;
    })
    .filter((m): m is MediaItem => m !== null)
    .filter((m) => isAllowedImageUrl(m.url));
  return parsed.sort((a, b) => b.createdAt - a.createdAt);
}

export async function pruneMedia(username: string, max = MEDIA_CAP): Promise<void> {
  const items = await listMedia(username);
  if (items.length <= max) return;
  const drop = items.slice(max);
  await draftsDb.media.bulkDelete(drop.map((d) => d.id));
}

/** Persist an allowlisted CDN URL for this account. Dedupes by username+url. */
export async function rememberMedia(input: {
  username: string;
  url: string;
  alt?: string;
}): Promise<MediaItem | null> {
  const username = input.username.trim();
  const url = input.url.trim();
  if (!username || !isAllowedImageUrl(url)) return null;

  const existing = await draftsDb.media
    .where('username')
    .equals(username)
    .filter((row) => row.url === url)
    .first();

  const now = Date.now();
  const item: MediaItem = MediaItemSchema.parse({
    id: existing?.id ?? `media_${crypto.randomUUID()}`,
    username,
    url,
    alt: input.alt?.trim() || existing?.alt,
    createdAt: now,
  });

  await draftsDb.media.put(item);
  await pruneMedia(username);
  return item;
}
