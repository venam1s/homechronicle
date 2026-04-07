import { chmod, mkdir, readFile, rename, stat, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { log } from './logger.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class JsonObjectStore {
  constructor(filePath, defaultValue = {}) {
    this.filePath = filePath;
    this.defaultValue = clone(defaultValue);
    this.cache = clone(defaultValue);
    this.lastMtimeMs = 0;
    this._writeLock = Promise.resolve();
  }

  async init() {
    await this.refresh();
  }

  getSnapshot() {
    return clone(this.cache);
  }

  getByKey(key) {
    const val = this.cache[key];
    return val !== undefined ? clone(val) : undefined;
  }

  async refresh() {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const meta = await stat(this.filePath);
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        this.cache = parsed;
      } else {
        this.cache = clone(this.defaultValue);
      }
      this.lastMtimeMs = meta.mtimeMs;
      return this.getSnapshot();
    } catch (err) {
      log.debug('[store] read error, using default:', err.message);
      this.cache = clone(this.defaultValue);
      this.lastMtimeMs = 0;
      return this.getSnapshot();
    }
  }

  async modify(fn) {
    return this.write(fn(this.getSnapshot()));
  }

  async write(nextValue) {
    // Serialize writes to prevent concurrent read-modify-write races.
    const prev = this._writeLock;
    let releaseLock;
    this._writeLock = new Promise((resolve) => { releaseLock = resolve; });

    try {
      await prev;
      return await this._doWrite(nextValue);
    } catch (err) {
      log.error('[store] write failed:', err.message);
      throw err;
    } finally {
      releaseLock();
    }
  }

  async _doWrite(nextValue) {
    const normalized = (nextValue && typeof nextValue === 'object' && !Array.isArray(nextValue))
      ? nextValue
      : clone(this.defaultValue);

    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    const serialized = JSON.stringify(normalized, null, 2);

    await writeFile(tempPath, serialized, { encoding: 'utf8', mode: 0o600 });
    await rename(tempPath, this.filePath);
    try {
      await chmod(this.filePath, 0o600);
    } catch (err) {
      log.debug('[store] chmod skipped (filesystem may not support POSIX permissions):', err.message);
    }

    try {
      const meta = await stat(this.filePath);
      this.lastMtimeMs = meta.mtimeMs;
    } catch (err) {
      log.debug('[store] stat after write failed, using Date.now():', err.message);
      this.lastMtimeMs = Date.now();
    }

    this.cache = clone(normalized);
    return this.getSnapshot();
  }
}
