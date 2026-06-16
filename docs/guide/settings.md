# Settings

The **Settings** tab in **Manage** is organized into three top-level sections: **Admin**, **Configuration**, and **Account**. Admin and Account sections are only shown when `AUTH_ENABLED=true`.

## Admin (auth-on, admins only)

The **Admin** section is visible only to admin-role users.

### Users

Invite members, change roles (admin/member), and disable accounts. The invite link doubles as email verification. A last-admin guard prevents demoting or disabling the only admin. Requires [Email (SMTP)](email.md) to be configured. See [Accounts & Users](accounts.md).

### Email (SMTP)

SMTP settings for outbound email: server hostname, port, username/password, From address, and a **Send test email** button. Environment variable values (`SMTP_HOST`, etc.) override UI-saved settings — see [Email (SMTP)](email.md).

## Configuration

The **Configuration** section is available to all users. It contains four tabs: **Device Management**, **Data**, **Toast**, and **About**. An **Advanced** tab is shown only to admins.

All settings auto-save instantly unless noted otherwise.

### Device Management

#### HomeKit Auto-Scan

Automatically scans for new HomeKit accessories every hour via mDNS. Manual scans from the Add Devices tab still work when this is off.

#### Scheduled Repair

Automatically re-pairs HomeKit devices that lose their connection overnight. When enabled, the listener identifies devices with reconnection errors or that haven't been seen recently and attempts to re-discover and re-subscribe.

| Setting | Description |
|---------|-------------|
| **Enabled** | Toggle the daily repair cycle on/off |
| **Repair Hour** | Hour of day to run the repair (displayed in local time, stored as UTC) |

The last run time and results (repaired/failed counts) are shown below the settings when available.

### Data & Retention

#### Retention Cutoff

How many days to keep events in the main `event_logs` table. Events older than this are swept during the daily retention cycle. Changes apply without restart.

#### Archive Before Delete

When enabled, expired events are copied to the `event_logs_archive` table before removal. When off, expired events are permanently deleted. If archive data exists, a download button appears to export it.

#### Stale Accessory Threshold

Number of hours without events before an accessory is marked as "stale" on the dashboard and device list.

### Alerts & Quiet Hours {#alerts}

#### Alert Rules

Alert rules notify you when specific device events occur. Requires `ALERTS_ENABLED=true`. Two delivery channels are available: **webhook** (HTTP POST to any URL) and **email** (requires SMTP — see [Email (SMTP)](email.md)).

All users can create and manage their own alert rules. For email-channel rules, non-admin users can only send to their own account email address; admins can set any recipient.

#### Quiet Hours

Flags accessory activity during a time window as unexpected on the dashboard. Configure the start and end hours. Accessories can be individually excluded from quiet-hours monitoring — excluded accessories appear as removable badges below the time pickers.

When you are signed in, quiet-hours settings are stored per account and synced across your devices. Without an authenticated session (auth off or service token), the shared household configuration is used instead.

### Timeline

These settings control how the Timeline tab groups raw events into episodes.

| Setting | Default | Description |
|---------|---------|-------------|
| **Episode capture interval** | 3 min | Events within this window are grouped into timeline episodes |
| **Scene grouping window** | 5 sec | Events within this many seconds are clustered into a single scene |
| **Episode minimum events** | 3 | Minimum events for a scene cluster to be promoted to an episode |

### Toast

#### Toast Notifications

Toggle brief popup messages for saves, deletes, and other actions. When disabled, all toast-related settings below are grayed out.

#### Live Event Toasts

Show a popup when selected accessories report state changes (e.g., a light turning on). Only appears when you're **not** on the Timeline tab to avoid duplicating what's already visible.

To select which accessories trigger live toasts, go to **Manage > My Accessories** and click the bell icon next to each device. Both HomeKit and Matter devices are supported.

#### Toast Position

Where on screen toast popups appear:

- Bottom Right (default)
- Bottom Left
- Bottom Center
- Top Right
- Top Left
- Top Center

#### Toast Duration

How long each toast stays visible before auto-dismissing: 2, 3, 5, or 7 seconds.

#### Max Visible Toasts

Maximum number of toasts that can stack on screen at once: 1, 2, 3, or 5.

### Advanced (admin-only)

#### Log Level

Controls how much the listener logs to Docker output. Changes apply instantly without a container restart.

| Level | Description |
|-------|-------------|
| **Error** | Errors only |
| **Warn** | Errors and warnings |
| **Info** | Normal operation (default) |
| **Debug** | Verbose output for troubleshooting |

#### Danger Zone

A collapsible section for destructive operations. Each action requires explicit confirmation. Only admins can see or use these controls.

##### Remove Pairings

Unpair individual HomeKit or Matter accessories. Event history is **not** deleted — only the pairing keys are removed and the subscriber/poller is stopped.

A **Remove All Pairings** button is available when multiple devices are paired. It requires typing `DELETE` to confirm.

##### Delete Accessory Data

Delete stored event history for individual accessories. A filter lets you view all accessories, only currently paired, or only those no longer paired. Deleting history does not unpair the device.

**Wipe All Data** permanently deletes all event data from the database. Requires typing `DELETE` to confirm. This cannot be undone.

## Account (auth-on only)

The **Account** section is shown when `AUTH_ENABLED=true`. It is personal to the signed-in user.

### Change Password

Update your account password. Requires entering your current password.

### Active Sessions

Lists your current login sessions with the device user agent and IP address captured at login. You can revoke any individual session (including your current one). Revoking a session immediately invalidates it.

## Per-User Preferences

When signed in, the following preferences are saved per account and synced across all your devices:

- Theme (system, light, dark) and accent color
- Dashboard layout and visible panels
- Dashboard date range
- Toast notification settings
- Sidebar collapsed/expanded state
- Quiet-hours configuration

Without an authenticated session, preferences are stored in browser `localStorage` only and are not synced.
