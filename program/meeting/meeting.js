/**
 * Menu — Weekly Meeting
 * Isi History Update cepat saat meeting mingguan: semua project dalam satu tabel,
 * ketik update → Enter (simpan & lanjut ke baris berikutnya), ubah status langsung,
 * dan salin notulen meeting.
 */
import * as projects from '../../service/project.service.js';
import * as clients from '../../service/client.service.js';
import * as master from '../../service/master.service.js';
import { esc, pageHeader, options, emptyState, badge, toast, openModal } from '../../service/ui.service.js';
import { today, dateLabel, daysUntil } from '../../service/format.service.js';

const KEY = 'pm.meeting';

/** Catatan update terakhir (bukan "Dibuat"). */
const lastNote = (id) => projects.history(id).find((h) => h.action !== 'create' && h.note);
/** Sudah ada update di tanggal meeting? */
const updatedOn = (id, date) => projects.history(id).some((h) => h.action === 'note' && h.createdAt.slice(0, 10) === date);

export default {
  path: '/meeting',
  title: 'Weekly Meeting',
  autoRefresh: false, // jangan render ulang saat sedang mengetik
  render(el) {
    let saved = {};
    try {
      saved = JSON.parse(sessionStorage.getItem(KEY)) || {};
    } catch { /* abaikan */ }
    const f = { date: today(), clientId: '', pic: '', type: '', scope: 'open', q: '', hideDone: false, ...saved, date: saved.date || today() };
    const pics = [...new Set(projects.list().map((p) => p.picMlpt).filter(Boolean))].sort();

    el.innerHTML = `
      ${pageHeader({ title: 'Weekly Meeting', subtitle: 'Isi update project cepat saat meeting — ketik lalu Enter untuk simpan & lanjut', icon: '📝',
        actions: '<button class="btn btn--ghost" data-minutes>📋 Salin notulen</button><button class="btn btn--primary" data-save-all>💾 Simpan semua</button>' })}
      <div class="card meeting-bar">
        <label class="field"><span>Tanggal meeting</span><input class="input input--sm" type="date" data-f="date" value="${esc(f.date)}" /></label>
        <label class="field"><span>Client</span><select class="input input--sm" data-f="clientId">${options(clients.list(), f.clientId, { valueKey: 'id', labelKey: 'name', empty: 'Semua client' })}</select></label>
        <label class="field"><span>PIC MLPT</span><select class="input input--sm" data-f="pic">${options(pics, f.pic, { empty: 'Semua PIC' })}</select></label>
        <label class="field"><span>Tipe</span><select class="input input--sm" data-f="type">${options(master.types(), f.type, { empty: 'Semua tipe' })}</select></label>
        <label class="field"><span>Status</span><select class="input input--sm" data-f="scope">
          <option value="open" ${f.scope === 'open' ? 'selected' : ''}>Belum selesai</option><option value="" ${!f.scope ? 'selected' : ''}>Semua</option>
          ${options(master.statusNames(), f.scope)}</select></label>
        <label class="field meeting-search"><span>Cari</span><input class="input input--sm" data-f="q" value="${esc(f.q)}" placeholder="ID, Jira, nama project…" /></label>
        <label class="check small"><input type="checkbox" data-f="hideDone" ${f.hideDone ? 'checked' : ''} /> Sembunyikan yang sudah diupdate</label>
      </div>
      <div class="meeting-progress" data-progress></div>
      <div data-body></div>`;

    const body = el.querySelector('[data-body]');
    let rows = [];

    const filtered = () =>
      projects
        .list()
        .filter((p) => !f.clientId || p.clientId === f.clientId)
        .filter((p) => !f.pic || p.picMlpt === f.pic)
        .filter((p) => !f.type || p.type === f.type)
        .filter((p) => (f.scope === 'open' ? !master.isClosed(p.status) : !f.scope || p.status === f.scope))
        .filter((p) => projects.matches(p, f.q))
        .filter((p) => !f.hideDone || !updatedOn(p.id, f.date))
        .sort((a, b) => clients.nameOf(a.clientId).localeCompare(clients.nameOf(b.clientId)) || (a.picMlpt || '').localeCompare(b.picMlpt || '') || a.code.localeCompare(b.code));

    function progress() {
      const all = projects
        .list()
        .filter((p) => (!f.clientId || p.clientId === f.clientId) && (!f.pic || p.picMlpt === f.pic) && (!f.type || p.type === f.type))
        .filter((p) => (f.scope === 'open' ? !master.isClosed(p.status) : !f.scope || p.status === f.scope));
      const done = all.filter((p) => updatedOn(p.id, f.date)).length;
      const pct = all.length ? Math.round((done / all.length) * 100) : 0;
      el.querySelector('[data-progress]').innerHTML = `
        <div class="util">${`<div class="progress tone-${pct === 100 ? 'green' : 'blue'}"><span style="width:${pct}%"></span></div>`}<span>${pct}%</span></div>
        <span class="small"><b>${done}</b> dari ${all.length} project sudah diupdate tanggal ${dateLabel(f.date)}</span>`;
    }

    const lastCell = (p) => {
      const h = lastNote(p.id);
      return h ? `<small class="muted">${dateLabel(h.createdAt.slice(0, 10))}</small><div class="clamp">${esc(h.note)}</div>` : `<span class="muted small">${esc(p.remark || 'Belum ada update')}</span>`;
    };

    function draw() {
      sessionStorage.setItem(KEY, JSON.stringify(f));
      rows = filtered();
      progress();
      if (!rows.length) {
        body.innerHTML = `<div class="card">${emptyState('📝', 'Tidak ada project', f.hideDone ? 'Semua project di filter ini sudah diupdate 🎉' : 'Ubah filter di atas.')}</div>`;
        return;
      }
      let lastClient = null;
      body.innerHTML = `
        <div class="card card--flush"><div class="table-wrap">
          <table class="table meeting-table">
            <thead><tr><th>ID / Jira</th><th>Nama Project</th><th>PIC MLPT</th><th>Target</th><th style="width:22%">Update terakhir</th><th>Status</th><th style="width:28%">Update ${dateLabel(f.date)}</th><th></th></tr></thead>
            <tbody>
              ${rows
                .map((p) => {
                  const head = p.clientId !== lastClient ? `<tr class="meeting-group"><td colspan="8">🏦 ${esc(clients.nameOf(p.clientId))}</td></tr>` : '';
                  lastClient = p.clientId;
                  const late = p.target && !master.isClosed(p.status) && daysUntil(p.target) < 0;
                  const done = updatedOn(p.id, f.date);
                  return `${head}
                  <tr data-pid="${esc(p.id)}" class="${done ? 'is-done' : ''}">
                    <td class="nowrap"><a href="#/project/detail?id=${esc(p.id)}&tab=history" target="_blank" rel="noopener">${esc(p.code)}</a><br><small class="muted">${esc(p.jiraNo || '-')} · ${esc(p.type || '-')}</small></td>
                    <td><span class="clamp">${esc(p.title || p.outstanding || '-')}</span></td>
                    <td>${esc(p.picMlpt || '-')}</td>
                    <td class="nowrap ${late ? 'text-red' : ''}">${p.target ? dateLabel(p.target) + (late ? ' ⚠' : '') : '-'}</td>
                    <td data-last>${lastCell(p)}</td>
                    <td><select class="input input--sm" data-status>${options(master.statusNames(), p.status)}</select></td>
                    <td><textarea class="input meeting-note" rows="1" data-note placeholder="Ketik update… Enter = simpan" title="Enter = simpan & lanjut · Shift+Enter = baris baru"></textarea></td>
                    <td class="actions"><span data-flag>${done ? badge('✓ diupdate', 'green') : ''}</span></td>
                  </tr>`;
                })
                .join('')}
            </tbody>
          </table>
        </div></div>`;

      body.querySelectorAll('[data-note]').forEach((ta) => {
        ta.addEventListener('input', () => {
          ta.style.height = 'auto';
          ta.style.height = ta.scrollHeight + 'px';
          ta.closest('tr').classList.toggle('is-dirty', Boolean(ta.value.trim()));
        });
        ta.addEventListener('keydown', async (e) => {
          if (e.key !== 'Enter' || e.shiftKey) return;
          e.preventDefault();
          const tr = ta.closest('tr');
          await saveRow(tr);
          // lanjut ke baris berikutnya
          let next = tr.nextElementSibling;
          while (next && !next.querySelector('[data-note]')) next = next.nextElementSibling;
          next?.querySelector('[data-note]').focus();
        });
      });
      body.querySelectorAll('[data-status]').forEach((sel) => sel.addEventListener('change', () => sel.closest('tr').classList.add('is-dirty')));
    }

    /** Simpan satu baris: status (bila berubah) + catatan update. */
    async function saveRow(tr) {
      const p = projects.get(tr.dataset.pid);
      const note = tr.querySelector('[data-note]').value.trim();
      const status = tr.querySelector('[data-status]').value;
      if (!note && status === p.status) return false;
      const flag = tr.querySelector('[data-flag]');
      flag.innerHTML = '<span class="muted small">menyimpan…</span>';
      try {
        if (status !== p.status) await projects.save(p.id, { ...p, status });
        if (note) await projects.addNote(p.id, note, { date: f.date });
        tr.querySelector('[data-note]').value = '';
        tr.querySelector('[data-note]').style.height = '';
        tr.classList.remove('is-dirty');
        tr.classList.add('is-done');
        tr.querySelector('[data-last]').innerHTML = lastCell(projects.get(p.id));
        flag.innerHTML = badge('✓ diupdate', 'green');
        progress();
        return true;
      } catch (err) {
        flag.innerHTML = badge('gagal', 'red');
        toast(`${p.code}: ${err.message}`, 'error');
        return false;
      }
    }

    el.querySelector('[data-save-all]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const dirty = [...body.querySelectorAll('tr.is-dirty')];
      if (!dirty.length) return toast('Tidak ada perubahan');
      btn.disabled = true;
      let ok = 0;
      for (const tr of dirty) if (await saveRow(tr)) ok++;
      btn.disabled = false;
      toast(`${ok} project diupdate`);
    });

    // Notulen: semua update di tanggal meeting, dikelompokkan per client
    el.querySelector('[data-minutes]').addEventListener('click', async () => {
      const list = projects
        .list()
        .map((p) => ({ p, notes: projects.history(p.id).filter((h) => h.action === 'note' && h.createdAt.slice(0, 10) === f.date) }))
        .filter((x) => x.notes.length && (!f.clientId || x.p.clientId === f.clientId));
      if (!list.length) return toast(`Belum ada update tanggal ${dateLabel(f.date)}`, 'error');
      const byClient = {};
      list.forEach((x) => (byClient[clients.nameOf(x.p.clientId)] ||= []).push(x));
      const text =
        `Notulen Weekly Meeting — ${dateLabel(f.date)}\n` +
        Object.entries(byClient)
          .map(([c, xs]) => `\n${c}\n` + xs.map(({ p, notes }) => `- ${p.code}${p.jiraNo ? ` (${p.jiraNo})` : ''} ${p.title || ''} [${p.status}] — PIC ${p.picMlpt || '-'}: ${notes.map((n) => n.note).join('; ')}`).join('\n'))
          .join('\n');
      const modal = openModal({
        title: `Notulen ${dateLabel(f.date)} — ${list.length} project`,
        wide: true,
        body: `<textarea class="input minutes-text" rows="16" readonly>${esc(text)}</textarea>
          <div class="form-actions"><button class="btn btn--ghost" data-close-m>Tutup</button><button class="btn btn--primary" data-copy>📋 Salin</button></div>`,
      });
      modal.el.querySelector('[data-close-m]').onclick = modal.close;
      modal.el.querySelector('[data-copy]').onclick = async () => {
        const ta = modal.el.querySelector('textarea');
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          ta.select();
          document.execCommand('copy'); // cadangan bila clipboard API tidak tersedia
        }
        toast('Notulen disalin — tempel di email / chat');
      };
    });

    el.querySelectorAll('[data-f]').forEach((inp) =>
      inp.addEventListener(inp.tagName === 'INPUT' && inp.type !== 'checkbox' && inp.type !== 'date' ? 'input' : 'change', () => {
        const dirty = body.querySelectorAll('tr.is-dirty').length;
        if (dirty && !confirm(`${dirty} baris belum disimpan dan akan hilang. Lanjut?`)) return;
        f[inp.dataset.f] = inp.type === 'checkbox' ? inp.checked : inp.value || (inp.dataset.f === 'date' ? today() : '');
        draw();
      })
    );
    draw();
  },
};
