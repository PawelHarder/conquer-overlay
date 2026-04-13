// Conquer Overlay — i18n module
// Supports en, pl, de, es, fr. Locale is persisted in localStorage under 'locale'.
// HTML elements use data-i18n="key" (textContent) and data-i18n-placeholder="key" (placeholder).
// JS code calls t('key', 'fallback') for dynamic strings.

import en from '../../locales/en.json';
import pl from '../../locales/pl.json';
import de from '../../locales/de.json';
import es from '../../locales/es.json';
import fr from '../../locales/fr.json';

const LOCALES = { en, pl, de, es, fr };

let currentLocale = 'en';

export function getCurrentLocale() {
  return currentLocale;
}

/** Look up a translation key. Falls back to en, then to the fallback argument. */
export function t(key, fallback = '') {
  return LOCALES[currentLocale]?.[key] ?? LOCALES.en?.[key] ?? fallback;
}

/** Change locale, persist to localStorage, and re-translate all marked elements. */
export function setLocale(locale) {
  if (!LOCALES[locale]) return;
  currentLocale = locale;
  localStorage.setItem('locale', locale);
  applyTranslations();
}

/** Read saved locale and translate the DOM. Call once after partials are injected. */
export function initI18n() {
  const saved = localStorage.getItem('locale');
  if (saved && LOCALES[saved]) currentLocale = saved;
  applyTranslations();
}

/** Translate all elements with data-i18n, data-i18n-placeholder, and data-i18n-title attributes. */
export function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const text = t(el.dataset.i18n);
    if (text) el.textContent = text;
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const text = t(el.dataset.i18nPlaceholder);
    if (text) el.placeholder = text;
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const text = t(el.dataset.i18nTitle);
    if (text) el.title = text;
  });

  const pickerTip = t('tip.hotkey_picker');
  if (pickerTip) document.querySelectorAll('.hotkey-picker-btn').forEach(el => { el.title = pickerTip; });

  const clearTip = t('tip.hotkey_clear_btn');
  if (clearTip) document.querySelectorAll('.hotkey-clear-btn').forEach(el => { el.title = clearTip; });
}
