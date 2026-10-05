/**
 * Devuelve `next` solo si es una ruta interna del mismo origen; si no, null.
 * Rechaza `//host`, `/\host` (los navegadores tratan "\" como "/"), esquemas y caracteres de control.
 */
export function safeInternalPath(next: string | null | undefined): string | null {
  if (!next || next.length > 512) return null;
  if (!next.startsWith('/') || next.startsWith('//')) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return null;
  try {
    const base = 'https://agrogarantias.invalid';
    const url = new URL(next, base);
    if (url.origin !== base) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
