import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAccessories } from './useEvents.js';
import { fetchJson } from '../lib/api.js';

// ---------------------------------------------------------------------------
// PIN vault — persists entered PINs in sessionStorage for the current tab session
// ---------------------------------------------------------------------------
function loadSavedPins() {
  try { return JSON.parse(sessionStorage.getItem('hc_pins') ?? '{}'); }
  catch { return {}; }
}

export function useSetup() {
  const queryClient = useQueryClient();

  // PIN vault (sessionStorage-backed)
  const [savedPins, setSavedPins] = useState(loadSavedPins);

  // Room inputs (shared between MyDevicesTab + BridgeChildrenRow)
  const [roomInputs, setRoomInputs] = useState({});

  // Note inputs (shared between MyDevicesTab)
  const [noteInputs, setNoteInputs] = useState({});

  // Display name inputs
  const [displayNameInputs, setDisplayNameInputs] = useState({});

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: discoveredData, isLoading: discoveredLoading } = useQuery({
    queryKey: ['setup', 'discovered'],
    queryFn: () => fetchJson('/api/setup/discovered'),
    refetchInterval: false,
    staleTime: Infinity,
  });

  const { data: homekitPairings = [] } = useQuery({
    queryKey: ['setup', 'pairings'],
    queryFn: () => fetchJson('/api/setup/pairings'),
    refetchInterval: 15_000,
  });

  const { data: savedRooms = {} } = useQuery({
    queryKey: ['setup', 'rooms'],
    queryFn: () => fetchJson('/api/setup/rooms'),
  });

  const { data: savedNotes = {} } = useQuery({
    queryKey: ['setup', 'notes'],
    queryFn: () => fetchJson('/api/setup/notes'),
  });

  const { data: savedDisplayNames = {} } = useQuery({
    queryKey: ['setup', 'display-names'],
    queryFn: () => fetchJson('/api/setup/display-names'),
  });

  const { data: retentionConfig } = useQuery({
    queryKey: ['setup', 'retention'],
    queryFn: () => fetchJson('/api/setup/retention'),
  });

  const { data: logLevelConfig } = useQuery({
    queryKey: ['setup', 'log-level'],
    queryFn: () => fetchJson('/api/setup/log-level'),
  });

  const { data: repairConfig } = useQuery({
    queryKey: ['setup', 'repair'],
    queryFn: () => fetchJson('/api/setup/repair'),
    refetchInterval: 60_000,
  });

  const { data: alertsConfig } = useQuery({
    queryKey: ['setup', 'alerts'],
    queryFn: () => fetchJson('/api/setup/alerts'),
    refetchInterval: 60_000,
  });

  const {
    data: matterRuntime = null,
    isError: matterRuntimeError,
    error: matterRuntimeErrorValue,
    refetch: refetchMatterRuntime,
  } = useQuery({
    queryKey: ['setup', 'matter', 'runtime'],
    queryFn: () => fetchJson('/api/setup/matter/runtime'),
    retry: false,
    refetchInterval: 30_000,
  });

  const { data: matterDiscoveredData, isLoading: matterDiscoveredLoading } = useQuery({
    queryKey: ['setup', 'matter', 'discovered'],
    queryFn: () => fetchJson('/api/setup/matter/discovered'),
    refetchInterval: false,
    staleTime: Infinity,
  });

  const {
    data: matterPairings = [],
    isError: matterPairingsError,
    error: matterPairingsErrorValue,
    refetch: refetchMatterPairings,
  } = useQuery({
    queryKey: ['setup', 'matter', 'pairings'],
    queryFn: () => fetchJson('/api/setup/matter/pairings'),
    retry: false,
    refetchInterval: 15_000,
  });

  const { data: dbAccessories = [] } = useAccessories();

  // ── Derived state ────────────────────────────────────────────────────────

  const accessories = discoveredData?.accessories ?? [];
  const paired = homekitPairings;
  const commissionConfigured = Boolean(matterRuntime?.commissionConfigured);
  const pollingConfigured = Boolean(matterRuntime?.pollingConfigured);
  const missingMatterConfig = Array.isArray(matterRuntime?.missingConfig)
    ? matterRuntime.missingConfig
    : [];

  // ── Mutations ────────────────────────────────────────────────────────────

  const scanMutation = useMutation({
    mutationFn: () => fetchJson('/api/setup/scan', { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.setQueryData(['setup', 'discovered'], data);
    },
  });

  const deletePairingMutation = useMutation({
    mutationFn: (deviceId) =>
      fetchJson(`/api/setup/pairing/${encodeURIComponent(deviceId)}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup', 'pairings'] });
      queryClient.invalidateQueries({ queryKey: ['setup', 'discovered'] });
      queryClient.invalidateQueries({ queryKey: ['accessories'] });
      scanMutation.mutate();
    },
  });

  const repairPairingMutation = useMutation({
    mutationFn: async ({ deviceId, pin }) => {
      const body = pin ? { pin } : {};
      try {
        return await fetchJson(`/api/setup/repair/${encodeURIComponent(deviceId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (fetchErr) {
        // fetchJson throws with the response text; try to parse structured error
        try {
          const parsed = JSON.parse(fetchErr.message);
          const err = new Error(parsed.guidance || parsed.error || 'Repair failed');
          err.code = parsed.code;
          err.guidance = parsed.guidance;
          throw err;
        } catch (parseErr) {
          if (parseErr.code) throw parseErr; // re-throw our structured error
          throw fetchErr; // re-throw original
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup', 'pairings'] });
      queryClient.invalidateQueries({ queryKey: ['accessories'] });
      queryClient.invalidateQueries({ queryKey: ['health'] });
    },
  });

  const saveRoomMutation = useMutation({
    mutationFn: ({ accessoryId, roomName }) =>
      fetchJson('/api/setup/room', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessoryId, roomName }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accessories'] });
      queryClient.invalidateQueries({ queryKey: ['setup', 'rooms'] });
    },
  });

  const saveNoteMutation = useMutation({
    mutationFn: ({ accessoryId, note }) =>
      fetchJson('/api/setup/note', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessoryId, note }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accessories'] });
      queryClient.invalidateQueries({ queryKey: ['setup', 'notes'] });
    },
  });

  const saveDisplayNameMutation = useMutation({
    mutationFn: ({ accessoryId, displayName }) =>
      fetchJson('/api/setup/display-name', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessoryId, displayName }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup', 'display-names'] });
      queryClient.invalidateQueries({ queryKey: ['accessories'] });
    },
  });

  const saveRetentionMutation = useMutation({
    mutationFn: (settingsPatch) =>
      fetchJson('/api/setup/retention', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsPatch),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(['setup', 'retention'], next);
    },
  });

  const saveLogLevelMutation = useMutation({
    mutationFn: (level) =>
      fetchJson('/api/setup/log-level', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level }),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(['setup', 'log-level'], next);
    },
  });

  const saveRepairMutation = useMutation({
    mutationFn: (settingsPatch) =>
      fetchJson('/api/setup/repair', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsPatch),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(['setup', 'repair'], next);
    },
  });

  const saveAlertsMutation = useMutation({
    mutationFn: (settingsPatch) =>
      fetchJson('/api/setup/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsPatch),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(['setup', 'alerts'], next);
      queryClient.invalidateQueries({ queryKey: ['health'] });
    },
  });

  const deleteAccessoryMutation = useMutation({
    mutationFn: (accessoryId) =>
      fetchJson('/api/data/accessory', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessoryId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accessories'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['setup', 'matter', 'pairings'] });
      queryClient.invalidateQueries({ queryKey: ['setup', 'pairings'] });
    },
  });

  const matterScanMutation = useMutation({
    mutationFn: () => fetchJson('/api/setup/matter/scan', { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.setQueryData(['setup', 'matter', 'discovered'], data);
    },
  });

  const pairMatterMutation = useMutation({
    mutationFn: (payload) => fetchJson('/api/setup/matter/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup', 'matter', 'pairings'] });
      queryClient.invalidateQueries({ queryKey: ['setup', 'matter', 'runtime'] });
      queryClient.invalidateQueries({ queryKey: ['setup', 'matter', 'discovered'] });
      queryClient.invalidateQueries({ queryKey: ['accessories'] });
    },
  });

  const deleteMatterPairingMutation = useMutation({
    mutationFn: (nodeId) => fetchJson(`/api/setup/matter/pairing/${encodeURIComponent(nodeId)}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup', 'matter', 'pairings'] });
      queryClient.invalidateQueries({ queryKey: ['setup', 'matter', 'runtime'] });
      queryClient.invalidateQueries({ queryKey: ['accessories'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });

  const addPairingMutation = useMutation({
    mutationFn: (sourcePairings) =>
      fetchJson('/api/setup/add-pairing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePairings }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup', 'pairings'] });
      queryClient.invalidateQueries({ queryKey: ['setup', 'discovered'] });
      queryClient.invalidateQueries({ queryKey: ['accessories'] });
    },
  });

  // ── PIN helpers ──────────────────────────────────────────────────────────

  function savePin(id, pin) {
    const next = { ...savedPins, [id]: pin };
    setSavedPins(next);
    try { sessionStorage.setItem('hc_pins', JSON.stringify(next)); } catch { /* private browsing */ }
  }

  function clearPin(id) {
    const next = { ...savedPins };
    delete next[id];
    setSavedPins(next);
    try { sessionStorage.setItem('hc_pins', JSON.stringify(next)); } catch { /* private browsing */ }
  }

  function resolvePin(id) {
    return savedPins[id]?.trim() || '';
  }

  // ── Room helpers ─────────────────────────────────────────────────────────

  function handleRoomBlur(deviceId) {
    const roomName = roomInputs[deviceId] ?? '';
    saveRoomMutation.mutate({ accessoryId: deviceId, roomName });
  }

  // ── Note helpers ─────────────────────────────────────────────────────────

  function handleNoteBlur(deviceId) {
    const note = noteInputs[deviceId] ?? '';
    saveNoteMutation.mutate({ accessoryId: deviceId, note });
  }

  // ── Display name helpers ─────────────────────────────────────────────────

  function handleDisplayNameBlur(deviceId) {
    const displayName = displayNameInputs[deviceId] ?? '';
    saveDisplayNameMutation.mutate({ accessoryId: deviceId, displayName });
  }

  // ── Pairing helpers ──────────────────────────────────────────────────────

  async function pairOne(deviceId, pin, setPairingStatus) {
    setPairingStatus((s) => ({ ...s, [deviceId]: { state: 'loading', message: 'Pairing\u2026' } }));
    try {
      const result = await fetchJson('/api/setup/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, pin }),
      });
      savePin(deviceId, pin);
      queryClient.invalidateQueries({ queryKey: ['setup', 'pairings'] });
      queryClient.invalidateQueries({ queryKey: ['setup', 'discovered'] });
      queryClient.invalidateQueries({ queryKey: ['accessories'] });
      setPairingStatus((s) => ({
        ...s, [deviceId]: { state: 'success', message: `Paired \u2014 now logging ${result.name}` },
      }));
      return { ok: true, name: result.name };
    } catch (err) {
      setPairingStatus((s) => ({
        ...s, [deviceId]: { state: 'error', message: err.message },
      }));
      return { ok: false, error: err.message };
    }
  }

  async function pairSelectedIds(ids, resolvedPinFn, setPairingStatus, setBulkProgress) {
    if (!ids.length) return;
    setBulkProgress({ total: ids.length, done: 0, results: [] });
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const pin = resolvedPinFn(id);
      if (!pin) {
        setPairingStatus((s) => ({
          ...s, [id]: { state: 'error', message: 'No PIN \u2014 enter a PIN above or set one for this device' },
        }));
        setBulkProgress((p) => ({ ...p, done: i + 1, results: [...p.results, { id, ok: false }] }));
        continue;
      }
      const result = await pairOne(id, pin, setPairingStatus);
      setBulkProgress((p) => ({ ...p, done: i + 1, results: [...p.results, { id, ...result }] }));
    }
    queryClient.invalidateQueries({ queryKey: ['setup', 'pairings'] });
    queryClient.invalidateQueries({ queryKey: ['setup', 'discovered'] });
  }

  return {
    // Queries
    discoveredData,
    discoveredLoading,
    savedRooms,
    savedNotes,
    savedDisplayNames,
    retentionConfig,
    logLevelConfig,
    repairConfig,
    alertsConfig,
    matterRuntime,
    matterRuntimeError,
    matterRuntimeErrorValue,
    refetchMatterRuntime,
    matterDiscoveredData,
    matterDiscoveredLoading,
    matterPairings,
    matterPairingsError,
    matterPairingsErrorValue,
    refetchMatterPairings,
    dbAccessories,

    // Derived
    accessories,
    paired,
    commissionConfigured,
    pollingConfigured,
    missingMatterConfig,

    // Mutations
    scanMutation,
    matterScanMutation,
    deletePairingMutation,
    repairPairingMutation,
    addPairingMutation,
    saveRoomMutation,
    saveNoteMutation,
    saveRetentionMutation,
    saveLogLevelMutation,
    saveRepairMutation,
    saveAlertsMutation,
    deleteAccessoryMutation,
    pairMatterMutation,
    deleteMatterPairingMutation,

    // PIN vault
    savedPins,
    savePin,
    clearPin,
    resolvePin,

    // Room editing
    roomInputs,
    setRoomInputs,
    handleRoomBlur,
    // Note editing
    noteInputs,
    setNoteInputs,
    handleNoteBlur,

    // Display name editing
    displayNameInputs,
    setDisplayNameInputs,
    handleDisplayNameBlur,

    // Pairing
    pairOne,
    pairSelectedIds,
  };
}
