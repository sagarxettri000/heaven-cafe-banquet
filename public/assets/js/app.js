import { BS_TABLE } from './bs-data.js';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const MONTHS_NE = ['बैशाख', 'जेठ', 'असार', 'श्रावण', 'भदौ', 'असोज', 'कार्तिक', 'मंसिर', 'पुष', 'माघ', 'फाल्गुन', 'चैत'];
const MONTHS_EN = ['Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];
const WEEK_NE = ['आइत', 'सोम', 'मंगल', 'बुध', 'बिही', 'शुक्र', 'शनि'];
const WEEK_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const AD_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const AD_MONTHS_NE = ['जनवरी', 'फेब्रुअरी', 'मार्च', 'अप्रिल', 'मे', 'जुन', 'जुलाई', 'अगस्ट', 'सेप्टेम्बर', 'अक्टोबर', 'नोभेम्बर', 'डिसेम्बर'];

const toNe = (n) => String(n).replace(/[0-9]/g, (d) => '०१२३४५६७८९'[d]);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const c = new Date(d.getFullYear(), d.getMonth(), d.getDate()); c.setDate(c.getDate() + n); return c; };
const diffDays = (a, b) => Math.round((b - a) / 86400000);

/* Bikram Sambat <-> Gregorian using the baked month table ------------- */

const BS_YEARS = Object.keys(BS_TABLE).map(Number).sort((a, b) => a - b);
const BS_FIRST = BS_YEARS[0];
const BS_LAST = BS_YEARS[BS_YEARS.length - 1];

function bsToAd(year, month, day) {
  const row = BS_TABLE[year];
  if (!row) return null;
  let offset = 0;
  for (let i = 0; i < month; i++) offset += row.days[i];
  offset += day - 1;
  return addDays(parseISO(row.start), offset);
}

function adToBs(date) {
  const t = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  for (let y = BS_FIRST; y <= BS_LAST; y++) {
    const start = parseISO(BS_TABLE[y].start);
    const next = y + 1 <= BS_LAST ? parseISO(BS_TABLE[y + 1].start) : null;
    const total = BS_TABLE[y].days.reduce((a, b) => a + b, 0);
    const end = next || addDays(start, total);
    if (t >= start && t < end) {
      let left = diffDays(start, t);
      for (let m = 0; m < 12; m++) {
        if (left < BS_TABLE[y].days[m]) return { year: y, month: m, day: left + 1 };
        left -= BS_TABLE[y].days[m];
      }
    }
  }
  return null;
}

function formatBs(bs, lang) {
  if (!bs) return '';
  const day = lang === 'ne' ? toNe(bs.day) : bs.day;
  const year = lang === 'ne' ? toNe(bs.year) : bs.year;
  const month = lang === 'ne' ? MONTHS_NE[bs.month] : MONTHS_EN[bs.month];
  return `${day} ${month} ${year}`;
}

function formatAd(date, lang) {
  const d = lang === 'ne' ? toNe(date.getDate()) : date.getDate();
  const month = lang === 'ne' ? AD_MONTHS_NE[date.getMonth()] : AD_MONTHS[date.getMonth()];
  const year = lang === 'ne' ? toNe(date.getFullYear()) : date.getFullYear();
  return `${d} ${month} ${year}`;
}

/* ------------------------------------------------------------------ */
/* language                                                            */
/* ------------------------------------------------------------------ */

const LANG_KEY = 'heaven.lang';
const langToggle = $('#langToggle');
const langLabel = $('#langLabel');
const origins = new WeakMap();
const originalPlaceholders = new WeakMap();

$$('[data-ne]').forEach((el) => {
  if (el.id === 'dateLabel') return;
  origins.set(el, el.textContent);
});
$$('[data-ne-placeholder]').forEach((el) => originalPlaceholders.set(el, el.getAttribute('placeholder') || ''));
$$('[data-ne-aria]').forEach((el) => origins.set(el, el.getAttribute('aria-label') || ''));

function currentLang() {
  return document.documentElement.lang === 'ne' ? 'ne' : 'en';
}

function setLang(lang) {
  document.documentElement.lang = lang;

  $$('[data-ne]').forEach((el) => {
    if (el.id === 'dateLabel') return;
    el.textContent = lang === 'ne' ? el.dataset.ne : origins.get(el);
  });

  $$('[data-ne-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', lang === 'ne' ? el.dataset.nePlaceholder : originalPlaceholders.get(el));
  });

  $$('[data-ne-aria]').forEach((el) => {
    el.setAttribute('aria-label', lang === 'ne' ? el.dataset.neAria : origins.get(el));
  });

  if (langLabel) langLabel.textContent = lang === 'ne' ? 'English' : 'नेपाली';
  const short = $('.lang-short');
  if (short) short.textContent = lang === 'ne' ? 'EN' : 'ने';
  if (langToggle) {
    langToggle.setAttribute('aria-label', lang === 'ne' ? 'Switch to English' : 'Switch to Nepali');
  }

  renderDateLabel();
  if (!dpEl.hidden) renderMonth();
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* private mode */ }
}

if (langToggle) {
  langToggle.addEventListener('click', () => setLang(currentLang() === 'ne' ? 'en' : 'ne'));
}

let savedLang = null;
try { savedLang = localStorage.getItem(LANG_KEY); } catch { /* private mode */ }
// Applied at the end of the file: setLang() re-renders the date picker, whose
// constants are not initialised yet at this point in the module.

/* ------------------------------------------------------------------ */
/* header, mobile nav, reveal                                          */
/* ------------------------------------------------------------------ */

const header = $('#siteHeader');
const onScroll = () => header.classList.toggle('is-stuck', window.scrollY > 40);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

const burger = $('#burger');
const mobileNav = $('#mobileNav');

function closeNav() {
  if (!mobileNav || mobileNav.hidden) return;
  mobileNav.hidden = true;
  burger.setAttribute('aria-expanded', 'false');
  burger.setAttribute('aria-label', 'Open menu');
}

if (burger && mobileNav) {
  burger.addEventListener('click', () => {
    const open = mobileNav.hidden;
    mobileNav.hidden = !open;
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  $$('a', mobileNav).forEach((a) => a.addEventListener('click', closeNav));
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeNav();
    closeLightbox();
    closeDatePicker();
  }
});

if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  $$('.reveal').forEach((el) => io.observe(el));
} else {
  $$('.reveal').forEach((el) => el.classList.add('in'));
}

/* ------------------------------------------------------------------ */
/* gallery lightbox                                                    */
/* ------------------------------------------------------------------ */

const lightbox = $('#lightbox');
const lbImg = $('#lbImg');
let lastFocus = null;

function openLightbox(src, alt) {
  if (!lightbox) return;
  lastFocus = document.activeElement;
  lbImg.src = src;
  lbImg.alt = alt || '';
  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
  $('#lbClose').focus();
}

function closeLightbox() {
  if (!lightbox || lightbox.hidden) return;
  lightbox.hidden = true;
  lbImg.removeAttribute('src');
  document.body.style.overflow = '';
  if (lastFocus) lastFocus.focus();
}

$$('.g-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    const img = $('img', btn);
    openLightbox(btn.dataset.full, img ? img.alt : '');
  });
});
$('#lbClose')?.addEventListener('click', closeLightbox);
lightbox?.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });

/* ------------------------------------------------------------------ */
/* date picker                                                         */
/* ------------------------------------------------------------------ */

const dpEl = $('#datePop');
const dateBtn = $('#dateBtn');
const dateLabel = $('#dateLabel');
const dpMonth = $('#dpMonth');
const dpYear = $('#dpYear');
const dpDays = $('#dpDays');
const dpWeekdays = $('#dpWeekdays');
const dpAd = $('#dpAd');
const hiddenDate = $('#eventDate');

const today = new Date();
today.setHours(0, 0, 0, 0);
const minAd = today;
const maxAd = addDays(today, 365);

const todayBs = adToBs(today);
const state = {
  bs: todayBs ? { year: todayBs.year, month: todayBs.month } : { year: 2083, month: 0 },
  selectedAd: null,
  yearMode: false,
};

function renderDateLabel() {
  if (!dateLabel) return;
  const lang = currentLang();
  if (!state.selectedAd) {
    dateLabel.textContent = lang === 'ne' ? 'मिति छान्नुहोस्' : 'Choose a date';
    return;
  }
  const ad = parseISO(state.selectedAd);
  dateLabel.textContent = `${formatBs(adToBs(ad), lang)} · ${formatAd(ad, lang)}`;
}

function monthLength(year, month) {
  return BS_TABLE[year]?.days[month] || 30;
}

function renderMonth() {
  if (!dpEl || dpEl.hidden) return;
  const lang = currentLang();
  const { year, month } = state.bs;
  dpMonth.textContent = lang === 'ne' ? MONTHS_NE[month] : MONTHS_EN[month];
  dpYear.textContent = lang === 'ne' ? toNe(year) : String(year);

  dpWeekdays.innerHTML = (lang === 'ne' ? WEEK_NE : WEEK_EN).map((w) => `<span>${w}</span>`).join('');

  const firstAd = bsToAd(year, month, 1);
  const offset = firstAd ? firstAd.getDay() : 0;
  const len = monthLength(year, month);

  let html = '';
  for (let i = 0; i < offset; i++) html += '<span class="blank"></span>';
  for (let d = 1; d <= len; d++) {
    const ad = bsToAd(year, month, d);
    if (!ad) { html += '<span class="blank"></span>'; continue; }
    const outOfRange = ad < minAd || ad > maxAd;
    const selected = state.selectedAd === iso(ad);
    const isToday = iso(ad) === iso(today);
    const cls = ['', selected ? 'is-selected' : '', isToday ? 'is-today' : ''].filter(Boolean).join(' ');
    const label = lang === 'ne' ? toNe(d) : d;
    html += `<button type="button" class="${cls}" data-ad="${iso(ad)}" ${outOfRange ? 'disabled' : ''} aria-label="${formatBs({ year, month, day: d }, 'en')}, ${formatAd(ad, 'en')}" aria-pressed="${selected}">${label}</button>`;
  }

  if (state.yearMode) {
    const years = [];
    for (let y = BS_FIRST; y <= BS_LAST; y++) {
      const start = parseISO(BS_TABLE[y].start);
      const total = BS_TABLE[y].days.reduce((a, b) => a + b, 0);
      if (addDays(start, total) < minAd || start > maxAd) continue;
      years.push(y);
    }
    dpDays.innerHTML = `<div class="dp-years">${years.map((y) => `<button type="button" data-year="${y}" class="${y === year ? 'is-selected' : ''}">${lang === 'ne' ? toNe(y) : y}</button>`).join('')}</div>`;
    dpDays.classList.add('is-years');
  } else {
    dpDays.innerHTML = html;
    dpDays.classList.remove('is-years');
  }

  dpDays.querySelectorAll('button[data-ad]').forEach((b) => {
    b.addEventListener('click', () => selectDate(b.dataset.ad));
  });
  dpDays.querySelectorAll('button[data-year]').forEach((b) => {
    b.addEventListener('click', () => {
      state.bs.year = Number(b.dataset.year);
      state.yearMode = false;
      renderMonth();
    });
  });

  const cursor = bsToAd(year, month, 1);
  const adLabel = currentLang() === 'ne'
    ? `${MONTHS_NE[month]} ${toNe(year)} बि.सं.`
    : `${MONTHS_EN[month]} ${year} BS`;
  dpAd.textContent = cursor ? adLabel : '—';
}

function selectDate(adIso) {
  state.selectedAd = adIso;
  if (hiddenDate) hiddenDate.value = adIso;
  renderDateLabel();
  closeDatePicker();
  clearError('date');
}

function openDatePicker() {
  state.yearMode = false;
  if (state.selectedAd) {
    const bs = adToBs(parseISO(state.selectedAd));
    if (bs) state.bs = { year: bs.year, month: bs.month };
  }
  dpEl.hidden = false;
  dateBtn.setAttribute('aria-expanded', 'true');
  renderMonth();
  const first = dpDays.querySelector('button:not(:disabled)');
  if (first) first.focus();
}

function closeDatePicker() {
  if (!dpEl || dpEl.hidden) return;
  dpEl.hidden = true;
  state.yearMode = false;
  dateBtn.setAttribute('aria-expanded', 'false');
}

function shiftMonth(delta) {
  let { year, month } = state.bs;
  month += delta;
  if (month < 0) { month = 11; year--; }
  if (month > 11) { month = 0; year++; }
  if (year < BS_FIRST || year > BS_LAST) return;
  state.bs = { year, month };
  renderMonth();
}

if (dateBtn && dpEl) {
  dateBtn.addEventListener('click', () => (dpEl.hidden ? openDatePicker() : closeDatePicker()));
  $('#dpPrev').addEventListener('click', () => shiftMonth(-1));
  $('#dpNext').addEventListener('click', () => shiftMonth(1));
  dpYear.addEventListener('click', () => { state.yearMode = !state.yearMode; renderMonth(); });
  $('#dpToday').addEventListener('click', () => {
    state.selectedAd = iso(today);
    hiddenDate.value = iso(today);
    renderDateLabel();
    closeDatePicker();
    clearError('date');
  });
  document.addEventListener('click', (e) => {
    if (dpEl.hidden) return;
    if (dpEl.contains(e.target) || dateBtn.contains(e.target)) return;
    closeDatePicker();
  });
}

/* ------------------------------------------------------------------ */
/* booking form                                                        */
/* ------------------------------------------------------------------ */

const form = $('#bookingForm');
const statusEl = $('#formStatus');
const submitBtn = $('#submitBtn');

const MSG = {
  en: {
    name: 'Please enter your name (2–60 characters).',
    phone: 'Enter a valid Nepali mobile number, e.g. 98XXXXXXXX.',
    email: 'That email address does not look right.',
    type: 'Let us know what you are planning.',
    space: 'Choose a space.',
    guests: 'Guests must be between 1 and 600.',
    date: 'Choose an event date.',
    msg: 'Please keep this under 500 characters.',
    sending: 'Sending…',
    ok: 'Thank you — we have your request. Our team will call you within one working day.',
    bad: 'Something went wrong. Please call us on +977 9768 545 542.',
    limit: 'Too many requests just now. Please call us on +977 9768 545 542.',
  },
  ne: {
    name: 'कृपया तपाईंको नाम लेख्नुहोस् (२–६० अक्षर)।',
    phone: 'मान्य नेपाली मोबाइल नम्बर लेख्नुहोस्, जस्तै ९८XXXXXXXX।',
    email: 'इमेल ठेगाना मिलेन।',
    type: 'के योजना गर्दै हुनुहुन्छ भन्नुहोस्।',
    space: 'स्थान छान्नुहोस्।',
    guests: 'अतिथि संख्या १ देखि ६०० सम्म हुनुपर्छ।',
    date: 'कार्यक्रमको मिति छान्नुहोस्।',
    msg: 'यो ५०० अक्षरभित्र राख्नुहोस्।',
    sending: 'पठाइँदैछ…',
    ok: 'धन्यवाद — तपाईंको अनुरोध प्राप्त भयो। हाम्रो टिमले एक कार्यदिनभित्र फोन गर्नेछ।',
    bad: 'केही गडबड भयो। कृपया +977 9768 545 542 मा फोन गर्नुहोस्।',
    limit: 'धेरै अनुरोध आयो। कृपया +977 9768 545 542 मा फोन गर्नुहोस्।',
  },
};

const t = (key) => MSG[currentLang()][key];

function setError(field, key) {
  const wrap = form.querySelector(`#f-${field}`)?.closest('.field')
    || form.querySelector(`#dateBtn`)?.closest('.field');
  const err = form.querySelector(`#e-${field}`);
  if (wrap) wrap.classList.add('is-invalid');
  if (err) err.textContent = t(key);
}

function clearError(field) {
  const wrap = form.querySelector(`#f-${field}`)?.closest('.field')
    || (field === 'date' ? form.querySelector('#dateBtn')?.closest('.field') : null);
  const err = form.querySelector(`#e-${field}`);
  if (wrap) wrap.classList.remove('is-invalid');
  if (err) err.textContent = '';
}

function validate(data) {
  const errors = {};
  const name = (data.name || '').trim();
  if (name.length < 2 || name.length > 60) errors.name = 'name';

  const phone = (data.phone || '').replace(/[\s\-()]/g, '');
  if (!/^(?:\+?977)?(?:9[6-8]\d{8})$/.test(phone)) errors.phone = 'phone';

  const email = (data.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'email';

  if (!data.event_type) errors.type = 'type';
  if (!data.space) errors.space = 'space';

  const guests = Number(data.guests);
  if (!Number.isInteger(guests) || guests < 1 || guests > 600) errors.guests = 'guests';

  if (!data.event_date || !/^\d{4}-\d{2}-\d{2}$/.test(data.event_date)) errors.date = 'date';

  if ((data.message || '').length > 500) errors.msg = 'msg';
  return errors;
}

function showErrors(errors) {
  ['name', 'phone', 'email', 'type', 'space', 'guests', 'date', 'msg'].forEach((f) => clearError(f));
  Object.entries(errors).forEach(([field, key]) => setError(field === 'msg' ? 'msg' : field, key));
  const first = Object.keys(errors)[0];
  if (!first) return;
  if (first === 'date') dateBtn.focus();
  else form.querySelector(`#f-${first}`)?.focus();
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!statusEl) return;
  statusEl.textContent = '';
  statusEl.className = 'form-status';

  const fd = new FormData(form);
  const data = Object.fromEntries(fd.entries());
  data.event_date = hiddenDate?.value || '';

  const errors = validate(data);
  if (Object.keys(errors).length) {
    showErrors(errors);
    return;
  }

  if (data.company) return; // honeypot

  submitBtn.disabled = true;
  const originalLabel = submitBtn.textContent;
  submitBtn.textContent = t('sending');

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (res.status === 201) {
      statusEl.textContent = t('ok');
      statusEl.classList.add('ok');
      form.reset();
      hiddenDate.value = '';
      state.selectedAd = null;
      renderDateLabel();
    } else if (res.status === 429) {
      statusEl.textContent = t('limit');
      statusEl.classList.add('bad');
    } else if (res.status === 400) {
      const body = await res.json().catch(() => ({}));
      if (body.fields) showErrors(body.fields);
      statusEl.textContent = body.error || t('bad');
      statusEl.classList.add('bad');
    } else {
      statusEl.textContent = t('bad');
      statusEl.classList.add('bad');
    }
  } catch {
    statusEl.textContent = t('bad');
    statusEl.classList.add('bad');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = currentLang() === 'ne' ? submitBtn.dataset.ne : originalLabel;
  }
});

// clear a field error as soon as the visitor edits it
form?.addEventListener('input', (e) => {
  const id = e.target.id || '';
  if (id.startsWith('f-')) clearError(id.slice(2));
});

/* ------------------------------------------------------------------ */
/* misc                                                                */
/* ------------------------------------------------------------------ */

const yearEl = $('#year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

renderDateLabel();

// Restore the visitor's language only once every module constant exists:
// setLang() re-renders the picker, whose refs are declared mid-module.
if (savedLang === 'ne') setLang('ne');
