---
phase: 06-router-extraction-setup
plan: "02"
subsystem: listener/test
tags: [testing, integration-tests, setup-router, tst-05]
dependency_graph:
  requires: ["06-01"]
  provides: ["TST-05"]
  affects: ["listener/test/setup-router.integration.test.js"]
tech_stack:
  added: []
  patterns: ["mock-pool integration test pattern", "live-getter cache state-change test (D-14)"]
key_files:
  created:
    - listener/test/setup-router.integration.test.js
  modified: []
decisions:
  - "Used live getter closure (getDiscoveryCache: () => cache) pattern for D-14 state-change test — mutable variable updated between invocations confirms router calls getter on each request, not at construction"
  - "Added setHeader() to invoke() mock res object to handle routes that call res.setHeader()"
  - "MockHttpClient defined as named class at module level for reuse across pairing/repair/bridge-children tests"
metrics:
  duration_minutes: 5
  completed: "2026-04-02"
  tasks_completed: 1
  files_created: 1
  files_modified: 0
---

# Phase 06 Plan 02: Setup Router Integration Tests Summary

**One-liner:** 35-test integration suite for setup-router covering all 18 route handlers, with novel discovery cache state-change test (D-14) and mocked HttpClient for pairing/repair/bridge-children routes.

## What Was Built

Created `listener/test/setup-router.integration.test.js` with 35 integration tests covering every route in `setup-router.js`:

- **GET /discovered** (2 tests): returns accessories with paired status merged from pairings; returns empty list on empty cache
- **GET /discovered (D-14 cache state-change)** (1 test): mutable cache variable changes between two invocations — confirms router calls `getDiscoveryCache()` live, not snapshot at construction
- **POST /scan** (2 tests): success path returns scan results; failure returns 502 with cached accessories and warning message
- **POST /pair** (4 tests): success path calls savePairings and startSubscribers; missing deviceId returns 400; unknown deviceId returns 404; non-homekit protocol returns 400
- **GET /bridge-children/:deviceId** (2 tests): returns child accessories (skipping aid:1 bridge); 404 for unknown pairing
- **GET /pairings** (1 test): returns array with correct shape (id, protocol, name, address, port, category, pairedAt)
- **DELETE /pairing/:deviceId** (3 tests): success calls savePairings and stopSubscriber; 404 for unknown; 400 for non-HomeKit
- **POST /repair/:deviceId** (3 tests): success calls resetSubscriberStats, stopSubscriber, startSubscribers; 404 for unknown device; 404 with code NOT_FOUND_NETWORK when not on network
- **POST /add-pairing** (2 tests): missing sourcePairings returns 400; no HomeKit entries returns 400
- **PATCH /room** (3 tests): sets room; clears room on empty roomName; 400 on missing accessoryId
- **GET /rooms** (1 test): returns rooms object
- **PATCH /display-name** (3 tests): set, clear, missing accessoryId 400
- **GET /display-names** (1 test): returns display names object
- **PATCH /note** (3 tests): set, clear, missing accessoryId 400
- **GET /notes** (1 test): returns notes object
- **GET /log-level** (1 test): returns level string
- **PATCH /log-level** (2 tests): sets valid level; rejects invalid level with 400

All 241 listener tests pass (35 new + 206 existing).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. Tests wire all data via factory injection; no placeholder/stub data flows to assertions.

## Self-Check: PASSED

- `listener/test/setup-router.integration.test.js` exists: FOUND
- Commit `8be2b80` exists: FOUND
- `npm test` passes with 241/241: CONFIRMED
