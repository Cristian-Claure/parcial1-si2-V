import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({
    status: "UP",
    service: "velora-api",
    stack: "nextjs"
  });
}