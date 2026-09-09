import { NextRequest, NextResponse } from "next/server";
import { readCounters, storageMode } from "@/lib/analytics";
import { probeStore } from "@/lib/cache";

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

  // ?probe=1 actually exercises the store and reports what went wrong.
  const probe = req.nextUrl.searchParams.get("probe") === "1" ? await probeStore() : undefined;

  return NextResponse.json({
    // "memory" means these numbers are one instance's view and will not add up.
    storage: storageMode(),
    ...(probe ? { probe } : {}),
    ...totals,
    // The addresses themselves are an implementation detail of the count.
    distinctAddresses: seen.length,
  });
}
