/** Private file storage. Phase 1: an encrypted local volume; every file is AES-256-GCM encrypted at rest. */
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Crypto } from '../lib/crypto';

export interface Storage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

export class EncryptedLocalStorage implements Storage {
  constructor(private dir: string, private crypto: Crypto) {}
  private path(key: string) {
    if (!/^[a-z0-9-]+$/.test(key)) throw new Error('bad storage key');
    return join(this.dir, key.slice(0, 2), key);
  }
  async put(key: string, data: Buffer) {
    const p = this.path(key);
    await mkdir(join(this.dir, key.slice(0, 2)), { recursive: true });
    await writeFile(p, this.crypto.encryptBytes(data), { mode: 0o600 });
  }
  async get(key: string) {
    return this.crypto.decryptBytes(await readFile(this.path(key)));
  }
  async remove(key: string) {
    await rm(this.path(key), { force: true });
  }
}

export class MemoryStorage implements Storage {
  private m = new Map<string, Buffer>();
  constructor(private crypto: Crypto) {}
  async put(key: string, data: Buffer) {
    this.m.set(key, this.crypto.encryptBytes(data));
  }
  async get(key: string) {
    const v = this.m.get(key);
    if (!v) throw new Error('not found');
    return this.crypto.decryptBytes(v);
  }
  async remove(key: string) {
    this.m.delete(key);
  }
}
