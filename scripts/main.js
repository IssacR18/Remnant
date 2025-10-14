import { initHeroScene, supportsWebGL } from "./heroScene.js";

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
);

const navToggle = document.querySelector(".nav__toggle");
const navLinks = document.querySelector(".nav__links");

if (navLinks) {
  navLinks.setAttribute("data-open", window.innerWidth > 840 ? "true" : "false");
}

const closeNav = () => {
  navToggle.setAttribute("aria-expanded", "false");
  navLinks?.setAttribute("data-open", "false");
};

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    const expanded = navToggle.getAttribute("aria-expanded") === "true";
    navToggle.setAttribute("aria-expanded", String(!expanded));
    navLinks.setAttribute("data-open", String(!expanded));
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      if (window.innerWidth <= 840) {
        closeNav();
      }
    });
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 840) {
      navLinks.setAttribute("data-open", "true");
      navToggle.setAttribute("aria-expanded", "false");
    } else {
      navLinks.setAttribute("data-open", "false");
    }
  });
}

const heroCanvas = document.querySelector("[data-hero-canvas]");
const heroContainer = document.querySelector("[data-hero-container]");
const fallback = document.querySelector("[data-hero-fallback]");
let cleanupScene = null;

const enableHero = () => {
  if (!heroCanvas || !heroContainer || !supportsWebGL()) {
    fallback?.setAttribute("data-visible", "true");
    if (fallback) fallback.style.display = "flex";
    if (heroCanvas) heroCanvas.style.display = "none";
    return;
  }

  if (prefersReducedMotion.matches) {
    fallback?.setAttribute("data-visible", "true");
    if (fallback) fallback.style.display = "flex";
    if (heroCanvas) heroCanvas.style.display = "none";
    return;
  }

  if (fallback) fallback.style.display = "none";
  heroCanvas.style.display = "block";
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
