import { NextRequest, NextResponse } from "next/server";
import { readCounters } from "@/lib/analytics";

export const runtime = "nodejs";

/**
 * Usage totals, for us — not a public dashboard.
 *
 * Protected by a shared secret so the numbers cannot be scraped, inflated in
 * someone's screenshot, or used to infer what is being checked. With no secret
 * configured the route stays closed rather than defaulting to open, because a
 * forgotten environment variable should not silently publish anything.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.STATS_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "Stats are not configured." }, { status: 404 });
  }

  const provided =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    req.nextUrl.searchParams.get("token");

  if (provided !== expected) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { seen, ...totals } = await readCounters();

  return NextResponse.json({
    ...totals,
    // The addresses themselves are an implementation detail of the count.
    distinctAddresses: seen.length,
  });
}
