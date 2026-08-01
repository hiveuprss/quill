import SigningWorker from './signingWorker?worker';

type Status = {
  enrolled: boolean;
  unlocked: boolean;
  username: string | null;
  postingPubkey: string | null;
};

type Pending = {
  resolve: (v: Record<string, unknown>) => void;
  reject: (e: Error) => void;
};

class SigningClient {
  private worker: Worker | null = null;
  private pending = new Map<string, Pending>();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private idleMs = 10 * 60 * 1000;

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new SigningWorker();
      this.worker.onmessage = (ev: MessageEvent) => {
        const data = ev.data as { id: string } & Record<string, unknown>;
        const p = this.pending.get(data.id);
        if (!p) return;
        this.pending.delete(data.id);
        if (data.ok === false && !data.needsDualConfirm && !data.reauth_required) {
          p.reject(new Error(String(data.error || data.message || 'Worker error')));
        } else {
          p.resolve(data);
        }
      };
      this.worker.onerror = (err) => {
        console.error('Signing worker error', err);
      };
    }
    return this.worker;
  }

  private call(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = crypto.randomUUID();
    const worker = this.ensureWorker();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ ...payload, id });
    });
  }

  setIdleTimeoutMin(minutes: number) {
    this.idleMs = Math.min(15, Math.max(5, minutes)) * 60 * 1000;
    this.bumpIdle();
  }

  private bumpIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      void this.lock();
    }, this.idleMs);
  }

  async getStatus(): Promise<Status> {
    const res = await this.call({ type: 'getStatus' });
    return {
      enrolled: !!res.enrolled,
      unlocked: !!res.unlocked,
      username: (res.username as string) ?? null,
      postingPubkey: (res.postingPubkey as string) ?? null,
    };
  }

  async enroll(input: {
    username: string;
    wif: string;
    passphrase: string;
    acceptDual?: boolean;
  }) {
    const res = await this.call({ type: 'enroll', ...input });
    this.bumpIdle();
    return res;
  }

  async unlock(passphrase: string) {
    const res = await this.call({ type: 'unlock', passphrase });
    this.bumpIdle();
    return res;
  }

  async lock() {
    return this.call({ type: 'lock' });
  }

  async wipe() {
    return this.call({ type: 'wipe' });
  }

  async signBroadcast(ops: unknown[], passphraseConfirm: string) {
    this.bumpIdle();
    return this.call({ type: 'signBroadcast', ops, passphraseConfirm });
  }

  async armUploadGesture(): Promise<string> {
    const token = crypto.randomUUID();
    await this.call({ type: 'armGesture', token });
    return token;
  }

  async signUploadChallenge(bytes: ArrayBuffer, gestureToken: string) {
    this.bumpIdle();
    return this.call({ type: 'signUploadChallenge', bytes, gestureToken });
  }
}

export const signingClient = new SigningClient();
