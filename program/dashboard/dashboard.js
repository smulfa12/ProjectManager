/**
 * Menu 1 — Dashboard Workload
 * Beban kerja per Client, per Tipe Tiket, dan per Tim / Member.
 */
import * as workload from '../../service/workload.service.js';
import * as projects from '../../service/project.service.js';
import * as clients from '../../service/client.service.js';
import * as master from '../../service/master.service.js';
import * as members from '../../service/member.service.js';
import * as auth from '../../service/auth.service.js';
import { loadDemo } from '../../service/demo.service.js';
import * as followup from '../../service/followup.service.js';
import { esc, pageHeader, periodFilter, statCard, barList, options, emptyState, progressBar, attempt, badge } from '../../service/ui.service.js';
import { number, md, rupiahShort, pct, dateLabel } from '../../service/format.service.js';

const FU_LIMIT = 8;

/** Kartu "Perlu Follow Up" untuk user yang login (member dirinya sendiri). */
function followupCard() {
  const me = auth.currentMember();
  if (!me) {
    return auth.isAdmin()
      ? `<section class="card fu-card"><div class="card__head"><h2>📌 Perlu Follow Up</h2></div>
          <p class="muted small">Akun Anda belum terdaftar sebagai user di Setting → User & Client, jadi daftar follow up pribadi belum bisa ditampilkan.</p></section>`
      : '';
  }
  const items = followup.forMember(me);
  let expanded = false;
  try {
    expanded = sessionStorage.getItem('pm.fu.all') === '1';
  } catch { /* abaikan */ }
  const shown = expanded ? items : items.slice(0, FU_LIMIT);
  const urgent = items.filter((i) => i.severity <= 1).length;
  return `
    <section class="card fu-card">
      <div class="card__head">
        <h2>📌 Perlu Follow Up — ${esc(me.name)}</h2>
        <span class="small">${items.length ? `<b>${items.length}</b> pekerjaan${urgent ? ` · <span class="text-red">${urgent} mendesak</span>` : ''}` : ''}</span>
      </div>
      ${items.length
        ? `<div class="table-wrap"><table class="table table--compact table--hover fu-table">
            <thead><tr><th></th><th>Pekerjaan</th><th>Client</th><th>Status</th><th>Perlu follow up</th><th></th></tr></thead>
            <tbody>${shown
              .map(
                (i) => `<tr>
                <td><span class="dot tone-${i.severity <= 1 ? 'red' : i.severity <= 2 ? 'amber' : 'gray'}"></span></td>
                <td><b>${esc(i.code)}</b>${i.jira ? ` <small class="muted">${esc(i.jira)}</small>` : ''}${i.kind === 'activity' ? ' <small class="badge tone-teal">activity</small>' : ''}<div class="fu-title">${esc(i.title)}</div></td>
                <td class="small">${esc(i.client)}</td>
                <td class="small nowrap">${esc(i.status || '')}</td>
                <td>${i.reasons.map((r) => badge(r.text, r.tone)).join(' ')}</td>
                <td class="actions"><a class="btn btn--ghost btn--sm" href="${esc(i.href)}">Buka</a></td>
              </tr>`
              )
              .join('')}</tbody>
          </table></div>
          ${items.length > FU_LIMIT ? `<div class="form-actions"><button class="btn btn--ghost btn--sm" data-fu-toggle>${expanded ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${items.length})`}</button></div>` : ''}`
        : '<p class="muted small">🎉 Tidak ada pekerjaan yang perlu di-follow up saat ini.</p>'}
    </section>`;
}

const utilTone = (u) => (u > 100 ? 'red' : u >= 75 ? 'amber' : u > 0 ? 'green' : 'gray');

function render(el, state) {
  let data = workload.build(state);
  // pilihan Tim hanya tim yang terkait client yang di-handle / dipilih
  if (state.team && !data.teams.includes(state.team)) {
    state.team = '';
    data = workload.build(state);
  }
  const teamSel = el.querySelector('[data-team]');
  teamSel.innerHTML = options(data.teams, state.team, { empty: 'Semua tim' });
  const s = data.summary;
  const box = el.querySelector('[data-body]');

  if (!projects.list().length && !clients.list().length) {
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
    ${followupCard()}
    <div class="stats">
      ${statCard({ label: 'Total Project', value: number(s.count), hint: `${number(s.open)} open · <span class="text-red">${number(s.overdue)} lewat target</span>`, tone: 'blue', icon: '📁' })}
      ${statCard({ label: 'Total Mandays', value: md(s.mandays), hint: `Cost ${number(s.mandaysByCost.Cost)} · Free ${number(s.mandaysByCost['Free Mandays'])} · Waived ${number(s.mandaysByCost.Waived)}`, tone: 'purple', icon: '⏱️' })}
      ${statCard({ label: 'Price TCV', value: rupiahShort(s.priceTcv), hint: `Project ${rupiahShort(s.projectTcv)} · Maintenance ${rupiahShort(s.maintenance)}`, tone: 'teal', icon: '💼' })}
      ${statCard({ label: 'Gross Profit', value: rupiahShort(s.grossProfit), hint: `${s.revenue ? `Margin ${pct((s.grossProfit / s.revenue) * 100)} · ` : ''}Project ${rupiahShort(s.projectGp)} · Maint. ${rupiahShort(s.maintenance)}`, tone: s.grossProfit < 0 ? 'red' : 'green', icon: '📈' })}
      ${statCard({ label: 'Activity Open', value: number(data.activities.open), hint: `${number(data.activities.today)} target hari ini · <span class="text-red">${number(data.activities.overdue)} terlambat</span>`, tone: 'amber', icon: '🗓️' })}
    </div>

    <div class="grid grid--2">
      <section class="card">
        <div class="card__head"><h2>🏦 Workload per Client</h2><span class="muted small">jumlah project · mandays</span></div>
        ${barList(
          data.byClient.filter((c) => c.count).map((c) => ({
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
          <thead><tr><th>Client</th>${data.types.map((t) => `<th class="num">${esc(t)}</th>`).join('')}<th class="num">Total</th><th class="num">Mandays</th><th class="num">Revenue Project</th><th class="num">Maintenance Fee</th><th class="num">Total Revenue</th><th class="num">Gross Profit</th></tr></thead>
          <tbody>
            ${data.byClient
              .map((c, i) => `
              <tr>
                <td><a href="#/client/detail?id=${esc(c.key)}">${esc(c.label)}</a></td>
                ${data.matrix[i].cells.map((n) => `<td class="num ${n ? '' : 'muted'}">${n || '·'}</td>`).join('')}
                <td class="num"><b>${c.count}</b></td>
                <td class="num">${number(c.mandays)}</td>
                <td class="num">${rupiahShort(c.revenue)}</td>
                <td class="num">${c.maintenance ? rupiahShort(c.maintenance) : '<span class="muted">·</span>'}</td>
                <td class="num"><b>${rupiahShort(c.revenue + c.maintenance)}</b></td>
                <td class="num ${c.grossProfit + c.maintenance < 0 ? 'text-red' : ''}">${rupiahShort(c.grossProfit + c.maintenance)}</td>
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
  box.querySelector('[data-fu-toggle]')?.addEventListener('click', () => {
    try {
      sessionStorage.setItem('pm.fu.all', sessionStorage.getItem('pm.fu.all') === '1' ? '0' : '1');
    } catch { /* abaikan */ }
    render(el, state);
  });
}

export default {
  path: '/',
  title: 'Dashboard Workload',
  render(el) {
    const state = { from: '', to: '', clientId: '', type: '', team: '' };
    el.innerHTML = `
      ${pageHeader({ title: 'Dashboard Workload', subtitle: 'Beban kerja per client, tipe tiket, dan tim', icon: '📊' })}
      <div class="toolbar">
        <div data-period></div>
        <div class="toolbar__right">
          <select class="input input--sm" data-client>${options(clients.list(), '', { valueKey: 'id', labelKey: 'name', empty: 'Semua client' })}</select>
          <select class="input input--sm" data-type>${options(master.types(), '', { empty: 'Semua tipe' })}</select>
          <select class="input input--sm" data-team></select>
        </div>
      </div>
      <div data-body></div>`;
    const redraw = () => render(el, state);
    el.querySelector('[data-client]').addEventListener('change', (e) => ((state.clientId = e.target.value), redraw()));
    el.querySelector('[data-type]').addEventListener('change', (e) => ((state.type = e.target.value), redraw()));
    el.querySelector('[data-team]').addEventListener('change', (e) => ((state.team = e.target.value), redraw()));
    periodFilter(el.querySelector('[data-period]'), (r) => {
      Object.assign(state, r);
      redraw();
    }, 'this-year');
  },
};
