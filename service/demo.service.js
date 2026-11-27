/**
 * Demo Service — data contoh supaya aplikasi bisa langsung dicoba.
 * Tanggal dibuat relatif terhadap hari ini.
 */
import * as store from './store.service.js';
import { today, addDays } from './format.service.js';

export async function loadDemo() {
  const t = today();
  const d = (n) => addDays(t, n);
  const now = new Date().toISOString();
  const row = (id, obj) => ({ id, createdAt: now, updatedAt: now, ...obj });

  const clients = [
    row('c1', { code: 'BNU', name: 'Bank Nusa Utama', freeMandays: 40, contractDate: d(-300), pmStart: d(-300), pmEnd: d(65), pmFrequency: 'Triwulan', pricePerMandays: 4500000, pic: 'Ibu Ratna', notes: '', active: true }),
    row('c2', { code: 'BAJ', name: 'Bank Arta Jaya', freeMandays: 25, contractDate: d(-120), pmStart: d(-120), pmEnd: d(245), pmFrequency: 'Bulanan', pricePerMandays: 5000000, pic: 'Bapak Hendra', notes: '', active: true }),
    row('c3', { code: 'BPS', name: 'BPR Sentosa', freeMandays: 10, contractDate: d(-200), pmStart: d(-200), pmEnd: d(165), pmFrequency: 'Semester', pricePerMandays: 3500000, pic: 'Ibu Dewi', notes: '', active: true }),
  ];
  const members = [
    row('m1', { name: 'Andi Pratama', email: 'andi@contoh.com', team: 'Developer', position: 'Senior Developer', role: 'pm', clientIds: ['c1', 'c2'], dailyHours: 8, reminder: true, active: true }),
    row('m2', { name: 'Budi Santoso', email: 'budi@contoh.com', team: 'Developer', position: 'Developer', role: 'member', clientIds: ['c1'], dailyHours: 8, reminder: true, active: true }),
    row('m3', { name: 'Citra Lestari', email: 'citra@contoh.com', team: 'QA', position: 'QA Engineer', role: 'member', clientIds: ['c1', 'c3'], dailyHours: 8, reminder: true, active: true }),
    row('m4', { name: 'Dimas Saputra', email: 'dimas@contoh.com', team: 'Business Analyst', position: 'BA', role: 'member', clientIds: ['c2', 'c3'], dailyHours: 8, reminder: true, active: true }),
    row('m5', { name: 'Eka Wulandari', email: 'eka@contoh.com', team: 'Support', position: 'Support Engineer', role: 'member', clientIds: ['c1', 'c2', 'c3'], dailyHours: 8, reminder: true, active: true }),
  ];
  const P = (id, o) =>
    row(id, {
      systemId: '', title: '', jiraNo: '', crNo: '', outstanding: '', bast: '', bastDate: '', picBank: '', picMlpt: '', remark: '', notes: '', endDate: '', createdBy: 'demo', members: [], ...o,
    });
  const calc = (md, rate, free) => {
    const tcv = free ? 0 : md * rate;
    return { mandays: md, priceTcv: tcv, revenue: tcv, grossProfit: tcv - md * 1500000, costType: free ? 'Free Mandays' : 'Cost' };
  };
  const projects = [
    P('p1', { code: 'PRJ-0001', systemId: 'SYS-1001', title: 'Penambahan fitur transfer BI-FAST', type: 'Change Request', clientId: 'c1', jiraNo: 'BNU-231', module: 'Mobile Banking', crNo: 'CR/BNU/2026/014', date: d(-40), startDate: d(-35), target: d(10), status: 'On Progress', picBank: 'Ibu Ratna', picMlpt: 'Andi Pratama', ...calc(20, 4500000), members: [{ memberId: 'm1', role: 'Lead Dev', mandays: 10 }, { memberId: 'm2', role: 'Developer', mandays: 6 }, { memberId: 'm3', role: 'QA', mandays: 4 }] }),
    P('p2', { code: 'PRJ-0002', systemId: 'SYS-1002', title: 'Perbaikan laporan harian teller', type: 'Incident', clientId: 'c1', jiraNo: 'BNU-245', module: 'Reporting', date: d(-12), startDate: d(-10), target: d(-2), status: 'UAT', picBank: 'Bapak Joko', picMlpt: 'Budi Santoso', ...calc(3, 4500000, true), members: [{ memberId: 'm2', role: 'Developer', mandays: 2 }, { memberId: 'm3', role: 'QA', mandays: 1 }] }),
    P('p3', { code: 'PRJ-0003', systemId: 'SYS-1003', title: 'Preventive maintenance Q3', type: 'Preventive Maintenance', clientId: 'c1', jiraNo: 'BNU-200', module: 'Core Banking', date: d(-90), startDate: d(-90), target: d(-80), endDate: d(-81), status: 'Done', bast: 'BAST/BNU/021', bastDate: d(-75), picBank: 'Ibu Ratna', picMlpt: 'Eka Wulandari', ...calc(5, 4500000, true), members: [{ memberId: 'm5', role: 'Support', mandays: 5 }] }),
    P('p4', { code: 'PRJ-0004', systemId: 'SYS-2001', title: 'Integrasi QRIS merchant', type: 'Project', clientId: 'c2', jiraNo: 'BAJ-88', module: 'Payment Gateway', crNo: 'CR/BAJ/2026/003', date: d(-60), startDate: d(-55), target: d(30), status: 'On Progress', picBank: 'Bapak Hendra', picMlpt: 'Andi Pratama', ...calc(45, 5000000), outstanding: 'Menunggu sertifikat SSL dari bank', members: [{ memberId: 'm1', role: 'Lead Dev', mandays: 20 }, { memberId: 'm4', role: 'BA', mandays: 10 }, { memberId: 'm5', role: 'Support', mandays: 5 }] }),
    P('p5', { code: 'PRJ-0005', systemId: 'SYS-2002', title: 'Enhancement limit transaksi', type: 'Enhancement', clientId: 'c2', jiraNo: 'BAJ-95', module: 'Internet Banking', date: d(-20), startDate: d(-5), target: d(20), status: 'Open', picBank: 'Ibu Sari', picMlpt: 'Dimas Saputra', ...calc(8, 5000000), members: [{ memberId: 'm4', role: 'BA', mandays: 3 }] }),
    P('p6', { code: 'PRJ-0006', systemId: 'SYS-2003', title: 'Gangguan notifikasi SMS', type: 'Incident', clientId: 'c2', jiraNo: 'BAJ-101', module: 'Middleware', date: d(-6), startDate: d(-6), target: d(1), status: 'On Progress', picBank: 'Bapak Hendra', picMlpt: 'Eka Wulandari', ...calc(2, 5000000, true), members: [{ memberId: 'm5', role: 'Support', mandays: 2 }] }),
    P('p7', { code: 'PRJ-0007', systemId: 'SYS-3001', title: 'Upgrade versi core banking', type: 'Project', clientId: 'c3', jiraNo: 'BPS-12', module: 'Core Banking', crNo: 'CR/BPS/2026/001', date: d(-150), startDate: d(-140), target: d(-30), endDate: d(-28), status: 'Done', picBank: 'Ibu Dewi', picMlpt: 'Dimas Saputra', ...calc(30, 3500000), members: [{ memberId: 'm4', role: 'BA', mandays: 10 }, { memberId: 'm3', role: 'QA', mandays: 8 }] }),
    P('p8', { code: 'PRJ-0008', systemId: 'SYS-3002', title: 'Laporan OJK bulanan', type: 'Change Request', clientId: 'c3', jiraNo: 'BPS-19', module: 'Reporting', date: d(-15), startDate: d(-3), target: d(12), status: 'Pending', picBank: 'Ibu Dewi', picMlpt: 'Citra Lestari', ...calc(6, 3500000, true), remark: 'Menunggu format dari bank', members: [{ memberId: 'm3', role: 'QA', mandays: 2 }, { memberId: 'm4', role: 'BA', mandays: 2 }] }),
  ];
  const A = (id, o) => row(id, { description: '', actualStart: '', actualEnd: '', planHours: 0, progress: 0, status: 'todo', priority: 'medium', ...o });
  const activities = [
    A('a1', { projectId: 'p1', memberId: 'm1', title: 'Desain API BI-FAST', planStart: d(-30), planEnd: d(-20), actualStart: d(-30), actualEnd: d(-19), status: 'done', progress: 100, planHours: 56 }),
    A('a2', { projectId: 'p1', memberId: 'm2', title: 'Develop layar transfer', planStart: d(-18), planEnd: d(-1), actualStart: d(-17), status: 'progress', progress: 70, planHours: 80, priority: 'high' }),
    A('a3', { projectId: 'p1', memberId: 'm1', title: 'Integrasi switching', planStart: d(-5), planEnd: d(4), actualStart: d(-4), status: 'progress', progress: 40, planHours: 56, priority: 'high' }),
    A('a4', { projectId: 'p1', memberId: 'm3', title: 'SIT transfer BI-FAST', planStart: d(3), planEnd: d(9), planHours: 40 }),
    A('a5', { projectId: 'p2', memberId: 'm2', title: 'Fix query laporan teller', planStart: d(-10), planEnd: d(-7), actualStart: d(-10), actualEnd: d(-6), status: 'done', progress: 100, planHours: 16 }),
    A('a6', { projectId: 'p2', memberId: 'm3', title: 'Dampingi UAT laporan', planStart: d(-3), planEnd: d(0), actualStart: d(-2), status: 'review', progress: 80, planHours: 8 }),
    A('a7', { projectId: 'p4', memberId: 'm4', title: 'Analisa kebutuhan QRIS', planStart: d(-50), planEnd: d(-35), actualStart: d(-50), actualEnd: d(-33), status: 'done', progress: 100, planHours: 80 }),
    A('a8', { projectId: 'p4', memberId: 'm1', title: 'Develop modul QRIS', planStart: d(-30), planEnd: d(12), actualStart: d(-28), status: 'progress', progress: 55, planHours: 160, priority: 'high' }),
    A('a9', { projectId: 'p4', memberId: 'm5', title: 'Setup server & sertifikat', planStart: d(-8), planEnd: d(-2), actualStart: d(-7), status: 'progress', progress: 50, planHours: 24, priority: 'high' }),
    A('a10', { projectId: 'p4', memberId: 'm4', title: 'Siapkan skenario UAT QRIS', planStart: d(5), planEnd: d(15), planHours: 40 }),
    A('a11', { projectId: 'p5', memberId: 'm4', title: 'Dokumen spesifikasi limit', planStart: d(-2), planEnd: d(6), actualStart: d(-1), status: 'progress', progress: 20, planHours: 24 }),
    A('a12', { projectId: 'p6', memberId: 'm5', title: 'Investigasi gateway SMS', planStart: d(-6), planEnd: d(1), actualStart: d(-6), status: 'progress', progress: 60, planHours: 16, priority: 'high' }),
    A('a13', { projectId: 'p8', memberId: 'm3', title: 'Test template laporan OJK', planStart: d(0), planEnd: d(8), planHours: 24 }),
    A('a14', { projectId: 'p8', memberId: 'm4', title: 'Mapping field laporan OJK', planStart: d(-3), planEnd: d(2), actualStart: d(-2), status: 'todo', planHours: 16 }),
    A('a15', { projectId: '', memberId: 'm2', title: 'Code review mingguan', planStart: d(0), planEnd: d(0), planHours: 2, priority: 'low' }),
  ];
  const history = projects.map((p, i) => row('h' + i, { projectId: p.id, action: 'create', changes: [], note: 'Project dibuat (data contoh)', byEmail: 'demo' }));

  await store.bulkAdd('members', members);
  await store.bulkAdd('clients', clients);
  await store.bulkAdd('projects', projects);
  await store.bulkAdd('history', history);
  await store.bulkAdd('activities', activities);
}
