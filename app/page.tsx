"use client";

import React, { FormEvent, useEffect, useRef, useState } from "react";
import type { Track } from "@/lib/spotify";

type SearchState = "idle" | "loading" | "ready" | "empty" | "error";
type CompactView = "search" | "player";

type AuthStatus = {
  connected: boolean;
  displayName?: string;
  premium?: boolean;
  product?: string;
};

type NowPlayingData = {
  active: boolean;
  isPlaying?: boolean;
  progressMs?: number;
  track?: {
    id: string;
    name: string;
    uri: string;
    durationMs: number;
    artists: string;
    album: string;
    image: string;
    spotifyUrl: string;
  };
};

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export default function App() {
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [state, setState] = useState<SearchState>("idle");
  const [error, setError] = useState("");
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ connected: false });
  const [compactView, setCompactView] = useState<CompactView>("search");
  const [nowPlaying, setNowPlaying] = useState<NowPlayingData>({ active: false });
  const [localProgressMs, setLocalProgressMs] = useState(0);

  // Tracks the progress source of truth between polls
  const playbackSyncRef = useRef({ progressMs: 0, isPlaying: false, syncedAt: 0, durationMs: 0 });
  // Tracks which song the widget last selected so we don't re-set on every poll
  const currentTrackIdRef = useRef<string | null>(null);
  const authPopupRef = useRef<Window | null>(null);

  useEffect(() => {
    void refreshAuthStatus();
  }, []);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if ((event.data as { type?: string })?.type === "spotify-connected") {
        void refreshAuthStatus();
        authPopupRef.current?.close();
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Poll Spotify player every 2s — syncs track + progress with native app
  useEffect(() => {
    if (!authStatus.connected) return;

    async function poll() {
      try {
        const res = await fetch("/api/now-playing", { cache: "no-store", credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as NowPlayingData;
        setNowPlaying(data);

        if (data.active && data.track) {
          playbackSyncRef.current = {
            progressMs: data.progressMs ?? 0,
            isPlaying: data.isPlaying ?? false,
            syncedAt: Date.now(),
            durationMs: data.track.durationMs,
          };
          setLocalProgressMs(data.progressMs ?? 0);

          // Sync UI when native Spotify changes track (skip, auto-advance, etc.)
          if (data.track.id !== currentTrackIdRef.current) {
            currentTrackIdRef.current = data.track.id;
            setSelectedTrack({
              id: data.track.id,
              name: data.track.name,
              artists: data.track.artists,
              album: data.track.album,
              image: data.track.image,
              spotifyUrl: data.track.spotifyUrl,
              uri: data.track.uri,
            });
            setCompactView("player");
          }
        } else {
          playbackSyncRef.current = { ...playbackSyncRef.current, isPlaying: false };
        }
      } catch {
        // ignore network errors
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), 2000);
    return () => clearInterval(interval);
  }, [authStatus.connected]);

  // Smooth progress tick — interpolates between polls so the bar moves every 250ms
  useEffect(() => {
    const tick = setInterval(() => {
      const { progressMs, isPlaying, syncedAt, durationMs } = playbackSyncRef.current;
      if (isPlaying && durationMs > 0) {
        const elapsed = Date.now() - syncedAt;
        setLocalProgressMs(Math.min(progressMs + elapsed, durationMs));
      }
    }, 250);
    return () => clearInterval(tick);
  }, []);

  async function refreshAuthStatus() {
    try {
      const response = await fetch("/api/auth/status", { cache: "no-store", credentials: "include" });
      const data = (await response.json()) as AuthStatus;
      setAuthStatus(data);
    } catch {
      setAuthStatus({ connected: false });
    }
  }

  async function runSearch(nextQuery = query) {
    const trimmedQuery = nextQuery.trim();

    if (!trimmedQuery) {
      setTracks([]);
      setState("idle");
      setError("");
      return;
    }

    setState("loading");
    setError("");

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(trimmedQuery)}`);
      const data = (await response.json()) as { tracks?: Track[]; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Spotify search failed.");
      }

      const nextTracks = data.tracks ?? [];
      setTracks(nextTracks);
      setState(nextTracks.length ? "ready" : "empty");

      if (!selectedTrack && nextTracks[0]) {
        setSelectedTrack(nextTracks[0]);
      }
    } catch (searchError) {
      setTracks([]);
      setState("error");
      setError(searchError instanceof Error ? searchError.message : "Spotify search failed.");
    }
  }

  async function playTrack(track: Track) {
    setSelectedTrack(track);
    currentTrackIdRef.current = track.id;
    setCompactView("player");

    if (!authStatus.connected) {
      return;
    }

    try {
      const res = await fetch("/api/play", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedTrackId: track.id,
          selectedTrackUri: track.uri
        })
      });
      const data = (await res.json()) as { queued?: number; queueError?: string };
      if (data.queueError) console.warn("[widget] Queue error:", data.queueError);
    } catch {
      // best-effort
    }
  }

  async function skip(direction: "next" | "previous") {
    if (!authStatus.connected) return;
    try {
      await fetch("/api/skip", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction })
      });
    } catch {
      // best-effort
    }
  }

  async function pause() {
    if (!authStatus.connected) return;
    try {
      await fetch("/api/pause", { method: "POST", credentials: "include" });
      playbackSyncRef.current = { ...playbackSyncRef.current, isPlaying: false };
      setNowPlaying((current) => ({ ...current, isPlaying: false }));
    } catch {
      // best-effort
    }
  }

  async function resume() {
    if (!authStatus.connected) return;
    try {
      await fetch("/api/resume", { method: "POST", credentials: "include" });
      playbackSyncRef.current = { ...playbackSyncRef.current, isPlaying: true, syncedAt: Date.now() };
      setNowPlaying((current) => ({ ...current, isPlaying: true }));
    } catch {
      // best-effort
    }
  }

  async function togglePlayback() {
    if (nowPlaying.isPlaying) {
      await pause();
      return;
    }

    await resume();
  }

  function connectSpotify() {
    authPopupRef.current = window.open(
      "/api/auth/login",
      "spotify-auth",
      "popup=yes,width=520,height=720,menubar=no,toolbar=no,location=no,status=no"
    );

    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      void refreshAuthStatus();

      if (Date.now() - startedAt > 2 * 60 * 1000) {
        window.clearInterval(interval);
        void refreshAuthStatus();
      }
    }, 1500);
  }

  async function disconnectSpotify() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setAuthStatus({ connected: false });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSearch();
  }

  return (
    <main className="widget-shell" data-view={compactView}>
      <section className="search-panel" aria-label="Spotify track search">
        <div className="brand-row">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <p className="eyebrow">Notion Spotify Embed</p>
            <h1>Find a track</h1>
          </div>
        </div>

        <div className="auth-row">
          {authStatus.connected ? (
            <>
              <span>
                Connected as <strong>{authStatus.displayName ?? "Spotify user"}</strong>
                {authStatus.premium ? "" : " - Premium required for queue playback"}
              </span>
              <button className="secondary-button" type="button" onClick={disconnectSpotify}>
                Disconnect
              </button>
            </>
          ) : (
            <>
              <span>Connect Premium to start a real Spotify queue.</span>
              <button
                className="secondary-button"
                type="button"
                onClick={connectSpotify}
              >
                Connect Spotify
              </button>
            </>
          )}
        </div>

        <form className="search-form" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="spotify-search">
            Search Spotify
          </label>
          <input
            id="spotify-search"
            name="q"
            placeholder="Search Spotify..."
            value={query}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="submit" disabled={state === "loading"}>
            {state === "loading" ? "Searching" : "Search"}
          </button>
        </form>

        <div className="results" aria-live="polite">
          {state === "idle" ? (
            <EmptyState title="Try a song name" text='Search "Fein Travis Scott" to load a track.' />
          ) : null}

          {state === "loading" ? <LoadingRows /> : null}

          {state === "empty" ? (
            <EmptyState title="No tracks found" text="Try a different spelling or add the artist name." />
          ) : null}

          {state === "error" ? <EmptyState title="Search unavailable" text={error} /> : null}

          {state === "ready"
            ? tracks.map((track) => (
                <TrackResult
                  key={track.id}
                  track={track}
                  active={track.id === selectedTrack?.id}
                  onSelect={() => void playTrack(track)}
                />
              ))
            : null}
        </div>
      </section>

      <section className="player-panel" aria-label="Selected Spotify track">
        <button
          className="close-btn"
          type="button"
          aria-label="Back to search"
          onClick={() => setCompactView("search")}
        >
          X
        </button>

        {selectedTrack ? (
          <>
            <div className="selected-track">
              <div className="album-wrapper">
                {selectedTrack.image ? (
                  <img src={selectedTrack.image} alt={`${selectedTrack.album} album cover`} />
                ) : (
                  <div className="cover-fallback" aria-hidden="true" />
                )}
              </div>
              <div className="track-meta">
                <p className="eyebrow">Now playing</p>
                <h2>{selectedTrack.name}</h2>
                <p>{selectedTrack.artists}</p>
              </div>
            </div>

            <div className="player-controls">
              <button
                className="control-btn"
                type="button"
                aria-label="Previous track"
                onClick={() => void skip("previous")}
              >
                Previous
              </button>
              <button
                className="control-btn control-btn-primary"
                type="button"
                aria-label={nowPlaying.isPlaying ? "Pause playback" : "Resume playback"}
                onClick={() => void togglePlayback()}
              >
                {nowPlaying.isPlaying ? "Pause" : "Resume"}
              </button>
              <button
                className="control-btn"
                type="button"
                aria-label="Next track"
                onClick={() => void skip("next")}
              >
                Next
              </button>
            </div>

            {authStatus.connected ? (
              <div className="playback-bar">
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={
                      {
                        "--progress":
                          nowPlaying.active && nowPlaying.track
                            ? `${Math.min((localProgressMs / nowPlaying.track.durationMs) * 100, 100)}%`
                            : "0%",
                      } as React.CSSProperties
                    }
                  />
                </div>
                <div className="time-row">
                  <span>{nowPlaying.active ? formatMs(localProgressMs) : "--:--"}</span>
                  <span>{nowPlaying.track ? formatMs(nowPlaying.track.durationMs) : "--:--"}</span>
                </div>
              </div>
            ) : (
              <iframe
                className="spotify-embed"
                title={`${selectedTrack.name} by ${selectedTrack.artists}`}
                src={`https://open.spotify.com/embed/track/${selectedTrack.id}`}
                width="100%"
                height="152"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
              />
            )}
          </>
        ) : (
          <div className="player-empty">
            <div className="disc" aria-hidden="true" />
            <p>Select a result to load Spotify's player.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function TrackResult({
  track,
  active,
  onSelect
}: {
  track: Track;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button className="track-result" data-active={active} type="button" onClick={onSelect}>
      {track.image ? (
        <img src={track.image} alt={`${track.album} album cover`} />
      ) : (
        <span className="cover-fallback" aria-hidden="true" />
      )}
      <span className="track-copy">
        <strong>{track.name}</strong>
        <span>{track.artists}</span>
      </span>
    </button>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function LoadingRows() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="loading-row" key={index}>
          <span />
          <div>
            <i />
            <b />
          </div>
        </div>
      ))}
    </>
  );
}
