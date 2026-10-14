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

/** Confirmed start times. 24-hour "HH:MM" in Nigerian time (WAT, UTC+1). */
export const SESSION_TIMES = {
  business: '17:00',
  ai: '17:00',
  timeZoneNote: 'Nigerian time (WAT, UTC+1)',
  unconfirmedText: 'Start times will be confirmed to registered parents.',
};

export const CURRENCIES = {
  usd: {
    code: 'USD',
    symbol: '$',
    locale: 'en-US',
    label: 'US dollars',
    toggleLabel: 'US ($)',
    regionNote: 'Prices in US dollars. Pay by Revolut.',
  },
  gbp: {
    code: 'GBP',
    symbol: '£',
    locale: 'en-GB',
    label: 'British pounds',
    toggleLabel: 'UK (£)',
    regionNote: 'Prices in British pounds. Pay by Revolut.',
  },
  ngn: {
    code: 'NGN',
    symbol: '₦',
    locale: 'en-NG',
    label: 'Nigerian naira',
    toggleLabel: 'Nigeria (₦)',
    regionNote: 'Nigerian price list, in naira. Pay by bank transfer.',
  },
};

/**
 * Prices are set by hand for each price list. No exchange rates are used
 * anywhere. The backend (backend/apps-script/Code.gs) keeps its own copy and
 * recomputes every amount, so a tampered browser cannot change what is owed.
 * A test checks that both copies match.
 */
export const PRICES = {
  usd: { business: 40, ai: 40, weekend: 70 },
  gbp: { business: 30, ai: 30, weekend: 52.5 },
  ngn: { business: 60000, ai: 60000, weekend: 100000 },
};

/**
 * Is a ticket per child? The brief does not say. `true` multiplies the
 * price by the number of children entered in the form.
 */
export const PRICE_IS_PER_CHILD = true; // TODO(confirm)

/**
 * Manual payment details. These are public by nature (they are shown to
 * parents). No secrets belong in this file.
 */
export const PAYMENTS = {
  ngn: {
    methods: [
      { id: 'opay', label: 'Option A: OPay', bank: 'OPay', accountNumber: '7047167280', accountName: 'ONYEMA UZODINMA' },
      { id: 'moniepoint', label: 'Option B: Moniepoint', bank: 'Moniepoint', accountNumber: '5295905851', accountName: 'KENELUMCHUKWU OKONJO' },
    ],
  },
  international: {
    revolutUrl: 'https://revolut.me/keneokonjo',
  },
  confirm: {
    email: 'keneokonjo44@gmail.com',
    whatsappE164: '2347047167280',
    whatsappDisplay: '+234 7047167280',
  },
};

/**
 * Registration backend: a Google Apps Script web app bound to your Google
 * Sheet (see backend/README.md). Paste the deployed "/exec" URL here.
 * While empty, the form says plainly that registration is not connected yet
 * and never pretends a registration was saved.
 */
export const BACKEND = {
  url: 'https://script.google.com/macros/s/AKfycbz4y8G4TEcGTlE9S-C9Df5tKVlw9dAlzZpteyv-Fk9g1OT3GiWSDUzVGKB5vTgl2WLbKg/exec',
  timeoutMs: 15000,
};

export const REGISTRATION = {
  maxChildren: 6,
  // `currency` is the default price list; `currencies` are the lists allowed for that country.
  countries: [
    { value: 'NG', label: 'Nigeria', currency: 'ngn', currencies: ['ngn'] },
    { value: 'US', label: 'United States', currency: 'usd', currencies: ['usd'] },
    { value: 'GB', label: 'United Kingdom', currency: 'gbp', currencies: ['gbp'] },
    { value: 'OTHER', label: 'Another country', currency: 'usd', currencies: ['usd', 'gbp'] },
  ],
};

export const CONTACT = {
  email: 'keneokonjo44@gmail.com',
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
    q: 'How do I pay?',
    a: 'After you register, a window shows exactly how to pay and your registration reference. In Nigeria you pay by bank transfer (OPay or Moniepoint) in naira. From the UK, US or elsewhere you pay through Revolut in pounds or dollars. Then you confirm your payment by email, WhatsApp or the confirmation form. Your place is confirmed once we have checked that the money arrived.',
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
