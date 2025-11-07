import React from 'react';
import { createRoot } from 'react-dom/client';
import LightRays from './light.js';

const DEFAULT_PROPS = {
  raysOrigin: 'top-center',
  raysColor: '#00ffff',
  raysSpeed: 1.5,
  lightSpread: 0.8,
  rayLength: 1.2,
  followMouse: true,
  mouseInfluence: 0.1,
  noiseAmount: 0.1,
  distortion: 0.05,
  className: ''
};

const ROOT_KEY = Symbol('lightRaysRoot');
const prefersReducedMotion = typeof window !== 'undefined' && 'matchMedia' in window
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;

const parseConfig = (mount) => {
  const attr = mount.getAttribute('data-light-rays-config');
  if (!attr) return {};
  try {
    return JSON.parse(attr);
  } catch (error) {
    console.warn('[LightRays] Failed to parse config JSON:', error);
    return {};
  }
};

const cleanupMount = (mount) => {
  if (!mount[ROOT_KEY]) return;
  mount[ROOT_KEY].unmount();
  delete mount[ROOT_KEY];
  mount.textContent = '';
};

const hydrate = (mount) => {
  if (mount[ROOT_KEY]) return;

  const config = parseConfig(mount);
  const props = { ...DEFAULT_PROPS, ...config };
  const composedClass = ['embedded-light-rays', props.className].filter(Boolean).join(' ');

  const root = createRoot(mount);
  root.render(React.createElement(LightRays, { ...props, className: composedClass }));
  mount[ROOT_KEY] = root;
};

const initLightRays = () => {
  const mounts = document.querySelectorAll('[data-light-rays]');
  if (!mounts.length) return;

  if (prefersReducedMotion?.matches) {
    mounts.forEach(cleanupMount);
    return;
  }

  mounts.forEach(hydrate);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLightRays);
} else {
  initLightRays();
}

if (prefersReducedMotion) {
  const listener = () => initLightRays();
  if (typeof prefersReducedMotion.addEventListener === 'function') {
    prefersReducedMotion.addEventListener('change', listener);
  } else if (typeof prefersReducedMotion.addListener === 'function') {
    prefersReducedMotion.addListener(listener);
  }
}
