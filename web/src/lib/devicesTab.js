// Which Devices tab navigating to Devices should show: the tab asked for if any;
// otherwise the current tab when the Devices page itself is on screen (the
// top-bar link leaves it alone), else Browse. An open accessory detail covers
// the Devices page, so from there Devices opens on Browse.
export function nextDevicesTab({ activePage, currentTab, requestedTab, detailOpen = false }) {
  if (requestedTab) return requestedTab;
  return activePage === 'devices' && !detailOpen ? currentTab : 'browse';
}
