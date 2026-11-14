import express from 'express';
import rateLimit from 'express-rate-limit';
import { log } from './logger.js';
import { rateLimitKeyGenerator } from './security.js';
import { parseIntInRange as _parseIntInRange, parentAccessoryId, parentBridgeId, roomFor, withTimeout } from './utils.js';
import { isHomeKitPairing, mapReliabilityStats } from './setup-helpers.js';
import { deriveDeviceHealth } from './device-health.js';
import { CATEGORY_WINDOW_DAYS, resolveCategory } from './categories.js';
import { cached } from './query-cache.js';

const ACCESSORIES_RATE_LIMIT_WINDOW_MS = _parseIntInRange(
  process.env.ACCESSORIES_RATE_LIMIT_WINDOW_MS,
  60_000,
  1_000,
  24 * 60 * 60 * 1000
);
const ACCESSORIES_RATE_LIMIT_MAX = _parseIntInRange(
  process.env.ACCESSORIES_RATE_LIMIT_MAX,
  120,
  1,
  100_000
);

export function createAccessoriesRouter({
  pool,
  loadPairings,
  loadRooms,
  getRetentionSettings,
  getCategoryOverrides = () => ({}),
  getSubscriberStats,
  getAccessoryCapabilities,
  getAccessoryIdentity,
  getAllDiscoveredAccessories,
  cacheAccessoryMetadata,
  HttpClient,
  // Upper bound for a single live HAP round-trip made from this router. Mirrors
  // subscriber.js (HAP_REQUEST_TIMEOUT_MS, default 30s). hap-controller sets no
  // socket timeout of its own, so without this a bridge that accepts the TCP
  // connection but never answers — or an unreachable address that only fails
  // at the OS connect timeout (~130s on Linux) — would hang the request.
  hapRequestTimeoutMs = _parseIntInRange(process.env.HAP_REQUEST_TIMEOUT_MS, 30_000, 1_000, 300_000),
  // Minimum gap between on-demand metadata warm-up attempts for the same bridge.
  // The UI polls /accessories every 30s; without a cooldown an unreachable
  // bridge would be re-dialled on every poll.
  onDemandCooldownMs = 5 * 60_000,
}) {
  const router = express.Router();
  // bridgeId -> timestamp of the last on-demand warm-up attempt (per router instance).
  const onDemandAttempts = new Map();
  const accessoriesReadLimiter = rateLimit({
    windowMs: ACCESSORIES_RATE_LIMIT_WINDOW_MS,
    max: ACCESSORIES_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: rateLimitKeyGenerator,
    message: { error: 'Too many requests' },
  });

  function validateAccessoryId(req, res) {
    const id = String(req.params.accessoryId ?? '').trim();
    if (!id || id.length > 256) {
      res.status(400).json({ error: 'Invalid accessoryId' });
      return null;
    }
    return id;
  }

  router.get('/accessories/:accessoryId/capabilities', accessoriesReadLimiter, async (req, res) => {
    const accessoryId = validateAccessoryId(req, res);
    if (!accessoryId) return;
    const bridgeId = parentBridgeId(accessoryId);

    const capability = getAccessoryCapabilities(accessoryId);
    if (capability) return res.json(capability);

    const currentPairings = loadPairings();
    const pairing = currentPairings[bridgeId];
    if (!pairing) return res.status(404).json({ error: 'Accessory not found' });
    if (!isHomeKitPairing(pairing)) {
      return res.status(400).json({ error: 'Capabilities query currently supports HomeKit pairings only' });
    }

    try {
      const client = new HttpClient(bridgeId, pairing.address, pairing.port, pairing.longTermData);
      const accessories = await withTimeout(
        client.getAccessories(),
        hapRequestTimeoutMs,
        () => client.close?.(),
        `getAccessories(${pairing.name ?? bridgeId})`,
      );
      cacheAccessoryMetadata({
        deviceId: bridgeId,
        pairingName: pairing.name,
        accessories,
      });

      const refreshed = getAccessoryCapabilities(accessoryId);
      if (!refreshed) return res.status(404).json({ error: 'Accessory metadata unavailable' });
      return res.json(refreshed);
    } catch (err) {
      log.error('[api] /api/accessories/:accessoryId/capabilities error:', err.message ?? err.stack ?? err);
      return res.status(500).json({ error: 'Could not query accessory capabilities' });
    }
  });

  router.get('/accessories', accessoriesReadLimiter, async (_req, res) => {
    try {
      const retentionSettings = getRetentionSettings();
      const result = await pool.query(`
        WITH latest AS (
          SELECT DISTINCT ON (accessory_id, service_type)
            accessory_id,
            accessory_name,
            room_name,
            service_type,
            protocol,
            timestamp AS last_seen
          FROM event_logs
          ORDER BY accessory_id, service_type, timestamp DESC, id DESC
        ),
        counts AS (
          SELECT accessory_id, service_type, COUNT(*)::int AS event_count
          FROM event_logs
          GROUP BY accessory_id, service_type
        )
        SELECT
          latest.accessory_id,
          latest.accessory_name,
          latest.room_name,
          latest.service_type,
          latest.protocol,
          latest.last_seen,
          counts.event_count
        FROM latest
        JOIN counts USING (accessory_id, service_type)
        ORDER BY latest.last_seen DESC
      `);
      const heartbeatResult = await cached('accessories:heartbeat', () => pool.query(`
        WITH recent AS (
          SELECT accessory_id, timestamp
          FROM (
            SELECT
              accessory_id,
              timestamp,
              ROW_NUMBER() OVER (
                PARTITION BY accessory_id
                ORDER BY timestamp DESC, id DESC
              ) AS row_num
            FROM event_logs
            WHERE timestamp >= NOW() - INTERVAL '30 days'
          ) ranked
          WHERE row_num <= 200
        ),
        deltas AS (
          SELECT
            accessory_id,
            EXTRACT(EPOCH FROM (
              timestamp - LAG(timestamp) OVER (
                PARTITION BY accessory_id
                ORDER BY timestamp ASC
              )
            ))::float AS gap_seconds
          FROM recent
        )
        SELECT
          accessory_id,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_seconds) AS heartbeat_seconds,
          COUNT(*) FILTER (WHERE gap_seconds IS NOT NULL)::int AS heartbeat_samples
        FROM deltas
        WHERE gap_seconds IS NOT NULL AND gap_seconds > 0
        GROUP BY accessory_id
      `), 60_000);

      const rooms = loadRooms();
      const currentPairings = loadPairings();
      const now = Date.now();
      const heartbeatById = Object.fromEntries(
        heartbeatResult.rows.map((row) => [row.accessory_id, row])
      );

      const dbRows = result.rows.map((r) => {
        const protocol = String(r.protocol ?? 'homekit').toLowerCase();
        const bridgeId = protocol === 'homekit' ? parentBridgeId(r.accessory_id) : r.accessory_id;
        const matterNodeId = protocol === 'matter'
          ? String(r.accessory_id).split(':')[0]
          : null;
        const bridgePairing = currentPairings[bridgeId]
          ?? currentPairings[r.accessory_id]
          ?? (matterNodeId ? currentPairings[matterNodeId] : null);
        const heartbeat = heartbeatById[r.accessory_id] ?? {};
        const identity = getAccessoryIdentity(r.accessory_id)
          ?? getAccessoryIdentity(bridgeId);
        const reliability = getSubscriberStats(bridgeId);
        const health = deriveDeviceHealth({
          lastSeen: r.last_seen,
          pairedAt: bridgePairing?.pairedAt ?? null,
          heartbeatSeconds: heartbeat.heartbeat_seconds ?? null,
          heartbeatSamples: heartbeat.heartbeat_samples ?? 0,
          staleThresholdSeconds: retentionSettings.staleThresholdHours * 60 * 60,
          subscriberConnectedAt: reliability?.lastConnectedAt ?? null,
          subscriberLastHealthyAt: reliability?.lastHealthyAt ?? null,
          subscriberConnected: reliability?.connected ?? false,
          now,
        });
        return {
          ...r,
          protocol,
          category: bridgePairing?.category ?? null,
          bridge_name: getAccessoryCapabilities(bridgeId)?.accessory_name ?? bridgePairing?.name ?? null,
          room_name: (protocol === 'homekit' ? roomFor(rooms, r.accessory_id) : rooms[r.accessory_id]) ?? r.room_name,
          address: bridgePairing?.address ?? null,
          paired_at: bridgePairing?.pairedAt ?? null,
          manufacturer: identity?.manufacturer ?? null,
          model: identity?.model ?? null,
          serial_number: identity?.serial_number ?? null,
          firmware_revision: identity?.firmware_revision ?? null,
          hardware_revision: identity?.hardware_revision ?? null,
          metadata_updated_at: identity?.metadata_updated_at ?? null,
          reliability: mapReliabilityStats(reliability),
          health,
        };
      });

      const seenIds = new Set(dbRows.map((r) => r.accessory_id));

      const neverSeen = Object.entries(currentPairings)
        .filter(([id, p]) => {
          if (seenIds.has(id)) return false;
          // For Matter nodes, also exclude if any endpoint (nodeId:N) has been seen
          if (String(p.protocol ?? '').toLowerCase() === 'matter') {
            for (const seen of seenIds) {
              if (seen.startsWith(`${id}:`)) return false;
            }
          }
          return true;
        })
        .map(([id, p]) => {
          const identity = getAccessoryIdentity(id);
          const reliability = getSubscriberStats(id);
          return {
            accessory_id: id,
            accessory_name: p.name,
            protocol: p.protocol ?? 'homekit',
            room_name: roomFor(rooms, id) ?? null,
            service_type: null,
            category: p.category ?? null,
            bridge_name: getAccessoryCapabilities(id)?.accessory_name ?? p.name ?? null,
            last_seen: null,
            event_count: 0,
            address: p.address ?? null,
            paired_at: p.pairedAt ?? null,
            manufacturer: identity?.manufacturer ?? null,
            model: identity?.model ?? null,
            serial_number: identity?.serial_number ?? null,
            firmware_revision: identity?.firmware_revision ?? null,
            hardware_revision: identity?.hardware_revision ?? null,
            metadata_updated_at: identity?.metadata_updated_at ?? null,
            reliability: mapReliabilityStats(reliability),
            health: deriveDeviceHealth({
              lastSeen: null,
              pairedAt: p.pairedAt ?? null,
              staleThresholdSeconds: retentionSettings.staleThresholdHours * 60 * 60,
              subscriberConnectedAt: reliability?.lastConnectedAt ?? null,
              subscriberLastHealthyAt: reliability?.lastHealthyAt ?? null,
              subscriberConnected: reliability?.connected ?? false,
              now,
            }),
          };
        });

      // On-demand: populate metadata cache for HomeKit bridges that have no cached children.
      // This handles the case where the subscriber hasn't connected yet or the cache was
      // cleared during a reconnect cycle.
      //
      // This is a background WARM-UP, not part of the response: the fetch is started
      // (bounded by hapRequestTimeoutMs, closing the client on expiry) and the response is
      // sent with whatever is cached right now — the next poll picks up the result. It used
      // to be awaited, which meant one unreachable bridge (stale address after a network
      // move, powered-off hub) held every /accessories response for the OS connect timeout
      // (~130s) — far past nginx's 30s proxy timeout — so the Devices page never rendered.
      // A per-bridge cooldown stops the 30s UI poll from re-dialling a dead bridge forever.
      const discoveredBefore = getAllDiscoveredAccessories();
      const cachedBridgeIds = new Set(discoveredBefore.map((d) => d.parent_device_id));
      const bridgesToFetch = Object.entries(currentPairings)
        .filter(([id, p]) => p.category === 2 && !cachedBridgeIds.has(id) && isHomeKitPairing(p))
        .filter(([id]) => {
          const last = onDemandAttempts.get(id) ?? 0;
          return now - last >= onDemandCooldownMs;
        });
      for (const [id, p] of bridgesToFetch) {
        onDemandAttempts.set(id, now);
        const client = new HttpClient(id, p.address, p.port, p.longTermData);
        withTimeout(
          client.getAccessories(),
          hapRequestTimeoutMs,
          () => client.close?.(),
          `on-demand getAccessories(${p.name ?? id})`,
        )
          .then((accessories) => {
            cacheAccessoryMetadata({ deviceId: id, pairingName: p.name, accessories });
          })
          .catch((err) => {
            log.debug(`[api] on-demand metadata fetch failed for ${p.name ?? id}: ${err.message}`);
          });
      }

      // Include bridge children discovered via getAccessories() that have
      // no events yet and aren't in pairings (only the bridge itself is paired).
      const allIds = new Set([...seenIds, ...neverSeen.map((r) => r.accessory_id)]);
      const discovered = getAllDiscoveredAccessories()
        .filter((d) => !allIds.has(d.accessory_id))
        .map((d) => {
          const bridgeId = parentBridgeId(d.accessory_id);
          const bridgePairing = currentPairings[bridgeId] ?? currentPairings[d.accessory_id] ?? null;
          const identity = getAccessoryIdentity(d.accessory_id) ?? getAccessoryIdentity(bridgeId);
          const reliability = getSubscriberStats(bridgeId);
          const serviceType = d.watched_service_types?.[0]
            ?? d.services?.find((s) => s.label !== 'AccessoryInformation' && s.label !== '3E')?.label
            ?? null;
          return {
            accessory_id: d.accessory_id,
            accessory_name: d.accessory_name
              ? (serviceType ? `${d.accessory_name} · ${serviceType}` : d.accessory_name)
              : d.accessory_id,
            protocol: bridgePairing?.protocol ?? 'homekit',
            room_name: roomFor(rooms, d.accessory_id) ?? null,
            service_type: serviceType,
            category: bridgePairing?.category ?? null,
            bridge_name: getAccessoryCapabilities(bridgeId)?.accessory_name ?? bridgePairing?.name ?? null,
            last_seen: null,
            event_count: 0,
            address: bridgePairing?.address ?? null,
            paired_at: bridgePairing?.pairedAt ?? null,
            manufacturer: identity?.manufacturer ?? null,
            model: identity?.model ?? null,
            serial_number: identity?.serial_number ?? null,
            firmware_revision: identity?.firmware_revision ?? null,
            hardware_revision: identity?.hardware_revision ?? null,
            metadata_updated_at: identity?.metadata_updated_at ?? null,
            reliability: mapReliabilityStats(reliability),
            health: deriveDeviceHealth({
              lastSeen: null,
              pairedAt: bridgePairing?.pairedAt ?? null,
              staleThresholdSeconds: retentionSettings.staleThresholdHours * 60 * 60,
              subscriberConnectedAt: reliability?.lastConnectedAt ?? null,
              subscriberLastHealthyAt: reliability?.lastHealthyAt ?? null,
              subscriberConnected: reliability?.connected ?? false,
              now,
            }),
          };
        });

      // An accessory logged per service (a multi-outlet plug) keeps only its
      // firmware-change events under its own id: those are history, not a
      // device of its own next to its outlets, so they are not listed.
      const splitParents = new Set(dbRows.map((r) => parentAccessoryId(r.accessory_id)).filter(Boolean));
      const listedRows = dbRows.filter((r) => !(
        r.service_type === 'AccessoryInformation' && splitParents.has(r.accessory_id)
      ));

      res.json([...listedRows, ...neverSeen, ...discovered]);
    } catch (err) {
      log.error('[api] /api/accessories error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/accessories/:accessoryId/detail', accessoriesReadLimiter, async (req, res) => {
    const accessoryId = validateAccessoryId(req, res);
    if (!accessoryId) return;

    const days = _parseIntInRange(req.query.days, 30, 7, 365);
    const page = _parseIntInRange(req.query.page, 1, 1, 1_000_000);
    const limit = _parseIntInRange(req.query.limit, 100, 1, 500);
    const offset = (page - 1) * limit;

    try {
      const retentionSettings = getRetentionSettings();
      const rooms = loadRooms();
      const currentPairings = loadPairings();
      const now = Date.now();

      const summaryResult = await pool.query(
        `SELECT
           COUNT(*)::int AS event_count,
           MIN(timestamp) AS first_seen,
           MAX(timestamp) AS last_seen
         FROM event_logs
         WHERE accessory_id = $1`,
        [accessoryId]
      );
      const summary = summaryResult.rows[0] ?? {};
      const eventCount = Number.parseInt(summary.event_count ?? '0', 10);

      const latestResult = await pool.query(
        `SELECT accessory_name, room_name, service_type, protocol
         FROM event_logs
         WHERE accessory_id = $1
         ORDER BY timestamp DESC, id DESC
         LIMIT 1`,
        [accessoryId]
      );
      const latest = latestResult.rows[0] ?? {};

      // Category comes from every service type the device has reported (the latest
      // event alone may be a battery or firmware reading), over the same fixed window
      // the Device Categories panel uses by default — not this page's `days`, or the
      // two could show different automatic categories for one device.
      const serviceTypesResult = await pool.query(
        `SELECT DISTINCT service_type
         FROM event_logs
         WHERE accessory_id = $1 AND timestamp >= NOW() - ($2::int * INTERVAL '1 day')`,
        [accessoryId, CATEGORY_WINDOW_DAYS]
      );
      const serviceTypes = new Set(serviceTypesResult.rows.map((r) => r.service_type));
      if (latest.service_type) serviceTypes.add(latest.service_type);
      const category = resolveCategory(accessoryId, serviceTypes, getCategoryOverrides());

      const pairingProtocol = String(currentPairings[accessoryId]?.protocol ?? '').toLowerCase();
      const protocol = String((latest.protocol ?? pairingProtocol) || 'homekit').toLowerCase();
      const bridgeId = protocol === 'homekit' ? parentBridgeId(accessoryId) : accessoryId;
      const matterNodeId = protocol === 'matter'
        ? String(accessoryId).split(':')[0]
        : null;
      const bridgePairing = currentPairings[bridgeId]
        ?? currentPairings[accessoryId]
        ?? (matterNodeId ? currentPairings[matterNodeId] : null);
      const identity = getAccessoryIdentity(accessoryId) ?? getAccessoryIdentity(bridgeId);
      const reliability = getSubscriberStats(bridgeId);

      const heartbeatResult = await pool.query(
        `WITH recent AS (
           SELECT timestamp
           FROM event_logs
           WHERE accessory_id = $1
           ORDER BY timestamp DESC, id DESC
           LIMIT 200
         ),
         deltas AS (
           SELECT EXTRACT(EPOCH FROM (
             timestamp - LAG(timestamp) OVER (ORDER BY timestamp ASC)
           ))::float AS gap_seconds
           FROM recent
         )
         SELECT
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_seconds) AS heartbeat_seconds,
           COUNT(*) FILTER (WHERE gap_seconds IS NOT NULL)::int AS heartbeat_samples
         FROM deltas
         WHERE gap_seconds IS NOT NULL AND gap_seconds > 0`,
        [accessoryId]
      );
      const heartbeat = heartbeatResult.rows[0] ?? {};

      const health = deriveDeviceHealth({
        lastSeen: summary.last_seen ?? null,
        pairedAt: bridgePairing?.pairedAt ?? null,
        heartbeatSeconds: heartbeat.heartbeat_seconds ?? null,
        heartbeatSamples: heartbeat.heartbeat_samples ?? 0,
        staleThresholdSeconds: retentionSettings.staleThresholdHours * 60 * 60,
        subscriberConnectedAt: reliability?.lastConnectedAt ?? null,
        subscriberLastHealthyAt: reliability?.lastHealthyAt ?? null,
        subscriberConnected: reliability?.connected ?? false,
        now,
      });

      const stateResult = await pool.query(
        `SELECT DISTINCT ON (characteristic)
           characteristic,
           new_value,
           old_value,
           service_type,
           timestamp
         FROM event_logs
         WHERE accessory_id = $1
         ORDER BY characteristic, timestamp DESC, id DESC`,
        [accessoryId]
      );

      const historyResult = await pool.query(
        `SELECT
           id, timestamp, accessory_id, accessory_name, room_name, service_type,
           characteristic, old_value, new_value, protocol, transport,
           endpoint_id, cluster_id, attribute_id, raw_iid
         FROM event_logs
         WHERE accessory_id = $1
         ORDER BY timestamp DESC, id DESC
         LIMIT $2 OFFSET $3`,
        [accessoryId, limit, offset]
      );

      const activityResult = await pool.query(
        `SELECT DATE(timestamp AT TIME ZONE 'UTC') AS day, COUNT(*)::int AS count
         FROM event_logs
         WHERE accessory_id = $1
           AND timestamp >= NOW() - ($2::int * INTERVAL '1 day')
         GROUP BY day
         ORDER BY day`,
        [accessoryId, days]
      );

      const distinctActiveDaysResult = await pool.query(
        `SELECT COUNT(DISTINCT DATE(timestamp AT TIME ZONE 'UTC'))::int AS active_days
         FROM event_logs
         WHERE accessory_id = $1`,
        [accessoryId]
      );
      const activeDays = Number.parseInt(distinctActiveDaysResult.rows[0]?.active_days ?? '0', 10);
      const firstSeenTs = summary.first_seen ? new Date(summary.first_seen).getTime() : null;
      const observedDays = firstSeenTs
        ? Math.max(1, Math.ceil((now - firstSeenTs) / (24 * 60 * 60 * 1000)))
        : 0;

      const accessory = {
        accessory_id: accessoryId,
        accessory_name: latest.accessory_name ?? bridgePairing?.name ?? accessoryId,
        room_name: (protocol === 'homekit' ? roomFor(rooms, accessoryId) : rooms[accessoryId]) ?? latest.room_name ?? null,
        service_type: latest.service_type ?? null,
        category: category.category,
        category_auto: category.auto,
        category_override: category.override,
        protocol,
        first_seen: summary.first_seen ?? null,
        last_seen: summary.last_seen ?? null,
        event_count: eventCount,
        address: bridgePairing?.address ?? null,
        // Every address the accessory announces (e.g. a Homebridge container on
        // a Docker bridge and a macvlan); `address` is the one in use.
        addresses: Array.isArray(bridgePairing?.addresses) ? bridgePairing.addresses : [],
        paired_at: bridgePairing?.pairedAt ?? null,
        manufacturer: identity?.manufacturer ?? null,
        model: identity?.model ?? null,
        serial_number: identity?.serial_number ?? null,
        firmware_revision: identity?.firmware_revision ?? null,
        hardware_revision: identity?.hardware_revision ?? null,
        metadata_updated_at: identity?.metadata_updated_at ?? null,
        reliability: mapReliabilityStats(reliability),
        health,
      };

      res.json({
        accessory,
        uptime: {
          active_days: activeDays,
          observed_days: observedDays,
          active_day_ratio: observedDays > 0 ? activeDays / observedDays : null,
          events_per_active_day: activeDays > 0 ? eventCount / activeDays : null,
        },
        current_state: stateResult.rows,
        activity: {
          days,
          daily: activityResult.rows,
        },
        history: {
          total: eventCount,
          page,
          limit,
          pages: Math.ceil(eventCount / limit),
          events: historyResult.rows.map((row) => ({
            ...row,
            room_name: (protocol === 'homekit' ? roomFor(rooms, row.accessory_id) : rooms[row.accessory_id]) ?? row.room_name,
          })),
        },
      });
    } catch (err) {
      log.error('[api] /api/accessories/:accessoryId/detail error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/accessories/:accessoryId/characteristics/:characteristic/trend', accessoriesReadLimiter, async (req, res) => {
    const accessoryId = validateAccessoryId(req, res);
    if (!accessoryId) return;
    const characteristic = String(req.params.characteristic ?? '').trim();
    const days = _parseIntInRange(req.query.days, 30, 1, 365);
    if (!characteristic) {
      return res.status(400).json({ error: 'characteristic is required' });
    }
    try {
      const result = await pool.query(
        `SELECT timestamp, new_value
         FROM event_logs
         WHERE accessory_id = $1
           AND characteristic = $2
           AND timestamp >= NOW() - ($3::int * INTERVAL '1 day')
         ORDER BY timestamp ASC
         LIMIT 2000`,
        [accessoryId, characteristic, days]
      );
      res.json({ points: result.rows });
    } catch (err) {
      log.error('[api] /api/accessories/:accessoryId/characteristics/:characteristic/trend error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // Accessory heatmap: event counts by day-of-week × hour-of-day
  // ---------------------------------------------------------------------------
  router.get('/accessories/:accessoryId/heatmap', accessoriesReadLimiter, async (req, res) => {
    const accessoryId = validateAccessoryId(req, res);
    if (!accessoryId) return;
    const days = _parseIntInRange(req.query.days, 90, 7, 365);
    try {
      const result = await pool.query(
        `SELECT
           EXTRACT(DOW FROM timestamp AT TIME ZONE 'UTC')::int AS dow,
           EXTRACT(HOUR FROM timestamp AT TIME ZONE 'UTC')::int AS hour,
           COUNT(*)::int AS count
         FROM event_logs
         WHERE accessory_id = $1
           AND timestamp >= NOW() - ($2::int * INTERVAL '1 day')
         GROUP BY dow, hour
         ORDER BY dow, hour`,
        [accessoryId, days]
      );
      res.json({ days, cells: result.rows });
    } catch (err) {
      log.error('[api] /api/accessories/:accessoryId/heatmap error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // Accessory state duration: time spent in each state per characteristic
  // ---------------------------------------------------------------------------
  router.get('/accessories/:accessoryId/state-duration', accessoriesReadLimiter, async (req, res) => {
    const accessoryId = validateAccessoryId(req, res);
    if (!accessoryId) return;
    const days = _parseIntInRange(req.query.days, 30, 1, 365);
    try {
      const result = await pool.query(
        `WITH ordered AS (
           SELECT characteristic, new_value, timestamp,
             LEAD(timestamp) OVER (PARTITION BY characteristic ORDER BY timestamp) AS next_ts
           FROM event_logs
           WHERE accessory_id = $1
             AND timestamp >= NOW() - ($2::int * INTERVAL '1 day')
         )
         SELECT characteristic, new_value,
           SUM(EXTRACT(EPOCH FROM (COALESCE(next_ts, NOW()) - timestamp)))::float AS duration_seconds
         FROM ordered
         GROUP BY characteristic, new_value
         ORDER BY characteristic, duration_seconds DESC`,
        [accessoryId, days]
      );
      res.json({ days, durations: result.rows });
    } catch (err) {
      log.error('[api] /api/accessories/:accessoryId/state-duration error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // Accessory characteristic summary: min/max/avg/count per characteristic
  // ---------------------------------------------------------------------------
  router.get('/accessories/:accessoryId/char-summary', accessoriesReadLimiter, async (req, res) => {
    const accessoryId = validateAccessoryId(req, res);
    if (!accessoryId) return;
    const days = _parseIntInRange(req.query.days, 30, 1, 365);
    try {
      const result = await pool.query(
        `SELECT characteristic,
           COUNT(*)::int AS change_count,
           MIN(CASE WHEN new_value ~ '^-?[0-9]+\\.?[0-9]*$' THEN new_value::float END) AS min_val,
           MAX(CASE WHEN new_value ~ '^-?[0-9]+\\.?[0-9]*$' THEN new_value::float END) AS max_val,
           AVG(CASE WHEN new_value ~ '^-?[0-9]+\\.?[0-9]*$' THEN new_value::float END) AS avg_val,
           COUNT(CASE WHEN new_value ~ '^-?[0-9]+\\.?[0-9]*$' THEN 1 END)::int AS numeric_count,
           COUNT(DISTINCT new_value)::int AS distinct_values
         FROM event_logs
         WHERE accessory_id = $1
           AND timestamp >= NOW() - ($2::int * INTERVAL '1 day')
         GROUP BY characteristic
         ORDER BY change_count DESC`,
        [accessoryId, days]
      );
      res.json({ days, characteristics: result.rows });
    } catch (err) {
      log.error('[api] /api/accessories/:accessoryId/char-summary error:', err.message ?? err.stack ?? err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
