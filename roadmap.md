# HomeChronicle Roadmap

This is a collection of potential features and improvements — not ordered by priority or timeline. It serves as a brainstorm of possibilities for where HomeChronicle could go next.

---

### More alert transports
Add support for ntfy, Pushover, MQTT publish, email, and Slack/Discord as alert delivery methods alongside the existing webhook transport. Each transport would be configurable per alert rule so users can route different alerts to different destinations.

### Export timeline as CSV/JSON
Allow users to export filtered timeline data as CSV or JSON files. The export would respect the currently applied filters (date range, room, device, characteristic) so users can extract exactly the slice of data they need.

### Subscription health alerts
Proactively notify users when a HomeKit subscription drops and cannot reconnect after repeated retries. This builds on the existing reliability tracking to surface connection problems before the user notices gaps in their timeline.

### Saved filter views
Let users save frequently used filter combinations (e.g., "Kitchen motion after midnight" or "All locks this week") and quickly switch between them. Saved views would persist across sessions and appear as a dropdown or sidebar list.

### Database size dashboard
Display database size, total event count, event count trends over time, archive statistics, and projected storage needs. Gives users visibility into how their instance is growing and whether retention settings are keeping things in check.

### Device state timeline (Gantt view)
A horizontal timeline visualization showing on/off or open/closed state duration per device across a day. Instead of discrete event dots, this shows continuous bars representing how long a device was in a given state, making it easy to see patterns like "the garage door was open for 3 hours."

### Digest / summary alerts
A daily or weekly summary delivered via the user's preferred transport covering top active devices, anomalies detected, stale devices, and retention statistics. This is the "set and forget" mode for users who don't want real-time alerts but still want to stay informed.

### PWA push notifications
Use the Web Push API so the installed Progressive Web App can deliver native-feeling push notifications for alerts. This removes the need for an external transport for users who primarily interact with HomeChronicle on their phone or tablet.

### Uptime dashboard and gap detection
Track HomeChronicle's own uptime and identify gaps where events may have been missed due to service restarts, network outages, or subscriber disconnections. Display these gaps visually on the timeline so users know when their data may be incomplete.

### Device grouping and tags
User-defined tags (e.g., "security," "lighting," "climate," "outdoor") that work alongside rooms to provide cross-cutting views of device activity. A device can have multiple tags, and tags can be used as filters throughout the timeline and dashboard.

### Automation and scene detection
Recognize when a sequence of events looks like an automation firing (e.g., a motion sensor triggers a light within 1 second). Group these correlated events into "scenes" on the timeline and surface detected automations as named patterns over time.

### Baseline learning and smarter anomalies
Build per-device behavioral profiles based on historical data — typical activity hours, normal value ranges, expected event frequency. Use these baselines to surface meaningful deviations beyond the current spike-based anomaly detection.

### Comparative views
Side-by-side or overlay comparisons of activity across time periods. Compare a device or room's activity this week versus last week, this month versus last month, or any two arbitrary date ranges to spot trends and changes.

### Firmware version tracking
Log and surface firmware version changes when detected via HomeKit accessory metadata. Maintain a version history per device so users can correlate behavioral changes with firmware updates.

### Backup and restore UI
A web UI for creating and restoring database backups without needing to use the command line. Includes scheduled automatic backups, backup history, and one-click restore with confirmation.

### Floor plan overlay
Upload a floor plan image, place devices on it by dragging, and visualize activity as a heat overlay. Shows which areas of the home are most active and lets users spatially navigate to device details.

### Home Assistant and MQTT bridge
Publish HomeChronicle events to an MQTT broker and/or expose an API that Home Assistant can poll or subscribe to. Allows HomeChronicle to feed data into the broader home automation ecosystem.

### Multi-user accounts
Support multiple user accounts with separate alert preferences, dashboard layouts, and permission levels. Includes role-based access so household members can have read-only or full admin access.

### Correlation insights
Automatically discover and surface correlations between devices — "When the front door opens, the hallway light turns on within 2 seconds 94% of the time." Requires sufficient historical data and careful filtering to avoid surfacing noise.

### Mute accessories during quiet time
Allow users to define quiet-time windows (e.g., 11 PM – 7 AM) during which specific accessories are muted — meaning their events are still recorded but do not trigger alerts. This lets users avoid noisy overnight notifications from sensors like motion detectors or contact sensors while still capturing the data for later review.

### Thread network topology
Display Thread border router health and mesh network topology for Matter-over-Thread devices. Show which border routers are active, which devices route through them, and signal quality metrics.

### Devices table in PostgreSQL
Consolidate device metadata (name, address, port, room, PIN, display name, notes, health status, pairedAt) into a `devices` table in the database. Currently this data is scattered across `pairings.json`, `rooms.json`, in-memory caches, and event history. A database table provides queryability (e.g., join events with rooms in SQL), atomic writes, and a single source of truth. Crypto-sensitive pairing keys (`longTermData`) would remain in `pairings.json` to keep them out of database backups. Requires a one-time migration to seed the table from existing JSON files.
