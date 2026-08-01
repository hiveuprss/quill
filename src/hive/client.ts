const DEFAULT_NODES = [
  'https://api.hive.blog',
  'https://api.deathwing.me',
  'https://api.openhive.network',
];

/** Per-node fetch budget — hung nodes must not block failover forever. */
const NODE_TIMEOUT_MS = 8_000;

export type JsonRpcResult = unknown;

async function callNode(
  node: string,
  method: string,
  params: unknown[],
  timeoutMs = NODE_TIMEOUT_MS,
): Promise<JsonRpcResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(node, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`RPC HTTP ${res.status} from ${node}`);
    const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
    if (json.error) throw new Error(json.error.message || 'RPC error');
    return json.result;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`RPC timeout (${timeoutMs}ms) from ${node}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function rpcCall(
  method: string,
  params: unknown[],
  nodes: string[] = DEFAULT_NODES,
): Promise<JsonRpcResult> {
  let lastError: unknown;
  for (const node of nodes) {
    try {
      return await callNode(node, method, params);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('All Hive API nodes failed');
}

export async function pingHive(): Promise<boolean> {
  try {
    await rpcCall('condenser_api.get_dynamic_global_properties', []);
    return true;
  } catch {
    return false;
  }
}

export async function getAccountsMulti(
  username: string,
  nodes: string[] = DEFAULT_NODES,
): Promise<{ accounts: unknown[]; agreement: 'ok' | 'disagree' | 'fail' }> {
  const results: unknown[] = [];
  for (const node of nodes.slice(0, 2)) {
    try {
      const accounts = (await callNode(node, 'condenser_api.get_accounts', [
        [username],
      ])) as unknown[];
      results.push(accounts?.[0] ?? null);
    } catch {
      results.push(null);
    }
  }
  if (results.every((r) => r === null)) return { accounts: [], agreement: 'fail' };
  const a = JSON.stringify(extractPostingKeys(results[0]));
  const b = JSON.stringify(extractPostingKeys(results[1]));
  if (results[0] && results[1] && a !== b) {
    return { accounts: results, agreement: 'disagree' };
  }
  const account = results.find((r) => r !== null);
  return { accounts: account ? [account] : [], agreement: 'ok' };
}

function extractPostingKeys(account: unknown): string[] {
  if (!account || typeof account !== 'object') return [];
  const posting = (account as { posting?: { key_auths?: [string, number][] } }).posting;
  return (posting?.key_auths ?? []).map(([k]) => k);
}

export { DEFAULT_NODES };
