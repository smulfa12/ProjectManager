/**
 * Detail Client — data kontrak, pemakaian free mandays, project, dan user yang meng-handle.
 */
import * as clients from '../../service/client.service.js';
import * as members from '../../service/member.service.js';
import * as projects from '../../service/project.service.js';
import * as auth from '../../service/auth.service.js';
import { esc, pageHeader, emptyState, statCard, progressBar, confirmDialog, attempt } from '../../service/ui.service.js';
import { rupiah, rupiahShort, number, md, dateLabel, pct } from '../../service/format.service.js';
import { projectTable } from '../shared/project-table.js';
import { openClientForm } from './client-form.js';
import { navigate } from '../../service/router.service.js';

export default {
  path: '/client/detail',
  title: 'Detail Client',
  render(el, params) {
    const c = clients.get(params.id);
    if (!c || !auth.canClient(c.id)) {
      el.innerHTML = pageHeader({ title: 'Client tidak ditemukan', back: '#/client' }) + emptyState('🏦', 'Client tidak ditemukan atau Anda tidak punya akses');
      return;
    }
    const m = clients.monitoring(c);
    const all = projects.list().filter((p) => p.clientId === c.id);
    const handlers = members.handlersOf(c.id);
    const tone = m.freePct >= 100 ? 'red' : m.freePct >= 80 ? 'amber' : 'green';

    el.innerHTML = `
      ${pageHeader({
        title: `${c.code} — ${c.name}`,
        subtitle: `${c.active === false ? 'Nonaktif · ' : ''}Kontrak ${dateLabel(c.contractDate)} · PM ${c.pmFrequency || '-'}`,
        back: '#/client',
        icon: '🏦',
        actions: auth.isAdmin() ? '<button class="btn btn--ghost" data-del>🗑️ Hapus</button><button class="btn btn--primary" data-edit>✏️ Edit</button>' : '',
      })}
      <div class="stats stats--sm">
        ${statCard({ label: 'Price per Mandays', value: rupiah(c.pricePerMandays), tone: 'blue' })}
        ${statCard({ label: 'Free Mandays', value: `${number(m.freeUsed)} / ${number(m.freeQuota)} MD`, hint: `sisa ${number(m.freeRemaining)} MD`, tone: tone })}
        ${statCard({ label: 'Mandays berbayar', value: md(m.billableMandays), tone: 'purple' })}
        ${statCard({ label: 'Revenue / GP', value: rupiahShort(m.revenue), hint: `GP ${rupiahShort(m.grossProfit)}`, tone: 'green' })}
        ${statCard({ label: 'Project', value: `${m.openProjects} open`, hint: `${m.totalProjects} total · ${m.bastPending} belum BAST`, tone: 'amber' })}
      </div>

      <div class="grid grid--2">
        <section class="card">
          <div class="card__head"><h3>🎁 Pemakaian Free Mandays</h3><span class="muted small">${m.range.source}: ${dateLabel(m.range.from)} – ${dateLabel(m.range.to)}</span></div>
          <div class="util util--lg">${progressBar(Math.min(m.freePct, 100), tone)}<span>${pct(m.freePct)}</span></div>
          ${m.freeProjects.length ? `
          <table class="table table--compact">
            <thead><tr><th>Project</th><th>Tipe</th><th>Date</th><th class="num">Mandays</th></tr></thead>
            <tbody>${m.freeProjects
              .map((p) => `<tr><td><a href="#/project/detail?id=${esc(p.id)}">${esc(p.code)}</a> ${esc(p.title || '')}</td><td>${esc(p.type)}</td><td>${dateLabel(p.date)}</td><td class="num">${number(p.mandays)}</td></tr>`)
              .join('')}</tbody>
          </table>` : '<p class="muted small">Belum ada project Free Mandays di periode ini.</p>'}
        </section>
        <section class="card">
          <div class="card__head"><h3>👥 User yang meng-handle</h3>${auth.isAdmin() ? '<a class="small" href="#/settings?tab=users">Atur →</a>' : ''}</div>
          <ul class="member-load">
            ${handlers.map((h) => `<li>${members.avatar(h, 30)}<div class="grow"><b>${esc(h.name)}</b><div class="muted small">${esc(h.position || h.team || '')} · ${esc(h.email || '-')}</div></div></li>`).join('') || '<li class="muted small">Belum ada user.</li>'}
          </ul>
          ${c.pic || c.notes ? `<p class="small"><b>PIC Client:</b> ${esc(c.pic || '-')}<br>${esc(c.notes || '')}</p>` : ''}
        </section>
      </div>

      <section class="card card--flush">
        <div class="card__head card__head--pad"><h3>📁 Project (${all.length})</h3><a class="btn btn--sm btn--ghost" href="#/project?client=${esc(c.id)}&status=">Buka di List Project</a></div>
        ${all.length ? projectTable(all, { sortKey: 'date', sortDir: -1 }) : '<p class="muted small pad">Belum ada project.</p>'}
      </section>`;

    el.querySelector('[data-edit]')?.addEventListener('click', () => openClientForm({ id: c.id, onSaved: () => navigate(`/client/detail?id=${c.id}&r=${Date.now()}`) }));
    el.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!(await confirmDialog(`Hapus client ${c.name}?`, { okText: 'Hapus', danger: true }))) return;
      if (await attempt(() => clients.remove(c.id).then(() => true), 'Client dihapus')) navigate('/client');
    });
  },
};
