/**
 * Menu — Laporan (Excel)
 *  1. Laporan Progress Project & PRL
 *  2. Laporan SLA
 * Data mengikuti client yang di-handle user & filter di halaman ini.
 */
import * as report from '../../service/report.service.js';
import * as clients from '../../service/client.service.js';
import { pageHeader, options, toast, esc, openModal } from '../../service/ui.service.js';
import { number, periodRange } from '../../service/format.service.js';

const KEY = 'pm.report';
const COLS_KEY = (kind) => `pm.report.cols.${kind}`;

/** Pilihan sheet & kolom tersimpan di browser ini: { [sheet]: false | string[] } */
function loadChoice(kind) {
  try {
    return JSON.parse(localStorage.getItem(COLS_KEY(kind))) || {};
  } catch {
    return {};
  }
}
function saveChoice(kind, choice) {
  try {
    localStorage.setItem(COLS_KEY(kind), JSON.stringify(choice));
  } catch { /* abaikan */ }
}

/** Ringkasan pilihan, mis. "4 sheet · 52 dari 80 kolom". */
function choiceSummary(kind) {
  const choice = loadChoice(kind);
  const list = report.sheets(kind);
  const on = list.filter((sh) => choice[sh.name] !== false);
  const total = on.reduce((s, sh) => s + sh.columns.length, 0);
  const picked = on.reduce((s, sh) => s + (Array.isArray(choice[sh.name]) ? sh.columns.filter((c) => sh.key.includes(c) || choice[sh.name].includes(c)).length : sh.columns.length), 0);
  return `${on.length} dari ${list.length} sheet · ${picked === total ? 'semua kolom' : `${picked} dari ${total} kolom`}`;
}

/** Jendela pilih sheet & kolom. */
function openColumnPicker(kind, title, onDone) {
  const list = report.sheets(kind);
  const choice = loadChoice(kind);
  const modal = openModal({
    title: `Pilih kolom — ${title}`,
    wide: true,
    body: `
      <p class="muted small">Centang sheet & kolom yang ingin dimasukkan ke Excel. Kolom kunci (🔒) selalu ikut. Pilihan tersimpan di browser ini.</p>
      <div class="col-picker">
        ${list
          .map((sh, si) => {
            const sel = Array.isArray(choice[sh.name]) ? choice[sh.name] : sh.columns;
            return `
            <fieldset class="col-sheet" data-sheet="${si}">
              <legend><label class="check"><input type="checkbox" data-sheet-on ${choice[sh.name] !== false ? 'checked' : ''} /> <b>${esc(sh.name)}</b></label>
                <span class="col-sheet__tools"><button type="button" class="btn btn--ghost btn--sm" data-all>Semua</button><button type="button" class="btn btn--ghost btn--sm" data-none>Kosongkan</button></span></legend>
              <div class="check-grid col-grid">
                ${sh.columns
                  .map((c) => {
                    const locked = sh.key.includes(c);
                    return `<label class="check small"><input type="checkbox" data-col="${esc(c)}" ${locked || sel.includes(c) ? 'checked' : ''} ${locked ? 'disabled' : ''} /> ${locked ? '🔒 ' : ''}${esc(c)}</label>`;
                  })
                  .join('')}
              </div>
            </fieldset>`;
          })
          .join('')}
      </div>
      <div class="form-actions">
        <button class="btn btn--ghost mr-auto" data-reset>Kembalikan semua kolom</button>
        <button class="btn btn--ghost" data-cancel>Batal</button>
        <button class="btn btn--primary" data-save>Simpan pilihan</button>
      </div>`,
  });
  const el = modal.el;
  const sync = (fs) => fs.classList.toggle('is-off', !fs.querySelector('[data-sheet-on]').checked);
  el.querySelectorAll('.col-sheet').forEach((fs) => {
    sync(fs);
    fs.querySelector('[data-sheet-on]').addEventListener('change', () => sync(fs));
    fs.querySelector('[data-all]').onclick = () => fs.querySelectorAll('[data-col]:not(:disabled)').forEach((c) => (c.checked = true));
    fs.querySelector('[data-none]').onclick = () => fs.querySelectorAll('[data-col]:not(:disabled)').forEach((c) => (c.checked = false));
  });
  el.querySelector('[data-cancel]').onclick = modal.close;
  el.querySelector('[data-reset]').onclick = () => {
    saveChoice(kind, {});
    modal.close();
    onDone();
  };
  el.querySelector('[data-save]').onclick = () => {
    const next = {};
    el.querySelectorAll('.col-sheet').forEach((fs) => {
      const sh = list[Number(fs.dataset.sheet)];
      if (!fs.querySelector('[data-sheet-on]').checked) return (next[sh.name] = false);
      const cols = [...fs.querySelectorAll('[data-col]:checked')].map((c) => c.dataset.col);
      if (cols.length < sh.columns.length) next[sh.name] = cols;
    });
    if (list.every((sh) => next[sh.name] === false)) return toast('Pilih minimal satu sheet', 'error');
    saveChoice(kind, next);
    modal.close();
    onDone();
  };
}

export default {
  path: '/report',
  title: 'Laporan',
  autoRefresh: false,
  render(el) {
    let saved = {};
    try {
      saved = JSON.parse(sessionStorage.getItem(KEY)) || {};
    } catch { /* abaikan */ }
    const year = periodRange('this-year');
    const f = { clientId: '', from: year.from, to: year.to, scope: '', ...saved };

    el.innerHTML = `
      ${pageHeader({ title: 'Laporan', subtitle: 'Generate laporan dalam bentuk Excel (.xlsx)', icon: '📑' })}
      <form class="card meeting-bar" data-filter>
        <label class="field"><span>Client</span><select class="input input--sm" name="clientId">${options(clients.list(), f.clientId, { valueKey: 'id', labelKey: 'name', empty: 'Semua client' })}</select></label>
        <label class="field"><span>Periode dari</span><input class="input input--sm" type="date" name="from" value="${esc(f.from)}" /></label>
        <label class="field"><span>s/d</span><input class="input input--sm" type="date" name="to" value="${esc(f.to)}" /></label>
        <label class="field"><span>Status</span><select class="input input--sm" name="scope"><option value="">Semua</option><option value="open" ${f.scope === 'open' ? 'selected' : ''}>Belum selesai saja</option></select></label>
        <div class="chips report-presets">
          ${[['this-month', 'Bulan ini'], ['3-months', '3 bulan'], ['this-year', 'Tahun ini'], ['all', 'Semua']].map(([k, l]) => `<button type="button" class="chip" data-preset="${k}">${l}</button>`).join('')}
        </div>
      </form>
      <p class="muted small">Periode berdasarkan Date project (PRL: Waktu Lapor). History Update di laporan progress mengikuti periode yang sama.</p>
      <div class="grid grid--2">
        <section class="card report-card">
          <div class="report-card__icon">📊</div>
          <h3>Laporan Progress Project & PRL</h3>
          <p class="muted small">Sheet: Ringkasan per client · Per Status · Project & CR (target, status, progress, mandays, TCV, BAST, update terakhir) · PRL (prioritas & SLA) · History Update.</p>
          <p class="small" data-count-progress></p>
          <p class="small muted">📋 <span data-cols="progress"></span></p>
          <div class="row gap-sm"><button class="btn btn--primary" data-dl="progress">⬇ Download Excel</button><button class="btn btn--ghost" data-pick="progress">⚙️ Pilih kolom</button></div>
        </section>
        <section class="card report-card">
          <div class="report-card__icon">⏱️</div>
          <h3>Laporan SLA</h3>
          <p class="muted small">Sheet: Ringkasan SLA per client × prioritas (tercapai, terlambat, lewat SLA, % tercapai) untuk solusi sementara & permanen · Detail SLA per PRL · Ketentuan SLA.</p>
          <p class="small" data-count-sla></p>
          <p class="small muted">📋 <span data-cols="sla"></span></p>
          <div class="row gap-sm"><button class="btn btn--primary" data-dl="sla">⬇ Download Excel</button><button class="btn btn--ghost" data-pick="sla">⚙️ Pilih kolom</button></div>
        </section>
      </div>`;

    const form = el.querySelector('[data-filter]');
    const refresh = () => {
      Object.assign(f, Object.fromEntries(new FormData(form).entries()));
      sessionStorage.setItem(KEY, JSON.stringify(f));
      const c = report.counts(f);
      el.querySelector('[data-count-progress]').innerHTML = `<b>${number(c.total)}</b> tiket: ${number(c.cr)} project/CR · ${number(c.prl)} PRL`;
      el.querySelector('[data-count-sla]').innerHTML = `<b>${number(c.prl)}</b> PRL · ${number(c.prlWithSla)} sudah punya prioritas & SLA`;
    };
    form.addEventListener('change', refresh);
    form.querySelectorAll('[data-preset]').forEach((b) =>
      b.addEventListener('click', () => {
        const r = periodRange(b.dataset.preset);
        form.from.value = r.from;
        form.to.value = r.to;
        refresh();
      })
    );
    el.querySelectorAll('[data-dl]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const label = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Membuat file…';
        try {
          const kind = btn.dataset.dl;
          const res = kind === 'progress' ? await report.progressReport({ ...f }, loadChoice(kind)) : await report.slaReport({ ...f }, loadChoice(kind));
          toast(btn.dataset.dl === 'progress' ? `Laporan dibuat: ${res.cr} project/CR, ${res.prl} PRL` : `Laporan SLA dibuat: ${res.prl} PRL`);
        } catch (err) {
          console.error(err);
          toast(err.message || 'Gagal membuat laporan', 'error');
        }
        btn.disabled = false;
        btn.textContent = label;
      })
    );
    const showCols = () => el.querySelectorAll('[data-cols]').forEach((s) => (s.textContent = choiceSummary(s.dataset.cols)));
    el.querySelectorAll('[data-pick]').forEach((b) =>
      b.addEventListener('click', () => openColumnPicker(b.dataset.pick, b.dataset.pick === 'progress' ? 'Laporan Progress Project & PRL' : 'Laporan SLA', showCols))
    );
    showCols();
    refresh();
  },
};
