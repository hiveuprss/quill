import { describe, expect, it } from 'vitest';
import {
  buildRootPostOps,
  isAllowedOp,
  peakdUrl,
  validateOps,
  validateOpsAllowlist,
} from './ops';

describe('ops', () => {
  it('name-only allowlist still rejects transfer', () => {
    expect(isAllowedOp(['comment', {}])).toBe(true);
    expect(isAllowedOp(['transfer', {}])).toBe(false);
    expect(validateOpsAllowlist([['comment', {}], ['vote', {}]])).toBe(false);
    expect(validateOpsAllowlist([])).toBe(false);
  });

  it('validateOps accepts buildRootPostOps output', () => {
    const ops = buildRootPostOps({
      author: 'alice',
      title: 'Hello',
      body: 'Body text',
      permlink: 'hello',
      tags: ['hive', 'blog'],
    });
    expect(validateOps(ops, 'alice')).toEqual(ops);
  });

  it('validateOps rejects beneficiaries / non-empty extensions', () => {
    const ops = buildRootPostOps({
      author: 'alice',
      title: 'T',
      body: 'Body',
      permlink: 't',
      tags: ['blog'],
    });
    const stolen = structuredClone(ops) as unknown as [
      unknown,
      [
        'comment_options',
        {
          author: string;
          permlink: string;
          max_accepted_payout: string;
          percent_hbd: number;
          allow_votes: boolean;
          allow_curation_rewards: boolean;
          extensions: unknown[];
        },
      ],
    ];
    stolen[1][1].extensions = [[0, { beneficiaries: [{ account: 'attacker', weight: 10000 }] }]];
    expect(() => validateOps(stolen, 'alice')).toThrow(/Only comment/i);
  });

  it('validateOps rejects wrong author, garbage, and spam batches', () => {
    const base = buildRootPostOps({
      author: 'alice',
      title: 'T',
      body: 'Body',
      permlink: 't',
      tags: ['blog'],
    });
    const wrongAuthor = structuredClone(base);
    (wrongAuthor[0][1] as { author: string }).author = 'eve';
    expect(() => validateOps(wrongAuthor, 'alice')).toThrow(/author/i);

    expect(() => validateOps([['comment', null], ['comment_options', 'x']], 'alice')).toThrow(
      /Only comment/i,
    );

    const spam = Array.from({ length: 500 }, (_, i) => [
      'comment',
      {
        parent_author: 'someone',
        parent_permlink: 'their-post',
        author: 'alice',
        permlink: `spam-${i}`,
        title: '',
        body: 'buy',
        json_metadata: '{}',
      },
    ]);
    expect(() => validateOps(spam, 'alice')).toThrow(/Only comment/i);
  });

  it('validateOps rejects burn payout and options-only', () => {
    expect(() =>
      validateOps(
        [
          [
            'comment_options',
            {
              author: 'alice',
              permlink: 'p',
              max_accepted_payout: '0.000 HBD',
              percent_hbd: 10000,
              allow_votes: true,
              allow_curation_rewards: true,
              extensions: [],
            },
          ],
        ],
        'alice',
      ),
    ).toThrow(/Only comment/i);

    const burn = buildRootPostOps({
      author: 'alice',
      title: 'T',
      body: 'Body',
      permlink: 't',
      tags: ['blog'],
    });
    (burn[1][1] as { max_accepted_payout: string }).max_accepted_payout = '0.000 HBD';
    expect(() => validateOps(burn, 'alice')).toThrow(/Only comment/i);
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
    expect(validateOps(ops, 'alice')).toEqual(ops);
  });

  it('builds peakd urls safely', () => {
    expect(peakdUrl('alice', 'my-post')).toBe('https://peakd.com/@alice/my-post');
    expect(peakdUrl('a!@#', 'p$*')).toBe('https://peakd.com/@a/p');
  });
});
