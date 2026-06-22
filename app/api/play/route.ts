import { NextResponse } from "next/server";
import { addSpotifyTrackToQueue, buildPlaybackPlan, startSpotifyPlayback } from "@/lib/spotify";
import { getSpotifyUserAccessToken } from "@/lib/spotify-session";

type PlayRequest = {
  selectedTrackId?: string;
  tracks?: Array<{
    id: string;
    uri: string;
  }>;
};

export async function POST(request: Request) {
  const accessToken = await getSpotifyUserAccessToken();

  if (!accessToken) {
    return NextResponse.json({ error: "Connect Spotify before starting playback." }, { status: 401 });
  }

  const body = (await request.json()) as PlayRequest;
  const selectedTrackId = body.selectedTrackId?.trim();
  const tracks = body.tracks ?? [];

  if (!selectedTrackId || !tracks.length) {
    return NextResponse.json({ error: "Select a track before starting playback." }, { status: 400 });
  }

  const playbackPlan = buildPlaybackPlan(selectedTrackId, tracks);

  if (!playbackPlan) {
    return NextResponse.json({ error: "No playable Spotify track URIs were provided." }, { status: 400 });
  }

  try {
    await startSpotifyPlayback(accessToken, [playbackPlan.startUri]);

    for (const uri of playbackPlan.queueUris) {
      await addSpotifyTrackToQueue(accessToken, uri);
    }

    return NextResponse.json({
      playing: true,
      queued: playbackPlan.queueUris.length
    });
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
}
