/**
 * Menu 1 — Dashboard Workload
 * Beban kerja per Client, per Tipe Tiket, dan per Tim / Member.
 */
import * as workload from '../../service/workload.service.js';
import * as clients from '../../service/client.service.js';
import * as master from '../../service/master.service.js';
import * as members from '../../service/member.service.js';
import * as store from '../../service/store.service.js';
import * as auth from '../../service/auth.service.js';
import { loadDemo } from '../../service/demo.service.js';
import { esc, pageHeader, periodFilter, statCard, barList, options, emptyState, progressBar, attempt } from '../../service/ui.service.js';
import { number, md, rupiahShort, pct, dateLabel } from '../../service/format.service.js';

const utilTone = (u) => (u > 100 ? 'red' : u >= 75 ? 'amber' : u > 0 ? 'green' : 'gray');

function render(el, state) {
  const data = workload.build(state);
  const s = data.summary;
  const box = el.querySelector('[data-body]');

  if (!store.all('projects').length && !store.all('clients').length) {
    box.innerHTML = emptyState(
      '📊',
      'Belum ada data',
      auth.isAdmin() ? 'Mulai dengan menambah client & member di menu Setting / Monitoring Client, atau isi data contoh.' : 'Minta admin menambahkan client yang Anda handle.',
      auth.isAdmin() ? '<button class="btn btn--primary" data-demo>Isi data contoh</button>' : ''
    );
    box.querySelector('[data-demo]')?.addEventListener('click', async () => {
      await attempt(loadDemo, 'Data contoh dimuat');
    });
    return;
  }

  box.innerHTML = `
    <div class="stats">
      ${statCard({ label: 'Total Project', value: number(s.count), hint: `${number(s.open)} open · <span class="text-red">${number(s.overdue)} lewat target</span>`, tone: 'blue', icon: '📁' })}
      ${statCard({ label: 'Total Mandays', value: md(s.mandays), hint: `${number(data.byClient.length)} client`, tone: 'purple', icon: '⏱️' })}
      ${statCard({ label: 'Price TCV', value: rupiahShort(s.priceTcv), hint: `Revenue ${rupiahShort(s.revenue)}`, tone: 'teal', icon: '💼' })}
      ${statCard({ label: 'Gross Profit', value: rupiahShort(s.grossProfit), hint: s.revenue ? `Margin ${pct((s.grossProfit / s.revenue) * 100)}` : '-', tone: s.grossProfit < 0 ? 'red' : 'green', icon: '📈' })}
      ${statCard({ label: 'Activity Open', value: number(data.activities.open), hint: `${number(data.activities.today)} target hari ini · <span class="text-red">${number(data.activities.overdue)} terlambat</span>`, tone: 'amber', icon: '🗓️' })}
    </div>

    <div class="grid grid--2">
      <section class="card">
        <div class="card__head"><h2>🏦 Workload per Client</h2><span class="muted small">jumlah project · mandays</span></div>
        ${barList(
          data.byClient.map((c) => ({
            label: c.label,
            sub: `${c.open} open · ${md(c.mandays)}`,
            value: c.count,
            segments: [
              { value: c.open, tone: 'blue', title: `Open ${c.open}` },
              { value: c.count - c.open, tone: 'green', title: `Selesai ${c.count - c.open}` },
            ],
          })),
          { format: (v) => `${number(v)} project` }
        )}
        <div class="legend"><span class="dot tone-blue"></span>Open <span class="dot tone-green"></span>Selesai/Cancel</div>
      </section>

      <section class="card">
        <div class="card__head"><h2>🎫 Workload per Tipe Tiket</h2><span class="muted small">jumlah project</span></div>
        ${barList(data.byType.map((t) => ({ label: t.label, sub: `${t.open} open · ${md(t.mandays)}`, value: t.count })), { tone: 'purple', format: (v) => `${number(v)} tiket` })}
        <div class="status-strip">
          ${data.byStatus.map((st) => `<div class="status-pill tone-${st.tone}"><span>${esc(st.name)}</span><strong>${st.count}</strong></div>`).join('')}
        </div>
      </section>
    </div>

    <section class="card">
      <div class="card__head"><h2>🧮 Matriks Client × Tipe Tiket</h2></div>
      <div class="table-wrap">
        <table class="table table--compact">
          <thead><tr><th>Client</th>${data.types.map((t) => `<th class="num">${esc(t)}</th>`).join('')}<th class="num">Total</th><th class="num">Mandays</th><th class="num">Revenue</th><th class="num">Gross Profit</th></tr></thead>
          <tbody>
            ${data.byClient
              .map((c, i) => `
              <tr>
                <td><a href="#/client/detail?id=${esc(c.key)}">${esc(c.label)}</a></td>
                ${data.matrix[i].cells.map((n) => `<td class="num ${n ? '' : 'muted'}">${n || '·'}</td>`).join('')}
                <td class="num"><b>${c.count}</b></td>
                <td class="num">${number(c.mandays)}</td>
                <td class="num">${rupiahShort(c.revenue)}</td>
                <td class="num ${c.grossProfit < 0 ? 'text-red' : ''}">${rupiahShort(c.grossProfit)}</td>
              </tr>`)
              .join('')}
          </tbody>
        </table>
      </div>
    </section>

    <div class="grid grid--2">
      <section class="card">
        <div class="card__head"><h2>👥 Workload per Tim</h2><span class="muted small">${dateLabel(data.window.from)} – ${dateLabel(data.window.to)}</span></div>
        ${data.byTeam.length ? `
        <table class="table table--compact">
          <thead><tr><th>Tim</th><th class="num">Member</th><th class="num">Project</th><th class="num">Activity Open</th><th class="num">Terlambat</th><th style="width:28%">Utilisasi</th></tr></thead>
          <tbody>
            ${data.byTeam
              .map((t) => `
              <tr>
                <td><b>${esc(t.team)}</b></td>
                <td class="num">${t.members}</td>
                <td class="num">${t.projects}</td>
                <td class="num">${t.open}</td>
                <td class="num ${t.overdue ? 'text-red' : 'muted'}">${t.overdue}</td>
                <td><div class="util">${progressBar(Math.min(t.utilization, 100), utilTone(t.utilization))}<span>${pct(t.utilization)}</span></div></td>
              </tr>`)
              .join('')}
          </tbody>
        </table>` : '<p class="muted small">Belum ada member. Tambahkan di Setting → User & Client.</p>'}
        <p class="muted small">Utilisasi = jam rencana activity ÷ kapasitas (hari kerja × jam kerja/hari) dalam 2 minggu ke depan.</p>
      </section>

      <section class="card">
        <div class="card__head"><h2>🧑‍💻 Workload per Member</h2><a class="small" href="#/activity">Lihat activity →</a></div>
        <ul class="member-load">
          ${data.members
            .map((r) => `
            <li>
              ${members.avatar(r.member, 34)}
              <div class="grow">
                <div class="row-between"><b>${esc(r.member.name)}</b><span class="badge tone-${utilTone(r.utilization)}">${pct(r.utilization)}</span></div>
                <div class="muted small">${esc(r.member.team || '-')} · ${r.projects} project · ${r.open} activity open${r.overdue ? ` · <span class="text-red">${r.overdue} terlambat</span>` : ''}</div>
                ${progressBar(Math.min(r.utilization, 100), utilTone(r.utilization))}
              </div>
            </li>`)
            .join('') || '<li class="muted small">Belum ada member.</li>'}
        </ul>
      </section>
    </div>`;
}

export default {
  path: '/',
  title: 'Dashboard Workload',
  render(el) {
    const state = { from: '', to: '', clientId: '', type: '' };
    el.innerHTML = `
      ${pageHeader({ title: 'Dashboard Workload', subtitle: 'Beban kerja per client, tipe tiket, dan tim', icon: '📊' })}
      <div class="toolbar">
        <div data-period></div>
        <div class="toolbar__right">
          <select class="input input--sm" data-client>${options(clients.list(), '', { valueKey: 'id', labelKey: 'name', empty: 'Semua client' })}</select>
          <select class="input input--sm" data-type>${options(master.types(), '', { empty: 'Semua tipe' })}</select>
        </div>
      </div>
      <div data-body></div>`;
    const redraw = () => render(el, state);
    el.querySelector('[data-client]').addEventListener('change', (e) => ((state.clientId = e.target.value), redraw()));
    el.querySelector('[data-type]').addEventListener('change', (e) => ((state.type = e.target.value), redraw()));
    periodFilter(el.querySelector('[data-period]'), (r) => {
      Object.assign(state, r);
      redraw();
    }, 'this-year');
  },
};
