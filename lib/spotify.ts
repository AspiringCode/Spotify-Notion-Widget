export type Track = {
  id: string;
  name: string;
  artists: string;
  album: string;
  image: string;
  spotifyUrl: string;
  uri: string;
};

type SpotifyImage = {
  url: string;
  width?: number;
  height?: number;
};

export type SpotifyTrackItem = {
  id: string;
  name: string;
  uri: string;
  external_urls: {
    spotify?: string;
  };
  artists: Array<{
    name: string;
  }>;
  album: {
    name: string;
    images: SpotifyImage[];
  };
};

type SpotifySearchResponse = {
  tracks?: {
    items?: SpotifyTrackItem[];
  };
};

type SpotifyTokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
};

type CredentialsEnv = Record<string, string | undefined>;

type SpotifyCredentials = {
  clientId: string;
  clientSecret: string;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

export function requireSpotifyCredentials(env: CredentialsEnv = process.env): SpotifyCredentials {
  const clientId = env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = env.SPOTIFY_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error("Missing Spotify credentials. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.");
  }

  return { clientId, clientSecret };
}

export function mapSpotifyTrack(track: SpotifyTrackItem): Track {
  return {
    id: track.id,
    name: track.name,
    artists: track.artists.map((artist) => artist.name).filter(Boolean).join(", ") || "Unknown artist",
    album: track.album.name,
    image: track.album.images[0]?.url ?? "",
    spotifyUrl: track.external_urls.spotify ?? `https://open.spotify.com/track/${track.id}`,
    uri: track.uri
  };
}

export async function getSpotifyAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const { clientId, clientSecret } = requireSpotifyCredentials();
  const body = new URLSearchParams({ grant_type: "client_credentials" });
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    throw new Error(`Spotify token request failed with status ${response.status}`);
  }

  const token = (await response.json()) as SpotifyTokenResponse;
  cachedToken = {
    value: token.access_token,
    expiresAt: Date.now() + Math.max(token.expires_in - 60, 0) * 1000
  };

  return token.access_token;
}

export async function searchSpotifyTracks(query: string): Promise<Track[]> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return [];
  }

  const token = await getSpotifyAccessToken();
  const params = new URLSearchParams({
    q: trimmedQuery,
    type: "track",
    limit: "8",
    market: "US"
  });

  const response = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    next: { revalidate: 30 }
  });

  if (!response.ok) {
    throw new Error(`Spotify search failed with status ${response.status}`);
  }

  const data = (await response.json()) as SpotifySearchResponse;
  return (data.tracks?.items ?? []).map(mapSpotifyTrack);
}
