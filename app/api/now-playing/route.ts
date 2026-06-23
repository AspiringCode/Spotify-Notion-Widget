import { NextResponse } from "next/server";
import { getSpotifyUserAccessToken } from "@/lib/spotify-session";

type SpotifyPlayerState = {
  item?: {
    id: string;
    name: string;
    uri: string;
    duration_ms: number;
    artists: Array<{ name: string }>;
    album: { name: string; images: Array<{ url: string }> };
    external_urls: { spotify?: string };
  };
  progress_ms?: number;
  is_playing?: boolean;
};

export async function GET() {
  const accessToken = await getSpotifyUserAccessToken();
  if (!accessToken) {
    return NextResponse.json({ active: false }, { status: 401 });
  }

  const res = await fetch("https://api.spotify.com/v1/me/player", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  // 204 = no active player open
  if (res.status === 204 || !res.ok) {
    return NextResponse.json({ active: false });
  }

  const data = (await res.json()) as SpotifyPlayerState;
  if (!data.item) {
    return NextResponse.json({ active: false });
  }

  return NextResponse.json({
    active: true,
    isPlaying: data.is_playing ?? false,
    progressMs: data.progress_ms ?? 0,
    track: {
      id: data.item.id,
      name: data.item.name,
      uri: data.item.uri,
      durationMs: data.item.duration_ms,
      artists: data.item.artists.map((a) => a.name).filter(Boolean).join(", ") || "Unknown artist",
      album: data.item.album.name,
      image: data.item.album.images[0]?.url ?? "",
      spotifyUrl: data.item.external_urls.spotify ?? `https://open.spotify.com/track/${data.item.id}`,
    },
  });
}
