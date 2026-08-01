export type CommentOp = [
  'comment',
  {
    parent_author: string;
    parent_permlink: string;
    author: string;
    permlink: string;
    title: string;
    body: string;
    json_metadata: string;
  },
];

export type CommentOptionsOp = [
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
];

export type AllowedOp = CommentOp | CommentOptionsOp;

export function isAllowedOp(op: unknown): op is AllowedOp {
  if (!Array.isArray(op) || op.length !== 2) return false;
  const [type] = op;
  return type === 'comment' || type === 'comment_options';
}

export function validateOpsAllowlist(ops: unknown[]): ops is AllowedOp[] {
  return ops.length > 0 && ops.every(isAllowedOp);
}

export function buildRootPostOps(input: {
  author: string;
  title: string;
  body: string;
  permlink: string;
  tags: string[];
  community?: string;
  description?: string;
  coverImageUrl?: string;
  isUpdate?: boolean;
}): AllowedOp[] {
  const parentAuthor = '';
  const parentPermlink = input.community?.startsWith('hive-')
    ? input.community
    : input.tags[0] || 'blog';

  const metadata: Record<string, unknown> = {
    app: 'hivequill/0.1.0',
    format: 'markdown+html',
    tags: input.tags.slice(0, 8),
  };
  if (input.description) metadata.description = input.description;
  if (input.coverImageUrl) metadata.image = [input.coverImageUrl];

  const comment: CommentOp = [
    'comment',
    {
      parent_author: parentAuthor,
      parent_permlink: parentPermlink,
      author: input.author,
      permlink: input.permlink,
      title: input.title,
      body: input.body,
      json_metadata: JSON.stringify(metadata),
    },
  ];

  if (input.isUpdate) {
    return [comment];
  }

  const options: CommentOptionsOp = [
    'comment_options',
    {
      author: input.author,
      permlink: input.permlink,
      max_accepted_payout: '1000000.000 HBD',
      percent_hbd: 10000,
      allow_votes: true,
      allow_curation_rewards: true,
      extensions: [],
    },
  ];

  return [comment, options];
}

export function peakdUrl(author: string, permlink: string): string {
  const safeAuthor = author.replace(/[^a-z0-9.-]/gi, '');
  const safePermlink = permlink.replace(/[^a-z0-9-]/gi, '');
  return `https://peakd.com/@${safeAuthor}/${safePermlink}`;
}
