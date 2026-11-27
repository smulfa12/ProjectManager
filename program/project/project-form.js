/**
 * Form Project (modal) — tambah & edit Data Project.
 * Price TCV, Revenue & Gross Profit dihitung otomatis dari mandays × harga client
 * (bisa diubah manual).
 */
import * as projects from '../../service/project.service.js';
import * as clients from '../../service/client.service.js';
import * as master from '../../service/master.service.js';
import { esc, openModal, options, bindMoneyInput, moneyValue, toast, formData } from '../../service/ui.service.js';
import { parseNumber, today, rupiah, dateTimeLabel } from '../../service/format.service.js';
import * as members from '../../service/member.service.js';
import * as sla from '../../service/sla.service.js';

const field = (label, html, cls = '') => `<label class="field ${cls}"><span>${label}</span>${html}</label>`;
const text = (name, v, extra = '') => `<input class="input" name="${name}" value="${esc(v ?? '')}" ${extra} />`;
const date = (name, v) => `<input class="input" type="date" name="${name}" value="${esc(v ?? '')}" />`;
/** ISO → nilai input datetime-local (waktu lokal) & sebaliknya. */
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : '');
const dt = (name, v) => `<input class="input" type="datetime-local" name="${name}" value="${esc(toLocalInput(v))}" />`;

/** Pilihan PIC Bank: daftar PIC Bank client (Edit Client) lalu PIC yang pernah dipakai di project client ini. */
function picBankChoices(clientId) {
  const registered = clients.pics(clientId).map((x) => x.name);
  const used = projects.list().filter((x) => x.clientId === clientId).map((x) => (x.picBank || '').trim()).filter(Boolean).sort();
  return [...new Set([...registered, ...used])];
}

/** Pilihan PIC MLPT: member aktif yang meng-handle client ini (+ nilai lama bila tidak terdaftar). */
function picMlptOptions(clientId, current) {
  const list = members.list({ includeInactive: false }).filter((m) => (m.clientIds || []).includes(clientId)).map((m) => m.name);
  const extra = current && !list.includes(current) ? [current] : [];
  return options([...extra, ...list], current, { empty: clientId ? '— Pilih PIC MLPT —' : '— Pilih client dulu —' });
}

const money = (name, v) => `<input class="input num" name="${name}" inputmode="numeric" data-money value="${moneyValue(v)}" />`;

/** Urutan tiket terakhir yang tampil di List Project / Inquiry (dipakai tombol Previous / Next). */
const ORDER_KEY = 'pm.project.order';
export function rememberOrder(ids) {
  try {
    sessionStorage.setItem(ORDER_KEY, JSON.stringify(ids));
  } catch { /* abaikan */ }
}
export function rememberedOrder(id) {
  try {
    const ids = JSON.parse(sessionStorage.getItem(ORDER_KEY)) || [];
    if (ids.includes(id)) return ids;
  } catch { /* abaikan */ }
  return projects.list().map((p) => p.id);
}

/**
 * Buka form. onSaved(project) dipanggil setelah tersimpan.
 * ids = urutan tiket untuk tombol Previous / Next (mode edit).
 */
export function openProjectForm({ id = '', preset = {}, onSaved, ids } = {}) {
  const p = id ? projects.get(id) : { date: today(), costType: 'Cost', status: master.statusNames()[0], ...preset };
  const clientList = clients.list({ includeInactive: !!id });
  const order = id ? (ids && ids.includes(id) ? ids : rememberedOrder(id)).filter((x) => projects.get(x)) : [];
  const pos = order.indexOf(id);
  // Bar atas (menempel saat di-scroll): navigasi tiket + tombol Batal / Simpan
  const navBar = () => `
    <div class="ticket-nav">
      ${order.length > 1
        ? `<div class="ticket-nav__move">
            <button type="button" class="btn btn--ghost btn--sm" data-prev ${pos <= 0 ? 'disabled' : ''} title="Tiket sebelumnya">◀ Previous</button>
            <span class="muted small">Tiket <b>${pos + 1}</b> dari ${order.length}${p.jiraNo ? ` · ${esc(p.jiraNo)}` : ''}</span>
            <button type="button" class="btn btn--ghost btn--sm" data-next ${pos >= order.length - 1 ? 'disabled' : ''} title="Tiket berikutnya">Next ▶</button>
          </div>`
        : '<span></span>'}
      <div class="ticket-nav__save">
        <button type="button" class="btn btn--ghost btn--sm" data-close>Batal</button>
        <button class="btn btn--primary btn--sm" type="submit">💾 Simpan</button>
      </div>
    </div>`;

  const modal = openModal({
    title: id ? `Edit Project ${p.code}` : 'Project Baru',
    wide: true,
    body: `
      <form class="form" data-form>
        ${navBar()}
        <fieldset>
          <legend>Identitas</legend>
          <div class="form-grid">
            ${field('Uniq ID Project', text('code', p.code, `placeholder="Otomatis: ${projects.nextCode(p.date || today())}"`))}
            ${field('Project ID Sistem', text('systemId', p.systemId))}
            ${field('Nama Project', text('title', p.title, 'placeholder="Deskripsi singkat"'), 'span-2')}
            ${field('Client *', `<select class="input" name="clientId" required>${options(clientList, p.clientId, { valueKey: 'id', labelKey: (c) => `${c.code} — ${c.name}`, empty: 'Pilih client' })}</select>`)}
            ${field('Tipe *', `<select class="input" name="type" required>${options(master.types(), p.type, { empty: 'Pilih tipe' })}</select>`)}
            ${field('Modul', `<input class="input" name="module" list="pm-modules" value="${esc(p.module || '')}" /><datalist id="pm-modules">${options(master.modules())}</datalist>`)}
            ${field('Date', date('date', p.date))}
            ${field(`No Jira ${projects.jiraUrl(p) ? `<a href="${esc(projects.jiraUrl(p))}" target="_blank" rel="noopener" class="small">buka ↗</a>` : ''}`, text('jiraNo', p.jiraNo))}
            ${field('No CR Client', text('crNo', p.crNo))}
            ${field('Project Outstanding', text('outstanding', p.outstanding), 'span-2')}
          </div>
        </fieldset>

        <fieldset>
          <legend>Biaya</legend>
          <div class="form-grid">
            ${field('Cost / Free Mandays', `<select class="input" name="costType">${options(master.COST_TYPES, p.costType, { empty: '-' })}</select>`, 'cost-field')}
            ${field('Mandays', `<input class="input num" name="mandays" type="number" min="0" step="0.5" value="${esc(p.mandays ?? '')}" />`, 'cost-field')}
            ${field('Price TCV', money('priceTcv', p.priceTcv), 'cost-field')}
            ${field('Revenue', money('revenue', p.revenue), 'cost-field')}
            ${field('Gross Profit', money('grossProfit', p.grossProfit), 'cost-field')}
            <div class="field span-3 calc-hint cost-field" data-calc-hint></div>
            <div class="field cost-field"><button type="button" class="btn btn--ghost btn--sm" data-calc>↻ Hitung otomatis</button></div>
            <p class="alert alert--info span-4 nocost-info">ℹ️ Tipe <b data-nocost-type></b> tidak ada biaya: Cost/Free Mandays, Mandays, Price TCV, Revenue, Gross Profit & BAST tidak perlu diisi (otomatis dikosongkan).</p>
          </div>
        </fieldset>

        <fieldset class="sla-block">
          <legend>🚨 Prioritas & SLA <span class="muted small" data-sla-type></span></legend>
          <div class="form-grid">
            ${field('Prioritas', `<select class="input" name="priority">${options(master.prlPriorities(), p.priority, { empty: '— Pilih prioritas —' })}</select>`)}
            ${field('Waktu Lapor', dt('reportedAt', p.reportedAt))}
            <div class="field span-2"><span>&nbsp;</span><p class="small muted" data-sla-rule></p></div>
            <div class="field span-2 sla-box"><span>⏱️ Batas SLA Solusi Sementara</span><b data-due="temp">-</b></div>
            ${field('Solusi Sementara selesai', dt('tempDoneAt', p.tempDoneAt), 'span-2')}
            <div class="field span-2 sla-box"><span>⏱️ Batas SLA Solusi Permanen</span><b data-due="perm">-</b></div>
            ${field('Solusi Permanen selesai', dt('permDoneAt', p.permDoneAt), 'span-2')}
          </div>
          <p class="muted small">Batas SLA dihitung dari Waktu Lapor + SLA client per prioritas (Monitoring Client → SLA PRL).
            Timeline & reminder otomatis dibuat untuk kedua batas SLA; Target kosong diisi batas SLA permanen.</p>
        </fieldset>

        <fieldset>
          <legend>PIC, Timeline & Status</legend>
          <div class="form-grid">
            ${field('PIC Bank', `<input class="input" name="picBank" list="pm-picbank" value="${esc(p.picBank || '')}" placeholder="Pilih atau ketik nama baru" /><datalist id="pm-picbank">${options(picBankChoices(p.clientId))}</datalist>`)}
            ${field('PIC MLPT', `<select class="input" name="picMlpt">${picMlptOptions(p.clientId, p.picMlpt)}</select>`)}
            ${field('Status', `<select class="input" name="status">${options(master.statusNames(), p.status)}</select>`)}
            ${field('Start', date('startDate', p.startDate))}
            ${field('Target', date('target', p.target))}
            ${field('Selesai Aktual', date('endDate', p.endDate))}
            ${field('BAST (No / Status)', text('bast', p.bast), 'bast-field')}
            ${field('Tanggal BAST', date('bastDate', p.bastDate), 'bast-field')}
            ${field('Remark', text('remark', p.remark), 'span-2')}
            ${field('Notes', `<textarea class="input" name="notes" rows="2">${esc(p.notes || '')}</textarea>`, 'span-4')}
            ${id ? field('Catatan perubahan (masuk History)', text('_note', '', 'placeholder="opsional, cth. revisi target dari bank"'), 'span-4') : ''}
          </div>
        </fieldset>

      </form>`,
  });

  const form = modal.el.querySelector('[data-form]');
  modal.el.querySelectorAll('[data-close]').forEach((b) => (b.onclick = modal.close));
  form.querySelectorAll('[data-money]').forEach(bindMoneyInput);
  const hint = form.querySelector('[data-calc-hint]');

  const recalc = (fill) => {
    const r = projects.calculate({ clientId: form.clientId.value, mandays: form.mandays.value, costType: form.costType.value });
    hint.innerHTML = form.clientId.value
      ? `<span class="muted small">Harga client ${rupiah(r.rate)}/MD · biaya internal ${rupiah(master.finance().costPerMandays)}/MD${form.costType.value === 'Free Mandays' ? ' · Free Mandays: tidak ditagihkan, memotong kuota free mandays client' : form.costType.value !== 'Cost' ? ' · tidak ditagihkan' : ''}</span>`
      : '';
    if (!fill) return;
    form.priceTcv.value = moneyValue(r.priceTcv);
    form.revenue.value = moneyValue(r.revenue);
    form.grossProfit.value = r.grossProfit < 0 ? '-' + moneyValue(-r.grossProfit) : moneyValue(r.grossProfit);
  };
  recalc(false);
  form.querySelector('[data-calc]').onclick = () => recalc(true);
  ['clientId', 'mandays', 'costType'].forEach((n) => form[n].addEventListener('change', () => recalc(true)));
  form.mandays.addEventListener('input', () => recalc(true));
  // Validasi PRL: sembunyikan isian biaya & BAST
  const applyType = () => {
    const noCost = master.isNoCost(form.type.value);
    form.classList.toggle('no-cost', noCost);
    form.querySelector('[data-nocost-type]').textContent = form.type.value;
  };
  form.type.addEventListener('change', applyType);
  applyType();

  // PIC Bank & PIC MLPT mengikuti client
  form.clientId.addEventListener('change', () => {
    form.querySelector('#pm-picbank').innerHTML = options(picBankChoices(form.clientId.value));
    form.picMlpt.innerHTML = picMlptOptions(form.clientId.value, form.picMlpt.value);
  });

  // Prioritas & SLA (hanya tipe PRL / tipe ber-SLA)
  const showSla = () => {
    const on = master.usesSla(form.type.value);
    form.classList.toggle('has-sla', on);
    form.querySelector('[data-sla-type]').textContent = on ? `— tipe ${form.type.value}` : '';
    if (!on) return;
    const draft = { type: form.type.value, clientId: form.clientId.value, priority: form.priority.value, date: form.date.value, reportedAt: fromLocalInput(form.reportedAt.value) };
    const d = sla.dues(draft);
    const r = draft.priority && draft.clientId ? sla.rule(draft.clientId, draft.priority) : null;
    form.querySelector('[data-sla-rule]').innerHTML = r
      ? `SLA ${esc(clients.nameOf(draft.clientId))} · <b>${esc(draft.priority)}</b>: sementara <b>${sla.ruleLabel(r.temp)}</b>, permanen <b>${sla.ruleLabel(r.perm)}</b>`
      : 'Pilih client & prioritas untuk menghitung SLA.';
    ['temp', 'perm'].forEach((k) => {
      const done = fromLocalInput(form[k === 'temp' ? 'tempDoneAt' : 'permDoneAt'].value);
      const st = sla.state(d[k], done);
      form.querySelector(`[data-due="${k}"]`).innerHTML = d[k] ? `${dateTimeLabel(d[k])} <span class="badge tone-${st.tone}">${esc(st.label)}</span>` : '-';
    });
  };
  ['type', 'clientId', 'priority', 'reportedAt', 'date', 'tempDoneAt', 'permDoneAt'].forEach((n) => form[n].addEventListener('change', showSla));
  showSla();
  form.date.addEventListener('change', () => !id && (form.code.placeholder = `Otomatis: ${projects.nextCode(form.date.value || today())}`));

  /** Simpan isian form. Mengembalikan project tersimpan, atau null bila gagal. */
  const save = async () => {
    const v = formData(form);
    const input = {
      ...v,
      priceTcv: parseNumber(v.priceTcv),
      revenue: parseNumber(v.revenue),
      grossProfit: parseNumber(v.grossProfit),
      mandays: Number(v.mandays) || 0,
      reportedAt: fromLocalInput(v.reportedAt),
      tempDoneAt: fromLocalInput(v.tempDoneAt),
      permDoneAt: fromLocalInput(v.permDoneAt),
    };
    delete input._note;
    try {
      return await projects.save(id, input, v._note || '');
    } catch (err) {
      toast(err.message, 'error');
      return null;
    }
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    const saved = await save();
    if (!saved) return (btn.disabled = false);
    toast(id ? 'Project diperbarui' : `Project ${saved.code} dibuat`);
    modal.close();
    onSaved?.(saved);
  });

  // Previous / Next: perubahan yang belum disimpan otomatis disimpan dulu
  const snapshot = new URLSearchParams(new FormData(form)).toString();
  const go = async (step) => {
    const target = order[pos + step];
    if (!target) return;
    const buttons = form.querySelectorAll('[data-prev],[data-next],[type=submit]');
    buttons.forEach((b) => (b.disabled = true));
    if (new URLSearchParams(new FormData(form)).toString() !== snapshot) {
      const saved = await save();
      if (!saved) {
        buttons.forEach((b) => (b.disabled = false));
        return;
      }
      toast(`${saved.code} disimpan`);
      onSaved?.(saved);
    }
    modal.close();
    openProjectForm({ id: target, onSaved, ids: order });
  };
  form.querySelector('[data-prev]')?.addEventListener('click', () => go(-1));
  form.querySelector('[data-next]')?.addEventListener('click', () => go(1));
  return modal;
}
