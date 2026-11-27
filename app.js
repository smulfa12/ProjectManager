/**
 * ============================================================
 *  Project Manager — Main App
 *  File ini HANYA mendaftarkan & memanggil modul menu.
 *  Logika data ada di /service, tampilan menu ada di /program,
 *  dan desain ada di /style.
 * ============================================================
 */
import { createRouter } from './service/router.service.js';
import { initAuth, needsLogin } from './service/auth.service.js';
import { isUserBusy } from './service/ui.service.js';
import { setupShell, highlightNav, canOpen } from './program/shell.js';

// Login
import login from './program/login.js';
// 1. Dashboard Workload
import dashboard from './program/dashboard/dashboard.js';
// 2. Inquiry Project
import inquiry from './program/inquiry/inquiry.js';
// 3. List Project (Data Project, Timeline, Member Assignment, History)
import projectList from './program/project/project-list.js';
import projectDetail from './program/project/project-detail.js';
// Weekly Meeting (isi history cepat)
import meeting from './program/meeting/meeting.js';
// 4. List Activity Member (Gantt & Kanban)
import activityBoard from './program/activity/activity-board.js';
// 5. Monitoring Client (price & free mandays)
import clientMonitoring from './program/client/client-monitoring.js';
import clientDetail from './program/client/client-detail.js';
// Setting SLA per client (PRL)
import slaSetting from './program/sla/sla-setting.js';
// History Trend (grafik close per tahun)
import trend from './program/trend/trend.js';
// Laporan Excel
import report from './program/report/report.js';
// 6. Reminder email
import reminder from './program/reminder/reminder.js';
// 7. Setting
import settings from './program/settings/settings.js';

const MODULES = [login, dashboard, inquiry, projectList, projectDetail, meeting, activityBoard, clientMonitoring, clientDetail, slaSetting, trend, report, reminder, settings];

setupShell();

const router = createRouter({
  outlet: document.getElementById('app'),
  onNavigate: highlightNav,
  guard: (path) => {
    if (needsLogin()) return path === '/login' ? null : '/login';
    if (path === '/login') return '/';
    return canOpen(path) ? null : '/';
  },
});
MODULES.forEach((m) => router.register(m));

// Muat sesi & data (Supabase / lokal) lalu tampilkan halaman pertama
try {
  await initAuth({ onRemoteChange: () => router.refreshInBackground(isUserBusy) });
} catch (err) {
  console.error('Gagal memuat data', err);
}
document.body.classList.remove('booting');
router.start();
