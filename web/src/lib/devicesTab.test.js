import { describe, it, expect } from 'vitest';
import { nextDevicesTab } from './devicesTab.js';

describe('nextDevicesTab', () => {
  it('opens the tab asked for, from any page', () => {
    expect(nextDevicesTab({ activePage: 'settings', currentTab: 'browse', requestedTab: 'devices' })).toBe('devices');
    expect(nextDevicesTab({ activePage: 'devices', currentTab: 'devices', requestedTab: 'browse' })).toBe('browse');
  });

  it('keeps the current tab when already on Devices and no tab is asked for', () => {
    expect(nextDevicesTab({ activePage: 'devices', currentTab: 'devices', detailOpen: false })).toBe('devices');
  });

  it('opens Browse from an accessory\'s detail, even over the Devices page', () => {
    expect(nextDevicesTab({ activePage: 'devices', currentTab: 'devices', detailOpen: true })).toBe('browse');
    expect(nextDevicesTab({ activePage: 'devices', currentTab: 'browse', requestedTab: 'devices', detailOpen: true })).toBe('devices');
  });

  it('opens Browse when coming from another page with no tab asked for', () => {
    expect(nextDevicesTab({ activePage: 'dashboard', currentTab: 'devices' })).toBe('browse');
    expect(nextDevicesTab({ activePage: 'settings', currentTab: 'devices', requestedTab: undefined })).toBe('browse');
  });
});
