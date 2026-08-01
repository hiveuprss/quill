import { beforeEach, describe, expect, it } from 'vitest';
import { draftsDb } from './draftsDb';
import { MEDIA_CAP, listMedia, pruneMedia, rememberMedia } from './mediaDb';

describe('mediaDb', () => {
  beforeEach(async () => {
    await draftsDb.media.clear();
  });

  it('remembers allowlisted urls newest first', async () => {
    await rememberMedia({ username: 'alice', url: 'https://images.hive.blog/DQm/a.jpg' });
    await new Promise((r) => setTimeout(r, 5));
    await rememberMedia({ username: 'alice', url: 'https://images.hive.blog/DQm/b.jpg' });
    const list = await listMedia('alice');
    expect(list.map((m) => m.url)).toEqual([
      'https://images.hive.blog/DQm/b.jpg',
      'https://images.hive.blog/DQm/a.jpg',
    ]);
  });

  it('rejects non-allowlisted urls', async () => {
    const item = await rememberMedia({
      username: 'alice',
      url: 'https://evil.example/x.jpg',
    });
    expect(item).toBeNull();
    expect(await listMedia('alice')).toHaveLength(0);
  });

  it('filters non-allowlisted rows already in IndexedDB', async () => {
    await draftsDb.media.put({
      id: 'legacy',
      username: 'alice',
      url: 'https://evil.example/old.jpg',
      createdAt: Date.now(),
    });
    await rememberMedia({ username: 'alice', url: 'https://images.hive.blog/DQm/ok.jpg' });
    const list = await listMedia('alice');
    expect(list).toHaveLength(1);
    expect(list[0].url).toBe('https://images.hive.blog/DQm/ok.jpg');
  });

  it('dedupes by username+url and bumps createdAt', async () => {
    const first = await rememberMedia({
      username: 'alice',
      url: 'https://images.hive.blog/DQm/a.jpg',
      alt: 'old',
    });
    await new Promise((r) => setTimeout(r, 5));
    const second = await rememberMedia({
      username: 'alice',
      url: 'https://images.hive.blog/DQm/a.jpg',
      alt: 'new',
    });
    expect(second?.id).toBe(first?.id);
    expect(second?.alt).toBe('new');
    expect((second?.createdAt ?? 0) >= (first?.createdAt ?? 0)).toBe(true);
    expect(await listMedia('alice')).toHaveLength(1);
  });

  it('scopes lists per username', async () => {
    await rememberMedia({ username: 'alice', url: 'https://images.hive.blog/DQm/a.jpg' });
    await rememberMedia({ username: 'bob', url: 'https://images.hive.blog/DQm/b.jpg' });
    expect(await listMedia('alice')).toHaveLength(1);
    expect(await listMedia('bob')).toHaveLength(1);
  });

  it('prunes beyond cap', async () => {
    for (let i = 0; i < MEDIA_CAP + 3; i++) {
      await rememberMedia({
        username: 'alice',
        url: `https://images.hive.blog/DQm/${i}.jpg`,
      });
    }
    await pruneMedia('alice');
    const list = await listMedia('alice');
    expect(list.length).toBe(MEDIA_CAP);
  });
});
