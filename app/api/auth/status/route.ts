import { NextResponse } from "next/server";
import { getSpotifyProfile } from "@/lib/spotify";
import { getSpotifyUserAccessToken } from "@/lib/spotify-session";

export async function GET() {
  try {
    const accessToken = await getSpotifyUserAccessToken();

    if (!accessToken) {
      return NextResponse.json({ connected: false });
    }

    const profile = await getSpotifyProfile(accessToken);

    return NextResponse.json({
      connected: true,
      displayName: profile.display_name ?? profile.id,
      product: profile.product,
      premium: profile.product === "premium"
    });
  } catch {
    return NextResponse.json({ connected: false }, { status: 401 });
  }
}
