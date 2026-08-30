import { render } from '@testing-library/react';
import Timeline from './Timeline.jsx';

// M-8 regression: Timeline's grouping args come from the per-user blob when the blob
// carries the key, and from retention otherwise (both proven via spy call arguments).

function makeEvent(id, minutesAgo, name = 'Kitchen Light') {
  const ts = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  return {
    id,
    timestamp: ts,
    accessory_name: name,
    room_name: 'Kitchen',
    service_type: 'Lightbulb',
    characteristic: 'On',
    old_value: '0',
    new_value: '1',
  };
}

const stableEvents = [makeEvent('evt-1', 10, 'Kitchen Light'), makeEvent('evt-2', 5, 'Hall Motion')];

vi.mock('../hooks/useEvents.js', () => ({
  useEvents: () => ({
    data: { events: stableEvents, pages: 1 },
    isLoading: false,
    isError: false,
  }),
  useAnomalies: () => ({ data: { devices: [], rooms: [] } }),
}));

vi.mock('../hooks/useMutedDevices.js', () => ({
  useMutedDevices: () => ({ muted: new Set(), mute: vi.fn(), unmute: vi.fn() }),
}));

vi.mock('./FilterBar.jsx', () => ({ default: () => null }));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: (options) => {
      if (options.queryKey?.[0] === 'setup' && options.queryKey?.[1] === 'retention') {
        return { data: { episodeWindowMinutes: 3, sceneWindowSeconds: 5, episodeMinEventCount: 3 } };
      }
      return actual.useQuery(options);
    },
  };
});

vi.mock('../lib/episodes.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    groupIntoScenes: vi.fn(actual.groupIntoScenes),
    groupScenesIntoEpisodes: vi.fn(actual.groupScenesIntoEpisodes),
  };
});

import { useAuth } from '../hooks/useAuth.js';
import { useUserPreferences } from '../hooks/useUserPreferences.js';
import { usePreference } from '../hooks/usePreference.js';
import { groupIntoScenes, groupScenesIntoEpisodes } from '../lib/episodes.js';

vi.mock('../hooks/useAuth.js', () => ({ useAuth: vi.fn() }));
vi.mock('../hooks/useUserPreferences.js', () => ({ useUserPreferences: vi.fn() }));
vi.mock('../hooks/usePreference.js', () => ({ usePreference: vi.fn() }));

describe('Timeline per-user grouping (M-8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the blob value for a key it carries, retention for a key it does not', () => {
    useAuth.mockReturnValue({ user: { id: 1 } });
    useUserPreferences.mockReturnValue({ prefs: { episodeWindowMinutes: 10 } });
    const fallbackByKey = { sceneWindowSeconds: 5, episodeMinEventCount: 3 };
    usePreference.mockImplementation((key) => [
      key === 'episodeWindowMinutes' ? 10 : fallbackByKey[key],
      vi.fn(),
    ]);

    render(<Timeline />);

    expect(groupScenesIntoEpisodes).toHaveBeenCalled();
    const episodesArgs = groupScenesIntoEpisodes.mock.calls[0][1];
    expect(episodesArgs.episodeWindowMs).toBe(600_000); // blob wins: 10 * 60_000

    expect(groupIntoScenes).toHaveBeenCalled();
    const scenesArgs = groupIntoScenes.mock.calls[0][1];
    expect(scenesArgs.sceneWindowMs).toBe(5000); // retention: key absent from blob
  });

  it('anonymous users get all three values from retention, reactively', () => {
    useAuth.mockReturnValue({ user: undefined });
    useUserPreferences.mockReturnValue({ prefs: {} });
    usePreference.mockImplementation((key, defaultValue) => [defaultValue, vi.fn()]);

    render(<Timeline />);

    const episodesArgs = groupScenesIntoEpisodes.mock.calls[0][1];
    expect(episodesArgs.episodeWindowMs).toBe(180_000); // 3 * 60_000 from retention mock
  });
});
