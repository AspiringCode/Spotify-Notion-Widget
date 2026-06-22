import { describe, expect, it } from "vitest";
import { mapSpotifyTrack, requireSpotifyCredentials } from "./spotify";

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
