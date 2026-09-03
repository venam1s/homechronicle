---
title: Customizable Dashboard Panels
trigger_condition: When device categories are implemented and stable — category-based stats endpoints exist and category assignment (auto + override) is working in production
planted_date: 2026-04-16
---

## Idea

Let users build a personalized dashboard by selecting which panels appear and in what order. Each panel is a self-contained analytics widget (category summary, room chart, device trend, heatmap, anomaly alerts, etc.).

## Why wait

- Device categories need to land first — they define the set of available category-specific panels
- The current fixed dashboard layout works fine for now
- Panel system adds complexity (layout persistence, responsive grid, drag-and-drop) that isn't justified until there are enough panel types to make customization worthwhile

## When to revisit

- Device category analytics are live and users are engaging with them
- There are 6+ distinct panel types available
- Users request the ability to hide/rearrange dashboard sections
