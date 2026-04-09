import express from 'express';
import { log } from './logger.js';

export function createHealthRouter({
  pool,
  getSubscriberHealth,
  getMatterRuntime,
  loadPairings,
  alertsEnabled,
}) {
  const router = express.Router();

  router.get('/health', async (_req, res) => {
    // Verify DB connectivity with a lightweight query
    let dbOk = false;
    try {
      await pool.query('SELECT 1');
      dbOk = true;
    } catch (err) {
      log.debug('[health] DB connectivity check failed:', err.message);
    }

    const subscribers = getSubscriberHealth();
    const matterRuntime = getMatterRuntime();
    const runtimeStatus = matterRuntime?.getStatus?.() ?? null;

    // Grace period: tolerate transient HAP disconnects for up to 2 minutes
    // before reporting unhealthy (reconnects typically complete in seconds).
    const disconnectGraceMs = 2 * 60_000;
    let subscribersOk = subscribers.total === 0 || subscribers.connected > 0;
    if (!subscribersOk && subscribers.lastConnectedAt) {
      const elapsed = Date.now() - new Date(subscribers.lastConnectedAt).getTime();
      subscribersOk = elapsed < disconnectGraceMs;
    }
    const healthy = dbOk && subscribersOk;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'unhealthy',
      db: dbOk ? 'ok' : 'unreachable',
      subscribers,
      paired: Object.keys(loadPairings()).length,
      alertsEnabled: alertsEnabled(),
      matter: runtimeStatus ? {
        commissionConfigured: runtimeStatus.commissionConfigured,
        pollingConfigured: runtimeStatus.pollingConfigured,
        activeNodes: runtimeStatus.nodes?.length ?? 0,
      } : null,
    });
  });

  return router;
}
