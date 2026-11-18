// Which Devices tab navigating to Devices should show: the tab asked for if any;
// otherwise the current tab when already on Devices (the top-bar link leaves it
// alone), else Browse.
export function nextDevicesTab({ activePage, currentTab, requestedTab }) {
  if (requestedTab) return requestedTab;
  return activePage === 'devices' ? currentTab : 'browse';
}
