import { chmod, mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'fs/promises';
import { basename, dirname, join } from 'path';
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
    await this._sweepStaleTemps();
    await this.refresh();
  }

  /**
   * M-6: remove stale `<basename>.tmp-*` siblings left behind by an
   * interrupted _doWrite() (e.g. a SIGKILL between writeFile(tmp) and
   * rename()). Safe because the `.tmp-` prefix can only match temp files
   * this class wrote itself (see _doWrite's `${this.filePath}.tmp-${pid}-${ts}`
   * naming), and init() runs once at boot in a single-instance deployment.
   */
  async _sweepStaleTemps() {
    try {
      const dir = dirname(this.filePath);
      const prefix = `${basename(this.filePath)}.tmp-`;
      const entries = await readdir(dir);
      for (const entry of entries) {
        if (!entry.startsWith(prefix)) continue;
        try {
          await unlink(join(dir, entry));
          log.info(`[store] Removed stale temp file: ${entry}`);
        } catch (err) {
          // One bad unlink (e.g. EACCES) must not abort the rest of the sweep.
          log.debug(`[store] Failed to remove stale temp file ${entry}:`, err.message);
        }
      }
    } catch (err) {
      // A missing directory on first boot is normal and must not throw.
      log.debug('[store] Stale temp sweep skipped:', err.message);
    }
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
      const meta = await stat(this.filePath);
      // Skip if file hasn't changed since our last write/read — prevents
      // overwriting in-flight writes with stale data (CR-01).
      if (meta.mtimeMs <= this.lastMtimeMs) return this.getSnapshot();
      const raw = await readFile(this.filePath, 'utf8');
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
      // Don't reset cache on read error if we already have valid data
      if (this.lastMtimeMs === 0) {
        this.cache = clone(this.defaultValue);
      }
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
