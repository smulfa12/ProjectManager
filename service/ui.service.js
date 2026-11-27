/**
 * UI Service — komponen tampilan yang dipakai ulang semua menu:
 * header halaman, toast, modal, konfirmasi, empty state, tab, filter periode,
 * kartu statistik, bar chart sederhana, dan helper form.
 */
import { periodRange, number } from './format.service.js';

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Header halaman: judul, subjudul, tombol aksi di kanan, dan link kembali (opsional). */
export function pageHeader({ title, subtitle = '', icon = '', actions = '', back = '' }) {
  return `
    <header class="page-head">
      ${back ? `<a class="btn btn--icon btn--ghost" href="${back}" aria-label="Kembali">←</a>` : ''}
      <div class="page-head__text">
        <h1>${icon ? `<span class="page-head__icon">${icon}</span>` : ''}${esc(title)}</h1>
        ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
      </div>
      <div class="page-head__actions">${actions}</div>
    </header>`;
}

export function emptyState(icon, title, text = '', action = '') {
  return `
    <div class="empty">
      <div class="empty__icon">${icon}</div>
      <h3>${esc(title)}</h3>
      ${text ? `<p>${esc(text)}</p>` : ''}
      ${action}
    </div>`;
}

/* ---------- Toast ---------- */

let toastTimer;
export function toast(message, type = 'ok') {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.dataset.type = type;
  el.classList.add('toast--show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('toast--show'), 3200);
}

/** Jalankan aksi async dengan toast error otomatis. */
export async function attempt(fn, okMessage) {
  try {
    const r = await fn();
    if (okMessage) toast(okMessage);
    return r;
  } catch (err) {
    console.error(err);
    toast(err?.message || 'Terjadi kesalahan', 'error');
    return undefined;
  }
}

/* ---------- Modal ---------- */

export function openModal({ title, body, wide = false, onClose }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `
    <div class="modal__backdrop" data-close></div>
    <section class="modal__panel ${wide ? 'modal__panel--wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal__head">
        <h2>${esc(title)}</h2>
        <button class="btn btn--icon btn--ghost" data-close aria-label="Tutup">✕</button>
      </div>
      <div class="modal__body">${body}</div>
    </section>`;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => wrap.classList.add('modal--open'));

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    wrap.classList.remove('modal--open');
    document.removeEventListener('keydown', onKey);
    if (!document.querySelectorAll('.modal--open').length) document.body.classList.remove('no-scroll');
    setTimeout(() => wrap.remove(), 200);
  };
  const onKey = (e) => e.key === 'Escape' && (onClose ? onClose() : close());
  document.addEventListener('keydown', onKey);
  wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => (onClose ? onClose() : close())));
  setTimeout(() => wrap.querySelector('input:not([type=hidden]),select,textarea')?.focus(), 60);
  return { el: wrap, close };
}

export function confirmDialog(message, { okText = 'Ya', cancelText = 'Batal', danger = false } = {}) {
  return new Promise((resolve) => {
    const modal = openModal({
      title: 'Konfirmasi',
      body: `
        <p class="confirm-text">${esc(message)}</p>
        <div class="form-actions">
          <button class="btn btn--ghost" data-no>${esc(cancelText)}</button>
          <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-yes>${esc(okText)}</button>
        </div>`,
      onClose: () => done(false),
    });
    const done = (v) => {
      modal.close();
      resolve(v);
    };
    modal.el.querySelector('[data-no]').onclick = () => done(false);
    modal.el.querySelector('[data-yes]').onclick = () => done(true);
  });
}

/** User sedang mengetik / membuka modal → jangan render ulang halaman. */
export function isUserBusy() {
  const a = document.activeElement;
  return Boolean(document.querySelector('.modal') || document.querySelector('.dragging') || (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)));
}

/* ---------- Form helpers ---------- */

export function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

/** <option> dari list. list bisa string[] atau object[] dengan valueKey/labelKey. */
export function options(list, selected, { valueKey, labelKey, empty } = {}) {
  const head = empty !== undefined ? `<option value="">${esc(empty)}</option>` : '';
  return (
    head +
    list
      .map((o) => {
        const value = valueKey ? o[valueKey] : o;
        const label = labelKey ? (typeof labelKey === 'function' ? labelKey(o) : o[labelKey]) : o;
        return `<option value="${esc(value)}" ${String(value) === String(selected ?? '') ? 'selected' : ''}>${esc(label)}</option>`;
      })
      .join('')
  );
}

/** Input nominal yang otomatis diberi titik ribuan saat diketik. */
export function bindMoneyInput(input) {
  const fmt = () => {
    const neg = input.value.trim().startsWith('-');
    const digits = input.value.replace(/[^\d]/g, '');
    input.value = digits ? (neg ? '-' : '') + Number(digits).toLocaleString('id-ID') : '';
  };
  input.addEventListener('input', fmt);
  fmt();
}

export const moneyValue = (n) => (Number(n) ? Math.round(Number(n)).toLocaleString('id-ID') : '');

/* ---------- Tab ---------- */

/** Render tombol tab. Kembalikan HTML; pasang listener dengan bindTabs(). */
export function tabs(list, active) {
  return `<div class="tabs" role="tablist">${list
    .map(([k, label]) => `<button class="tab ${k === active ? 'tab--on' : ''}" data-tab="${esc(k)}" role="tab">${label}</button>`)
    .join('')}</div>`;
}

export function bindTabs(root, onChange) {
  root.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      root.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('tab--on', x === b));
      onChange(b.dataset.tab);
    })
  );
}

/* ---------- Filter periode ---------- */

const PRESETS = [
  ['this-month', 'Bulan ini'],
  ['last-month', 'Bulan lalu'],
  ['3-months', '3 Bulan'],
  ['this-year', 'Tahun ini'],
  ['all', 'Semua'],
  ['custom', 'Pilih tanggal'],
];

/** Chip filter periode. onChange({from,to}) dipanggil saat berubah (dan sekali di awal). */
export function periodFilter(el, onChange, initial = 'this-year') {
  let preset = initial;
  const range = periodRange(preset);
  el.innerHTML = `
    <div class="chips">
      ${PRESETS.map(([k, l]) => `<button class="chip ${k === preset ? 'chip--on' : ''}" data-p="${k}">${l}</button>`).join('')}
      <span class="custom-range ${preset === 'custom' ? '' : 'hidden'}">
        <input type="date" class="input input--sm" data-from value="${range.from}" />
        <span class="muted">s/d</span>
        <input type="date" class="input input--sm" data-to value="${range.to}" />
      </span>
    </div>`;
  const custom = el.querySelector('.custom-range');
  const fromIn = el.querySelector('[data-from]');
  const toIn = el.querySelector('[data-to]');
  const emit = () => onChange(periodRange(preset, { from: fromIn.value, to: toIn.value }));

  el.querySelectorAll('[data-p]').forEach((b) =>
    b.addEventListener('click', () => {
      preset = b.dataset.p;
      el.querySelectorAll('[data-p]').forEach((x) => x.classList.toggle('chip--on', x === b));
      custom.classList.toggle('hidden', preset !== 'custom');
      if (preset !== 'custom') {
        const r = periodRange(preset);
        fromIn.value = r.from;
        toIn.value = r.to;
      }
      emit();
    })
  );
  fromIn.addEventListener('change', emit);
  toIn.addEventListener('change', emit);
  emit();
}

/* ---------- Statistik & chart sederhana ---------- */

export function statCard({ label, value, hint = '', tone = 'blue', icon = '' }) {
  return `
    <div class="stat tone-${tone}">
      ${icon ? `<div class="stat__icon">${icon}</div>` : ''}
      <div>
        <div class="stat__label">${esc(label)}</div>
        <div class="stat__value">${value}</div>
        ${hint ? `<div class="stat__hint">${hint}</div>` : ''}
      </div>
    </div>`;
}

/**
 * Bar horizontal. rows = [{label, value, sub?, segments?:[{value, tone}]}]
 * format = fungsi format angka.
 */
export function barList(rows, { format = number, tone = 'blue', max } = {}) {
  if (!rows.length) return '<p class="muted small">Belum ada data.</p>';
  const top = max || Math.max(...rows.map((r) => r.value), 1);
  return `
    <ul class="bar-list">
      ${rows
        .map((r) => {
          const segs = r.segments || [{ value: r.value, tone }];
          return `
          <li>
            <div class="bar-list__label">
              <span>${esc(r.label)}${r.sub ? ` <small class="muted">${esc(r.sub)}</small>` : ''}</span>
              <strong>${format(r.value)}</strong>
            </div>
            <div class="bar">${segs
              .map((s) => `<span class="bar__seg tone-${s.tone}" style="width:${Math.max((s.value / top) * 100, s.value ? 1.5 : 0)}%" title="${esc(s.title || '')}"></span>`)
              .join('')}</div>
          </li>`;
        })
        .join('')}
    </ul>`;
}

/** Badge status berwarna. */
export function badge(text, tone = 'gray') {
  return `<span class="badge tone-${tone}">${esc(text)}</span>`;
}

/** Progress bar kecil. */
export function progressBar(value, tone = 'blue') {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="progress tone-${tone}" title="${v}%"><span style="width:${v}%"></span></div>`;
}
