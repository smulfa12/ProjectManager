/**
 * Form Client (modal) — data client, harga per mandays, free mandays,
 * tanggal kontrak & periode preventive maintenance.
 */
import * as clients from '../../service/client.service.js';
import * as master from '../../service/master.service.js';
import { esc, openModal, options, bindMoneyInput, moneyValue, toast, formData } from '../../service/ui.service.js';
import { parseNumber, rupiah, dateLabel } from '../../service/format.service.js';
import * as maintenance from '../../service/maintenance.service.js';

export function openClientForm({ id = '', onSaved } = {}) {
  const c = id ? clients.get(id) : { active: true };
  const modal = openModal({
    title: id ? `Edit Client ${c.name}` : 'Client Baru',
    wide: true,
    body: `
      <form class="form" data-form>
        <div class="form-grid">
          <label class="field"><span>Client ID *</span><input class="input" name="code" required value="${esc(c.code || '')}" placeholder="cth. BNU" /></label>
          <label class="field span-2"><span>Nama Client *</span><input class="input" name="name" required value="${esc(c.name || '')}" /></label>
          <label class="field"><span>PIC Client</span><input class="input" name="pic" value="${esc(c.pic || '')}" /></label>
          <label class="field"><span>Price per Mandays</span><input class="input num" name="pricePerMandays" data-money value="${moneyValue(c.pricePerMandays)}" /></label>
          <label class="field"><span>Free Mandays</span><input class="input num" type="number" min="0" step="0.5" name="freeMandays" value="${esc(c.freeMandays ?? '')}" /></label>
          <label class="field"><span>Frekuensi PM</span><select class="input" name="pmFrequency">${options(master.frequencies(), c.pmFrequency, { empty: '-' })}</select></label>
          <label class="field"><span>Periode PM — mulai</span><input class="input" type="date" name="pmStart" value="${esc(c.pmStart || '')}" /></label>
          <label class="field"><span>Periode PM — selesai</span><input class="input" type="date" name="pmEnd" value="${esc(c.pmEnd || '')}" /></label>
          <label class="field span-2 check"><input type="checkbox" name="active" ${c.active !== false ? 'checked' : ''} /> Client aktif</label>
          <label class="field span-4"><span>Catatan</span><textarea class="input" name="notes" rows="2">${esc(c.notes || '')}</textarea></label>
        </div>
        <fieldset>
          <legend>💼 Kontrak Maintenance</legend>
          <div class="form-grid">
            <label class="field"><span>Tanggal Kontrak (mulai)</span><input class="input" type="date" name="contractDate" value="${esc(c.contractDate || '')}" /></label>
            <label class="field"><span>Akhir Kontrak</span><input class="input" type="date" name="contractEnd" value="${esc(c.contractEnd || '')}" /></label>
            <label class="field"><span>Harga Maintenance / tahun (${new Date().getFullYear()})</span><input class="input num" name="maintenancePrice" data-money value="${moneyValue(c.maintenancePrice)}" /></label>
            <label class="field"><span>Nilai Kontrak (TCV)</span><input class="input num" name="maintenanceTcv" data-money value="${moneyValue(c.maintenanceTcv)}" placeholder="otomatis" /></label>
            <div class="field span-4"><p class="small muted" data-mhint></p></div>
          </div>
        </fieldset>
        <p class="muted small">Free mandays dihitung per Periode Preventive Maintenance. Bila kosong: per tahun kontrak, lalu per tahun berjalan.</p>
        <div class="form-actions">
          <button type="button" class="btn btn--ghost" data-cancel>Batal</button>
          <button class="btn btn--primary" type="submit">Simpan</button>
        </div>
      </form>`,
  });
  const form = modal.el.querySelector('[data-form]');
  form.querySelectorAll('[data-money]').forEach(bindMoneyInput);
  form.querySelector('[data-cancel]').onclick = modal.close;

  // Ringkasan kontrak & amortisasi saat isian berubah
  const hint = form.querySelector('[data-mhint]');
  const showHint = () => {
    const draft = {
      contractDate: form.contractDate.value,
      contractEnd: form.contractEnd.value,
      maintenancePrice: parseNumber(form.maintenancePrice.value),
      maintenanceTcv: parseNumber(form.maintenanceTcv.value),
    };
    const s = maintenance.summary(draft);
    if (!s.hasContract) return (hint.textContent = 'Isi Tanggal Kontrak untuk menghitung amortisasi.');
    const auto = maintenance.autoTcv(draft.maintenancePrice, s.start, s.end);
    form.maintenanceTcv.placeholder = auto ? `otomatis: ${auto.toLocaleString('id-ID')}` : 'otomatis';
    hint.innerHTML = `Kontrak ${dateLabel(s.start)} – ${dateLabel(s.end)}${s.defaultEnd ? ' (default 1 tahun)' : ''} · <b>${s.months} bulan</b> ·
      TCV ${rupiah(s.tcv)}${s.tcvAuto ? ' (otomatis = harga/tahun × bulan ÷ 12)' : ''} ·
      amortisasi <b>${rupiah(s.monthly)}/bulan</b> · diakui tahun ${s.year}: <b>${rupiah(s.yearAmount)}</b>`;
  };
  ['contractDate', 'contractEnd', 'maintenancePrice', 'maintenanceTcv'].forEach((n) => form[n].addEventListener('input', showHint));
  showHint();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = formData(form);
    if (v.pmStart && v.pmEnd && v.pmEnd < v.pmStart) return toast('Periode PM selesai tidak boleh sebelum mulai', 'error');
    try {
      const saved = await clients.save(id, { ...v, pricePerMandays: parseNumber(v.pricePerMandays), maintenancePrice: parseNumber(v.maintenancePrice), maintenanceTcv: parseNumber(v.maintenanceTcv), active: form.active.checked });
      toast('Client disimpan');
      modal.close();
      onSaved?.(saved);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
