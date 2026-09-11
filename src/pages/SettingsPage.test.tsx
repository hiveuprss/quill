import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSettings, saveSettings } from '../db/draftsDb';
import i18n from '../i18n';
import { applyTheme } from '../theme/applyTheme';
import { SettingsPage } from './SettingsPage';

const unlock = vi.fn().mockResolvedValue({});
const lock = vi.fn().mockResolvedValue({});
const wipeLocal = vi.fn().mockResolvedValue({});
const disconnectKeychain = vi.fn().mockResolvedValue(undefined);
const setIdleTimeoutMin = vi.fn();

vi.mock('../crypto/authSession', () => ({
  unlock: (...a: unknown[]) => unlock(...a),
  lock: (...a: unknown[]) => lock(...a),
  wipeLocal: (...a: unknown[]) => wipeLocal(...a),
  disconnectKeychain: (...a: unknown[]) => disconnectKeychain(...a),
  setIdleTimeoutMin: (...a: unknown[]) => setIdleTimeoutMin(...a),
}));

describe('SettingsPage', () => {
  beforeEach(async () => {
    await saveSettings({ key: 'app', idleTimeoutMin: 10, locale: 'system', theme: 'light' });
    applyTheme('light');
    unlock.mockReset().mockResolvedValue({});
    lock.mockReset().mockResolvedValue({});
    wipeLocal.mockReset().mockResolvedValue({});
    disconnectKeychain.mockReset().mockResolvedValue(undefined);
  });

  it('shows not enrolled message', async () => {
    render(
      <SettingsPage enrolled={false} username={null} postingPubkey={null} onStatusChange={vi.fn()} />,
    );
    await waitFor(() =>
      expect(screen.getByText(/No account enrolled/i)).toBeInTheDocument(),
    );
  });

  it('uses Quill in security copy', async () => {
    render(
      <SettingsPage enrolled={false} username={null} postingPubkey={null} onStatusChange={vi.fn()} />,
    );
    await waitFor(() =>
      expect(screen.getByText(/Quill encrypts your posting key/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Hivequill/i)).not.toBeInTheDocument();
  });

  it('unlocks, locks, saves idle, and wipes', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    render(
      <SettingsPage
        enrolled
        authMethod="local"
        username="alice"
        postingPubkey="STM1"
        onStatusChange={onStatusChange}
      />,
    );
    await waitFor(() => screen.getByText(/Enrolled as/i));

    await user.type(screen.getByLabelText(/Unlock passphrase/i), 'GoodPassphrase1!');
    await user.click(screen.getByRole('button', { name: /^Unlock$/i }));
    await waitFor(() => expect(unlock).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /^Lock$/i }));
    await waitFor(() => expect(lock).toHaveBeenCalled());

    const idleLabel = screen.getByLabelText(/Auto-lock after/i);
    await user.selectOptions(idleLabel, '15');
    const idleForm = idleLabel.closest('form');
    expect(idleForm).toBeTruthy();
    await user.click(within(idleForm as HTMLElement).getByRole('button', { name: /^Save$/i }));
    await waitFor(() => expect(screen.getByText(/Idle timeout saved/i)).toBeInTheDocument());

    await user.type(screen.getByLabelText(/Wipe stored key/i), '@alice');
    await user.click(screen.getByRole('button', { name: /Wipe envelope/i }));
    await waitFor(() => expect(wipeLocal).toHaveBeenCalled());
    expect(onStatusChange).toHaveBeenCalled();
  });

  it('disconnects Keychain without unlock UI', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    render(
      <SettingsPage
        enrolled
        authMethod="keychain"
        username="alice"
        postingPubkey={null}
        onStatusChange={onStatusChange}
      />,
    );
    await waitFor(() => screen.getByText(/Connected as/i));
    expect(screen.queryByLabelText(/Unlock passphrase/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Auto-lock after/i)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/Disconnect Keychain/i), 'alice');
    await user.click(screen.getByRole('button', { name: /Disconnect Keychain/i }));
    await waitFor(() => expect(disconnectKeychain).toHaveBeenCalled());
    expect(wipeLocal).not.toHaveBeenCalled();
    expect(onStatusChange).toHaveBeenCalled();
  });

  it('rejects wipe without matching username', async () => {
    const user = userEvent.setup();
    render(
      <SettingsPage
        enrolled
        authMethod="local"
        username="alice"
        postingPubkey="STM1"
        onStatusChange={vi.fn()}
      />,
    );
    await waitFor(() => screen.getByText(/Enrolled as/i));
    await user.type(screen.getByLabelText(/Wipe stored key/i), 'bob');
    await user.click(screen.getByRole('button', { name: /Wipe envelope/i }));
    await waitFor(() =>
      expect(screen.getByText(/exact username/i)).toBeInTheDocument(),
    );
    expect(wipeLocal).not.toHaveBeenCalled();
  });

  it('switches theme immediately and persists', async () => {
    const user = userEvent.setup();
    render(
      <SettingsPage enrolled={false} username={null} postingPubkey={null} onStatusChange={vi.fn()} />,
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /^Theme$/i })).toBeInTheDocument(),
    );
    const themeSelect = screen.getByRole('combobox', { name: /^Theme$/i });
    await user.selectOptions(themeSelect, 'nocturne');
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('nocturne'));
    await waitFor(() => expect(screen.getByText(/Theme saved/i)).toBeInTheDocument());
    const saved = await getSettings();
    expect(saved.theme).toBe('nocturne');
  });

  it('switches UI language to Spanish and persists locale', async () => {
    const user = userEvent.setup();
    render(
      <SettingsPage enrolled={false} username={null} postingPubkey={null} onStatusChange={vi.fn()} />,
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /^Language$/i })).toBeInTheDocument(),
    );

    const languageSelect = screen.getByRole('combobox', { name: /^Language$/i });
    await user.selectOptions(languageSelect, 'es');
    const langForm = languageSelect.closest('form');
    expect(langForm).toBeTruthy();
    await user.click(within(langForm as HTMLElement).getByRole('button', { name: /^Save$/i }));

    await waitFor(() => expect(i18n.language).toBe('es'));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /^Idioma$/i })).toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByText(/Idioma guardado/i)).toBeInTheDocument());
    const saved = await getSettings();
    expect(saved.locale).toBe('es');
  });
});
