import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { exchangeSpotifyCodeForToken } from "@/lib/spotify";
import { OAUTH_STATE_COOKIE, setSpotifyTokenCookies } from "@/lib/spotify-session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const origin = url.origin;
  const store = await cookies();
  const expectedState = store.get(OAUTH_STATE_COOKIE)?.value;

  if (error) {
    return NextResponse.redirect(new URL(`/?spotify=${encodeURIComponent(error)}`, origin));
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/?spotify=auth-state-error", origin));
  }

  try {
    const token = await exchangeSpotifyCodeForToken(code);
    await setSpotifyTokenCookies(token);
    store.delete(OAUTH_STATE_COOKIE);

    return NextResponse.redirect(new URL("/?spotify=connected", origin));
  } catch {
    return NextResponse.redirect(new URL("/?spotify=token-error", origin));
  }
}
