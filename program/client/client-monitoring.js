/**
 * Menu 5 — Monitoring Client
 *  5.1 Setting price per client
 *  5.2 Setting free mandays per client
 *  5.3 Maintenance: harga tahun berjalan & amortisasi TCV kontrak
 * Plus pemakaian free mandays, revenue & project per client.
 */
import * as clients from '../../service/client.service.js';
import * as auth from '../../service/auth.service.js';
import { esc, pageHeader, tabs, bindTabs, emptyState, progressBar, badge, bindMoneyInput, moneyValue, attempt, confirmDialog, statCard, toast, options } from '../../service/ui.service.js';
import { rupiah, rupiahShort, number, md, dateLabel, daysUntil, parseNumber, pct } from '../../service/format.service.js';
import { openClientForm } from './client-form.js';
import * as maintenance from '../../service/maintenance.service.js';
import * as sla from '../../service/sla.service.js';
import * as master from '../../service/master.service.js';
import * as projects from '../../service/project.service.js';

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
              ${(() => {
                const ms = maintenance.summary(c);
                return ms.hasContract && ms.tcv ? `<div class="row-between small"><span>Maintenance ${ms.year}</span><b>${rupiahShort(ms.yearAmount)} · ${ms.status}</b></div>` : '';
              })()}
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

/** 5.4 SLA PRL: SLA solusi sementara & permanen per prioritas, per client. */
function slaTable(list, clientId) {
  const c = clients.get(clientId) || list[0];
  const editable = auth.isAdmin();
  const t = sla.table(c.id);
  const custom = c.sla && Object.keys(c.sla).length;
  const open = projects.list().filter((p) => p.clientId === c.id && sla.applies(p) && !master.isClosed(p.status));
  const cell = (pr, kind) => `
    <div class="sla-cell">
      <input class="input input--sm num" type="number" min="0" step="0.5" data-pr="${esc(pr)}" data-kind="${kind}" data-f="v" value="${esc(t[pr][kind].v)}" ${editable ? '' : 'disabled'} />
      <select class="input input--sm" data-pr="${esc(pr)}" data-kind="${kind}" data-f="u" ${editable ? '' : 'disabled'}>${options(sla.UNITS, t[pr][kind].u)}</select>
    </div>`;
  return `
    <div class="toolbar">
      <label class="small muted">Client</label>
      <select class="input input--sm" data-sla-client>${options(list, c.id, { valueKey: 'id', labelKey: (x) => `${x.code} — ${x.name}` })}</select>
      <span class="badge tone-${custom ? 'blue' : 'gray'}">${custom ? 'SLA khusus client' : 'Memakai SLA bawaan'}</span>
      <span class="muted small">${open.length} PRL belum selesai</span>
    </div>
    <div class="card card--flush"><table class="table">
      <thead><tr><th>Prioritas</th><th>⏱️ Solusi Sementara</th><th>✅ Solusi Permanen</th></tr></thead>
      <tbody>${master.prlPriorities().map((pr) => `<tr><td><b>${esc(pr)}</b></td><td>${cell(pr, 'temp')}</td><td>${cell(pr, 'perm')}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="muted small">Berlaku hanya untuk tipe ${esc(master.slaTypes().join(', '))}. Dihitung dari Waktu Lapor:
      <b>jam</b> = jam kalender (24/7), <b>hari kerja</b> = Senin–Jumat, <b>hari kalender</b> = semua hari.
      Timeline (activity) & reminder email otomatis mengikuti batas SLA.</p>
    ${editable ? `<div class="form-actions">
      <button class="btn btn--ghost btn--sm mr-auto" data-sla-default>Kembalikan ke SLA bawaan</button>
      <button class="btn btn--ghost btn--sm" data-sla-all>Terapkan ke semua client</button>
      <button class="btn btn--primary" data-sla-save>Simpan SLA ${esc(c.code)}</button>
    </div>` : '<p class="muted small">Hanya admin yang dapat mengubah SLA.</p>'}`;
}

/** 5.3 Maintenance: harga tahun berjalan, TCV kontrak & amortisasi (bisa diedit langsung). */
function maintenanceTable(list) {
  const year = new Date().getFullYear();
  const rows = list.map((c) => ({ c, s: maintenance.summary(c, year) }));
  const sum = (f) => rows.reduce((t, r) => t + (r.s[f] || 0), 0);
  const editable = auth.isAdmin();
  const statusTone = { Aktif: 'green', Berakhir: 'red', 'Belum mulai': 'gray' };
  return `
    <div class="stats stats--sm">
      ${statCard({ label: 'TCV kontrak maintenance', value: rupiahShort(sum('tcv')), hint: `${rows.filter((r) => r.s.tcv).length} client`, tone: 'blue', icon: '💼' })}
      ${statCard({ label: `Diakui tahun ${year}`, value: rupiahShort(sum('yearAmount')), hint: `YTD ${rupiahShort(sum('ytd'))}`, tone: 'green', icon: '📈' })}
      ${statCard({ label: 'Amortisasi / bulan', value: rupiahShort(sum('monthly')), tone: 'purple', icon: '🗓️' })}
      ${statCard({ label: 'Sisa belum diakui', value: rupiahShort(sum('remaining')), tone: 'amber', icon: '⏳' })}
    </div>
    <div class="card card--flush"><div class="table-wrap">
      <table class="table">
        <thead><tr>
          <th>Client</th><th>Periode Kontrak</th><th class="num">Lama</th>
          <th class="num">Harga Maintenance / tahun (${year})</th><th class="num">Nilai Kontrak (TCV)</th>
          <th class="num">Amortisasi / bulan</th><th class="num">Diakui ${year}</th><th class="num">YTD</th>
          <th style="width:12%">Terakui s/d hari ini</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>
          ${rows
            .map(({ c, s }) => `
            <tr>
              <td class="nowrap" title="${esc(c.name)}"><span class="badge tone-gray">${esc(c.code)}</span> <b>${esc(c.name)}</b></td>
              <td class="nowrap">${s.hasContract ? `${dateLabel(s.start)} – ${dateLabel(s.end)}${s.defaultEnd ? ' <small class="muted">(1 th)</small>' : ''}` : '<span class="muted">Tanggal kontrak kosong</span>'}</td>
              <td class="num nowrap">${s.hasContract ? `${s.months} bln` : '-'}</td>
              <td class="num"><input class="input input--sm num input--money" data-money data-m="maintenancePrice" data-id="${esc(c.id)}" value="${moneyValue(c.maintenancePrice)}" ${editable ? '' : 'disabled'} /></td>
              <td class="num"><input class="input input--sm num input--money" data-money data-m="maintenanceTcv" data-id="${esc(c.id)}" value="${moneyValue(c.maintenanceTcv)}" placeholder="${s.tcv ? 'auto ' + Math.round(s.tcv).toLocaleString('id-ID') : 'otomatis'}" ${editable ? '' : 'disabled'} /></td>
              <td class="num">${s.hasContract ? rupiah(s.monthly) : '-'}</td>
              <td class="num"><b>${s.hasContract ? rupiah(s.yearAmount) : '-'}</b></td>
              <td class="num">${s.hasContract ? rupiah(s.ytd) : '-'}</td>
              <td>${s.hasContract && s.tcv ? `<div class="util">${progressBar(s.progress, 'blue')}<span>${pct(s.progress)}</span></div>` : '-'}</td>
              <td>${s.hasContract ? badge(s.status, statusTone[s.status]) + (s.status === 'Aktif' && s.daysLeft <= 60 ? ` <small class="text-amber">${s.daysLeft} hari lagi</small>` : '') : '-'}</td>
              <td class="actions">${editable ? `<button class="btn btn--icon btn--ghost btn--sm" data-edit="${esc(c.id)}" title="Edit kontrak">✏️</button>` : ''}</td>
            </tr>`)
            .join('')}
        </tbody>
      </table>
    </div></div>
    <p class="muted small">TCV kosong = otomatis <i>harga per tahun × lama kontrak (bulan) ÷ 12</i>. Pendapatan diakui merata per hari sepanjang kontrak (amortisasi).
      Ubah tanggal mulai / akhir kontrak lewat tombol ✏️.</p>
    ${editable ? '<div class="form-actions"><button class="btn btn--primary" data-save-maint>Simpan perubahan</button></div>' : ''}`;
}

export default {
  path: '/client',
  title: 'Monitoring Client',
  render(el, params) {
    let tab = params.tab || 'overview';
    let slaClient = params.client || '';
    const draw = () => {
      const list = clients.list();
      const body = el.querySelector('[data-body]');
      if (!list.length) {
        body.innerHTML = emptyState('🏦', 'Belum ada client', auth.isAdmin() ? 'Klik "+ Client Baru" untuk menambah.' : 'Minta admin menambahkan client yang Anda handle.');
        return;
      }
      if (tab === 'overview') body.innerHTML = overview(list);
      else if (tab === 'sla') {
        slaClient = clients.get(slaClient) ? slaClient : list[0].id;
        body.innerHTML = slaTable(list, slaClient);
        body.querySelector('[data-sla-client]').addEventListener('change', (e) => ((slaClient = e.target.value), draw()));
        const read = () => {
          const out = {};
          master.prlPriorities().forEach((pr) => {
            out[pr] = {};
            ['temp', 'perm'].forEach((k) => {
              const q = (f) => body.querySelector(`[data-pr="${CSS.escape(pr)}"][data-kind="${k}"][data-f="${f}"]`).value;
              out[pr][k] = { v: Number(q('v')) || 0, u: q('u') };
            });
          });
          return out;
        };
        const saveFor = async (ids, value) => {
          await Promise.all(ids.map((id) => clients.updatePricing(id, { sla: value })));
          let n = 0;
          for (const id of ids) n += await projects.recalcSla(id);
          return n;
        };
        body.querySelector('[data-sla-save]')?.addEventListener('click', async () => {
          const n = await attempt(() => saveFor([slaClient], read()));
          if (n !== undefined) toast(`SLA disimpan · ${n} PRL dihitung ulang`);
          draw();
        });
        body.querySelector('[data-sla-all]')?.addEventListener('click', async () => {
          if (!(await confirmDialog(`Terapkan tabel SLA ini ke semua ${list.length} client? SLA client lain akan ditimpa.`))) return;
          const n = await attempt(() => saveFor(list.map((c) => c.id), read()));
          if (n !== undefined) toast(`SLA diterapkan ke ${list.length} client · ${n} PRL dihitung ulang`);
          draw();
        });
        body.querySelector('[data-sla-default]')?.addEventListener('click', async () => {
          if (!(await confirmDialog('Kembalikan SLA client ini ke SLA bawaan?'))) return;
          const n = await attempt(() => saveFor([slaClient], {}));
          if (n !== undefined) toast(`SLA bawaan dipakai · ${n} PRL dihitung ulang`);
          draw();
        });
      } else if (tab === 'maintenance') {
        body.innerHTML = maintenanceTable(list);
        body.querySelectorAll('[data-money]').forEach(bindMoneyInput);
        body.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => openClientForm({ id: b.dataset.edit, onSaved: draw })));
        body.querySelector('[data-save-maint]')?.addEventListener('click', async () => {
          const patches = new Map();
          body.querySelectorAll('[data-m]').forEach((inp) => {
            const value = parseNumber(inp.value);
            if (Number(clients.get(inp.dataset.id)[inp.dataset.m]) === value) return;
            patches.set(inp.dataset.id, { ...(patches.get(inp.dataset.id) || {}), [inp.dataset.m]: value });
          });
          if (!patches.size) return toast('Tidak ada perubahan');
          await attempt(() => Promise.all([...patches].map(([id, patch]) => clients.updatePricing(id, patch))), `Maintenance ${patches.size} client disimpan`);
          draw();
        });
      } else {
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
      ${pageHeader({ title: 'Monitoring Client', subtitle: 'Pemakaian free mandays, waived, harga, kontrak maintenance & project per client', icon: '🏦', actions: auth.isAdmin() ? '<button class="btn btn--primary" data-new>+ Client Baru</button>' : '' })}
      ${tabs([['overview', '📈 Monitoring'], ['price', '💲 Setting Price per Client'], ['free', '🎁 Setting Free Mandays & Waived'], ['maintenance', '💼 Maintenance & Amortisasi'], ['sla', '⏱️ SLA PRL']], tab)}
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
