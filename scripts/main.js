// Optional travel lookup configuration; update with your hub coordinates and ORS API key.
window.__remnantTravelConfig = window.__remnantTravelConfig || {
  hubLat: 33.498225,
  hubLng: -117.103128,
  apiKey: "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImRlM2QwNjUzZWI1ZDQ5Zjg5YTE4ZDE1MTIyZDkyN2NiIiwiaCI6Im11cm11cjY0In0=",
  mode: "client" // set to "client" to use browser fallback only, or "auto" to try the API route first
};

// ----- COMING SOON MODAL -----
const COMING_SOON_STORAGE_KEY = "remnantComingSoonDismissed";
const comingSoonModal = document.querySelector("[data-coming-soon-modal]");
const comingSoonClose = comingSoonModal?.querySelector("[data-modal-close]");

const comingSoonDismissedCallbacks = [];
let comingSoonHasBeenDismissed = false;

const triggerComingSoonDismissed = () => {
  if (comingSoonHasBeenDismissed) return;
  comingSoonHasBeenDismissed = true;
  while (comingSoonDismissedCallbacks.length) {
    const callback = comingSoonDismissedCallbacks.shift();
    try {
      callback?.();
    } catch (error) {
      console.error("Remnant coming soon dismissal callback failed:", error);
    }
  }
};

const onComingSoonDismissed = (callback) => {
  if (typeof callback !== "function") return;
  if (comingSoonHasBeenDismissed) {
    callback();
  } else {
    comingSoonDismissedCallbacks.push(callback);
  }
};

const markComingSoonDismissed = () => {
  try {
    window.localStorage?.setItem(COMING_SOON_STORAGE_KEY, "true");
  } catch (error) {
    // Ignore storage limitations (private mode, etc.)
  }
};

const hasDismissedComingSoon = () => {
  try {
    return window.localStorage?.getItem(COMING_SOON_STORAGE_KEY) === "true";
  } catch (error) {
    return false;
  }
};

const closeComingSoonModal = () => {
  if (!comingSoonModal) return false;
  if (comingSoonModal.getAttribute("data-modal-open") !== "true") return false;
  comingSoonModal.setAttribute("data-modal-open", "false");
  comingSoonModal.setAttribute("aria-hidden", "true");
  markComingSoonDismissed();
  triggerComingSoonDismissed();
  return true;
};

const openComingSoonModal = () => {
  if (!comingSoonModal) return false;
  comingSoonModal.setAttribute("data-modal-open", "true");
  comingSoonModal.setAttribute("aria-hidden", "false");
  window.setTimeout(() => comingSoonClose?.focus({ preventScroll: true }), 0);
  return true;
};

if (comingSoonModal) {
  if (!hasDismissedComingSoon()) {
    openComingSoonModal();
  } else {
    comingSoonModal.setAttribute("data-modal-open", "false");
    comingSoonModal.setAttribute("aria-hidden", "true");
    triggerComingSoonDismissed();
  }

  comingSoonClose?.addEventListener("click", closeComingSoonModal);
  comingSoonModal.addEventListener("click", (event) => {
    if (event.target === comingSoonModal) closeComingSoonModal();
  });
} else {
  triggerComingSoonDismissed();
}

// ----- COOKIE CONSENT BANNER -----
const COOKIE_STORAGE_KEY = "remnantEssentialCookiesAcknowledged";
const cookieBanner = document.querySelector("[data-cookie-banner]");
const cookieDismiss = document.querySelector("[data-cookie-dismiss]");

const setCookieBannerVisibility = (visible) => {
  if (!cookieBanner) return;
  cookieBanner.setAttribute("data-visible", visible ? "true" : "false");
  cookieBanner.setAttribute("aria-hidden", visible ? "false" : "true");
};

const markCookieConsent = () => {
  try {
    window.localStorage?.setItem(COOKIE_STORAGE_KEY, "true");
  } catch (error) {
    // Ignore storage limitations (private mode, etc.)
  }
};

const hasCookieConsent = () => {
  try {
    return window.localStorage?.getItem(COOKIE_STORAGE_KEY) === "true";
  } catch (error) {
    return false;
  }
};

const showCookieBanner = () => setCookieBannerVisibility(true);
const hideCookieBanner = () => setCookieBannerVisibility(false);

const maybeShowCookieBanner = () => {
  if (!cookieBanner) return;
  if (hasCookieConsent()) {
    hideCookieBanner();
  } else {
    showCookieBanner();
  }
};

if (cookieDismiss) {
  cookieDismiss.addEventListener("click", () => {
    markCookieConsent();
    hideCookieBanner();
  });
}

if (cookieBanner) {
  hideCookieBanner();
  onComingSoonDismissed(() => {
    window.setTimeout(maybeShowCookieBanner, 400);
  });
}

// ----- NAV MENU (runs regardless of heroScene) -----
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const nav = document.querySelector(".nav");
const navToggle = document.querySelector(".nav__toggle");
const navLinks = document.querySelector(".nav__links");

const setNavState = (expanded) => {
  if (!navToggle || !navLinks) return;
  navToggle.setAttribute("aria-expanded", String(expanded));
  navLinks.setAttribute("data-open", String(expanded));
  navLinks.style.removeProperty("max-height");
};

const enableDesktopNav = () => {
  if (!navLinks) return;
  navLinks.setAttribute("data-open", "true");
  navToggle?.setAttribute("aria-expanded", "false");
  navLinks.style.removeProperty("max-height");
};

const mq = window.matchMedia("(max-width: 840px)");
const applyMode = () => (mq.matches ? setNavState(false) : enableDesktopNav());
mq.addEventListener("change", applyMode);
applyMode();

navToggle?.addEventListener("click", () => {
  const expanded = navToggle.getAttribute("aria-expanded") === "true";
  setNavState(!expanded);
});

navLinks?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    if (mq.matches) setNavState(false);
  });
});

// Close on Esc
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (closeComingSoonModal()) return;
  if (nav && navLinks?.getAttribute("data-open") === "true") setNavState(false);
});

// Close when clicking outside
document.addEventListener("click", (e) => {
  if (mq.matches && nav && !nav.contains(e.target) && navLinks?.getAttribute("data-open") === "true") {
    setNavState(false);
  }
});

// ----- HERO SCENE (safe dynamic import so it can't break the menu) -----
(async () => {
  const heroCanvas = document.querySelector("[data-hero-canvas]");
  const heroContainer = document.querySelector("[data-hero-container]");
  const heroPoster = document.querySelector("[data-hero-poster]");
  const fallback = document.querySelector("[data-hero-fallback]");
  let cleanupScene = null;

  const showFallback = () => {
    fallback?.setAttribute("data-visible", "true");
    if (fallback) fallback.style.display = "flex";
    if (heroCanvas) heroCanvas.style.display = "none";
    heroPoster?.setAttribute("data-visible", "true");
    heroPoster?.setAttribute("aria-hidden", "false");
  };

  try {
    const mod = await import("./heroScene.js"); // <-- won’t kill the whole file if it fails
    const { initHeroScene, supportsWebGL } = mod;

    const enableHero = () => {
      if (!heroCanvas || !heroContainer || !supportsWebGL() || prefersReducedMotion.matches) {
        showFallback();
        return;
      }
      if (fallback) {
        fallback.style.display = "none";
        fallback.setAttribute("data-visible", "false");
      }
      heroCanvas.style.display = "block";
      heroPoster?.setAttribute("data-visible", "false");
      heroPoster?.setAttribute("aria-hidden", "true");
      cleanupScene = initHeroScene(heroCanvas, heroContainer);
    };

    enableHero();

    prefersReducedMotion.addEventListener("change", () => {
      cleanupScene?.cleanup?.();
      cleanupScene = null;
      enableHero();
    });

    window.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        cleanupScene?.cleanup?.();
      } else if (!cleanupScene && !prefersReducedMotion.matches && supportsWebGL()) {
        cleanupScene = initHeroScene(heroCanvas, heroContainer);
      }
    });
  } catch (err) {
    // If heroScene.js is missing or errors, gracefully show fallback and keep nav working
    console.warn("heroScene.js failed to load:", err);
    showFallback();
  }
})();

// ----- ELEVENLABS WIDGET (unchanged, but guarded) -----
const convaiWidget = document.querySelector("[data-convai-widget] elevenlabs-convai");
if (convaiWidget) {
  const enforceStaticPlacement = () => {
    convaiWidget.style.position = "static";
    convaiWidget.style.inset = "auto";
    convaiWidget.style.margin = "0";
    convaiWidget.style.transform = "none";
    convaiWidget.style.width = "100%";
    convaiWidget.style.height = "100%";
  };
  enforceStaticPlacement();
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "attributes" && m.attributeName === "style") enforceStaticPlacement();
    }
  });
  observer.observe(convaiWidget, { attributes: true, attributeFilter: ["style"] });
  window.addEventListener("beforeunload", () => observer.disconnect(), { once: true });
}

// ----- AUTH STATUS (HOME NAV) -----
const authStatusEl = document.querySelector("[data-auth-status]");
const authEmailEl = document.querySelector("[data-auth-email]");
const authVisibilityEls = document.querySelectorAll("[data-auth-visible]");

if (window?.supabase && (authStatusEl || authVisibilityEls.length > 0)) {
  const SUPABASE_URL = "https://vtzwjjzmptokrxslfbra.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0endqanptcHRva3J4c2xmYnJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2NDk3OTIsImV4cCI6MjA3NjIyNTc5Mn0.g-iatnLPgDERvKcMahD545_qMdYIFDlLeylqtRMz2AM";

  const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  const authEventName = "remnant:auth-state";
  const dispatchAuthState = (session) => {
    window.__remnantAuthSession = session ?? null;
    try {
      window.dispatchEvent(new CustomEvent(authEventName, { detail: { session: session ?? null } }));
    } catch (error) {
      // Older browsers may not support CustomEvent; fall back quietly.
      if (typeof document?.createEvent === "function") {
        const legacyEvent = document.createEvent("CustomEvent");
        legacyEvent.initCustomEvent(authEventName, false, false, { session: session ?? null });
        window.dispatchEvent(legacyEvent);
      }
    }
  };

  const handleLogoutClick = async (event) => {
    event.preventDefault();
    const trigger = event.currentTarget;
    if (trigger instanceof HTMLButtonElement) {
      trigger.disabled = true;
    }
    try {
      await sbClient.auth.signOut();
    } catch (error) {
      console.warn("Unable to sign out of Supabase session", error);
    } finally {
      const redirect = trigger instanceof HTMLElement ? trigger.dataset.logoutRedirect : undefined;
      if (!redirect || redirect.toLowerCase() === "reload") {
        window.location.reload();
      } else {
        window.location.href = redirect;
      }
    }
  };

  const bindLogoutButtons = () => {
    document.querySelectorAll("[data-logout]").forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.dataset.logoutBound === "true") return;
      node.dataset.logoutBound = "true";
      node.addEventListener("click", handleLogoutClick);
    });
  };

  const setAuthVisibilityForNode = (node, shouldShow) => {
    if (!(node instanceof HTMLElement)) return;
    node.classList.toggle("is-auth-hidden", !shouldShow);
    node.toggleAttribute("hidden", !shouldShow);
    if (!shouldShow) {
      node.setAttribute("aria-hidden", "true");
    } else if (node.getAttribute("aria-hidden") === "true") {
      node.removeAttribute("aria-hidden");
    }
  };

  const applyAuthVisibility = (isAuthenticated) => {
    authVisibilityEls.forEach((node) => {
      const visibility = (node.getAttribute("data-auth-visible") || "").toLowerCase();
      if (visibility === "signed-in" || visibility === "authenticated") {
        setAuthVisibilityForNode(node, isAuthenticated);
      } else if (visibility === "signed-out" || visibility === "unauthenticated") {
        setAuthVisibilityForNode(node, !isAuthenticated);
      }
    });
  };

  const renderAuthStatus = (session) => {
    dispatchAuthState(session);
    bindLogoutButtons();
    const email = session?.user?.email || session?.user?.user_metadata?.email || "";
    const isAuthenticated = Boolean(email);
    if (authEmailEl) authEmailEl.textContent = isAuthenticated ? email : "";
    if (authStatusEl) authStatusEl.hidden = !isAuthenticated;
    applyAuthVisibility(isAuthenticated);
  };

  bindLogoutButtons();
  sbClient.auth.getSession().then(({ data }) => renderAuthStatus(data?.session));
  sbClient.auth.onAuthStateChange((_event, session) => renderAuthStatus(session));
}
