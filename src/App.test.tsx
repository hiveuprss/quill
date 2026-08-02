import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import App from './App';
import { signingClient } from './crypto/signingClient';
import type { Draft } from './db/draftsDb';

const listDrafts = vi.fn();
const saveDraft = vi.fn();
const getDraft = vi.fn();
const deleteDraft = vi.fn();
const getSettings = vi.fn();
const getStatus = vi.fn();

vi.mock('./db/draftsDb', async () => {
  const actual = await vi.importActual<typeof import('./db/draftsDb')>('./db/draftsDb');
  return {
    ...actual,
    listDrafts: () => listDrafts(),
    saveDraft: (...a: unknown[]) => saveDraft(...a),
    getDraft: (...a: unknown[]) => getDraft(...a),
    deleteDraft: (...a: unknown[]) => deleteDraft(...a),
    getSettings: () => getSettings(),
  };
});

vi.mock('./crypto/signingClient', () => ({
  signingClient: {
    getStatus: (...a: unknown[]) => getStatus(...a),
    setIdleTimeoutMin: vi.fn(),
  },
}));

vi.mock('./components/ConnectivityPill', () => ({
  useConnectivity: () => 'online' as const,
  ConnectivityPill: () => null,
}));

describe('App', () => {
  beforeEach(() => {
    listDrafts.mockResolvedValue([]);
    saveDraft.mockImplementation(async (d: Draft) => d);
    getDraft.mockResolvedValue(null);
    getSettings.mockResolvedValue({ key: 'app', idleTimeoutMin: 10 });
    getStatus.mockResolvedValue({
      enrolled: false,
      unlocked: false,
      username: null,
      postingPubkey: null,
      stale: false,
    });
    vi.mocked(signingClient.setIdleTimeoutMin).mockClear();
  });

  it('creates a draft from empty state', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText(/No drafts yet/i));
    await user.click(screen.getByRole('button', { name: /Start writing/i }));
    await waitFor(() => expect(saveDraft).toHaveBeenCalled());
  });

  it('shows Quill brand mark and wordmark', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    const brand = await screen.findByRole('link', { name: /^Quill$/i });
    expect(brand).toHaveAttribute('href', '/');
    expect(brand.querySelector('img.brand-mark')).toHaveAttribute('src', '/logo.svg');
    expect(screen.queryByText('Hivequill')).not.toBeInTheDocument();
  });

  it('shows draft-not-found instead of infinite loading', async () => {
    getDraft.mockResolvedValue(null);
    render(
      <MemoryRouter initialEntries={['/compose/missing']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Draft not found/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to drafts/i })).toHaveAttribute('href', '/');
  });
});
