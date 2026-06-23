import { NextResponse } from "next/server";
import { resumeSpotifyPlayback } from "@/lib/spotify";
import { getSpotifyUserAccessToken } from "@/lib/spotify-session";

export async function POST() {
  const accessToken = await getSpotifyUserAccessToken();

  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    await resumeSpotifyPlayback(accessToken);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Resume failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
