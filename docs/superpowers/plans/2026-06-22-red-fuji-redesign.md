# Red Fuji Redesign + Spotify Radio Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current green-accented UI with a Hokusai "Red Fuji" sky-to-mountain gradient theme, and replace the visible-search-results queue with Spotify's Recommendations API so clicking a track auto-queues 10 similar tracks.

**Architecture:** Four isolated changes in dependency order: add the new `getSpotifyRecommendations` helper (tested in isolation), update the play route to call it, strip the UI state that's no longer needed from the page component, then replace globals.css entirely.

**Tech Stack:** Next.js 14 App Router, TypeScript, Vitest, Spotify Web API

---

## File Map

| File | Change |
|---|---|
| `lib/spotify.ts` | Add `getSpotifyRecommendations` export |
| `lib/spotify.test.ts` | Add tests for `getSpotifyRecommendations` |
| `app/api/play/route.ts` | Replace queue-from-visible-tracks with recommendations; remove `tracks` from request type |
| `app/page.tsx` | Remove `useAlbumColor`, `playbackMessage`, `useMemo`, `useRef`; send `selectedTrackUri` to play route; update album art markup |
| `app/globals.css` | Full replacement with Red Fuji theme |

---

## Task 1: Add `getSpotifyRecommendations` to lib/spotify.ts

**Files:**
- Modify: `lib/spotify.ts`
- Modify: `lib/spotify.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `lib/spotify.test.ts`:

```ts
import { vi, describe, it, expect, afterEach } from "vitest";
// add getSpotifyRecommendations to the existing import at the top:
// import { ..., getSpotifyRecommendations } from "./spotify";
```

Update the import at line 1 of `lib/spotify.test.ts` to include `getSpotifyRecommendations`:

```ts
import { vi, describe, expect, it, afterEach } from "vitest";
import {
  buildPlaybackQueue,
  buildPlaybackPlan,
  buildSpotifyAuthorizeUrl,
  getSpotifyRecommendations,
  mapSpotifyTrack,
  requireSpotifyCredentials,
  requireSpotifyOAuthConfig
} from "./spotify";
```

Then append these two `describe` blocks at the end of `lib/spotify.test.ts`:

```ts
describe("getSpotifyRecommendations", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns mapped tracks from the recommendations endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            tracks: [
              {
                id: "rec1",
                name: "Recommended Track",
                uri: "spotify:track:rec1",
                external_urls: { spotify: "https://open.spotify.com/track/rec1" },
                artists: [{ name: "Artist One" }],
                album: { name: "Album One", images: [{ url: "https://img.example.com/1" }] }
              }
            ]
          })
      })
    );

    const tracks = await getSpotifyRecommendations("test-token", "seed-track-id", 10);

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledOnce();
    const calledUrl = (fetchMock.mock.calls[0] as [string, RequestInit])[0];
    expect(calledUrl).toContain("seed_tracks=seed-track-id");
    expect(calledUrl).toContain("limit=10");
    const calledInit = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    expect(calledInit?.headers).toMatchObject({ Authorization: "Bearer test-token" });

    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      id: "rec1",
      name: "Recommended Track",
      artists: "Artist One",
      uri: "spotify:track:rec1"
    });
  });

  it("returns an empty array when the response contains no tracks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({})
      })
    );

    const tracks = await getSpotifyRecommendations("test-token", "seed-id");
    expect(tracks).toEqual([]);
  });

  it("throws when the recommendations endpoint returns a non-OK status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 })
    );

    await expect(getSpotifyRecommendations("bad-token", "seed-id")).rejects.toThrow("401");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: 3 new failures — `getSpotifyRecommendations is not a function` or similar.

- [ ] **Step 3: Add `getSpotifyRecommendations` to lib/spotify.ts**

Append the following export at the bottom of `lib/spotify.ts` (after `searchSpotifyTracks`):

```ts
export async function getSpotifyRecommendations(
  accessToken: string,
  seedTrackId: string,
  limit = 10
): Promise<Track[]> {
  const params = new URLSearchParams({
    seed_tracks: seedTrackId,
    limit: String(limit),
    market: "US"
  });

  const response = await fetch(
    `https://api.spotify.com/v1/recommendations?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(`Spotify recommendations request failed with status ${response.status}`);
  }

  const data = (await response.json()) as { tracks?: SpotifyTrackItem[] };
  return (data.tracks ?? []).map(mapSpotifyTrack);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: all 13 tests pass (10 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add lib/spotify.ts lib/spotify.test.ts
git commit -m "feat: add getSpotifyRecommendations helper"
```

---

## Task 2: Update the play route to use recommendations

**Files:**
- Modify: `app/api/play/route.ts`

- [ ] **Step 1: Replace the route**

Replace the entire content of `app/api/play/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { addSpotifyTrackToQueue, getSpotifyRecommendations, startSpotifyPlayback } from "@/lib/spotify";
import { getSpotifyUserAccessToken } from "@/lib/spotify-session";

type PlayRequest = {
  selectedTrackId?: string;
  selectedTrackUri?: string;
};

export async function POST(request: Request) {
  const accessToken = await getSpotifyUserAccessToken();

  if (!accessToken) {
    return NextResponse.json({ error: "Connect Spotify before starting playback." }, { status: 401 });
  }

  const body = (await request.json()) as PlayRequest;
  const selectedTrackId = body.selectedTrackId?.trim();
  const selectedTrackUri = body.selectedTrackUri?.trim();

  if (!selectedTrackId || !selectedTrackUri) {
    return NextResponse.json({ error: "Select a track before starting playback." }, { status: 400 });
  }

  try {
    await startSpotifyPlayback(accessToken, [selectedTrackUri]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message.includes("403") ? 403 : message.includes("404") ? 404 : 502;

    return NextResponse.json(
      {
        error:
          status === 403
            ? "Spotify refused playback control. Confirm this account has Premium."
            : status === 404
              ? "Open Spotify on one of your devices first, then try again."
              : "Spotify playback could not be started."
      },
      { status }
    );
  }

  let queued = 0;
  try {
    const recommendations = await getSpotifyRecommendations(accessToken, selectedTrackId, 10);
    for (const track of recommendations) {
      await addSpotifyTrackToQueue(accessToken, track.uri);
      queued++;
    }
  } catch {
    // queue is best-effort; playback already started successfully
  }

  return NextResponse.json({ playing: true, queued });
}
```

- [ ] **Step 2: Verify the build still passes**

```bash
npm run build 2>&1 | tail -20
```

Expected: compiled successfully, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/play/route.ts
git commit -m "feat: replace visible-track queue with Spotify recommendations radio"
```

---

## Task 3: Update page.tsx

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Update the import line**

Replace line 3 of `app/page.tsx`:

```ts
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
```

With:

```ts
import { FormEvent, useEffect, useState } from "react";
```

- [ ] **Step 2: Remove `playbackMessage` state and `albumColor`**

In the `App` function body, remove these lines:

```ts
const [playbackMessage, setPlaybackMessage] = useState("");
const albumColor = useAlbumColor(selectedTrack?.image);
```

And remove the `shellStyle` memo:

```ts
const shellStyle = useMemo(
  () => ({
    "--album-rgb": albumColor
  }),
  [albumColor]
);
```

- [ ] **Step 3: Update `playTrack`**

Replace the entire `playTrack` function with:

```ts
async function playTrack(track: Track) {
  setSelectedTrack(track);

  if (!authStatus.connected) {
    return;
  }

  try {
    await fetch("/api/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedTrackId: track.id,
        selectedTrackUri: track.uri
      })
    });
  } catch {
    // best-effort; Spotify embed still loads
  }
}
```

- [ ] **Step 4: Update `disconnectSpotify`**

Replace the `disconnectSpotify` function with:

```ts
async function disconnectSpotify() {
  await fetch("/api/auth/logout", { method: "POST" });
  setAuthStatus({ connected: false });
}
```

- [ ] **Step 5: Update the JSX shell and player panel**

Replace the opening `<main>` tag:

```tsx
<main className="widget-shell" style={shellStyle as React.CSSProperties}>
```

With:

```tsx
<main className="widget-shell">
```

In the player panel, replace the entire `selectedTrack` block:

```tsx
{selectedTrack ? (
  <>
    <div className="selected-track">
      {selectedTrack.image ? (
        <img src={selectedTrack.image} alt={`${selectedTrack.album} album cover`} />
      ) : (
        <div className="cover-fallback" aria-hidden="true" />
      )}
      <div>
        <p className="eyebrow">Now embedded</p>
        <h2>{selectedTrack.name}</h2>
        <p>{selectedTrack.artists}</p>
      </div>
    </div>
    {playbackMessage ? <p className="playback-message">{playbackMessage}</p> : null}
    <iframe
      title={`${selectedTrack.name} by ${selectedTrack.artists}`}
      src={`https://open.spotify.com/embed/track/${selectedTrack.id}`}
      width="100%"
      height="152"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
    />
  </>
) : (
```

With:

```tsx
{selectedTrack ? (
  <>
    <div className="selected-track">
      {selectedTrack.image ? (
        <img src={selectedTrack.image} alt={`${selectedTrack.album} album cover`} />
      ) : (
        <div className="cover-fallback" aria-hidden="true" />
      )}
      <div>
        <p className="eyebrow">Now playing</p>
        <h2>{selectedTrack.name}</h2>
        <p>{selectedTrack.artists}</p>
      </div>
    </div>
    <iframe
      title={`${selectedTrack.name} by ${selectedTrack.artists}`}
      src={`https://open.spotify.com/embed/track/${selectedTrack.id}`}
      width="100%"
      height="152"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
    />
  </>
) : (
```

- [ ] **Step 6: Remove the `useAlbumColor` hook**

Delete the entire `useAlbumColor` function from the bottom of `app/page.tsx` (lines 290–346 in the original file — the function starting with `function useAlbumColor` through its closing `}`).

- [ ] **Step 7: Verify types**

```bash
npm run build 2>&1 | tail -20
```

Expected: compiled successfully, no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx
git commit -m "refactor: remove playback message strip and album color hook from page"
```

---

## Task 4: Replace globals.css with Red Fuji theme

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Replace the entire file**

Replace the full contents of `app/globals.css` with:

```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ── Shell ── */
.widget-shell {
  display: flex;
  height: 100vh;
  position: relative;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  overflow: hidden;
  background: linear-gradient(
    175deg,
    #1e3560 0%,
    #2c4a78 18%,
    #4a6a9a 38%,
    #8b3a22 65%,
    #b5401e 80%,
    #7a2010 100%
  );
}

/* Cloud stripe texture */
.widget-shell::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 140px;
  background: repeating-linear-gradient(
    0deg,
    transparent 0px,
    transparent 10px,
    rgba(232, 212, 154, 0.04) 10px,
    rgba(232, 212, 154, 0.04) 12px
  );
  pointer-events: none;
  z-index: 1;
}

/* Amber mountain glow */
.widget-shell::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 180px;
  background: radial-gradient(
    ellipse 90% 60% at 50% 110%,
    rgba(212, 136, 90, 0.35) 0%,
    transparent 70%
  );
  pointer-events: none;
  z-index: 1;
}

/* ── Panels ── */
.search-panel {
  position: relative;
  z-index: 2;
  flex: 1;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-right: 1px solid rgba(232, 212, 154, 0.15);
  overflow: hidden;
}

.player-panel {
  position: relative;
  z-index: 2;
  flex: 1;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

/* ── Brand ── */
.brand-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-mark {
  display: block;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, #e8d49a, #d4885a);
  flex-shrink: 0;
}

.eyebrow {
  font-size: 10px;
  color: rgba(232, 212, 154, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
}

h1 {
  font-size: 14px;
  font-weight: 700;
  color: #f0eae0;
  letter-spacing: 0.04em;
}

h2 {
  font-size: 18px;
  font-weight: 700;
  color: #f0eae0;
  line-height: 1.2;
}

/* ── Auth row ── */
.auth-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(232, 212, 154, 0.12);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 10px;
  color: rgba(232, 212, 154, 0.7);
}

.auth-row strong {
  color: #e8d49a;
}

.secondary-button {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: #f0eae0;
  background: #b5401e;
  border: none;
  border-radius: 5px;
  padding: 4px 10px;
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
  flex-shrink: 0;
}

.secondary-button:hover {
  background: #c94a22;
}

/* ── Search form ── */
.search-form {
  display: flex;
  gap: 6px;
}

.search-form input {
  flex: 1;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(232, 212, 154, 0.18);
  border-radius: 8px;
  padding: 8px 12px;
  color: #f0eae0;
  font-size: 12px;
  outline: none;
}

.search-form input::placeholder {
  color: rgba(240, 234, 224, 0.4);
}

.search-form input:focus {
  border-color: rgba(232, 212, 154, 0.35);
}

.search-form button {
  background: #b5401e;
  color: #f0eae0;
  border: none;
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  letter-spacing: 0.03em;
  white-space: nowrap;
}

.search-form button:hover:not(:disabled) {
  background: #c94a22;
}

.search-form button:disabled {
  opacity: 0.5;
  cursor: default;
}

/* ── Results ── */
.results {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  overflow-y: auto;
}

.track-result {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.05);
  cursor: pointer;
  width: 100%;
  text-align: left;
}

.track-result:hover {
  background: rgba(0, 0, 0, 0.28);
}

.track-result[data-active="true"] {
  background: rgba(181, 64, 30, 0.3);
  border-color: rgba(181, 64, 30, 0.5);
}

.track-result img,
.track-result .cover-fallback {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  flex-shrink: 0;
  object-fit: cover;
}

.track-result .cover-fallback {
  background: rgba(232, 212, 154, 0.1);
}

.track-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.track-copy strong {
  font-size: 11px;
  font-weight: 600;
  color: #f0eae0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-copy span {
  font-size: 10px;
  color: rgba(232, 212, 154, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Empty / loading states ── */
.empty-state {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 20px 0;
}

.empty-state strong {
  font-size: 12px;
  color: rgba(240, 234, 224, 0.7);
}

.empty-state span {
  font-size: 11px;
  color: rgba(232, 212, 154, 0.5);
}

.loading-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
}

.loading-row span {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  background: rgba(232, 212, 154, 0.08);
  flex-shrink: 0;
}

.loading-row div {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.loading-row i {
  display: block;
  height: 9px;
  border-radius: 4px;
  background: rgba(232, 212, 154, 0.08);
  width: 70%;
  font-style: normal;
}

.loading-row b {
  display: block;
  height: 8px;
  border-radius: 4px;
  background: rgba(232, 212, 154, 0.05);
  width: 45%;
  font-weight: normal;
}

/* ── Player panel — selected track ── */
.selected-track {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.selected-track img {
  width: 100%;
  height: 160px;
  object-fit: cover;
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  display: block;
}

.selected-track .cover-fallback {
  width: 100%;
  height: 160px;
  border-radius: 12px;
  background: rgba(232, 212, 154, 0.08);
  display: block;
}

.selected-track h2 {
  font-size: 20px;
}

.selected-track p {
  font-size: 12px;
  color: rgba(232, 212, 154, 0.7);
  margin-top: 2px;
}

/* ── Player panel — empty state ── */
.player-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  flex: 1;
  color: rgba(232, 212, 154, 0.4);
  font-size: 12px;
  text-align: center;
}

.disc {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 1px solid rgba(232, 212, 154, 0.12);
  background: radial-gradient(
    circle at 50% 50%,
    rgba(232, 212, 154, 0.12) 0%,
    rgba(232, 212, 154, 0.04) 30%,
    rgba(0, 0, 0, 0.15) 31%,
    rgba(0, 0, 0, 0.15) 100%
  );
}
```

- [ ] **Step 2: Start the dev server and verify visually**

```bash
npm run dev
```

Open `http://127.0.0.1:3000`. Confirm:
- Background shows indigo-sky-to-terracotta gradient
- No green anywhere
- Search panel has dark translucent track cards
- Player panel shows full-width album art when a track is selected
- No playback status message strip appears after clicking a track
- Spotify iframe renders below the track metadata

- [ ] **Step 3: Run tests**

```bash
npm test 2>&1 | tail -10
```

Expected: all 13 tests pass.

- [ ] **Step 4: Run build**

```bash
npm run build 2>&1 | tail -10
```

Expected: compiled successfully.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "feat: apply Red Fuji sky-to-mountain theme"
```
