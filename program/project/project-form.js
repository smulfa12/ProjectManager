/**
 * Form Project (modal) — tambah & edit Data Project.
 * Price TCV, Revenue & Gross Profit dihitung otomatis dari mandays × harga client
 * (bisa diubah manual).
 */
import * as projects from '../../service/project.service.js';
import * as clients from '../../service/client.service.js';
import * as master from '../../service/master.service.js';
import { esc, openModal, options, bindMoneyInput, moneyValue, toast, formData } from '../../service/ui.service.js';
import { parseNumber, today, rupiah } from '../../service/format.service.js';

const field = (label, html, cls = '') => `<label class="field ${cls}"><span>${label}</span>${html}</label>`;
const text = (name, v, extra = '') => `<input class="input" name="${name}" value="${esc(v ?? '')}" ${extra} />`;
const date = (name, v) => `<input class="input" type="date" name="${name}" value="${esc(v ?? '')}" />`;
const money = (name, v) => `<input class="input num" name="${name}" inputmode="numeric" data-money value="${moneyValue(v)}" />`;

/** Buka form. onSaved(project) dipanggil setelah tersimpan. */
export function openProjectForm({ id = '', preset = {}, onSaved } = {}) {
  const p = id ? projects.get(id) : { date: today(), costType: 'Cost', status: master.statusNames()[0], ...preset };
  const clientList = clients.list({ includeInactive: !!id });

  const modal = openModal({
    title: id ? `Edit Project ${p.code}` : 'Project Baru',
    wide: true,
    body: `
      <form class="form" data-form>
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
            ${field('No Jira', text('jiraNo', p.jiraNo))}
            ${field('No CR Client', text('crNo', p.crNo))}
            ${field('Project Outstanding', text('outstanding', p.outstanding), 'span-2')}
          </div>
        </fieldset>

        <fieldset>
          <legend>Biaya</legend>
          <div class="form-grid">
            ${field('Cost / Free Mandays', `<select class="input" name="costType">${options(master.COST_TYPES, p.costType)}</select>`)}
            ${field('Mandays', `<input class="input num" name="mandays" type="number" min="0" step="0.5" value="${esc(p.mandays ?? '')}" />`)}
            ${field('Price TCV', money('priceTcv', p.priceTcv))}
            ${field('Revenue', money('revenue', p.revenue))}
            ${field('Gross Profit', money('grossProfit', p.grossProfit))}
            <div class="field span-3 calc-hint" data-calc-hint></div>
            <div class="field"><button type="button" class="btn btn--ghost btn--sm" data-calc>↻ Hitung otomatis</button></div>
          </div>
        </fieldset>

        <fieldset>
          <legend>PIC, Timeline & Status</legend>
          <div class="form-grid">
            ${field('PIC Bank', text('picBank', p.picBank))}
            ${field('PIC MLPT', text('picMlpt', p.picMlpt))}
            ${field('Status', `<select class="input" name="status">${options(master.statusNames(), p.status)}</select>`)}
            ${field('Start', date('startDate', p.startDate))}
            ${field('Target', date('target', p.target))}
            ${field('Selesai Aktual', date('endDate', p.endDate))}
            ${field('BAST (No / Status)', text('bast', p.bast))}
            ${field('Tanggal BAST', date('bastDate', p.bastDate))}
            ${field('Remark', text('remark', p.remark), 'span-2')}
            ${field('Notes', `<textarea class="input" name="notes" rows="2">${esc(p.notes || '')}</textarea>`, 'span-4')}
            ${id ? field('Catatan perubahan (masuk History)', text('_note', '', 'placeholder="opsional, cth. revisi target dari bank"'), 'span-4') : ''}
          </div>
        </fieldset>

        <div class="form-actions">
          <button type="button" class="btn btn--ghost" data-close>Batal</button>
          <button class="btn btn--primary" type="submit">Simpan</button>
        </div>
      </form>`,
  });

  const form = modal.el.querySelector('[data-form]');
  modal.el.querySelectorAll('[data-close]').forEach((b) => (b.onclick = modal.close));
  form.querySelectorAll('[data-money]').forEach(bindMoneyInput);
  const hint = form.querySelector('[data-calc-hint]');

  const recalc = (fill) => {
    const r = projects.calculate({ clientId: form.clientId.value, mandays: form.mandays.value, costType: form.costType.value });
    hint.innerHTML = form.clientId.value
      ? `<span class="muted small">Harga client ${rupiah(r.rate)}/MD · biaya internal ${rupiah(master.finance().costPerMandays)}/MD${form.costType.value === 'Free Mandays' ? ' · Free Mandays: tidak ditagihkan, memotong kuota free mandays client' : ''}</span>`
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
  form.date.addEventListener('change', () => !id && (form.code.placeholder = `Otomatis: ${projects.nextCode(form.date.value || today())}`));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = formData(form);
    const input = { ...v, priceTcv: parseNumber(v.priceTcv), revenue: parseNumber(v.revenue), grossProfit: parseNumber(v.grossProfit), mandays: Number(v.mandays) || 0 };
    delete input._note;
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const saved = await projects.save(id, input, v._note || '');
      toast(id ? 'Project diperbarui' : `Project ${saved.code} dibuat`);
      modal.close();
      onSaved?.(saved);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });
  return modal;
}
