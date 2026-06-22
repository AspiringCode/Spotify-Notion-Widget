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
  refresh_token?: string;
  scope?: string;
};

type CredentialsEnv = Record<string, string | undefined>;

type SpotifyCredentials = {
  clientId: string;
  clientSecret: string;
};

type SpotifyOAuthConfig = SpotifyCredentials & {
  redirectUri: string;
};

type AuthorizeUrlOptions = {
  clientId: string;
  redirectUri: string;
  state: string;
};

type PlaybackTrack = Pick<Track, "id" | "uri">;

export type SpotifyUserToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

export type SpotifyProfile = {
  id: string;
  display_name?: string;
  product?: "free" | "open" | "premium";
};

export const SPOTIFY_PLAYBACK_SCOPES = ["user-modify-playback-state", "user-read-playback-state"];

let cachedToken: { value: string; expiresAt: number } | null = null;

export function requireSpotifyCredentials(env: CredentialsEnv = process.env): SpotifyCredentials {
  const clientId = env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = env.SPOTIFY_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error("Missing Spotify credentials. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.");
  }

  return { clientId, clientSecret };
}

export function requireSpotifyOAuthConfig(env: CredentialsEnv = process.env): SpotifyOAuthConfig {
  const { clientId, clientSecret } = requireSpotifyCredentials(env);
  const redirectUri = env.SPOTIFY_REDIRECT_URI?.trim();

  if (!redirectUri) {
    throw new Error("Missing Spotify OAuth configuration. Set SPOTIFY_REDIRECT_URI.");
  }

  return { clientId, clientSecret, redirectUri };
}

export function buildSpotifyAuthorizeUrl({ clientId, redirectUri, state }: AuthorizeUrlOptions): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SPOTIFY_PLAYBACK_SCOPES.join(" "),
    redirect_uri: redirectUri,
    state
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export function buildPlaybackQueue(selectedTrackId: string, tracks: PlaybackTrack[]): string[] {
  const selectedIndex = tracks.findIndex((track) => track.id === selectedTrackId);
  const orderedTracks = selectedIndex >= 0 ? [...tracks.slice(selectedIndex), ...tracks.slice(0, selectedIndex)] : tracks;
  const seen = new Set<string>();

  return orderedTracks
    .map((track) => track.uri)
    .filter((uri) => {
      if (!uri || seen.has(uri)) {
        return false;
      }

      seen.add(uri);
      return true;
    });
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

export async function exchangeSpotifyCodeForToken(code: string): Promise<SpotifyUserToken> {
  const { clientId, clientSecret, redirectUri } = requireSpotifyOAuthConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri
  });
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Spotify authorization code exchange failed with status ${response.status}`);
  }

  const token = (await response.json()) as SpotifyTokenResponse;
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + Math.max(token.expires_in - 60, 0) * 1000
  };
}

export async function refreshSpotifyUserToken(refreshToken: string): Promise<SpotifyUserToken> {
  const { clientId, clientSecret } = requireSpotifyCredentials();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Spotify token refresh failed with status ${response.status}`);
  }

  const token = (await response.json()) as SpotifyTokenResponse;
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? refreshToken,
    expiresAt: Date.now() + Math.max(token.expires_in - 60, 0) * 1000
  };
}

export async function getSpotifyProfile(accessToken: string): Promise<SpotifyProfile> {
  const response = await fetch("https://api.spotify.com/v1/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Spotify profile request failed with status ${response.status}`);
  }

  return (await response.json()) as SpotifyProfile;
}

export async function startSpotifyPlayback(accessToken: string, uris: string[], deviceId?: string): Promise<void> {
  if (!uris.length) {
    throw new Error("No Spotify track URIs were provided for playback.");
  }

  const params = new URLSearchParams();

  if (deviceId) {
    params.set("device_id", deviceId);
  }

  const endpoint = `https://api.spotify.com/v1/me/player/play${params.size ? `?${params.toString()}` : ""}`;
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ uris }),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Spotify playback request failed with status ${response.status}`);
  }
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
