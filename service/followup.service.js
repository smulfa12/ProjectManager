/**
 * Follow-up Service — daftar pekerjaan yang perlu di-follow up oleh satu member
 * (tampil di Dashboard untuk user yang login).
 *
 * Project milik member = PIC MLPT-nya atau ada di Member Assignment, dan belum selesai:
 *   - SLA PRL lewat / sisa < 24 jam
 *   - lewat target / target ≤ 7 hari lagi
 *   - status menunggu pihak lain (Waiting / Submitted / Pending) → perlu FU ke bank
 *   - belum ada update ≥ 7 hari
 * Activity milik member yang sudah di To Do / In Progress / Review (BUKAN Backlog) dengan target
 *   terlambat, hari ini, atau hari kerja berikutnya.
 */
import * as projects from './project.service.js';
import * as activities from './activity.service.js';
import * as clients from './client.service.js';
import * as master from './master.service.js';
import * as sla from './sla.service.js';
import { today, diffDays, dateLabel, addDays, nextWorkday, dayName } from './format.service.js';

const STALE_DAYS = 7;
const SOON_DAYS = 7;

const isMine = (p, m) =>
  (p.picMlpt && p.picMlpt.trim().toLowerCase() === m.name.trim().toLowerCase()) || (p.members || []).some((x) => x.memberId === m.id);

/** Hari sejak update terakhir (catatan / perubahan); tanpa update → sejak dibuat. */
function daysSinceUpdate(p) {
  const last = projects.history(p.id).find((h) => h.action !== 'create');
  const from = (last?.createdAt || p.createdAt || '').slice(0, 10);
  return from ? diffDays(from, today()) : 0;
}

/**
 * Item follow up: { kind, id, href, code, title, client, reasons:[{text, tone}], severity }
 * Diurutkan menurut tanggal target (paling terlambat dulu); severity kecil = lebih mendesak.
 */
export function forMember(m) {
  if (!m) return [];
  const t = today();
  const out = [];

  projects
    .list()
    .filter((p) => !master.isClosed(p.status) && isMine(p, m))
    .forEach((p) => {
      const reasons = [];
      let sev = 9;
      const add = (text, tone, s) => {
        reasons.push({ text, tone });
        sev = Math.min(sev, s);
      };
      if (sla.applies(p) && p.slaTempDue) {
        const st = sla.status(p);
        [['temp', 'Sementara'], ['perm', 'Permanen']].forEach(([k, label]) => {
          if (st[k].key === 'overdue') add(`SLA ${label} lewat`, 'red', 0);
          else if (st[k].key === 'open' && st[k].hours < 24) add(`SLA ${label} ${st[k].label.toLowerCase()}`, 'amber', 1);
        });
      }
      if (p.target) {
        const d = diffDays(t, p.target);
        if (d < 0) add(`Lewat target ${-d} hari`, 'red', 1);
        else if (d <= SOON_DAYS) add(d === 0 ? 'Target hari ini' : `Target ${d} hari lagi`, 'amber', 2);
      }
      if (/waiting|submitted|pending/i.test(p.status || '')) add(`${p.status} — FU ke ${clients.get(p.clientId)?.code || 'client'}`, 'purple', 3);
      const stale = daysSinceUpdate(p);
      if (stale >= STALE_DAYS) add(`Belum ada update ${stale} hari`, 'gray', 4);
      if (reasons.length)
        out.push({ kind: 'project', id: p.id, href: `#/project/detail?id=${p.id}&tab=history`, code: p.code, jira: p.jiraNo, target: p.target, title: p.title || p.outstanding || '-', client: clients.nameOf(p.clientId), status: p.status, reasons, severity: sev });
    });

  // hari kerja berikutnya (Jumat → Senin)
  const nextDay = nextWorkday(addDays(t, 1));
  const nextLabel = diffDays(t, nextDay) === 1 ? 'besok' : `${dayName(nextDay)} ${dateLabel(nextDay)}`;
  activities
    .list()
    // hanya activity yang sudah masuk antrian kerja (bukan Backlog); SLA sudah tercakup di baris project
    .filter((a) => a.memberId === m.id && master.isActiveWork(a) && !a.id.startsWith('sla-'))
    .forEach((a) => {
      const d = a.planEnd ? diffDays(t, a.planEnd) : null;
      const p = projects.get(a.projectId);
      const base = { kind: 'activity', id: a.id, href: '#/activity?view=table', code: p?.code || 'Internal', jira: p?.jiraNo || '', target: a.planEnd, title: a.title, client: p ? clients.nameOf(p.clientId) : '-', status: master.activityStatus(a.status).label };
      // hanya target yang sudah lewat, hari ini, atau hari kerja berikutnya
      if (d === null || a.planEnd > nextDay) return;
      const started = a.status !== 'todo';
      const reasons = [];
      let sev;
      if (d < 0) (reasons.push({ text: `Activity terlambat ${-d} hari`, tone: 'red' }), (sev = 1));
      else if (d === 0) (reasons.push({ text: 'Activity target hari ini', tone: 'amber' }), (sev = 2));
      else (reasons.push({ text: `Activity target ${nextLabel}`, tone: 'blue' }), (sev = 3));
      reasons.push({ text: started ? master.activityStatus(a.status).label : 'To Do — belum dimulai', tone: started ? 'teal' : 'gray' });
      out.push({ ...base, reasons, severity: sev });
    });

  // urut tanggal target: paling terlambat → paling akan datang; tanpa target di akhir
  return out.sort((a, b) => (a.target || '9999').localeCompare(b.target || '9999') || a.severity - b.severity || a.code.localeCompare(b.code));
}
