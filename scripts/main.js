// ----- COMING SOON MODAL -----
const COMING_SOON_STORAGE_KEY = "remnantComingSoonDismissed";
const comingSoonModal = document.querySelector("[data-coming-soon-modal]");
const comingSoonClose = comingSoonModal?.querySelector("[data-modal-close]");

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
  }

  comingSoonClose?.addEventListener("click", closeComingSoonModal);
  comingSoonModal.addEventListener("click", (event) => {
    if (event.target === comingSoonModal) closeComingSoonModal();
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

if (window?.supabase && authStatusEl && authEmailEl) {
  const SUPABASE_URL = "https://vtzwjjzmptokrxslfbra.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0endqanptcHRva3J4c2xmYnJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2NDk3OTIsImV4cCI6MjA3NjIyNTc5Mn0.g-iatnLPgDERvKcMahD545_qMdYIFDlLeylqtRMz2AM";

  const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  const renderAuthStatus = (session) => {
    const email = session?.user?.email;
    if (!email) {
      authEmailEl.textContent = "";
      authStatusEl.hidden = true;
      return;
    }
    authEmailEl.textContent = email;
    authStatusEl.hidden = false;
  };

  sbClient.auth.getSession().then(({ data }) => renderAuthStatus(data?.session));
  sbClient.auth.onAuthStateChange((_event, session) => renderAuthStatus(session));
}
