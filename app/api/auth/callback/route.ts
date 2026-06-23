import { NextResponse } from "next/server";
import { exchangeSpotifyCodeForToken, requireSpotifyCredentials, verifySpotifyOAuthState } from "@/lib/spotify";
import { sealSpotifySession, setSpotifyTokenResponseCookies } from "@/lib/spotify-session";

function closePopupResponse(origin: string, status: "connected" | "token-error", session?: string) {
  const escapedOrigin = JSON.stringify(origin);
  const escapedSession = JSON.stringify(session ?? null);
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
        max-width: 520px;
        padding: 24px;
        text-align: center;
      }
      textarea {
        background: #050505;
        border: 1px solid #3a3a3a;
        border-radius: 10px;
        box-sizing: border-box;
        color: #f4efe7;
        font: 12px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace;
        height: 120px;
        margin-top: 12px;
        padding: 12px;
        resize: none;
        width: 100%;
      }
      button {
        background: #1ed760;
        border: 0;
        border-radius: 999px;
        color: #050505;
        cursor: pointer;
        font-weight: 700;
        margin-top: 12px;
        padding: 10px 18px;
      }
      a { color: #1ed760; }
    </style>
  </head>
  <body>
    <main>
      <h1>${message}</h1>
      ${
        session
          ? `<p>If the Notion embed does not switch to connected, copy this connection code and paste it into the widget.</p>
      <textarea id="connection-code" readonly>${session}</textarea>
      <button type="button" id="copy-code">Copy connection code</button>`
          : ""
      }
      <p>If this window does not close automatically, return to your Notion embed.</p>
      <p><a href="/?spotify=${status}">Open the widget</a></p>
    </main>
    <script>
      if (window.opener) {
        window.opener.postMessage({ type: "spotify-${status}", session: ${escapedSession} }, ${escapedOrigin});
      }
      var copyButton = document.getElementById("copy-code");
      var codeInput = document.getElementById("connection-code");
      if (copyButton && codeInput) {
        copyButton.addEventListener("click", function () {
          codeInput.select();
          navigator.clipboard.writeText(codeInput.value).then(function () {
            copyButton.textContent = "Copied";
          }).catch(function () {
            document.execCommand("copy");
            copyButton.textContent = "Copied";
          });
        });
      }
      window.setTimeout(function () {
        if (!document.hasFocus()) window.close();
      }, 1200);
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
    const session = sealSpotifySession(token);
    const response = closePopupResponse(origin, "connected", session);
    setSpotifyTokenResponseCookies(response, token);

    return response;
  } catch {
    return closePopupResponse(origin, "token-error");
  }
}
