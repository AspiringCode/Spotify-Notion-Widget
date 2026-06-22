import { NextResponse } from "next/server";
import { searchSpotifyTracks } from "@/lib/spotify";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";

  if (!query.trim()) {
    return NextResponse.json({ tracks: [] });
  }

  try {
    const tracks = await searchSpotifyTracks(query);
    return NextResponse.json({ tracks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to search Spotify";
    const isSetupError = message.includes("Missing Spotify credentials");

    return NextResponse.json(
      {
        error: isSetupError
          ? "Spotify credentials are not configured on the server."
          : "Spotify search is temporarily unavailable."
      },
      { status: isSetupError ? 500 : 502 }
    );
  }
}
