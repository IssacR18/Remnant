import { NextResponse } from "next/server";

// ---- TEMP DEBUG START ----
function parseNumEnv(v?: string | null) {
  if (v == null) return NaN;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : NaN;
}

const HUB_LAT_RAW = process.env.HUB_LAT ?? null;
const HUB_LNG_RAW = process.env.HUB_LNG ?? null;
const ORS_KEY = process.env.ORS_API_KEY ?? "";

const HUB_LAT = parseNumEnv(HUB_LAT_RAW);
const HUB_LNG = parseNumEnv(HUB_LNG_RAW);
// ---- TEMP DEBUG END ----

type ORSGeocode = { features?: Array<{ geometry?: { coordinates?: [number, number] } }> };
type ORSDirections = { routes?: Array<{ summary?: { distance?: number } }> };

function dollars(n: number) { return Math.round(n * 100) / 100; }

function computeTravelFee(miles: number) {
  let fee = 0;
  if (miles > 10) {
    const a = Math.min(miles, 30) - 10;
    if (a > 0) fee += a * 1.25;
  }
  if (miles > 30) {
    const b = Math.min(miles, 60) - 30;
    if (b > 0) fee += b * 1.75;
  }
  if (miles > 60) {
    const c = miles - 60;
    fee += c * 2.25 + 50;
  }
  return dollars(fee);
}

export async function POST(req: Request) {
  try {
    // 1) Immediate config probe
    if (!ORS_KEY || Number.isNaN(HUB_LAT) || Number.isNaN(HUB_LNG)) {
      return NextResponse.json({
        error: "Server is not configured",
        missing: {
          HUB_LAT_isNaN: Number.isNaN(HUB_LAT),
          HUB_LNG_isNaN: Number.isNaN(HUB_LNG),
          ORS_API_KEY_empty: !ORS_KEY || ORS_KEY.trim() === "",
        },
        raw_examples: {
          HUB_LAT_RAW,
          HUB_LNG_RAW,
          ORS_KEY_present: Boolean(ORS_KEY),
        }
      }, { status: 500 });
    }

    // 2) Parse body
    const payload = await req.json().catch(() => ({} as any));
    const address = (payload?.address ?? "").trim();
    if (!address) {
      return NextResponse.json({ error: "Missing address" }, { status: 400 });
    }

    // 3) Geocode (with error detail)
    const geocodeUrl = new URL("https://api.openrouteservice.org/geocode/search");
    geocodeUrl.searchParams.set("api_key", ORS_KEY);
    geocodeUrl.searchParams.set("text", address);

    const gRes = await fetch(geocodeUrl.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const gText = await gRes.text();
    if (!gRes.ok) {
      return NextResponse.json({
        error: "Geocoding failed",
        status: gRes.status,
        detail: gText.slice(0, 1000),
      }, { status: 422 });
    }
    const gJson = JSON.parse(gText) as ORSGeocode;
    const coords = gJson?.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      return NextResponse.json({ error: "Unable to geocode address" }, { status: 422 });
    }
    const [destLng, destLat] = coords;

    // 4) Directions (with error detail)
    const dRes = await fetch("https://api.openrouteservice.org/v2/directions/driving-car", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: ORS_KEY,
      },
      body: JSON.stringify({
        coordinates: [
          [HUB_LNG, HUB_LAT],
          [destLng, destLat],
        ],
        units: "mi",
      }),
      cache: "no-store",
    });
    const dText = await dRes.text();
    if (!dRes.ok) {
      return NextResponse.json({
        error: "Directions failed",
        status: dRes.status,
        detail: dText.slice(0, 1000),
      }, { status: 422 });
    }
    const dJson = JSON.parse(dText) as ORSDirections;
    const miles = dJson?.routes?.[0]?.summary?.distance;

    if (typeof miles !== "number" || !Number.isFinite(miles)) {
      return NextResponse.json({ error: "Unable to compute driving distance", raw: dJson }, { status: 422 });
    }

    const distanceMiles = dollars(miles);
    const travelFee = computeTravelFee(distanceMiles);
    return NextResponse.json({ distanceMiles, travelFee });
  } catch (err: any) {
    return NextResponse.json({ error: "Server error", detail: String(err?.message || err) }, { status: 500 });
  }
}
