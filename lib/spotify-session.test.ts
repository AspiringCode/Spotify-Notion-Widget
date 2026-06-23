import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import {
  getSpotifyUserAccessToken,
  sealSpotifySession,
  setSpotifyTokenResponseCookies,
  unsealSpotifySession
} from "./spotify-session";

describe("setSpotifyTokenResponseCookies", () => {
  it("attaches Spotify auth cookies to the returned response", () => {
    const response = new NextResponse("ok");

    setSpotifyTokenResponseCookies(response, {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: 123456789
    });

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("spotify_access_token=access-token");
    expect(setCookie).toContain("spotify_refresh_token=refresh-token");
    expect(setCookie).toContain("spotify_expires_at=123456789");
  });
});

describe("Spotify sealed sessions", () => {
  it("round-trips Spotify tokens without exposing the raw token in the session string", () => {
    const session = sealSpotifySession(
      {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: 9999999999999
      },
      "test-secret"
    );

    expect(session).not.toContain("access-token");
    expect(session).not.toContain("refresh-token");
    expect(unsealSpotifySession(session, "test-secret")).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: 9999999999999
    });
  });

  it("returns null for tampered sealed sessions", () => {
    const session = sealSpotifySession(
      {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: 9999999999999
      },
      "test-secret"
    );

    const parts = session.split(".");
    const encrypted = parts[3];
    parts[3] = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;

    expect(unsealSpotifySession(parts.join("."), "test-secret")).toBeNull();
  });

  it("can read the access token from a bearer session request", async () => {
    const originalClientId = process.env.SPOTIFY_CLIENT_ID;
    const originalClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    process.env.SPOTIFY_CLIENT_ID = "client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "test-secret";

    try {
      const session = sealSpotifySession({
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: Date.now() + 60_000
      });
      const request = new Request("https://example.com/api/auth/status", {
        headers: { Authorization: `Bearer ${session}` }
      });

      await expect(getSpotifyUserAccessToken(request)).resolves.toBe("access-token");
    } finally {
      if (originalClientId === undefined) {
        delete process.env.SPOTIFY_CLIENT_ID;
      } else {
        process.env.SPOTIFY_CLIENT_ID = originalClientId;
      }

      if (originalClientSecret === undefined) {
        delete process.env.SPOTIFY_CLIENT_SECRET;
      } else {
        process.env.SPOTIFY_CLIENT_SECRET = originalClientSecret;
      }
    }
  });
});
