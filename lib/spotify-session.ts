import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { refreshSpotifyUserToken, requireSpotifyCredentials, type SpotifyUserToken } from "./spotify";

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

function getSessionEncryptionKey(secret = requireSpotifyCredentials().clientSecret) {
  return createHash("sha256").update(secret).digest();
}

export function sealSpotifySession(token: SpotifyUserToken, secret?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getSessionEncryptionKey(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(token), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url")
  ].join(".");
}

export function unsealSpotifySession(session: string, secret?: string): SpotifyUserToken | null {
  const [version, ivPart, tagPart, encryptedPart] = session.split(".");

  if (version !== "v1" || !ivPart || !tagPart || !encryptedPart) {
    return null;
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getSessionEncryptionKey(secret),
      Buffer.from(ivPart, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, "base64url")),
      decipher.final()
    ]);
    const token = JSON.parse(decrypted.toString("utf8")) as SpotifyUserToken;

    if (!token.accessToken || !token.refreshToken || typeof token.expiresAt !== "number") {
      return null;
    }

    return token;
  } catch {
    return null;
  }
}

function getBearerSession(request?: Request): string | null {
  const authorization = request?.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim() || null;
}

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

export async function getSpotifyUserAccessToken(request?: Request): Promise<string | null> {
  const bearerSession = getBearerSession(request);

  if (bearerSession) {
    const token = unsealSpotifySession(bearerSession);

    if (!token) {
      return null;
    }

    if (token.expiresAt > Date.now()) {
      return token.accessToken;
    }

    const refreshedToken = await refreshSpotifyUserToken(token.refreshToken!);
    return refreshedToken.accessToken;
  }

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
