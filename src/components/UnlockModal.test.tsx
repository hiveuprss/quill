import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnlockModal } from './UnlockModal';

const unlock = vi.fn();

vi.mock('../crypto/signingClient', () => ({
  signingClient: {
    unlock: (...a: unknown[]) => unlock(...a),
  },
}));

describe('UnlockModal', () => {
  beforeEach(() => {
    unlock.mockReset().mockResolvedValue({ unlocked: true });
  });

  it('unlocks and calls onUnlocked', async () => {
    const user = userEvent.setup();
    const onUnlocked = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    render(
      <UnlockModal open reason="Need key" onCancel={onCancel} onUnlocked={onUnlocked} />,
    );
    expect(screen.getByText(/Need key/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Passphrase$/i), 'GoodPassphrase1!');
    await user.click(screen.getByRole('button', { name: /^Unlock$/i }));
    await waitFor(() => expect(unlock).toHaveBeenCalledWith('GoodPassphrase1!'));
    await waitFor(() => expect(onUnlocked).toHaveBeenCalled());
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('keeps the modal open on wrong passphrase', async () => {
    const user = userEvent.setup();
    unlock.mockRejectedValue(new Error('Invalid passphrase'));
    const onUnlocked = vi.fn();
    render(
      <UnlockModal open onCancel={vi.fn()} onUnlocked={onUnlocked} />,
    );
    await user.type(screen.getByLabelText(/^Passphrase$/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /^Unlock$/i }));
    await waitFor(() => expect(screen.getByText(/Invalid passphrase/i)).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: /^Unlock vault$/i })).toBeInTheDocument();
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  it('cancel invokes onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<UnlockModal open onCancel={onCancel} onUnlocked={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /^Cancel$/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
