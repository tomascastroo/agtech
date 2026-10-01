'use client';

/**
 * Abre una URL firmada (de vida corta) en una pestaña nueva. La pestaña se abre de forma
 * sincrónica con el clic para que el navegador no la bloquee y luego se dirige a la URL.
 */
export async function openSignedUrl(resolve: () => Promise<{ url: string }>): Promise<void> {
  const tab = window.open('about:blank', '_blank');
  try {
    const { url } = await resolve();
    if (tab) {
      tab.opener = null;
      tab.location.href = url;
    } else {
      window.location.assign(url);
    }
  } catch (error) {
    tab?.close();
    throw error;
  }
}
