// ----- COMING SOON MODAL -----
const comingSoonModal = document.querySelector("[data-coming-soon-modal]");
const comingSoonClose = comingSoonModal?.querySelector("[data-modal-close]");

const closeComingSoonModal = () => {
  if (!comingSoonModal) return false;
  if (comingSoonModal.getAttribute("data-modal-open") !== "true") return false;
  comingSoonModal.setAttribute("data-modal-open", "false");
  comingSoonModal.setAttribute("aria-hidden", "true");
  return true;
};

if (comingSoonModal) {
  comingSoonModal.setAttribute("aria-hidden", "false");
  comingSoonClose?.addEventListener("click", closeComingSoonModal);
  comingSoonModal.addEventListener("click", (event) => {
    if (event.target === comingSoonModal) closeComingSoonModal();
  });
  window.setTimeout(() => comingSoonClose?.focus({ preventScroll: true }), 0);
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
