/**
 * FutureMakers Academy: central configuration.
 *
 * Everything a non-developer will need to change lives in this file:
 * brand, dates, session times, prices, checkout URLs, contact details,
 * poster images, recording policy and the FAQ.
 *
 * Search this file for "TODO(confirm)" to find every value that still
 * needs a decision or real data before the site goes public.
 */

export const BRAND = {
  name: 'FutureMakers Academy',
  shortName: 'FutureMakers',
  tagline: 'Learn to build. Learn to create.',
  eventName: 'FutureMakers Weekend',
  // Public web address, used for share links. Leave '' to use the current address.
  siteUrl: '', // TODO(confirm): final domain
};

export const EVENT = {
  business: {
    id: 'business',
    title: 'Young Entrepreneurs Lab',
    shortTitle: 'Business Workshop',
    day: 'Saturday',
    isoDate: '2026-10-24',
    dateLabel: 'Saturday 24 October 2026',
    dayMonth: '24 October',
    shortDate: 'Sat 24 Oct',
  },
  ai: {
    id: 'ai',
    title: 'AI Creators Lab',
    shortTitle: 'AI Workshop',
    day: 'Sunday',
    isoDate: '2026-10-25',
    dateLabel: 'Sunday 25 October 2026',
    dayMonth: '25 October',
    shortDate: 'Sun 25 Oct',
  },
  weekend: {
    id: 'weekend',
    title: 'Full Weekend Pass',
    shortTitle: 'Full Weekend',
    dateLabel: '24–25 October 2026',
    shortDate: '24–25 Oct',
  },
  ages: '6–14',
  duration: 'Approximately 75 minutes',
};

/**
 * Session times are NOT confirmed. Leave `null` until they are.
 * When set, use 24-hour "HH:MM" and name the time zone(s) in `timeZoneNote`.
 */
export const SESSION_TIMES = {
  business: null, // TODO(confirm): e.g. '10:00'
  ai: null, // TODO(confirm): e.g. '10:00'
  timeZoneNote: null, // TODO(confirm): e.g. 'Times shown in Lagos (WAT), New York (ET) and London (BST)'
  unconfirmedText: 'Start times will be confirmed to registered parents.',
};

export const CURRENCIES = {
  usd: {
    code: 'USD',
    symbol: '$',
    locale: 'en-US',
    label: 'US dollars',
    toggleLabel: 'International ($)',
    regionNote: 'Prices in US dollars for families in the US, UK and elsewhere.',
  },
  ngn: {
    code: 'NGN',
    symbol: '₦',
    locale: 'en-NG',
    label: 'Nigerian naira',
    toggleLabel: 'Nigeria (₦)',
    regionNote: 'Nigerian price list, in naira.',
  },
};

/**
 * Prices are set by hand for each price list. No exchange rates are used
 * anywhere. Amounts are whole numbers in the main currency unit.
 */
export const PRICES = {
  usd: { business: 40, ai: 40, weekend: 70 },
  ngn: { business: 60000, ai: 60000, weekend: 100000 },
};

/**
 * Is a ticket per child? The brief does not say. `true` multiplies the
 * price by the number of children entered in the form.
 */
export const PRICE_IS_PER_CHILD = true; // TODO(confirm)

/**
 * Checkout links from your payment provider. Leave '' until you have them.
 * An empty value keeps that checkout switched off: the form shows a clear
 * "payment isn't connected" message and sends the visitor nowhere.
 * No secrets belong here: these must be public hosted-checkout links.
 */
export const PAYMENT_URLS = {
  BUSINESS_PAYMENT_URL_USD: '',
  AI_PAYMENT_URL_USD: '',
  WEEKEND_PAYMENT_URL_USD: '',
  BUSINESS_PAYMENT_URL_NGN: '',
  AI_PAYMENT_URL_NGN: '',
  WEEKEND_PAYMENT_URL_NGN: '',
};

/** Maps (currency, option) to the key above. Do not edit unless you rename the keys. */
export function paymentUrlFor(currency, option) {
  const key = `${option.toUpperCase()}_PAYMENT_URL_${currency.toUpperCase()}`;
  return PAYMENT_URLS[key] || '';
}

export const REGISTRATION = {
  maxChildren: 6,
  /**
   * Optional. A form-handling endpoint (for example a Formspree, Basin or
   * Google Apps Script URL) that receives the parent's details before they
   * are sent on to checkout. Leave '' to skip: details are then only
   * validated in the browser and NOT stored anywhere.
   */
  formEndpoint: '', // TODO(confirm)
  countries: [
    { value: 'NG', label: 'Nigeria', currency: 'ngn' },
    { value: 'US', label: 'United States', currency: 'usd' },
    { value: 'GB', label: 'United Kingdom', currency: 'usd' },
    { value: 'OTHER', label: 'Another country', currency: 'usd' },
  ],
};

export const CONTACT = {
  email: '', // TODO(confirm): e.g. hello@yourdomain.com
  privacyUrl: '', // TODO(confirm)
  termsUrl: '', // TODO(confirm)
  cancellationUrl: '', // TODO(confirm)
};

/**
 * Poster images supplied later. Drop a file in /assets/posters and put its
 * path here. While a path is '' the slot shows a quiet placeholder (see
 * DEV below) or hides itself.
 */
export const POSTERS = {
  weekend: '', // e.g. 'assets/posters/weekend.jpg'
  weekendAlt: 'The FutureMakers Weekend poster',
};

export const DEV = {
  // Shows a small "POSTER ASSET SLOT" label inside empty poster frames.
  // Set false to hide empty slots completely for the public site.
  showPosterSlots: true,
  // Shows a "needs confirmation" flag on FAQ answers that are not final.
  showReviewFlags: true,
};

export const RECORDING = {
  confirmed: false,
  // Shown in the FAQ and "How it works" while recordings are undecided.
  text: 'Recording arrangements have not been confirmed yet. Any follow-up resources will be shared with registered parents after the workshops.',
};

/**
 * FAQ. `review: true` marks an answer that still needs a decision from the
 * organisers. The wording is deliberately cautious and promises nothing.
 */
export const FAQ = [
  {
    q: 'What ages can participate?',
    a: 'Children aged 6 to 14. Activities are adapted for two age bands: Juniors (6–9) and Seniors (10–14).',
  },
  {
    q: 'Does my child need prior business or AI experience?',
    a: 'No. Both workshops start from the beginning and assume no experience of business or AI.',
  },
  {
    q: 'What happens during the workshops?',
    a: 'Each workshop is a live, guided online session of approximately 75 minutes. Children try short activities, build an idea step by step and finish with a project they can share with their family. On Saturday that is a mini business plan and a short pitch. On Sunday it is an original AI-assisted creative project.',
  },
  {
    q: 'Can I register for just one day?',
    a: 'Yes. The two workshops are independent, so you can book Saturday, Sunday or both.',
  },
  {
    q: 'What is included in the full weekend pass?',
    a: 'A place in both workshops: the Young Entrepreneurs Lab on Saturday 24 October and the AI Creators Lab on Sunday 25 October. It costs less than buying the two separately.',
  },
  {
    q: 'What does my child need to participate?',
    a: 'A device with a stable internet connection, plus paper and pencils for sketching. The joining instructions will confirm the exact list.',
    review: 'Confirm the device, platform and materials list.',
  },
  {
    q: 'Does my child need their own AI account?',
    a: 'Please do not create any accounts yet. The joining instructions will explain whether any tool or sign-in is used, and a parent or guardian stays in charge of any sign-up.',
    review: 'Confirm which AI tool(s) will be used and whether accounts are needed.',
  },
  {
    q: 'Should a parent be present?',
    a: 'A parent or guardian should be nearby to help younger children (Juniors, 6–9) get set up and take part. Older children can work more independently, but a grown-up should still be close by.',
  },
  {
    q: 'How do I receive joining instructions?',
    a: 'After registration and payment are complete, the joining instructions and activity details are sent to the parent or guardian by email.',
    review: 'Confirm when the instructions are sent and from which address.',
  },
  {
    q: 'What is the recording policy?',
    a: RECORDING.text,
    review: 'Confirm whether sessions are recorded and how resources are delivered.',
  },
  {
    q: 'What happens if we can no longer attend?',
    a: 'Our cancellation and refund terms will be published here before registration opens.',
    review: 'Write and publish the cancellation / refund policy.',
  },
  {
    q: 'How do I contact the organisers?',
    a: 'A contact email will be published here before registration opens.',
    review: 'Add the contact email in CONTACT.email.',
    contact: true,
  },
];
