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

function mapPlayerState(data: SpotifyPlayerState) {
  if (!data.item) {
    return { active: false };
  }

  return {
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
  };
}

export async function GET(request: Request) {
  const accessToken = await getSpotifyUserAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ active: false }, { status: 401 });
  }

  const res = await fetch("https://api.spotify.com/v1/me/player", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    return NextResponse.json({ active: false }, { status: res.status });
  }

  if (res.ok) {
    const data = (await res.json()) as SpotifyPlayerState;
    if (data.item) {
      return NextResponse.json(mapPlayerState(data));
    }
  }

  if (res.status !== 204 && res.status !== 200) {
    return NextResponse.json({ active: false });
  }

  const currentlyPlaying = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (currentlyPlaying.status === 401 || currentlyPlaying.status === 403) {
    return NextResponse.json({ active: false }, { status: currentlyPlaying.status });
  }

  if (currentlyPlaying.status === 204 || !currentlyPlaying.ok) {
    return NextResponse.json({ active: false });
  }

  const currentData = (await currentlyPlaying.json()) as SpotifyPlayerState;
  return NextResponse.json(mapPlayerState(currentData));
}
