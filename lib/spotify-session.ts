import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { refreshSpotifyUserToken, type SpotifyUserToken } from "./spotify";

const ACCESS_TOKEN_COOKIE = "spotify_access_token";
const REFRESH_TOKEN_COOKIE = "spotify_refresh_token";
const EXPIRES_AT_COOKIE = "spotify_expires_at";
export const OAUTH_STATE_COOKIE = "spotify_oauth_state";

const isProduction = process.env.NODE_ENV === "production";

const cookieOptions = {
  httpOnly: true,
  sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
  secure: isProduction,
  path: "/"
};

export async function setSpotifyTokenCookies(token: SpotifyUserToken) {
  const store = await cookies();

  store.set(ACCESS_TOKEN_COOKIE, token.accessToken, {
    ...cookieOptions,
    maxAge: 60 * 60
  });

  if (token.refreshToken) {
    store.set(REFRESH_TOKEN_COOKIE, token.refreshToken, {
      ...cookieOptions,
      maxAge: 60 * 60 * 24 * 30
    });
  }

  store.set(EXPIRES_AT_COOKIE, String(token.expiresAt), {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 30
  });
}

export function setSpotifyTokenResponseCookies(response: NextResponse, token: SpotifyUserToken) {
  response.cookies.set(ACCESS_TOKEN_COOKIE, token.accessToken, {
    ...cookieOptions,
    maxAge: 60 * 60
  });

  if (token.refreshToken) {
    response.cookies.set(REFRESH_TOKEN_COOKIE, token.refreshToken, {
      ...cookieOptions,
      maxAge: 60 * 60 * 24 * 30
    });
  }

  response.cookies.set(EXPIRES_AT_COOKIE, String(token.expiresAt), {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 30
  });
}

export async function clearSpotifyTokenCookies() {
  const store = await cookies();

  store.delete(ACCESS_TOKEN_COOKIE);
  store.delete(REFRESH_TOKEN_COOKIE);
  store.delete(EXPIRES_AT_COOKIE);
  store.delete(OAUTH_STATE_COOKIE);
}

export async function getSpotifyUserAccessToken(): Promise<string | null> {
  const store = await cookies();
  const accessToken = store.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = store.get(REFRESH_TOKEN_COOKIE)?.value;
  const expiresAt = Number(store.get(EXPIRES_AT_COOKIE)?.value ?? 0);

  if (!accessToken || !refreshToken) {
    return null;
  }

  if (expiresAt > Date.now()) {
    return accessToken;
  }

  const refreshedToken = await refreshSpotifyUserToken(refreshToken);
  await setSpotifyTokenCookies(refreshedToken);

  return refreshedToken.accessToken;
}
