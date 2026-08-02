import { z } from 'zod';

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
    extensions: [];
  },
];

export type AllowedOp = CommentOp | CommentOptionsOp;

/** Hive account: 3–16 chars, letter start. */
const AccountName = z
  .string()
  .regex(/^[a-z][a-z0-9.-]{2,15}$/, 'Invalid Hive account name');

/** Root category / community / tag used as parent_permlink, or reply permlink. */
const Permlink = z
  .string()
  .regex(/^[a-z0-9][a-z0-9.-]{0,254}$/, 'Invalid permlink');

const CommentPayload = z
  .object({
    parent_author: z.union([z.literal(''), AccountName]),
    parent_permlink: Permlink,
    author: AccountName,
    permlink: Permlink,
    title: z.string().max(255),
    body: z.string().min(1).max(65_536),
    json_metadata: z.string().max(8_192),
  })
  .strict();

const CommentOptionsPayload = z
  .object({
    author: AccountName,
    permlink: Permlink,
    max_accepted_payout: z.literal('1000000.000 HBD'),
    percent_hbd: z.literal(10000),
    allow_votes: z.literal(true),
    allow_curation_rewards: z.literal(true),
    /** Quill never sets beneficiaries — empty only. */
    extensions: z.tuple([]),
  })
  .strict();

const CommentOpSchema = z.tuple([z.literal('comment'), CommentPayload]);
const CommentOptionsOpSchema = z.tuple([z.literal('comment_options'), CommentOptionsPayload]);

/** New post: comment + options. Edit: comment only. */
const OpsSchema = z.union([
  z.tuple([CommentOpSchema, CommentOptionsOpSchema]),
  z.tuple([CommentOpSchema]),
]);

/** Name-only check (legacy / UI helpers). Prefer {@link validateOps} at the worker boundary. */
export function isAllowedOp(op: unknown): op is AllowedOp {
  if (!Array.isArray(op) || op.length !== 2) return false;
  const [type] = op;
  return type === 'comment' || type === 'comment_options';
}

/** @deprecated Use {@link validateOps} — name-only, unsafe for signing. */
export function validateOpsAllowlist(ops: unknown[]): ops is AllowedOp[] {
  return ops.length > 0 && ops.every(isAllowedOp);
}

/**
 * Full payload validation for the signing worker.
 * Binds every `author` to the enrolled account and forbids beneficiaries.
 */
export function validateOps(ops: unknown, expectedAuthor: string): AllowedOp[] {
  const author = expectedAuthor.trim().toLowerCase();
  if (!AccountName.safeParse(author).success) {
    throw new Error('Enrolled account name is invalid.');
  }

  let parsed: z.infer<typeof OpsSchema>;
  try {
    parsed = OpsSchema.parse(ops);
  } catch {
    throw new Error('Only comment and comment_options operations are allowed.');
  }

  const comment = parsed[0][1];
  if (comment.author !== author) {
    throw new Error('Operation author does not match the enrolled account.');
  }

  if (parsed.length === 2) {
    const options = parsed[1][1];
    if (options.author !== author) {
      throw new Error('Operation author does not match the enrolled account.');
    }
    if (options.permlink !== comment.permlink) {
      throw new Error('comment_options permlink must match the comment.');
    }
  }

  return parsed as AllowedOp[];
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
