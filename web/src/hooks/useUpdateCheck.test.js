import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const fetchJson = vi.fn();
vi.mock('../lib/api.js', () => ({
  fetchJson: (...args) => fetchJson(...args),
  API_BASE: '/api',
}));

const { useUpdateCheck } = await import('./useUpdateCheck.js');

// The shape the listener returns — already normalized from GitLab's payload.
const release = (tag, extra = {}) => ({
  tag,
  url: `https://gitlab.com/havuq/homechronicle/-/releases/${tag}`,
  prerelease: /-(alpha|beta|rc)/.test(tag),
  publishedAt: '2026-08-30T12:00:00.000Z',
  ...extra,
});

function respond(releases) {
  fetchJson.mockResolvedValue({ enabled: true, releases, upstreamOk: true });
}

describe('useUpdateCheck', () => {
  beforeEach(() => {
    fetchJson.mockReset();
    localStorage.clear();
  });
  afterEach(() => { vi.useRealTimers(); });

  // The whole point of the rewrite: it used to call api.github.com, which the
  // page's `connect-src 'self'` CSP blocks outright — and the GitHub repo is
  // gone besides. It must talk to our own origin.
  it('asks our own listener, not a third-party origin', async () => {
    respond([]);
    renderHook(() => useUpdateCheck('v0.3.0'));
    await waitFor(() => expect(fetchJson).toHaveBeenCalled());

    const url = fetchJson.mock.calls[0][0];
    expect(url).toBe('/api/updates/latest');
    expect(url).not.toMatch(/^https?:\/\//);
    expect(url).not.toContain('github');
  });

  it('offers a newer stable release', async () => {
    respond([release('v0.4.0'), release('v0.3.0')]);
    const { result } = renderHook(() => useUpdateCheck('v0.3.0'));

    await waitFor(() => expect(result.current.update).toBeTruthy());
    expect(result.current.update.tag).toBe('v0.4.0');
    // Reads the server's field names, not GitHub's html_url/published_at.
    expect(result.current.update.url).toContain('gitlab.com');
    expect(result.current.update.publishedAt).toBe('2026-08-30T12:00:00.000Z');
  });

  it('says nothing when the running build is current', async () => {
    respond([release('v0.3.0')]);
    const { result } = renderHook(() => useUpdateCheck('v0.3.0'));
    await waitFor(() => expect(fetchJson).toHaveBeenCalled());
    expect(result.current.update).toBeNull();
  });

  it('never offers a newer build to someone already ahead of it', async () => {
    respond([release('v0.3.0')]);
    const { result } = renderHook(() => useUpdateCheck('v0.4.0'));
    await waitFor(() => expect(fetchJson).toHaveBeenCalled());
    expect(result.current.update).toBeNull();
  });

  describe('pre-releases', () => {
    it('are hidden from someone running a stable build', async () => {
      respond([release('v0.4.0-beta.1'), release('v0.3.0')]);
      const { result } = renderHook(() => useUpdateCheck('v0.3.0'));
      await waitFor(() => expect(fetchJson).toHaveBeenCalled());
      expect(result.current.update).toBeNull();
    });

    it('are offered to someone already running a beta', async () => {
      respond([release('v0.4.0-beta.2'), release('v0.3.0')]);
      const { result } = renderHook(() => useUpdateCheck('v0.4.0-beta.1'));
      await waitFor(() => expect(result.current.update).toBeTruthy());
      expect(result.current.update.tag).toBe('v0.4.0-beta.2');
      expect(result.current.update.isPrerelease).toBe(true);
    });

    it('offer the stable release to a beta user once it lands', async () => {
      respond([release('v0.4.0'), release('v0.4.0-beta.9')]);
      const { result } = renderHook(() => useUpdateCheck('v0.4.0-beta.1'));
      await waitFor(() => expect(result.current.update).toBeTruthy());
      expect(result.current.update.tag).toBe('v0.4.0');
    });
  });

  describe('degrading quietly', () => {
    // A box with no internet gets `releases: []` from its own listener, which
    // must read as "nothing to report", never as an error in the UI.
    it('reports nothing when the listener returns an empty list', async () => {
      respond([]);
      const { result } = renderHook(() => useUpdateCheck('v0.3.0'));
      await waitFor(() => expect(fetchJson).toHaveBeenCalled());
      expect(result.current.update).toBeNull();
    });

    it('swallows a failed request', async () => {
      fetchJson.mockRejectedValue(new Error('502'));
      const { result } = renderHook(() => useUpdateCheck('v0.3.0'));
      await waitFor(() => expect(fetchJson).toHaveBeenCalled());
      expect(result.current.update).toBeNull();
    });

  });

  // Settings › About reads `status`; it used to say "Up to date" whenever there
  // was no update object, including when the check had failed.
  describe('status', () => {
    it('is current only after a successful check found nothing newer', async () => {
      respond([release('v0.3.0')]);
      const { result } = renderHook(() => useUpdateCheck('v0.3.0'));
      expect(result.current.status).toBe('checking');
      await waitFor(() => expect(result.current.status).toBe('current'));
    });

    it('is available, with the release, when one is newer', async () => {
      respond([release('v0.4.0')]);
      const { result } = renderHook(() => useUpdateCheck('v0.3.0'));
      await waitFor(() => expect(result.current.status).toBe('available'));
      expect(result.current.latest.tag).toBe('v0.4.0');
    });

    it('is unavailable when the request fails', async () => {
      fetchJson.mockRejectedValue(new Error('502'));
      const { result } = renderHook(() => useUpdateCheck('v0.3.0'));
      await waitFor(() => expect(result.current.status).toBe('unavailable'));
    });

    it('is unavailable when the listener could not reach GitLab', async () => {
      fetchJson.mockResolvedValue({ enabled: true, releases: [], upstreamOk: false });
      const { result } = renderHook(() => useUpdateCheck('v0.3.0'));
      await waitFor(() => expect(result.current.status).toBe('unavailable'));
    });

    it('is disabled when the server has the check turned off', async () => {
      fetchJson.mockResolvedValue({ enabled: false, releases: [] });
      const { result } = renderHook(() => useUpdateCheck('v0.3.0'));
      await waitFor(() => expect(result.current.status).toBe('disabled'));
    });

    it('is disabled when the user turned the check off', () => {
      localStorage.setItem('hc_disable_update_check', 'true');
      const { result } = renderHook(() => useUpdateCheck('v0.3.0'));
      expect(result.current.status).toBe('disabled');
    });

    it('keeps reporting a dismissed release as latest', async () => {
      localStorage.setItem('hc_update_dismissed', 'v0.4.0');
      respond([release('v0.4.0')]);
      const { result } = renderHook(() => useUpdateCheck('v0.3.0'));
      await waitFor(() => expect(result.current.status).toBe('available'));
      expect(result.current.update).toBeNull();
      expect(result.current.latest.tag).toBe('v0.4.0');
    });
  });

  describe('when turned off', () => {
    it('does not call out at all when the user disabled the check', async () => {
      localStorage.setItem('hc_disable_update_check', 'true');
      renderHook(() => useUpdateCheck('v0.3.0'));
      await new Promise((r) => setTimeout(r, 20));
      expect(fetchJson).not.toHaveBeenCalled();
    });
  });

  it('stays dismissed for the version that was dismissed', async () => {
    respond([release('v0.4.0')]);
    const { result } = renderHook(() => useUpdateCheck('v0.3.0'));
    await waitFor(() => expect(result.current.update).toBeTruthy());

    act(() => { result.current.dismiss(); });
    expect(result.current.update).toBeNull();
    expect(localStorage.getItem('hc_update_dismissed')).toBe('v0.4.0');

    // A remount must not resurrect the same banner.
    fetchJson.mockClear();
    respond([release('v0.4.0')]);
    const second = renderHook(() => useUpdateCheck('v0.3.0'));
    await waitFor(() => expect(fetchJson).toHaveBeenCalled());
    expect(second.result.current.update).toBeNull();
  });
});
