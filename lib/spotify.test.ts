import { vi, describe, expect, it, afterEach } from "vitest";
import {
  buildPlaybackQueue,
  buildPlaybackPlan,
  buildSpotifyAuthorizeUrl,
  getSpotifyRecommendations,
  createSpotifyOAuthState,
  mapSpotifyTrack,
  pauseSpotifyPlayback,
  requireSpotifyCredentials,
  requireSpotifyOAuthConfig,
  resumeSpotifyPlayback,
  verifySpotifyOAuthState
} from "./spotify";

describe("mapSpotifyTrack", () => {
  it("returns only the track fields the widget needs", () => {
    const track = mapSpotifyTrack({
      id: "3kloA9QgcSos6Z4gDaa947",
      name: "FE!N",
      uri: "spotify:track:3kloA9QgcSos6Z4gDaa947",
      external_urls: {
        spotify: "https://open.spotify.com/track/3kloA9QgcSos6Z4gDaa947"
      },
      artists: [{ name: "Travis Scott" }, { name: "Playboi Carti" }],
      album: {
        name: "UTOPIA",
        images: [
          { url: "https://i.scdn.co/image/large", width: 640, height: 640 },
          { url: "https://i.scdn.co/image/small", width: 64, height: 64 }
        ]
      }
    });

    expect(track).toEqual({
      id: "3kloA9QgcSos6Z4gDaa947",
      name: "FE!N",
      artists: "Travis Scott, Playboi Carti",
      album: "UTOPIA",
      image: "https://i.scdn.co/image/large",
      spotifyUrl: "https://open.spotify.com/track/3kloA9QgcSos6Z4gDaa947",
      uri: "spotify:track:3kloA9QgcSos6Z4gDaa947"
    });
  });

  it("falls back cleanly when album art is missing", () => {
    const track = mapSpotifyTrack({
      id: "missing-art",
      name: "Plain Track",
      uri: "spotify:track:missing-art",
      external_urls: { spotify: "https://open.spotify.com/track/missing-art" },
      artists: [],
      album: { name: "No Cover", images: [] }
    });

    expect(track.image).toBe("");
    expect(track.artists).toBe("Unknown artist");
  });
});

describe("requireSpotifyCredentials", () => {
  it("returns credentials when both values are present", () => {
    expect(
      requireSpotifyCredentials({
        SPOTIFY_CLIENT_ID: "client-id",
        SPOTIFY_CLIENT_SECRET: "client-secret"
      })
    ).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret"
    });
  });

  it("throws a setup error when a credential is missing", () => {
    expect(() => requireSpotifyCredentials({ SPOTIFY_CLIENT_ID: "client-id" })).toThrow(
      "Missing Spotify credentials"
    );
  });
});

describe("requireSpotifyOAuthConfig", () => {
  it("returns OAuth config when credentials and redirect URI are present", () => {
    expect(
      requireSpotifyOAuthConfig({
        SPOTIFY_CLIENT_ID: "client-id",
        SPOTIFY_CLIENT_SECRET: "client-secret",
        SPOTIFY_REDIRECT_URI: "http://127.0.0.1:3000/api/auth/callback"
      })
    ).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://127.0.0.1:3000/api/auth/callback"
    });
  });

  it("throws when the redirect URI is missing", () => {
    expect(() =>
      requireSpotifyOAuthConfig({
        SPOTIFY_CLIENT_ID: "client-id",
        SPOTIFY_CLIENT_SECRET: "client-secret"
      })
    ).toThrow("Missing Spotify OAuth configuration");
  });
});

describe("buildSpotifyAuthorizeUrl", () => {
  it("builds an authorization URL with playback scopes and state", () => {
    const url = new URL(
      buildSpotifyAuthorizeUrl({
        clientId: "client-id",
        redirectUri: "http://127.0.0.1:3000/api/auth/callback",
        state: "state-123"
      })
    );

    expect(url.origin + url.pathname).toBe("https://accounts.spotify.com/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:3000/api/auth/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("scope")).toContain("user-modify-playback-state");
    expect(url.searchParams.get("scope")).toContain("user-read-playback-state");
  });
});

describe("Spotify OAuth state", () => {
  it("creates and verifies a signed state token", () => {
    const state = createSpotifyOAuthState("state-secret", 1700000000000, "00000000-0000-0000-0000-000000000001");

    expect(verifySpotifyOAuthState(state, "state-secret", 1700000005000)).toBe(true);
  });

  it("rejects tampered or expired state tokens", () => {
    const state = createSpotifyOAuthState("state-secret", 1700000000000, "00000000-0000-0000-0000-000000000002");
    const tampered = state.replace(/.$/, "x");

    expect(verifySpotifyOAuthState(tampered, "state-secret", 1700000005000)).toBe(false);
    expect(verifySpotifyOAuthState(state, "state-secret", 1700000000000 + 11 * 60 * 1000)).toBe(false);
  });
});

describe("buildPlaybackQueue", () => {
  it("starts with the selected track and preserves the rest of the visible result order", () => {
    const tracks = [
      { id: "a", uri: "spotify:track:a" },
      { id: "b", uri: "spotify:track:b" },
      { id: "c", uri: "spotify:track:c" }
    ];

    expect(buildPlaybackQueue("b", tracks)).toEqual(["spotify:track:b", "spotify:track:c", "spotify:track:a"]);
  });

  it("deduplicates repeated track URIs", () => {
    const tracks = [
      { id: "a", uri: "spotify:track:a" },
      { id: "b", uri: "spotify:track:b" },
      { id: "a-copy", uri: "spotify:track:a" }
    ];

    expect(buildPlaybackQueue("a", tracks)).toEqual(["spotify:track:a", "spotify:track:b"]);
  });
});

describe("buildPlaybackPlan", () => {
  it("separates the selected track from the tracks to add to Spotify's queue", () => {
    const tracks = [
      { id: "a", uri: "spotify:track:a" },
      { id: "b", uri: "spotify:track:b" },
      { id: "c", uri: "spotify:track:c" }
    ];

    expect(buildPlaybackPlan("b", tracks)).toEqual({
      startUri: "spotify:track:b",
      queueUris: ["spotify:track:c", "spotify:track:a"]
    });
  });
});

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

    await expect(getSpotifyRecommendations("bad-token", "seed-id")).rejects.toThrow(
      "Spotify recommendations request failed with status 401"
    );
  });
});

describe("pauseSpotifyPlayback", () => {
  afterEach(() => vi.restoreAllMocks());

  it("pauses the current Spotify device", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    await pauseSpotifyPlayback("test-token");

    expect(fetch).toHaveBeenCalledWith("https://api.spotify.com/v1/me/player/pause", {
      method: "PUT",
      headers: { Authorization: "Bearer test-token" },
      cache: "no-store"
    });
  });

  it("throws when Spotify refuses to pause", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(pauseSpotifyPlayback("test-token")).rejects.toThrow(
      "Spotify pause failed with status 404"
    );
  });
});

describe("resumeSpotifyPlayback", () => {
  afterEach(() => vi.restoreAllMocks());

  it("resumes the current Spotify device", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    await resumeSpotifyPlayback("test-token");

    expect(fetch).toHaveBeenCalledWith("https://api.spotify.com/v1/me/player/play", {
      method: "PUT",
      headers: { Authorization: "Bearer test-token" },
      cache: "no-store"
    });
  });

  it("throws when Spotify refuses to resume", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(resumeSpotifyPlayback("test-token")).rejects.toThrow(
      "Spotify resume failed with status 404"
    );
  });
});
