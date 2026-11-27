/**
 * Detail Client — data kontrak, pemakaian free mandays, project, dan user yang meng-handle.
 */
import * as clients from '../../service/client.service.js';
import * as members from '../../service/member.service.js';
import * as projects from '../../service/project.service.js';
import * as auth from '../../service/auth.service.js';
import { esc, badge, pageHeader, emptyState, statCard, progressBar, confirmDialog, attempt } from '../../service/ui.service.js';
import { rupiah, rupiahShort, number, md, dateLabel, pct } from '../../service/format.service.js';
import { projectTable } from '../shared/project-table.js';
import { openClientForm } from './client-form.js';
import { navigate } from '../../service/router.service.js';
import * as maintenance from '../../service/maintenance.service.js';

/** Tabel project per kategori biaya (Free Mandays / Waived) di periode berjalan. */
function costTable(rows, label) {
  if (!rows.length) return `<p class="muted small">Belum ada project ${label} di periode ini.</p>`;
  return `
    <table class="table table--compact">
      <thead><tr><th>Project</th><th>Tipe</th><th>Date</th><th class="num">Mandays</th></tr></thead>
      <tbody>${rows
        .map((p) => `<tr><td><a href="#/project/detail?id=${esc(p.id)}">${esc(p.code)}</a> ${esc(p.title || '')}</td><td>${esc(p.type)}</td><td>${dateLabel(p.date)}</td><td class="num">${number(p.mandays)}</td></tr>`)
        .join('')}</tbody>
    </table>`;
}

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
        ${statCard({ label: 'Waived', value: md(m.waivedMandays), hint: `${m.waivedProjects.length} project`, tone: 'amber' })}
        ${statCard({ label: 'Mandays berbayar', value: md(m.billableMandays), tone: 'purple' })}
        ${statCard({ label: 'Revenue / GP', value: rupiahShort(m.revenue), hint: `GP ${rupiahShort(m.grossProfit)}`, tone: 'green' })}
        ${statCard({ label: 'Project', value: `${m.openProjects} open`, hint: `${m.totalProjects} total · ${m.bastPending} belum BAST`, tone: 'amber' })}
      </div>

      <div class="grid grid--2">
        <section class="card">
          <div class="card__head"><h3>🎁 Pemakaian Free Mandays</h3><span class="muted small">${m.range.source}: ${dateLabel(m.range.from)} – ${dateLabel(m.range.to)}</span></div>
          <div class="util util--lg">${progressBar(Math.min(m.freePct, 100), tone)}<span>${pct(m.freePct)}</span></div>
          ${costTable(m.freeProjects, 'Free Mandays')}
        </section>
        <section class="card">
          <div class="card__head"><h3>🤝 Waived</h3><span class="muted small">${number(m.waivedMandays)} MD · ${m.range.source}</span></div>
          ${costTable(m.waivedProjects, 'Waived')}
        </section>
      </div>

      <div class="grid grid--2">
        <section class="card">
          <div class="card__head"><h3>👥 User yang meng-handle</h3>${auth.isAdmin() ? '<a class="small" href="#/settings?tab=users">Atur →</a>' : ''}</div>
          <ul class="member-load">
            ${handlers.map((h) => `<li>${members.avatar(h, 30)}<div class="grow"><b>${esc(h.name)}</b><div class="muted small">${esc(h.position || h.team || '')} · ${esc(h.email || '-')}</div></div></li>`).join('') || '<li class="muted small">Belum ada user.</li>'}
          </ul>
          <h3 class="mt">👤 PIC Bank</h3>
          ${clients.pics(c.id).length
            ? `<ul class="member-load">${clients.pics(c.id).map((x) => `<li><span class="avatar" style="--size:30px;--hue:200">${esc(x.name.slice(0, 1).toUpperCase())}</span><div class="grow"><b>${esc(x.name)}</b><div class="muted small">${esc([x.position, x.email, x.phone].filter(Boolean).join(' · ') || '-')}</div></div></li>`).join('')}</ul>`
            : `<p class="muted small">Belum ada PIC Bank${auth.isAdmin() ? ' — tambahkan lewat ✏️ Edit' : ''}.</p>`}
          ${c.notes ? `<p class="small">${esc(c.notes)}</p>` : ''}
        </section>
      </div>

      ${(() => {
        const s = maintenance.summary(c);
        if (!s.hasContract || !s.tcv) return '';
        const now = new Date().getFullYear();
        return `
      <section class="card">
        <div class="card__head"><h3>💼 Kontrak Maintenance & Amortisasi</h3><span class="muted small">${dateLabel(s.start)} – ${dateLabel(s.end)} · ${s.months} bulan · ${s.status}</span></div>
        <div class="stats stats--sm">
          ${statCard({ label: 'Harga / tahun', value: rupiahShort(s.price), tone: 'blue' })}
          ${statCard({ label: 'Nilai Kontrak (TCV)', value: rupiahShort(s.tcv), hint: s.tcvAuto ? 'otomatis' : '', tone: 'purple' })}
          ${statCard({ label: 'Amortisasi / bulan', value: rupiahShort(s.monthly), tone: 'teal' })}
          ${statCard({ label: 'Terakui s/d hari ini', value: rupiahShort(s.toDate), hint: `sisa ${rupiahShort(s.remaining)}`, tone: 'green' })}
        </div>
        <table class="table table--compact">
          <thead><tr><th>Tahun</th><th>Periode</th><th class="num">Bulan</th><th class="num">Pengakuan (amortisasi)</th></tr></thead>
          <tbody>${maintenance
            .schedule(c)
            .map((r) => `<tr class="${r.year === now ? 'is-current' : ''}"><td><b>${r.year}</b>${r.year === now ? ' ' + badge('tahun berjalan', 'blue') : ''}</td><td>${dateLabel(r.from)} – ${dateLabel(r.to)}</td><td class="num">${r.months}</td><td class="num">${rupiah(r.amount)}</td></tr>`)
            .join('')}</tbody>
        </table>
      </section>`;
      })()}

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
