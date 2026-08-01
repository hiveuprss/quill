import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ConnectivityPill, useConnectivity } from './ConnectivityPill';

const pingHive = vi.fn();

vi.mock('../hive/client', () => ({
  pingHive: () => pingHive(),
}));

function Probe() {
  const state = useConnectivity(60_000);
  return <ConnectivityPill state={state} />;
}

describe('ConnectivityPill', () => {
  beforeEach(() => {
    pingHive.mockReset();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hides when online', async () => {
    pingHive.mockResolvedValue(true);
    const { container } = render(<Probe />);
    await waitFor(() => expect(pingHive).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('.pill')).toBeNull());
  });

  it('shows offline', () => {
    render(<ConnectivityPill state="offline" />);
    expect(screen.getByText(/Offline/i)).toBeInTheDocument();
  });

  it('shows rpc unreachable', () => {
    render(<ConnectivityPill state="rpc_unreachable" />);
    expect(screen.getByText(/unreachable/i)).toBeInTheDocument();
  });

  it('shows checking while ping in flight', () => {
    render(<ConnectivityPill state="checking" />);
    expect(screen.getByText(/Checking/i)).toBeInTheDocument();
  });
});
