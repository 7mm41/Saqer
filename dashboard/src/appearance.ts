/** Light / dark: follows the device unless chosen in the menu (remembered on this device). */
export type Appearance = 'light' | 'dark' | null;

const KEY = 'sarena.admin.appearance';

export function storedAppearance(): Appearance {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Applies the look and keeps the phone's bars in the page colour: the
 * theme-color tags follow the device setting, so a manual choice overrides
 * both of them with the chosen background.
 */
export function applyAppearance(appearance: Appearance) {
  const root = document.documentElement;
  if (appearance) root.dataset.theme = appearance;
  else delete root.dataset.theme;
  const background = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.dataset.initial ??= meta.content;
    meta.content = appearance && background ? background : meta.dataset.initial;
  });
  try {
    if (appearance) localStorage.setItem(KEY, appearance);
    else localStorage.removeItem(KEY);
  } catch { /* storage blocked */ }
}
