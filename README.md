# FutureMakers Academy: FutureMakers Weekend landing page

One static landing page: plain HTML, CSS and ES modules. No build step, no dependencies, no backend.
Deploy the folder as-is to any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages, S3).

```
npm start        # preview at http://localhost:8080
npm test         # pricing unit tests + reference validation
```

## Where things are

| What | Where |
| --- | --- |
| **All editable content** (brand, dates, session times, prices, checkout URLs, contact, posters, FAQ, recording policy) | `js/config.js` |
| Page markup | `index.html` |
| Styles, colour tokens (`:root`) | `css/styles.css` |
| Pricing logic (pure functions) | `js/pricing.js` |
| Interactions, form, FAQ rendering | `js/main.js` |
| Original artwork | `assets/svg/` (`nib.svg` mascot, `business-scene.svg`, `ai-scene.svg`, `sprite.svg` icon set) |
| Self-hosted fonts | `assets/fonts/` (Bricolage Grotesque, DM Sans, Caveat) |
| Share image, favicons | `assets/og/`, `assets/favicon*.{svg,png}`, `assets/apple-touch-icon.png` |

Search `js/config.js` for `TODO(confirm)` to find every value still waiting for a decision.

## Before going live

1. **Checkout URLs**: fill `PAYMENT_URLS` in `js/config.js` (six links, USD and NGN). While empty, "Continue to payment" validates the form and then shows an honest "payment is not switched on" message. It never pretends a payment happened.
2. **Parent details**: without `REGISTRATION.formEndpoint`, details are validated but not stored. Add a form endpoint (e.g. Formspree) or capture details at checkout.
3. **Session times and time zones**: `SESSION_TIMES`.
4. **Contact email, privacy, terms, cancellation/refund links**: `CONTACT`.
5. **Final domain**: set `BRAND.siteUrl`, and change `og:image` / add `og:url` in `index.html` to absolute URLs.
6. **FAQ items flagged "Needs confirmation"**: edit in `FAQ`, then set `DEV.showReviewFlags = false`.
7. **Posters**: put the files in `assets/posters/`, set `POSTERS.weekend`. Set `DEV.showPosterSlots = false` to hide the empty slot meanwhile.
8. Confirm whether tickets are **per child** (`PRICE_IS_PER_CHILD`) and whether UK families pay in USD.

## Regenerating images
`tools/make-images.mjs` rebuilds the share image and PNG icons (needs Playwright; dev only).
