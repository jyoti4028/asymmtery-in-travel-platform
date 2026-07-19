# Asymmetry in Travel Platforms: A Trip Guarantee Fraud Simulator

## The Problem

Online travel platforms like MakeMyTrip offer a "Trip Guarantee" add-on for waitlisted train tickets — if your ticket doesn't get confirmed by the time IRCTC prepares the final chart, the platform refunds up to 3x the ticket price.

This creates an **information asymmetry exploit**. IRCTC's chart-preparation status is often visible to a user (via a second device, IRCTC's own app, or PNR-status tools) *before* the travel platform's own system reflects that same update. A user can:

1. Check the real-time PNR status directly on IRCTC.
2. See the ticket is still waitlisted just minutes before chart preparation.
3. Purchase Trip Guarantee on the platform — which is still relying on stale, cached ticket data — locking in a guaranteed 3x payout on an outcome they already know.

The platform is effectively selling insurance on an event whose outcome the buyer can already observe. This project simulates that vulnerability end-to-end, and then fixes it.

## What This Project Demonstrates

- How a caching layer between a source-of-truth system (IRCTC) and a consumer platform (MakeMyTrip) can become a fraud vector if purchase decisions are made against stale cached data instead of live data.
- A working exploit: fetch → cache goes stale → chart is prepared upstream → guarantee purchase still succeeds against the cache.
- A fix: purchase decisions re-verify against the live source at the moment of purchase, closing the timing window entirely.

## Architecture

```
┌─────────────────────────┐         ┌──────────────────────────────┐
│   IRCTC Source Server    │◄────────│  Travel Platform Aggregator   │
│   (port 3012)             │  fetch  │  (port 4000)                  │
│                            │         │                                │
│  Source of truth for:     │         │  - Caches ticket data          │
│  - PNR status              │         │  - Sells Trip Guarantee        │
│  - chartPrepared flag      │         │  - VULNERABLE: trusts cache    │
│  - /prepare-chart (admin)  │         │    at purchase time            │
└─────────────────────────┘         └──────────────────────────────┘
```

- **`irctc-source.js`** — the ground-truth server. Holds ticket records (`pnr`, `status`, `chartPrepared`, `price`, `passenger`). Exposes a read endpoint and an admin endpoint that simulates chart preparation (flips waitlisted tickets to cancelled).
- **`mmt-aggregator.js`** — the vulnerable platform layer. Caches ticket data on first fetch, serves cached data on repeat fetches, and — critically — makes the Trip Guarantee purchase decision using that cache instead of live data.

## The Exploit, Step by Step

1. `GET /api/platform/ticket/:pnr` → fresh fetch from IRCTC, ticket is `waitlisted`, `chartPrepared: false`. Result is cached.
2. Admin/scheduler calls `POST /api/source/admin/prepare-chart` on the IRCTC server. The real ticket is now `cancelled`, `chartPrepared: true`.
3. The platform's cache is untouched — it still thinks the ticket is `waitlisted`, `chartPrepared: false`.
4. `POST /api/platform/buy-trip-gurantee` → passes the stale-cache check → guarantee is sold on a ticket that, in reality, no longer qualifies (or does qualify, but the platform had no way of confirming it at the moment of sale).

This mirrors the real-world pattern: the user's "second device" check *is* step 2 happening from their point of view — they know the real state before the platform's cache does.

## The Fix

The corrected purchase endpoint (`/api/platform/buy-trip-gurantee-secure`, or however you name the fixed version) does **not** read from the cache at decision time. Instead, on every purchase attempt it:

1. Makes a live call to `GET /api/source/ticket/:pnr` on the IRCTC server.
2. Bases the approve/deny decision solely on that live response.
3. Returns only the final outcome to the passenger (`"Trip Guarantee purchased"` or `"Ticket is waitlisted — guarantee unavailable"` / whatever messaging you choose) — never exposing the intermediate real-time check, so the passenger can't infer anything they didn't already know from the source itself.

This removes the timing window entirely: there's no cache to be stale, because the decision is made against ground truth every single time.

## Known Simplifications

- In-memory "databases" — no persistence, resets on server restart.
- No authentication on the admin `/prepare-chart` route (acceptable for a local simulator; would need protecting in a real system).
- Casing/spelling of status strings (`waitlisted`, `cancelled`) is not yet enforced by a shared constant/enum across both servers — worth refactoring if this grows.
- No TTL on the vulnerable cache; staleness is currently unbounded rather than time-based, which is a simplification of real-world caching behavior.

## How to Run

```bash
# Terminal 1 — start the source of truth
node irctc-source.js
# → running on http://localhost:3012

# Terminal 2 — start the platform aggregator
node mmt-aggregator.js
# → running on http://localhost:4000
```

### Reproducing the exploit

```bash
# 1. Fetch and cache the ticket (still waitlisted)
curl http://localhost:4000/api/platform/ticket/PNR1234567890

# 2. Prepare the chart on the source server (ticket is now cancelled upstream)
curl -X POST http://localhost:3012/api/source/admin/prepare-chart

# 3. Buy Trip Guarantee — succeeds against stale cache, despite step 2
curl -X POST http://localhost:4000/api/platform/buy-trip-gurantee \
  -H "Content-Type: application/json" \
  -d '{"pnr": "PNR1234567890"}'
```

## Future Work

- [ ] Build the secure purchase endpoint that re-verifies live before approving.
- [ ] Add timestamps (`chartPreparedAt`, `cachedAt`) to quantify the real staleness window.
- [ ] Add a fraud-detection layer: log purchase-time vs. chart-prep-time deltas, flag purchases made suspiciously close to chart time.
- [ ] Write up the mechanism-design angle (adverse selection from asynchronous information sources) as a short case study.
- [ ] Add automated tests that assert the vulnerable endpoint fails and the fixed endpoint succeeds under the same exploit script.

## Motivation

This project started from observing that MakeMyTrip's Trip Guarantee feature can remain purchasable right up until chart preparation, while IRCTC's own PNR status is often visible earlier through other channels. It's built purely as a local simulator to study and document the vulnerability class — not to exploit any live system.
