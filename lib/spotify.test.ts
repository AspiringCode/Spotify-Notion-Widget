import { describe, expect, it } from "vitest";
import {
  buildPlaybackQueue,
  buildPlaybackPlan,
  buildSpotifyAuthorizeUrl,
  mapSpotifyTrack,
  requireSpotifyCredentials,
  requireSpotifyOAuthConfig
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
