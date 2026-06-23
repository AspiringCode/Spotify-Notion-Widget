import { NextResponse } from "next/server";
import { exchangeSpotifyCodeForToken, requireSpotifyCredentials, verifySpotifyOAuthState } from "@/lib/spotify";
import { setSpotifyTokenResponseCookies } from "@/lib/spotify-session";

function closePopupResponse(origin: string, status: "connected" | "token-error") {
  const escapedOrigin = JSON.stringify(origin);
  const message = status === "connected" ? "Spotify connected. You can close this window." : "Spotify connection failed.";

  return new NextResponse(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Spotify ${status === "connected" ? "Connected" : "Connection Failed"}</title>
    <style>
      body {
        align-items: center;
        background: #121212;
        color: #f4efe7;
        display: flex;
        font-family: Arial, sans-serif;
        justify-content: center;
        min-height: 100vh;
        margin: 0;
      }
      main {
        max-width: 320px;
        padding: 24px;
        text-align: center;
      }
      a { color: #1ed760; }
    </style>
  </head>
  <body>
    <main>
      <h1>${message}</h1>
      <p>If this window does not close automatically, return to your Notion embed.</p>
      <p><a href="/?spotify=${status}">Open the widget</a></p>
    </main>
    <script>
      if (window.opener) {
        window.opener.postMessage({ type: "spotify-${status}" }, ${escapedOrigin});
      }
      window.close();
    </script>
  </body>
</html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}

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
    const response = closePopupResponse(origin, "connected");
    setSpotifyTokenResponseCookies(response, token);

    return response;
  } catch {
    return closePopupResponse(origin, "token-error");
  }
}
