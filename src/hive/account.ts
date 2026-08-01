import { getAccountsMulti, rpcCall } from './client';

export type AuthorityCheck =
  | { ok: true; postingPubkey: string; dualAuthority: boolean; username: string }
  | { ok: false; reason: string };

function keyAuths(
  account: Record<string, unknown>,
  role: 'posting' | 'active' | 'owner',
): string[] {
  const auth = account[role] as { key_auths?: [string, number][] } | undefined;
  return (auth?.key_auths ?? []).map(([k]) => k);
}

export async function lookupAccount(username: string): Promise<Record<string, unknown> | null> {
  const result = (await rpcCall('condenser_api.get_accounts', [[username]])) as unknown[];
  const account = result?.[0];
  return account && typeof account === 'object' ? (account as Record<string, unknown>) : null;
}

export function checkPostingAuthority(
  account: Record<string, unknown>,
  postingPubkey: string,
): AuthorityCheck {
  const username = String(account.name ?? '');
  const posting = keyAuths(account, 'posting');
  const active = keyAuths(account, 'active');
  const owner = keyAuths(account, 'owner');

  if (!posting.includes(postingPubkey)) {
    return {
      ok: false,
      reason: 'This key is not a posting authority for the account.',
    };
  }

  const dualAuthority = active.includes(postingPubkey) || owner.includes(postingPubkey);
  return { ok: true, postingPubkey, dualAuthority, username };
}

export async function verifyRotation(
  username: string,
  storedPubkey: string,
): Promise<'match' | 'mismatch' | 'disagree' | 'fail'> {
  const { accounts, agreement } = await getAccountsMulti(username);
  if (agreement === 'disagree') return 'disagree';
  if (agreement === 'fail' || !accounts[0]) return 'fail';
  const posting = keyAuths(accounts[0] as Record<string, unknown>, 'posting');
  return posting.includes(storedPubkey) ? 'match' : 'mismatch';
}

export async function getRcWarning(_username: string): Promise<string | null> {
  // Soft-warn placeholder — do not hard-block publish on RC.
  return null;
}
