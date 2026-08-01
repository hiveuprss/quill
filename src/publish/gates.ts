/** Minimum meaningful body length (whitespace-collapsed) before publish. */
export const MIN_PUBLISH_BODY_CHARS = 80;

export type PublishContentGate =
  | { ok: true }
  | {
      ok: false;
      code: 'empty_title' | 'short_body';
      bodyLen: number;
      minBody: number;
    };

/** Collapse whitespace for length checks (titles/bodies). */
export function normalizePublishText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Sanity-check title + body before entering or continuing publish. */
export function checkPublishContent(input: {
  title: string;
  bodyMarkdown: string;
}): PublishContentGate {
  const title = normalizePublishText(input.title);
  const body = normalizePublishText(input.bodyMarkdown);
  if (!title) {
    return {
      ok: false,
      code: 'empty_title',
      bodyLen: body.length,
      minBody: MIN_PUBLISH_BODY_CHARS,
    };
  }
  if (body.length < MIN_PUBLISH_BODY_CHARS) {
    return {
      ok: false,
      code: 'short_body',
      bodyLen: body.length,
      minBody: MIN_PUBLISH_BODY_CHARS,
    };
  }
  return { ok: true };
}
