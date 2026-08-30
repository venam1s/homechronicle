/**
 * shutdown.js — graceful SIGTERM/SIGINT shutdown (M-6).
 *
 * Exports:
 *   SHUTDOWN_DEADLINE_MS
 *   createGracefulShutdown({ steps, deadlineMs, exit }) → { shutdown, isShuttingDown }
 */

import { log } from './logger.js';

export const SHUTDOWN_DEADLINE_MS = 8_000;

/**
 * Create a fault-tolerant, deadline-bounded graceful shutdown sequence.
 *
 * `docker stop` sends SIGTERM and gives the process ~10s (Docker's default
 * grace period) before SIGKILL. Without a handler, the process is killed
 * abruptly on every redeploy — leaking `.tmp-*` config files (T-1qh-05) and
 * dead HAP controller sessions on accessories (T-1qh-06). This runs a fixed
 * sequence of steps (closing the HTTP server, stopping schedulers/sessions,
 * draining the DB pool) and always exits 0 — `restart: unless-stopped` must
 * not mistake a clean `docker stop` for a crash.
 *
 * @param {object} opts
 * @param {Array<{ name: string, run: function(): (void|Promise<void>) }>} [opts.steps]
 *   ordered shutdown steps; each runs inside its own try/catch so one bad
 *   step never aborts the rest
 * @param {number} [opts.deadlineMs=SHUTDOWN_DEADLINE_MS] - hard deadline; if
 *   steps are still running when this fires, exit(0) is called anyway
 * @param {function(number): void} [opts.exit] - injectable for testing;
 *   defaults to process.exit
 * @returns {{ shutdown: function(string): Promise<void>, isShuttingDown: function(): boolean }}
 */
export function createGracefulShutdown({
  steps = [],
  deadlineMs = SHUTDOWN_DEADLINE_MS,
  exit = (code) => process.exit(code),
} = {}) {
  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) {
      log.warn(`[shutdown] Received ${signal} while already shutting down, ignoring`);
      return;
    }
    shuttingDown = true;

    log.info(`[shutdown] Received ${signal}, shutting down…`);

    let currentStepName = null;
    const hardTimer = setTimeout(() => {
      log.warn(`[shutdown] Deadline (${deadlineMs}ms) exceeded while running step "${currentStepName}", forcing exit`);
      exit(0);
    }, deadlineMs);
    hardTimer.unref?.();

    for (const step of steps) {
      currentStepName = step.name;
      try {
        await step.run();
      } catch (err) {
        log.warn(`[shutdown] Step "${step.name}" failed:`, err?.message ?? err);
      }
    }

    clearTimeout(hardTimer);
    log.info('[shutdown] Clean shutdown complete');
    exit(0);
  }

  return {
    shutdown,
    isShuttingDown: () => shuttingDown,
  };
}
