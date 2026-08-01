/// <reference lib="webworker" />
import { Buffer } from 'buffer';
import { Client, PrivateKey } from '@hiveio/dhive';
import { deriveAesKey, randomBytes, bufToBase64, base64ToBuf, PBKDF2_ITERATIONS } from './kdf';
import { loadEnvelope, saveEnvelope, wipeEnvelope, type CredentialEnvelope } from './vaultDb';
import { validateOpsAllowlist } from '../hive/ops';

const workerGlobal = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer;
  onmessage?: DedicatedWorkerGlobalScope['onmessage'];
  postMessage?: DedicatedWorkerGlobalScope['postMessage'];
};
workerGlobal.Buffer = Buffer;

const NODES = [
  'https://api.hive.blog',
  'https://api.deathwing.me',
  'https://api.openhive.network',
];

type WorkerRequest =
  | { id: string; type: 'enroll'; username: string; wif: string; passphrase: string; acceptDual?: boolean }
  | { id: string; type: 'unlock'; passphrase: string }
  | { id: string; type: 'lock' }
  | { id: string; type: 'getStatus' }
  | { id: string; type: 'wipe' }
  | {
      id: string;
      type: 'signBroadcast';
      ops: unknown[];
      passphraseConfirm: string;
    }
  | {
      id: string;
      type: 'signUploadChallenge';
      bytes: ArrayBuffer;
      gestureToken: string;
    };

let unlockedWif: string | null = null;
let unlockedUsername: string | null = null;
let failCount = 0;
let lockUntil = 0;
let lastUploadAt = 0;
let gestureTokenValid: string | null = null;

type HiveClient = {
  database: { getAccounts: (names: string[]) => Promise<unknown> };
  broadcast: {
    sendOperations: (
      ops: Parameters<Client['broadcast']['sendOperations']>[0],
      key: Parameters<Client['broadcast']['sendOperations']>[1],
    ) => Promise<{ id: string }>;
  };
};

let clientFactory: () => HiveClient = () => new Client(NODES, { timeout: 8_000 }) as unknown as HiveClient;

function client(): HiveClient {
  return clientFactory();
}

export function __setClientFactoryForTests(factory: (() => HiveClient) | null): void {
  clientFactory = factory ?? (() => new Client(NODES, { timeout: 8_000 }) as unknown as HiveClient);
}

type MessageSink = (data: Record<string, unknown>) => void;
let testMessageSink: MessageSink | null = null;

function respond(id: string, payload: Record<string, unknown>) {
  const data = { id, ...payload };
  if (testMessageSink) {
    testMessageSink(data);
    return;
  }
  workerGlobal.postMessage?.(data);
}

function keyAuths(
  account: Record<string, unknown>,
  role: 'posting' | 'active' | 'owner',
): string[] {
  const auth = account[role] as { key_auths?: [string, number][] } | undefined;
  return (auth?.key_auths ?? []).map(([k]) => k);
}

async function encryptWif(wif: string, passphrase: string): Promise<Omit<CredentialEnvelope, 'username' | 'postingPubkey' | 'createdAt'>> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveAesKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(wif),
  );
  return {
    v: 1,
    salt: bufToBase64(salt),
    iv: bufToBase64(iv),
    ciphertext: bufToBase64(ct),
    kdf: { name: 'pbkdf2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS },
  };
}

async function decryptWif(envelope: CredentialEnvelope, passphrase: string): Promise<string> {
  const key = await deriveAesKey(passphrase, base64ToBuf(envelope.salt));
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuf(envelope.iv) },
    key,
    base64ToBuf(envelope.ciphertext),
  );
  return new TextDecoder().decode(pt);
}

function assertNotLocked() {
  if (Date.now() < lockUntil) {
    throw new Error(`Too many failed attempts. Try again in ${Math.ceil((lockUntil - Date.now()) / 1000)}s`);
  }
}

function recordFail() {
  failCount += 1;
  const delay = Math.min(60_000, 1000 * 2 ** Math.min(failCount, 6));
  lockUntil = Date.now() + delay;
}

function recordSuccess() {
  failCount = 0;
  lockUntil = 0;
}

async function handleEnroll(msg: Extract<WorkerRequest, { type: 'enroll' }>) {
  const existing = await loadEnvelope();
  if (existing) {
    throw new Error('Account already enrolled. Wipe existing account in Settings to re-enroll.');
  }

  let priv: PrivateKey;
  try {
    priv = PrivateKey.fromString(msg.wif.trim());
  } catch {
    throw new Error('Invalid posting key (WIF).');
  }
  const postingPubkey = priv.createPublic().toString();

  const accounts = (await client().database.getAccounts([msg.username.trim().toLowerCase()])) as unknown as Record<
    string,
    unknown
  >[];
  const account = accounts[0];
  if (!account) throw new Error('Account not found.');

  const posting = keyAuths(account, 'posting');
  const active = keyAuths(account, 'active');
  const owner = keyAuths(account, 'owner');

  if (!posting.includes(postingPubkey)) {
    throw new Error('This key is not a posting authority for the account.');
  }

  const dual = active.includes(postingPubkey) || owner.includes(postingPubkey);
  if (dual && !msg.acceptDual) {
    respond(msg.id, {
      ok: false,
      needsDualConfirm: true,
      message:
        'This posting key is also authorized as active/owner. Confirm to continue (common on older accounts).',
      postingPubkey,
    });
    return;
  }

  const wrapped = await encryptWif(msg.wif.trim(), msg.passphrase);
  const envelope: CredentialEnvelope = {
    ...wrapped,
    username: String(account.name),
    postingPubkey,
    createdAt: Date.now(),
  };
  await saveEnvelope(envelope);

  unlockedWif = msg.wif.trim();
  unlockedUsername = envelope.username;
  recordSuccess();

  respond(msg.id, {
    ok: true,
    username: envelope.username,
    postingPubkey,
    dualAuthority: dual,
  });
}

async function handleUnlock(msg: Extract<WorkerRequest, { type: 'unlock' }>) {
  assertNotLocked();
  const envelope = await loadEnvelope();
  if (!envelope) throw new Error('No enrolled account.');

  try {
    const wif = await decryptWif(envelope, msg.passphrase);
    const priv = PrivateKey.fromString(wif);
    const pub = priv.createPublic().toString();
    if (pub !== envelope.postingPubkey) throw new Error('Key mismatch in envelope.');
    unlockedWif = wif;
    unlockedUsername = envelope.username;
    recordSuccess();
    respond(msg.id, {
      ok: true,
      unlocked: true,
      username: envelope.username,
      postingPubkey: envelope.postingPubkey,
    });
  } catch {
    recordFail();
    throw new Error('Incorrect passphrase.');
  }
}

async function rotationCheck(username: string, storedPubkey: string) {
  const pubs: string[][] = [];
  for (let i = 0; i < 2; i++) {
    try {
      const accounts = (await client().database.getAccounts([username])) as unknown as Record<
        string,
        unknown
      >[];
      pubs.push(keyAuths(accounts[0] ?? {}, 'posting'));
    } catch {
      pubs.push([]);
    }
  }
  if (!pubs[0].length && !pubs[1].length) return 'fail' as const;
  const a = pubs[0].slice().sort().join(',');
  const b = pubs[1].slice().sort().join(',');
  if (pubs[0].length && pubs[1].length && a !== b) return 'disagree' as const;
  const posting = pubs[0].length ? pubs[0] : pubs[1];
  return posting.includes(storedPubkey) ? ('match' as const) : ('mismatch' as const);
}

async function handleSignBroadcast(msg: Extract<WorkerRequest, { type: 'signBroadcast' }>) {
  assertNotLocked();
  if (!validateOpsAllowlist(msg.ops)) {
    throw new Error('Only comment and comment_options operations are allowed.');
  }
  const envelope = await loadEnvelope();
  if (!envelope) throw new Error('No enrolled account.');

  try {
    const wif = await decryptWif(envelope, msg.passphraseConfirm);
    if (PrivateKey.fromString(wif).createPublic().toString() !== envelope.postingPubkey) {
      throw new Error('Passphrase confirmation failed.');
    }
    recordSuccess();
    unlockedWif = wif;
    unlockedUsername = envelope.username;
  } catch {
    recordFail();
    throw new Error('Incorrect passphrase.');
  }

  const rot = await rotationCheck(envelope.username, envelope.postingPubkey);
  if (rot === 'disagree') {
    throw new Error('API nodes disagree on your key status — publish blocked for safety.');
  }
  if (rot === 'mismatch') {
    await wipeEnvelope();
    unlockedWif = null;
    unlockedUsername = null;
    respond(msg.id, { ok: false, reauth_required: true, message: 'Posting key rotated on-chain. Re-enroll.' });
    return;
  }
  if (rot === 'fail') throw new Error('Could not verify key rotation status.');

  const c = client();
  const priv = PrivateKey.fromString(unlockedWif!);
  const result = await c.broadcast.sendOperations(msg.ops as Parameters<Client['broadcast']['sendOperations']>[0], priv);
  respond(msg.id, { ok: true, txId: result.id });
}

async function handleUpload(msg: Extract<WorkerRequest, { type: 'signUploadChallenge' }>) {
  if (!unlockedWif || !unlockedUsername) throw new Error('Unlock required before upload.');
  if (!msg.gestureToken || msg.gestureToken !== gestureTokenValid) {
    throw new Error('Upload must follow a user file-picker gesture.');
  }
  gestureTokenValid = null;
  const now = Date.now();
  if (now - lastUploadAt < 3000) throw new Error('Upload rate limited — wait a moment.');
  lastUploadAt = now;

  const bytes = new Uint8Array(msg.bytes);
  const prefix = new TextEncoder().encode('ImageSigningChallenge');
  const combined = new Uint8Array(prefix.length + bytes.length);
  combined.set(prefix, 0);
  combined.set(bytes, prefix.length);
  const hash = await crypto.subtle.digest('SHA-256', combined);
  const priv = PrivateKey.fromString(unlockedWif);
  // dhive sign hash buffer
  const sig = priv.sign(Buffer.from(hash)).toString();
  respond(msg.id, { ok: true, signature: sig, username: unlockedUsername });
}

export type WorkerInbound =
  | WorkerRequest
  | { id: string; type: 'armGesture'; token: string };

/** Reset in-memory unlock/rate-limit state between unit tests. */
export function __resetWorkerStateForTests(): void {
  unlockedWif = null;
  unlockedUsername = null;
  failCount = 0;
  lockUntil = 0;
  lastUploadAt = 0;
  gestureTokenValid = null;
  testMessageSink = null;
  clientFactory = () => new Client(NODES, { timeout: 8_000 }) as unknown as HiveClient;
}

export function __setMessageSinkForTests(sink: MessageSink | null): void {
  testMessageSink = sink;
}

export async function handleWorkerMessage(msg: WorkerInbound): Promise<void> {
  try {
    if (msg.type === 'armGesture') {
      gestureTokenValid = msg.token;
      respond(msg.id, { ok: true });
      return;
    }
    switch (msg.type) {
      case 'enroll':
        await handleEnroll(msg);
        break;
      case 'unlock':
        await handleUnlock(msg);
        break;
      case 'lock':
        unlockedWif = null;
        unlockedUsername = null;
        respond(msg.id, { ok: true, unlocked: false });
        break;
      case 'getStatus': {
        const envelope = await loadEnvelope();
        respond(msg.id, {
          ok: true,
          enrolled: !!envelope,
          unlocked: !!unlockedWif,
          username: envelope?.username ?? null,
          postingPubkey: envelope?.postingPubkey ?? null,
        });
        break;
      }
      case 'wipe':
        await wipeEnvelope();
        unlockedWif = null;
        unlockedUsername = null;
        respond(msg.id, { ok: true });
        break;
      case 'signBroadcast':
        await handleSignBroadcast(msg);
        break;
      case 'signUploadChallenge':
        await handleUpload(msg);
        break;
      default:
        respond((msg as { id: string }).id, { ok: false, error: 'Unknown message type' });
    }
  } catch (err) {
    respond((msg as { id: string }).id, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

if (typeof workerGlobal.onmessage !== 'undefined' || typeof DedicatedWorkerGlobalScope !== 'undefined') {
  workerGlobal.onmessage = async (ev: MessageEvent) => {
    await handleWorkerMessage(ev.data as WorkerInbound);
  };
}
