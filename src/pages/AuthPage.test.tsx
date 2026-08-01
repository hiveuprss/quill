import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthPage } from './AuthPage';

const lookupAccount = vi.fn();
const enroll = vi.fn();

vi.mock('../hive/account', () => ({
  lookupAccount: (...args: unknown[]) => lookupAccount(...args),
}));

vi.mock('../crypto/signingClient', () => ({
  signingClient: {
    enroll: (...args: unknown[]) => enroll(...args),
  },
}));

describe('AuthPage', () => {
  beforeEach(() => {
    lookupAccount.mockReset();
    enroll.mockReset();
  });

  it('looks up username then asks for WIF', async () => {
    const user = userEvent.setup();
    lookupAccount.mockResolvedValue({ name: 'alice' });
    render(<AuthPage onDone={vi.fn()} />);
    await user.type(screen.getByLabelText(/Hive username/i), 'alice');
    await user.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => expect(screen.getByText(/found\. Paste the posting/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/Posting private key/i)).toBeInTheDocument();
  });

  it('shows error when account missing', async () => {
    const user = userEvent.setup();
    lookupAccount.mockResolvedValue(null);
    render(<AuthPage onDone={vi.fn()} />);
    await user.type(screen.getByLabelText(/Hive username/i), 'nobody');
    await user.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => expect(screen.getByText(/Account not found/i)).toBeInTheDocument());
  });

  it('cancels in-flight lookup', async () => {
    const user = userEvent.setup();
    let resolveLookup: (v: unknown) => void = () => undefined;
    lookupAccount.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLookup = resolve;
        }),
    );
    render(<AuthPage onDone={vi.fn()} />);
    await user.type(screen.getByLabelText(/Hive username/i), 'alice');
    await user.click(screen.getByRole('button', { name: /^Continue$/i }));
    expect(screen.getByRole('button', { name: /Looking up/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /^Cancel$/i }));
    resolveLookup({ name: 'alice' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Continue$/i })).toBeEnabled(),
    );
    expect(screen.queryByText(/found\. Paste the posting/i)).not.toBeInTheDocument();
  });

  it('enrolls after passphrase checks', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    lookupAccount.mockResolvedValue({ name: 'alice' });
    enroll.mockResolvedValue({ ok: true });
    render(<AuthPage onDone={onDone} />);
    await user.type(screen.getByLabelText(/Hive username/i), 'alice');
    await user.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => screen.getByLabelText(/Posting private key/i));
    await user.type(screen.getByLabelText(/Posting private key/i), '5Kabcdefghijklmnopqrstuvwxyz');
    await user.click(screen.getByRole('button', { name: /^Continue$/i }));
    await user.type(screen.getByLabelText(/^Passphrase/i), 'GoodPassphrase1!');
    await user.type(screen.getByLabelText(/Confirm passphrase/i), 'GoodPassphrase1!');
    await user.click(screen.getByRole('button', { name: /Encrypt/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('surfaces dual-authority confirm', async () => {
    const user = userEvent.setup();
    lookupAccount.mockResolvedValue({ name: 'alice' });
    enroll.mockResolvedValue({
      needsDualConfirm: true,
      message: 'Dual key warning',
    });
    render(<AuthPage onDone={vi.fn()} />);
    await user.type(screen.getByLabelText(/Hive username/i), 'alice');
    await user.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => screen.getByLabelText(/Posting private key/i));
    await user.type(screen.getByLabelText(/Posting private key/i), '5Kabcdefghijklmnopqrstuvwxyz');
    await user.click(screen.getByRole('button', { name: /^Continue$/i }));
    await user.type(screen.getByLabelText(/^Passphrase/i), 'GoodPassphrase1!');
    await user.type(screen.getByLabelText(/Confirm passphrase/i), 'GoodPassphrase1!');
    await user.click(screen.getByRole('button', { name: /Encrypt/i }));
    await waitFor(() => expect(screen.getByText(/Dual key warning/i)).toBeInTheDocument());
  });

  it('blocks enroll UI when already enrolled', () => {
    render(
      <MemoryRouter>
        <AuthPage enrolled onDone={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/already enrolled/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Settings/i })).toHaveAttribute(
      'href',
      '/settings',
    );
  });
});
