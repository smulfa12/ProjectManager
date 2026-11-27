/**
 * Setting — master data: tipe tiket, status project, modul, tim, frekuensi PM,
 * biaya internal per mandays & awalan Uniq ID. Disimpan di tabel pm_settings.
 */
import * as master from '../../service/master.service.js';
import { esc, options, attempt, toast, moneyValue, bindMoneyInput } from '../../service/ui.service.js';
import { parseNumber, rupiah } from '../../service/format.service.js';

const LISTS = [
  ['pm.types', '🎫 Tipe Tiket'],
  ['pm.modules', '🧩 Modul'],
  ['pm.teams', '👥 Tim'],
  ['pm.frequencies', '🔁 Frekuensi Preventive Maintenance'],
  ['pm.noCostTypes', '🚫 Tipe tanpa Mandays / TCV / BAST (cth. PRL)'],
  ['pm.targetStatuses', '🎯 Status yang boleh ubah Target (Weekly Meeting)'],
];

export function renderMaster(el) {
  const draw = () => {
    const fin = master.finance();
    el.innerHTML = `
      <div class="grid grid--2">
        <section class="card">
          <div class="card__head"><h3>💰 Biaya & Penomoran</h3></div>
          <form class="form" data-fin>
            <div class="form-grid form-grid--2">
              <label class="field"><span>Biaya internal per mandays (Rp)</span><input class="input num" name="costPerMandays" data-money value="${moneyValue(fin.costPerMandays)}" /></label>
              <label class="field"><span>Awalan Uniq ID Project</span><input class="input" name="codePrefix" value="${esc(fin.codePrefix)}" maxlength="8" /></label>
            </div>
            <p class="muted small">Gross Profit = Revenue − (Mandays × ${rupiah(fin.costPerMandays)}). Uniq ID: ${esc(fin.codePrefix)}-YYMM-0001.</p>
            <div class="form-actions"><button class="btn btn--primary btn--sm">Simpan</button></div>
          </form>
        </section>

        <section class="card">
          <div class="card__head"><h3>🔗 Link Jira</h3></div>
          <form class="form" data-links>
            <label class="field"><span>URL dasar tiket (No Jira BV- ditambahkan di belakang)</span><input class="input" name="jiraUrl" value="${esc(master.links().jiraUrl)}" /></label>
            <p class="muted small">Contoh: No Jira <b>BV-4994</b> → ${esc(master.links().jiraUrl.replace(/\/?$/, '/'))}BV-4994. Tiket Channel / lainnya tidak diberi link.</p>
            <div class="form-actions"><button class="btn btn--primary btn--sm">Simpan</button></div>
          </form>
        </section>

        <section class="card">
          <div class="card__head"><h3>🚦 Status Project</h3><button class="btn btn--ghost btn--sm" data-add-status>+ Status</button></div>
          <table class="table table--compact" data-statuses>
            <thead><tr><th>Nama</th><th>Warna</th><th class="center">Selesai?</th><th></th></tr></thead>
            <tbody>${master
              .statuses()
              .map(
                (s, i) => `<tr data-i="${i}">
                  <td><input class="input input--sm" data-k="name" value="${esc(s.name)}" /></td>
                  <td><select class="input input--sm" data-k="tone">${options(master.TONES, s.tone)}</select></td>
                  <td class="center"><input type="checkbox" data-k="closed" ${s.closed ? 'checked' : ''} /></td>
                  <td class="actions"><button class="btn btn--icon btn--ghost btn--sm" data-rm>✕</button></td>
                </tr>`
              )
              .join('')}</tbody>
          </table>
          <p class="muted small">"Selesai" = tidak dihitung sebagai project open / lewat target. Status pertama = status default project baru.</p>
          <div class="form-actions"><button class="btn btn--primary btn--sm" data-save-status>Simpan status</button></div>
        </section>

        ${LISTS.map(
          ([key, title]) => `
          <section class="card">
            <div class="card__head"><h3>${title}</h3></div>
            <textarea class="input" rows="6" data-list="${key}">${esc(master.get(key).join('\n'))}</textarea>
            <div class="form-actions"><span class="muted small mr-auto">Satu baris = satu pilihan</span><button class="btn btn--primary btn--sm" data-save-list="${key}">Simpan</button></div>
          </section>`
        ).join('')}
      </div>`;

    const fin2 = el.querySelector('[data-fin]');
    bindMoneyInput(fin2.costPerMandays);
    fin2.addEventListener('submit', async (e) => {
      e.preventDefault();
      const codePrefix = fin2.codePrefix.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'PRJ';
      await attempt(() => master.save('pm.finance', { costPerMandays: parseNumber(fin2.costPerMandays.value), codePrefix }), 'Disimpan');
      draw();
    });

    el.querySelector('[data-links]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const jiraUrl = e.target.jiraUrl.value.trim();
      if (jiraUrl && !/^https?:\/\//i.test(jiraUrl)) return toast('URL harus diawali https://', 'error');
      await attempt(() => master.save('pm.links', { jiraUrl }), 'Link Jira disimpan');
      draw();
    });

    el.querySelectorAll('[data-save-list]').forEach(
      (b) =>
        (b.onclick = async () => {
          const key = b.dataset.saveList;
          const values = [...new Set(el.querySelector(`[data-list="${key}"]`).value.split('\n').map((s) => s.trim()).filter(Boolean))];
          if (!values.length) return toast('Minimal satu pilihan', 'error');
          await attempt(() => master.save(key, values), 'Disimpan');
        })
    );

    const tbody = el.querySelector('[data-statuses] tbody');
    const readStatuses = () =>
      [...tbody.querySelectorAll('tr')].map((tr) => ({
        name: tr.querySelector('[data-k=name]').value.trim(),
        tone: tr.querySelector('[data-k=tone]').value,
        closed: tr.querySelector('[data-k=closed]').checked,
      }));
    tbody.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => b.closest('tr').remove()));
    el.querySelector('[data-add-status]').onclick = () => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><input class="input input--sm" data-k="name" /></td><td><select class="input input--sm" data-k="tone">${options(master.TONES, 'gray')}</select></td><td class="center"><input type="checkbox" data-k="closed" /></td><td class="actions"><button class="btn btn--icon btn--ghost btn--sm" data-rm>✕</button></td>`;
      tr.querySelector('[data-rm]').onclick = () => tr.remove();
      tbody.appendChild(tr);
      tr.querySelector('input').focus();
    };
    el.querySelector('[data-save-status]').onclick = async () => {
      const list = readStatuses().filter((s) => s.name);
      if (!list.length) return toast('Minimal satu status', 'error');
      if (new Set(list.map((s) => s.name)).size !== list.length) return toast('Nama status tidak boleh sama', 'error');
      await attempt(() => master.save('pm.statuses', list), 'Status disimpan');
      draw();
    };
  };
  draw();
}
