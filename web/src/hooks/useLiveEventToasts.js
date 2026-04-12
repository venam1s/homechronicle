import { useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';

const POLL_INTERVAL = 5000;
const BASE = '/api';
const MAX_SEEN_IDS = 500;

function parentDeviceId(id) {
  const parts = String(id ?? '').split(':');
  // HAP bridge: 6-part MAC + aid suffix → return MAC
  if (parts.length > 6) return parts.slice(0, 6).join(':');
  // Matter: nodeId:endpointId → return nodeId
  if (parts.length > 1) return parts[0];
  return String(id ?? '');
}

export function useLiveEventToasts({ activeTab, retentionConfig, onNavigateToAccessory }) {
  const { addToast } = useToast();
  const seenIds = useRef(new Set());
  const sinceRef = useRef(new Date().toISOString());

  const toastAccessories = retentionConfig?.toastAccessories ?? [];
  const toastAccessoriesKey = JSON.stringify(toastAccessories);

  const enabled =
    (retentionConfig?.toastsEnabled ?? true) &&
    (retentionConfig?.liveEventToastsEnabled ?? false) &&
    toastAccessories.length > 0 &&
    activeTab !== 'timeline';

  const accessorySet = useMemo(
    () => new Set(JSON.parse(toastAccessoriesKey)),
    [toastAccessoriesKey]
  );

  const { data } = useQuery({
    queryKey: ['live-events'],
    queryFn: () => fetchJson(`${BASE}/events?from=${encodeURIComponent(sinceRef.current)}&limit=20`),
    enabled,
    refetchInterval: enabled ? POLL_INTERVAL : false,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (!data?.events?.length || !enabled) return;

    const newEvents = data.events.filter(
      (e) => !seenIds.current.has(e.id) && (
        accessorySet.has(e.accessory_id) ||
        accessorySet.has(parentDeviceId(e.accessory_id))
      )
    );

    for (const event of newEvents.slice().reverse()) {
      seenIds.current.add(event.id);
      const label = `${event.accessory_name} — ${event.characteristic}: ${event.new_value}`;
      const name = event.accessory_name;
      addToast(label, 'info', {
        onClick: onNavigateToAccessory ? () => onNavigateToAccessory(name) : undefined,
      });
    }

    // Advance the timestamp to the newest event
    if (data.events.length > 0) {
      const newest = data.events[0].timestamp;
      if (newest > sinceRef.current) {
        sinceRef.current = newest;
      }
    }

    // Prune seen IDs to prevent unbounded growth in long-running tabs
    if (seenIds.current.size > MAX_SEEN_IDS) {
      const entries = [...seenIds.current];
      seenIds.current = new Set(entries.slice(entries.length - MAX_SEEN_IDS));
    }
  }, [data, enabled, accessorySet, addToast, onNavigateToAccessory]);
}
