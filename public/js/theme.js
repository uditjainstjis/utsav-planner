// @ts-check
/** The light/dark toggle, remembered on this device when storage allows. */
import { els } from './dom.js';

const THEME_KEY = 'utsav:theme';

/** @param {string | null} theme */
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme) root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
  const isDark =
    theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
  // State travels on aria-pressed only; the label names what the button does.
  els.themeToggle.setAttribute('aria-pressed', String(isDark));
}

/** Apply the saved theme, and let the toggle switch it. */
export function wireTheme() {
  try {
    applyTheme(localStorage.getItem(THEME_KEY));
  } catch {
    applyTheme(null);
  }
  els.themeToggle.addEventListener('click', () => {
    const isDark = els.themeToggle.getAttribute('aria-pressed') === 'true';
    const next = isDark ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* preference is a convenience; the app works without it */
    }
  });
}
