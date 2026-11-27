/**
 * Chart — grafik batang berkelompok (SVG) untuk History Trend.
 * barChart({ categories, series:[{name, color, values}], format, height, width })
 * width = lebar area (px); grafik tidak lebih sempit dari yang dibutuhkan agar batang terbaca.
 * Hover batang → tooltip nilai.
 */
import { esc } from '../../service/ui.service.js';

export const PALETTE = ['var(--blue)', 'var(--amber)', 'var(--teal)', 'var(--purple)', 'var(--red)', 'var(--green)', 'var(--gray)'];

/** Angka sumbu yang rapi: 0, 1, 2, 5, 10, 20, 50 … */
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function barChart({ categories, series, format = (v) => v, height = 280, width = 640, onClick }) {
  const W = Math.max(width, 64 + categories.length * Math.max(26, series.length * 10 + 10));
  const H = height;
  const pad = { l: 64, r: 12, t: 14, b: 30 };
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const ih = H - pad.t - pad.b;
  const groupW = (W - pad.l - pad.r) / Math.max(categories.length, 1);
  const barW = Math.min(36, (groupW - 12) / Math.max(series.length, 1));
  const y = (v) => pad.t + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

  const bars = categories
    .map((cat, ci) => {
      const gx = pad.l + ci * groupW + (groupW - barW * series.length) / 2;
      return series
        .map((s, si) => {
          const v = s.values[ci] || 0;
          const h = Math.max(v ? 2 : 0, (v / max) * ih);
          return `<rect class="chart__bar" x="${gx + si * barW + 1}" y="${pad.t + ih - h}" width="${barW - 2}" height="${h}" rx="3" fill="${s.color}" data-cat="${ci}">
            <title>${esc(cat)} · ${esc(s.name)}: ${esc(format(v))}</title></rect>`;
        })
        .join('');
    })
    .join('');

  return `
    <div class="chart">
      <div class="chart__legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>
      <div class="chart__scroll">
        <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">
          ${ticks
            .map((t) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}" class="chart__grid" />
              <text x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end" class="chart__axis">${esc(format(t))}</text>`)
            .join('')}
          ${bars}
          ${categories
            .map((c, ci) => `<text x="${pad.l + ci * groupW + groupW / 2}" y="${H - 8}" text-anchor="middle" class="chart__axis chart__cat ${onClick ? 'is-click' : ''}" data-cat="${ci}">${esc(c)}</text>`)
            .join('')}
        </svg>
      </div>
    </div>`;
}

/** Pasang klik kategori (mis. pilih tahun). */
export function bindChartClick(root, onClick) {
  root.querySelectorAll('[data-cat]').forEach((el) => el.addEventListener('click', () => onClick(Number(el.dataset.cat))));
}
