import { NextResponse } from "next/server";
import { exchangeSpotifyCodeForToken, requireSpotifyCredentials, verifySpotifyOAuthState } from "@/lib/spotify";
import { setSpotifyTokenCookies } from "@/lib/spotify-session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const origin = url.origin;

  if (error) {
    return NextResponse.redirect(new URL(`/?spotify=${encodeURIComponent(error)}`, origin));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/?spotify=auth-state-error", origin));
  }

  const { clientSecret } = requireSpotifyCredentials();

  if (!verifySpotifyOAuthState(state, clientSecret)) {
    return NextResponse.redirect(new URL("/?spotify=auth-state-error", origin));
  }

  try {
    const token = await exchangeSpotifyCodeForToken(code);
    await setSpotifyTokenCookies(token);

    return NextResponse.redirect(new URL("/?spotify=connected", origin));
  } catch {
    return NextResponse.redirect(new URL("/?spotify=token-error", origin));
  }
}
