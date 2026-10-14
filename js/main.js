import {
  BRAND, EVENT, SESSION_TIMES, CURRENCIES, PRICE_IS_PER_CHILD, REGISTRATION,
  CONTACT, POSTERS, DEV, RECORDING, FAQ,
} from './config.js';
import {
  unitPrice, separateTotal, weekendSaving, total, formatMoney, formatExact, clampChildren,
} from './pricing.js';
import {
  newReference, callBackend, ApiError, pending, validateRegistration, STATUS,
} from './registration.js';
import { openPayment, openConfirm, initPaymentModal } from './payment-modal.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = { currency: 'usd', option: 'weekend', submitted: false };

/* ---------- static text bound from config ---------- */
const TEXT = {
  'brand.name': BRAND.name,
  'brand.shortName': BRAND.shortName,
  'brand.tagline': BRAND.tagline,
  'brand.eventName': BRAND.eventName,
  ages: EVENT.ages,
  duration: EVENT.duration,
  'business.title': EVENT.business.title,
  'business.shortDate': EVENT.business.shortDate,
  'business.dayMonth': EVENT.business.dayMonth,
  'ai.title': EVENT.ai.title,
  'ai.shortDate': EVENT.ai.shortDate,
  'ai.dayMonth': EVENT.ai.dayMonth,
  'recording.text': RECORDING.text,
  'currency.usd.toggleLabel': CURRENCIES.usd.toggleLabel,
  'currency.gbp.toggleLabel': CURRENCIES.gbp.toggleLabel,
  'currency.ngn.toggleLabel': CURRENCIES.ngn.toggleLabel,
};

function bindText() {
  $$('[data-text]').forEach((el) => {
    const value = TEXT[el.dataset.text];
    if (value != null) el.textContent = value;
  });
}

function bindSessions() {
  $$('[data-session]').forEach((el) => {
    const key = el.dataset.session;
    const time = SESSION_TIMES[key];
    const [hh, mm] = time ? time.split(':').map(Number) : [0, 0];
    const clock = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
    el.textContent = time
      ? `Starts at ${clock}${SESSION_TIMES.timeZoneNote ? `, ${SESSION_TIMES.timeZoneNote}` : ''}`
      : SESSION_TIMES.unconfirmedText;
  });
}

function bindFixedPrices() {
  $$('[data-price-fixed]').forEach((el) => {
    const [currency, option] = el.dataset.priceFixed.split(':');
    el.textContent = formatMoney(currency, unitPrice(currency, option));
  });
}

/* ---------- poster slots ---------- */
function bindPosters() {
  $$('[data-poster]').forEach((figure) => {
    const key = figure.dataset.poster;
    const src = POSTERS[key];
    const frame = $('.poster-frame', figure);
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = POSTERS[`${key}Alt`] || '';
      img.loading = 'lazy';
      frame.replaceChildren(img);
      figure.hidden = false;
    } else if (DEV.showPosterSlots) {
      frame.innerHTML = '<span class="slot-label">POSTER ASSET SLOT</span>';
      figure.hidden = false;
    }
  });
}

/* ---------- navigation ---------- */
function initNav() {
  const header = $('#site-header');
  const btn = $('.menu-btn', header);
  const setOpen = (open) => {
    header.classList.toggle('nav-open', open);
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', () => setOpen(btn.getAttribute('aria-expanded') !== 'true'));
  $$('#primary-nav a, .nav-cta').forEach((a) => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && header.classList.contains('nav-open')) {
      setOpen(false);
      btn.focus();
    }
  });
}

/* ---------- pricing display ---------- */
function renderPrices() {
  const cur = state.currency;
  $$('[data-price]').forEach((el) => {
    el.textContent = formatMoney(cur, unitPrice(cur, el.dataset.price));
  });
  $$('[data-saving]').forEach((el) => {
    el.textContent = `save ${formatMoney(cur, weekendSaving(cur))}`;
  });
  $$('[data-separate]').forEach((el) => {
    el.textContent = formatMoney(cur, separateTotal(cur));
  });
  $('#currency-note').textContent = CURRENCIES[cur].regionNote;
  $$('input[name="currency"]').forEach((r) => { r.checked = r.value === cur; });
  renderSummary();
}

const CHOICE = {
  business: { name: `Business Workshop, ${EVENT.business.title}`, dates: EVENT.business.dateLabel },
  ai: { name: `AI Workshop, ${EVENT.ai.title}`, dates: EVENT.ai.dateLabel },
  weekend: { name: 'Full Weekend Pass', dates: EVENT.weekend.dateLabel },
};

function childrenCount() {
  return clampChildren($('#f-children').value || 1);
}

function renderSummary() {
  const cur = state.currency;
  const kids = childrenCount();
  $('#sum-choice').textContent = CHOICE[state.option].name;
  $('#sum-dates').textContent = CHOICE[state.option].dates;
  $('#sum-list').textContent = CURRENCIES[cur].label;
  $('#sum-unit').textContent = formatMoney(cur, unitPrice(cur, state.option));
  $('#sum-kids').textContent = String(kids);
  $('#sum-total').textContent = formatMoney(cur, total(cur, state.option, kids));
  // The "Per child" row only makes sense when tickets are per child.
  $('#sum-unit').closest('div').querySelector('dt').textContent = PRICE_IS_PER_CHILD ? 'Per child' : 'Ticket';
  $('#sum-kids').closest('div').hidden = !PRICE_IS_PER_CHILD;
}

function renderOptions() {
  $$('.opt').forEach((label) => {
    const input = $('input', label);
    const selected = input.value === state.option;
    input.checked = selected;
    label.classList.toggle('is-selected', selected);
    $('[data-btn]', label).textContent = selected ? 'Selected' : 'Select';
  });
}

function selectOption(option) {
  state.option = option;
  renderOptions();
  renderSummary();
}

function setCurrency(cur) {
  state.currency = cur;
  renderPrices();
}

/* ---------- form setup ---------- */
function initForm() {
  const country = $('#f-country');
  REGISTRATION.countries.forEach((c) => {
    country.add(new Option(c.label, c.value));
  });
  const kids = $('#f-children');
  for (let i = 1; i <= REGISTRATION.maxChildren; i += 1) {
    kids.add(new Option(String(i), String(i)));
  }

  $$('input[name="option"]').forEach((r) => r.addEventListener('change', () => selectOption(r.value)));
  $$('input[name="currency"]').forEach((r) => r.addEventListener('change', () => setCurrency(r.value)));
  country.addEventListener('change', () => {
    const allowed = allowedCurrencies(country.value);
    if (allowed.length && !allowed.includes(state.currency)) setCurrency(allowed[0]);
    if (state.submitted) validateField('country');
  });
  kids.addEventListener('change', renderSummary);

  // CTAs elsewhere on the page choose a ticket and then scroll to the pricing section.
  $$('[data-choose]').forEach((a) => a.addEventListener('click', () => selectOption(a.dataset.choose)));


  $('#register-form').addEventListener('submit', onSubmit);
  $('#already-paid').addEventListener('click', (e) => openConfirm(pending.load(), e.currentTarget));
  $('#register-form').addEventListener('input', onLiveValidate);
  $('#register-form').addEventListener('change', onLiveValidate);
}

/* ---------- validation ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function allowedCurrencies(countryValue) {
  return REGISTRATION.countries.find((c) => c.value === countryValue)?.currencies || [];
}

const PHONE_RE = /^[+0-9()\-\s.]{6,25}$/;

const validators = {
  name(form) {
    const v = form.elements.name.value.trim();
    if (!v) return 'Please enter your name.';
    if (v.length < 2) return 'Please enter your full name.';
    return '';
  },
  email(form) {
    const v = form.elements.email.value.trim();
    if (!v) return 'Please enter your email address.';
    if (!EMAIL_RE.test(v)) return 'That email address does not look right. Please check it.';
    return '';
  },
  country(form) {
    const v = form.elements.country.value;
    if (!v) return 'Please choose your country.';
    const allowed = allowedCurrencies(v);
    if (allowed.length && !allowed.includes(state.currency)) {
      const names = allowed.map((c) => CURRENCIES[c].label).join(' or ');
      return `For your country, please use the ${names} price list above.`;
    }
    return '';
  },
  phone(form) {
    const v = form.elements.phone.value.trim();
    return !v || PHONE_RE.test(v) ? '' : 'That number does not look right. Use digits, and a + for the country code.';
  },
  children(form) {
    const n = Number(form.elements.children.value);
    return n >= 1 && n <= REGISTRATION.maxChildren ? '' : 'Please choose how many children.';
  },
  bands(form) {
    return $$('input[name="band"]:checked', form).length ? '' : 'Please choose at least one age band.';
  },
  guardian(form) {
    return form.elements.guardian.checked ? '' : 'Please confirm you are a parent or guardian.';
  },
};

const fieldControl = {
  name: '#f-name', email: '#f-email', phone: '#f-phone', country: '#f-country', children: '#f-children',
  bands: 'input[name="band"]', guardian: '#f-guardian',
};

function validateField(key) {
  const form = $('#register-form');
  const message = validators[key](form);
  const out = $(`#e-${key}`);
  out.textContent = message;
  $$(fieldControl[key], form).forEach((el) => {
    if (message) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
  });
  out.closest('.field')?.classList.toggle('has-error', Boolean(message));
  return message;
}

function onLiveValidate(e) {
  if (!state.submitted) return;
  const key = Object.keys(fieldControl).find((k) => e.target.matches(fieldControl[k]));
  if (key) validateField(key);
}

/* ---------- submit ---------- */
function setStatus(kind, title, body) {
  const box = $('#form-status');
  box.className = `status status-${kind}`;
  box.innerHTML = '';
  const strong = document.createElement('strong');
  strong.textContent = title;
  box.append(strong);
  if (body) {
    const p = document.createElement('span');
    p.textContent = ` ${body}`;
    box.append(p);
  }
}

function clearStatus() {
  const box = $('#form-status');
  box.className = 'status';
  box.textContent = '';
}

const SUBMIT_LABEL = 'Register and view payment details';

/** Same details -> same reference, so a retry after a network error can never create a second registration. */
let attempt = null;

function buildPayload(form) {
  const body = {
    action: 'register',
    parentName: form.elements.name.value.trim(),
    email: form.elements.email.value.trim(),
    phone: form.elements.phone.value.trim(),
    country: form.elements.country.value,
    option: state.option,
    currency: state.currency,
    children: childrenCount(),
    ageBands: $$('input[name="band"]:checked', form).map((el) => el.value),
    guardianConfirmed: true,
    website: form.elements.website.value,
  };
  const signature = JSON.stringify({ ...body, website: '' });
  if (!attempt || attempt.signature !== signature) attempt = { signature, reference: newReference() };
  body.reference = attempt.reference;
  return body;
}

function mailtoFallback(body) {
  const subject = `FutureMakers registration (${body.option}, ${body.currency.toUpperCase()})`;
  const text = [
    'My online registration did not go through. Please register me:', '',
    `Name: ${body.parentName}`, `Email: ${body.email}`, `Contact number: ${body.phone || '-'}`,
    `Country: ${body.country}`, `Package: ${body.option}`, `Currency: ${body.currency.toUpperCase()}`, `Children: ${body.children}`,
  ].join('\n');
  return `mailto:${CONTACT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}

function setFailure(err, body) {
  const box = $('#form-status');
  const code = err instanceof ApiError ? err.code : 'unknown';
  let title = 'We could not save your registration.';
  let detail = 'Nothing has been saved and nothing has been charged. Your answers are still here: please try again in a moment.';
  if (code === 'not_connected') {
    title = 'Online registration is not switched on yet.';
    detail = 'Your details have not been saved and nothing has been charged. Please email us and we will register you by hand.';
  } else if (code === 'network') {
    detail = 'We could not reach the registration service (check your internet connection). Nothing has been saved or charged. Press the button again to retry.';
  } else if (code === 'rate_limited') {
    detail = err.message;
  } else if (['invalid_package', 'invalid_children', 'invalid_age_bands', 'invalid_country', 'invalid_email', 'invalid_phone', 'invalid_name'].includes(code)) {
    detail = `${err.message} Please check the form and try again.`;
  }
  setStatus('error', title, detail);
  const p = document.createElement('p');
  p.className = 'status-extra';
  const a = document.createElement('a');
  a.href = mailtoFallback(body);
  a.textContent = `Email your details to ${CONTACT.email} instead`;
  p.append(a);
  box.append(p);
  box.focus();
}

async function onSubmit(e) {
  e.preventDefault();
  state.submitted = true;
  const form = e.currentTarget;
  clearStatus();

  const failures = Object.keys(validators).filter((key) => validateField(key));
  if (failures.length) {
    setStatus('error', 'Please check the form.', `${failures.length === 1 ? 'One field needs' : `${failures.length} fields need`} your attention.`);
    $(fieldControl[failures[0]], form).focus();
    return;
  }

  const button = $('#submit-btn');
  button.disabled = true;
  button.textContent = 'Saving your registration…';
  const body = buildPayload(form);
  try {
    let res;
    try {
      res = await callBackend(body);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'reference_conflict') {
        attempt = { signature: attempt.signature, reference: newReference() };
        body.reference = attempt.reference;
        res = await callBackend(body);
      } else throw err;
    }
    const reg = {
      reference: res.reference, option: body.option, currency: body.currency, children: body.children,
      amountOwed: res.amountOwed, email: body.email, parentName: body.parentName, status: res.status || STATUS.pending,
    };
    const problem = validateRegistration(reg);
    if (problem || res.currency !== body.currency) {
      // The server's answer disagrees with this page's price list: show nothing rather than something wrong.
      console.error('Registration response rejected:', problem, res);
      setStatus('error', 'Your registration was saved, but we could not show the payment details.', `Please email ${CONTACT.email} and quote reference ${res.reference || '(none shown)'}.`);
      return;
    }
    pending.save(reg);
    renderResume();
    openPayment(reg, button);
  } catch (err) {
    console.error(err);
    setFailure(err, body);
  } finally {
    button.disabled = false;
    button.textContent = SUBMIT_LABEL;
  }
}

/* ---------- saved registration banner ---------- */
function renderResume() {
  const reg = pending.load();
  const banner = $('#resume-banner');
  banner.hidden = !reg;
  if (!reg) return;
  $('#resume-ref').textContent = reg.reference;
  $('#resume-amount').textContent = formatExact(reg.currency, reg.amountOwed);
  $('#resume-status').textContent = reg.status === STATUS.paid ? 'Paid' : reg.status === STATUS.submitted ? 'Payment submitted, awaiting verification' : 'Payment pending';
}

async function refreshResume() {
  const reg = pending.load();
  if (!reg) return;
  try {
    const res = await callBackend({ action: 'status', reference: reg.reference, email: reg.email });
    if (res.status && res.status !== reg.status) {
      pending.save({ ...reg, status: res.status });
      renderResume();
    }
  } catch { /* offline or not connected: keep what we have */ }
}

function initResume() {
  $('#resume-view').addEventListener('click', (e) => { const r = pending.load(); if (r) openPayment(r, e.currentTarget); });
  $('#resume-confirm').addEventListener('click', (e) => openConfirm(pending.load(), e.currentTarget));
  $('#resume-new').addEventListener('click', () => {
    pending.clear();
    renderResume();
    $('#f-name').focus();
  });
  initPaymentModal({
    onClose(reg) {
      renderResume();
      if (reg?.reference) {
        setStatus('info', `Your registration reference is ${reg.reference}.`, 'Keep it safe. You can reopen your payment details from the box above the form.');
      }
    },
  });
  renderResume();
  refreshResume();
}

/* ---------- FAQ ---------- */
function renderFaq() {
  const list = $('#faq-list');
  FAQ.forEach((item, i) => {
    const details = document.createElement('details');
    details.className = 'qa';
    details.name = 'faq';
    if (i === 0) details.open = true;

    const summary = document.createElement('summary');
    const num = document.createElement('span');
    num.className = 'qa-n';
    num.textContent = String(i + 1).padStart(2, '0');
    const q = document.createElement('span');
    q.className = 'qa-q';
    q.textContent = item.q;
    summary.append(num, q);

    const body = document.createElement('div');
    body.className = 'qa-a';
    const p = document.createElement('p');
    if (item.contact && CONTACT.email) {
      p.append('You can email us at ');
      const a = document.createElement('a');
      a.href = `mailto:${CONTACT.email}`;
      a.textContent = CONTACT.email;
      p.append(a, '.');
    } else {
      p.textContent = item.a;
    }
    body.append(p);
    if (item.review && DEV.showReviewFlags) {
      const flag = document.createElement('p');
      flag.className = 'flag';
      flag.innerHTML = '<span>Needs confirmation</span> ';
      flag.append(item.review);
      body.append(flag);
    }
    details.append(summary, body);
    list.append(details);
  });
}

/* ---------- footer ---------- */
function renderFooter() {
  const put = (id, label, url, fallback) => {
    const el = $(id);
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.textContent = label;
      el.append(a);
    } else {
      el.textContent = fallback;
      el.classList.add('is-pending');
    }
  };
  const contact = $('#foot-contact');
  if (CONTACT.email) {
    const a = document.createElement('a');
    a.href = `mailto:${CONTACT.email}`;
    a.textContent = CONTACT.email;
    contact.append(a);
  } else {
    contact.textContent = 'Contact email: coming soon';
    contact.classList.add('is-pending');
  }
  put('#foot-privacy', 'Privacy policy', CONTACT.privacyUrl, 'Privacy policy: to be published');
  put('#foot-terms', 'Terms', CONTACT.termsUrl, 'Terms: to be published');
  put('#foot-cancel', 'Cancellation and refunds', CONTACT.cancellationUrl, 'Cancellation and refunds: to be published');
}

/* ---------- sharing ---------- */
function initShare() {
  const url = (BRAND.siteUrl || window.location.href).split('#')[0];
  const text = `${BRAND.eventName}: two online workshops for ages 6–14 on ${EVENT.weekend.dateLabel}. Business on Saturday, AI on Sunday.`;
  $('#share-wa').href = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;

  const status = $('#share-status');
  const say = (msg) => {
    status.textContent = msg;
    window.setTimeout(() => { status.textContent = ''; }, 3000);
  };

  if (navigator.share) {
    const native = $('#share-native');
    native.hidden = false;
    native.addEventListener('click', () => {
      navigator.share({ title: BRAND.eventName, text, url }).catch(() => {});
    });
  }
  $('#share-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      say('Link copied');
    } catch {
      say('Copy this address from your browser bar');
    }
  });
}

/* ---------- boot ---------- */
bindText();
bindSessions();
bindFixedPrices();
bindPosters();
initNav();
initForm();
initResume();
renderOptions();
renderPrices();
renderFaq();
renderFooter();
initShare();

// Respect reduced-motion for in-page jumps (CSS handles the default smooth scroll).
if (prefersReducedMotion()) document.documentElement.style.scrollBehavior = 'auto';
