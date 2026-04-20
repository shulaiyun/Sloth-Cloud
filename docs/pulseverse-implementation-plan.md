# Pulseverse MVP Implementation Plan

## What is live in this workspace now

- New web route: `/pulseverse`
- New API route: `/api/v1/pulseverse/briefing`
- Product loop in place:
  - user picks a city anchor
  - user picks an emotion state
  - user sets a breath target
  - API returns an Earth pulse, cosmic window, session plan, live event set, and star-self growth card
  - web app renders the result as a usable MVP page

This first cut is intentionally narrow. It proves the service shape before we spend time on expensive integrations like XR scenes or wearable sync.

## Current architecture

### Frontend

- File: `apps/web/src/pages/PulseversePage.tsx`
- Data source: `useApiData('/api/v1/pulseverse/briefing?...')`
- Local helpers and contract mirror:
  - `apps/web/src/lib/pulseverse.ts`
- Route registration:
  - `apps/web/src/App.tsx`
  - `apps/web/src/components/AppShell.tsx`

### Backend

- Generator: `apps/api/src/lib/pulseverse.ts`
- Endpoint: `GET /api/v1/pulseverse/briefing`
- Purpose:
  - produce a stable briefing contract now
  - keep front and back aligned while real data providers are still being selected

## Why this is the right MVP slice

The real product thesis is not "show space beautifully". The thesis is:

1. turn a user's current bodily state into a short recovery ritual
2. connect that ritual to the user's actual location on Earth
3. extend the same moment outward into orbit, solar weather, and deep space
4. save the result as an identity artifact that makes return behavior natural

If this loop becomes sticky, we can layer richer data and richer rendering on top. If this loop is not sticky, no amount of XR polish will save it.

## Recommended phase order

### Phase 1: sharpen the nightly reset loop

Goal: make `/pulseverse` good enough that a tester wants to come back tomorrow night.

Ship next:

- session start / session complete flow with one-tap completion
- lightweight breathing animation and ambient audio timing
- saved recent sessions per user
- morning reflection and night streak tracking

### Phase 2: replace generated signals with real-world signals

Goal: move from believable mock resonance to actual world-coupled resonance.

Integrate:

- weather and air quality APIs
- tide or ocean condition APIs for coastal cities
- NASA Earthdata layers
- NASA Eyes or other astronomy event feeds
- optional sunrise/sunset and moon phase APIs

Suggested backend split:

- `pulseverse-earth.ts`
- `pulseverse-cosmos.ts`
- `pulseverse-session-engine.ts`

## Phase 3: body sync

Goal: make the user feel that the system is reading and responding to them, not just narrating at them.

Integrate:

- Apple Watch / HealthKit
- heart rate and HRV
- optional microphone-based breath cadence detection
- optional camera-based pulse or respiration estimation where supported

Rules:

- always degrade gracefully
- never block the experience on wearable ownership
- keep consent, privacy, and data retention explicit

## Phase 4: social peak events

Goal: create the first viral loop.

Build:

- live resonance nights
- rare event countdowns
- shared participant goals
- collectible star fragments for limited windows
- simple share cards that visualize one user's breathing trace and cosmic event

This is the likely first breakout mechanic.

## Phase 5: spatial computing

Goal: graduate the service from a mobile ritual into a new sensory medium.

Add:

- WebXR session renderer
- spatial sound field
- room-scale scene anchors
- dual-mode support: phone-first and headset-enhanced

Do this only after the nightly mobile habit is already working.

## Metrics to watch from day one

- D1 / D7 / D30 retention on nightly sessions
- average sessions per active user per week
- session completion rate
- share rate on live resonance events
- conversion from free to paid after 3 completed sessions
- number of users who complete 3 consecutive nights

## Suggested commercial packaging

- free:
  - limited nightly resets
  - basic live event access
- premium:
  - full session library
  - advanced star-self progression
  - couple / family resonance rooms
  - richer scene generation
- B2B:
  - museums
  - schools
  - wellness programs
  - hospitality spaces

## Immediate next coding tasks

1. add persistent session history to the API
2. add a real "start session" and "complete session" journey
3. attach ambient sound and timed stage transitions
4. replace at least one mock data source with a live provider
5. add lightweight auth-aware saving for star-self growth

## Non-goals right now

- building a heavy 3D engine before retention exists
- overfitting to headset-first usage
- turning the product into a passive astronomy feed
- making medical claims
