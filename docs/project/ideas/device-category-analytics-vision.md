---
title: Device Category Analytics Vision
date: 2026-04-16
context: /gsd-explore session — analytics dashboard brainstorming
---

## Problem

Current analytics slice data by **room** or **individual device**, but there's no grouping by device function (security, climate, cleaning, lighting, etc.). Users can't answer questions like "how active are my security devices?" or "how often did cleaning robots run this week?"

## Decision: Auto-categorize with user overrides

- **Auto-categorization** from HAP service_type and Matter cluster data as the default starting point
- **User overrides** allowed because HomeKit service types are coarse — a humidity sensor and a leak detector may both report as generic "sensor"
- Categories stored separately from protocol data so overrides persist across re-pairing

## Analytics Views

- **Category summary row** — high-level cards per category (event counts, trends, status)
- **Mini-dashboards per category** — dedicated charts and patterns for security, climate, cleaning, etc.
- These views are the building blocks for the longer-term customizable dashboard

## Long-term Vision

The ultimate goal is a **customizable dashboard with selectable panels**. Users pick which category panels, charts, and summaries appear on their dashboard. Device categories are the foundation — the panel system comes later once categories are stable.
