import { NextResponse } from "next/server";

const HUB_LAT = Number(process.env.HUB_LAT);
const HUB_LNG = Number(process.env.HUB_LNG);
const ORS_KEY = process.env.ORS_API_KEY!;

type ORSGeocode = {
  features?: Array<{
    geometry?: { coordinates?: [number, number] };
  }>;
};

type ORSDirections = {
  routes?: Array<{
    summary?: { distance?: number };
  }>;
};

function dollars(n: number) {
  return Math.round(n * 100) / 100;
}

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
    const { address } = await req.json();
    if (!address || typeof address !== "string") {
      return NextResponse.json({ error: "Missing address" }, { status: 400 });
    }
    if (!ORS_KEY || Number.isNaN(HUB_LAT) || Number.isNaN(HUB_LNG)) {
      return NextResponse.json({ error: "Server is not configured" }, { status: 500 });
    }

    const geocodeUrl = new URL("https://api.openrouteservice.org/geocode/search");
    geocodeUrl.searchParams.set("api_key", ORS_KEY);
    geocodeUrl.searchParams.set("text", address);

    const gRes = await fetch(geocodeUrl.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const gJson = (await gRes.json()) as ORSGeocode;

    const coords = gJson?.features?.[0]?.geometry?.coordinates;
    if (!coords) {
      return NextResponse.json({ error: "Unable to geocode address" }, { status: 422 });
    }
    const [destLng, destLat] = coords;

    const dRes = await fetch("https://api.openrouteservice.org/v2/directions/driving-car", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: ORS_KEY,
        Accept: "application/json",
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

    const dJson = (await dRes.json()) as ORSDirections;
    const miles = dJson?.routes?.[0]?.summary?.distance;
    if (typeof miles !== "number" || !isFinite(miles)) {
      return NextResponse.json(
        { error: "Unable to compute driving distance" },
        { status: 422 }
      );
    }

    const distanceMiles = Math.round(miles * 100) / 100;
    const travelFee = computeTravelFee(distanceMiles);

    return NextResponse.json({ distanceMiles, travelFee });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Server error", detail: String(err?.message || err) },
      { status: 500 }
    );
  }
}
