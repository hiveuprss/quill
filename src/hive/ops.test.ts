import { describe, expect, it } from 'vitest';
import {
  buildRootPostOps,
  isAllowedOp,
  peakdUrl,
  validateOpsAllowlist,
} from './ops';

describe('ops', () => {
  it('validates allowlisted ops only', () => {
    expect(isAllowedOp(['comment', {}])).toBe(true);
    expect(isAllowedOp(['comment_options', {}])).toBe(true);
    expect(isAllowedOp(['transfer', {}])).toBe(false);
    expect(validateOpsAllowlist([['comment', {}], ['vote', {}]])).toBe(false);
    expect(validateOpsAllowlist([])).toBe(false);
  });

  it('builds new root post with comment + options', () => {
    const ops = buildRootPostOps({
      author: 'alice',
      title: 'Hello',
      body: 'Body',
      permlink: 'hello',
      tags: ['hive', 'blog'],
      description: 'desc',
      coverImageUrl: 'https://images.hive.blog/DQm/cover.jpg',
    });
    expect(ops).toHaveLength(2);
    expect(ops[0][0]).toBe('comment');
    expect(ops[1][0]).toBe('comment_options');
    const comment = ops[0][1] as { json_metadata: string; parent_permlink: string };
    const meta = JSON.parse(comment.json_metadata);
    expect(meta.tags).toEqual(['hive', 'blog']);
    expect(meta.description).toBe('desc');
    expect(meta.image).toEqual(['https://images.hive.blog/DQm/cover.jpg']);
    expect(comment.parent_permlink).toBe('hive');
  });

  it('uses community as parent_permlink when hive-*', () => {
    const ops = buildRootPostOps({
      author: 'alice',
      title: 'C',
      body: 'b',
      permlink: 'c',
      tags: ['blog'],
      community: 'hive-123456',
    });
    const comment = ops[0][1] as { parent_permlink: string };
    expect(comment.parent_permlink).toBe('hive-123456');
  });

  it('omits comment_options on update', () => {
    const ops = buildRootPostOps({
      author: 'alice',
      title: 'U',
      body: 'b',
      permlink: 'u',
      tags: [],
      isUpdate: true,
    });
    expect(ops).toHaveLength(1);
    const comment = ops[0][1] as { parent_permlink: string };
    expect(comment.parent_permlink).toBe('blog');
  });

  it('builds peakd urls safely', () => {
    expect(peakdUrl('alice', 'my-post')).toBe('https://peakd.com/@alice/my-post');
    expect(peakdUrl('a!@#', 'p$*')).toBe('https://peakd.com/@a/p');
  });
});
