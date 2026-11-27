/**
 * Halaman Login (Supabase Auth).
 * Akun dibuat admin di dashboard Supabase → Authentication → Users.
 */
import { esc } from '../service/ui.service.js';
import * as auth from '../service/auth.service.js';
import { navigate } from '../service/router.service.js';

const ERRORS = {
  'Invalid login credentials': 'Email atau password salah',
  'Email not confirmed': 'Email belum dikonfirmasi',
};

export default {
  path: '/login',
  title: 'Login',
  autoRefresh: false,
  render(el) {
    if (!auth.needsLogin()) return navigate('/');
    el.innerHTML = `
      <div class="login">
        <form class="card login__card" data-login autocomplete="on">
          <div class="login__brand">
            <img src="style/assets/icon.svg" alt="" width="56" height="56" />
            <div>
              <h1>Project Manager</h1>
              <p class="muted">Workload, project & activity tim dalam satu tempat</p>
            </div>
          </div>
          <label class="field">
            <span>Email</span>
            <input class="input" type="email" name="email" autocomplete="username" required placeholder="nama@perusahaan.com" />
          </label>
          <label class="field">
            <span>Password</span>
            <input class="input" type="password" name="password" autocomplete="current-password" required placeholder="••••••••" />
          </label>
          <p class="alert alert--error hidden" data-error role="alert"></p>
          <button class="btn btn--primary btn--block" type="submit" data-submit>Masuk</button>
          <p class="muted small center">Belum punya akun? Hubungi admin untuk dibuatkan.</p>
        </form>
      </div>`;

    const form = el.querySelector('[data-login]');
    const errorEl = el.querySelector('[data-error]');
    const btn = el.querySelector('[data-submit]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      btn.disabled = true;
      btn.textContent = 'Memuat data…';
      errorEl.classList.add('hidden');
      try {
        await auth.login(form.email.value, form.password.value);
        navigate('/');
      } catch (err) {
        const msg = ERRORS[err?.message] || (navigator.onLine ? err?.message || 'Gagal masuk' : 'Tidak ada koneksi internet');
        errorEl.innerHTML = `⚠️ ${esc(msg)}`;
        errorEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Masuk';
      }
    });
  },
};
