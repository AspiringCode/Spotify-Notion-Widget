import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import { setSpotifyTokenResponseCookies } from "./spotify-session";

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
