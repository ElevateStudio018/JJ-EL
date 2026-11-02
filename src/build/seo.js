import { readdirSync } from 'node:fs';

/**
 * Domain-specific output for the production site (default https://jjel.se/, override with SITE_URL):
 * absolute og:image URLs ({{siteUrl}} in the HTML), a canonical link per page, and sitemap.xml /
 * robots.txt listing every public page. The admin page is kept out of search engines.
 */
export function seo({ root, siteUrl = process.env.SITE_URL || 'https://jjel.se/' }) {
  const base = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
  const PRIVATE = new Set(['admin.html']);
  const pages = readdirSync(root).filter((f) => f.endsWith('.html') && !PRIVATE.has(f)).sort();
  const pageUrl = (file) => (file === 'index.html' ? base : base + file);

  return {
    name: 'seo',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const file = ctx.filename.split(/[\\/]/).pop();
        html = html.replaceAll('{{siteUrl}}', base);
        if (PRIVATE.has(file)) return html;
        return html.replace('</head>', `  <link rel="canonical" href="${pageUrl(file)}" />\n  </head>`);
      },
    },
    generateBundle() {
      const urls = pages.map((f) => `  <url><loc>${pageUrl(f)}</loc></url>`).join('\n');
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\nDisallow: /admin.html\n\nSitemap: ${base}sitemap.xml\n`,
      });
    },
  };
}
