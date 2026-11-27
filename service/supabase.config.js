/**
 * Konfigurasi Supabase — project "ProjectManager_"
 * Isi dari Supabase: Project Settings → API (atau Data API).
 *  - SUPABASE_URL      : "Project URL", cth. https://abcdefgh.supabase.co
 *  - SUPABASE_ANON_KEY : kunci "anon public" / "publishable"
 *
 * Kunci anon aman dipublikasikan karena data dilindungi login + Row Level Security.
 * JANGAN menaruh kunci "service_role" / "secret" di sini.
 *
 * Kalau dikosongkan, aplikasi berjalan dalam "mode lokal" (data di browser + data contoh).
 */
export const SUPABASE_URL = 'https://hinrjtjuatmmojqowfgr.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_LOk333-LQgIkFfUv06qpFQ_DVx8fdYp';
