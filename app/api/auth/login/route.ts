import { NextResponse } from "next/server";
import { buildSpotifyAuthorizeUrl, createSpotifyOAuthState, requireSpotifyOAuthConfig } from "@/lib/spotify";

export async function GET() {
  try {
    const { clientId, clientSecret, redirectUri } = requireSpotifyOAuthConfig();
    const state = createSpotifyOAuthState(clientSecret);

    return NextResponse.redirect(buildSpotifyAuthorizeUrl({ clientId, redirectUri, state }));
  } catch {
    return NextResponse.redirect(new URL("/?spotify=oauth-missing-config", process.env.SPOTIFY_REDIRECT_URI ?? "http://localhost:3000"));
  }
}
