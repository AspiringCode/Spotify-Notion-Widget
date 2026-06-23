import { NextResponse } from "next/server";
import { skipSpotifyTrack } from "@/lib/spotify";
import { getSpotifyUserAccessToken } from "@/lib/spotify-session";

export async function POST(request: Request) {
  const accessToken = await getSpotifyUserAccessToken(request);

  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await request.json()) as { direction?: string };
  const direction = body.direction;

  if (direction !== "next" && direction !== "previous") {
    return NextResponse.json({ error: "direction must be next or previous" }, { status: 400 });
  }

  try {
    await skipSpotifyTrack(accessToken, direction);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Skip failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
