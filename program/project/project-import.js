/**
 * Import Project dari Excel (modal) — pilih file → pratinjau (baru / diperbarui / error) → import.
 * Format = hasil "Export Excel" List Project (kolom boleh dikurangi / diurutkan bebas).
 */
import * as importer from '../../service/import.service.js';
import { esc, openModal, toast, badge } from '../../service/ui.service.js';
import { downloadExcel } from '../../service/export.service.js';
import { exportColumns } from '../shared/project-table.js';

const PREVIEW = 200;

export function openProjectImport({ onDone } = {}) {
  let plan = null;
  const modal = openModal({
    title: '⬆ Import Project dari Excel',
    wide: true,
    body: `
      <div class="import-drop" data-drop>
        <p><b>Pilih file Excel (.xlsx) atau CSV</b> dengan format <i>Export Excel</i> dari List Project.</p>
        <input type="file" accept=".xlsx,.xls,.csv" data-file />
        <p class="muted small">• Kolom dikenali dari judulnya (urutan bebas; kolom yang tidak ada di file tidak diubah).<br>
          • <b>ID Project</b> yang sudah ada → project diperbarui. ID kosong / baru → project baru (ID otomatis bila kosong).<br>
          • Client diisi nama atau kode client. Kolom info seperti Link Jira, SLA, Lewat Target diabaikan.<br>
          • Format tracker lama (Bank, PID, Project Outstanding = Nama Project, Cost/FreeMandays, …) juga bisa.</p>
        <button type="button" class="btn btn--ghost btn--sm" data-template>⬇ Download template (format export, tanpa data)</button>
      </div>
      <div data-preview></div>`,
  });
  const el = modal.el;
  const preview = el.querySelector('[data-preview]');

  el.querySelector('[data-template]').onclick = () =>
    downloadExcel('template-import-project.xlsx', 'Project', exportColumns().filter((c) => !['sla', 'slaTempDue', 'slaPermDue'].includes(c.key)), []).catch((e) => toast(e.message, 'error'));

  el.querySelector('[data-file]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    preview.innerHTML = '<p class="muted">Membaca file…</p>';
    try {
      plan = await importer.parse(file);
      drawPreview();
    } catch (err) {
      preview.innerHTML = `<div class="alert alert--error">⚠️ ${esc(err.message)}</div>`;
    }
  });

  function drawPreview() {
    const n = (a) => plan.items.filter((i) => i.action === a).length;
    const tone = { new: 'green', update: 'blue', same: 'gray', error: 'red' };
    const label = { new: 'Baru', update: 'Diperbarui', same: 'Tidak berubah', error: 'Error' };
    preview.innerHTML = `
      <div class="stats stats--sm">
        <div class="stat tone-green"><div><div class="stat__label">Project baru</div><div class="stat__value">${n('new')}</div></div></div>
        <div class="stat tone-blue"><div><div class="stat__label">Diperbarui</div><div class="stat__value">${n('update')}</div></div></div>
        <div class="stat tone-gray"><div><div class="stat__label">Tidak berubah</div><div class="stat__value">${n('same')}</div></div></div>
        <div class="stat tone-red"><div><div class="stat__label">Error (dilewati)</div><div class="stat__value">${n('error')}</div></div></div>
      </div>
      <p class="small"><b>Sheet:</b> ${esc(plan.sheets.join(', '))} · <b>Kolom dipakai:</b> ${esc(plan.mapped.map((m) => m.label).join(', '))}
        ${plan.ignored.length ? `<br><span class="muted">Diabaikan: ${esc(plan.ignored.join(', '))}</span>` : ''}</p>
      <div class="table-wrap import-table"><table class="table table--compact">
        <thead><tr><th>Baris</th><th>Aksi</th><th>ID Project</th><th>Nama</th><th>Catatan</th></tr></thead>
        <tbody>${[...plan.items]
          .sort((a, b) => ['error', 'new', 'update', 'same'].indexOf(a.action) - ['error', 'new', 'update', 'same'].indexOf(b.action))
          .slice(0, PREVIEW)
          .map(
            (it) => `<tr><td class="nowrap small">${esc(it.line)}</td><td>${badge(label[it.action], tone[it.action])}</td><td class="nowrap">${esc(it.code)}</td>
              <td class="small">${esc(it.title)}</td>
              <td class="small">${[...it.errors.map((m) => `<span class="text-red">${esc(m)}</span>`), ...it.warnings.map((m) => `<span class="${m.startsWith('Berubah') ? 'muted' : 'text-amber'}">${esc(m)}</span>`)].join('<br>') || '<span class="muted">-</span>'}</td></tr>`
          )
          .join('')}</tbody>
      </table></div>
      ${plan.items.length > PREVIEW ? `<p class="muted small">Menampilkan ${PREVIEW} dari ${plan.items.length} baris.</p>` : ''}
      <div class="form-actions">
        <label class="check small mr-auto"><input type="checkbox" data-update checked /> Perbarui project yang sudah ada (${n('update')})</label>
        <button class="btn btn--ghost" data-cancel>Batal</button>
        <button class="btn btn--primary" data-run ${n('new') + n('update') ? '' : 'disabled'}>⬆ Import</button>
      </div>`;
    preview.querySelector('[data-cancel]').onclick = modal.close;
    preview.querySelector('[data-run]').onclick = async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      const res = await importer.run(plan, {
        updateExisting: preview.querySelector('[data-update]').checked,
        onProgress: (d, t) => (btn.textContent = `Mengimport ${d}/${t}…`),
      });
      preview.innerHTML = `
        <div class="alert ${res.failed.length ? 'alert--warn' : 'alert--info'}">✅ Import selesai: <b>${res.created}</b> project baru, <b>${res.updated}</b> diperbarui${res.failed.length ? `, <b>${res.failed.length}</b> gagal` : ''}.</div>
        ${res.failed.length ? `<ul class="small">${res.failed.map((f) => `<li>${esc(f.line)} · ${esc(f.code)}: <span class="text-red">${esc(f.message)}</span></li>`).join('')}</ul>` : ''}
        <div class="form-actions"><button class="btn btn--primary" data-close-done>Tutup</button></div>`;
      preview.querySelector('[data-close-done]').onclick = modal.close;
      toast(`Import: ${res.created} baru, ${res.updated} diperbarui`);
      onDone?.();
    };
  }
}
