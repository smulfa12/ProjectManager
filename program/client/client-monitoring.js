/**
 * Menu 5 — Monitoring Client
 *  5.1 Setting price per client
 *  5.2 Setting free mandays per client
 * Plus pemakaian free mandays, revenue & project per client.
 */
import * as clients from '../../service/client.service.js';
import * as auth from '../../service/auth.service.js';
import { esc, pageHeader, tabs, bindTabs, emptyState, progressBar, badge, bindMoneyInput, moneyValue, attempt, confirmDialog, statCard, toast } from '../../service/ui.service.js';
import { rupiah, rupiahShort, number, md, dateLabel, daysUntil, parseNumber, pct } from '../../service/format.service.js';
import { openClientForm } from './client-form.js';

const usageTone = (p) => (p >= 100 ? 'red' : p >= 80 ? 'amber' : 'green');

function overview(list) {
  const rows = list.map((c) => ({ c, m: clients.monitoring(c) }));
  const sum = (f) => rows.reduce((s, r) => s + r.m[f], 0);
  return `
    <div class="stats stats--sm">
      ${statCard({ label: 'Client aktif', value: number(list.filter((c) => c.active !== false).length), tone: 'blue', icon: '🏦' })}
      ${statCard({ label: 'Free mandays terpakai', value: `${number(sum('freeUsed'))} / ${number(sum('freeQuota'))}`, hint: 'periode berjalan', tone: 'teal', icon: '🎁' })}
      ${statCard({ label: 'Mandays Waived', value: md(sum('waivedMandays')), hint: `${rows.reduce((s, r) => s + r.m.waivedProjects.length, 0)} project · periode berjalan`, tone: 'amber', icon: '🤝' })}
      ${statCard({ label: 'Mandays berbayar', value: md(sum('billableMandays')), tone: 'purple', icon: '⏱️' })}
      ${statCard({ label: 'Revenue periode', value: rupiahShort(sum('revenue')), hint: `GP ${rupiahShort(sum('grossProfit'))}`, tone: 'green', icon: '💰' })}
    </div>
    <div class="client-grid">
      ${rows
        .map(({ c, m }) => {
          const left = daysUntil(m.range.to);
          return `
          <a class="card client-card ${c.active === false ? 'is-inactive' : ''}" href="#/client/detail?id=${esc(c.id)}">
            <div class="row-between">
              <div><span class="badge tone-gray">${esc(c.code)}</span> <b>${esc(c.name)}</b></div>
              ${c.active === false ? badge('Nonaktif', 'gray') : m.overdue ? badge(`${m.overdue} lewat target`, 'red') : ''}
            </div>
            <div class="client-card__usage">
              <div class="row-between small"><span>Free mandays</span><b>${number(m.freeUsed)} / ${number(m.freeQuota)} MD</b></div>
              ${progressBar(Math.min(m.freePct, 100), usageTone(m.freePct))}
              <div class="row-between small"><span>Waived</span><b>${number(m.waivedMandays)} MD · ${m.waivedProjects.length} project</b></div>
              <div class="row-between small muted"><span>Sisa free ${number(m.freeRemaining)} MD</span><span>${m.range.source}: s/d ${dateLabel(m.range.to)}${left !== null && left >= 0 && left <= 30 ? ` <span class="text-amber">(${left} hari lagi)</span>` : ''}</span></div>
            </div>
            <dl class="mini-dl">
              <div><dt>Price/MD</dt><dd>${rupiahShort(c.pricePerMandays)}</dd></div>
              <div><dt>Project open</dt><dd>${m.openProjects} / ${m.totalProjects}</dd></div>
              <div><dt>Revenue</dt><dd>${rupiahShort(m.revenue)}</dd></div>
              <div><dt>Belum BAST</dt><dd class="${m.bastPending ? 'text-amber' : ''}">${m.bastPending}</dd></div>
            </dl>
          </a>`;
        })
        .join('')}
    </div>`;
}

/** Tabel setting yang bisa diedit langsung (inline). field = 'pricePerMandays' | 'freeMandays' */
function settingTable(list, field) {
  const isPrice = field === 'pricePerMandays';
  return `
    <div class="card card--flush">
      <table class="table">
        <thead><tr>
          <th>Client ID</th><th>Nama Client</th>
          ${isPrice ? '<th class="num">Price per Mandays (Rp)</th><th class="num">Project berbayar (periode)</th><th class="num">Revenue (periode)</th>' : '<th>Tanggal Kontrak</th><th>Periode PM</th><th>Frekuensi</th><th class="num">Free Mandays</th><th class="num">Terpakai</th><th style="width:16%">Pemakaian</th><th class="num">Waived (MD)</th>'}
          <th></th>
        </tr></thead>
        <tbody>
          ${list
            .map((c) => {
              const m = clients.monitoring(c);
              const editable = auth.isAdmin();
              const input = isPrice
                ? `<input class="input input--sm num" data-money data-id="${esc(c.id)}" value="${moneyValue(c.pricePerMandays)}" ${editable ? '' : 'disabled'} />`
                : `<input class="input input--sm num" type="number" min="0" step="0.5" data-id="${esc(c.id)}" value="${esc(c.freeMandays ?? 0)}" ${editable ? '' : 'disabled'} />`;
              return `
              <tr>
                <td><span class="badge tone-gray">${esc(c.code)}</span></td>
                <td><b>${esc(c.name)}</b></td>
                ${isPrice
                  ? `<td class="num" style="width:220px">${input}</td><td class="num">${md(m.billableMandays)}</td><td class="num">${rupiah(m.revenue)}</td>`
                  : `<td>${dateLabel(c.contractDate)}</td><td>${c.pmStart ? `${dateLabel(c.pmStart)} – ${dateLabel(c.pmEnd)}` : '-'}</td><td>${esc(c.pmFrequency || '-')}</td>
                     <td class="num" style="width:140px">${input}</td><td class="num">${number(m.freeUsed)}</td>
                     <td><div class="util">${progressBar(Math.min(m.freePct, 100), usageTone(m.freePct))}<span>${pct(m.freePct)}</span></div></td>
                     <td class="num">${number(m.waivedMandays)}</td>`}
                <td class="actions">${editable ? `<button class="btn btn--icon btn--ghost btn--sm" data-edit="${esc(c.id)}" title="Edit client">✏️</button>` : ''}</td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>
    ${auth.isAdmin() ? `<div class="form-actions"><button class="btn btn--primary" data-save-all>Simpan perubahan</button></div>` : '<p class="muted small">Hanya admin yang dapat mengubah setting client.</p>'}`;
}

export default {
  path: '/client',
  title: 'Monitoring Client',
  render(el, params) {
    let tab = params.tab || 'overview';
    const draw = () => {
      const list = clients.list();
      const body = el.querySelector('[data-body]');
      if (!list.length) {
        body.innerHTML = emptyState('🏦', 'Belum ada client', auth.isAdmin() ? 'Klik "+ Client Baru" untuk menambah.' : 'Minta admin menambahkan client yang Anda handle.');
        return;
      }
      if (tab === 'overview') body.innerHTML = overview(list);
      else {
        const field = tab === 'price' ? 'pricePerMandays' : 'freeMandays';
        body.innerHTML = settingTable(list, field);
        body.querySelectorAll('[data-money]').forEach(bindMoneyInput);
        body.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => openClientForm({ id: b.dataset.edit, onSaved: draw })));
        body.querySelector('[data-save-all]')?.addEventListener('click', async () => {
          const changes = [...body.querySelectorAll('[data-id]')]
            .map((inp) => ({ id: inp.dataset.id, value: field === 'pricePerMandays' ? parseNumber(inp.value) : Number(inp.value) || 0 }))
            .filter((x) => Number(clients.get(x.id)[field]) !== x.value);
          if (!changes.length) return toast('Tidak ada perubahan');
          if (!(await confirmDialog(`Simpan ${changes.length} perubahan ${field === 'pricePerMandays' ? 'harga per mandays' : 'free mandays'}? Nilai project yang sudah ada tidak berubah otomatis.`))) return;
          await attempt(() => Promise.all(changes.map((x) => clients.updatePricing(x.id, { [field]: x.value }))), 'Setting client disimpan');
          draw();
        });
      }
    };

    el.innerHTML = `
      ${pageHeader({ title: 'Monitoring Client', subtitle: 'Pemakaian free mandays, waived, harga & project per client', icon: '🏦', actions: auth.isAdmin() ? '<button class="btn btn--primary" data-new>+ Client Baru</button>' : '' })}
      ${tabs([['overview', '📈 Monitoring'], ['price', '💲 Setting Price per Client'], ['free', '🎁 Setting Free Mandays & Waived']], tab)}
      <div data-body></div>`;
    bindTabs(el, (t) => {
      tab = t;
      history.replaceState(null, '', `#/client?tab=${t}`);
      draw();
    });
    el.querySelector('[data-new]')?.addEventListener('click', () => openClientForm({ onSaved: draw }));
    draw();
  },
};
