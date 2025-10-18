const SUPABASE_URL = "https://vtzwjjzmptokrxslfbra.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0endqanptcHRva3J4c2xmYnJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2NDk3OTIsImV4cCI6MjA3NjIyNTc5Mn0.g-iatnLPgDERvKcMahD545_qMdYIFDlLeylqtRMz2AM";
const sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

const STORAGE_KEY = "remnantOrderDraft";
const SUBMIT_COOLDOWN_MS = 3500;
const TOAST_DURATION_MS = 5200;
const PROGRESSIVE_FIELDS = [
  "package",
  "address",
  "gateCodes",
  "scope",
  "date",
  "time",
  "addOns",
  "confirmAcknowledged",
  "stepIndex"
];

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
  toastContainer: document.querySelector(".toast-container")
};

const defaultState = () => ({
  package: "",
  packagePrice: 0,
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
    } else if (incoming[key] !== undefined) {
      next[key] = incoming[key];
    }
  }
  next.package = incoming.package || "";
  next.packagePrice = Number(incoming.packagePrice) || 0;
  next.confirmAcknowledged = Boolean(incoming.confirmAcknowledged);
  const maybeStep = Number(incoming.stepIndex);
  next.stepIndex = Number.isFinite(maybeStep) ? Math.max(0, maybeStep) : 0;
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

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);

const computeTotal = () => {
  const addOnsTotal = state.addOns.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  return Number(state.packagePrice || 0) + addOnsTotal;
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
      track.style.transform = `translateY(-${target * 100}%)`;
    });
  });

  selectors.odometer.innerHTML = "";
  selectors.odometer.appendChild(container);
};

const updateTotal = () => {
  const total = computeTotal();
  renderOdometer(total);
};

const setPackageSelection = (value, price) => {
  state.package = value;
  state.packagePrice = Number(price) || 0;
  saveState();
  updateTotal();
  updateReview();
  updateProgressState();
  updateNavButtons();
};

const syncPackageUI = () => {
  const inputs = document.querySelectorAll('[data-package-options] input[type="radio"]');
  inputs.forEach((input) => {
    const label = input.closest("label");
    if (!label) return;
    if (input.value === state.package) {
      input.checked = true;
      label.classList.add("is-selected");
    } else {
      label.classList.remove("is-selected");
    }
  });
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

  addItem("Package", state.package || "Not selected");
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
  addItem("Estimated total", formatCurrency(computeTotal()));
};

const getStepValidity = (index) => {
  switch (index) {
    case 0:
      return Boolean(state.package);
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
  const shouldDisable = !getStepValidity(currentStep) || submitCooldownActive;
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

  const payload = {
    account_email_attached: currentUser.email,
    capturing: state.package,
    address: formatAddress(state.address),
    gate_codes: state.gateCodes || "",
    scope: state.scope || "",
    date: state.date,
    capture_time: state.time,
    addons: serializeAddOns(state.addOns)
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
    syncPackageUI();
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
    syncPackageUI();
    syncAddOnsUI();
    applyStateToInputs();
    updateTotal();
    updateReview();
    updateNavButtons();
  }
};

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
  document
    .querySelectorAll('[data-package-options] input[type="radio"]')
    .forEach((input) => {
      input.addEventListener("change", (event) => {
        const target = event.currentTarget;
        if (!(target instanceof HTMLInputElement)) return;
        setPackageSelection(target.value, target.dataset.price);
        syncPackageUI();
        showToast(`Package locked: ${target.value}`, "info", { duration: 2800 });
      });
    });

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
  loadState();
  currentStep = Math.max(
    0,
    Math.min(selectors.steps.length - 1, Number(state.stepIndex) || 0)
  );
  selectors.steps.forEach((step, index) => step.classList.toggle("is-active", index === currentStep));
  updateProgressState();
  updateStepAccessibility();
  syncPackageUI();
  syncAddOnsUI();
  applyStateToInputs();
  updateTotal();
  updateReview();
  updateNavButtons();

  if (!sb) {
    console.warn("Supabase client not available for order page.");
    return;
  }

  try {
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    renderGate(data?.session ?? null);
  } catch (error) {
    console.warn("order-page: unable to fetch session", error);
    renderGate(null);
  }

  sb.auth.onAuthStateChange((_event, session) => {
    renderGate(session ?? null);
  });
};

const formatAddressForSubmission = () => formatAddress(state.address);

const init = () => {
  initMemoryOrb();
  initEventListeners();
  initSupabase();
};

window.addEventListener("DOMContentLoaded", init);

// Expose helpers for debugging/testing
window.__remnantOrder = {
  getState: () => ({ ...state }),
  formatAddress,
  serializeAddOns,
  formatAddressForSubmission
};
