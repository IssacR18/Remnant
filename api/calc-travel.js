const HUB_LAT = Number(process.env.HUB_LAT);
const HUB_LNG = Number(process.env.HUB_LNG);
const ORS_KEY = process.env.ORS_API_KEY;

function toDollars(value) {
  return Math.round(value * 100) / 100;
}

function computeTravelFee(miles) {
  let fee = 0;
  if (miles > 10) {
    const stepA = Math.min(miles, 30) - 10;
    if (stepA > 0) fee += stepA * 1.25;
  }
  if (miles > 30) {
    const stepB = Math.min(miles, 60) - 30;
    if (stepB > 0) fee += stepB * 1.75;
  }
  if (miles > 60) {
    const stepC = miles - 60;
    fee += stepC * 2.25 + 50;
  }
  return toDollars(fee);
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return {};
  }
}

function respond(res, status, payload) {
  res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return respond(res, 405, { error: "Only POST allowed" });
  }

  try {
    const body = await readJsonBody(req);
    const rawAddress = typeof body?.address === "string" ? body.address.trim() : "";
    if (!rawAddress) {
      return respond(res, 400, { error: "Missing address" });
    }

    if (!ORS_KEY || Number.isNaN(HUB_LAT) || Number.isNaN(HUB_LNG)) {
      return respond(res, 500, { error: "Server is not configured" });
    }

    const geocodeUrl = new URL("https://api.openrouteservice.org/geocode/search");
    geocodeUrl.searchParams.set("api_key", ORS_KEY);
    geocodeUrl.searchParams.set("text", rawAddress);

    const geocodeRes = await fetch(geocodeUrl.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    const geocodeJson = await geocodeRes.json().catch(() => ({}));
    const coords = geocodeJson?.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      return respond(res, 422, { error: "Unable to geocode address" });
    }
    const [destLng, destLat] = coords;

    const directionsRes = await fetch("https://api.openrouteservice.org/v2/directions/driving-car", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: ORS_KEY,
        Accept: "application/json"
      },
      body: JSON.stringify({
        coordinates: [
          [HUB_LNG, HUB_LAT],
          [destLng, destLat]
        ],
        units: "mi"
      }),
      cache: "no-store"
    });
    const directionsJson = await directionsRes.json().catch(() => ({}));
    const miles = directionsJson?.routes?.[0]?.summary?.distance;
    if (typeof miles !== "number" || !Number.isFinite(miles)) {
      return respond(res, 422, { error: "Unable to compute driving distance" });
    }

    const distanceMiles = toDollars(miles);
    const travelFee = computeTravelFee(distanceMiles);
    return respond(res, 200, { distanceMiles, travelFee });
  } catch (error) {
    console.error("calc-travel fatal:", error);
    return respond(res, 500, { error: "Server error" });
  }
}
