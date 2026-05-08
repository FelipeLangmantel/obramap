/**
 * Escape values before embedding them into raw HTML strings used by
 * `document.write()` / `window.open()` print templates.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Allow only safe CSS color tokens (hex, rgb/rgba/hsl/hsla, named).
 * Anything else falls back to neutral gray.
 */
export function safeCssColor(value: unknown): string {
  const v = String(value ?? "").trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v;
  if (/^(rgb|rgba|hsl|hsla)\(\s*[\d.,%\s/]+\s*\)$/i.test(v)) return v;
  if (/^[a-zA-Z]{1,30}$/.test(v)) return v;
  return "#9ca3af";
}
