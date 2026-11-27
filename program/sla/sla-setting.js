/**
 * Menu — Setting SLA per Client (khusus tiket PRL)
 * SLA Solusi Sementara & Solusi Permanen per prioritas, per client.
 * Komponen editor juga dipakai di Monitoring Client → tab SLA PRL.
 */
import * as clients from '../../service/client.service.js';
import * as projects from '../../service/project.service.js';
import * as master from '../../service/master.service.js';
import * as sla from '../../service/sla.service.js';
import * as auth from '../../service/auth.service.js';
import { esc, pageHeader, options, emptyState, attempt, confirmDialog, toast, badge } from '../../service/ui.service.js';

const KEY = 'pm.sla.client';
const isCustom = (c) => Boolean(c?.sla && Object.keys(c.sla).length);
const openPrl = (clientId) => projects.list().filter((p) => p.clientId === clientId && sla.applies(p) && !master.isClosed(p.status));

/** Simpan SLA ke beberapa client lalu hitung ulang PRL terbuka. Kembalikan jumlah PRL yang dihitung ulang. */
async function saveFor(ids, value) {
  await Promise.all(ids.map((id) => clients.updatePricing(id, { sla: value })));
  let n = 0;
  for (const id of ids) n += await projects.recalcSla(id);
  return n;
}

/**
 * Editor SLA satu client.
 * opts.clientId = client awal; opts.onClient(id) dipanggil saat client diganti; opts.onSaved() setelah simpan.
 */
export function renderSlaEditor(box, opts = {}) {
  const list = clients.list();
  if (!list.length) {
    box.innerHTML = emptyState('⏱️', 'Belum ada client');
    return;
  }
  let clientId = clients.get(opts.clientId) ? opts.clientId : list[0].id;
  const editable = auth.isAdmin();

  const draw = () => {
    const c = clients.get(clientId);
    const t = sla.table(c.id);
    const open = openPrl(c.id);
    const cell = (pr, kind) => `
      <div class="sla-cell">
        <input class="input input--sm num" type="number" min="0" step="0.5" data-pr="${esc(pr)}" data-kind="${kind}" data-f="v" value="${esc(t[pr][kind].v)}" ${editable ? '' : 'disabled'} />
        <select class="input input--sm" data-pr="${esc(pr)}" data-kind="${kind}" data-f="u" ${editable ? '' : 'disabled'}>${options(sla.UNITS, t[pr][kind].u)}</select>
      </div>`;
    box.innerHTML = `
      <div class="toolbar">
        <label class="small muted">Client</label>
        <select class="input input--sm" data-sla-client>${options(list, c.id, { valueKey: 'id', labelKey: (x) => `${x.code} — ${x.name}` })}</select>
        ${badge(isCustom(c) ? 'SLA khusus client' : 'Memakai SLA bawaan', isCustom(c) ? 'blue' : 'gray')}
        <span class="muted small">${open.length} PRL belum selesai</span>
      </div>
      <div class="card card--flush"><table class="table">
        <thead><tr><th>Prioritas</th><th>⏱️ Solusi Sementara</th><th>✅ Solusi Permanen</th></tr></thead>
        <tbody>${master.prlPriorities().map((pr) => `<tr><td><b>${esc(pr)}</b></td><td>${cell(pr, 'temp')}</td><td>${cell(pr, 'perm')}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="muted small">Berlaku hanya untuk tipe ${esc(master.slaTypes().join(', '))}. Dihitung dari Waktu Lapor:
        <b>jam</b> = jam kalender (24/7), <b>hari kerja</b> = Senin–Jumat, <b>hari kalender</b> = semua hari.
        Timeline (activity) & reminder email otomatis mengikuti batas SLA; PRL yang belum selesai dihitung ulang saat disimpan.</p>
      ${editable
        ? `<div class="form-actions">
            <button class="btn btn--ghost btn--sm mr-auto" data-sla-default>Kembalikan ke SLA bawaan</button>
            <button class="btn btn--ghost btn--sm" data-sla-all>Terapkan ke semua client</button>
            <button class="btn btn--primary" data-sla-save>💾 Simpan SLA ${esc(c.code)}</button>
          </div>`
        : '<p class="muted small">Hanya admin yang dapat mengubah SLA.</p>'}`;

    const read = () => {
      const out = {};
      master.prlPriorities().forEach((pr) => {
        out[pr] = {};
        ['temp', 'perm'].forEach((k) => {
          const q = (f) => box.querySelector(`[data-pr="${CSS.escape(pr)}"][data-kind="${k}"][data-f="${f}"]`).value;
          out[pr][k] = { v: Number(q('v')) || 0, u: q('u') };
        });
      });
      return out;
    };
    const done = (n, msg) => {
      if (n === undefined) return;
      toast(`${msg} · ${n} PRL dihitung ulang`);
      draw();
      opts.onSaved?.();
    };

    box.querySelector('[data-sla-client]').addEventListener('change', (e) => {
      clientId = e.target.value;
      opts.onClient?.(clientId);
      draw();
    });
    box.querySelector('[data-sla-save]')?.addEventListener('click', async () => done(await attempt(() => saveFor([clientId], read())), `SLA ${c.code} disimpan`));
    box.querySelector('[data-sla-all]')?.addEventListener('click', async () => {
      if (!(await confirmDialog(`Terapkan tabel SLA ini ke semua ${list.length} client? SLA client lain akan ditimpa.`))) return;
      done(await attempt(() => saveFor(list.map((x) => x.id), read())), `SLA diterapkan ke ${list.length} client`);
    });
    box.querySelector('[data-sla-default]')?.addEventListener('click', async () => {
      if (!(await confirmDialog(`Kembalikan SLA ${c.name} ke SLA bawaan?`))) return;
      done(await attempt(() => saveFor([clientId], {})), 'SLA bawaan dipakai');
    });
  };
  draw();
  return { select: (id) => ((clientId = id), draw()) };
}

/** Ringkasan SLA semua client (baca saja); klik baris untuk mengedit client tsb. */
function overview(current) {
  const list = clients.list();
  const prs = master.prlPriorities();
  return `
    <div class="table-wrap"><table class="table table--compact table--hover sla-overview">
      <thead>
        <tr><th rowspan="2">Client</th>${prs.map((pr) => `<th colspan="2" class="center">${esc(pr)}</th>`).join('')}<th rowspan="2">Sumber</th><th rowspan="2" class="num">PRL terbuka</th></tr>
        <tr>${prs.map(() => '<th class="center">Sementara</th><th class="center">Permanen</th>').join('')}</tr>
      </thead>
      <tbody>${list
        .map((c) => {
          const t = sla.table(c.id);
          return `<tr data-pick="${esc(c.id)}" class="${c.id === current ? 'is-current' : ''}">
            <td class="nowrap"><span class="badge tone-gray">${esc(c.code)}</span> ${esc(c.name)}</td>
            ${prs.map((pr) => `<td class="center nowrap">${sla.ruleLabel(t[pr].temp)}</td><td class="center nowrap">${sla.ruleLabel(t[pr].perm)}</td>`).join('')}
            <td>${badge(isCustom(c) ? 'Khusus' : 'Bawaan', isCustom(c) ? 'blue' : 'gray')}</td>
            <td class="num">${openPrl(c.id).length}</td>
          </tr>`;
        })
        .join('')}</tbody>
    </table></div>`;
}

export default {
  path: '/sla',
  title: 'Setting SLA',
  autoRefresh: false,
  render(el, params) {
    let current = params.client || sessionStorage.getItem(KEY) || '';
    el.innerHTML = `
      ${pageHeader({ title: 'Setting SLA per Client', subtitle: `SLA solusi sementara & permanen per prioritas — berlaku untuk tiket ${master.slaTypes().join(', ')}`, icon: '⏱️' })}
      <section class="card">
        <div class="card__head"><h3>✏️ Atur SLA</h3></div>
        <div data-editor></div>
      </section>
      <section class="card">
        <div class="card__head"><h3>📋 Ringkasan SLA semua client</h3><span class="muted small">klik baris untuk mengedit</span></div>
        <div data-overview></div>
      </section>`;

    const ov = el.querySelector('[data-overview]');
    const drawOverview = () => {
      ov.innerHTML = overview(current);
      ov.querySelectorAll('[data-pick]').forEach((tr) =>
        tr.addEventListener('click', () => {
          pick(tr.dataset.pick);
          editor.select(current);
          el.querySelector('[data-editor]').scrollIntoView({ behavior: 'smooth', block: 'start' });
        })
      );
    };
    const pick = (id) => {
      current = id;
      sessionStorage.setItem(KEY, id);
      drawOverview();
    };
    if (!clients.get(current)) current = clients.list()[0]?.id || '';
    const editor = renderSlaEditor(el.querySelector('[data-editor]'), { clientId: current, onClient: pick, onSaved: drawOverview });
    if (editor) drawOverview();
  },
};
