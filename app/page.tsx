"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Track } from "@/lib/spotify";

type SearchState = "idle" | "loading" | "ready" | "empty" | "error";
type CompactView = "search" | "player";

type AuthStatus = {
  connected: boolean;
  displayName?: string;
  premium?: boolean;
  product?: string;
};

export default function App() {
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [state, setState] = useState<SearchState>("idle");
  const [error, setError] = useState("");
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ connected: false });
  const [compactView, setCompactView] = useState<CompactView>("search");

  useEffect(() => {
    void refreshAuthStatus();
  }, []);

  async function refreshAuthStatus() {
    try {
      const response = await fetch("/api/auth/status", { cache: "no-store" });
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
    setCompactView("player");

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

  async function skip(direction: "next" | "previous") {
    if (!authStatus.connected) return;
    try {
      await fetch("/api/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction })
      });
    } catch {
      // best-effort
    }
  }

  async function disconnectSpotify() {
    await fetch("/api/auth/logout", { method: "POST" });
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
              <a className="secondary-button" href="/api/auth/login">
                Connect Spotify
              </a>
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
          ✕
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
                ⏮ Previous
              </button>
              <button
                className="control-btn"
                type="button"
                aria-label="Next track"
                onClick={() => void skip("next")}
              >
                Next ⏭
              </button>
            </div>

            <iframe
              className="spotify-embed"
              title={`${selectedTrack.name} by ${selectedTrack.artists}`}
              src={`https://open.spotify.com/embed/track/${selectedTrack.id}`}
              width="100%"
              height="152"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
            />
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
