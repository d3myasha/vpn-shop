import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "vpn-shop",
    timestamp: new Date().toISOString()
  });
}
