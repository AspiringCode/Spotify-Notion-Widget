import { NextResponse } from "next/server";
import { clearSpotifyTokenCookies } from "@/lib/spotify-session";

export async function POST() {
  await clearSpotifyTokenCookies();
  return NextResponse.json({ connected: false });
}
