/**
 * Menu — Setting SDLC (khusus Admin)
 * Tahapan (step) SDLC untuk CR dan PRL — berlaku umum untuk semua client.
 * Tiap step: nama, durasi (hari kerja), tim penanggung jawab.
 */
import * as sdlc from '../../service/sdlc.service.js';
import * as master from '../../service/master.service.js';
import * as projects from '../../service/project.service.js';
import { esc, pageHeader, options, toast, attempt, confirmDialog } from '../../service/ui.service.js';
import { number } from '../../service/format.service.js';

function row(s = {}) {
  return `
    <tr>
      <td class="sdlc-no"></td>
      <td><input class="input input--sm" data-k="name" value="${esc(s.name || '')}" placeholder="Nama step" /></td>
      <td><input class="input input--sm num" type="number" min="1" step="1" data-k="days" value="${esc(s.days || 1)}" /></td>
      <td><select class="input input--sm" data-k="team">${options(master.teams(), s.team || '', { empty: '-' })}</select></td>
      <td class="actions nowrap">
        <button type="button" class="btn btn--icon btn--ghost btn--sm" data-mv="-1" title="Naik">↑</button>
        <button type="button" class="btn btn--icon btn--ghost btn--sm" data-mv="1" title="Turun">↓</button>
        <button type="button" class="btn btn--icon btn--ghost btn--sm" data-rm title="Hapus">✕</button>
      </td>
    </tr>`;
}

function card(cat) {
  const meta = sdlc.CATEGORIES.find((c) => c.key === cat);
  return `
    <section class="card" data-cat="${cat}">
      <div class="card__head"><h3>${meta.icon} Step SDLC ${esc(meta.label)}</h3><span class="muted small" data-total></span></div>
      <table class="table table--compact sdlc-table">
        <thead><tr><th>#</th><th>Step</th><th class="num">Durasi (hari kerja)</th><th>Tim</th><th></th></tr></thead>
        <tbody>${sdlc.steps(cat).map(row).join('')}</tbody>
      </table>
      <div class="form-actions">
        <button type="button" class="btn btn--ghost btn--sm mr-auto" data-add>+ Step</button>
        <button type="button" class="btn btn--ghost btn--sm" data-default>Kembalikan default</button>
        <button type="button" class="btn btn--primary btn--sm" data-save>💾 Simpan ${esc(meta.label)}</button>
      </div>
    </section>`;
}

export default {
  path: '/sdlc',
  title: 'Setting SDLC',
  autoRefresh: false,
  render(el) {
    const draw = () => {
      el.innerHTML = `
        ${pageHeader({ title: 'Setting SDLC', subtitle: 'Tahapan SDLC untuk CR dan PRL — berlaku umum untuk semua client', icon: '🧭',
          actions: '<button class="btn btn--ghost" data-sync-all title="Tambah / sesuaikan step pada project berjalan yang sudah punya timeline SDLC">↻ Sinkron project berjalan</button>' })}
        ${card('CR')}${card('PRL')}
        <p class="muted small">Kategori: tipe ${esc(master.slaTypes().join(', '))} memakai step <b>PRL</b>, tipe lainnya memakai step <b>CR</b>.
          Di Detail Project → tab Timeline, tombol <i>Buat timeline SDLC</i> membuat 1 activity per step (berurutan, sesuai durasi hari kerja),
          di-assign ke anggota project dengan tim yang sama (atau PIC MLPT). Perubahan step di sini tidak mengubah jadwal project yang sudah dibuat,
          kecuali lewat <i>Sinkron</i> / <i>Hitung ulang jadwal</i>.</p>`;

      el.querySelectorAll('[data-cat]').forEach((sec) => {
        const cat = sec.dataset.cat;
        const body = sec.querySelector('tbody');
        const renumber = () => {
          [...body.rows].forEach((tr, i) => (tr.querySelector('.sdlc-no').textContent = i + 1));
          const days = [...body.querySelectorAll('[data-k=days]')].reduce((s, i) => s + (Number(i.value) || 0), 0);
          sec.querySelector('[data-total]').textContent = `${body.rows.length} step · ${number(days)} hari kerja`;
        };
        const bindRow = (tr) => {
          tr.querySelector('[data-rm]').onclick = () => (tr.remove(), renumber());
          tr.querySelectorAll('[data-mv]').forEach(
            (b) =>
              (b.onclick = () => {
                const sib = b.dataset.mv === '-1' ? tr.previousElementSibling : tr.nextElementSibling;
                if (!sib) return;
                b.dataset.mv === '-1' ? body.insertBefore(tr, sib) : body.insertBefore(sib, tr);
                renumber();
              })
          );
          tr.querySelector('[data-k=days]').addEventListener('input', renumber);
        };
        [...body.rows].forEach(bindRow);
        renumber();
        sec.querySelector('[data-add]').onclick = () => {
          body.insertAdjacentHTML('beforeend', row());
          bindRow(body.lastElementChild);
          renumber();
          body.lastElementChild.querySelector('input').focus();
        };
        sec.querySelector('[data-default]').onclick = async () => {
          if (!(await confirmDialog(`Kembalikan step ${cat} ke default?`))) return;
          if ((await attempt(() => sdlc.save(cat, sdlc.DEFAULT[cat]).then(() => true), `Step ${cat} dikembalikan ke default`))) draw();
        };
        sec.querySelector('[data-save]').onclick = async () => {
          const list = [...body.rows].map((tr) => ({
            name: tr.querySelector('[data-k=name]').value.trim(),
            days: Math.max(1, Math.round(Number(tr.querySelector('[data-k=days]').value) || 1)),
            team: tr.querySelector('[data-k=team]').value,
          }));
          if (!list.length || list.some((s) => !s.name)) return toast('Nama step wajib diisi (minimal 1 step)', 'error');
          if (new Set(list.map((s) => s.name.toLowerCase())).size !== list.length) return toast('Nama step tidak boleh sama', 'error');
          if ((await attempt(() => sdlc.save(cat, list).then(() => true), `Step SDLC ${cat} disimpan`))) draw();
        };
      });

      el.querySelector('[data-sync-all]').onclick = async (e) => {
        const btn = e.currentTarget;
        const targets = projects.list().filter((p) => !master.isClosed(p.status) && sdlc.stepActivities(p.id).length);
        if (!targets.length) return toast('Belum ada project berjalan yang punya timeline SDLC');
        if (!(await confirmDialog(`Sinkron step SDLC pada ${targets.length} project berjalan? Step baru ditambahkan, nama step disesuaikan; jadwal yang sudah ada tidak diubah.`))) return;
        btn.disabled = true;
        let c = 0;
        let u = 0;
        for (const p of targets) {
          const r = await attempt(() => sdlc.generate(p));
          if (r) {
            c += r.created;
            u += r.updated;
          }
        }
        btn.disabled = false;
        toast(`Sinkron selesai: ${c} step dibuat, ${u} diperbarui`);
      };
    };
    draw();
  },
};
