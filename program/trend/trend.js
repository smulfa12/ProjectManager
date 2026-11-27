/**
 * Menu — History Trend
 * Grafik pergerakan tiket CLOSE dari tahun ke tahun (CR, PRL/maintenance, dll),
 * per bulan untuk tahun terpilih, plus pendapatan maintenance kontrak (amortisasi).
 */
import * as trend from '../../service/trend.service.js';
import * as clients from '../../service/client.service.js';
import { esc, pageHeader, options, emptyState, statCard } from '../../service/ui.service.js';
import { number, rupiah, rupiahShort, monthShort } from '../../service/format.service.js';
import { barChart, bindChartClick, PALETTE } from '../shared/chart.js';

const KEY = 'pm.trend';
const MAINT_LABEL = 'Maintenance (kontrak)';

export default {
  path: '/trend',
  title: 'History Trend',
  render(el) {
    let saved = {};
    try {
      saved = JSON.parse(sessionStorage.getItem(KEY)) || {};
    } catch { /* abaikan */ }
    const allTypes = trend.typesIn(trend.closed());
    const state = {
      clientId: saved.clientId || '',
      metric: saved.metric || 'count',
      series: (saved.series || allTypes.slice(0, 2)).filter((s) => s === trend.MAINT_KEY || allTypes.includes(s)),
      year: saved.year || 0,
    };
    if (!state.series.length) state.series = allTypes.slice(0, 2);

    el.innerHTML = `
      ${pageHeader({ title: 'History Trend', subtitle: 'Pergerakan tiket close dari tahun ke tahun — CR, maintenance (PRL) & kontrak maintenance', icon: '📈' })}
      <div class="toolbar">
        <div class="chips" data-metric></div>
        <div class="toolbar__right">
          <select class="input input--sm" data-client>${options(clients.list(), state.clientId, { valueKey: 'id', labelKey: 'name', empty: 'Semua client' })}</select>
        </div>
      </div>
      <div class="toolbar"><span class="small muted">Tampilkan:</span><div class="chips" data-series></div></div>
      <div data-body></div>`;

    const body = el.querySelector('[data-body]');
    const fmt = (v) => (state.metric === 'revenue' ? rupiahShort(v) : number(v));
    const fmtFull = (v) => (state.metric === 'revenue' ? rupiah(v) : number(v));
    const label = (k) => (k === trend.MAINT_KEY ? MAINT_LABEL : k);
    const color = (k) => (k === trend.MAINT_KEY ? 'var(--green)' : PALETTE[allTypes.indexOf(k) % PALETTE.length]);

    function drawControls() {
      el.querySelector('[data-metric]').innerHTML = trend.METRICS.map((m) => `<button class="chip ${m.key === state.metric ? 'chip--on' : ''}" data-m="${m.key}">${m.label}</button>`).join('');
      const choices = [...allTypes, ...(state.metric === 'revenue' ? [trend.MAINT_KEY] : [])];
      el.querySelector('[data-series]').innerHTML =
        choices
          .map((k) => `<button class="chip chip--check ${state.series.includes(k) ? 'chip--on' : ''}" data-s="${esc(k)}">${state.series.includes(k) ? '✓ ' : ''}${esc(label(k))}</button>`)
          .join('') || '<span class="muted small">Belum ada tiket close.</span>';
      el.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => ((state.metric = b.dataset.m), draw())));
      el.querySelectorAll('[data-s]').forEach(
        (b) =>
          (b.onclick = () => {
            const k = b.dataset.s;
            state.series = state.series.includes(k) ? state.series.filter((x) => x !== k) : [...state.series, k];
            draw();
          })
      );
    }

    function draw() {
      sessionStorage.setItem(KEY, JSON.stringify(state));
      drawControls();
      const series = state.series.filter((k) => k !== trend.MAINT_KEY || state.metric === 'revenue');
      if (!series.length) {
        body.innerHTML = `<div class="card">${emptyState('📈', 'Pilih minimal satu tipe', 'Klik CR, PRL, atau tipe lain di atas.')}</div>`;
        return;
      }
      const data = trend.yearly({ clientId: state.clientId, metric: state.metric, series });
      if (!data.years.length) {
        body.innerHTML = `<div class="card">${emptyState('📈', 'Belum ada data', 'Belum ada tiket berstatus close untuk filter ini.')}</div>`;
        return;
      }
      if (!data.years.includes(state.year)) state.year = data.years[data.years.length - 1];
      const yi = data.years.indexOf(state.year);
      const total = (i) => data.series.reduce((s, x) => s + x.values[i], 0);
      const prev = yi > 0 ? total(yi - 1) : 0;
      const growth = prev ? ((total(yi) - prev) / prev) * 100 : null;
      const months = trend.monthly({ clientId: state.clientId, metric: state.metric, series, year: state.year });
      // lebar grafik mengikuti lebar halaman (kartu penuh & setengah)
      const full = Math.max(320, body.clientWidth - 40);
      const half = window.innerWidth > 1100 ? Math.max(320, (body.clientWidth - 16) / 2 - 40) : full;
      const best = data.years.reduce((b, y, i) => (total(i) > total(b) ? i : b), 0);

      body.innerHTML = `
        <div class="stats stats--sm">
          ${statCard({ label: `Total ${state.year}`, value: fmt(total(yi)), hint: data.series.map((s) => `${label(s.key)} ${fmt(s.values[yi])}`).join(' · '), tone: 'blue', icon: '📅' })}
          ${statCard({ label: `vs ${state.year - 1}`, value: growth === null ? '-' : `${growth >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(growth))}%`, hint: prev ? `${fmt(prev)} → ${fmt(total(yi))}` : 'tidak ada data tahun sebelumnya', tone: growth === null ? 'gray' : growth >= 0 ? 'green' : 'red', icon: '↕️' })}
          ${statCard({ label: 'Tahun tertinggi', value: String(data.years[best]), hint: fmt(total(best)), tone: 'purple', icon: '🏆' })}
          ${statCard({ label: 'Total semua tahun', value: fmt(data.years.reduce((s, _, i) => s + total(i), 0)), hint: `${data.years[0]}–${data.years[data.years.length - 1]}`, tone: 'teal', icon: 'Σ' })}
        </div>

        <section class="card">
          <div class="card__head"><h3>📊 Per tahun — ${esc(trend.METRICS.find((m) => m.key === state.metric).label)}</h3><span class="muted small">klik tahun untuk melihat per bulan</span></div>
          <div data-yearly>${barChart({ categories: data.years.map(String), series: data.series.map((s) => ({ name: label(s.key), color: color(s.key), values: s.values })), format: fmt, onClick: true, width: full })}</div>
        </section>

        <div class="grid grid--2">
          <section class="card">
            <div class="card__head"><h3>🗓️ Per bulan ${state.year}</h3>
              <select class="input input--sm" data-year>${options(data.years.map(String), String(state.year))}</select></div>
            ${barChart({ categories: Array.from({ length: 12 }, (_, i) => monthShort(i)), series: months.map((s) => ({ name: label(s.key), color: color(s.key), values: s.values })), format: fmt, height: 240, width: half })}
          </section>
          <section class="card">
            <div class="card__head"><h3>📋 Tabel per tahun</h3></div>
            <div class="table-wrap"><table class="table table--compact">
              <thead><tr><th>Tahun</th>${data.series.map((s) => `<th class="num">${esc(label(s.key))}</th>`).join('')}<th class="num">Total</th><th class="num">Pertumbuhan</th></tr></thead>
              <tbody>${data.years
                .map((y, i) => {
                  const t = total(i);
                  const p = i ? total(i - 1) : 0;
                  const g = p ? ((t - p) / p) * 100 : null;
                  return `<tr class="${y === state.year ? 'is-current' : ''}"><td><b>${y}</b></td>${data.series.map((s) => `<td class="num">${fmtFull(s.values[i])}</td>`).join('')}
                    <td class="num"><b>${fmtFull(t)}</b></td>
                    <td class="num ${g === null ? 'muted' : g >= 0 ? 'growth--up' : 'growth--down'}">${g === null ? '-' : `${g >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(g))}%`}</td></tr>`;
                })
                .join('')}</tbody>
            </table></div>
            <p class="muted small">Tahun close = Selesai Aktual → Tanggal BAST → Target → Date. Status Canceled tidak dihitung.
              ${state.metric === 'revenue' ? 'Maintenance (kontrak) = amortisasi nilai kontrak per tahun.' : ''}</p>
          </section>
        </div>`;

      bindChartClick(body.querySelector('[data-yearly]'), (i) => ((state.year = data.years[i]), draw()));
      body.querySelector('[data-year]').addEventListener('change', (e) => ((state.year = Number(e.target.value)), draw()));
    }

    el.querySelector('[data-client]').addEventListener('change', (e) => ((state.clientId = e.target.value), draw()));
    draw();
  },
};
