import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildSpotifyAuthorizeUrl, requireSpotifyOAuthConfig } from "@/lib/spotify";
import { OAUTH_STATE_COOKIE } from "@/lib/spotify-session";

export async function GET() {
  try {
    const { clientId, redirectUri } = requireSpotifyOAuthConfig();
    const state = crypto.randomUUID();
    const store = await cookies();

    store.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10 * 60
    });

    return NextResponse.redirect(buildSpotifyAuthorizeUrl({ clientId, redirectUri, state }));
  } catch {
    return NextResponse.redirect(new URL("/?spotify=oauth-missing-config", process.env.SPOTIFY_REDIRECT_URI ?? "http://localhost:3000"));
  }
}
