const SUPABASE_URL = "https://vtzwjjzmptokrxslfbra.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0endqanptcHRva3J4c2xmYnJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2NDk3OTIsImV4cCI6MjA3NjIyNTc5Mn0.g-iatnLPgDERvKcMahD545_qMdYIFDlLeylqtRMz2AM";
const sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

const STORAGE_KEY = "remnantOrderDraft";
const SUBMIT_COOLDOWN_MS = 3500;
const TOAST_DURATION_MS = 5200;
const AUTH_EVENT_NAME = "remnant:auth-state";
const PROGRESSIVE_FIELDS = [
  "priceConfig",
  "serviceAddress",
  "travel",
  "gateCodes",
  "scope",
  "date",
  "time",
  "addOns",
  "confirmAcknowledged",
  "stepIndex"
];

const PRICE_DEFAULTS = Object.freeze({
  sqft: 1500,
  environment: null,
  tier: null,
  rush: false
});

const PRICE_LIMITS = Object.freeze({
  sqft: { min: 100, max: 6000 }
});

const PRICE_ENVIRONMENT_MODIFIERS = Object.freeze({
  indoor: 0,
  outdoor: 0,
  both: 0.15
});

const PRICE_TIER_MODIFIERS = Object.freeze({
  basic: 0,
  realistic: 0.15,
  immersive: 0.3
});

const PRICE_RUSH_MODIFIER = 0.2;
const PRICE_BASE_FEE = 150;
const PRICE_SCAN_RATE = 0.5;
const PRICE_ANIMATION_DURATION_MS = 280;

const PRICE_ERROR_MESSAGES = Object.freeze({
  sqft: "Enter between 100 and 6,000 square feet."
});

const PRICE_DELIVERY_HINTS = Object.freeze({
  rush: "Rush Delivery: 24–48h (≤1000 sq ft), 2–3 days (1000–2500), 3–5 days (2500+)",
  standard: "Standard: ~5–7 business days (up to 10 for very large jobs)"
});

const travelConfig = (() => {
  const raw = window.__remnantTravelConfig ?? {};
  const parseNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    hubLat: parseNumber(raw.hubLat),
    hubLng: parseNumber(raw.hubLng),
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey.trim() : "",
    mode: raw.mode === "client" ? "client" : "auto"
  };
})();

const hasClientTravelConfig =
  Number.isFinite(travelConfig.hubLat) &&
  Number.isFinite(travelConfig.hubLng) &&
  Boolean(travelConfig.apiKey);

const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
};

const roundCurrency = (value, precision = 2) => {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const computeTravelFeeFromMiles = (miles) => {
  if (!Number.isFinite(miles)) return 0;
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
  return roundCurrency(fee, 2);
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);

const toTitleCase = (value) => {
  if (!value || typeof value !== "string") return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const toNumberOrDefault = (value, fallback) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const defaultPriceConfig = () => ({
  sqft: PRICE_DEFAULTS.sqft,
  environment: PRICE_DEFAULTS.environment,
  tier: PRICE_DEFAULTS.tier,
  rush: PRICE_DEFAULTS.rush
});

function estimatePrice(input = {}) {
  const rawSqft = toNumberOrDefault(input.sqft, PRICE_DEFAULTS.sqft);
  const selectedEnvironment =
    input.environment && input.environment in PRICE_ENVIRONMENT_MODIFIERS
      ? input.environment
      : null;
  const selectedTier =
    input.tier && input.tier in PRICE_TIER_MODIFIERS ? input.tier : null;
  const effectiveEnvironment = selectedEnvironment || "indoor";
  const effectiveTier = selectedTier || "basic";

  const config = {
    sqft: clamp(rawSqft, PRICE_LIMITS.sqft.min, PRICE_LIMITS.sqft.max),
    environment: selectedEnvironment,
    tier: selectedTier,
    rush: Boolean(input.rush)
  };

  const baseFee = PRICE_BASE_FEE;
  const scanFee = config.sqft * PRICE_SCAN_RATE;
  const subtotal = baseFee + scanFee;

  const modifiers = {
    environment: PRICE_ENVIRONMENT_MODIFIERS[effectiveEnvironment] || 0,
    tier: PRICE_TIER_MODIFIERS[effectiveTier] || 0,
    rush: config.rush ? PRICE_RUSH_MODIFIER : 0
  };

  const multiplier = roundCurrency(
    1 + modifiers.environment + modifiers.tier + modifiers.rush,
    3
  );
  const totalExact = roundCurrency(subtotal * multiplier, 2);
  const totalRounded = Math.round(totalExact);

  return {
    config,
    baseFee,
    scanFee,
    subtotal,
    modifiers,
    multiplier,
    totalExact,
    totalRounded
  };
}

const easeOutCubic = (t) => 1 - (1 - t) ** 3;

const ESTIMATE_TEST_CASES = [
  {
    name: "3500 sq ft · indoor · immersive · standard",
    input: {
      sqft: 3500,
      environment: "indoor",
      tier: "immersive",
      rush: false
    },
    expected: {
      baseFee: 150,
      scanFee: 1750,
      subtotal: 1900,
      multiplier: 1.3,
      totalExact: 2470,
      totalRounded: 2470
    }
  },
  {
    name: "2000 sq ft · both · realistic · standard",
    input: {
      sqft: 2000,
      environment: "both",
      tier: "realistic",
      rush: false
    },
    expected: {
      baseFee: 150,
      scanFee: 1000,
      subtotal: 1150,
      multiplier: 1.3,
      totalExact: 1495,
      totalRounded: 1495
    }
  },
  {
    name: "4000 sq ft · outdoor · basic · rush",
    input: {
      sqft: 4000,
      environment: "outdoor",
      tier: "basic",
      rush: true
    },
    expected: {
      baseFee: 150,
      scanFee: 2000,
      subtotal: 2150,
      multiplier: 1.2,
      totalExact: 2580,
      totalRounded: 2580
    }
  },
  {
    name: "800 sq ft · indoor · basic · standard",
    input: {
      sqft: 800,
      environment: "indoor",
      tier: "basic",
      rush: false
    },
    expected: {
      baseFee: 150,
      scanFee: 400,
      subtotal: 550,
      multiplier: 1,
      totalExact: 550,
      totalRounded: 550
    }
  }
];

const runEstimateTests = () => {
  if (runEstimateTests.hasRun) return;
  runEstimateTests.hasRun = true;
  ESTIMATE_TEST_CASES.forEach((test) => {
    const result = estimatePrice(test.input);
    const expected = test.expected;
    const almostEqual = (a, b, tolerance = 0.01) => Math.abs(a - b) <= tolerance;
    const pass =
      almostEqual(result.baseFee, expected.baseFee) &&
      almostEqual(result.scanFee, expected.scanFee) &&
      almostEqual(result.subtotal, expected.subtotal) &&
      almostEqual(result.totalExact, expected.totalExact) &&
      result.totalRounded === expected.totalRounded &&
      almostEqual(result.multiplier, expected.multiplier, 0.001);
    console.assert(pass, `[PriceEstimator] ${test.name} failed`, { result, expected });
  });
};
runEstimateTests.hasRun = false;

const selectors = {
  wizard: document.querySelector("[data-order-wizard]"),
  success: document.querySelector("[data-order-success]"),
  orderId: document.querySelector("[data-order-id]"),
  stepForm: document.querySelector("[data-step-form]"),
  progressSteps: Array.from(document.querySelectorAll("[data-progress-step]")),
  nextBtn: document.querySelector("[data-next]"),
  prevBtn: document.querySelector("[data-prev]"),
  odometer: document.querySelector("[data-odometer]"),
  reviewList: document.querySelector("[data-review-list]"),
  confirmCheckbox: document.querySelector("[data-confirm-checkbox]"),
  toastContainer: document.querySelector(".toast-container"),
  priceSummary: document.querySelector("[data-price-summary]"),
  priceValue: document.querySelector("[data-price-value]"),
  priceAmount: document.querySelector("[data-price-amount]"),
  priceExact: document.querySelector("[data-price-exact]"),
  priceBreakdown: document.querySelector("[data-price-breakdown]"),
  priceModifiers: document.querySelector("[data-price-modifiers]"),
  priceTimeline: document.querySelector("[data-price-timeline]"),
  addressInput: document.querySelector("[data-address-input]"),
  travelFeedback: document.querySelector("[data-travel-feedback]"),
  travelMessage: document.querySelector("[data-travel-message]"),
  travelRetry: document.querySelector("[data-travel-retry]"),
  travelOverride: document.querySelector("[data-travel-override]"),
  travelEstimate: document.querySelector("[data-travel-estimate]"),
  selectionEnvironment: document.querySelector("[data-selection-environment]"),
  selectionTier: document.querySelector("[data-selection-tier]"),
  selectionRush: document.querySelector("[data-selection-rush]"),
  selectionEdit: document.querySelector("[data-selection-edit]")
};

const STEP_FILES = ["step-1.html", "step-2.html", "step-3.html", "step-4.html", "step-5.html"];
const STEP_COUNT = STEP_FILES.length;

const defaultState = () => ({
  priceConfig: defaultPriceConfig(),
  priceQuote: estimatePrice(defaultPriceConfig()),
  serviceAddress: "",
  travel: {
    status: "idle",
    distanceMiles: null,
    travelFee: null,
    address: "",
    error: "",
    override: false,
    lastRequestedAt: 0
  },
  gateCodes: "",
  scope: "",
  date: "",
  time: "",
  addOns: [],
  confirmAcknowledged: false,
  stepIndex: 0
});

const getCurrentPageIndex = () => {
  const attr = document.body?.dataset.stepPage;
  const numeric = Number(attr);
  if (!Number.isFinite(numeric)) return 0;
  return clamp(numeric - 1, 0, STEP_COUNT - 1);
};

const normalizeAddressObject = (address) => {
  if (!address || typeof address !== "object") return "";
  const parts = [];
  if (address.line1) parts.push(String(address.line1));
  if (address.line2) parts.push(String(address.line2));
  const cityState = [address.city, address.state]
    .map((part) => (part ? String(part) : ""))
    .filter(Boolean)
    .join(", ");
  const postal = address.postal ? String(address.postal) : "";
  if (cityState) parts.push(cityState);
  if (postal) parts.push(postal);
  return parts.join(", ").trim();
};

const normalizeServiceAddress = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  return normalizeAddressObject(value);
};

const normalizeTravelState = (incomingTravel, serviceAddress) => {
  const base = defaultState().travel;
  const normalizedServiceAddress = normalizeServiceAddress(serviceAddress);
  if (!incomingTravel || typeof incomingTravel !== "object") {
    return { ...base, address: normalizedServiceAddress };
  }
  const allowedStatuses = new Set(["idle", "fetching", "ready", "error", "pending"]);
  const status = allowedStatuses.has(incomingTravel.status)
    ? incomingTravel.status
    : base.status;
  const distanceMiles = Number(incomingTravel.distanceMiles);
  const travelFee = Number(incomingTravel.travelFee);
  const lastRequestedAt = Number(incomingTravel.lastRequestedAt);
  const addressUsed = normalizeServiceAddress(incomingTravel.address);
  const normalized = {
    status,
    distanceMiles: Number.isFinite(distanceMiles) ? roundCurrency(distanceMiles, 2) : null,
    travelFee: Number.isFinite(travelFee) ? roundCurrency(travelFee, 2) : null,
    address: addressUsed,
    error: typeof incomingTravel.error === "string" ? incomingTravel.error : "",
    override: Boolean(incomingTravel.override),
    lastRequestedAt: Number.isFinite(lastRequestedAt) ? lastRequestedAt : 0
  };
  if (
    normalizedServiceAddress &&
    normalized.address &&
    normalized.address.trim().toLowerCase() !== normalizedServiceAddress.toLowerCase()
  ) {
    return { ...base, address: normalizedServiceAddress };
  }
  if (!normalizedServiceAddress) {
    return { ...base, address: "" };
  }
  return {
    ...normalized,
    address: normalizedServiceAddress || normalized.address || ""
  };
};

let state = defaultState();
let pageIndex = 0;
let currentUser = null;
let isSubmitting = false;
let submitCooldownActive = false;
let submitCooldownTimer = null;
let priceAnimationFrame = null;
let priceAnimationState = { from: 0, to: 0, startTime: 0 };
let priceInvalidFields = new Set();

const safeStorage = {
  get(key) {
    try {
      const raw = window.localStorage?.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (error) {
      console.warn("order-page: unable to read draft", error);
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage?.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn("order-page: unable to save draft", error);
    }
  }
};

const showToast = (message, variant = "info", { duration = TOAST_DURATION_MS } = {}) => {
  if (!selectors.toastContainer) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.dataset.variant = variant;
  toast.innerHTML = `
    <span class="toast__badge" aria-hidden="true"></span>
    <p class="toast__message">${message}</p>
  `;
  selectors.toastContainer.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  window.setTimeout(() => {
    toast.classList.remove("is-visible");
    window.setTimeout(() => toast.remove(), 400);
  }, duration);
};

const mergeState = (incoming = {}) => {
  const next = defaultState();
  for (const key of PROGRESSIVE_FIELDS) {
    if (key === "serviceAddress") {
      const legacyAddress =
        incoming.serviceAddress !== undefined ? incoming.serviceAddress : incoming.address;
      next.serviceAddress = normalizeServiceAddress(legacyAddress);
    } else if (key === "travel") {
      next.travel = normalizeTravelState(incoming.travel, next.serviceAddress);
    } else if (key === "addOns" && Array.isArray(incoming.addOns)) {
      next.addOns = incoming.addOns.map((addon) => ({ ...addon }));
    } else if (key === "priceConfig") {
      continue;
    } else if (incoming[key] !== undefined) {
      next[key] = incoming[key];
    }
  }
  next.confirmAcknowledged = Boolean(incoming.confirmAcknowledged);
  const maybeStep = Number(incoming.stepIndex);
  next.stepIndex = Number.isFinite(maybeStep) ? Math.max(0, maybeStep) : 0;
  if (incoming.priceConfig) {
    const mergedConfig = {
      ...next.priceConfig,
      ...incoming.priceConfig
    };
    const estimate = estimatePrice(mergedConfig);
    next.priceConfig = { ...estimate.config };
    next.priceQuote = estimate;
  } else {
    next.priceQuote = estimatePrice(next.priceConfig);
  }
  next.travel = normalizeTravelState(next.travel, next.serviceAddress);
  return next;
};

const saveState = () => {
  safeStorage.set(STORAGE_KEY, state);
};

const loadState = () => {
  const stored = safeStorage.get(STORAGE_KEY);
  if (stored) {
    state = mergeState(stored);
  }
};
const getAddOnsTotal = (addOns = state.addOns) =>
  addOns.reduce((sum, item) => sum + (Number(item.price) || 0), 0);

const getTravelFeeValue = (travel = state.travel) =>
  Number.isFinite(travel?.travelFee) ? travel.travelFee : 0;

const computeQuoteRollup = (quote = state.priceQuote) => {
  const baseExact = roundCurrency(
    quote?.totalExact ?? quote?.totalRounded ?? 0,
    2
  );
  const addOnsTotal = roundCurrency(getAddOnsTotal(), 2);
  const travelFee = roundCurrency(getTravelFeeValue(), 2);
  const combinedExact = roundCurrency(baseExact + addOnsTotal + travelFee, 2);
  return {
    baseExact,
    baseRounded: Math.round(baseExact),
    addOnsTotal,
    travelFee,
    combinedExact,
    combinedRounded: Math.round(combinedExact)
  };
};

const computeTotal = () => computeQuoteRollup().combinedRounded;

const TRAVEL_ENDPOINT = "/api/calc-travel";
const TRAVEL_REQUEST_DELAY_MS = 350;

let travelRequestPromise = null;
let travelRequestTimer = null;

const clearTravelTimer = () => {
  if (travelRequestTimer) {
    window.clearTimeout(travelRequestTimer);
    travelRequestTimer = null;
  }
};

const updateTravelUI = () => {
  if (!selectors.travelFeedback || !selectors.travelMessage) return;
  const container = selectors.travelFeedback;
  const messageEl = selectors.travelMessage;
  const retryBtn = selectors.travelRetry;
  const overrideBtn = selectors.travelOverride;
  const estimateBtn = selectors.travelEstimate;
  const status = state.travel.status;

  let visible = false;
  let message = "";
  let statusTone = "";
  let showRetry = false;
  let showOverride = false;

  const travelFeeReady = Number.isFinite(state.travel.travelFee);
  const travelDistanceReady = Number.isFinite(state.travel.distanceMiles);

  switch (status) {
    case "fetching":
      visible = true;
      statusTone = "info";
      message = "Calculating travel distance…";
      break;
    case "ready":
      if (travelFeeReady && travelDistanceReady) {
        visible = true;
        statusTone = "success";
        const miles = state.travel.distanceMiles?.toFixed(2) ?? "0.00";
        message = `Travel distance: ${miles} miles · Travel fee ${formatCurrency(state.travel.travelFee || 0)}`;
      }
      break;
    case "error":
      visible = true;
      message =
        state.travel.error ||
        "We couldn’t verify the address. Try again or continue without a travel fee for now.";
      showRetry = true;
      showOverride = true;
      break;
    case "pending":
      visible = true;
      statusTone = "info";
      message =
        "We’ll confirm the travel fee after verifying the address with you directly.";
      showRetry = true;
      showOverride = false;
      break;
    default:
      visible = false;
      break;
  }

  if (messageEl) {
    messageEl.textContent = message;
    if (statusTone) {
      messageEl.dataset.status = statusTone;
    } else {
      delete messageEl.dataset.status;
    }
  }

  if (retryBtn) {
    retryBtn.hidden = !showRetry;
    retryBtn.disabled = status === "fetching";
  }
  if (overrideBtn) {
    overrideBtn.hidden = !showOverride;
    overrideBtn.disabled = status === "fetching";
  }
  if (estimateBtn) {
    const defaultLabel = estimateBtn.dataset.defaultText || "Estimate travel fee";
    const loadingLabel = estimateBtn.dataset.loadingText || "Estimating...";
    estimateBtn.disabled = status === "fetching";
    estimateBtn.textContent = status === "fetching" ? loadingLabel : defaultLabel;
  }

  container.hidden = !visible;
};

const canFallbackToClientTravel = (error) => {
  if (!hasClientTravelConfig || !error) return false;
  if (error.code === "TRAVEL_CONFIG_MISSING") return false;
  if (error.canFallback === true) return true;
  const status = Number(error.status);
  if (Number.isFinite(status)) {
    return status >= 500 || status === 404 || status === 405;
  }
  return true;
};

const requestTravelQuoteFromServer = async (address) => {
  let response;
  try {
    response = await fetch(TRAVEL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
      cache: "no-store"
    });
  } catch (error) {
    if (error && typeof error === "object") {
      error.canFallback = true;
    }
    throw error;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof data?.error === "string" && data.error
        ? data.error
        : "Unable to compute travel distance";
    const err = new Error(message);
    err.status = response.status;
    err.canFallback =
      response.status >= 500 ||
      response.status === 404 ||
      response.status === 405 ||
      message.toLowerCase().includes("not configured");
    throw err;
  }

  const distanceMiles = Number(data?.distanceMiles);
  const travelFee = Number(data?.travelFee);
  if (!Number.isFinite(distanceMiles) || !Number.isFinite(travelFee)) {
    const err = new Error("Invalid travel response");
    err.canFallback = true;
    throw err;
  }

  return {
    distanceMiles: roundCurrency(distanceMiles, 2),
    travelFee: roundCurrency(travelFee, 2),
    source: "server"
  };
};

const requestTravelQuoteFromClient = async (address) => {
  if (!hasClientTravelConfig) {
    const err = new Error(
      "Travel lookup is not configured. Add hub coordinates and an API key."
    );
    err.code = "TRAVEL_CONFIG_MISSING";
    throw err;
  }

  const geocodeUrl = new URL("https://api.openrouteservice.org/geocode/search");
  geocodeUrl.searchParams.set("api_key", travelConfig.apiKey);
  geocodeUrl.searchParams.set("text", address);

  const geocodeRes = await fetch(geocodeUrl.toString(), {
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  if (!geocodeRes.ok) {
    const err = new Error(`Geocoding failed (${geocodeRes.status})`);
    err.status = geocodeRes.status;
    throw err;
  }
  const geocodeJson = await geocodeRes.json().catch(() => ({}));
  const coords = geocodeJson?.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) {
    throw new Error("Unable to geocode address");
  }
  const [destLng, destLat] = coords;

  const directionsRes = await fetch("https://api.openrouteservice.org/v2/directions/driving-car", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: travelConfig.apiKey
    },
    body: JSON.stringify({
      coordinates: [
        [travelConfig.hubLng, travelConfig.hubLat],
        [destLng, destLat]
      ],
      units: "mi"
    }),
    cache: "no-store"
  });

  if (!directionsRes.ok) {
    const err = new Error(`Directions failed (${directionsRes.status})`);
    err.status = directionsRes.status;
    throw err;
  }

  const directionsJson = await directionsRes.json().catch(() => ({}));
  const miles = directionsJson?.routes?.[0]?.summary?.distance;
  if (typeof miles !== "number" || !Number.isFinite(miles)) {
    throw new Error("Unable to compute driving distance");
  }

  const distanceMiles = roundCurrency(miles, 2);
  const travelFee = computeTravelFeeFromMiles(distanceMiles);
  return { distanceMiles, travelFee, source: "client" };
};

const performTravelQuote = async (address) => {
  const trimmedAddress = normalizeServiceAddress(address);
  if (!trimmedAddress) {
    state.travel = {
      ...defaultState().travel,
      address: "",
      status: "idle"
    };
    updateTravelUI();
    saveState();
    throw new Error("Address required");
  }
  try {
    const preferClient = travelConfig.mode === "client" && hasClientTravelConfig;
    let quote = null;
    if (preferClient) {
      quote = await requestTravelQuoteFromClient(trimmedAddress);
    } else {
      try {
        quote = await requestTravelQuoteFromServer(trimmedAddress);
      } catch (serverError) {
        if (canFallbackToClientTravel(serverError)) {
          console.warn(
            "order-page: travel API unavailable, using client-side fallback",
            serverError
          );
          quote = await requestTravelQuoteFromClient(trimmedAddress);
        } else {
          throw serverError;
        }
      }
    }

    const currentAddress = normalizeServiceAddress(state.serviceAddress);
    if (
      currentAddress &&
      currentAddress.toLowerCase() !== trimmedAddress.toLowerCase()
    ) {
      return state.travel;
    }
    if (
      !quote ||
      !Number.isFinite(quote.distanceMiles) ||
      !Number.isFinite(quote.travelFee)
    ) {
      throw new Error("Unexpected travel response");
    }
    const now = Date.now();
    state.travel = {
      status: "ready",
      distanceMiles: roundCurrency(quote.distanceMiles, 2),
      travelFee: roundCurrency(quote.travelFee, 2),
      address: trimmedAddress,
      error: "",
      override: false,
      lastRequestedAt: now
    };
    saveState();
    updateTravelUI();
    updateTotal();
    updateReview();
    updatePriceUI(state.priceQuote);
    return state.travel;
  } catch (error) {
    const currentAddress = normalizeServiceAddress(state.serviceAddress);
    if (
      currentAddress &&
      trimmedAddress &&
      currentAddress.toLowerCase() !== trimmedAddress.toLowerCase()
    ) {
      return state.travel;
    }
    let errorMessage =
      error instanceof Error ? error.message : String(error || "Unable to compute travel fee");
    if (error?.code === "TRAVEL_CONFIG_MISSING") {
      errorMessage = "Travel lookup isn’t configured yet. Add hub coordinates and an API key.";
    } else if (errorMessage === "Failed to fetch") {
      errorMessage = "Network error while contacting the travel service.";
    }
    if (error?.code === "TRAVEL_CONFIG_MISSING") {
      console.warn(
        "order-page: travel fallback not configured. Update window.__remnantTravelConfig in scripts/main.js."
      );
    } else {
      console.warn("order-page: travel lookup failed", error);
    }
    state.travel = {
      ...state.travel,
      status: "error",
      distanceMiles: null,
      travelFee: null,
      address: trimmedAddress,
      error: errorMessage,
      override: false,
      lastRequestedAt: Date.now()
    };
    saveState();
    updateTravelUI();
    updateTotal();
    updateReview();
    updatePriceUI(state.priceQuote);
    throw error;
  } finally {
    updateNavButtons();
  }
};

const scheduleTravelQuote = (address, { immediate = false } = {}) => {
  const trimmedAddress = normalizeServiceAddress(address);
  if (!trimmedAddress) {
    state.travel = {
      ...defaultState().travel,
      address: "",
      status: "idle"
    };
    updateTravelUI();
    saveState();
    return Promise.reject(new Error("Address required"));
  }
  if (travelRequestPromise) {
    return travelRequestPromise;
  }
  clearTravelTimer();
  state.travel = {
    ...state.travel,
    status: "fetching",
    error: "",
    override: false,
    address: trimmedAddress
  };
  saveState();
  updateTravelUI();
  updateNavButtons();

  const execute = () =>
    performTravelQuote(trimmedAddress).finally(() => {
      travelRequestPromise = null;
    });

  if (immediate) {
    travelRequestPromise = execute();
    return travelRequestPromise;
  }

  travelRequestPromise = new Promise((resolve, reject) => {
    travelRequestTimer = window.setTimeout(() => {
      travelRequestTimer = null;
      execute().then(resolve).catch(reject);
    }, TRAVEL_REQUEST_DELAY_MS);
  });
  return travelRequestPromise;
};

const travelAddressMatchesService = () => {
  const current = normalizeServiceAddress(state.serviceAddress);
  const travelAddress = normalizeServiceAddress(state.travel.address);
  return (
    Boolean(current) &&
    Boolean(travelAddress) &&
    current.toLowerCase() === travelAddress.toLowerCase()
  );
};

const canAdvanceWithCurrentTravel = () =>
  (state.travel.status === "ready" && travelAddressMatchesService()) ||
  (state.travel.status === "pending" && state.travel.override);

const handleTravelOverride = () => {
  if (!getStepValidity(1)) {
    selectors.addressInput?.focus();
    selectors.addressInput?.reportValidity?.();
    return;
  }
  clearTravelTimer();
  travelRequestPromise = null;
  state.travel = {
    status: "pending",
    distanceMiles: null,
    travelFee: null,
    address: normalizeServiceAddress(state.serviceAddress),
    error: "",
    override: true,
    lastRequestedAt: Date.now()
  };
  saveState();
  updateTravelUI();
  updateTotal();
  updateReview();
  updatePriceUI(state.priceQuote);
  updateNavButtons();
};

const handleTravelRetry = async () => {
  if (state.travel.status === "fetching") return;
  const address = normalizeServiceAddress(state.serviceAddress);
  if (!address) {
    selectors.addressInput?.focus();
    selectors.addressInput?.reportValidity?.();
    return;
  }
  try {
    await scheduleTravelQuote(address, { immediate: true });
  } catch (error) {
    console.warn("order-page: travel retry failed", error);
  }
};

const ensureAddressReady = async () => {
  const address = normalizeServiceAddress(state.serviceAddress);
  if (!address) {
    selectors.addressInput?.focus();
    selectors.addressInput?.reportValidity?.();
    updateNavButtons();
    return false;
  }
  if (canAdvanceWithCurrentTravel()) {
    return true;
  }
  try {
    await scheduleTravelQuote(address);
  } catch (error) {
    console.warn("order-page: travel lookup failed", error);
    updateNavButtons();
    return false;
  }
  if (canAdvanceWithCurrentTravel()) {
    return true;
  }
  updateNavButtons();
  return false;
};

const formatDateDisplay = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
};

const formatTimeDisplay = (value) => {
  if (!value) return "";
  const [hours, minutes] = value.split(":");
  if (hours === undefined || minutes === undefined) return value;
  const date = new Date();
  date.setHours(Number(hours));
  date.setMinutes(Number(minutes));
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

const renderOdometer = (amount) => {
  if (!selectors.odometer) return;
  const formatted = formatCurrency(amount);
  const digits = formatted.split("");
  const container = document.createElement("div");
  container.className = "odometer";

  digits.forEach((char) => {
    if (!/\d/.test(char)) {
      const staticSpan = document.createElement("span");
      staticSpan.textContent = char;
      staticSpan.className = "odometer-wheel odometer-wheel--static";
      staticSpan.dataset.char = char;
      container.appendChild(staticSpan);
      return;
    }
    const wheel = document.createElement("span");
    wheel.className = "odometer-wheel";
    wheel.dataset.char = char;
    const track = document.createElement("span");
    track.className = "odometer-wheel__track";
    for (let i = 0; i < 10; i += 1) {
      const digitEl = document.createElement("span");
      digitEl.className = "odometer-wheel__value";
      digitEl.textContent = i;
      track.appendChild(digitEl);
    }
    wheel.appendChild(track);
    container.appendChild(wheel);
    requestAnimationFrame(() => {
      const target = Number(char);
      track.style.transform = `translateY(-${target * 10}%)`;
    });
  });

  selectors.odometer.innerHTML = "";
  selectors.odometer.appendChild(container);
};

const getPriceErrorElement = (field) =>
  document.querySelector(`[data-price-error="${field}"]`);

const setPriceFieldValidity = (field, isValid, message = "") => {
  if (!field) return;
  const hint = getPriceErrorElement(field);
  if (hint) {
    hint.textContent = isValid ? "" : message || PRICE_ERROR_MESSAGES[field] || "";
  }
  if (isValid) {
    priceInvalidFields.delete(field);
  } else {
    priceInvalidFields.add(field);
  }
};

const refreshSelectionStates = () => {
  const environmentLabels = document.querySelectorAll(".step-pill");
  environmentLabels.forEach((label) => {
    const input = label.querySelector('input[data-price-input="environment"]');
    const checked = Boolean(input?.checked);
    label.classList.toggle("is-selected", checked);
    label.setAttribute("role", "radio");
    label.setAttribute("aria-checked", String(checked));
  });

  const tierLabels = document.querySelectorAll(".tier-card");
  tierLabels.forEach((label) => {
    const input = label.querySelector('input[data-price-input="tier"]');
    const checked = Boolean(input?.checked);
    label.classList.toggle("is-selected", checked);
    label.setAttribute("role", "radio");
    label.setAttribute("aria-checked", String(checked));
  });

  const rushLabel = document.querySelector(".rush-option");
  if (rushLabel) {
    const input = rushLabel.querySelector('input[data-price-input="rush"]');
    rushLabel.classList.toggle("is-selected", Boolean(input?.checked));
    rushLabel.setAttribute("role", "checkbox");
    rushLabel.setAttribute(
      "aria-checked",
      String(Boolean(input?.checked))
    );
  }
};

const renderPriceBreakdown = (quote, totals) => {
  if (!selectors.priceBreakdown) return;
  const extras = totals || computeQuoteRollup(quote);
  const entries = [
    ["Base fee", formatCurrency(quote.baseFee)],
    ["Scan", formatCurrency(roundCurrency(quote.scanFee, 2))],
    ["Subtotal", formatCurrency(roundCurrency(quote.subtotal, 2))],
    ["Multiplier", `×${quote.multiplier.toFixed(2)}`],
    ["Capture quote", formatCurrency(quote.totalRounded)]
  ];
  if (extras.addOnsTotal > 0) {
    entries.push(["Add-ons", formatCurrency(extras.addOnsTotal)]);
  }
  if (extras.travelFee > 0) {
    entries.push(["Travel fee", formatCurrency(extras.travelFee)]);
  }
  entries.push(["Estimated total", formatCurrency(extras.combinedRounded)]);
  selectors.priceBreakdown.innerHTML = "";
  entries.forEach(([label, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    selectors.priceBreakdown.append(dt, dd);
  });
};

const renderPriceModifiers = (quote) => {
  if (!selectors.priceModifiers) return;
  const chips = [];
  if (quote.modifiers.environment > 0) {
    chips.push(
      `Environment: ${quote.config.environment.charAt(0).toUpperCase()}${quote.config.environment.slice(
        1
      )} (+${Math.round(quote.modifiers.environment * 100)}%)`
    );
  }
  if (quote.modifiers.tier > 0) {
    chips.push(
      `Tier: ${quote.config.tier.charAt(0).toUpperCase()}${quote.config.tier.slice(1)} (+${Math.round(
        quote.modifiers.tier * 100
      )}%)`
    );
  }
  if (quote.modifiers.rush > 0) {
    chips.push(`Rush delivery (+${Math.round(quote.modifiers.rush * 100)}%)`);
  }
  selectors.priceModifiers.innerHTML = "";
  if (!chips.length) {
    const span = document.createElement("span");
    span.textContent = "No modifiers applied";
    selectors.priceModifiers.append(span);
    return;
  }
  chips.forEach((text) => {
    const span = document.createElement("span");
    span.textContent = text;
    selectors.priceModifiers.append(span);
  });
};

const renderPriceTimeline = (quote) => {
  if (!selectors.priceTimeline) return;
  selectors.priceTimeline.textContent = quote.config.rush
    ? PRICE_DELIVERY_HINTS.rush
    : PRICE_DELIVERY_HINTS.standard;
};

const animatePriceTo = (targetValue) => {
  if (!selectors.priceValue) return;
  if (!Number.isFinite(targetValue)) {
    selectors.priceValue.textContent = formatCurrency(0);
    return;
  }
  if (priceAnimationFrame) {
    cancelAnimationFrame(priceAnimationFrame);
  }
  const startValue =
    Number.isFinite(priceAnimationState.to) && priceAnimationState.to !== undefined
      ? priceAnimationState.to
      : targetValue;
  if (startValue === targetValue) {
    selectors.priceValue.textContent = formatCurrency(targetValue);
    selectors.priceValue.classList.remove("is-changing");
    priceAnimationState = { from: targetValue, to: targetValue, startTime: performance.now() };
    return;
  }
  const startTime = performance.now();
  selectors.priceValue.classList.add("is-changing");
  const step = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / PRICE_ANIMATION_DURATION_MS);
    const eased = easeOutCubic(progress);
    const current = Math.round(startValue + (targetValue - startValue) * eased);
    selectors.priceValue.textContent = formatCurrency(current);
    if (progress < 1) {
      priceAnimationFrame = requestAnimationFrame(step);
    } else {
      selectors.priceValue.textContent = formatCurrency(targetValue);
      selectors.priceValue.classList.remove("is-changing");
      priceAnimationState = { from: targetValue, to: targetValue, startTime: now };
      priceAnimationFrame = null;
    }
  };
  priceAnimationState = { from: startValue, to: targetValue, startTime };
  priceAnimationFrame = requestAnimationFrame(step);
};

const updatePriceUI = (quote, { animate = true } = {}) => {
  if (!quote) return;
  const totals = computeQuoteRollup(quote);
  if (selectors.priceAmount) {
    selectors.priceAmount.setAttribute(
      "aria-label",
      `Estimated total ${formatCurrency(totals.combinedRounded)}`
    );
  }
  if (selectors.priceExact) {
    selectors.priceExact.textContent = `Quote exact (before rounding): ${formatCurrency(
      totals.combinedExact
    )}`;
  }
  renderPriceBreakdown(quote, totals);
  renderPriceModifiers(quote);
  renderPriceTimeline(quote);
  if (animate) {
    animatePriceTo(totals.combinedRounded);
  } else if (selectors.priceValue) {
    selectors.priceValue.textContent = formatCurrency(totals.combinedRounded);
    priceAnimationState = {
      from: totals.combinedRounded,
      to: totals.combinedRounded,
      startTime: performance.now()
    };
  }
};

const commitPriceEstimate = (partialConfig = {}, { animate = true } = {}) => {
  const nextEstimate = estimatePrice({ ...state.priceConfig, ...partialConfig });
  state.priceConfig = { ...nextEstimate.config };
  state.priceQuote = nextEstimate;
  saveState();
  refreshSelectionStates();
  updatePriceUI(nextEstimate, { animate });
  updateTotal();
  updateReview();
  updateNavButtons();
};

const resetPriceInputs = () => {
  priceInvalidFields = new Set();
  setPriceFieldValidity("sqft", true);
};

const handlePriceNumericInput = (input) => {
  const field = input.dataset.priceInput;
  if (!field) return;
  const message = PRICE_ERROR_MESSAGES[field] || "";
  if (input.value === "") {
    setPriceFieldValidity(field, false, message);
    updateNavButtons();
    return;
  }
  const isValid = input.checkValidity();
  if (!isValid) {
    setPriceFieldValidity(field, false, message);
    updateNavButtons();
    return;
  }
  const limits = PRICE_LIMITS[field];
  const numericValue = Number(input.value);
  const nextValue = limits ? clamp(numericValue, limits.min, limits.max) : numericValue;
  if (Number.isFinite(nextValue) && nextValue !== numericValue) {
    input.value = String(nextValue);
  }
  setPriceFieldValidity(field, true);
  commitPriceEstimate({ [field]: nextValue });
};

const handlePriceChoiceInput = (input) => {
  const field = input.dataset.priceInput;
  if (!field) return;
  if (input.type === "checkbox") {
    commitPriceEstimate({ [field]: input.checked });
  } else if (input.type === "radio" && input.checked) {
    commitPriceEstimate({ [field]: input.value });
  }
  setPriceFieldValidity(field, true);
};

const initPriceEstimator = () => {
  resetPriceInputs();
  const allInputs = document.querySelectorAll("[data-price-input]");
  allInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const field = input.dataset.priceInput;
    if (!field) return;
    if (input.type === "number") {
      if (field in state.priceConfig) {
        input.value = String(state.priceConfig[field]);
      }
      input.addEventListener("input", () => handlePriceNumericInput(input));
      input.addEventListener("change", () => handlePriceNumericInput(input));
    } else if (input.type === "radio") {
      input.checked = state.priceConfig[field] === input.value;
      input.addEventListener("change", () => handlePriceChoiceInput(input));
    } else if (input.type === "checkbox") {
      input.checked = Boolean(state.priceConfig[field]);
      input.addEventListener("change", () => handlePriceChoiceInput(input));
    }
  });
  refreshSelectionStates();
  updatePriceUI(state.priceQuote, { animate: false });
  updateSelectionsRecap();
};

const updateTotal = () => {
  const total = computeTotal();
  renderOdometer(total);
};

const setServiceAddress = (value) => {
  const trimmed = normalizeServiceAddress(value);
  const previous = normalizeServiceAddress(state.serviceAddress);
  const normalizedTrimmed = trimmed.toLowerCase();
  const normalizedPrevious = previous.toLowerCase();
  const hasChanged = normalizedTrimmed !== normalizedPrevious;
  state.serviceAddress = trimmed;
  if (hasChanged) {
    clearTravelTimer();
    travelRequestPromise = null;
    state.travel = {
      ...defaultState().travel,
      address: trimmed
    };
    updateTotal();
    updatePriceUI(state.priceQuote);
  }
  saveState();
  updateTravelUI();
  updateProgressState();
  updateReview();
  updateNavButtons();
};

const setField = (key, value) => {
  if (!(key in state)) return;
  state[key] = value.trim();
  saveState();
  updateProgressState();
  if (["gateCodes", "scope", "date", "time"].includes(key)) {
    updateReview();
  }
  updateNavButtons();
};

const toggleAddon = (name, price, checked) => {
  const numericPrice = Number(price) || 0;
  if (checked) {
    if (!state.addOns.find((item) => item.name === name)) {
      state.addOns.push({ name, price: numericPrice });
    }
  } else {
    state.addOns = state.addOns.filter((item) => item.name !== name);
  }
  saveState();
  updateTotal();
  updatePriceUI(state.priceQuote);
  updateReview();
  updateNavButtons();
};

const syncAddOnsUI = () => {
  const inputs = document.querySelectorAll('[data-addons] input[type="checkbox"]');
  inputs.forEach((input) => {
    const match = state.addOns.find((item) => item.name === input.value);
    input.checked = Boolean(match);
    const label = input.closest("label");
    if (!label) return;
    label.classList.toggle("is-selected", Boolean(match));
  });
};

const updateReview = () => {
  if (!selectors.reviewList) return;
  const list = selectors.reviewList;
  list.innerHTML = "";

  const addItem = (label, value, options = {}) => {
    if (!value) return;
    const dt = document.createElement("dt");
    if (options.tooltip) {
      const span = document.createElement("span");
      span.textContent = label;
      const badge = document.createElement("span");
      badge.className = "info-badge";
      badge.tabIndex = 0;
      badge.setAttribute("role", "img");
      badge.setAttribute("aria-label", options.tooltip);
      badge.dataset.tooltip = options.tooltip;
      badge.textContent = "i";
      dt.append(span, badge);
    } else {
      dt.textContent = label;
    }
    const dd = document.createElement("dd");
    dd.textContent = value;
    list.append(dt, dd);
  };

  const config = state.priceConfig || defaultPriceConfig();
  if (config?.sqft) {
    addItem("Square footage", `${Number(config.sqft).toLocaleString()} sq ft`);
  }
  if (config?.environment) {
    const envLabel = `${config.environment.charAt(0).toUpperCase()}${config.environment.slice(1)}`;
    addItem("Environment", envLabel);
  }
  if (config?.tier) {
    const tierLabel = `${config.tier.charAt(0).toUpperCase()}${config.tier.slice(1)}`;
    addItem("Immersion tier", tierLabel);
  }
  addItem("Rush delivery", config?.rush ? "Yes" : "No");
  addItem("Location", state.serviceAddress || "Not provided");
  if (state.gateCodes) addItem("Access details", state.gateCodes);
  if (state.scope) addItem("Focus notes", state.scope);
  if (state.date) addItem("Preferred date", formatDateDisplay(state.date));
  if (state.time) addItem("Arrival window", formatTimeDisplay(state.time));
  const addonsLabel = state.addOns.length
    ? state.addOns.map((item) => `${item.name} (${formatCurrency(item.price)})`).join(" \u2022 ")
    : "None";
  addItem("Add-ons", addonsLabel);
  const travelTooltip =
    "Calculated by driving distance from our service hub. We never share our hub address.";
  switch (state.travel.status) {
    case "ready":
      if (Number.isFinite(state.travel.distanceMiles)) {
        addItem(
          "Travel distance",
          `${Number(state.travel.distanceMiles).toFixed(2)} miles`
        );
      }
      addItem(
        "Travel fee",
        formatCurrency(state.travel.travelFee || 0),
        { tooltip: travelTooltip }
      );
      break;
    case "pending":
      addItem("Travel fee", "Pending verification", { tooltip: travelTooltip });
      break;
    case "fetching":
      addItem("Travel fee", "Calculating…", { tooltip: travelTooltip });
      break;
    case "error":
      addItem("Travel fee", "Needs manual review", { tooltip: travelTooltip });
      break;
    default:
      if (state.serviceAddress) {
        addItem("Travel fee", "Awaiting calculation", { tooltip: travelTooltip });
      }
      break;
  }
  if (state.priceQuote) {
    addItem("Capture quote", formatCurrency(state.priceQuote.totalRounded));
    const modifierSummary = [];
    if (state.priceQuote.modifiers.environment > 0) {
      modifierSummary.push(
        `Environment (+${Math.round(state.priceQuote.modifiers.environment * 100)}%)`
      );
    }
    if (state.priceQuote.modifiers.tier > 0) {
      modifierSummary.push(`Tier (+${Math.round(state.priceQuote.modifiers.tier * 100)}%)`);
    }
    if (state.priceQuote.modifiers.rush > 0) {
      modifierSummary.push(`Rush (+${Math.round(state.priceQuote.modifiers.rush * 100)}%)`);
    }
    addItem("Quote modifiers", modifierSummary.length ? modifierSummary.join(" · ") : "None");
  }
  addItem("Estimated total", formatCurrency(computeTotal()));
  updateSelectionsRecap();
};

const updateSelectionsRecap = () => {
  if (
    !selectors.selectionEnvironment ||
    !selectors.selectionTier ||
    !selectors.selectionRush
  ) {
    return;
  }
  const config = state.priceConfig || defaultPriceConfig();
  const envLabel = config?.environment ? toTitleCase(config.environment) : "Not selected";
  const tierLabel = config?.tier ? toTitleCase(config.tier) : "Not selected";
  const rushLabel = config?.rush ? "Yes" : "No";

  selectors.selectionEnvironment.textContent = `Environment: ${envLabel}`;
  selectors.selectionTier.textContent = `Immersion tier: ${tierLabel}`;
  selectors.selectionRush.textContent = `Rush delivery: ${rushLabel}`;
};

const getStepValidity = (index) => {
  switch (index) {
    case 0: {
      const hasEnvironment = Boolean(state.priceConfig?.environment);
      const hasTier = Boolean(state.priceConfig?.tier);
      return hasEnvironment && hasTier;
    }
    case 1: {
      const baseReady = Boolean(state.serviceAddress) && Boolean(state.date) && Boolean(state.time);
      return baseReady && priceInvalidFields.size === 0;
    }
    case 4:
      return Boolean(state.confirmAcknowledged) && !isSubmitting;
    default:
      return true;
  }
};

const getFirstIncompleteStep = () => {
  for (let i = 0; i < STEP_COUNT; i += 1) {
    if (!getStepValidity(i)) {
      return i;
    }
  }
  return null;
};

const enforceStepAccess = () => {
  const firstIncomplete = getFirstIncompleteStep();
  if (firstIncomplete === null) return true;
  if (pageIndex > firstIncomplete) {
    const targetFile = STEP_FILES[firstIncomplete] || STEP_FILES[0];
    window.location.replace(targetFile);
    return false;
  }
  return true;
};

const updateProgressState = () => {
  selectors.progressSteps.forEach((stepEl, index) => {
    stepEl.classList.toggle("is-active", index === pageIndex);
    stepEl.classList.toggle("is-complete", index < pageIndex);
  });
};

const updateNavButtons = () => {
  if (!selectors.nextBtn || !selectors.prevBtn) return;
  const isFirstStep = pageIndex === 0;
  selectors.prevBtn.disabled = isFirstStep;
  const stepValid = getStepValidity(pageIndex);
  const isTravelComputing = pageIndex === 1 && state.travel.status === "fetching";
  const shouldDisable =
    !stepValid || submitCooldownActive || priceInvalidFields.size > 0 || isTravelComputing;
  selectors.nextBtn.disabled = shouldDisable;

  if (pageIndex === STEP_COUNT - 1) {
    selectors.nextBtn.textContent = isSubmitting ? "Submitting..." : "Place order";
  } else if (pageIndex === STEP_COUNT - 2) {
    selectors.nextBtn.textContent = "Confirm details";
  } else if (pageIndex === 1 && isTravelComputing) {
    selectors.nextBtn.textContent = "Calculating...";
  } else if (pageIndex === 0) {
    selectors.nextBtn.textContent = "Continue";
  } else {
    selectors.nextBtn.textContent = "Next step";
  }
};

const serializeAddOns = (addOns) => {
  try {
    return JSON.stringify(addOns);
  } catch (error) {
    console.warn("order-page: unable to serialize addOns", error);
    return "";
  }
};

const formatAddress = (address) => normalizeServiceAddress(address);

const setConfirmAcknowledged = (value) => {
  state.confirmAcknowledged = value;
  saveState();
  updateNavButtons();
};

const showSuccess = (orderId) => {
  if (selectors.wizard) selectors.wizard.hidden = true;
  if (selectors.success) {
    selectors.success.hidden = false;
    if (selectors.orderId) {
      selectors.orderId.textContent = orderId || "Pending";
    }
  }
};

const startSubmitCooldown = () => {
  submitCooldownActive = true;
  updateNavButtons();
  if (submitCooldownTimer) window.clearTimeout(submitCooldownTimer);
  submitCooldownTimer = window.setTimeout(() => {
    submitCooldownActive = false;
    updateNavButtons();
  }, SUBMIT_COOLDOWN_MS);
};

const submitOrder = async () => {
  if (!sb) {
    showToast("Ordering is unavailable right now. Please try again shortly.", "error");
    return;
  }
  if (isSubmitting) return;
  isSubmitting = true;
  updateNavButtons();

  const quote = state.priceQuote || estimatePrice(state.priceConfig);
  const totals = computeQuoteRollup(quote);
  const captureSummaryParts = [
    `${quote.config.sqft} sq ft`,
    quote.config.environment,
    quote.config.tier
  ];
  if (quote.config.rush) captureSummaryParts.push("rush");
  const captureSummary = `Custom Quote · ${captureSummaryParts.join(" · ")}`;

  const userEmail = currentUser?.email ?? null;

  const payload = {
    account_email_attached: userEmail,
    capturing: captureSummary,
    address: formatAddress(state.serviceAddress),
    gate_codes: state.gateCodes || "",
    scope: state.scope || "",
    date: state.date,
    capture_time: state.time,
    addons: serializeAddOns(state.addOns),
    sqft: quote.config.sqft,
    environment: quote.config.environment,
    tier: quote.config.tier,
    rush: quote.config.rush,
    base_fee: roundCurrency(quote.baseFee, 2),
    scan_fee: roundCurrency(quote.scanFee, 2),
    modifiers: quote.modifiers,
    subtotal: roundCurrency(quote.subtotal, 2),
    multiplier: quote.multiplier,
    quote_total: quote.totalRounded,
    addons_total: totals.addOnsTotal,
    total_rounded: totals.combinedRounded,
    total_exact: totals.combinedExact,
    travel_fee: Number.isFinite(state.travel.travelFee)
      ? roundCurrency(state.travel.travelFee, 2)
      : null,
    distance_miles: Number.isFinite(state.travel.distanceMiles)
      ? Math.round(state.travel.distanceMiles)
      : null,
    user_email: userEmail,
    notes: state.scope || null
  };

  try {
    const { data, error } = await sb
      .from("orders")
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error("order-page: submit error", error);
      showToast(error.message || "We couldn’t place the order. Try again in a moment.", "error");
      return;
    }

    state = defaultState();
    saveState();
    state.stepIndex = 0;
    pageIndex = 0;
    syncAddOnsUI();
    applyStateToInputs();
    updateTotal();
    updateReview();
    updateProgressState();
    showSuccess(data?.id || data?.order_id || "");
    showToast("Capture scheduled! Your archivist is reviewing the request.", "success");
  } catch (error) {
    console.error("order-page: submit exception", error);
    showToast("Network hiccup. We saved your draft—try again shortly.", "error");
  } finally {
    isSubmitting = false;
    startSubmitCooldown();
    updateNavButtons();
  }
};

const navigateToStep = (targetIndex) => {
  const safeIndex = clamp(targetIndex, 0, STEP_COUNT - 1);
  const file = STEP_FILES[safeIndex] || STEP_FILES[0];
  window.location.href = file;
};

const goToNextStep = async () => {
  if (!getStepValidity(pageIndex)) {
    if (selectors.stepForm?.reportValidity) {
      selectors.stepForm.reportValidity();
    } else {
      const firstInvalid = document.querySelector("input:invalid, textarea:invalid, select:invalid");
      firstInvalid?.reportValidity?.();
    }
    updateNavButtons();
    return;
  }
  if (pageIndex === 1) {
    const ready = await ensureAddressReady();
    if (!ready) return;
  }
  if (pageIndex === STEP_COUNT - 1) {
    submitOrder();
    return;
  }
  const nextIndex = clamp(pageIndex + 1, 0, STEP_COUNT - 1);
  state.stepIndex = nextIndex;
  saveState();
  navigateToStep(nextIndex);
};

const goToPrevStep = () => {
  if (pageIndex === 0) return;
  const prevIndex = clamp(pageIndex - 1, 0, STEP_COUNT - 1);
  state.stepIndex = prevIndex;
  saveState();
  navigateToStep(prevIndex);
};

const applySession = (session) => {
  currentUser = session?.user ?? null;
  if (selectors.success && !selectors.success.hidden) {
    return;
  }
  if (selectors.wizard) selectors.wizard.hidden = false;
};

const handleSharedAuthEvent = (event) => {
  const session = event?.detail?.session ?? null;
  applySession(session);
};

window.addEventListener(AUTH_EVENT_NAME, handleSharedAuthEvent);

const applyStateToInputs = () => {
  if (selectors.addressInput) {
    selectors.addressInput.value = state.serviceAddress || "";
  }
  const fieldInputs = document.querySelectorAll("[data-field]");
  fieldInputs.forEach((input) => {
    const key = input.getAttribute("data-field");
    if (key in state) {
      input.value = state[key] || "";
    }
  });
  if (selectors.confirmCheckbox) {
    selectors.confirmCheckbox.checked = Boolean(state.confirmAcknowledged);
  }
  const priceInputs = document.querySelectorAll("[data-price-input]");
  if (priceInputs.length) {
    priceInputs.forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      const field = input.dataset.priceInput;
      if (!field) return;
      if (input.type === "number" && field in state.priceConfig) {
        input.value = String(state.priceConfig[field]);
      } else if (input.type === "radio") {
        input.checked = state.priceConfig[field] === input.value;
      } else if (input.type === "checkbox") {
        input.checked = Boolean(state.priceConfig[field]);
      }
    });
    refreshSelectionStates();
    updatePriceUI(state.priceQuote, { animate: false });
    resetPriceInputs();
    updateNavButtons();
    updateSelectionsRecap();
  }
  updateTravelUI();
};

const initMemoryOrb = () => {
  const canvas = document.querySelector("[data-memory-orb]");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const baseSize = canvas.width;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = baseSize * dpr;
  canvas.height = baseSize * dpr;
  canvas.style.width = `${baseSize}px`;
  canvas.style.height = `${baseSize}px`;

  const orbState = {
    pointerX: 0.5,
    pointerY: 0.4,
    glow: 0,
    targetGlow: 0,
    targetX: 0.5,
    targetY: 0.4
  };

  const lerp = (start, end, t) => start + (end - start) * t;

  const renderStatic = () => {
    const w = canvas.width;
    const h = canvas.height;
    const centerX = w / 2;
    const centerY = h / 2;
    const gradientCore = ctx.createRadialGradient(
      centerX,
      centerY,
      w * 0.05,
      centerX,
      centerY,
      w * 0.55
    );
    gradientCore.addColorStop(0, "rgba(124, 242, 208, 0.6)");
    gradientCore.addColorStop(0.4, "rgba(131, 166, 255, 0.55)");
    gradientCore.addColorStop(1, "rgba(10, 15, 30, 0.05)");
    ctx.fillStyle = gradientCore;
    ctx.fillRect(0, 0, w, h);
  };

  let animationId = null;
  let handlersAttached = false;

  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    orbState.pointerX = lerp(orbState.pointerX, orbState.targetX, 0.08);
    orbState.pointerY = lerp(orbState.pointerY, orbState.targetY, 0.08);
    orbState.glow = lerp(orbState.glow, orbState.targetGlow, 0.1);

    const w = canvas.width;
    const h = canvas.height;
    const centerX = w / 2;
    const centerY = h / 2;

    const gradientCore = ctx.createRadialGradient(
      centerX,
      centerY,
      w * 0.05,
      centerX,
      centerY,
      w * 0.55
    );
    gradientCore.addColorStop(0, "rgba(124, 242, 208, 0.6)");
    gradientCore.addColorStop(0.4, "rgba(131, 166, 255, 0.55)");
    gradientCore.addColorStop(1, "rgba(10, 15, 30, 0.05)");

    ctx.fillStyle = gradientCore;
    ctx.fillRect(0, 0, w, h);

    const pulseGradient = ctx.createRadialGradient(
      orbState.pointerX * w,
      orbState.pointerY * h,
      w * 0.05,
      centerX,
      centerY,
      w * (0.6 + orbState.glow * 0.2)
    );
    pulseGradient.addColorStop(0, "rgba(124, 242, 208, 0.65)");
    pulseGradient.addColorStop(0.4, "rgba(131, 166, 255, 0.4)");
    pulseGradient.addColorStop(1, "rgba(9, 12, 24, 0.02)");

    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = pulseGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, Math.min(centerX, centerY), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    animationId = requestAnimationFrame(draw);
  };

  const updatePointer = (event) => {
    const rect = canvas.getBoundingClientRect();
    orbState.targetX = (event.clientX - rect.left) / rect.width;
    orbState.targetY = (event.clientY - rect.top) / rect.height;
  };

  const enableAnimation = () => {
    if (animationId) cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(draw);
  };

  const disableAnimation = () => {
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
    renderStatic();
  };

  const attachInteractiveHandlers = () => {
    if (handlersAttached) return;
    handlersAttached = true;
    canvas.addEventListener("pointerenter", () => {
      orbState.targetGlow = 1;
    });

    canvas.addEventListener("pointerleave", () => {
      orbState.targetGlow = 0;
      orbState.targetX = 0.5;
      orbState.targetY = 0.4;
    });

    canvas.addEventListener("pointermove", (event) => {
      if (event.pointerType === "mouse" || event.pressure > 0) {
        updatePointer(event);
      }
    });
  };

  if (prefersReducedMotion.matches) {
    renderStatic();
  } else {
    enableAnimation();
    attachInteractiveHandlers();
  }

  prefersReducedMotion.addEventListener("change", (event) => {
    if (event.matches) {
      disableAnimation();
    } else {
      enableAnimation();
      attachInteractiveHandlers();
    }
  });
};

const initEventListeners = () => {
  selectors.addressInput?.addEventListener("input", (event) => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    setServiceAddress(target.value);
  });

  document.querySelectorAll("[data-field]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const target = event.currentTarget;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
        return;
      }
      const key = target.getAttribute("data-field");
      if (!key) return;
      setField(key, target.value);
    });
  });

  selectors.travelRetry?.addEventListener("click", () => {
    handleTravelRetry();
  });

  selectors.travelOverride?.addEventListener("click", () => {
    handleTravelOverride();
  });

  selectors.travelEstimate?.addEventListener("click", async () => {
    if (state.travel.status === "fetching") return;
    const address = normalizeServiceAddress(state.serviceAddress);
    if (!address) {
      selectors.addressInput?.focus();
      selectors.addressInput?.reportValidity?.();
      return;
    }
    try {
      await scheduleTravelQuote(address, { immediate: true });
    } catch (error) {
      console.warn("order-page: travel estimate failed", error);
    }
  });

  document
    .querySelectorAll('[data-addons] input[type="checkbox"]')
    .forEach((input) => {
      input.addEventListener("change", (event) => {
        const target = event.currentTarget;
        if (!(target instanceof HTMLInputElement)) return;
        toggleAddon(target.value, target.dataset.price, target.checked);
        syncAddOnsUI();
      });
    });

  selectors.confirmCheckbox?.addEventListener("change", (event) => {
    const target = event.currentTarget;
    if (target instanceof HTMLInputElement) {
      setConfirmAcknowledged(target.checked);
    }
  });

  selectors.selectionEdit?.addEventListener("click", () => {
    state.stepIndex = 0;
    saveState();
    window.location.href = STEP_FILES[0];
  });

  selectors.nextBtn?.addEventListener("click", () => goToNextStep());
  selectors.prevBtn?.addEventListener("click", () => goToPrevStep());
};

const initSupabase = async () => {
  updateProgressState();
  syncAddOnsUI();
  applyStateToInputs();
  updateTotal();
  updateReview();
  updatePriceUI(state.priceQuote, { animate: false });
  updateNavButtons();

  const sharedSession = window.__remnantAuthSession ?? null;
  if (sharedSession) {
    applySession(sharedSession);
  }

  if (!sb) {
    console.warn("Supabase client not available for order page.");
    return;
  }

  try {
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    const session = data?.session ?? (window.__remnantAuthSession ?? null);
    applySession(session);
  } catch (error) {
    console.warn("order-page: unable to fetch session", error);
    const fallbackSession = window.__remnantAuthSession ?? null;
    applySession(fallbackSession);
  }

  sb.auth.onAuthStateChange((_event, session) => {
    applySession(session ?? null);
  });
};

const formatAddressForSubmission = () => formatAddress(state.serviceAddress);

const init = () => {
  loadState();
  pageIndex = getCurrentPageIndex();
  const accessGranted = enforceStepAccess();
  if (!accessGranted) return;
  state.stepIndex = pageIndex;
  saveState();
  initPriceEstimator();
  initMemoryOrb();
  initEventListeners();
  initSupabase();
  runEstimateTests();
};

window.addEventListener("DOMContentLoaded", init);

// Expose helpers for debugging/testing
window.__remnantOrder = {
  getState: () => ({ ...state }),
  formatAddress,
  serializeAddOns,
  formatAddressForSubmission,
  estimatePrice,
  roundCurrency
};
