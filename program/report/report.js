/**
 * Menu — Laporan (Excel)
 *  1. Laporan Progress Project & PRL
 *  2. Laporan SLA
 * Data mengikuti client yang di-handle user & filter di halaman ini.
 */
import * as report from '../../service/report.service.js';
import * as clients from '../../service/client.service.js';
import { pageHeader, options, toast, esc } from '../../service/ui.service.js';
import { number, periodRange } from '../../service/format.service.js';

const KEY = 'pm.report';

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
          <button class="btn btn--primary" data-dl="progress">⬇ Download Excel</button>
        </section>
        <section class="card report-card">
          <div class="report-card__icon">⏱️</div>
          <h3>Laporan SLA</h3>
          <p class="muted small">Sheet: Ringkasan SLA per client × prioritas (tercapai, terlambat, lewat SLA, % tercapai) untuk solusi sementara & permanen · Detail SLA per PRL · Ketentuan SLA.</p>
          <p class="small" data-count-sla></p>
          <button class="btn btn--primary" data-dl="sla">⬇ Download Excel</button>
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
          const res = btn.dataset.dl === 'progress' ? await report.progressReport({ ...f }) : await report.slaReport({ ...f });
          toast(btn.dataset.dl === 'progress' ? `Laporan dibuat: ${res.cr} project/CR, ${res.prl} PRL` : `Laporan SLA dibuat: ${res.prl} PRL`);
        } catch (err) {
          console.error(err);
          toast(err.message || 'Gagal membuat laporan', 'error');
        }
        btn.disabled = false;
        btn.textContent = label;
      })
    );
    refresh();
  },
};
