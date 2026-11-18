import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCanManageHome } from './useCanManageHome.js';

const { mockUseAuth, mockUseAuthConfig } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUseAuthConfig: vi.fn(),
}));

vi.mock('./useAuth.js', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('./useAuthConfig.js', () => ({
  useAuthConfig: () => mockUseAuthConfig(),
}));

function canManage({ authEnabled, user }) {
  mockUseAuthConfig.mockReturnValue({ authEnabled });
  mockUseAuth.mockReturnValue({ user });
  return renderHook(() => useCanManageHome()).result.current;
}

describe('useCanManageHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auth off: true', () => {
    expect(canManage({ authEnabled: false, user: null })).toBe(true);
  });

  it('auth on with an admin: true', () => {
    expect(canManage({ authEnabled: true, user: { id: 1, role: 'admin' } })).toBe(true);
  });

  it('auth on with a member: false', () => {
    expect(canManage({ authEnabled: true, user: { id: 2, role: 'member' } })).toBe(false);
  });

  it('auth on with no user: false', () => {
    expect(canManage({ authEnabled: true, user: null })).toBe(false);
  });
});
