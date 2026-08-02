import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishSheet } from './PublishSheet';
import type { Draft } from '../db/draftsDb';
import { MIN_PUBLISH_BODY_CHARS } from '../publish/gates';

const pingHive = vi.fn();
const verifyRotation = vi.fn();
const signBroadcast = vi.fn();
const longBody = `${'This is a publishable Hive post body. '.repeat(4)}`.slice(
  0,
  MIN_PUBLISH_BODY_CHARS + 20,
);

vi.mock('../hive/client', () => ({
  pingHive: () => pingHive(),
}));

vi.mock('../hive/account', () => ({
  verifyRotation: (...a: unknown[]) => verifyRotation(...a),
}));

vi.mock('../crypto/signingClient', () => ({
  signingClient: {
    signBroadcast: (...a: unknown[]) => signBroadcast(...a),
  },
}));

function draft(partial: Partial<Draft> = {}): Draft {
  const now = Date.now();
  return {
    id: 'd1',
    title: 'Title',
    bodyMarkdown: longBody,
    tags: ['blog'],
    status: 'local',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

const baseProps = {
  draft: draft(),
  conn: 'online' as const,
  enrolled: true,
  unlocked: true,
  username: 'alice',
  postingPubkey: 'STM1',
  onUpdateDraft: vi.fn(),
  onNeedEnroll: vi.fn(),
  onPublished: vi.fn(),
  onCancel: vi.fn(),
};

describe('PublishSheet', () => {
  beforeEach(() => {
    pingHive.mockReset().mockResolvedValue(true);
    verifyRotation.mockReset().mockResolvedValue('match');
    signBroadcast.mockReset().mockResolvedValue({ ok: true, txId: 'tx' });
  });

  it('blocks when offline', () => {
    render(<PublishSheet {...baseProps} conn="offline" />);
    expect(screen.getByRole('button', { name: /Offline/i })).toBeDisabled();
  });

  it('blocks when title missing', () => {
    render(<PublishSheet {...baseProps} draft={draft({ title: '  ' })} />);
    expect(screen.getByRole('button', { name: /Title required/i })).toBeDisabled();
  });

  it('blocks when body is too short', () => {
    render(<PublishSheet {...baseProps} draft={draft({ bodyMarkdown: 'too short' })} />);
    expect(screen.getByRole('button', { name: /Body too short/i })).toBeDisabled();
  });

  it('prompts enroll when not enrolled', async () => {
    const onNeedEnroll = vi.fn();
    render(<PublishSheet {...baseProps} enrolled={false} onNeedEnroll={onNeedEnroll} />);
    await userEvent.click(screen.getByRole('button', { name: /Enroll posting key/i }));
    expect(onNeedEnroll).toHaveBeenCalled();
  });

  it('publishes successfully', async () => {
    const user = userEvent.setup();
    const onPublished = vi.fn();
    render(<PublishSheet {...baseProps} onPublished={onPublished} />);
    await user.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => screen.getByLabelText(/Passphrase \(required/i));
    await user.type(screen.getByLabelText(/Passphrase \(required/i), 'GoodPassphrase1!');
    await user.click(screen.getByRole('button', { name: /Confirm publish/i }));
    await waitFor(() => expect(onPublished).toHaveBeenCalled());
    expect(screen.getByText(/Published/i)).toBeInTheDocument();
  });

  it('republishes edited_locally draft as comment-only update', async () => {
    const user = userEvent.setup();
    const onPublished = vi.fn();
    render(
      <PublishSheet
        {...baseProps}
        draft={draft({
          status: 'edited_locally',
          title: 'Hello World',
          bodyMarkdown: `${longBody} Updated.`,
          permlink: 'hello-world',
          publishedPermlink: 'hello-world',
          tags: ['blog'],
        })}
        onPublished={onPublished}
      />,
    );

    expect(screen.getByText(/Confirm will update the existing post/i)).toBeInTheDocument();
    expect(screen.getByText(/mode: UPDATE existing/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => screen.getByLabelText(/Passphrase \(required/i));
    await user.type(screen.getByLabelText(/Passphrase \(required/i), 'GoodPassphrase1!');
    await user.click(screen.getByRole('button', { name: /Confirm publish/i }));
    await waitFor(() => expect(signBroadcast).toHaveBeenCalled());

    const ops = signBroadcast.mock.calls[0][0] as Array<[string, { permlink: string }]>;
    expect(ops).toHaveLength(1);
    expect(ops[0][0]).toBe('comment');
    expect(ops[0][1].permlink).toBe('hello-world');

    await waitFor(() => expect(onPublished).toHaveBeenCalled());
    expect(onPublished).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'published',
        publishedPermlink: 'hello-world',
        permlink: 'hello-world',
      }),
      expect.stringContaining('/@alice/hello-world'),
    );
  });

  it('treats published status with publishedPermlink as update', async () => {
    const user = userEvent.setup();
    render(
      <PublishSheet
        {...baseProps}
        draft={draft({
          status: 'published',
          title: 'Hello World',
          permlink: 'hello-world',
          publishedPermlink: 'hello-world',
        })}
      />,
    );
    expect(screen.getByText(/mode: UPDATE existing/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => screen.getByLabelText(/Passphrase \(required/i));
    await user.type(screen.getByLabelText(/Passphrase \(required/i), 'GoodPassphrase1!');
    await user.click(screen.getByRole('button', { name: /Confirm publish/i }));
    await waitFor(() => expect(signBroadcast).toHaveBeenCalled());

    const ops = signBroadcast.mock.calls[0][0] as Array<[string, unknown]>;
    expect(ops).toHaveLength(1);
    expect(ops[0][0]).toBe('comment');
  });

  it('surfaces reauth_required', async () => {
    const user = userEvent.setup();
    signBroadcast.mockResolvedValue({ reauth_required: true, message: 'Re-enroll required' });
    render(<PublishSheet {...baseProps} />);
    await user.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => screen.getByLabelText(/Passphrase \(required/i));
    await user.type(screen.getByLabelText(/Passphrase \(required/i), 'GoodPassphrase1!');
    await user.click(screen.getByRole('button', { name: /Confirm publish/i }));
    await waitFor(() => expect(screen.getByText(/Re-enroll/i)).toBeInTheDocument());
  });

  it('errors when ping fails', async () => {
    const user = userEvent.setup();
    pingHive.mockResolvedValue(false);
    render(<PublishSheet {...baseProps} />);
    await user.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => expect(screen.getByText(/Hive API unreachable/i)).toBeInTheDocument());
  });

  it('errors on rotation disagree and mismatch', async () => {
    const user = userEvent.setup();
    verifyRotation.mockResolvedValueOnce('disagree');
    const { rerender } = render(<PublishSheet {...baseProps} />);
    await user.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => expect(screen.getByText(/disagree/i)).toBeInTheDocument());

    verifyRotation.mockResolvedValueOnce('mismatch');
    rerender(<PublishSheet {...baseProps} />);
    await user.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => expect(screen.getByText(/no longer authorised|kept — wipe/i)).toBeInTheDocument());
  });

  it('updates tags via form', async () => {
    const user = userEvent.setup();
    const onUpdateDraft = vi.fn();
    render(<PublishSheet {...baseProps} onUpdateDraft={onUpdateDraft} />);
    await user.type(screen.getByLabelText(/Tags/i), ',news');
    expect(onUpdateDraft).toHaveBeenCalled();
  });
});
