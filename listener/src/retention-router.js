import { Router } from 'express';
import { log } from './logger.js';

const RETENTION_DAYS_DEFAULT = Number.parseInt(process.env.RETENTION_DAYS ?? '365', 10);
const RETENTION_ARCHIVE_DEFAULT = /^(1|true|yes|on)$/i.test(process.env.RETENTION_ARCHIVE ?? 'true');
const STALE_THRESHOLD_HOURS_DEFAULT = Number.parseInt(process.env.STALE_THRESHOLD_HOURS ?? '12', 10);
const DISCOVERY_SCAN_ENABLED = !/^(0|false|no|off)$/i.test(process.env.DISCOVERY_SCAN_ENABLED ?? 'true');

export function normalizeRetentionSettings(input = {}) {
  const days = Number.parseInt(String(input.retentionDays ?? ''), 10);
  const retentionDays = Number.isFinite(days) && days >= 1 && days <= 3650
    ? days
    : RETENTION_DAYS_DEFAULT;
  const staleHours = Number.parseInt(String(input.staleThresholdHours ?? ''), 10);
  const staleThresholdHours = Number.isFinite(staleHours) && staleHours >= 1 && staleHours <= 720
    ? staleHours
    : STALE_THRESHOLD_HOURS_DEFAULT;
  const archiveBeforeDelete = input.archiveBeforeDelete === undefined
    ? RETENTION_ARCHIVE_DEFAULT
    : Boolean(input.archiveBeforeDelete);
  const autoScanHomeKit = input.autoScanHomeKit === undefined
    ? DISCOVERY_SCAN_ENABLED
    : Boolean(input.autoScanHomeKit);
  const quietHoursEnabled = Boolean(input.quietHoursEnabled ?? false);
  const qhStart = Number.parseInt(String(input.quietHoursStart ?? ''), 10);
  const quietHoursStart = Number.isFinite(qhStart) && qhStart >= 0 && qhStart <= 23 ? qhStart : 23;
  const qhEnd = Number.parseInt(String(input.quietHoursEnd ?? ''), 10);
  const quietHoursEnd = Number.isFinite(qhEnd) && qhEnd >= 0 && qhEnd <= 23 ? qhEnd : 6;
  const ewm = Number.parseInt(String(input.episodeWindowMinutes ?? ''), 10);
  const episodeWindowMinutes = Number.isFinite(ewm) && ewm >= 1 && ewm <= 30 ? ewm : 3;
  const sws = Number.parseInt(String(input.sceneWindowSeconds ?? ''), 10);
  const sceneWindowSeconds = Number.isFinite(sws) && sws >= 1 && sws <= 30 ? sws : 5;
  const emc = Number.parseInt(String(input.episodeMinEventCount ?? ''), 10);
  const episodeMinEventCount = Number.isFinite(emc) && emc >= 1 && emc <= 20 ? emc : 3;
  const quietHoursExcludedAccessories = Array.isArray(input.quietHoursExcludedAccessories)
    ? input.quietHoursExcludedAccessories.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim())
    : [];
  const toastsEnabled = input.toastsEnabled === undefined ? true : Boolean(input.toastsEnabled);
  const liveEventToastsEnabled = Boolean(input.liveEventToastsEnabled ?? false);
  const toastAccessories = Array.isArray(input.toastAccessories)
    ? input.toastAccessories.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim())
    : [];
  const VALID_POSITIONS = ['bottom-right', 'top-right', 'bottom-left', 'top-left'];
  const VALID_DURATIONS = [2, 3, 5, 7];
  const VALID_MAX_VISIBLE = [1, 2, 3, 5];
  const toastPosition = VALID_POSITIONS.includes(input.toastPosition) ? input.toastPosition : 'bottom-right';
  const toastDuration = VALID_DURATIONS.includes(Number(input.toastDuration)) ? Number(input.toastDuration) : 3;
  const toastMaxVisible = VALID_MAX_VISIBLE.includes(Number(input.toastMaxVisible)) ? Number(input.toastMaxVisible) : 3;
  return { retentionDays, archiveBeforeDelete, staleThresholdHours, autoScanHomeKit, quietHoursEnabled, quietHoursStart, quietHoursEnd, quietHoursExcludedAccessories, episodeWindowMinutes, sceneWindowSeconds, episodeMinEventCount, toastsEnabled, liveEventToastsEnabled, toastAccessories, toastPosition, toastDuration, toastMaxVisible };
}

function settingsToJson(settings, sweepMs) {
  return {
    retentionDays: settings.retentionDays,
    archiveBeforeDelete: settings.archiveBeforeDelete,
    staleThresholdHours: settings.staleThresholdHours,
    autoScanHomeKit: settings.autoScanHomeKit,
    quietHoursEnabled: settings.quietHoursEnabled,
    quietHoursStart: settings.quietHoursStart,
    quietHoursEnd: settings.quietHoursEnd,
    quietHoursExcludedAccessories: settings.quietHoursExcludedAccessories,
    episodeWindowMinutes: settings.episodeWindowMinutes,
    sceneWindowSeconds: settings.sceneWindowSeconds,
    episodeMinEventCount: settings.episodeMinEventCount,
    toastsEnabled: settings.toastsEnabled,
    liveEventToastsEnabled: settings.liveEventToastsEnabled,
    toastAccessories: settings.toastAccessories,
    toastPosition: settings.toastPosition,
    toastDuration: settings.toastDuration,
    toastMaxVisible: settings.toastMaxVisible,
    sweepMs,
  };
}

export function createRetentionRouter({ getSettings, saveSettings, sweepMs = 0 }) {
  const router = Router();

  router.get('/retention', (_req, res) => {
    res.json(settingsToJson(getSettings(), sweepMs));
  });

  router.patch('/retention', async (req, res) => {
    const body = req.body ?? {};
    const updates = {};

    if (body.retentionDays !== undefined) {
      const nextDays = Number.parseInt(String(body.retentionDays ?? ''), 10);
      if (!Number.isFinite(nextDays) || nextDays < 1 || nextDays > 3650) {
        return res.status(400).json({ error: 'retentionDays must be an integer between 1 and 3650.' });
      }
      updates.retentionDays = nextDays;
    }

    if (body.staleThresholdHours !== undefined) {
      const nextHours = Number.parseInt(String(body.staleThresholdHours ?? ''), 10);
      if (!Number.isFinite(nextHours) || nextHours < 1 || nextHours > 720) {
        return res.status(400).json({ error: 'staleThresholdHours must be an integer between 1 and 720.' });
      }
      updates.staleThresholdHours = nextHours;
    }

    if (body.autoScanHomeKit !== undefined) {
      if (typeof body.autoScanHomeKit !== 'boolean') {
        return res.status(400).json({ error: 'autoScanHomeKit must be a boolean.' });
      }
      updates.autoScanHomeKit = body.autoScanHomeKit;
    }

    if (body.archiveBeforeDelete !== undefined) {
      if (typeof body.archiveBeforeDelete !== 'boolean') {
        return res.status(400).json({ error: 'archiveBeforeDelete must be a boolean.' });
      }
      updates.archiveBeforeDelete = body.archiveBeforeDelete;
    }

    if (body.quietHoursEnabled !== undefined) {
      if (typeof body.quietHoursEnabled !== 'boolean') {
        return res.status(400).json({ error: 'quietHoursEnabled must be a boolean.' });
      }
      updates.quietHoursEnabled = body.quietHoursEnabled;
    }

    if (body.quietHoursStart !== undefined) {
      const h = Number.parseInt(String(body.quietHoursStart), 10);
      if (!Number.isFinite(h) || h < 0 || h > 23) {
        return res.status(400).json({ error: 'quietHoursStart must be an integer 0–23.' });
      }
      updates.quietHoursStart = h;
    }

    if (body.quietHoursEnd !== undefined) {
      const h = Number.parseInt(String(body.quietHoursEnd), 10);
      if (!Number.isFinite(h) || h < 0 || h > 23) {
        return res.status(400).json({ error: 'quietHoursEnd must be an integer 0–23.' });
      }
      updates.quietHoursEnd = h;
    }

    if (body.quietHoursExcludedAccessories !== undefined) {
      if (!Array.isArray(body.quietHoursExcludedAccessories)) {
        return res.status(400).json({ error: 'quietHoursExcludedAccessories must be an array of accessory ID strings.' });
      }
      if (body.quietHoursExcludedAccessories.some((v) => typeof v !== 'string' || !v.trim())) {
        return res.status(400).json({ error: 'Each entry in quietHoursExcludedAccessories must be a non-empty string.' });
      }
      updates.quietHoursExcludedAccessories = body.quietHoursExcludedAccessories.map((v) => v.trim());
    }

    if (body.episodeWindowMinutes !== undefined) {
      const ewm = Number.parseInt(String(body.episodeWindowMinutes), 10);
      if (!Number.isFinite(ewm) || ewm < 1 || ewm > 30) {
        return res.status(400).json({ error: 'episodeWindowMinutes must be an integer between 1 and 30.' });
      }
      updates.episodeWindowMinutes = ewm;
    }

    if (body.sceneWindowSeconds !== undefined) {
      const sws = Number.parseInt(String(body.sceneWindowSeconds), 10);
      if (!Number.isFinite(sws) || sws < 1 || sws > 30) {
        return res.status(400).json({ error: 'sceneWindowSeconds must be an integer between 1 and 30.' });
      }
      updates.sceneWindowSeconds = sws;
    }

    if (body.episodeMinEventCount !== undefined) {
      const emc = Number.parseInt(String(body.episodeMinEventCount), 10);
      if (!Number.isFinite(emc) || emc < 1 || emc > 20) {
        return res.status(400).json({ error: 'episodeMinEventCount must be an integer between 1 and 20.' });
      }
      updates.episodeMinEventCount = emc;
    }

    if (body.toastsEnabled !== undefined) {
      if (typeof body.toastsEnabled !== 'boolean') {
        return res.status(400).json({ error: 'toastsEnabled must be a boolean.' });
      }
      updates.toastsEnabled = body.toastsEnabled;
    }

    if (body.liveEventToastsEnabled !== undefined) {
      if (typeof body.liveEventToastsEnabled !== 'boolean') {
        return res.status(400).json({ error: 'liveEventToastsEnabled must be a boolean.' });
      }
      updates.liveEventToastsEnabled = body.liveEventToastsEnabled;
    }

    if (body.toastAccessories !== undefined) {
      if (!Array.isArray(body.toastAccessories)) {
        return res.status(400).json({ error: 'toastAccessories must be an array of accessory ID strings.' });
      }
      if (body.toastAccessories.some((v) => typeof v !== 'string' || !v.trim())) {
        return res.status(400).json({ error: 'Each entry in toastAccessories must be a non-empty string.' });
      }
      updates.toastAccessories = body.toastAccessories.map((v) => v.trim());
    }

    if (body.toastPosition !== undefined) {
      const valid = ['bottom-right', 'top-right', 'bottom-left', 'top-left'];
      if (!valid.includes(body.toastPosition)) {
        return res.status(400).json({ error: 'toastPosition must be one of: bottom-right, top-right, bottom-left, top-left.' });
      }
      updates.toastPosition = body.toastPosition;
    }
    if (body.toastDuration !== undefined) {
      const valid = [2, 3, 5, 7];
      const d = Number(body.toastDuration);
      if (!valid.includes(d)) {
        return res.status(400).json({ error: 'toastDuration must be one of: 2, 3, 5, 7.' });
      }
      updates.toastDuration = d;
    }
    if (body.toastMaxVisible !== undefined) {
      const valid = [1, 2, 3, 5];
      const m = Number(body.toastMaxVisible);
      if (!valid.includes(m)) {
        return res.status(400).json({ error: 'toastMaxVisible must be one of: 1, 2, 3, 5.' });
      }
      updates.toastMaxVisible = m;
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No supported settings provided.' });
    }

    const current = getSettings();
    const nextSettings = { ...current, ...updates };
    await saveSettings(nextSettings);
    const saved = getSettings();
    log.info(
      `[setup] Settings updated: retention=${saved.retentionDays}d stale=${saved.staleThresholdHours}h autoScanHomeKit=${saved.autoScanHomeKit}`
    );

    res.json(settingsToJson(saved, sweepMs));
  });

  return router;
}
