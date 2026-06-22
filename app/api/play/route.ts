import { NextResponse } from "next/server";
import { addSpotifyTrackToQueue, getSpotifyRecommendations, startSpotifyPlayback } from "@/lib/spotify";
import { getSpotifyUserAccessToken } from "@/lib/spotify-session";

type PlayRequest = {
  selectedTrackId?: string;
  selectedTrackUri?: string;
};

export async function POST(request: Request) {
  const accessToken = await getSpotifyUserAccessToken();

  if (!accessToken) {
    return NextResponse.json({ error: "Connect Spotify before starting playback." }, { status: 401 });
  }

  const body = (await request.json()) as PlayRequest;
  const selectedTrackId = body.selectedTrackId?.trim();
  const selectedTrackUri = body.selectedTrackUri?.trim();

  if (!selectedTrackId || !selectedTrackUri) {
    return NextResponse.json({ error: "Select a track before starting playback." }, { status: 400 });
  }

  try {
    await startSpotifyPlayback(accessToken, [selectedTrackUri]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message.includes("403") ? 403 : message.includes("404") ? 404 : 502;

    return NextResponse.json(
      {
        error:
          status === 403
            ? "Spotify refused playback control. Confirm this account has Premium."
            : status === 404
              ? "Open Spotify on one of your devices first, then try again."
              : "Spotify playback could not be started."
      },
      { status }
    );
  }

  let queued = 0;
  try {
    const recommendations = await getSpotifyRecommendations(accessToken, selectedTrackId, 10);
    for (const track of recommendations) {
      await addSpotifyTrackToQueue(accessToken, track.uri);
      queued++;
    }
  } catch {
    // queue is best-effort; playback already started successfully
  }

  return NextResponse.json({ playing: true, queued });
}
