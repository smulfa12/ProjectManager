/**
 * Gantt Chart — timeline target (rencana) vs timeline realtime (aktual).
 *   ▭ bar garis/terang  = Timeline Target  (plan start → plan end)
 *   ▬ bar penuh         = Timeline Realtime (actual start → actual end / hari ini)
 * Merah bila realisasi melewati target. Garis vertikal = hari ini.
 *
 * ganttChart(el, { groups:[{label, sub, icon, items:[activity]}], from, to, zoom, onOpen(id), label(a) })
 */
import * as master from '../../service/master.service.js';
import { esc } from '../../service/ui.service.js';
import { today, addDays, diffDays, parseDate, dateLabel, monthShort } from '../../service/format.service.js';

const ZOOM = { day: 30, week: 12, month: 4 };

/** Rentang tampilan otomatis dari data (dengan sedikit ruang). */
export function autoRange(items) {
  const dates = items.flatMap((a) => [a.planStart, a.planEnd, a.actualStart, a.actualEnd]).filter(Boolean);
  const t = today();
  if (!dates.length) return { from: addDays(t, -7), to: addDays(t, 21) };
  const min = dates.reduce((m, d) => (d < m ? d : m), t);
  const max = dates.reduce((m, d) => (d > m ? d : m), t);
  return { from: addDays(min, -3), to: addDays(max, 5) };
}

function header(from, days, w) {
  const months = [];
  const dayCells = [];
  for (let i = 0; i < days; i++) {
    const iso = addDays(from, i);
    const d = parseDate(iso);
    const key = iso.slice(0, 7);
    if (!months.length || months[months.length - 1].key !== key) months.push({ key, label: `${monthShort(d.getMonth())} ${d.getFullYear()}`, start: i, len: 0 });
    months[months.length - 1].len++;
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    if (w >= 20) dayCells.push(`<div class="gantt__day ${weekend ? 'is-weekend' : ''} ${iso === today() ? 'is-today' : ''}" style="left:${i * w}px;width:${w}px">${d.getDate()}</div>`);
    else if (d.getDay() === 1) dayCells.push(`<div class="gantt__day" style="left:${i * w}px;width:${w * 7}px">${d.getDate()}</div>`);
  }
  return `
    <div class="gantt__months">${months.map((m) => `<div style="left:${m.start * w}px;width:${m.len * w}px">${m.len * w > 40 ? m.label : ''}</div>`).join('')}</div>
    <div class="gantt__days">${dayCells.join('')}</div>`;
}

function weekendShade(from, days, w) {
  if (w < 20) return '';
  const out = [];
  for (let i = 0; i < days; i++) {
    const g = parseDate(addDays(from, i)).getDay();
    if (g === 0 || g === 6) out.push(`<span style="left:${i * w}px;width:${w}px"></span>`);
  }
  return `<div class="gantt__shade">${out.join('')}</div>`;
}

function bar(cls, start, end, from, to, w, title, inner = '') {
  if (!start) return '';
  const s = start < from ? from : start;
  const e = (end || start) > to ? to : end || start;
  if (e < from || s > to) return '';
  const left = diffDays(from, s) * w;
  const width = Math.max((diffDays(s, e) + 1) * w - 2, 4);
  return `<div class="gantt__bar ${cls}" style="left:${left + 1}px;width:${width}px" title="${esc(title)}">${inner}</div>`;
}

export function ganttChart(el, { groups, from, to, zoom = 'day', onOpen, label }) {
  const w = ZOOM[zoom] || ZOOM.day;
  const days = diffDays(from, to) + 1;
  const width = days * w;
  const t = today();
  const todayLeft = t >= from && t <= to ? diffDays(from, t) * w + w / 2 : -1;
  const shade = weekendShade(from, days, w);

  const rowHtml = (a) => {
    const st = master.activityStatus(a.status);
    const actualEnd = a.actualEnd || (a.actualStart ? t : '');
    const late = a.planEnd && ((a.actualEnd && a.actualEnd > a.planEnd) || (!a.actualEnd && a.status !== 'done' && t > a.planEnd));
    const planTitle = `Target: ${dateLabel(a.planStart)} – ${dateLabel(a.planEnd)}`;
    const actTitle = `Realtime: ${dateLabel(a.actualStart)} – ${a.actualEnd ? dateLabel(a.actualEnd) : 'sekarang'} · ${a.progress || 0}%`;
    return `
      <div class="gantt__row" data-open="${esc(a.id)}">
        <div class="gantt__label">
          <span class="dot tone-${st.tone}"></span>
          <div class="gantt__label-text"><b>${esc(a.title)}</b><small>${label ? label(a) : ''}</small></div>
          <span class="gantt__pct">${a.progress || 0}%</span>
        </div>
        <div class="gantt__track" style="width:${width}px">
          ${shade}
          ${bar('gantt__bar--plan', a.planStart, a.planEnd, from, to, w, planTitle)}
          ${bar(`gantt__bar--actual tone-${late ? 'red' : st.tone}`, a.actualStart, actualEnd, from, to, w, actTitle, `<span style="width:${a.progress || 0}%"></span>`)}
        </div>
      </div>`;
  };

  el.innerHTML = `
    <div class="gantt" style="--day:${w}px">
      <div class="gantt__scroll">
        <div class="gantt__head">
          <div class="gantt__label gantt__label--head">Activity</div>
          <div class="gantt__timeline" style="width:${width}px">${header(from, days, w)}</div>
        </div>
        <div class="gantt__body">
          ${todayLeft >= 0 ? `<div class="gantt__today" style="left:calc(var(--label-w) + ${todayLeft}px)" title="Hari ini"></div>` : ''}
          ${groups
            .map(
              (g) => `
            <div class="gantt__group">
              <div class="gantt__label gantt__label--group">${g.icon || ''}<div><b>${esc(g.label)}</b>${g.sub ? `<small>${esc(g.sub)}</small>` : ''}</div></div>
              <div class="gantt__track gantt__track--group" style="width:${width}px">${shade}</div>
            </div>
            ${g.items.map(rowHtml).join('')}`
            )
            .join('')}
        </div>
      </div>
      <div class="legend">
        <span class="legend__plan"></span>Timeline Target
        <span class="legend__actual"></span>Timeline Realtime (isi = progress)
        <span class="legend__late"></span>Melewati target
        <span class="legend__today"></span>Hari ini
      </div>
    </div>`;

  if (onOpen) el.querySelectorAll('[data-open]').forEach((r) => r.addEventListener('click', () => onOpen(r.dataset.open)));
  // geser ke hari ini
  const scroller = el.querySelector('.gantt__scroll');
  if (todayLeft > 300) scroller.scrollLeft = todayLeft - 300;
}
