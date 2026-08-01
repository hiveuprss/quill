import { vi } from 'vitest';

/**
 * Disposable test key fixtures (never real accounts).
 * Pubs/WIFs were derived offline from seeds; avoid dhive crypto in jsdom.
 */
const FIXTURES: Record<
  string,
  { wif: string; pub: string }
> = {
  'hivequill-test-seed-v1': {
    wif: '5JUcYxLXNVvQUDQxkqFhe52NJXEHqDFU6oDpfP1qbcfzksDY4ox',
    pub: 'STM8VHyLYpsqbX9QXnfP59CMPomD6pZ5hcFsrvbVd48hATS6kbcX4',
  },
  'worker-enroll-seed': {
    wif: '5HxfLvKydjs6WLm9cvnAcpr9ckjNByY9kwNMj433eDUhEv6qKgW',
    pub: 'STM5TjkPzmzdR1gZfib53a5vVVd9BUWinfotrpuhShQ31ny25gSVZ',
  },
  'other-key': {
    wif: '5JV4FLmMrNh44VFKGcadALAKpC8b1txaw2EXMjJ2LD1DzxL1WZH',
    pub: 'STM5B852AZYiUHcbBhuqh87XWcBBDpWootdXP4QiBtZ8Vx7WfkaJF',
  },
};

export function makeTestPostingKey(seed = 'hivequill-test-seed-v1') {
  const fixture = FIXTURES[seed] ?? FIXTURES['hivequill-test-seed-v1'];
  return { ...fixture, priv: null };
}

export function mockAccount(name: string, postingPub: string, opts?: { dual?: boolean }) {
  const posting = {
    weight_threshold: 1,
    account_auths: [],
    key_auths: [[postingPub, 1]] as [string, number][],
  };
  const other = {
    weight_threshold: 1,
    account_auths: [],
    key_auths: [['STM1111111111111111111111111111111114T1Anm', 1]] as [string, number][],
  };
  return {
    name,
    posting,
    active: opts?.dual ? posting : other,
    owner: other,
  };
}

export function jsonRpcOk(result: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: '2.0', id: 1, result }),
    text: async () => JSON.stringify({ result }),
  } as Response;
}

export function stubHiveFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response> | Response,
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return handler(url, init);
  });
}
