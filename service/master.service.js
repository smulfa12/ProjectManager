/**
 * Master Service — data parameter yang bisa diubah admin di menu Setting:
 * tipe tiket, status project, modul, tim, biaya internal per mandays,
 * dan konfigurasi reminder email. Disimpan di tabel pm_settings (tanpa SQL tambahan).
 */
import * as store from './store.service.js';

export const DEFAULTS = {
  'pm.types': ['Change Request', 'Incident', 'Preventive Maintenance', 'Project', 'Enhancement', 'Support'],
  'pm.statuses': [
    { name: 'Open', tone: 'gray', closed: false },
    { name: 'On Progress', tone: 'blue', closed: false },
    { name: 'UAT', tone: 'purple', closed: false },
    { name: 'Pending', tone: 'amber', closed: false },
    { name: 'Done', tone: 'green', closed: true },
    { name: 'Cancel', tone: 'red', closed: true },
  ],
  'pm.modules': ['Core Banking', 'Mobile Banking', 'Internet Banking', 'Payment Gateway', 'Reporting', 'Middleware'],
  'pm.teams': ['Developer', 'QA', 'Business Analyst', 'Support'],
  'pm.frequencies': ['Bulanan', 'Triwulan', 'Semester', 'Tahunan'],
  'pm.finance': { costPerMandays: 1500000, codePrefix: 'PRJ' },
  'pm.reminder': { enabled: true, time: '07:30', cc: '', appUrl: '' },
};

export const get = (key) => store.setting(key, DEFAULTS[key]);
export const save = (key, value) => store.saveSetting(key, value);

export const types = () => get('pm.types');
export const statuses = () => get('pm.statuses');
export const statusNames = () => statuses().map((s) => s.name);
export const modules = () => get('pm.modules');
export const teams = () => get('pm.teams');
export const frequencies = () => get('pm.frequencies');
export const finance = () => ({ ...DEFAULTS['pm.finance'], ...get('pm.finance') });
export const reminder = () => ({ ...DEFAULTS['pm.reminder'], ...get('pm.reminder') });

export const statusOf = (name) => statuses().find((s) => s.name === name) || { name: name || '-', tone: 'gray', closed: false };
export const isClosed = (name) => statusOf(name).closed;

export const COST_TYPES = ['Cost', 'Free Mandays'];

export const ROLES = [
  { key: 'admin', label: 'Admin' },
  { key: 'pm', label: 'Project Manager' },
  { key: 'member', label: 'Member' },
];

export const ACTIVITY_STATUS = [
  { key: 'todo', label: 'To Do', tone: 'gray' },
  { key: 'progress', label: 'In Progress', tone: 'blue' },
  { key: 'review', label: 'Review', tone: 'purple' },
  { key: 'done', label: 'Done', tone: 'green' },
];
export const activityStatus = (k) => ACTIVITY_STATUS.find((s) => s.key === k) || ACTIVITY_STATUS[0];

export const PRIORITIES = [
  { key: 'high', label: 'High', tone: 'red' },
  { key: 'medium', label: 'Medium', tone: 'amber' },
  { key: 'low', label: 'Low', tone: 'gray' },
];
export const priorityOf = (k) => PRIORITIES.find((p) => p.key === k) || PRIORITIES[1];

export const TONES = ['gray', 'blue', 'green', 'amber', 'red', 'purple', 'teal'];
