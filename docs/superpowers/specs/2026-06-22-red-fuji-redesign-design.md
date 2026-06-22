# Red Fuji Redesign + Spotify Radio Queue

*2026-06-22 — Spotify Notion Widget*

## Overview

Two coordinated changes: replace the current green-tinted UI with a Hokusai "Red Fuji" color theme, and replace the visible-search-results queue with a Spotify Recommendations-powered radio queue.

---

## Section 1 — Visual Redesign

### Color Palette

| Token | Value | Usage |
|---|---|---|
| Sky Blue (top) | `#1E3560` → `#4A6A9A` | Gradient top |
| Mountain Red (bottom) | `#8B3A22` → `#B5401E` → `#7A2010` | Gradient bottom |
| Snow Cream | `#F0EAE0` | Primary text |
| Cloud Cream | `#E8D49A` | Secondary labels, borders |
| Amber | `#D4885A` | Accent, hover states, active indicators |
| Terracotta | `#B5401E` | Buttons, active track border |
| Forest Dark | `#1C2E18` | (not used directly; absorbed by gradient) |

### Widget Shell

- Background: `linear-gradient(175deg, #1E3560 0%, #2C4A78 18%, #4A6A9A 38%, #8B3A22 65%, #B5401E 80%, #7A2010 100%)`
- Cloud stripe texture: `repeating-linear-gradient` with `rgba(232,212,154,0.04)` horizontal bands over the top 140px
- Amber mountain glow: `radial-gradient(ellipse 90% 60% at 50% 110%, rgba(212,136,90,0.35))` at the bottom

### Layout Changes

- **Album art**: full-width block, `height: 200px`, `border-radius: 12px` — fills most of the player panel
- **Playback status message strip**: removed entirely from JSX and state
- **`useAlbumColor` hook**: removed — the gradient is static, not album-reactive
- **`--album-rgb` CSS variable**: removed from shell style and globals.css

### CSS Replacements

Complete replacement of `app/globals.css`. Key rules:

- `.widget-shell`: gradient background + cloud/glow pseudo-elements
- `.track-result`: `background: rgba(0,0,0,0.18)`, cream text, amber secondary
- `.track-result[data-active=true]`: terracotta border + `rgba(181,64,30,0.3)` fill
- `.search-form input`: dark translucent, cream placeholder
- `.search-form button`, `.secondary-button`: terracotta fill, cream text
- `.selected-track img`: full-width, 200px tall, rounded
- Divider between panels: `rgba(232,212,154,0.2)` vertical line

---

## Section 2 — Spotify Radio Queue

### New Function — `lib/spotify.ts`

```ts
getSpotifyRecommendations(accessToken: string, seedTrackId: string, limit = 10): Promise<Track[]>
```

- Calls `GET /v1/recommendations?seed_tracks=<id>&limit=10&market=US`
- Uses the user's OAuth access token (already available in the play route)
- Returns mapped `Track[]` using existing `mapSpotifyTrack`
- Throws on non-OK response (caller handles gracefully)

### Updated Route — `app/api/play/route.ts`

Flow when a track is clicked:

1. Get user access token (existing)
2. Start playback of selected track via `startSpotifyPlayback` (existing)
3. Call `getSpotifyRecommendations(accessToken, selectedTrackId, 10)`
4. For each recommended track URI, call `addSpotifyTrackToQueue` (existing)
5. Return `{ playing: true, queued: <count> }`

If step 3 or 4 fails, catch the error and return `{ playing: true, queued: 0 }` — playback always takes priority over queueing.

### Removed Logic

- `buildPlaybackPlan` / `buildPlaybackQueue` are no longer called from the route
- The `tracks` field is removed from the `PlayRequest` type and from the client-side `fetch` body in `page.tsx`
- `buildPlaybackPlan` and `buildPlaybackQueue` remain in `lib/spotify.ts` since they are covered by unit tests — removing them is out of scope

---

## Files Changed

| File | Change |
|---|---|
| `app/globals.css` | Full replacement with Red Fuji theme |
| `app/page.tsx` | Remove `useAlbumColor`, `playbackMessage` state + strip; remove `tracks` from play fetch body; update album art markup |
| `lib/spotify.ts` | Add `getSpotifyRecommendations` |
| `app/api/play/route.ts` | Replace queue logic with recommendations; remove `tracks` from request type |

---

## Out of Scope

- Continuous polling / auto-refill queue (deferred, revisit after batch radio ships)
- "Up next" visible queue list in the widget
- Deployment / Vercel env setup
