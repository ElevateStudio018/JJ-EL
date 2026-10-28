// Markup and values generated from the admin content. Shared by the build (render.js) and the
// browser (live.js), so a page refreshed with newer content looks exactly like a rebuilt one.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** "070-910 75 07" → "+46709107507" */
export const telLink = (phone) => String(phone).replace(/[^\d+]/g, '').replace(/^0/, '+46');

const job = (j) =>
  `<figure class="job" data-reveal><img src="${esc(j.image)}" alt="${esc(j.alt || j.caption)}" loading="lazy" decoding="async" /><figcaption>${esc(j.caption)}</figcaption></figure>`;

export const blocks = {
  quotes: (c) =>
    c.reviews
      .filter((r) => r.featured)
      .map(
        (r) =>
          `<figure class="quote"><blockquote>${esc(r.quote || r.text)}</blockquote><figcaption><span><b>${esc(r.name)}</b><span>${esc(r.source)} · ${esc(r.date)}</span></span></figcaption></figure>`,
      )
      .join(''),
  reviews: (c) =>
    c.reviews
      .map(
        (r) =>
          `<figure class="review" data-reveal><blockquote>”${esc(r.text)}”</blockquote><footer><b>${esc(r.name)}</b> · ${esc(r.date)} · ${esc(r.source)}</footer></figure>`,
      )
      .join(''),
  jobsHome: (c) => c.jobsHome.map(job).join(''),
  jobsAll: (c) => c.jobsAll.map(job).join(''),
};

/** The {{tokens}} used in the HTML pages. */
export const contentVars = (c) => ({
  phone: c.company.phone,
  email: c.company.email,
  tel: telLink(c.company.phone),
  reco: c.rating.reco,
  recoCount: c.rating.recoCount,
  google: c.rating.google,
  'hero.title': c.hero.title,
  'hero.lead': c.hero.lead,
});

/** Exactly the text the sync job writes to content/site.json. */
export const contentText = (c) => `${JSON.stringify(c, null, 2)}\n`;
