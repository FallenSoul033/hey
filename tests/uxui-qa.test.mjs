import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/app-shell.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const publicStyles = await readFile(new URL('../public/public-site.css', import.meta.url), 'utf8');

const contrast = (a, b) => {
  const norm = h => {
    let x = h.replace('#', '');
    if (x.length === 3) x = [...x].map(c => c + c).join('');
    return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16) / 255);
  };
  const lum = rgb => rgb.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const [l1, l2] = [lum(norm(a)), lum(norm(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

test('mobile CRM has accessible quick navigation and dismissible sidebar', () => {
  assert.match(html, /id="mobile-bottom-nav"/);
  assert.match(html, /id="sidebar-backdrop"/);
  assert.match(html, /aria-controls="sidebar" aria-expanded="false"/);
  assert.match(app, /function setSidebarOpen\(open\)/);
  assert.match(app, /data-more/);
  assert.match(styles, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
});

test('core small-text palette reaches WCAG AA normal-text contrast on white', () => {
  assert.ok(contrast('#647887', '#ffffff') >= 4.5);
  assert.ok(contrast('#087ea4', '#ffffff') >= 4.5);
  assert.ok(contrast('#617887', '#ffffff') >= 4.5);
  assert.match(publicStyles, /public-footer p\{[^}]*color:var\(--public-muted\)/);
});

test('public form and actions expose usable states and readable labels', () => {
  assert.match(publicStyles, /public-order-form label\{[^}]*font-size:13px/);
  assert.match(publicStyles, /public-primary:disabled/);
  assert.match(publicStyles, /public-primary:active/);
});

test('public site remains available when the external Supabase SDK CDN fails', () => {
  assert.match(app, /catch \(error\) \{\s*renderPublicCatalogue\(\);/);
  assert.match(app, /if \(decision\.screen === 'public'\) \{\s*showOnly\('public'\)/);
});

test('registration copy makes invite-only access clear', () => {
  assert.match(html, /Создать аккаунт по приглашению/);
  assert.match(app, /Регистрация доступна только по действующей ссылке-приглашению владельца IceFresh/);
});


test('mobile public header prioritises customer order action over staff login', () => {
  assert.match(html, /class="public-mobile-order"[^>]*data-scroll="order"/);
  assert.match(publicStyles, /\.public-header>\.staff-login\{display:none\}/);
  assert.match(publicStyles, /\.public-mobile-order\{display:inline-flex/);
});

test('mobile global search occupies its own full-width row', () => {
  assert.match(styles, /\.global-search\{order:3;flex:0 0 100%;width:100%;max-width:none\}/);
});
