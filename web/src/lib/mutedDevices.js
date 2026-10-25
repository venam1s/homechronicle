/**
 * True when an event's device is muted. Mutes are stored by name; a device
 * muted before it got a display name is matched by the name it reports.
 */
export function isEventMuted(muted, event) {
  return muted.has(event.accessory_name) || (event.reported_name != null && muted.has(event.reported_name));
}
