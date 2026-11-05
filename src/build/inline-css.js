/**
 * Puts the site stylesheet straight into each page (<style>) instead of a separate render-blocking
 * request, and preloads the Latin font files so the browser fetches them in parallel with the page.
 * The admin page keeps its normal stylesheet.
 */
export function inlineCss() {
  return {
    name: 'jjel-inline-css',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle || /admin\.html$/.test(ctx.filename)) return html;
        const fonts = new Set();
        html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/g, (tag, file) => {
          const asset = ctx.bundle[file];
          if (!asset || asset.type !== 'asset') return tag;
          const css = String(asset.source)
            .replace(/url\(\.\/([^)]+)\)/g, (_, f) => `url(./assets/${f})`)
            .replace(/<\/style/gi, '<\\/style');
          for (const m of css.matchAll(/url\(\.\/(assets\/[\w.-]*-latin-\d+-normal-[\w-]+\.woff2)\)/g)) fonts.add(m[1]);
          return `<style>${css}</style>`;
        });
        const preloads = [...fonts]
          .map((f) => `<link rel="preload" href="./${f}" as="font" type="font/woff2" crossorigin />`)
          .join('\n    ');
        // Scripts are deferred anyway; a low priority keeps them off the critical request chain.
        html = html.replace(/<script type="module"(?![^>]*fetchpriority)/g, '<script type="module" fetchpriority="low"');
        html = html.replace(/<link rel="modulepreload"(?![^>]*fetchpriority)/g, '<link rel="modulepreload" fetchpriority="low"');
        return preloads ? html.replace('<style>', `${preloads}\n    <style>`) : html;
      },
    },
  };
}
