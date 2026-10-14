/**
 * The payment window shown after registering (and the "confirm my payment"
 * window for people who have already paid).
 *
 * Rules this file follows:
 *  - It only shows what validateRegistration() accepts; bad data shows an
 *    error state, never guessed amounts or details.
 *  - NGN shows bank-transfer details only. GBP/USD show Revolut only.
 *  - Nothing here marks anyone as Paid. Confirming sends a claim that the
 *    owner verifies by hand.
 */
import { EVENT, SESSION_TIMES, PAYMENTS } from './config.js';
import { formatExact, plainAmount } from './pricing.js';
import { callBackend, ApiError, pending, validateRegistration, STATUS } from './registration.js';

const $ = (sel, root = document) => root.querySelector(sel);

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat().filter((x) => x != null && x !== false));
  return el;
}

/* ---------- text builders (exported for tests) ---------- */
export function packageLabel(option) {
  if (option === 'business') return EVENT.business.title;
  if (option === 'ai') return EVENT.ai.title;
  return `Both workshops: ${EVENT.business.title} + ${EVENT.ai.title}`;
}

function timeLabel(hhmm) {
  if (!hhmm) return '';
  const [hh, mm] = hhmm.split(':').map(Number);
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
}

export function sessionLines(option) {
  const line = (key) => {
    const t = SESSION_TIMES[key];
    return `${EVENT[key].title}: ${EVENT[key].dateLabel}${t ? `, ${timeLabel(t)} ${SESSION_TIMES.timeZoneNote || ''}`.trimEnd() : ''}`;
  };
  return option === 'weekend' ? [line('business'), line('ai')] : [line(option)];
}

export function emailLink(reg) {
  const subject = `FutureMakers Academy Payment Confirmation — ${reg.reference}`;
  const body = [
    'Hello,', '',
    'I have made my payment for FutureMakers Academy.', '',
    `Registration reference: ${reg.reference}`,
    `Parent/guardian name: ${reg.parentName || ''}`,
    `Package: ${packageLabel(reg.option)}`,
    `Amount paid: ${formatExact(reg.currency, reg.amountOwed)}`, '',
    'My payment receipt/screenshot is attached.', '',
    'Thank you.',
  ].join('\n');
  return `mailto:${PAYMENTS.confirm.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function whatsappLink(reg) {
  const text = `Hello, I have made my payment for FutureMakers Academy. My registration reference is ${reg.reference}. I will send my payment receipt screenshot here.`;
  return `https://wa.me/${PAYMENTS.confirm.whatsappE164}?text=${encodeURIComponent(text)}`;
}

export function allDetailsText(reg) {
  const lines = [
    'FutureMakers Academy: payment details',
    `Registration reference: ${reg.reference}`,
    `Package: ${packageLabel(reg.option)}`,
    ...sessionLines(reg.option),
    `Amount to pay: ${formatExact(reg.currency, reg.amountOwed)}`,
  ];
  if (reg.currency === 'ngn') {
    PAYMENTS.ngn.methods.forEach((m) => lines.push(`${m.bank}: ${m.accountNumber} (${m.accountName})`));
  } else {
    lines.push(`Pay with Revolut: ${PAYMENTS.international.revolutUrl}`);
  }
  lines.push(`Confirm your payment: email ${PAYMENTS.confirm.email} or WhatsApp ${PAYMENTS.confirm.whatsappDisplay}, quoting ${reg.reference}.`);
  return lines.join('\n');
}

/* ---------- clipboard ---------- */
export async function copyText(text, within) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path */ }
  try {
    // Must live inside the open <dialog>: everything outside it is inert while it is modal.
    const ta = h('textarea', { readonly: true, 'aria-hidden': 'true', tabindex: '-1', style: 'position:fixed;top:0;left:0;opacity:0' });
    ta.value = text;
    (within || document.body).append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function selectContents(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/* ---------- the dialog ---------- */
let dialog;
let inner;
let live;
let opener = null;
let current = null; // { reg, mode }
let onCloseCb = () => {};
let storageOk = true;

function announce(msg) {
  live.textContent = '';
  window.setTimeout(() => { live.textContent = msg; }, 20);
}

function copyButton(label, key, getText, getSource) {
  const btn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm copy-btn', 'data-copy': key, 'aria-label': `Copy ${label}` }, h('span', { text: 'Copy' }));
  const hintId = `copy-hint-${key}`;
  const hint = h('span', { class: 'copy-hint', id: hintId, role: 'status' });
  btn.addEventListener('click', async () => {
    const ok = await copyText(getText(), dialog);
    const span = btn.firstElementChild;
    if (ok) {
      span.textContent = 'Copied ✓';
      btn.classList.add('is-copied');
      hint.textContent = '';
      announce(`${label} copied`);
      window.setTimeout(() => { span.textContent = 'Copy'; btn.classList.remove('is-copied'); }, 2200);
    } else {
      const src = getSource?.();
      if (src) selectContents(src);
      hint.textContent = 'Could not copy automatically. The text is selected: press Ctrl+C (or touch and hold, then Copy).';
      announce('Copy failed. The text is selected so you can copy it yourself.');
    }
  });
  return h('span', { class: 'copy-wrap' }, btn, hint);
}

function kv(label, valueEl) {
  return h('div', { class: 'pay-kv' }, h('dt', { text: label }), h('dd', {}, valueEl));
}

function chip(status) {
  const label = status === STATUS.paid ? 'Paid. Your place is confirmed.'
    : status === STATUS.submitted ? STATUS.submitted
      : 'Registration saved. Payment pending.';
  return h('p', { class: `pay-chip ${status === STATUS.paid ? 'is-paid' : status === STATUS.submitted ? 'is-submitted' : 'is-pending'}`, 'data-testid': 'pay-status', text: label });
}

function closeBtn() {
  return h('button', { type: 'button', class: 'pay-close', 'data-close': true, 'aria-label': 'Close payment window' }, h('span', { 'aria-hidden': 'true', text: '×' }));
}

function renderError(message, reg) {
  inner.replaceChildren(
    h('div', { class: 'pay-head' }, h('h2', { id: 'pay-title', tabindex: '-1', text: 'We could not show your payment details' }), closeBtn()),
    h('p', { id: 'pay-lead', class: 'pay-lead', 'data-testid': 'pay-error', text: `${message} To stay safe we have not shown any payment details.` }),
    h('p', {}, 'Please email ', h('a', { href: `mailto:${PAYMENTS.confirm.email}?subject=${encodeURIComponent(`FutureMakers registration help${reg?.reference ? ` ${reg.reference}` : ''}`)}`, text: PAYMENTS.confirm.email }), reg?.reference ? ` and quote ${reg.reference}.` : '.'),
    h('div', { class: 'pay-actions' }, h('button', { type: 'button', class: 'btn btn-primary', 'data-close': true, text: 'Close' })),
  );
}

function renderNgn(reg) {
  const cards = PAYMENTS.ngn.methods.map((m) => {
    const num = h('strong', { class: 'acct-num mono', id: `${m.id}-num`, text: m.accountNumber });
    const name = h('strong', { class: 'acct-name', id: `${m.id}-name`, text: m.accountName });
    return h('article', { class: 'acct-card', 'data-method': m.id, 'aria-labelledby': `${m.id}-h` },
      h('h4', { id: `${m.id}-h`, text: m.label }),
      h('dl', { class: 'pay-dl' },
        kv('Bank', h('span', { text: m.bank })),
        kv('Account number', h('span', { class: 'copy-row' }, num, copyButton(`${m.bank} account number`, `${m.id}-number`, () => m.accountNumber, () => num))),
        kv('Account name', h('span', { class: 'copy-row' }, name, copyButton(`${m.bank} account name`, `${m.id}-name`, () => m.accountName, () => name))),
      ));
  });
  return h('section', { class: 'pay-section', 'aria-labelledby': 'how-title', 'data-region': 'ngn' },
    h('h3', { id: 'how-title', text: 'How to pay (bank transfer)' }),
    h('div', { class: 'acct-grid' }, ...cards),
    h('p', { class: 'pay-note', text: 'Transfer the exact amount shown to either account. After making your payment, submit your payment confirmation using the instructions provided below. Your registration will remain pending until payment has been verified.' }),
    h('p', { class: 'pay-note', text: `Put your reference ${reg.reference} in the transfer narration or description if your bank app lets you.` }),
  );
}

function renderIntl(reg) {
  const exact = formatExact(reg.currency, reg.amountOwed);
  return h('section', { class: 'pay-section', 'aria-labelledby': 'how-title', 'data-region': 'international' },
    h('h3', { id: 'how-title', text: 'How to pay (Revolut)' }),
    h('p', { class: 'pay-note', text: `Enter exactly ${exact} in Revolut. If Revolut lets you add a description or note, include your reference ${reg.reference}.` }),
    h('p', {}, h('a', {
      class: 'btn btn-primary btn-lg', id: 'revolut-link', href: PAYMENTS.international.revolutUrl, target: '_blank', rel: 'noopener noreferrer',
      'data-testid': 'revolut-link', text: 'Pay with Revolut',
    }), ' ', h('span', { class: 'sr-only', text: '(opens in a new tab)' })),
    h('p', { class: 'pay-note small', text: `${PAYMENTS.international.revolutUrl} opens in a new tab. The link does not charge you automatically: you choose and approve the payment yourself in Revolut.` }),
    h('p', { class: 'pay-note', text: 'Open Revolut to complete your payment using the exact amount shown above. Your registration will remain pending until payment has been verified.' }),
  );
}

function setStatus(reg, status) {
  reg.status = status;
  pending.save(reg);
  const old = $('[data-testid="pay-status"]', inner);
  if (old) old.replaceWith(chip(status));
}

function confirmForm(reg, { standalone = false } = {}) {
  const known = Boolean(reg && !validateRegistration(reg));
  const defaultMethod = known ? (reg.currency === 'ngn' ? 'OPay' : 'Revolut') : '';
  const f = h('form', { class: 'confirm-form', id: 'confirm-form', novalidate: true });
  const field = (id, label, control, hint) => h('div', { class: 'field' }, h('label', { for: id, text: label }), control, hint ? h('p', { class: 'hint', text: hint }) : null);
  const msg = h('div', { class: 'status', id: 'confirm-status', role: 'status', 'aria-live': 'polite', tabindex: '-1' });
  const ref = h('input', { id: 'c-ref', name: 'reference', type: 'text', autocomplete: 'off', autocapitalize: 'characters', required: true });
  ref.value = reg?.reference || '';
  const nameI = h('input', { id: 'c-name', name: 'parentName', type: 'text', autocomplete: 'name', required: true });
  nameI.value = reg?.parentName || '';
  const emailI = h('input', { id: 'c-email', name: 'email', type: 'email', autocomplete: 'email', required: true });
  emailI.value = reg?.email || '';
  const method = h('select', { id: 'c-method', name: 'method', required: true },
    h('option', { value: '', text: 'Choose…' }),
    ...['OPay', 'Moniepoint', 'Revolut', 'Other'].map((m) => h('option', { value: m, text: m })));
  method.value = defaultMethod;
  const amount = h('input', { id: 'c-amount', name: 'amountPaid', type: 'text', inputmode: 'decimal', autocomplete: 'off', required: true });
  amount.value = known ? plainAmount(reg.amountOwed) : '';
  const txn = h('input', { id: 'c-txn', name: 'transactionRef', type: 'text', autocomplete: 'off', maxlength: '80' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary', id: 'confirm-submit', text: 'Tell us I’ve paid' });
  f.append(
    field('c-ref', 'Registration reference', ref),
    field('c-name', 'Parent or guardian name', nameI),
    field('c-email', 'Email used to register', emailI),
    field('c-method', 'How did you pay?', method),
    field('c-amount', `Amount paid${known ? ` (${reg.currency.toUpperCase()})` : ''}`, amount),
    field('c-txn', 'Transaction reference (optional)', txn, 'Found in your bank or Revolut receipt, if you have it.'),
    h('div', { class: 'pay-actions' }, submit),
    msg,
  );
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amt = Number(String(amount.value).replace(/[^0-9.]/g, ''));
    const body = {
      action: 'confirm', reference: ref.value.trim().toUpperCase(), parentName: nameI.value.trim(), email: emailI.value.trim(),
      method: method.value, amountPaid: amt, transactionRef: txn.value.trim(),
    };
    const problem = !/^FM-[A-Z0-9]{6}$/.test(body.reference) ? 'Please enter your registration reference (it looks like FM-ABC234).'
      : body.parentName.length < 2 ? 'Please enter your name.'
        : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.email) ? 'Please enter the email you registered with.'
          : !body.method ? 'Please choose how you paid.'
            : !(amt > 0) ? 'Please enter the amount you paid.' : '';
    msg.className = 'status';
    if (problem) { msg.className = 'status status-error'; msg.textContent = problem; msg.focus(); return; }
    submit.disabled = true;
    submit.textContent = 'Sending…';
    try {
      const res = await callBackend(body);
      msg.className = 'status status-info';
      msg.replaceChildren(h('strong', { text: 'Thank you. We have your payment confirmation.' }), ` Status: ${res.status}. This is not the same as paid: we will check that the money has arrived and then confirm your place.`);
      if (current?.reg && current.reg.reference === res.reference) setStatus(current.reg, res.status);
      else if (pending.load()?.reference === res.reference) pending.save({ ...pending.load(), status: res.status });
      announce(`Payment confirmation received. Status: ${res.status}`);
      submit.textContent = 'Sent ✓';
      f.dataset.sent = 'true';
      msg.focus();
    } catch (err) {
      const text = err instanceof ApiError ? err.message : 'Something went wrong.';
      msg.className = 'status status-error';
      msg.replaceChildren(h('strong', { text: 'We could not send your confirmation. ' }), `${text} Nothing has been recorded. Please try again, or confirm by email or WhatsApp instead.`);
      submit.disabled = false;
      submit.textContent = 'Try again';
      msg.focus();
    }
  });
  return f;
}

function evidenceButtons(reg, onOpen) {
  const emailA = h('a', { class: 'btn btn-ghost', id: 'email-confirm', href: emailLink(reg), 'data-testid': 'email-confirm', text: 'Email Payment Confirmation' });
  const waA = h('a', { class: 'btn btn-ghost', id: 'wa-confirm', href: whatsappLink(reg), target: '_blank', rel: 'noopener noreferrer', 'data-testid': 'wa-confirm', text: 'Send Screenshot on WhatsApp' });
  const afterLink = h('p', { class: 'pay-note small', id: 'after-link', hidden: true, 'aria-live': 'polite' });
  const track = (channel, text) => () => {
    callBackend({ action: 'evidence_intent', reference: reg.reference, email: reg.email, channel }).catch(() => {});
    afterLink.hidden = false;
    afterLink.textContent = `${text} Once you have sent your receipt with reference ${reg.reference}, use the form so we can match it quickly. Your registration stays pending until we have checked your payment.`;
    onOpen?.();
  };
  emailA.addEventListener('click', track('email', 'Your email app should have opened.'));
  waA.addEventListener('click', track('whatsapp', 'WhatsApp should have opened.'));
  return { emailA, waA, afterLink };
}

function renderPayment(reg) {
  const exact = formatExact(reg.currency, reg.amountOwed);
  const refEl = h('strong', { class: 'ref-big mono', id: 'pay-ref', 'data-testid': 'pay-ref', text: reg.reference });
  const amtEl = h('strong', { class: 'amount-big', id: 'pay-amount', 'data-testid': 'pay-amount', text: exact });
  const lines = sessionLines(reg.option);

  const { emailA, waA, afterLink } = evidenceButtons(reg, () => { details.open = true; });
  const details = h('details', { class: 'confirm-details', id: 'confirm-details' },
    h('summary', { text: 'Option 3: Confirm on this website' }),
    h('p', { class: 'pay-note', text: 'Tell us you have paid. This does not mark you as paid: we check every payment by hand first.' }),
    confirmForm(reg));
  inner.replaceChildren(
    h('div', { class: 'pay-head' },
      h('div', {}, h('p', { class: 'eyebrow', text: 'Step 2 of 2' }), h('h2', { id: 'pay-title', tabindex: '-1', text: 'Complete your payment' })),
      closeBtn()),
    h('p', { id: 'pay-lead', class: 'pay-lead', text: 'Your registration is saved. Pay the exact amount below, then confirm your payment. Keep your reference: you will need it.' }),
    chip(reg.status || STATUS.pending),
    h('section', { class: 'pay-summary', 'aria-label': 'Your order' },
      h('dl', { class: 'pay-dl' },
        kv('Package', h('span', { 'data-testid': 'pay-package', text: packageLabel(reg.option) })),
        kv('When', h('span', {}, ...lines.flatMap((l, i) => (i ? [h('br'), l] : [l])))),
        kv('Children', h('span', { text: String(reg.children) })),
        kv('Currency', h('span', { 'data-testid': 'pay-currency', text: reg.currency.toUpperCase() })),
      ),
      h('div', { class: 'pay-amount' }, h('span', { class: 'pay-label', text: 'Amount to pay' }), h('span', { class: 'copy-row' }, amtEl, copyButton('amount', 'amount', () => plainAmount(reg.amountOwed), () => amtEl))),
      h('div', { class: 'pay-ref' }, h('span', { class: 'pay-label', text: 'Your registration reference' }), h('span', { class: 'copy-row' }, refEl, copyButton('reference', 'reference', () => reg.reference, () => refEl))),
      h('p', { class: 'pay-note small', text: 'Write this reference down or copy it. It is saved on this device too, but your email and our records are the safest place for it.' }),
    ),
    reg.currency === 'ngn' ? renderNgn(reg) : renderIntl(reg),
    h('div', { class: 'paid-cta' },
      h('p', { class: 'pay-note', text: 'Finished paying? Tap the button to open the next step, where you send your receipt and name.' }),
      h('button', { type: 'button', class: 'btn btn-primary btn-lg', id: 'made-payment', 'data-testid': 'made-payment', text: 'I\u2019ve made my payment' })),
    h('section', { class: 'pay-section confirm-section', 'aria-labelledby': 'confirm-title' },
      h('h3', { id: 'confirm-title', text: 'Confirm Your Payment' }),
      h('p', { class: 'pay-note', text: `After paying, send us your receipt so we can verify it. Please include your registration reference (${reg.reference}) in your message.` }),
      h('div', { class: 'confirm-opts' },
        h('div', { class: 'confirm-opt' }, h('h4', { text: 'Option 1: Email' }), h('p', { text: `Send your payment receipt to ${PAYMENTS.confirm.email}.` }), emailA),
        h('div', { class: 'confirm-opt' }, h('h4', { text: 'Option 2: WhatsApp' }), h('p', { text: `Send a screenshot of your payment receipt to ${PAYMENTS.confirm.whatsappDisplay} on WhatsApp.` }), waA),
      ),
      afterLink,
      details,
    ),
    h('div', { class: 'pay-actions' },
      copyButton('all payment details', 'all', () => allDetailsText(reg), null),
      h('button', { type: 'button', class: 'btn btn-ghost', 'data-close': true, text: 'Close' }),
    ),
    h('p', { class: 'pay-note small', text: 'Your place is confirmed only after we have checked that your payment arrived. Nothing is ever charged automatically.' }),
  );
  $('#made-payment', inner).addEventListener('click', () => { renderReceipt(reg); show(opener); });
  // Copy-all button wants a visible label.
  const all = $('[data-copy="all"] span', inner);
  if (all) all.textContent = 'Copy all payment details';
}

function renderReceipt(reg) {
  const exact = formatExact(reg.currency, reg.amountOwed);
  const refEl = h('strong', { class: 'ref-big mono', id: 'rc-ref', 'data-testid': 'rc-ref', text: reg.reference });
  const { emailA, waA, afterLink } = evidenceButtons(reg, () => { const d = $('#confirm-details', inner); if (d) d.open = true; });
  const form = h('div', {}, confirmForm(reg));
  inner.replaceChildren(
    h('div', { class: 'pay-head' },
      h('div', {}, h('p', { class: 'eyebrow', text: 'Step 3 of 3' }), h('h2', { id: 'pay-title', tabindex: '-1', text: 'Send your receipt' })),
      closeBtn()),
    h('p', { id: 'pay-lead', class: 'pay-lead', 'data-testid': 'receipt-lead', text: 'Thank you for paying. Send us your receipt together with your name and reference so we can match your payment and confirm your place.' }),
    chip(reg.status || STATUS.pending),
    h('section', { class: 'pay-summary', 'aria-label': 'Details to include' },
      h('p', { class: 'pay-note', text: 'Include these details when you send your receipt:' }),
      h('dl', { class: 'pay-dl' },
        kv('Parent/guardian name', h('strong', { 'data-testid': 'rc-name', text: reg.parentName || '(your name)' })),
        kv('Amount paid', h('strong', { 'data-testid': 'rc-amount', text: exact })),
        kv('Package', h('span', { text: packageLabel(reg.option) })),
      ),
      h('div', { class: 'pay-ref' }, h('span', { class: 'pay-label', text: 'Your registration reference' }), h('span', { class: 'copy-row' }, refEl, copyButton('reference', 'reference', () => reg.reference, () => refEl))),
      h('div', { class: 'pay-actions' }, copyButton('message to send', 'message', () => receiptMessage(reg), null)),
    ),
    h('section', { class: 'pay-section confirm-section', 'aria-labelledby': 'confirm-title' },
      h('h3', { id: 'confirm-title', text: 'Send your receipt' }),
      h('div', { class: 'confirm-opts' },
        h('div', { class: 'confirm-opt' }, h('h4', { text: 'Option 1: Email' }), h('p', { text: `Email your receipt to ${PAYMENTS.confirm.email}. Your name and reference are filled in.` }), emailA),
        h('div', { class: 'confirm-opt' }, h('h4', { text: 'Option 2: WhatsApp' }), h('p', { text: `Send a screenshot of your payment receipt to ${PAYMENTS.confirm.whatsappDisplay} on WhatsApp.` }), waA),
      ),
      afterLink,
      h('details', { class: 'confirm-details', id: 'confirm-details', open: true },
        h('summary', { text: 'Option 3: Confirm on this website' }),
        h('p', { class: 'pay-note', text: 'Tell us you have paid. This does not mark you as paid: we check every payment by hand first.' }),
        form.firstChild),
    ),
    h('div', { class: 'pay-actions' },
      h('button', { type: 'button', class: 'btn btn-ghost', id: 'back-to-pay', text: '\u2190 Back to payment details' }),
      h('button', { type: 'button', class: 'btn btn-primary', 'data-close': true, text: 'Close' })),
    h('p', { class: 'pay-note small', text: 'Your place is confirmed only after we have checked that your payment arrived.' }),
  );
  $('#back-to-pay', inner).addEventListener('click', () => { renderPayment(reg); show(opener); });
  const msg = $('[data-copy="message"] span', inner);
  if (msg) msg.textContent = 'Copy message to send';
}

export function receiptMessage(reg) {
  return [
    'Hello, I have made my payment for FutureMakers Academy.',
    `Name: ${reg.parentName || ''}`,
    `Registration reference: ${reg.reference}`,
    `Amount paid: ${formatExact(reg.currency, reg.amountOwed)}`,
    'My payment receipt is attached.',
  ].join('\n');
}

function renderConfirmOnly(prefill) {
  inner.replaceChildren(
    h('div', { class: 'pay-head' }, h('h2', { id: 'pay-title', tabindex: '-1', text: 'Confirm your payment' }), closeBtn()),
    h('p', { id: 'pay-lead', class: 'pay-lead', text: 'Already paid? Tell us here. We will check that the money arrived, then confirm your place. This does not mark you as paid.' }),
    confirmForm(prefill, { standalone: true }),
    h('p', { class: 'pay-note small' }, 'You can also email your receipt to ', h('a', { href: `mailto:${PAYMENTS.confirm.email}`, text: PAYMENTS.confirm.email }), ` or send a screenshot on WhatsApp to ${PAYMENTS.confirm.whatsappDisplay}, quoting your reference.`),
  );
}

/* ---------- public API ---------- */
function beforeUnload(e) {
  if (dialog?.open && !storageOk) {
    e.preventDefault();
    e.returnValue = '';
  }
}

export function initPaymentModal({ onClose } = {}) {
  dialog = $('#pay-dialog');
  inner = $('#pay-inner');
  live = $('#pay-live');
  onCloseCb = onClose || (() => {});
  dialog.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) dialog.close();
  });
  dialog.addEventListener('close', () => {
    const reg = current?.reg;
    current = null;
    if (opener && document.contains(opener)) opener.focus();
    onCloseCb(reg);
  });
  window.addEventListener('beforeunload', beforeUnload);
}

function show(trigger) {
  opener = trigger || document.activeElement;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  $('#pay-title', inner)?.focus();
}

/** Show payment instructions for a registration the backend has accepted. */
export function openPayment(reg, trigger) {
  const problem = validateRegistration(reg);
  current = { reg, mode: 'pay' };
  if (problem) renderError(problem, reg);
  else {
    storageOk = pending.save(reg);
    renderPayment(reg);
  }
  show(trigger);
}

/** Show only the "I have paid" form (optionally prefilled from a saved registration). */
export function openConfirm(prefill, trigger) {
  current = { reg: prefill && !validateRegistration(prefill) ? prefill : null, mode: 'confirm' };
  renderConfirmOnly(prefill);
  show(trigger);
}

