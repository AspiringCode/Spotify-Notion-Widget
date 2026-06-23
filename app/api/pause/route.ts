import { NextResponse } from "next/server";
import { pauseSpotifyPlayback } from "@/lib/spotify";
import { getSpotifyUserAccessToken } from "@/lib/spotify-session";

export async function POST(request: Request) {
  const accessToken = await getSpotifyUserAccessToken(request);

  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    await pauseSpotifyPlayback(accessToken);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pause failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
