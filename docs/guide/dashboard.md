# Dashboard & Analytics

The Dashboard tab gives you an at-a-glance view of your home's activity. It opens on the Overview KPI cards and includes panels for trends, hourly distributions, room breakdowns, quiet-hours monitoring, and more.

![Dashboard showing KPI cards, Quiet Hours Activity, Daily Activity, Events by Hour, and Events by Room with a Customize toggle in the top-right](../screenshots/dashboard-lite-page.png)

## Customizing the layout

Click **Customize** (top-right of the Dashboard) to enter edit mode. While editing:

- **Drag** a panel by its header to reorder it
- **Drag the corner** of a panel to resize it
- **Click ✕** on a panel to hide it — hidden panels move to the panel tray

To re-add a hidden panel, open the **+ Add** tray and click the panel you want to restore. Click **Done** (or **Reset** to restore the factory default layout) to exit edit mode.

The layout is saved per account on the server and mirrored to `localStorage`, so it follows you across browsers when you are signed in. On mobile (below 1024 px), the grid collapses to a single column regardless of layout.

## Default panels

These 12 panels are shown out of the box. The first time you open the Dashboard you will see them all; hide any you don't use.

| Panel | Description |
|-------|-------------|
| **Overview** | KPI cards: today's event count, weekly total, top device, and busiest room |
| **Quiet Hours** | Accessories that fired events inside your configured quiet-hours window (also labelled "Quiet Hours Activity" in the panel header) |
| **Daily Activity** | Event-count trend line with 7 d / 30 d / 90 d range picker |
| **Events by Hour** | Hourly event distribution across the day (last 30 days, local time) |
| **Events by Room** | Per-room event counts ranked highest first, with 7 d / 30 d / 90 d range |
| **Most Active Devices** | Ranked list of your busiest accessories with room labels and event counts |
| **Weekly Pattern** | Weekday heatmap showing which days of the week are most active |
| **Monthly Activity** | Monthly bar chart of event totals |
| **Live Activity** | Real-time stream of the most recent events |
| **Rooms** | Room summary cards with event counts and activity status |
| **Active Outliers** | Accessories behaving unusually compared to their own baseline |
| **Stale Devices** | Accessories that have gone silent beyond the configured stale threshold |

## Optional panels

These 12 panels start hidden and can be added from the **+ Add** tray at any time.

| Panel | Description |
|-------|-------------|
| **Week over Week** | Compares event totals for the current week against the previous week |
| **Device Health** | Overview of connection and error status across all paired accessories |
| **Alerts Summary** | Recent alert rule matches and delivery outcomes |
| **Top Movers** | Accessories with the largest change in event frequency |
| **Day vs Night** | Breakdown of daytime versus nighttime event volume |
| **Quiet Hours Score** | A rolling score reflecting how often events occur in your quiet-hours window |
| **Room Trends** | Per-room trend lines over time |
| **Sensor Environment** | Readings from temperature, humidity, and air-quality sensors |
| **Battery Levels** | Battery percentage for accessories that report it |
| **Recent Episodes** | Timeline episodes grouped by the scene-capture window |
| **Retention Health** | Event table size, archive status, and next sweep estimate |
| **Event Types** | Breakdown of events by characteristic type (motion, contact, brightness, etc.) |
