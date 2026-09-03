---
title: Design device category system
date: 2026-04-16
priority: medium
---

## Task

Design the device category system — auto-categorization logic, user override storage, and category-based analytics endpoints.

## Scope

1. **Auto-categorization mapping** — define how HAP service_type and Matter cluster_id map to categories (security, climate, cleaning, lighting, locks, etc.)
2. **Override storage** — extend JsonObjectStore (or new store) to persist user category assignments per accessory_id
3. **Category resolution** — logic that checks for user override first, falls back to auto-detected category
4. **Stats endpoints** — new `/api/stats/categories` endpoint(s) returning event counts, trends, and breakdowns grouped by category
5. **UI components** — category summary cards and per-category mini-dashboard views

## Notes

- HAP service types are coarse — multiple distinct device functions may share the same service_type
- Matter clusters are more granular and may produce better auto-categorization
- Consider a "custom" or "uncategorized" bucket for devices that don't match known mappings
