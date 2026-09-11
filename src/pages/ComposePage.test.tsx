import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComposePage } from './ComposePage';
import type { Draft } from '../db/draftsDb';
import { MIN_PUBLISH_BODY_CHARS } from '../publish/gates';

const publishableBody = 'a'.repeat(MIN_PUBLISH_BODY_CHARS);

const saveDraft = vi.fn().mockResolvedValue(undefined);
const setPreviewMarkdown = vi.fn();
const clearPreview = vi.fn();
const armUploadGesture = vi.fn();
const signUploadChallenge = vi.fn();
const unlockVault = vi.fn();
const uploadSignedImage = vi.fn();
const rememberMedia = vi.fn().mockResolvedValue(null);

vi.mock('../db/draftsDb', async () => {
  const actual = await vi.importActual<typeof import('../db/draftsDb')>('../db/draftsDb');
  return {
    ...actual,
    saveDraft: (...a: unknown[]) => saveDraft(...a),
  };
});

vi.mock('../markdown/previewFrame', () => ({
  setPreviewMarkdown: (...a: unknown[]) => setPreviewMarkdown(...a),
  clearPreview: (...a: unknown[]) => clearPreview(...a),
}));

vi.mock('../editor/ComposeEditor', () => ({
  ComposeEditor: ({
    markdown,
    onChange,
  }: {
    markdown: string;
    onChange: (v: string) => void;
  }) => (
    <textarea
      aria-label="Body"
      value={markdown}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('../crypto/authSession', () => ({
  armUploadGesture: (...a: unknown[]) => armUploadGesture(...a),
  signUploadChallenge: (...a: unknown[]) => signUploadChallenge(...a),
}));

vi.mock('../crypto/signingClient', () => ({
  signingClient: {
    unlock: (...a: unknown[]) => unlockVault(...a),
  },
}));

vi.mock('../hive/upload', () => ({
  uploadSignedImage: (...a: unknown[]) => uploadSignedImage(...a),
  isAllowedImageUrl: (url: string) => url.startsWith('https://images.hive.blog/'),
}));

vi.mock('../db/mediaDb', () => ({
  listMedia: vi.fn().mockResolvedValue([]),
  rememberMedia: (...a: unknown[]) => rememberMedia(...a),
}));

vi.mock('../components/PublishSheet', () => ({
  PublishSheet: ({ onCancel }: { onCancel: () => void }) => (
    <div>
      <h1>Publish</h1>
      <button type="button" onClick={onCancel}>
        Cancel publish
      </button>
    </div>
  ),
}));

function draft(partial: Partial<Draft> = {}): Draft {
  const now = Date.now();
  return {
    id: 'draft_c',
    title: '',
    bodyMarkdown: '',
    tags: [],
    status: 'local',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

type ComposeProps = {
  draft?: Draft;
  enrolled?: boolean;
  unlocked?: boolean;
  username?: string | null;
  postingPubkey?: string | null;
  conn?: 'online' | 'offline' | 'checking' | 'rpc_unreachable';
  onDraftSaved?: (d: Draft) => void;
  onStatusChange?: () => void | Promise<void>;
};

function renderCompose(props: ComposeProps = {}) {
  return render(
    <MemoryRouter>
      <ComposePage
        draft={draft()}
        enrolled={false}
        unlocked={false}
        username={null}
        postingPubkey={null}
        conn="online"
        onDraftSaved={vi.fn()}
        onStatusChange={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('ComposePage', () => {
  beforeEach(() => {
    saveDraft.mockClear();
    setPreviewMarkdown.mockClear();
    armUploadGesture.mockReset();
    signUploadChallenge.mockReset();
    unlockVault.mockReset().mockResolvedValue({ unlocked: true });
    uploadSignedImage.mockReset();
    rememberMedia.mockClear();
  });

  it('schedules save on title edit and toggles preview', async () => {
    const user = userEvent.setup();
    const onDraftSaved = vi.fn();
    renderCompose({ onDraftSaved });

    await user.type(screen.getByLabelText(/^Title$/i), 'Hello');
    await waitFor(() => expect(saveDraft).toHaveBeenCalled(), { timeout: 3000 });
    expect(onDraftSaved).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^Preview$/i }));
    expect(screen.getByTitle('Preview')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Write$/i }));
    expect(screen.getByLabelText(/^Body$/i)).toBeInTheDocument();
  });

  it('opens publish sheet when title and body pass gates', async () => {
    const user = userEvent.setup();
    renderCompose({
      enrolled: true,
      unlocked: true,
      username: 'alice',
      draft: draft({ title: 'Hello Hive', bodyMarkdown: publishableBody }),
    });
    await user.click(screen.getByRole('button', { name: /^Publish$/i }));
    expect(screen.getByRole('heading', { name: /^Publish$/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Cancel publish/i }));
  });

  it('blocks publish sheet when title is empty', async () => {
    const user = userEvent.setup();
    renderCompose({
      enrolled: true,
      unlocked: true,
      username: 'alice',
      draft: draft({ title: '  ', bodyMarkdown: publishableBody }),
    });
    await user.click(screen.getByRole('button', { name: /^Publish$/i }));
    expect(screen.getByText(/Add a title before publishing/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Publish$/i })).not.toBeInTheDocument();
  });

  it('blocks publish sheet when body is too short', async () => {
    const user = userEvent.setup();
    renderCompose({
      enrolled: true,
      unlocked: true,
      username: 'alice',
      draft: draft({ title: 'Hello', bodyMarkdown: 'short' }),
    });
    await user.click(screen.getByRole('button', { name: /^Publish$/i }));
    expect(screen.getByText(/Body is too short to publish/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Publish$/i })).not.toBeInTheDocument();
  });

  it('shows edited_locally banner', () => {
    renderCompose({
      draft: draft({
        status: 'edited_locally',
        title: 'T',
        publishedPermlink: 't',
      }),
    });
    expect(screen.getByText(/Published on Hive/i)).toBeInTheDocument();
  });

  it('flips published draft to edited_locally on save', async () => {
    const user = userEvent.setup();
    const onDraftSaved = vi.fn();
    saveDraft.mockImplementation(async (d: Draft) => d);
    renderCompose({
      draft: draft({
        status: 'published',
        title: 'Hello World',
        bodyMarkdown: 'Original body',
        permlink: 'hello-world',
        publishedPermlink: 'hello-world',
      }),
      onDraftSaved,
    });

    await user.type(screen.getByLabelText(/^Title$/i), '!');
    await waitFor(() => expect(saveDraft).toHaveBeenCalled(), { timeout: 3000 });

    const saved = saveDraft.mock.calls.at(-1)?.[0] as Draft;
    expect(saved.status).toBe('edited_locally');
    expect(saved.publishedPermlink).toBe('hello-world');
    expect(onDraftSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'edited_locally',
        publishedPermlink: 'hello-world',
      }),
    );
  });

  it('disables image upload control when offline', () => {
    renderCompose({
      conn: 'offline',
      unlocked: true,
      username: 'alice',
      enrolled: true,
    });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeDisabled();
  });

  it('prompts to unlock then uploads when vault is locked', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn().mockResolvedValue(undefined);
    armUploadGesture.mockResolvedValue('tok');
    signUploadChallenge.mockResolvedValue({
      username: 'alice',
      signature: 'sig',
    });
    uploadSignedImage.mockResolvedValue('https://images.hive.blog/DQm/up.jpg');
    renderCompose({
      conn: 'online',
      unlocked: false,
      username: 'alice',
      enrolled: true,
      onStatusChange,
    });
    const file = new File(['x'], 'x.png', { type: 'image/png' });
    if (!file.arrayBuffer) {
      Object.defineProperty(file, 'arrayBuffer', {
        value: async () => new Uint8Array([1, 2, 3]).buffer,
      });
    }
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /^Unlock vault$/i })).toBeInTheDocument(),
    );
    await user.type(screen.getByLabelText(/^Passphrase$/i), 'GoodPassphrase1!');
    await user.click(screen.getByRole('button', { name: /^Unlock$/i }));

    await waitFor(() => expect(unlockVault).toHaveBeenCalledWith('GoodPassphrase1!'));
    await waitFor(() => expect(onStatusChange).toHaveBeenCalled());
    await waitFor(() => expect(armUploadGesture).toHaveBeenCalled());
    await waitFor(() =>
      expect(rememberMedia).toHaveBeenCalledWith({
        username: 'alice',
        url: 'https://images.hive.blog/DQm/up.jpg',
      }),
    );
  });

  it('cancelling unlock aborts the pending image upload', async () => {
    const user = userEvent.setup();
    renderCompose({
      conn: 'online',
      unlocked: false,
      username: 'alice',
      enrolled: true,
    });
    const file = new File(['x'], 'x.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /^Unlock vault$/i })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /^Cancel$/i }));
    await waitFor(() =>
      expect(screen.getByText(/Unlock cancelled/i)).toBeInTheDocument(),
    );
    expect(armUploadGesture).not.toHaveBeenCalled();
  });

  it('keeps unlock modal open and does not upload on wrong passphrase', async () => {
    const user = userEvent.setup();
    unlockVault.mockRejectedValue(new Error('Invalid passphrase'));
    renderCompose({
      conn: 'online',
      unlocked: false,
      username: 'alice',
      enrolled: true,
    });
    const file = new File(['x'], 'x.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /^Unlock vault$/i })).toBeInTheDocument(),
    );
    await user.type(screen.getByLabelText(/^Passphrase$/i), 'nope');
    await user.click(screen.getByRole('button', { name: /^Unlock$/i }));
    await waitFor(() => expect(screen.getByText(/Invalid passphrase/i)).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: /^Unlock vault$/i })).toBeInTheDocument();
    expect(armUploadGesture).not.toHaveBeenCalled();
  });

  it('skips unlock modal when vault is already unlocked', async () => {
    armUploadGesture.mockResolvedValue('tok');
    signUploadChallenge.mockResolvedValue({
      username: 'alice',
      signature: 'sig',
    });
    uploadSignedImage.mockResolvedValue('https://images.hive.blog/DQm/up.jpg');
    renderCompose({
      conn: 'online',
      unlocked: true,
      username: 'alice',
      enrolled: true,
    });
    const file = new File(['x'], 'x.png', { type: 'image/png' });
    if (!file.arrayBuffer) {
      Object.defineProperty(file, 'arrayBuffer', {
        value: async () => new Uint8Array([1, 2, 3]).buffer,
      });
    }
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => expect(armUploadGesture).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: /^Unlock vault$/i })).not.toBeInTheDocument();
    expect(unlockVault).not.toHaveBeenCalled();
  });

  it('starts image upload gesture when unlocked', async () => {
    armUploadGesture.mockResolvedValue('tok');
    signUploadChallenge.mockRejectedValue(new Error('sign failed'));
    renderCompose({
      conn: 'online',
      unlocked: true,
      username: 'alice',
      enrolled: true,
      onDraftSaved: vi.fn(),
    });
    const file = new File(['x'], 'x.png', { type: 'image/png' });
    // jsdom File may lack arrayBuffer — polyfill for this path
    if (!file.arrayBuffer) {
      Object.defineProperty(file, 'arrayBuffer', {
        value: async () => new Uint8Array([1, 2, 3]).buffer,
      });
    }
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => expect(armUploadGesture).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/sign failed/i)).toBeInTheDocument());
  });

  it('remembers media library entry after successful upload', async () => {
    armUploadGesture.mockResolvedValue('tok');
    signUploadChallenge.mockResolvedValue({
      username: 'alice',
      signature: 'sig',
    });
    uploadSignedImage.mockResolvedValue('https://images.hive.blog/DQm/up.jpg');
    const onDraftSaved = vi.fn();
    renderCompose({
      conn: 'online',
      unlocked: true,
      username: 'alice',
      enrolled: true,
      onDraftSaved,
    });
    const file = new File(['x'], 'x.png', { type: 'image/png' });
    if (!file.arrayBuffer) {
      Object.defineProperty(file, 'arrayBuffer', {
        value: async () => new Uint8Array([1, 2, 3]).buffer,
      });
    }
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() =>
      expect(rememberMedia).toHaveBeenCalledWith({
        username: 'alice',
        url: 'https://images.hive.blog/DQm/up.jpg',
      }),
    );
    await waitFor(() => expect(saveDraft).toHaveBeenCalled(), { timeout: 3000 });
    const saved = saveDraft.mock.calls.at(-1)?.[0] as Draft;
    expect(saved.bodyMarkdown).toMatch(/images\.hive\.blog\/DQm\/up\.jpg/);
  });
});
