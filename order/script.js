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
  "address",
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
  distance: 10,
  environment: "indoor",
  tier: "basic",
  rush: false
});

const PRICE_LIMITS = Object.freeze({
  sqft: { min: 100, max: 10000 },
  distance: { min: 0, max: 150 }
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
const PRICE_TRAVEL_RATE = 1.25;
const PRICE_TRAVEL_THRESHOLD = 20;
const PRICE_SCAN_RATE = 0.5;
const PRICE_ANIMATION_DURATION_MS = 280;

const PRICE_ERROR_MESSAGES = Object.freeze({
  sqft: "Enter between 100 and 10,000 square feet.",
  distance: "Distance must be between 0 and 150 miles."
});

const PRICE_DELIVERY_HINTS = Object.freeze({
  rush: "Rush Delivery: 24–48h (≤1000 sq ft), 2–3 days (1000–2500), 3–5 days (2500+)",
  standard: "Standard: ~5–7 business days (up to 10 for very large jobs)"
});

const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
};

const roundCurrency = (value, precision = 2) => {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);

const toNumberOrDefault = (value, fallback) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const defaultPriceConfig = () => ({
  sqft: PRICE_DEFAULTS.sqft,
  distance: PRICE_DEFAULTS.distance,
  environment: PRICE_DEFAULTS.environment,
  tier: PRICE_DEFAULTS.tier,
  rush: PRICE_DEFAULTS.rush
});

function estimatePrice(input = {}) {
  const rawSqft = toNumberOrDefault(input.sqft, PRICE_DEFAULTS.sqft);
  const rawDistance = toNumberOrDefault(input.distance, PRICE_DEFAULTS.distance);
  const config = {
    sqft: clamp(rawSqft, PRICE_LIMITS.sqft.min, PRICE_LIMITS.sqft.max),
    distance: clamp(rawDistance, PRICE_LIMITS.distance.min, PRICE_LIMITS.distance.max),
    environment: input.environment && input.environment in PRICE_ENVIRONMENT_MODIFIERS
      ? input.environment
      : PRICE_DEFAULTS.environment,
    tier: input.tier && input.tier in PRICE_TIER_MODIFIERS ? input.tier : PRICE_DEFAULTS.tier,
    rush: Boolean(input.rush)
  };

  const baseFee = PRICE_BASE_FEE;
  const travelFee = Math.max(0, config.distance - PRICE_TRAVEL_THRESHOLD) * PRICE_TRAVEL_RATE;
  const scanFee = config.sqft * PRICE_SCAN_RATE;
  const subtotal = baseFee + travelFee + scanFee;

  const modifiers = {
    environment: PRICE_ENVIRONMENT_MODIFIERS[config.environment] || 0,
    tier: PRICE_TIER_MODIFIERS[config.tier] || 0,
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
    travelFee,
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
    name: "3500 sq ft · 3 miles · indoor · immersive · standard",
    input: {
      sqft: 3500,
      distance: 3,
      environment: "indoor",
      tier: "immersive",
      rush: false
    },
    expected: {
      baseFee: 150,
      travelFee: 0,
      scanFee: 1750,
      subtotal: 1900,
      multiplier: 1.3,
      totalExact: 2470,
      totalRounded: 2470
    }
  },
  {
    name: "2000 sq ft · 30 miles · both · realistic · standard",
    input: {
      sqft: 2000,
      distance: 30,
      environment: "both",
      tier: "realistic",
      rush: false
    },
    expected: {
      baseFee: 150,
      travelFee: 12.5,
      scanFee: 1000,
      subtotal: 1162.5,
      multiplier: 1.3,
      totalExact: 1511.25,
      totalRounded: 1511
    }
  },
  {
    name: "4000 sq ft · 45 miles · outdoor · basic · rush",
    input: {
      sqft: 4000,
      distance: 45,
      environment: "outdoor",
      tier: "basic",
      rush: true
    },
    expected: {
      baseFee: 150,
      travelFee: 31.25,
      scanFee: 2000,
      subtotal: 2181.25,
      multiplier: 1.2,
      totalExact: 2617.5,
      totalRounded: 2618
    }
  },
  {
    name: "800 sq ft · 0 miles · indoor · basic · standard",
    input: {
      sqft: 800,
      distance: 0,
      environment: "indoor",
      tier: "basic",
      rush: false
    },
    expected: {
      baseFee: 150,
      travelFee: 0,
      scanFee: 400,
      subtotal: 550,
      multiplier: 1,
      totalExact: 550,
      totalRounded: 550
    },
    expectedConfig: {
      distance: 0
    }
  }
];

const runEstimateTests = () => {
  if (runEstimateTests.hasRun) return;
  runEstimateTests.hasRun = true;
  ESTIMATE_TEST_CASES.forEach((test) => {
    const result = estimatePrice(test.input);
    const expected = test.expected;
    const expectedConfig = test.expectedConfig || null;
    const almostEqual = (a, b, tolerance = 0.01) => Math.abs(a - b) <= tolerance;
    const configMatches = expectedConfig
      ? Object.entries(expectedConfig).every(([key, value]) => result.config?.[key] === value)
      : true;
    const pass =
      configMatches &&
      almostEqual(result.baseFee, expected.baseFee) &&
      almostEqual(result.travelFee, expected.travelFee) &&
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
  gate: document.querySelector("[data-auth-gate]"),
  wizard: document.querySelector("[data-order-wizard]"),
  success: document.querySelector("[data-order-success]"),
  orderId: document.querySelector("[data-order-id]"),
  progressSteps: Array.from(document.querySelectorAll("[data-progress-step]")),
  steps: Array.from(document.querySelectorAll("[data-step]")),
  nextBtn: document.querySelector("[data-next]"),
  prevBtn: document.querySelector("[data-prev]"),
  odometer: document.querySelector("[data-odometer]"),
  reviewList: document.querySelector("[data-review-list]"),
  confirmCheckbox: document.querySelector("[data-confirm-checkbox]"),
  toastContainer: document.querySelector(".toast-container"),
  priceEstimator: document.querySelector("[data-price-estimator]"),
  priceValue: document.querySelector("[data-price-value]"),
  priceAmount: document.querySelector("[data-price-amount]"),
  priceExact: document.querySelector("[data-price-exact]"),
  priceBreakdown: document.querySelector("[data-price-breakdown]"),
  priceModifiers: document.querySelector("[data-price-modifiers]"),
  priceTimeline: document.querySelector("[data-price-timeline]")
};

const defaultState = () => ({
  priceConfig: defaultPriceConfig(),
  priceQuote: estimatePrice(defaultPriceConfig()),
  address: {
    line1: "",
    line2: "",
    city: "",
    state: "",
    postal: ""
  },
  gateCodes: "",
  scope: "",
  date: "",
  time: "",
  addOns: [],
  confirmAcknowledged: false,
  stepIndex: 0
});

let state = defaultState();
let currentStep = 0;
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
    if (key === "address") {
      Object.assign(next.address, incoming.address || {});
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
const computeTotal = () => {
  const addOnsTotal = state.addOns.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  const quoteExact = state?.priceQuote?.totalExact ?? state?.priceQuote?.totalRounded ?? 0;
  const combined = quoteExact + addOnsTotal;
  return Math.round(combined);
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
  selectors.priceEstimator?.querySelector(`[data-price-error="${field}"]`) ?? null;

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

const renderPriceBreakdown = (quote) => {
  if (!selectors.priceBreakdown) return;
  const entries = [
    ["Base fee", formatCurrency(quote.baseFee)],
    ["Travel", formatCurrency(roundCurrency(quote.travelFee, 2))],
    ["Scan", formatCurrency(roundCurrency(quote.scanFee, 2))],
    ["Subtotal", formatCurrency(roundCurrency(quote.subtotal, 2))],
    ["Multiplier", `×${quote.multiplier.toFixed(2)}`],
    ["Quote total", formatCurrency(quote.totalRounded)]
  ];
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
  if (selectors.priceAmount) {
    selectors.priceAmount.setAttribute("aria-label", `Estimated total ${formatCurrency(quote.totalRounded)}`);
  }
  if (selectors.priceExact) {
    selectors.priceExact.textContent = `Quote exact (before rounding): ${formatCurrency(quote.totalExact)}`;
  }
  renderPriceBreakdown(quote);
  renderPriceModifiers(quote);
  renderPriceTimeline(quote);
  if (animate) {
    animatePriceTo(quote.totalRounded);
  } else if (selectors.priceValue) {
    selectors.priceValue.textContent = formatCurrency(quote.totalRounded);
    priceAnimationState = {
      from: quote.totalRounded,
      to: quote.totalRounded,
      startTime: performance.now()
    };
  }
};

const commitPriceEstimate = (partialConfig = {}, { animate = true } = {}) => {
  const nextEstimate = estimatePrice({ ...state.priceConfig, ...partialConfig });
  state.priceConfig = { ...nextEstimate.config };
  state.priceQuote = nextEstimate;
  saveState();
  updatePriceUI(nextEstimate, { animate });
  updateTotal();
  updateReview();
  updateNavButtons();
};

const resetPriceInputs = () => {
  priceInvalidFields = new Set();
  setPriceFieldValidity("sqft", true);
  setPriceFieldValidity("distance", true);
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
  if (!selectors.priceEstimator) return;
  resetPriceInputs();
  const allInputs = selectors.priceEstimator.querySelectorAll("[data-price-input]");
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
  updatePriceUI(state.priceQuote, { animate: false });
};

const updateTotal = () => {
  const total = computeTotal();
  renderOdometer(total);
};

const setAddressField = (key, value) => {
  if (!(key in state.address)) return;
  state.address[key] = value.trim();
  saveState();
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

  const addItem = (label, value) => {
    if (!value) return;
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    list.append(dt, dd);
  };

  const config = state.priceConfig || defaultPriceConfig();
  if (config?.sqft) {
    addItem("Square footage", `${Number(config.sqft).toLocaleString()} sq ft`);
  }
  if (config?.distance !== undefined) {
    addItem("Distance", `${Number(config.distance).toLocaleString()} miles from Temecula hub`);
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
  const addressParts = [];
  if (state.address.line1) addressParts.push(state.address.line1);
  if (state.address.line2) addressParts.push(state.address.line2);
  const cityState = [state.address.city, state.address.state].filter(Boolean).join(", ");
  if (cityState) addressParts.push(cityState);
  if (state.address.postal) addressParts.push(state.address.postal);
  addItem("Location", addressParts.join(" · "));
  if (state.gateCodes) addItem("Access details", state.gateCodes);
  if (state.scope) addItem("Focus notes", state.scope);
  if (state.date) addItem("Preferred date", formatDateDisplay(state.date));
  if (state.time) addItem("Arrival window", formatTimeDisplay(state.time));
  const addonsLabel = state.addOns.length
    ? state.addOns.map((item) => `${item.name} (${formatCurrency(item.price)})`).join(" \u2022 ")
    : "None";
  addItem("Add-ons", addonsLabel);
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
};

const getStepValidity = (index) => {
  switch (index) {
    case 0:
      return priceInvalidFields.size === 0;
    case 1:
      return (
        Boolean(state.address.line1) &&
        Boolean(state.address.city) &&
        Boolean(state.address.state) &&
        Boolean(state.address.postal) &&
        Boolean(state.date) &&
        Boolean(state.time)
      );
    case 4:
      return Boolean(state.confirmAcknowledged) && !isSubmitting;
    default:
      return true;
  }
};

const focusFirstElement = (stepIndex) => {
  const step = selectors.steps[stepIndex];
  if (!step) return;
  const focusable = step.querySelector(
    'input:not([type="hidden"]), textarea, select, button, [tabindex]:not([tabindex="-1"])'
  );
  if (focusable) {
    focusable.focus({ preventScroll: true });
  } else {
    const heading = step.querySelector("h3");
    heading?.focus?.({ preventScroll: true });
  }
};

const updateProgressState = () => {
  selectors.progressSteps.forEach((stepEl, index) => {
    stepEl.classList.toggle("is-active", index === currentStep);
    stepEl.classList.toggle("is-complete", index < currentStep);
  });
};

const updateStepAccessibility = () => {
  selectors.steps.forEach((step, index) => {
    step.setAttribute("aria-hidden", index === currentStep ? "false" : "true");
  });
};

const updateNavButtons = () => {
  if (!selectors.nextBtn || !selectors.prevBtn) return;
  selectors.prevBtn.disabled = currentStep === 0;
  const shouldDisable =
    !getStepValidity(currentStep) || submitCooldownActive || priceInvalidFields.size > 0;
  selectors.nextBtn.disabled = shouldDisable;

  if (currentStep === selectors.steps.length - 1) {
    selectors.nextBtn.textContent = isSubmitting ? "Submitting..." : "Place order";
  } else if (currentStep === selectors.steps.length - 2) {
    selectors.nextBtn.textContent = "Confirm details";
  } else {
    selectors.nextBtn.textContent = "Next step";
  }
};

const showStep = (index) => {
  const nextIndex = Math.max(0, Math.min(selectors.steps.length - 1, index));
  if (nextIndex === currentStep) {
    updateNavButtons();
    return;
  }
  const direction = nextIndex > currentStep ? "right" : "left";
  const currentEl = selectors.steps[currentStep];
  const nextEl = selectors.steps[nextIndex];
  if (currentEl) {
    currentEl.classList.remove("is-active");
    currentEl.classList.add(direction === "right" ? "is-exit-left" : "is-exit-right");
    window.setTimeout(() => currentEl.classList.remove("is-exit-left", "is-exit-right"), 500);
  }
  if (nextEl) {
    nextEl.classList.add("is-active");
  }
  currentStep = nextIndex;
  state.stepIndex = currentStep;
  saveState();
  updateProgressState();
  updateStepAccessibility();
  updateNavButtons();
  updateReview();
  focusFirstElement(nextIndex);
};

const serializeAddOns = (addOns) => {
  try {
    return JSON.stringify(addOns);
  } catch (error) {
    console.warn("order-page: unable to serialize addOns", error);
    return "";
  }
};

const formatAddress = (address) => {
  const parts = [];
  if (address.line1) parts.push(address.line1);
  if (address.line2) parts.push(address.line2);
  const cityState = [address.city, address.state].filter(Boolean).join(", ");
  const finalLine = [cityState, address.postal].filter(Boolean).join(" ");
  if (finalLine) parts.push(finalLine);
  return parts.join(", ");
};

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
  if (!sb || !currentUser) {
    showToast("You need to be signed in before placing an order.", "error");
    return;
  }
  if (isSubmitting) return;
  isSubmitting = true;
  updateNavButtons();

  const quote = state.priceQuote || estimatePrice(state.priceConfig);
  const addOnsTotal = state.addOns.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  const combinedExact = roundCurrency((quote.totalExact ?? quote.totalRounded) + addOnsTotal, 2);
  const combinedRounded = Math.round(combinedExact);
  const captureSummaryParts = [
    `${quote.config.sqft} sq ft`,
    quote.config.environment,
    quote.config.tier
  ];
  if (quote.config.rush) captureSummaryParts.push("rush");
  const captureSummary = `Custom Quote · ${captureSummaryParts.join(" · ")}`;

  const payload = {
    account_email_attached: currentUser.email,
    capturing: captureSummary,
    address: formatAddress(state.address),
    gate_codes: state.gateCodes || "",
    scope: state.scope || "",
    date: state.date,
    capture_time: state.time,
    addons: serializeAddOns(state.addOns),
    sqft: quote.config.sqft,
    distance_miles: quote.config.distance,
    environment: quote.config.environment,
    tier: quote.config.tier,
    rush: quote.config.rush,
    base_fee: roundCurrency(quote.baseFee, 2),
    travel_fee: roundCurrency(quote.travelFee, 2),
    scan_fee: roundCurrency(quote.scanFee, 2),
    modifiers: quote.modifiers,
    subtotal: roundCurrency(quote.subtotal, 2),
    multiplier: quote.multiplier,
    quote_total: quote.totalRounded,
    addons_total: roundCurrency(addOnsTotal, 2),
    total_rounded: combinedRounded,
    total_exact: combinedExact,
    user_email: currentUser.email ?? null,
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
    currentStep = 0;
    syncAddOnsUI();
    applyStateToInputs();
    updateTotal();
    updateReview();
    selectors.steps.forEach((step, index) => step.classList.toggle("is-active", index === 0));
    updateProgressState();
    updateStepAccessibility();
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

const goToNextStep = () => {
  if (!getStepValidity(currentStep)) {
    const stepEl = selectors.steps[currentStep];
    if (stepEl) {
      const firstInvalid = stepEl.querySelector(
        "input:invalid, textarea:invalid, select:invalid"
      );
      firstInvalid?.reportValidity?.();
    }
    updateNavButtons();
    return;
  }
  if (currentStep === selectors.steps.length - 1) {
    submitOrder();
    return;
  }
  showStep(currentStep + 1);
};

const goToPrevStep = () => {
  if (currentStep === 0) return;
  showStep(currentStep - 1);
};

const renderGate = (session) => {
  const user = session?.user ?? null;
  currentUser = user;
  const isLoggedIn = Boolean(user);
  if (selectors.gate) selectors.gate.hidden = isLoggedIn;
  if (selectors.wizard && (!selectors.success || selectors.success.hidden)) {
    selectors.wizard.hidden = !isLoggedIn;
  }
  if (!isLoggedIn) {
    if (selectors.success) selectors.success.hidden = true;
    if (selectors.wizard) selectors.wizard.hidden = true;
  } else {
    if (selectors.gate) selectors.gate.hidden = true;
    if (selectors.success && !selectors.success.hidden) {
      selectors.wizard.hidden = true;
      return;
    }
    if (selectors.wizard) selectors.wizard.hidden = false;
    syncAddOnsUI();
    applyStateToInputs();
    updateTotal();
    updateReview();
    updateNavButtons();
  }
};

const handleSharedAuthEvent = (event) => {
  const session = event?.detail?.session ?? null;
  renderGate(session);
};

window.addEventListener(AUTH_EVENT_NAME, handleSharedAuthEvent);

const applyStateToInputs = () => {
  const addressInputs = document.querySelectorAll("[data-address-field]");
  addressInputs.forEach((input) => {
    const key = input.getAttribute("data-address-field");
    if (key && key in state.address) {
      input.value = state.address[key] || "";
    }
  });
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
  if (selectors.priceEstimator) {
    const priceInputs = selectors.priceEstimator.querySelectorAll("[data-price-input]");
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
    updatePriceUI(state.priceQuote, { animate: false });
    resetPriceInputs();
    updateNavButtons();
  }
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
  document.querySelectorAll("[data-address-field]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const target = event.currentTarget;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
        return;
      }
      const key = target.getAttribute("data-address-field");
      if (!key) return;
      setAddressField(key, target.value);
    });
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

  selectors.nextBtn?.addEventListener("click", () => goToNextStep());
  selectors.prevBtn?.addEventListener("click", () => goToPrevStep());
};

const initSupabase = async () => {
  currentStep = Math.max(
    0,
    Math.min(selectors.steps.length - 1, Number(state.stepIndex) || 0)
  );
  selectors.steps.forEach((step, index) => step.classList.toggle("is-active", index === currentStep));
  updateProgressState();
  updateStepAccessibility();
  syncAddOnsUI();
  applyStateToInputs();
  updateTotal();
  updateReview();
  updateNavButtons();

  const sharedSession = window.__remnantAuthSession ?? null;
  if (sharedSession) {
    renderGate(sharedSession);
  }

  if (!sb) {
    console.warn("Supabase client not available for order page.");
    return;
  }

  try {
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    const session = data?.session ?? (window.__remnantAuthSession ?? null);
    renderGate(session);
  } catch (error) {
    console.warn("order-page: unable to fetch session", error);
    const fallbackSession = window.__remnantAuthSession ?? null;
    renderGate(fallbackSession);
  }

  sb.auth.onAuthStateChange((_event, session) => {
    renderGate(session ?? null);
  });
};

const formatAddressForSubmission = () => formatAddress(state.address);

const init = () => {
  loadState();
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
