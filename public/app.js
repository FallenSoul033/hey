/* global IceCore, IceRoutes */
const C = IceCore;
const R = IceRoutes;
const SDK_VERSION = '2.111.0';
const APP_VERSION = '12.0.0-rc.1.6';
const PRODUCT_IMAGE_BUCKET = 'product-images';
const BUILT_IN_PRODUCT_PHOTOS = {
  cup250: '/assets/products/cup-250-premium-1600.webp',
  bag1: '/assets/products/bag-1kg-premium-1600.webp',
  bag2: '/assets/products/bag-2kg-premium-1600.webp',
  '35e74838-68cb-4fb7-9e93-7e30675c48d8': '/assets/products/horeca-5kg-premium-1600.webp'
};
const PRODUCT_IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);
const $ = selector => document.querySelector(selector);

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localDateTimeValue(date = new Date()) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${localDateKey(date)}T${hours}:${minutes}`;
}

function emptyData() {
  return {
    orders: [], clients: [], production: [], employees: [], accruals: [],
    requests: [], products: [], schedule: [], members: [], invites: [],
    inventoryLedger: [], inventorySummary: [], financialLedger: [], financeSummary: null, productSalesSummary: [], operationEvents: [], notificationEvents: []
  };
}

let supabase = null;
let session = null;
let profile = null;
let organization = null;
let manager = false;
let owner = false;
let section = 'dashboard';
let authMode = 'signin';
let realtime = null;
let refreshTimer = null;
let refreshInFlight = false;
let refreshQueued = false;
let appLoaded = false;
let hydration = null;
let hydratingUserId = null;
let hydratedUserId = null;
let editingRecord = null;
let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let publicProducts = [];
let data = emptyData();
let aiMessages = [];
let aiBusy = false;
let aiError = '';
let waitingServiceWorker = null;
let serviceWorkerReloading = false;
let wasOffline = !navigator.onLine;

const INTEGRATION_DETAILS = Object.freeze({
  provider: 'AI Provider Gateway',
  endpoint: 'https://api.openai.com/v1',
  model: 'OpenAI: gpt-5.6-luna (по умолчанию)',
  keyName: 'IceFresh',
  organizationId: 'org-9VpK6WMwUWINBhfnGfTABkAQ',
  projectId: 'proj_4sNROtcw6P88L5I7HK7vwwnv'
});

const navAll = [
  ['dashboard', '⌂', 'Обзор'],
  ['calendar', '▣', 'Календарь'],
  ['requests', '✦', 'Заявки сайта'],
  ['orders', '▤', 'Заказы'],
  ['clients', '♙', 'Клиенты'],
  ['production', '❄', 'Производство'],
  ['products', '◇', 'Товары'],
  ['employees', '♧', 'Сотрудники'],
  ['accruals', '₸', 'Начисления'],
  ['warehouse', '▦', 'Склад'],
  ['analytics', '↗', 'Аналитика'],
  ['operations', '☷', 'Журнал операций'],
  ['ai', '◎', 'AI‑ассистент'],
  ['integrations', '⛓', 'Интеграции']
];

const titles = {
  dashboard: ['Обзор', 'Панель управления'],
  calendar: ['Планирование', 'Календарь отгрузок и обязательств'],
  requests: ['Продажи', 'Заявки с сайта'],
  orders: ['Продажи', 'Заказы'],
  clients: ['CRM', 'Клиенты'],
  production: ['Операции', 'Производство'],
  products: ['Управление', 'Товары и фотографии'],
  employees: ['Команда', 'Сотрудники и доступ'],
  accruals: ['Оплата труда', 'Начисления'],
  warehouse: ['Остатки', 'Склад'],
  analytics: ['Показатели', 'Аналитика'],
  operations: ['Контроль', 'Журнал операций и уведомлений'],
  ai: ['Помощник руководителя', 'AI‑ассистент IceFresh'],
  integrations: ['Настройки владельца', 'Интеграции']
};

const ADD_LABELS = {
  orders: '＋ Заказ',
  clients: '＋ Клиент',
  production: '＋ Производство',
  products: '＋ Товар',
  employees: '＋ Сотрудник',
  accruals: '＋ Начисление',
  calendar: '＋ Событие'
};

const roleLabels = { owner: 'Владелец', admin: 'Администратор', staff: 'Сотрудник', pending: 'Ожидает подключения' };
const typeIcons = { shipment: '🚚', commitment: '✓', production: '❄', other: '•' };

const toast = text => {
  const element = $('#toast');
  element.textContent = text;
  element.classList.add('show');
  setTimeout(() => element.classList.remove('show'), 2800);
};

const showMessage = (selector, text, error = false) => {
  const element = $(selector);
  element.textContent = text;
  element.classList.toggle('error', error);
};

const setSync = (text, state = '') => {
  const element = $('#sync-state');
  element.textContent = text;
  element.className = `sync-state ${state}`;
};

const friendlyError = error => {
  const message = error?.message || String(error || '');
  if (/invalid login/i.test(message)) return 'Неверный email или пароль.';
  if (/email not confirmed/i.test(message)) return 'Подтвердите email по ссылке в письме.';
  if (/already registered/i.test(message)) return 'Такой email уже зарегистрирован.';
  if (/invite is invalid/i.test(message)) return 'Код приглашения неверен или истёк.';
  if (/owner access required/i.test(message)) return 'Это действие доступно только владельцу.';
  if (/member not found/i.test(message)) return 'Сотрудник не найден.';
  if (/website request already processed/i.test(message)) return 'Эта заявка уже обработана.';
  if (/website request not found/i.test(message)) return 'Заявка не найдена или недоступна.';
  if (/active product not found/i.test(message)) return 'Товар отключён или больше недоступен.';
  if (/insufficient stock/i.test(message)) return 'Недостаточно свободного остатка. Сначала добавьте производство или уменьшите заказ.';
  if (/paid amount cannot be decreased/i.test(message)) return 'Полученную оплату нельзя уменьшать редактированием заказа. Используйте отдельную операцию возврата.';
  if (/refund exceeds received payments/i.test(message)) return 'Сумма возврата превышает фактически полученную оплату.';
  if (/shipped order items are immutable|shipped order cannot return/i.test(message)) return 'После начала отгрузки состав заказа нельзя переписывать. Используйте возврат или корректирующую операцию.';
  if (/would make stock negative|reserved stock would become negative|cannot be reduced/i.test(message)) return 'Операция сделала бы остаток отрицательным. Проверьте связанные заказы и производство.';
  if (/order changed since editor was opened/i.test(message)) return 'Заказ изменился после открытия формы. Обновите данные и повторите изменение.';
  if (/saved order verification failed/i.test(message)) return 'Заказ сохранён, но контрольная сверка не прошла. Обновите список и проверьте состав.';
  if (/idempotency key reused/i.test(message)) return 'Форма изменилась после отправки. Закройте её и повторите операцию.';
  if (/active employee not found/i.test(message)) return 'Сотрудник не найден или переведён в архив.';
  if (/manager access required/i.test(message)) return 'Действие доступно владельцу или администратору.';
  if (/ledger entries are immutable/i.test(message)) return 'Записи журнала нельзя переписать. Создайте корректирующую операцию.';
  if (/duplicate key|unique constraint/i.test(message)) return 'Такая запись уже существует.';
  if (/row-level security|permission denied/i.test(message)) return 'У вас нет прав для этого действия.';
  return message || 'Не удалось выполнить действие.';
};

function showFatalError(error) {
  const message = error?.message || String(error || '');
  if (/ResizeObserver loop/i.test(message)) return;
  console.error('IceFresh runtime error', error);
  $('#fatal-error').hidden = false;
}

function showPwaUpdate(worker) {
  waitingServiceWorker = worker;
  $('#pwa-update').hidden = false;
}

async function setupPwa() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (serviceWorkerReloading) return;
    serviceWorkerReloading = true;
    location.reload();
  });
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    if (registration.waiting && navigator.serviceWorker.controller) showPwaUpdate(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) showPwaUpdate(installing);
      });
    });
  } catch (error) {
    console.warn('IceFresh PWA registration failed', error);
  }
}

function updateNetworkState() {
  const offline = !navigator.onLine;
  $('#network-banner').hidden = !offline;
  if (offline && document.body.classList.contains('app-ready')) setSync('Нет сети', 'bad');
  if (!offline && wasOffline) {
    toast('Соединение восстановлено');
    if (document.body.classList.contains('app-ready')) setSync('Соединение восстановлено', 'ok');
  }
  wasOffline = offline;
}

async function loadPublicVersion() {
  try {
    const response = await fetch('/version.json', { cache: 'no-store' });
    const version = response.ok ? await response.json() : null;
    $('#app-version').textContent = `Версия ${version?.version || APP_VERSION}`;
  } catch {
    $('#app-version').textContent = `Версия ${APP_VERSION}`;
  }
}

function normalizeProduct(product) {
  return {
    id: product.id,
    name: product.name,
    description: product.description || '',
    weight: product.weight_label || product.weight || '',
    price: Number(product.default_price ?? product.price ?? 0),
    minStock: Number(product.min_stock ?? product.minStock ?? 0),
    unit: product.unit || 'шт.',
    photoPath: product.photo_path || null,
    active: product.active !== false,
    publicVisible: product.public_visible !== false,
    sortOrder: Number(product.sort_order || 0),
    createdBy: product.created_by || null
  };
}

function catalogue() {
  return data.products.length ? data.products : C.PRODUCTS.map(normalizeProduct);
}

function activeProducts() {
  return catalogue().filter(product => product.active);
}

function prod(productId) {
  return catalogue().find(product => product.id === productId)?.name
    || publicProducts.find(product => product.id === productId)?.name
    || productId;
}

function orderItemsSummary(order) {
  const items = order?.items?.length ? order.items : [{ product: order?.product, qty: order?.qty, price: order?.price }];
  return items.map(item => `${prod(item.product)} × ${item.qty}`).join(', ');
}

function builtInProductPhoto(product) {
  const direct = BUILT_IN_PRODUCT_PHOTOS[product?.id];
  if (direct) return direct;
  const label = `${product?.name || ''} ${product?.weight || ''}`;
  if (/HoReCa|5\s*кг/i.test(label)) return '/assets/products/horeca-5kg-premium-1600.webp';
  return '';
}

function isPackagedProduct(product) {
  return ['cup250', 'bag1', 'bag2'].includes(product?.id);
}

function productPhotoUrl(product) {
  const builtIn = builtInProductPhoto(product);
  if (!product?.photoPath) return builtIn;
  if (/^(?:https?:)?\/\//i.test(product.photoPath) || product.photoPath.startsWith('/') || product.photoPath.startsWith('assets/')) return product.photoPath;
  if (!supabase) return builtIn;
  return supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(product.photoPath).data.publicUrl || builtIn;
}

function updatePublicEntry() {
  const ready = Boolean(session && profile?.active && profile.organization_id && profile.role !== 'pending');
  document.querySelectorAll('.staff-login').forEach(link => {
    link.textContent = ready ? 'Рабочая панель' : 'Вход для сотрудников';
    link.href = ready ? R.pathFor('dashboard') : R.pathFor('login');
  });
}

function updateRobots(target) {
  const publicScreen = target === 'public';
  const robots = $('#robots-meta');
  if (robots) robots.content = publicScreen ? 'index,follow' : 'noindex,nofollow';
  document.documentElement.dataset.screen = target;
}

function showOnly(target) {
  $('#public-site').hidden = target !== 'public';
  $('#auth-screen').hidden = target !== 'auth';
  $('#onboarding').hidden = target !== 'onboarding';
  document.body.classList.toggle('app-ready', target === 'app');
  document.body.classList.toggle('public-ready', target === 'public');
  $('#global-search-results').hidden = true;
  $('#global-search').setAttribute('aria-expanded', 'false');
  updateRobots(target);
}

function route() {
  return R.parseLocation(location.pathname, location.hash);
}

function replaceRoute(next) {
  history.replaceState(null, '', R.pathFor(next));
}

function go(next) {
  const path = R.pathFor(next);
  if (location.pathname === path && !location.hash) applyRoute();
  else {
    history.pushState(null, '', path);
    applyRoute();
  }
}

function captureInviteToken() {
  const legacyQuery = location.hash.split('?')[1] || '';
  const token = new URLSearchParams(location.search).get('invite')
    || new URLSearchParams(legacyQuery).get('invite')
    || '';
  if (/^[0-9a-f-]{36}$/i.test(token)) sessionStorage.setItem('icefresh-invite', token);
  const saved = sessionStorage.getItem('icefresh-invite') || '';
  const field = $('#join-org [name=invite_token]');
  if (field && saved) field.value = saved;
}

function setAuthMode(next) {
  const wanted = next === 'register' ? 'signup' : 'signin';
  const changed = authMode !== wanted;
  authMode = wanted;
  const signup = authMode === 'signup';
  $('#auth-copy').textContent = signup
    ? 'Регистрация доступна только по действующей ссылке-приглашению владельца IceFresh.'
    : 'Войдите, чтобы работать с общей базой компании.';
  $('#auth-mode').textContent = signup ? 'У меня уже есть аккаунт' : 'Создать аккаунт по приглашению';
  $('#auth-form button').textContent = signup ? 'Зарегистрироваться' : 'Войти';
  $('#auth-form [name=full_name]').parentElement.hidden = !signup;
  $('#auth-form [name=full_name]').required = signup;
  $('#auth-form [name=password]').autocomplete = signup ? 'new-password' : 'current-password';
  if (changed) showMessage('#auth-message', '');
}

function access() {
  return {
    authenticated: Boolean(session),
    active: profile ? profile.active : Boolean(session),
    onboarded: Boolean(profile?.organization_id && profile.role !== 'pending'),
    role: profile?.role || null
  };
}

function applyRoute() {
  captureInviteToken();
  updatePublicEntry();
  const requested = route();
  const decision = R.resolve(requested, access());
  const expectedPath = R.pathFor(decision.route);
  if (decision.route !== requested || location.hash.startsWith('#/') || location.pathname !== expectedPath) {
    replaceRoute(decision.route);
  }
  if (decision.screen === 'public') {
    showOnly('public');
    renderPublicCatalogue();
    return;
  }
  if (decision.screen === 'auth') {
    setAuthMode(decision.route);
    showOnly('auth');
    return;
  }
  if (decision.screen === 'onboarding') {
    showOnly('onboarding');
    return;
  }
  if (!appLoaded) return;
  section = decision.route;
  showOnly('app');
  render();
}

function resetIdentity() {
  stopRealtime();
  session = null;
  profile = null;
  organization = null;
  manager = false;
  owner = false;
  appLoaded = false;
  hydratedUserId = null;
  hydratingUserId = null;
  data = emptyData();
}

async function init() {
  const startPwa = () => setupPwa();
  if ('requestIdleCallback' in window) window.requestIdleCallback(startPwa, { timeout: 2500 });
  else setTimeout(startPwa, 1200);
  updateNetworkState();
  loadPublicVersion();
  const logoUrl = '/assets/logo.webp';
  $('#logo').src = $('#auth-logo').src = document.querySelector('.onboarding-logo').src = logoUrl;
  document.querySelectorAll('.public-logo').forEach(element => { element.src = logoUrl; });
  $('#public-order-form [name=started_at]').value = String(Date.now());
  $('#auth-form [name=full_name]').parentElement.hidden = true;
  $('#setup-warning').hidden = true;
  $('#setup-warning').style.display = 'none';
  $('#auth-form').querySelectorAll('input,button').forEach(element => { element.disabled = false; });
  captureInviteToken();

  const config = window.ICEFRESH_CONFIG || {};
  if (!/^https:\/\/.+\.supabase\.co$/.test(config.supabaseUrl || '') || !(/^(sb_publishable_|eyJ)/.test(config.supabasePublishableKey || ''))) {
    $('#setup-warning').hidden = false;
    $('#setup-warning').style.display = 'grid';
    $('#auth-form').querySelectorAll('input,button').forEach(element => { element.disabled = true; });
    applyRoute();
    return;
  }

  try {
    const { createClient } = await import(`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${SDK_VERSION}/+esm`);
    supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    await loadPublicCatalogue();
    supabase.auth.onAuthStateChange((event, next) => {
      session = next;
      if (!next) {
        resetIdentity();
        if (route() !== 'home') replaceRoute('login');
        setTimeout(applyRoute, 0);
        return;
      }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') setTimeout(() => enter(next), 0);
    });
    const { data: { session: existing }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (existing) {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user || user.id !== existing.user.id) {
        await supabase.auth.signOut({ scope: 'local' });
        resetIdentity();
        replaceRoute('login');
        applyRoute();
      } else await enter({ ...existing, user });
    } else applyRoute();
  } catch (error) {
    renderPublicCatalogue();
    const decision = R.resolve(route(), access());
    if (decision.screen === 'public') {
      showOnly('public');
      return;
    }
    showMessage('#auth-message', `Не удалось подключиться: ${friendlyError(error)}`, true);
    showOnly('auth');
  }
}

async function loadPublicCatalogue() {
  if (!supabase) return;
  const { data: rows, error } = await supabase
    .from('products')
    .select('id,name,description,weight_label,default_price,unit,photo_path,active,public_visible,sort_order')
    .eq('active', true)
    .eq('public_visible', true)
    .order('sort_order')
    .order('name');
  if (!error && rows?.length) publicProducts = rows.map(normalizeProduct);
  renderPublicCatalogue();
}

function renderPublicCatalogue() {
  const products = publicProducts.length ? publicProducts : C.PRODUCTS.map(normalizeProduct);
  const grid = $('#public-catalog');
  const select = $('#public-product-select');
  if (!grid || !select) return;
  $('#public-product-count').textContent = String(products.length);
  grid.innerHTML = products.map((product, index) => {
    const photo = productPhotoUrl(product);
    const visual = photo
      ? `<img class="public-product-photo ${isPackagedProduct(product) ? 'product-photo--pack' : 'product-photo--scene'}" src="${C.esc(photo)}" alt="${C.esc(product.name)}" loading="lazy" decoding="async">`
      : `<div class="product-art ice-product-art"><span>❄</span><strong>${C.esc(product.weight || 'IceFresh')}</strong></div>`;
    return `<article class="catalog-card ${index === 0 ? 'featured' : ''}"><span class="catalog-label">${index === 0 ? 'Популярный выбор' : 'IceFresh'}</span>${visual}<h3>${C.esc(product.name)}</h3><div class="catalog-price"><b>${C.esc(product.weight || product.unit)}</b><strong>${C.money(product.price)}</strong></div><p>${C.esc(product.description || 'Чистый лёд IceFresh в удобной упаковке.')}</p><button type="button" data-product="${C.esc(product.id)}">Выбрать</button></article>`;
  }).join('');
  const previous = select.value;
  select.innerHTML = products.map(product => `<option value="${C.esc(product.id)}">${C.esc(product.name)}</option>`).join('');
  if (products.some(product => product.id === previous)) select.value = previous;
}

async function enter(nextSession, force = false) {
  const userId = nextSession?.user?.id;
  if (!userId) return;
  session = nextSession;
  if (!force && hydration && hydratingUserId === userId) return hydration;
  if (!force && hydratedUserId === userId && profile) {
    applyRoute();
    return;
  }
  hydratingUserId = userId;
  hydration = (async () => {
    setSync('Синхронизация…');
    const { data: currentProfile, error } = await supabase
      .from('profiles')
      .select('id,organization_id,full_name,role,active')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      showMessage('#auth-message', friendlyError(error), true);
      showOnly('auth');
      return;
    }
    profile = currentProfile;
    hydratedUserId = userId;
    if (!profile || !profile.organization_id || profile.role === 'pending') {
      appLoaded = false;
      stopRealtime();
      replaceRoute('onboarding');
      applyRoute();
      return;
    }
    if (!profile.active) {
      await supabase.auth.signOut();
      showMessage('#auth-message', 'Ваш доступ отключён владельцем.', true);
      return;
    }
    manager = ['owner', 'admin'].includes(profile.role);
    owner = profile.role === 'owner';
    buildNav();
    appLoaded = await loadAll();
    if (!appLoaded) return;
    subscribe();
    applyRoute();
  })();
  try {
    return await hydration;
  } finally {
    if (hydratingUserId === userId) {
      hydration = null;
      hydratingUserId = null;
    }
  }
}

async function loadAll() {
  setSync('Синхронизация…');
  const emptyResult = Promise.resolve({ data: [], error: null });
  const ordersQuery = manager
    ? supabase.from('orders').select('*,order_items(id,product_id,quantity,unit_price)').order('order_date', { ascending: false }).order('created_at', { ascending: false }).limit(400)
    : supabase.rpc('list_orders_operational_rc', { p_limit: 400 });
  const results = await Promise.all([
    supabase.from('organizations').select('id,name').eq('id', profile.organization_id).single(),
    supabase.from('clients').select('*').order('created_at', { ascending: false }).limit(500),
    supabase.from('employees').select('*').order('active', { ascending: false }).order('full_name').limit(200),
    ordersQuery,
    supabase.from('production_entries').select('*').order('production_date', { ascending: false }).order('created_at', { ascending: false }).limit(500),
    supabase.from('website_requests').select('id,organization_id,customer_name,phone,customer_type,product_id,quantity,message,status,source,created_at,updated_at').order('created_at', { ascending: false }).limit(300),
    supabase.from('products').select('*').order('sort_order').order('name'),
    supabase.from('schedule_items').select('*').order('scheduled_at').limit(500),
    supabase.from('profiles').select('id,organization_id,full_name,role,active,created_at').eq('organization_id', profile.organization_id).order('created_at').limit(200),
    manager ? supabase.from('accruals').select('*').order('accrual_date', { ascending: false }).order('created_at', { ascending: false }).limit(500) : emptyResult,
    manager ? supabase.from('organization_invites').select('id,token,role,employee_id,expires_at,accepted_by,accepted_at,created_at').order('created_at', { ascending: false }).limit(200) : emptyResult,
    supabase.from('stock_ledger').select('id,product_id,source_type,source_id,movement_type,on_hand_delta,reserved_delta,description,occurred_at').order('occurred_at', { ascending: false }).limit(100),
    supabase.rpc('get_inventory_summary_rc'),
    manager ? supabase.from('financial_ledger').select('id,order_id,entry_type,amount,description,occurred_at').order('occurred_at', { ascending: false }).limit(100) : emptyResult,
    manager ? supabase.rpc('get_finance_summary_rc') : emptyResult,
    manager ? supabase.rpc('get_product_sales_summary_rc') : emptyResult,
    manager ? supabase.from('operation_events').select('id,severity,event_type,entity_type,entity_id,message,details,request_id,occurred_at').order('occurred_at', { ascending: false }).limit(200) : emptyResult,
    manager ? supabase.from('notification_events').select('id,channel,recipient,event_type,aggregate_type,aggregate_id,status,attempts,next_attempt_at,last_error,created_at,sent_at').order('created_at', { ascending: false }).limit(200) : emptyResult
  ]);
  const firstError = results.find(result => result.error)?.error;
  if (firstError) {
    setSync('Ошибка', 'bad');
    toast(friendlyError(firstError));
    return false;
  }

  organization = results[0].data;
  data.clients = results[1].data.map(row => ({ id: row.id, name: row.name, category: row.category, phone: row.phone }));
  data.employees = results[2].data.map(row => ({ id: row.id, profileId: row.profile_id, name: row.full_name, role: row.position, phone: row.phone, active: row.active }));
  data.orders = results[3].data.map(row => {
    const sourceItems = manager ? (row.order_items || []) : (row.items || []);
    const items = sourceItems.map(item => ({ id: item.id || null, product: item.product_id, qty: Number(item.quantity), price: manager ? Number(item.unit_price) : 0 }));
    const first = items[0] || { product: row.product_id || '', qty: Number(row.quantity || 0), price: manager ? Number(row.unit_price || 0) : 0 };
    return { id: row.id, orderNumber: row.order_number || '', externalOrderNumber: row.external_order_number || '', date: row.order_date, clientId: row.client_id, client: row.client_name, product: first.product, qty: first.qty, price: first.price, items, paid: manager ? Number(row.paid_amount || 0) : 0, status: row.status };
  });
  data.production = results[4].data.map(row => ({ id: row.id, date: row.production_date, product: row.product_id, qty: Number(row.quantity), employeeId: row.employee_id, employee: row.employee_name }));
  data.requests = results[5].data.map(row => ({ id: row.id, date: row.created_at, name: row.customer_name, phone: row.phone, type: row.customer_type, product: row.product_id, qty: Number(row.quantity), message: row.message, status: row.status, source: row.source }));
  data.products = results[6].data.map(normalizeProduct);
  data.schedule = results[7].data.map(row => ({ id: row.id, title: row.title, type: row.item_type, scheduledAt: row.scheduled_at, clientId: row.client_id, client: row.client_name, orderId: row.order_id, notes: row.notes, status: row.status }));
  data.members = results[8].data.map(row => ({ id: row.id, name: row.full_name, role: row.role, active: row.active, createdAt: row.created_at }));
  data.accruals = manager ? results[9].data.map(row => ({ id: row.id, date: row.accrual_date, employeeId: row.employee_id, employee: row.employee_name, description: row.description, qty: Number(row.quantity), rate: Number(row.rate), paid: row.paid })) : [];
  data.invites = manager ? results[10].data.map(row => ({ id: row.id, token: row.token, role: row.role, employeeId: row.employee_id, expiresAt: row.expires_at, acceptedBy: row.accepted_by, acceptedAt: row.accepted_at })) : [];
  data.inventoryLedger = results[11].data.map(row => ({ id: row.id, product: row.product_id, sourceType: row.source_type, sourceId: row.source_id, movementType: row.movement_type, onHandDelta: Number(row.on_hand_delta || 0), reservedDelta: Number(row.reserved_delta || 0), description: row.description, occurredAt: row.occurred_at }));
  data.inventorySummary = (results[12].data || []).map(row => ({ product: row.product_id, onHand: Number(row.on_hand || 0), reserved: Number(row.reserved || 0), available: Number(row.available || 0), shipped: Number(row.shipped || 0), made: Number(row.produced || 0), adjustments: Number(row.adjustments || 0) }));
  data.financialLedger = manager ? results[13].data.map(row => ({ id: row.id, orderId: row.order_id, type: row.entry_type, amount: Number(row.amount), description: row.description, occurredAt: row.occurred_at })) : [];
  data.financeSummary = manager ? (results[14].data?.[0] ? { sales: Number(results[14].data[0].sales || 0), paid: Number(results[14].data[0].paid || 0), debt: Number(results[14].data[0].debt || 0), refunded: Number(results[14].data[0].refunded || 0), credits: Number(results[14].data[0].credits || 0) } : { sales: 0, paid: 0, debt: 0, refunded: 0, credits: 0 }) : null;
  data.productSalesSummary = manager ? (results[15].data || []).map(row => ({ product: row.product_id, total: Number(row.total || 0) })) : [];
  data.operationEvents = manager ? results[16].data.map(row => ({ id: row.id, severity: row.severity, type: row.event_type, entityType: row.entity_type, entityId: row.entity_id, message: row.message, details: row.details || {}, requestId: row.request_id, occurredAt: row.occurred_at })) : [];
  data.notificationEvents = manager ? results[17].data.map(row => ({ id: row.id, channel: row.channel, recipient: row.recipient, type: row.event_type, aggregateType: row.aggregate_type, aggregateId: row.aggregate_id, status: row.status, attempts: row.attempts, nextAttemptAt: row.next_attempt_at, lastError: row.last_error, createdAt: row.created_at, sentAt: row.sent_at })) : [];

  document.querySelector('.brand small').textContent = organization.name;
  document.querySelector('.privacy').textContent = `● Онлайн · ${profile.full_name} · ${roleLabels[profile.role] || profile.role}`;
  buildNav();
  setSync('Синхронизировано', 'ok');
  return true;
}

async function subscribe() {
  stopRealtime();
  realtime = supabase.channel(`icefresh-${profile.organization_id}`);
  const commonTables = ['clients', 'employees', 'production_entries', 'stock_ledger', 'website_requests', 'products', 'schedule_items'];
  const roleTables = manager
    ? ['orders', 'order_items', 'accruals', 'organization_invites', 'financial_ledger', 'operation_events', 'notification_events']
    : ['order_change_signal'];
  for (const tableName of [...commonTables, ...roleTables]) {
    realtime.on('postgres_changes', { event: '*', schema: 'public', table: tableName, filter: `organization_id=eq.${profile.organization_id}` }, scheduleRefresh);
  }
  realtime.subscribe(status => setSync(status === 'SUBSCRIBED' ? 'Онлайн' : 'Подключение…', status === 'SUBSCRIBED' ? 'ok' : ''));
}

function stopRealtime() {
  if (realtime && supabase) supabase.removeChannel(realtime);
  realtime = null;
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    if (refreshInFlight) {
      refreshQueued = true;
      return;
    }
    refreshInFlight = true;
    try {
      do {
        refreshQueued = false;
        await loadAll();
      } while (refreshQueued);
      if (document.body.classList.contains('app-ready')) render();
    } finally {
      refreshInFlight = false;
    }
  }, 350);
}

function setSidebarOpen(open) {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = $('#sidebar-backdrop');
  const menu = $('#menu');
  sidebar.classList.toggle('open', Boolean(open));
  backdrop.hidden = !open;
  menu.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function buildNav() {
  const allowed = navAll.filter(item => {
    if (item[0] === 'integrations') return owner;
    return manager || !['products', 'employees', 'accruals', 'analytics', 'operations'].includes(item[0]);
  });
  const newCount = data.requests.filter(request => request.status === 'Новая').length;
  $('#nav').innerHTML = allowed.map(item => `<button data-section="${item[0]}"><span>${item[1]}</span>${item[2]}${item[0] === 'requests' && newCount ? ` <b class="nav-count">${newCount}</b>` : ''}</button>`).join('');
  const quickRoutes = ['dashboard', 'orders', 'production', 'warehouse'];
  const quick = quickRoutes.map(routeName => allowed.find(item => item[0] === routeName)).filter(Boolean);
  $('#mobile-bottom-nav').innerHTML = `${quick.map(item => `<button type="button" data-section="${item[0]}" aria-label="${item[2]}"><span aria-hidden="true">${item[1]}</span>${item[2]}</button>`).join('')}<button type="button" data-more aria-label="Открыть все разделы"><span aria-hidden="true">☰</span>Ещё</button>`;
}

function metrics() {
  const activeOrders = data.orders.filter(order => order.status !== 'Отменён');
  const summary = manager ? (data.financeSummary || { sales: 0, paid: 0, debt: 0, refunded: 0 }) : { sales: 0, paid: 0, debt: 0, refunded: 0 };
  const wage = data.accruals.reduce((sum, accrual) => sum + C.calcAccrual(accrual), 0);
  return { sales: rounded(summary.sales), paid: rounded(summary.paid), debt: rounded(summary.debt), wage, orders: activeOrders.length, refunded: rounded(summary.refunded) };
}

function cards() {
  const value = metrics();
  if (!manager) {
    const inventory = ledgerInventory();
    const low = inventory.filter(item => stockLevel(item) !== 'ok').length;
    return `<div class="metrics"><article><i>Заказы</i><b>${value.orders}</b><small>Активные заказы</small></article><article><i>Заявки сайта</i><b>${data.requests.filter(item => item.status === 'Новая').length}</b><small>Ожидают обработки</small></article><article><i>Склад</i><b>${low}</b><small>${low ? 'Позиций требуют внимания' : 'Критичных остатков нет'}</small></article><article><i>Статус</i><b class="online-big">Онлайн</b><small>Общая база обновляется</small></article></div>`;
  }
  return `<div class="metrics"><article><i>Реализовано</i><b>${C.money(value.sales)}</b><small>Только доставленные/выполненные заказы</small></article><article><i>Получено</i><b>${C.money(value.paid)}</b><small class="ok">Оплаты минус возвраты</small></article><article><i>Дебиторка</i><b>${C.money(value.debt)}</b><small class="warn">По признанной реализации</small></article><article><i>Начисления</i><b>${C.money(value.wage)}</b><small>За весь период</small></article></div>`;
}

const empty = (text, action = '', targetSection = section) => `<div class="empty"><span aria-hidden="true">◇</span><b>${C.esc(text)}</b>${action ? `<button type="button" class="ghost" data-empty-route="${C.esc(targetSection)}">${C.esc(action)}</button>` : ''}</div>`;
const badge = status => `<span class="badge ${['Выполнен', 'Выполнено', 'Оплачено'].includes(status) ? 'green' : ['Отменён', 'Отменено'].includes(status) ? 'red' : ''}">${C.esc(status)}</span>`;
const requestBadge = status => `<span class="badge ${status === 'Принята' ? 'green' : status === 'Закрыта' ? 'red' : ''}">${C.esc(status)}</span>`;
const dateTime = value => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

function table(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}">${empty('Записей пока нет', ADD_LABELS[section])}</td></tr>`}</tbody></table></div>`;
}

function globalSearchEntries() {
  const entries = [];
  const add = (routeName, type, title, subtitle, searchText) => entries.push({
    route: routeName,
    type,
    title: String(title || ''),
    subtitle: String(subtitle || ''),
    searchText: String(searchText || '').toLocaleLowerCase('ru-RU')
  });
  data.orders.forEach(order => add(
    'orders', 'Заказ', order.client || `Заказ ${order.id}`,
    `${orderItemsSummary(order)} · ${order.status}`,
    `${order.id} ${order.client} ${orderItemsSummary(order)} ${order.status}`
  ));
  data.clients.forEach(client => add(
    'clients', 'Клиент', client.name, `${client.category} · ${client.phone || 'телефон не указан'}`,
    `${client.id} ${client.name} ${client.category} ${client.phone}`
  ));
  data.requests.forEach(request => add(
    'requests', 'Заявка сайта', request.name, `${request.phone} · ${request.status}`,
    `${request.id} ${request.name} ${request.phone} ${prod(request.product)} ${request.status}`
  ));
  data.production.forEach(item => add(
    'production', 'Производство', prod(item.product), `${item.date} · ${item.qty} шт.`,
    `${item.id} ${item.date} ${prod(item.product)} ${item.employee}`
  ));
  catalogue().forEach(product => add(
    manager ? 'products' : 'warehouse', 'Товар', product.name, product.weight || product.unit,
    `${product.id} ${product.name} ${product.weight} ${product.description}`
  ));
  if (manager) data.employees.forEach(employee => add(
    'employees', 'Сотрудник', employee.name, `${employee.role} · ${employee.phone || 'телефон не указан'}`,
    `${employee.id} ${employee.name} ${employee.role} ${employee.phone}`
  ));
  return entries;
}

function renderGlobalSearch(query) {
  const input = $('#global-search');
  const panel = $('#global-search-results');
  const normalized = String(query || '').trim().toLocaleLowerCase('ru-RU');
  if (normalized.length < 2 || !appLoaded) {
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    panel.innerHTML = '';
    return;
  }
  const results = globalSearchEntries().filter(entry => entry.searchText.includes(normalized)).slice(0, 12);
  panel.innerHTML = results.length
    ? results.map(result => `<button type="button" data-search-route="${result.route}"><span>${C.esc(result.type)}</span><b>${C.esc(result.title)}</b><small>${C.esc(result.subtitle)}</small></button>`).join('')
    : `<div class="search-empty"><b>Ничего не найдено</b><span>Проверьте запрос или введите телефон, название либо номер записи.</span></div>`;
  panel.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function openScheduleItems() {
  const now = Date.now();
  return data.schedule
    .filter(item => new Date(item.scheduledAt).getTime() >= now - 86400000 && !['Выполнено', 'Отменено'].includes(item.status))
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
}

function scheduleCompact(item) {
  return `<button class="schedule-compact type-${item.type}" data-edit-schedule="${item.id}"><span>${typeIcons[item.type] || '•'}</span><span><b>${C.esc(item.title)}</b><small>${dateTime(item.scheduledAt)}${item.client ? ` · ${C.esc(item.client)}` : ''}</small></span>${badge(item.status)}</button>`;
}

function ledgerInventory() {
  const summaryByProduct = new Map(data.inventorySummary.map(item => [item.product, item]));
  return catalogue().map(product => {
    const summary = summaryByProduct.get(product.id);
    if (summary) return { ...product, made: rounded(summary.made), sold: rounded(summary.shipped), shipped: rounded(summary.shipped), adjustments: rounded(summary.adjustments), stock: rounded(summary.available), onHand: rounded(summary.onHand), reserved: rounded(summary.reserved), available: rounded(summary.available) };
    const movements = data.inventoryLedger.filter(item => item.product === product.id);
    const onHand = rounded(movements.reduce((sum, item) => sum + item.onHandDelta, 0));
    const reserved = rounded(movements.reduce((sum, item) => sum + item.reservedDelta, 0));
    const shipped = rounded(-movements.filter(item => item.movementType === 'shipment').reduce((sum, item) => sum + item.onHandDelta, 0));
    return { ...product, made: 0, sold: shipped, shipped, adjustments: 0, stock: rounded(onHand - reserved), onHand, reserved, available: rounded(onHand - reserved) };
  });
}

function stockLevel(item) {
  if (item.available < 0 || item.onHand < 0) return 'negative';
  if (item.minStock > 0 && item.available <= item.minStock) return 'low';
  return 'ok';
}

function stockNotice(item) {
  const level = stockLevel(item);
  if (level === 'negative') return 'Остаток отрицательный: проверьте физический склад, резерв и отгрузки.';
  if (level === 'low') return `Доступный остаток достиг минимума: ${item.minStock} ${item.unit}`;
  return '';
}

function dashboardView() {
  const inventory = ledgerInventory();
  const newRequests = data.requests.filter(request => request.status === 'Новая').length;
  const requestAlert = newRequests ? `<button class="request-alert" data-go="requests"><span><b>${newRequests} ${newRequests === 1 ? 'новая заявка' : 'новых заявок'} с сайта</b><span>Посетители IceFresh ожидают обратной связи.</span></span><strong>Открыть →</strong></button>` : '';
  const upcoming = openScheduleItems().slice(0, 5);
  const recentOrders = manager
    ? table(['Клиент', 'Товар', 'Сумма', 'Статус'], data.orders.slice(0, 5).map(order => `<tr><td><b>${C.esc(order.client)}</b></td><td>${C.esc(orderItemsSummary(order))}</td><td>${C.money(C.calcOrder(order).total)}</td><td>${badge(order.status)}</td></tr>`).join(''))
    : table(['Клиент', 'Товар', 'Статус'], data.orders.slice(0, 5).map(order => `<tr><td><b>${C.esc(order.client)}</b></td><td>${C.esc(orderItemsSummary(order))}</td><td>${badge(order.status)}</td></tr>`).join(''));
  return `${requestAlert}${cards()}<div class="grid2"><article class="panel"><div class="panel-head"><div><p class="eyebrow">Актуальные данные</p><h2>Последние заказы</h2></div><button class="link" data-go="orders">Все заказы →</button></div>${recentOrders}</article><article class="panel"><div class="panel-head"><div><p class="eyebrow">План</p><h2>Ближайшие отгрузки и обязательства</h2></div><button class="link" data-go="calendar">Календарь →</button></div><div class="upcoming-list">${upcoming.map(item => scheduleCompact(item)).join('') || empty('Ближайших событий нет', ADD_LABELS.calendar, 'calendar')}</div></article></div><article class="panel dashboard-stock"><div class="panel-head"><div><p class="eyebrow">Остатки</p><h2>Склад готовой продукции</h2></div><button class="link" data-go="warehouse">Подробнее →</button></div><div class="stocks">${inventory.map(item => `<div class="stock-row stock-${stockLevel(item)}"><span>${C.esc(item.name)}<small>${item.onHand} физически · ${item.reserved} в резерве · ${item.available} доступно${stockNotice(item) ? ` · ${C.esc(stockNotice(item))}` : ''}</small></span><b class="${stockLevel(item) !== 'ok' ? 'danger' : ''}">${item.available} ${C.esc(item.unit)}</b></div>`).join('')}</div></article>`;
}

function requestsView() {
  const fresh = data.requests.filter(request => request.status === 'Новая').length;
  const active = data.requests.filter(request => ['Новая', 'Связались', 'Принята'].includes(request.status)).length;
  return `<div class="metrics mini"><article><i>Новые</i><b>${fresh}</b><small>Нужно связаться</small></article><article><i>В работе</i><b>${active}</b><small>Открытые заявки</small></article><article><i>Всего</i><b>${data.requests.length}</b><small>За всё время</small></article></div><article class="panel">${table(['Дата', 'Клиент', 'Телефон', 'Тип', 'Продукция', 'Кол-во', 'Комментарий', 'Статус', 'Действия'], data.requests.map(request => `<tr><td>${dateTime(request.date)}</td><td><b>${C.esc(request.name)}</b></td><td>${C.esc(request.phone)}</td><td>${request.type === 'business' ? 'Бизнес' : 'Частный'}</td><td>${C.esc(prod(request.product))}</td><td>${request.qty}</td><td>${C.esc(request.message || '—')}</td><td>${requestBadge(request.status)}</td><td><div class="request-actions">${request.status === 'Новая' ? `<button data-request-id="${request.id}" data-request-status="Связались">Связались</button>` : ''}${request.status !== 'Принята' && request.status !== 'Закрыта' ? `<button class="request-accept" data-accept-request="${request.id}">Принять и создать заказ</button>` : ''}${request.status !== 'Закрыта' ? `<button data-request-id="${request.id}" data-request-status="Закрыта">Закрыть</button>` : `<button data-request-id="${request.id}" data-request-status="Новая">Вернуть</button>`}</div></td></tr>`).join(''))}</article><p class="note">Кнопка «Принять и создать заказ» создаёт или находит клиента, добавляет новый заказ по текущей цене и только затем меняет статус заявки.</p>`;
}

function ordersView() {
  const headers = manager
    ? ['№', 'Дата', 'Клиент', 'Состав заказа', 'Итого', 'Оплачено', 'Долг', 'Статус', '']
    : ['№', 'Дата', 'Клиент', 'Состав заказа', 'Статус', ''];
  const rows = data.orders.map(order => {
    const value = C.calcOrder(order);
    return manager
      ? `<tr><td><b>${C.esc(order.orderNumber || order.id.slice(0, 8))}</b>${order.externalOrderNumber ? `<small class="id">${C.esc(order.externalOrderNumber)}</small>` : ''}</td><td>${order.date}</td><td><b>${C.esc(order.client)}</b></td><td>${C.esc(orderItemsSummary(order))}</td><td>${C.money(value.total)}</td><td>${C.money(value.paid)}</td><td class="${value.debt ? 'danger' : ''}">${C.money(value.debt)}</td><td>${badge(order.status)}</td><td><button class="link table-action" data-edit-order="${order.id}">Изменить</button></td></tr>`
      : `<tr><td><b>${C.esc(order.orderNumber || order.id.slice(0, 8))}</b>${order.externalOrderNumber ? `<small class="id">${C.esc(order.externalOrderNumber)}</small>` : ''}</td><td>${order.date}</td><td><b>${C.esc(order.client)}</b></td><td>${C.esc(orderItemsSummary(order))}</td><td>${badge(order.status)}</td><td><button class="link table-action" data-edit-order="${order.id}">Изменить</button></td></tr>`;
  }).join('');
  return cards() + `<article class="panel">${table(headers, rows)}</article>`;
}

function clientsView() {
  const categories = ['Магазины', 'HoReCa', 'Частные клиенты', 'Оптовые клиенты'];
  const headers = manager ? ['Клиент', 'Категория', 'Телефон', 'Заказов', 'Выручка', ''] : ['Клиент', 'Категория', 'Телефон', 'Заказов', ''];
  const rows = data.clients.map(client => {
    const orders = data.orders.filter(order => order.clientId === client.id);
    const sum = manager ? orders.reduce((total, order) => total + C.calcOrder(order).total, 0) : 0;
    return manager
      ? `<tr><td><b>${C.esc(client.name)}</b></td><td>${badge(client.category)}</td><td>${C.esc(client.phone)}</td><td>${orders.length}</td><td>${C.money(sum)}</td><td><button class="link table-action" data-edit-client="${client.id}">Изменить</button></td></tr>`
      : `<tr><td><b>${C.esc(client.name)}</b></td><td>${badge(client.category)}</td><td>${C.esc(client.phone)}</td><td>${orders.length}</td><td><button class="link table-action" data-edit-client="${client.id}">Изменить</button></td></tr>`;
  }).join('');
  return `<div class="category-row">${categories.map(category => `<article><span>${category}</span><b>${data.clients.filter(client => client.category === category).length}</b></article>`).join('')}</div><article class="panel">${table(headers, rows)}</article>`;
}

function productionView() {
  return `<article class="panel">${table(['Дата', 'Продукция', 'Количество', 'Сотрудник', ''], data.production.map(item => `<tr><td>${item.date}</td><td><b>${C.esc(prod(item.product))}</b></td><td>${item.qty} шт.</td><td>${C.esc(item.employee)}</td><td><button class="link table-action" data-edit-production="${item.id}">Изменить</button></td></tr>`).join(''))}</article>`;
}

function productsView() {
  const products = catalogue();
  const activeCount = products.filter(product => product.active).length;
  const publicCount = products.filter(product => product.active && product.publicVisible).length;
  return `<div class="admin-intro"><div><span class="admin-icon">◇</span><div><h2>Каталог IceFresh</h2><p>Добавляйте товары, цены и фотографии. Отметка «Показывать клиентам» автоматически выводит товар на главную страницу.</p></div></div><div class="admin-stats"><span><b>${activeCount}</b> активных</span><span><b>${publicCount}</b> на сайте</span></div></div><div class="admin-product-grid">${products.map(product => {
    const photo = productPhotoUrl(product);
    return `<article class="admin-product-card ${product.active ? '' : 'is-inactive'}">${photo ? `<img src="${C.esc(photo)}" alt="${C.esc(product.name)}">` : `<div class="admin-product-placeholder">❄<small>${C.esc(product.weight || 'IceFresh')}</small></div>`}<div class="admin-product-body"><div class="card-statuses"><span class="status-pill ${product.active ? 'on' : 'off'}">${product.active ? 'Активен' : 'Отключён'}</span><span class="status-pill ${product.publicVisible ? 'public' : ''}">${product.publicVisible ? 'На сайте' : 'Только в CRM'}</span></div><h3>${C.esc(product.name)}</h3><p>${C.esc(product.description || 'Описание не добавлено')}</p><dl><div><dt>Формат</dt><dd>${C.esc(product.weight || '—')}</dd></div><div><dt>Цена по умолчанию</dt><dd>${C.money(product.price)}</dd></div><div><dt>Минимальный остаток</dt><dd>${product.minStock} ${C.esc(product.unit)}</dd></div><div><dt>Единица</dt><dd>${C.esc(product.unit)}</dd></div></dl><button class="ghost card-edit" data-edit-product="${product.id}">Изменить товар</button></div></article>`;
  }).join('') || empty('Добавьте первый товар', ADD_LABELS.products)}</div><p class="note">Отключённые товары остаются в истории заказов и склада, но их нельзя выбрать в новых операциях.</p>`;
}

function memberControls(member) {
  if (!owner || member.role === 'owner' || member.id === profile.id) {
    return `<span class="member-lock">${member.role === 'owner' ? 'Основной владелец' : member.active ? 'Доступ активен' : 'Доступ отключён'}</span>`;
  }
  return `<div class="member-controls" data-member-card="${member.id}"><label>Права<select data-member-role><option value="staff" ${member.role === 'staff' ? 'selected' : ''}>Сотрудник</option><option value="admin" ${member.role === 'admin' ? 'selected' : ''}>Администратор</option></select></label><label class="access-toggle"><input type="checkbox" data-member-active ${member.active ? 'checked' : ''}><span>Доступ</span></label></div>`;
}

function employeesView() {
  const activeInvites = data.invites.filter(invite => !invite.acceptedAt && new Date(invite.expiresAt) > new Date());
  const availableEmployees = data.employees.filter(employee => employee.active && !employee.profileId);
  return `<div class="admin-intro"><div><span class="admin-icon">♧</span><div><h2>Управление командой</h2><p>Сначала создайте карточку сотрудника. Если человеку нужен вход в CRM, выберите его ниже и отправьте готовую ссылку.</p></div></div></div><section class="admin-section"><div class="panel-head"><div><p class="eyebrow">Команда</p><h2>Карточки сотрудников</h2></div></div><div class="people">${data.employees.map(employee => `<article class="person ${employee.active ? '' : 'is-inactive'}"><div class="avatar">${C.esc(employee.name).slice(0, 1)}</div><div><h3>${C.esc(employee.name)}</h3><p>${C.esc(employee.role)}</p><small>${C.esc(employee.phone || 'Телефон не указан')} · ${employee.active ? 'Работает' : 'Неактивен'}</small></div><button class="ghost person-edit" data-edit-employee="${employee.id}">Изменить</button></article>`).join('') || empty('Добавьте первого сотрудника', ADD_LABELS.employees)}</div></section><section class="admin-section access-section"><div class="panel-head"><div><p class="eyebrow">Авторизация</p><h2>Доступ к системе</h2></div></div><div class="invite-builder"><label>Для кого<select id="invite-employee"><option value="">Новый сотрудник без карточки</option>${availableEmployees.map(employee => `<option value="${employee.id}">${C.esc(employee.name)}</option>`).join('')}</select></label><label>Уровень доступа<select id="invite-role"><option value="staff">Сотрудник</option><option value="admin">Администратор</option></select></label><button class="primary" id="invite">Создать ссылку для входа</button></div><p class="note compact">Сотрудник откроет ссылку, зарегистрируется и автоматически попадёт в вашу организацию. Код действует 7 дней и используется один раз.</p><div class="member-list">${data.members.map(member => `<article class="member-row ${member.active ? '' : 'is-inactive'}"><div class="avatar small">${C.esc(member.name || '?').slice(0, 1)}</div><div class="member-copy"><h3>${C.esc(member.name || 'Без имени')}</h3><p>${roleLabels[member.role] || C.esc(member.role)} · ${member.active ? 'активен' : 'доступ отключён'}</p></div>${memberControls(member)}</article>`).join('')}</div>${activeInvites.length ? `<div class="pending-invites"><h3>Ожидают подключения</h3>${activeInvites.map(invite => {
    const employee = data.employees.find(item => item.id === invite.employeeId);
    return `<article><span><b>${C.esc(employee?.name || roleLabels[invite.role] || 'Сотрудник')}</b><small>Действует до ${dateTime(invite.expiresAt)}</small></span><button class="ghost" data-copy-invite="${invite.token}">Копировать ссылку</button><button class="link danger" data-revoke-invite="${invite.id}">Отозвать</button></article>`;
  }).join('')}</div>` : ''}</section>`;
}

function accrualsView() {
  const total = data.accruals.reduce((sum, item) => sum + C.calcAccrual(item), 0);
  const paid = data.accruals.filter(item => item.paid).reduce((sum, item) => sum + C.calcAccrual(item), 0);
  return `<div class="metrics mini"><article><i>Всего начислено</i><b>${C.money(total)}</b></article><article><i>Выплачено</i><b>${C.money(paid)}</b></article><article><i>К выплате</i><b>${C.money(total - paid)}</b></article></div><article class="panel">${table(['Дата', 'Сотрудник', 'Основание', 'Объём', 'Ставка', 'Начислено', 'Статус'], data.accruals.map(item => `<tr><td>${item.date}</td><td><b>${C.esc(item.employee)}</b></td><td>${C.esc(item.description)}</td><td>${item.qty}</td><td>${C.money(item.rate)}</td><td>${C.money(C.calcAccrual(item))}</td><td>${badge(item.paid ? 'Оплачено' : 'К выплате')}</td></tr>`).join(''))}</article><p class="note">Начисление = объём выполненной работы × ставка. Отметка выплаты не меняет сумму начисления.</p>`;
}

function warehouseView() {
  const inventory = ledgerInventory();
  const adjustmentButton = owner ? '<button type="button" class="primary stock-adjust-button" data-stock-adjust>Корректировать остаток</button>' : '';
  const recent = data.inventoryLedger.slice(0, 12);
  return `<div class="warehouse-head"><div><p class="eyebrow">Append-only ledger</p><h2>Физический склад и резерв разделены</h2><p>Физический остаток меняется производством, отгрузкой, возвратом и корректировкой. Резерв заказа учитывается отдельно.</p></div>${adjustmentButton}</div><div class="product-cards">${inventory.map(item => `<article class="stock-card stock-${stockLevel(item)}"><div class="cube">❄</div><h3>${C.esc(item.name)}</h3><b class="stock-big ${stockLevel(item) !== 'ok' ? 'danger' : ''}">${item.available} <small>${C.esc(item.unit)} доступно</small></b><div class="stock-line"><span>Физически <b>${item.onHand}</b></span><span>В резерве <b>${item.reserved}</b></span><span>Отгружено <b>${item.shipped}</b></span><span>Минимум <b>${item.minStock || 0}</b></span></div>${stockNotice(item) ? `<p class="alert">${C.esc(stockNotice(item))}</p>` : ''}</article>`).join('')}</div><article class="panel inventory-history"><div class="panel-head"><div><p class="eyebrow">Последние движения</p><h2>Журнал склада</h2></div></div>${table(['Дата', 'Товар', 'Операция', 'Физический', 'Резерв', 'Основание'], recent.map(item => `<tr><td>${dateTime(item.occurredAt)}</td><td><b>${C.esc(prod(item.product))}</b></td><td>${C.esc(inventoryMovementLabel(item))}</td><td class="${item.onHandDelta < 0 ? 'danger' : item.onHandDelta > 0 ? 'ok-text' : ''}">${item.onHandDelta > 0 ? '+' : ''}${item.onHandDelta}</td><td class="${item.reservedDelta > 0 ? 'warn' : ''}">${item.reservedDelta > 0 ? '+' : ''}${item.reservedDelta}</td><td>${C.esc(item.description || '—')}</td></tr>`).join(''))}</article><p class="note">Доступно = физический остаток − резерв. История не переписывается; исправления создают отдельные движения.</p>`;
}

function inventoryMovementLabel(item) {
  const labels = { production: 'Производство', production_adjustment: 'Корректировка производства', reservation: 'Резерв заказа', reservation_release: 'Освобождение резерва', shipment: 'Отгрузка', return: 'Возврат', manual_adjustment: 'Ручная корректировка', migration: 'Начальный перенос' };
  return labels[item.movementType] || item.movementType || 'Операция';
}

function analyticsView() {
  const value = metrics();
  const productSales = new Map(data.productSalesSummary.map(item => [item.product, item.total]));
  const byProduct = catalogue().map(product => ({ name: product.name, total: Number(productSales.get(product.id) || 0) }));
  const maximum = Math.max(1, ...byProduct.map(item => item.total));
  return `${cards()}<div class="grid2"><article class="panel"><h2>Продажи по ассортименту</h2><div class="bars">${byProduct.map(item => `<div><span>${C.esc(item.name)}</span><div><i style="width:${item.total / maximum * 100}%"></i></div><b>${C.money(item.total)}</b></div>`).join('')}</div></article><article class="panel"><h2>Финансовая сводка</h2><dl class="summary"><div><dt>Реализовано</dt><dd>${C.money(value.sales)}</dd></div><div><dt>Получено минус возвраты</dt><dd>${C.money(value.paid)}</dd></div><div><dt>Дебиторская задолженность</dt><dd>${C.money(value.debt)}</dd></div><div><dt>Начисления сотрудникам</dt><dd>${C.money(value.wage)}</dd></div></dl><p class="note">Это управленческий учёт, не налоговая или бухгалтерская отчётность.</p></article></div>`;
}

function operationsView() {
  const pending = data.notificationEvents.filter(item => item.status === 'pending').length;
  const failed = data.notificationEvents.filter(item => ['failed', 'dead_letter'].includes(item.status)).length;
  const saleDelta = Number(data.financeSummary?.sales || 0);
  const paymentDelta = Number(data.financeSummary?.paid || 0);
  const eventRows = data.operationEvents.slice(0, 100).map(item => `<tr><td>${dateTime(item.occurredAt)}</td><td>${operationSeverityBadge(item.severity)}</td><td><b>${C.esc(item.message)}</b><small class="cell-subtitle">${C.esc(item.type)}</small></td><td>${C.esc(item.entityType)}</td><td><code>${C.esc(String(item.requestId || '').slice(0, 8))}</code></td></tr>`).join('');
  const notificationRows = data.notificationEvents.slice(0, 100).map(item => `<tr><td>${dateTime(item.createdAt)}</td><td>${C.esc(notificationChannelLabel(item.channel))}</td><td>${C.esc(item.recipient)}</td><td>${C.esc(item.type)}</td><td>${notificationStatusBadge(item.status)}</td><td>${item.attempts}</td><td>${C.esc(item.lastError || '—')}</td><td>${['failed', 'dead_letter'].includes(item.status) ? `<button type="button" class="link table-action" data-retry-notification="${item.id}">Повторить</button>` : '—'}</td></tr>`).join('');
  return `<div class="metrics mini"><article><i>Операций</i><b>${data.operationEvents.length}</b><small>В загруженном журнале</small></article><article><i>В очереди</i><b>${pending}</b><small>Ожидают обработчика</small></article><article><i>Ошибок доставки</i><b class="${failed ? 'danger' : ''}">${failed}</b><small>Можно повторить вручную</small></article><article><i>Выручка / оплаты</i><b>${C.money(saleDelta)} / ${C.money(paymentDelta)}</b><small>По финансовому журналу</small></article></div><div class="operations-callout"><span>✓</span><div><h2>Контроль целостности включён</h2><p>Заказы и производство проходят серверную проверку остатков; складской и финансовый журналы нельзя переписать или удалить.</p></div></div><article class="panel operations-panel"><div class="panel-head"><div><p class="eyebrow">Observability</p><h2>События системы</h2></div></div>${table(['Дата', 'Уровень', 'Событие', 'Объект', 'Request ID'], eventRows)}</article><article class="panel operations-panel"><div class="panel-head"><div><p class="eyebrow">Outbox + retry</p><h2>Очередь уведомлений</h2></div></div>${table(['Дата', 'Канал', 'Получатель', 'Событие', 'Статус', 'Попыток', 'Последняя ошибка', ''], notificationRows)}<p class="note">Новые события заказа уже надёжно сохраняются для icefresh.kz@gmail.com. Фактическая отправка начнётся после подключения почтового провайдера; до этого статус остаётся «В очереди».</p></article>`;
}

function operationSeverityBadge(severity) {
  const labels = { info: 'Информация', warning: 'Внимание', error: 'Ошибка' };
  return `<span class="badge ${severity === 'error' ? 'red' : severity === 'warning' ? '' : 'green'}">${labels[severity] || C.esc(severity)}</span>`;
}

function notificationStatusBadge(status) {
  const labels = { pending: 'В очереди', processing: 'Отправляется', sent: 'Отправлено', failed: 'Ошибка', dead_letter: 'Требует внимания' };
  return `<span class="badge ${status === 'sent' ? 'green' : ['failed', 'dead_letter'].includes(status) ? 'red' : ''}">${labels[status] || C.esc(status)}</span>`;
}

function notificationChannelLabel(channel) {
  return ({ email: 'Email', whatsapp: 'WhatsApp', webhook: 'Webhook' })[channel] || channel;
}

function calendarView() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const offset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - offset);
  const days = Array.from({ length: 42 }, (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index));
  const todayKey = localDateKey();
  const monthTitle = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(calendarCursor);
  const upcoming = openScheduleItems().slice(0, 10);
  const monthCount = data.schedule.filter(item => {
    const date = new Date(item.scheduledAt);
    return date.getFullYear() === year && date.getMonth() === month;
  }).length;
  return `<div class="calendar-layout"><section class="calendar-panel"><div class="calendar-toolbar"><div><button class="ghost icon-button" data-month-nav="-1" aria-label="Предыдущий месяц">←</button><button class="ghost" data-month-nav="0">Сегодня</button><button class="ghost icon-button" data-month-nav="1" aria-label="Следующий месяц">→</button></div><h2>${C.esc(monthTitle)}</h2><span>${monthCount} событий</span></div><div class="calendar-weekdays">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => `<span>${day}</span>`).join('')}</div><div class="calendar-grid">${days.map(day => {
    const key = localDateKey(day);
    const events = data.schedule.filter(item => localDateKey(new Date(item.scheduledAt)) === key).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    return `<article class="calendar-day ${day.getMonth() !== month ? 'outside' : ''} ${key === todayKey ? 'today' : ''}"><button class="calendar-date" data-calendar-date="${key}" aria-label="Добавить событие на ${key}">${day.getDate()}<span>＋</span></button><div>${events.slice(0, 3).map(item => `<button class="calendar-event type-${item.type} ${['Выполнено', 'Отменено'].includes(item.status) ? 'done' : ''}" data-edit-schedule="${item.id}" title="${C.esc(item.title)}"><time>${new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.scheduledAt))}</time>${C.esc(item.title)}</button>`).join('')}${events.length > 3 ? `<small class="more-events">ещё ${events.length - 3}</small>` : ''}</div></article>`;
  }).join('')}</div></section><aside class="calendar-agenda"><div class="panel-head"><div><p class="eyebrow">Следующие</p><h2>Ближайшие планы</h2></div></div><div class="upcoming-list">${upcoming.map(item => scheduleCompact(item)).join('') || empty('План пока свободен', ADD_LABELS.calendar)}</div><div class="calendar-legend"><span class="type-shipment">Отгрузка</span><span class="type-commitment">Обязательство</span><span class="type-production">Производство</span><span class="type-other">Другое</span></div></aside></div>`;
}

function groupedCount(items, field) {
  return items.reduce((result, item) => {
    const key = String(item[field] || 'Не указано');
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
}

function rounded(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function aiBusinessContext() {
  const inventory = ledgerInventory();
  const productionByProduct = catalogue().map(product => ({
    product: product.name,
    quantity: rounded(data.production.filter(item => item.product === product.id).reduce((sum, item) => sum + item.qty, 0))
  }));
  const operationalContext = {
    organization: organization?.name || 'IceFresh',
    generatedAt: new Date().toISOString(),
    accessLevel: manager ? 'management' : 'staff_operations',
    currency: 'KZT',
    orders: {
      ordersByStatus: groupedCount(data.orders, 'status'),
      recentOrdersWithoutPersonalData: data.orders.slice(0, 10).map(item => ({
        date: item.date,
        items: (item.items?.length ? item.items : [{ product: item.product, qty: item.qty }]).map(line => ({ product: prod(line.product), quantity: line.qty })),
        status: item.status
      }))
    },
    websiteRequests: {
      total: data.requests.length,
      byStatus: groupedCount(data.requests, 'status')
    },
    production: productionByProduct,
    inventory: inventory.map(item => ({
      product: item.name,
      produced: rounded(item.made),
      shipped: rounded(item.sold),
      stock: rounded(item.stock),
      minimumStock: rounded(item.minStock),
      attention: stockNotice(item) || null
    })),
    upcomingScheduleWithoutPersonalData: openScheduleItems().slice(0, 8).map(item => ({
      type: item.type,
      scheduledAt: item.scheduledAt,
      status: item.status
    }))
  };
  if (!manager) return operationalContext;
  const value = metrics();
  const totalAccrued = data.accruals.reduce((sum, item) => sum + C.calcAccrual(item), 0);
  const totalPaidAccruals = data.accruals.filter(item => item.paid).reduce((sum, item) => sum + C.calcAccrual(item), 0);
  return {
    ...operationalContext,
    managementAccountingNotice: 'Суммы являются данными управленческого, а не официального бухгалтерского учёта.',
    sales: {
      activeOrders: value.orders,
      revenue: rounded(value.sales),
      received: rounded(value.paid),
      receivables: rounded(value.debt)
    },
    clients: {
      total: data.clients.length,
      byCategory: groupedCount(data.clients, 'category')
    },
    accruals: {
      total: rounded(totalAccrued),
      paid: rounded(totalPaidAccruals),
      payable: rounded(totalAccrued - totalPaidAccruals)
    }
  };
}

function aiView() {
  const suggestions = manager
    ? ['Что сейчас требует моего внимания?', 'Какие товары нужно произвести в первую очередь?', 'Сделай краткий управленческий отчёт.', 'Проанализируй дебиторскую задолженность.']
    : ['Какие заказы сейчас в работе?', 'Какие товары нужно произвести?', 'Что проверить на складе?', 'Какие ближайшие задачи в календаре?'];
  const messages = aiMessages.length
    ? aiMessages.map(message => `<article class="ai-message ${message.role}"><div>${message.role === 'assistant' ? 'AI' : 'Вы'}</div><p>${C.esc(message.content)}</p></article>`).join('')
    : `<div class="ai-empty"><span>◎</span><h2>Чем помочь сегодня?</h2><p>${manager ? 'Ассистент видит обезличенную управленческую сводку CRM.' : 'Ассистент видит только обезличенные рабочие данные без начислений и финансовой аналитики.'}</p></div>`;
  return `<div class="ai-layout"><aside class="ai-guide"><div class="ai-badge">${manager ? 'AI для руководителя' : 'AI для сотрудника'}</div><h2>${manager ? 'Быстрый анализ IceFresh' : 'Помощник по работе'}</h2><p>Задавайте вопросы обычными словами. Ассистент не изменяет записи — он только анализирует доступную вам сводку.</p><div class="ai-suggestions">${suggestions.map(question => `<button type="button" data-ai-question="${C.esc(question)}">${C.esc(question)}</button>`).join('')}</div><div class="ai-privacy"><b>Защита данных</b><span>Имена и телефоны не передаются. Сотрудникам недоступны начисления и финансовая аналитика руководства.</span></div></aside><section class="ai-chat"><div class="ai-chat-head"><div><span class="ai-online"></span><b>IceFresh AI</b><small>${manager ? 'Помощник по управленческому учёту' : 'Помощник по текущей работе'}</small></div>${aiMessages.length ? '<button type="button" class="link" data-ai-reset>Очистить диалог</button>' : ''}</div><div class="ai-chat-log" aria-live="polite">${messages}${aiBusy ? '<article class="ai-message assistant loading"><div>AI</div><p><i></i><i></i><i></i></p></article>' : ''}</div>${aiError ? `<p class="ai-error" role="alert">${C.esc(aiError)}</p>` : ''}<form id="ai-form" class="ai-form"><label for="ai-question">Ваш вопрос</label><textarea id="ai-question" name="question" rows="3" minlength="2" maxlength="1800" required ${aiBusy ? 'disabled' : ''} placeholder="Например: какие остатки требуют внимания?"></textarea><button class="primary" type="submit" ${aiBusy ? 'disabled' : ''}>${aiBusy ? 'Анализирую…' : 'Спросить AI'}</button></form><p class="ai-disclaimer">AI может ошибаться. Проверяйте важные решения по исходным записям CRM.</p></section></div>`;
}

function integrationsView() {
  if (!owner) return empty('Раздел доступен только владельцу IceFresh.');
  return `<div class="integration-status"><div><span class="integration-logo">◎</span><div><p class="eyebrow">AI Provider Gateway</p><h2>AI-провайдеры подключаются через единый серверный слой</h2><p>По умолчанию используется OpenAI. Архитектура RC поддерживает OpenAI, Anthropic/Claude, Google Gemini и HTTPS OpenAI-compatible endpoint через серверные секреты.</p></div></div><span class="integration-online"><i></i> RC готов</span></div><div class="integration-grid"><section class="integration-panel"><div class="panel-head"><div><p class="eyebrow">Параметры</p><h2>Паспорт подключения</h2></div><button type="button" class="ghost" data-copy-integration="safe-config">Копировать всё</button></div><div class="integration-fields">${integrationRow('Провайдер', INTEGRATION_DETAILS.provider, 'provider')}${integrationRow('Адрес API', INTEGRATION_DETAILS.endpoint, 'endpoint')}${integrationRow('Модель', INTEGRATION_DETAILS.model, 'model')}${integrationRow('Название ключа', INTEGRATION_DETAILS.keyName, 'key-name')}${integrationRow('Project ID', INTEGRATION_DETAILS.projectId, 'project-id')}${integrationRow('Organization ID', INTEGRATION_DETAILS.organizationId, 'organization-id')}</div><p class="integration-note">Эти параметры можно копировать: они не дают доступа без отдельного секретного ключа.</p></section><section class="integration-panel secret-panel"><p class="eyebrow">Секрет</p><h2>API‑ключ защищён</h2><div class="secret-value"><code>••••••••••••••••••••••••</code><span>Только на сервере</span></div><p>Полный ключ нельзя показать или скопировать из сайта. Иначе любой человек или вредоносное расширение браузера сможет получить доступ и расходовать ваш баланс.</p><a class="primary integration-link" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">Управлять ключами в OpenAI ↗</a><small>Для нового внешнего сервиса создавайте отдельный ключ. Тогда его можно отключить, не останавливая IceFresh.</small></section></div><section class="integration-panel service-panel"><div class="panel-head"><div><p class="eyebrow">Другие AI и сервисы</p><h2>Единый шлюз без привязки к одному поставщику</h2><p class="integration-note">Провайдер выбирается серверной настройкой AI_PROVIDER. Секреты Anthropic, Gemini и custom endpoint не попадают в браузер. Custom endpoint допускается только по HTTPS и блокирует localhost/частные сети.</p></div><span class="owner-only">Только владелец</span></div><div class="integration-steps"><article><b>1</b><div><h3>Создайте отдельный ключ</h3><p>Откройте OpenAI Platform, выберите проект IceFresh и создайте новый ключ специально для нужного сервиса.</p></div></article><article><b>2</b><div><h3>Скопируйте параметры</h3><p>Используйте Project ID, Organization ID, адрес API и модель из паспорта подключения выше.</p></div></article><article><b>3</b><div><h3>Сохраните ключ как секрет</h3><p>Вставляйте его только в защищённое поле настроек внешнего сервиса. Не отправляйте ключ в чат и не храните в таблицах.</p></div></article></div></section><div class="integration-grid compact"><section class="integration-panel"><p class="eyebrow">Лимиты IceFresh</p><h2>Контроль расходов</h2><dl class="integration-summary"><div><dt>На пользователя</dt><dd>до 12 запросов в час</dd></div><div><dt>На организацию</dt><dd>до 500 запросов в месяц</dd></div><div><dt>Данные сотрудников</dt><dd>без финансов и начислений</dd></div></dl></section><section class="integration-panel"><p class="eyebrow">Важно</p><h2>Что можно передавать</h2><ul class="integration-checklist"><li>Поддерживаемая архитектура: OpenAI, Anthropic/Claude, Google Gemini, OpenAI-compatible HTTPS endpoint.</li><li>Можно: параметры из паспорта подключения.</li><li>Можно: отдельный ключ через защищённое поле сервиса.</li><li>Нельзя: публиковать секретный ключ на сайте или в сообщениях.</li></ul></section></div>`;
}

function integrationRow(label, value, key) {
  return `<div><span>${C.esc(label)}</span><code>${C.esc(value)}</code><button type="button" class="link" data-copy-integration="${key}" aria-label="Копировать ${C.esc(label)}">Копировать</button></div>`;
}

function integrationCopyValue(key) {
  const values = {
    provider: INTEGRATION_DETAILS.provider,
    endpoint: INTEGRATION_DETAILS.endpoint,
    model: INTEGRATION_DETAILS.model,
    'key-name': INTEGRATION_DETAILS.keyName,
    'project-id': INTEGRATION_DETAILS.projectId,
    'organization-id': INTEGRATION_DETAILS.organizationId,
    'safe-config': JSON.stringify({
      provider: INTEGRATION_DETAILS.provider,
      base_url: INTEGRATION_DETAILS.endpoint,
      model: INTEGRATION_DETAILS.model,
      key_name: INTEGRATION_DETAILS.keyName,
      project_id: INTEGRATION_DETAILS.projectId,
      organization_id: INTEGRATION_DETAILS.organizationId,
      api_key: 'CREATE_A_SEPARATE_SECRET_KEY_IN_OPENAI_PLATFORM'
    }, null, 2)
  };
  return values[key] || '';
}

async function askAi(question) {
  const message = String(question || '').trim();
  if (aiBusy || message.length < 2) return;
  const history = aiMessages.slice(-6).map(item => ({ role: item.role, content: item.content.slice(0, 1000) }));
  aiMessages.push({ role: 'user', content: message });
  aiBusy = true;
  aiError = '';
  render();
  try {
    const { data: authData, error: authError } = await supabase.auth.getSession();
    if (authError || !authData.session?.access_token) throw new Error('Сессия истекла. Войдите снова.');
    const response = await fetch('/api/ai-assistant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authData.session.access_token}`
      },
      body: JSON.stringify({ message, history, context: aiBusinessContext() })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || typeof result.reply !== 'string') throw new Error(result.error || 'Не удалось получить ответ AI‑ассистента.');
    aiMessages.push({ role: 'assistant', content: result.reply.trim() });
  } catch (error) {
    aiError = friendlyError(error);
  } finally {
    aiBusy = false;
    render();
  }
}

const views = {
  dashboard: dashboardView,
  calendar: calendarView,
  requests: requestsView,
  orders: ordersView,
  clients: clientsView,
  production: productionView,
  products: productsView,
  employees: employeesView,
  accruals: accrualsView,
  warehouse: warehouseView,
  analytics: analyticsView,
  operations: operationsView,
  ai: aiView,
  integrations: integrationsView
};

function render() {
  if (!views[section]) section = 'dashboard';
  const title = titles[section];
  $('#eyebrow').textContent = title[0];
  $('#title').textContent = title[1];
  $('#app').innerHTML = views[section]();
  document.querySelectorAll('#nav button, #mobile-bottom-nav [data-section]').forEach(button => button.classList.toggle('active', button.dataset.section === section));
  $('#add').textContent = ADD_LABELS[section] || '＋ Добавить';
  $('#add').hidden = !ADD_LABELS[section] || (!manager && ['products', 'employees', 'accruals'].includes(section));
  $('#backup').hidden = !manager;
  setSidebarOpen(false);
  if (section === 'ai') requestAnimationFrame(() => {
    const log = $('.ai-chat-log');
    if (log) log.scrollTop = log.scrollHeight;
  });
}

const schemas = {
  orders: [
    ['date', 'Дата', 'date', localDateKey()],
    ['clientId', 'Клиент', 'select', () => data.clients.map(item => [item.id, item.name])],
    ['paid', 'Получено от клиента, ₸', 'number', 0],
    ['status', 'Статус', 'select', ['Новый', 'Подтверждён', 'В производстве', 'Собирается', 'Готов', 'На доставке', 'Доставлен', 'Выполнен', 'Отменён']]
  ],
  clients: [
    ['name', 'Название / имя', 'text', ''],
    ['category', 'Категория', 'select', ['Магазины', 'HoReCa', 'Частные клиенты', 'Оптовые клиенты']],
    ['phone', 'Телефон', 'tel', '']
  ],
  production: [
    ['date', 'Дата', 'date', localDateKey()],
    ['product', 'Продукция', 'select', () => activeProducts().map(item => [item.id, item.name])],
    ['qty', 'Количество', 'number', 1],
    ['employeeId', 'Сотрудник', 'select', () => data.employees.filter(item => item.active).map(item => [item.id, item.name])]
  ],
  employees: [
    ['name', 'Имя сотрудника', 'text', ''],
    ['role', 'Должность', 'text', 'Сотрудник производства'],
    ['phone', 'Телефон', 'tel', '', { required: false }],
    ['active', 'Сотрудник активен', 'checkbox', true]
  ],
  accruals: [
    ['date', 'Дата', 'date', localDateKey()],
    ['employeeId', 'Сотрудник', 'select', () => data.employees.filter(item => item.active).map(item => [item.id, item.name])],
    ['description', 'Основание начисления', 'text', 'Фасовка продукции'],
    ['qty', 'Объём работы', 'number', 1],
    ['rate', 'Ставка за единицу, ₸', 'number', 25],
    ['paid', 'Выплачено', 'checkbox', false]
  ]
};

function genericField([name, label, type, initial, options = {}], record) {
  const aliases = { product: 'product', qty: 'qty', employeeId: 'employeeId', clientId: 'clientId', date: 'date', price: 'price', paid: 'paid', status: 'status', name: 'name', category: 'category', phone: 'phone', role: 'role', active: 'active' };
  const recordValue = record && aliases[name] ? record[aliases[name]] : undefined;
  const required = options.required === false ? '' : 'required';
  if (type === 'select') {
    const choices = typeof initial === 'function' ? initial() : initial;
    const firstChoice = choices[0];
    const fallback = Array.isArray(firstChoice) ? firstChoice[0] : firstChoice;
    const selectedValue = recordValue ?? fallback;
    return `<label>${label}<select name="${name}" ${required}>${choices.map(option => {
      const pair = Array.isArray(option) ? option : [option, option];
      return `<option value="${C.esc(pair[0])}" ${String(pair[0]) === String(selectedValue) ? 'selected' : ''}>${C.esc(pair[1])}</option>`;
    }).join('')}</select></label>`;
  }
  const value = recordValue ?? (typeof initial === 'function' ? initial() : initial);
  if (type === 'checkbox') return `<label class="check"><input name="${name}" type="checkbox" ${value ? 'checked' : ''}> ${label}</label>`;
  return `<label>${label}<input name="${name}" type="${type}" value="${C.esc(value)}" ${type === 'number' ? 'min="0" step="0.01"' : ''} ${required}></label>`;
}

function orderLineTemplate(item = {}, index = 0) {
  const productId = item.product || activeProducts()[0]?.id || '';
  const product = activeProducts().find(entry => entry.id === productId);
  const qty = Number(item.qty || 1);
  const price = Number(item.price ?? product?.price ?? 0);
  const priceField = manager ? `<label>Цена, ₸<input name="item_price_${index}" data-order-price type="number" min="0" step="0.01" value="${price}" required></label><div class="order-line-total"><span>Сумма позиции</span><b data-order-line-total>${C.money(qty * price)}</b></div>` : '';
  return `<div class="order-line" data-order-line>
    <label>Продукция<select name="item_product_${index}" data-order-product required>${activeProducts().map(entry => `<option value="${C.esc(entry.id)}" ${entry.id === productId ? 'selected' : ''}>${C.esc(entry.name)}</option>`).join('')}</select></label>
    <label>Количество<input name="item_qty_${index}" data-order-qty type="number" min="0.01" step="0.01" value="${qty}" required></label>
    ${priceField}
    <button type="button" class="link danger order-line-remove" data-remove-order-line aria-label="Удалить позицию">Удалить</button>
  </div>`;
}

function canonicalOrderItems(items, includePrice = manager) {
  return (items || []).map(item => {
    const normalized = { product_id: item.product_id ?? item.product, quantity: Number(item.quantity ?? item.qty) };
    if (includePrice) normalized.unit_price = Number(item.unit_price ?? item.price ?? 0);
    return normalized;
  }).sort((a, b) => String(a.product_id).localeCompare(String(b.product_id)));
}

function recalcOrderEditorTotals() {
  const lines = [...document.querySelectorAll('#fields [data-order-line]')];
  let total = 0;
  lines.forEach(line => {
    const qty = Number(line.querySelector('[data-order-qty]')?.value || 0);
    const price = Number(line.querySelector('[data-order-price]')?.value || 0);
    const lineTotal = Math.max(0, qty * price);
    total += lineTotal;
    const output = line.querySelector('[data-order-line-total]');
    if (output) output.textContent = C.money(lineTotal);
  });
  const overall = $('#fields [data-order-editor-total]');
  if (overall) overall.textContent = C.money(total);
}

async function verifySavedOrder(orderId, submittedItems) {
  const expected = canonicalOrderItems(submittedItems, manager);
  let row;
  if (manager) {
    const result = await supabase.from('orders').select('id,total_amount,order_items(product_id,quantity,unit_price)').eq('id', orderId).single();
    if (result.error) throw result.error;
    row = { ...result.data, items: result.data.order_items || [] };
  } else {
    const result = await supabase.rpc('list_orders_operational_rc', { p_limit: 500 });
    if (result.error) throw result.error;
    row = (result.data || []).find(item => item.id === orderId);
  }
  if (!row) throw new Error('saved order verification failed: order missing');
  const actual = canonicalOrderItems(row.items || row.order_items || [], manager);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('saved order verification failed: items mismatch');
  if (manager) {
    const expectedTotal = expected.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price), 0);
    if (Math.abs(Number(row.total_amount || 0) - expectedTotal) > 0.001) throw new Error('saved order verification failed: total mismatch');
  }
}

function refreshOrderLineNames() {
  document.querySelectorAll('#fields [data-order-line]').forEach((line, index) => {
    line.querySelector('[data-order-product]').name = `item_product_${index}`;
    line.querySelector('[data-order-qty]').name = `item_qty_${index}`;
    const price = line.querySelector('[data-order-price]');
    if (price) price.name = `item_price_${index}`;
  });
}

function openOrderForm(order = null) {
  editingRecord = order ? { type: 'orders', id: order.id } : null;
  $('#form').dataset.idempotencyKey = crypto.randomUUID();
  $('#modal-title').textContent = order ? 'Изменить заказ' : 'Добавить заказ';
  const items = order?.items?.length ? order.items : [{ product: activeProducts()[0]?.id, qty: 1, price: activeProducts()[0]?.price || 0 }];
  const statusOptions = ['Новый', 'Подтверждён', 'В производстве', 'Собирается', 'Готов', 'На доставке', 'Доставлен', 'Выполнен', 'Отменён'];
  const reference = order ? `<div class="order-reference"><span>Заказ IceFresh <b>${C.esc(order.orderNumber || order.id.slice(0, 8))}</b></span>${order.externalOrderNumber ? `<span>Внешний № <b>${C.esc(order.externalOrderNumber)}</b></span>` : ''}</div>` : '';
  $('#fields').innerHTML = `${reference}<div class="form-row"><label>Дата<input name="date" type="date" value="${C.esc(order?.date || localDateKey())}" required></label><label>Клиент<select name="clientId" required>${data.clients.map(client => `<option value="${client.id}" ${client.id === order?.clientId ? 'selected' : ''}>${C.esc(client.name)}</option>`).join('')}</select></label></div>
    <div class="order-items-editor"><div class="panel-head"><div><p class="eyebrow">Состав заказа</p><h3>Позиции</h3></div><button type="button" class="ghost" data-add-order-line>＋ Добавить позицию</button></div><div data-order-lines>${items.map((item,index)=>orderLineTemplate(item,index)).join('')}</div>${manager ? `<div class="order-editor-total"><span>Итого по заказу</span><b data-order-editor-total>${C.money(items.reduce((sum,item)=>sum+Number(item.qty||0)*Number(item.price||0),0))}</b></div>` : ''}</div>
    <div class="form-row">${manager ? `<label>Получено от клиента, ₸<input name="paid" type="number" min="0" step="0.01" value="${Number(order?.paid || 0)}" required><small>Уменьшение полученной суммы делается отдельной операцией возврата.</small></label>` : `<input name="paid" type="hidden" value="${Number(order?.paid || 0)}">`}<label>Статус<select name="status" required>${statusOptions.map(status => `<option ${status === (order?.status || 'Новый') ? 'selected' : ''}>${status}</option>`).join('')}</select></label></div>
    ${order && manager && Number(order.paid || 0) > 0 ? `<button type="button" class="link danger" data-refund-order="${order.id}">Оформить возврат оплаты</button>` : ''}`;
  $('#form').dataset.expectedItems = JSON.stringify(canonicalOrderItems(items, manager));
  $('#modal').showModal();
  requestAnimationFrame(recalcOrderEditorTotals);
}

function openProductForm(product = null) {
  editingRecord = product ? { type: 'products', id: product.id } : null;
  $('#modal-title').textContent = product ? 'Изменить товар' : 'Добавить товар';
  const photo = productPhotoUrl(product);
  $('#fields').innerHTML = `<label>Название товара<input name="name" value="${C.esc(product?.name || '')}" minlength="2" maxlength="160" required placeholder="Например, пищевой лёд 5 кг"></label><label>Описание<textarea name="description" maxlength="500" rows="3" placeholder="Для кого и для каких задач подходит">${C.esc(product?.description || '')}</textarea></label><div class="form-row"><label>Формат / вес<input name="weight" value="${C.esc(product?.weight || '')}" maxlength="40" placeholder="Например, 5 кг"></label><label>Единица учёта<input name="unit" value="${C.esc(product?.unit || 'шт.')}" maxlength="30" required></label></div><div class="form-row"><label>Цена по умолчанию, ₸<input name="price" type="number" min="0" step="0.01" value="${product?.price ?? 0}" required></label><label>Минимальный остаток<input name="minStock" type="number" min="0" step="0.01" value="${product?.minStock ?? 0}" required><small>При этом количестве появится предупреждение</small></label></div><label class="upload-field">Фотография товара<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"><small>JPG, PNG или WebP, не более 5 МБ.${photo ? ' Новая фотография заменит текущую.' : ''}</small>${photo ? `<img src="${C.esc(photo)}" alt="Текущая фотография">` : ''}</label><div class="form-checks"><label class="check"><input name="active" type="checkbox" ${product?.active !== false ? 'checked' : ''}> Товар активен</label><label class="check"><input name="publicVisible" type="checkbox" ${product?.publicVisible !== false ? 'checked' : ''}> Показывать клиентам на сайте</label></div>`;
  $('#modal').showModal();
}

function openScheduleForm(item = null, dateKey = '') {
  editingRecord = item ? { type: 'calendar', id: item.id } : null;
  let scheduled = item ? new Date(item.scheduledAt) : new Date(Date.now() + 3600000);
  if (!item && dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    scheduled = new Date(year, month - 1, day, 9, 0);
  }
  $('#modal-title').textContent = item ? 'Изменить событие' : 'Добавить в календарь';
  $('#fields').innerHTML = `<label>Что нужно сделать<input name="title" value="${C.esc(item?.title || '')}" minlength="2" maxlength="180" required placeholder="Например, отгрузить 20 пакетов"></label><div class="form-row"><label>Тип<select name="itemType"><option value="shipment" ${item?.type === 'shipment' ? 'selected' : ''}>Отгрузка</option><option value="commitment" ${item?.type === 'commitment' ? 'selected' : ''}>Обязательство</option><option value="production" ${item?.type === 'production' ? 'selected' : ''}>Производство</option><option value="other" ${item?.type === 'other' ? 'selected' : ''}>Другое</option></select></label><label>Дата и время<input name="scheduledAt" type="datetime-local" value="${localDateTimeValue(scheduled)}" required></label></div><div class="form-row"><label>Клиент <small>необязательно</small><select name="clientId"><option value="">Без клиента</option>${data.clients.map(client => `<option value="${client.id}" ${item?.clientId === client.id ? 'selected' : ''}>${C.esc(client.name)}</option>`).join('')}</select></label><label>Статус<select name="status"><option ${item?.status === 'Запланировано' ? 'selected' : ''}>Запланировано</option><option ${item?.status === 'В работе' ? 'selected' : ''}>В работе</option><option ${item?.status === 'Выполнено' ? 'selected' : ''}>Выполнено</option><option ${item?.status === 'Отменено' ? 'selected' : ''}>Отменено</option></select></label></div><label>Комментарий <small>необязательно</small><textarea name="notes" maxlength="1000" rows="4" placeholder="Количество, адрес, контакт, обещания клиенту">${C.esc(item?.notes || '')}</textarea></label>${item ? `<div class="schedule-form-actions"><button type="button" class="link danger" data-delete-schedule="${item.id}">Удалить событие</button></div>` : ''}`;
  $('#modal').showModal();
}

function openForm(record = null, dateKey = '') {
  $('#form').dataset.idempotencyKey = crypto.randomUUID();
  if (section === 'products') {
    openProductForm(record);
    return;
  }
  if (section === 'calendar') {
    openScheduleForm(record, dateKey);
    return;
  }
  if (section === 'orders') {
    if (!data.clients.length) { toast('Сначала добавьте клиента'); return; }
    if (!activeProducts().length) { toast('Сначала добавьте активный товар'); return; }
    openOrderForm(record);
    return;
  }
  const schema = schemas[section];
  if (!schema) return;
  if (['orders', 'production', 'accruals'].includes(section) && ((section === 'orders' && !data.clients.length) || (section !== 'orders' && !data.employees.some(employee => employee.active)))) {
    toast(section === 'orders' ? 'Сначала добавьте клиента' : 'Сначала добавьте сотрудника');
    return;
  }
  if (['orders', 'production'].includes(section) && !activeProducts().length) {
    toast('Сначала добавьте активный товар');
    return;
  }
  editingRecord = record ? { type: section, id: record.id } : null;
  const createLabels = { orders: 'Добавить заказ', clients: 'Добавить клиента', production: 'Записать производство', employees: 'Добавить сотрудника', accruals: 'Добавить начисление' };
  const editLabels = { orders: 'Изменить заказ', clients: 'Изменить клиента', production: 'Изменить производство', employees: 'Изменить сотрудника', accruals: 'Изменить начисление' };
  $('#modal-title').textContent = record ? editLabels[section] : createLabels[section];
  $('#fields').innerHTML = schema.map(field => genericField(field, record)).join('');
  if (section === 'employees' && record?.active) {
    $('#fields').insertAdjacentHTML('beforeend', `<div class="employee-form-actions"><button type="button" class="link danger" data-archive-employee="${record.id}">Перевести сотрудника в архив</button><small>Карточка и история начислений сохранятся.</small></div>`);
  }
  $('#modal').showModal();
}

function openInventoryAdjustmentForm() {
  if (!owner) {
    toast('Корректировка склада доступна только владельцу.');
    return;
  }
  editingRecord = { type: 'inventory-adjustment', id: null };
  $('#form').dataset.idempotencyKey = crypto.randomUUID();
  $('#modal-title').textContent = 'Корректировать остаток';
  $('#fields').innerHTML = `<div class="form-warning"><b>Это учётная операция</b><span>Исходная история не изменится. Система добавит отдельное движение с вашим основанием.</span></div><label>Товар<select name="product" required>${activeProducts().map(product => `<option value="${C.esc(product.id)}">${C.esc(product.name)}</option>`).join('')}</select></label><label>Изменение количества<input name="delta" type="number" step="0.01" required placeholder="Например, -2 или 5"><small>Плюс добавляет остаток, минус списывает. Итог не может стать отрицательным.</small></label><label>Основание корректировки<textarea name="reason" minlength="5" maxlength="500" rows="4" required placeholder="Например: фактический пересчёт склада 16.08.2026"></textarea></label>`;
  $('#modal').showModal();
}

async function uploadProductPhoto(file, productId) {
  if (!file || !file.size) return null;
  const extension = PRODUCT_IMAGE_TYPES.get(file.type);
  if (!extension) throw new Error('Выберите фотографию JPG, PNG или WebP.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Фотография должна быть не больше 5 МБ.');
  const path = `${profile.organization_id}/${productId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

async function saveProduct(form) {
  const raw = Object.fromEntries(new FormData(form));
  const existing = editingRecord ? data.products.find(product => product.id === editingRecord.id) : null;
  const productId = existing?.id || crypto.randomUUID();
  const file = form.elements.photo.files?.[0];
  let uploadedPath = null;
  try {
    uploadedPath = await uploadProductPhoto(file, productId);
    const payload = {
      organization_id: profile.organization_id,
      name: String(raw.name || '').trim(),
      description: String(raw.description || '').trim(),
      weight_label: String(raw.weight || '').trim(),
      default_price: Number(raw.price),
      min_stock: Number(raw.minStock),
      unit: String(raw.unit || '').trim(),
      active: form.elements.active.checked,
      public_visible: form.elements.publicVisible.checked,
      ...(uploadedPath ? { photo_path: uploadedPath } : {})
    };
    if (existing) {
      const { error } = await supabase.from('products').update(payload).eq('id', existing.id);
      if (error) throw error;
      if (uploadedPath && existing.photoPath) await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([existing.photoPath]);
    } else {
      const nextOrder = Math.max(0, ...data.products.map(product => product.sortOrder)) + 10;
      const { error } = await supabase.from('products').insert({ ...payload, id: productId, sort_order: nextOrder, created_by: session.user.id });
      if (error) throw error;
    }
  } catch (error) {
    if (uploadedPath) await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([uploadedPath]);
    throw error;
  }
  await loadPublicCatalogue();
}

async function saveSchedule(form) {
  const raw = Object.fromEntries(new FormData(form));
  const scheduled = new Date(String(raw.scheduledAt));
  if (Number.isNaN(scheduled.getTime())) throw new Error('Укажите правильную дату и время.');
  const client = data.clients.find(item => item.id === raw.clientId);
  const payload = {
    organization_id: profile.organization_id,
    title: String(raw.title || '').trim(),
    item_type: raw.itemType,
    scheduled_at: scheduled.toISOString(),
    client_id: client?.id || null,
    client_name: client?.name || '',
    notes: String(raw.notes || '').trim(),
    status: raw.status
  };
  if (editingRecord) {
    const { error } = await supabase.from('schedule_items').update(payload).eq('id', editingRecord.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('schedule_items').insert({ ...payload, created_by: session.user.id });
    if (error) throw error;
  }
}

async function saveRecord(form) {
  if (editingRecord?.type === 'inventory-adjustment') {
    const raw = Object.fromEntries(new FormData(form));
    const delta = Number(raw.delta);
    if (delta < 0 && !window.confirm(`Списать со склада ${Math.abs(delta)} единиц? История сохранится в журнале.`)) return false;
    const { error } = await supabase.rpc('record_inventory_adjustment_rc', {
      p_idempotency_key: form.dataset.idempotencyKey,
      p_product_id: String(raw.product),
      p_quantity_delta: delta,
      p_reason: String(raw.reason || '').trim()
    });
    if (error) throw error;
    return true;
  }
  if (section === 'products') return saveProduct(form);
  if (section === 'calendar') return saveSchedule(form);
  const raw = Object.fromEntries(new FormData(form));
  (schemas[section] || []).forEach(([name, , type]) => {
    if (type === 'number') raw[name] = Number(raw[name]);
    if (type === 'checkbox') raw[name] = form.elements[name].checked;
  });
  if (section === 'employees' && editingRecord) {
    const { error } = await supabase.from('employees').update({ full_name: String(raw.name).trim(), position: String(raw.role).trim(), phone: String(raw.phone || '').trim(), active: raw.active }).eq('id', editingRecord.id);
    if (error) throw error;
    return;
  }
  if (section === 'clients' && editingRecord) {
    const { error } = await supabase.from('clients').update({ name: String(raw.name).trim(), category: raw.category, phone: String(raw.phone || '').trim() }).eq('id', editingRecord.id);
    if (error) throw error;
    return true;
  }
  if (section === 'orders') {
    const client = data.clients.find(item => item.id === raw.clientId);
    if (!client) throw new Error('Выберите клиента.');
    const items = [...form.querySelectorAll('[data-order-line]')].map(line => {
      const item = {
        product_id: line.querySelector('[data-order-product]').value,
        quantity: Number(line.querySelector('[data-order-qty]').value)
      };
      if (manager) item.unit_price = Number(line.querySelector('[data-order-price]').value);
      return item;
    });
    if (!items.length) throw new Error('Добавьте хотя бы одну позицию заказа.');
    if (new Set(items.map(item => item.product_id)).size !== items.length) throw new Error('Один товар нельзя добавлять двумя строками. Измените количество в одной строке.');
    const orderId = editingRecord?.type === 'orders' ? editingRecord.id : null;
    const expectedItems = orderId ? JSON.parse(form.dataset.expectedItems || '[]') : [];
    const rpcName = manager ? 'save_order_manager_rc_v2' : 'save_order_operational_rc_v2';
    const payload = manager
      ? { p_idempotency_key: form.dataset.idempotencyKey, p_order_id: orderId, p_order_date: raw.date, p_client_id: client.id, p_items: items, p_paid_amount: Number(raw.paid), p_status: raw.status, p_expected_items: expectedItems }
      : { p_idempotency_key: form.dataset.idempotencyKey, p_order_id: orderId, p_order_date: raw.date, p_client_id: client.id, p_items: items.map(item => ({ product_id: item.product_id, quantity: item.quantity })), p_status: raw.status, p_expected_items: expectedItems.map(item => ({ product_id: item.product_id, quantity: item.quantity })) };
    const { data: savedOrderId, error } = await supabase.rpc(rpcName, payload);
    if (error) throw error;
    await verifySavedOrder(savedOrderId, items);
    return true;
  }
  if (section === 'production') {
    const employee = data.employees.find(item => item.id === raw.employeeId);
    if (!employee) throw new Error('Выберите сотрудника.');
    const { error } = await supabase.rpc('save_production_entry_rc', {
      p_idempotency_key: form.dataset.idempotencyKey,
      p_entry_id: editingRecord?.type === 'production' ? editingRecord.id : null,
      p_production_date: raw.date,
      p_product_id: raw.product,
      p_quantity: raw.qty,
      p_employee_id: employee.id
    });
    if (error) throw error;
    return true;
  }
  const common = { organization_id: profile.organization_id, created_by: session.user.id };
  let tableName;
  let payload;
  if (section === 'clients') {
    tableName = 'clients';
    payload = { ...common, name: String(raw.name).trim(), category: raw.category, phone: String(raw.phone || '').trim() };
  }
  if (section === 'employees') {
    tableName = 'employees';
    payload = { ...common, full_name: String(raw.name).trim(), position: String(raw.role).trim(), phone: String(raw.phone || '').trim(), active: raw.active };
  }
  if (section === 'accruals') {
    const employee = data.employees.find(item => item.id === raw.employeeId);
    tableName = 'accruals';
    payload = { ...common, accrual_date: raw.date, employee_id: employee.id, employee_name: employee.name, description: String(raw.description).trim(), quantity: raw.qty, rate: raw.rate, paid: raw.paid };
  }
  if (!tableName) throw new Error('Раздел недоступен');
  const { error } = await supabase.from(tableName).insert(payload);
  if (error) throw error;
}

function inviteUrl(token) {
  return `${location.origin}${location.pathname}#/register?invite=${encodeURIComponent(token)}`;
}

async function copyText(text, successText) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(text);
    toast(successText);
  } catch {
    window.prompt('Скопируйте значение:', text);
  }
}

async function createInvite() {
  const role = $('#invite-role')?.value || 'staff';
  const employeeId = $('#invite-employee')?.value || null;
  const { data: invite, error } = await supabase.from('organization_invites').insert({ organization_id: profile.organization_id, role, employee_id: employeeId, created_by: session.user.id }).select('token,expires_at').single();
  if (error) {
    toast(friendlyError(error));
    return;
  }
  await copyText(inviteUrl(invite.token), 'Ссылка для сотрудника скопирована');
  await loadAll();
  render();
}

async function revokeInvite(id) {
  const { error } = await supabase.from('organization_invites').delete().eq('id', id);
  if (error) toast(friendlyError(error));
  else {
    await loadAll();
    render();
    toast('Приглашение отозвано');
  }
}

async function updateMember(card) {
  const role = card.querySelector('[data-member-role]').value;
  const active = card.querySelector('[data-member-active]').checked;
  card.querySelectorAll('select,input').forEach(element => { element.disabled = true; });
  const { error } = await supabase.rpc('manage_member', { p_member_id: card.dataset.memberCard, p_role: role, p_active: active });
  if (error) toast(friendlyError(error));
  else toast('Права сотрудника обновлены');
  await loadAll();
  render();
}

async function updateWebsiteRequest(id, status) {
  if (!['Новая', 'Связались', 'Принята', 'Закрыта'].includes(status)) return;
  const { error } = await supabase.from('website_requests').update({ status }).eq('id', id);
  if (error) {
    toast(friendlyError(error));
    return;
  }
  await loadAll();
  render();
  toast('Статус заявки обновлён');
}

async function acceptWebsiteRequest(id, button) {
  button.disabled = true;
  const { error } = await supabase.rpc('accept_website_request', { p_request_id: id });
  if (error) {
    button.disabled = false;
    toast(friendlyError(error));
    return;
  }
  await loadAll();
  render();
  toast('Клиент и заказ созданы, заявка принята');
}

async function retryNotification(id, button) {
  button.disabled = true;
  const { error } = await supabase.rpc('retry_notification_rc', { p_notification_id: id });
  if (error) {
    button.disabled = false;
    toast(friendlyError(error));
    return;
  }
  await loadAll();
  render();
  toast('Уведомление возвращено в очередь');
}


async function refundOrder(id) {
  if (!manager) return;
  const order = data.orders.find(item => item.id === id);
  if (!order || Number(order.paid || 0) <= 0) { toast('По заказу нет доступной к возврату оплаты.'); return; }
  const rawAmount = window.prompt(`Сумма возврата, ₸ (получено сейчас: ${Number(order.paid || 0)})`, String(Number(order.paid || 0)));
  if (rawAmount === null) return;
  const amount = Number(String(rawAmount).replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0 || amount > Number(order.paid || 0)) { toast('Укажите корректную сумму возврата.'); return; }
  const reason = window.prompt('Основание возврата:', 'Возврат клиенту');
  if (reason === null || String(reason).trim().length < 3) { toast('Укажите основание возврата.'); return; }
  const { error } = await supabase.rpc('record_refund_rc', {
    p_idempotency_key: crypto.randomUUID(),
    p_order_id: id,
    p_amount: amount,
    p_reason: String(reason).trim()
  });
  if (error) { toast(friendlyError(error)); return; }
  $('#modal').close();
  editingRecord = null;
  await loadAll();
  render();
  toast('Возврат оплаты зарегистрирован отдельной операцией');
}

async function archiveEmployee(id) {
  if (!manager) return;
  const employee = data.employees.find(item => item.id === id);
  if (!employee || !employee.active) return;
  const member = employee.profileId ? data.members.find(item => item.id === employee.profileId) : null;
  if (member?.role === 'owner') {
    toast('Карточку владельца нельзя архивировать.');
    return;
  }
  if (member && !owner) {
    toast('Отключить доступ к системе может только владелец.');
    return;
  }
  if (!confirm(`Перевести сотрудника «${employee.name}» в архив? История сохранится.`)) return;
  const result = member
    ? await supabase.rpc('manage_member', { p_member_id: member.id, p_role: member.role, p_active: false })
    : await supabase.from('employees').update({ active: false }).eq('id', employee.id);
  if (result.error) {
    toast(friendlyError(result.error));
    return;
  }
  $('#modal').close();
  editingRecord = null;
  await loadAll();
  render();
  toast('Сотрудник переведён в архив');
}

async function deleteSchedule(id) {
  if (!manager || !confirm('Удалить это событие из календаря?')) return;
  const { error } = await supabase.from('schedule_items').delete().eq('id', id);
  if (error) toast(friendlyError(error));
  else {
    $('#modal').close();
    await loadAll();
    render();
    toast('Событие удалено');
  }
}

function scrollPublic(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

$('#public-site').onclick = event => {
  const scroll = event.target.closest('[data-scroll]');
  if (scroll) {
    scrollPublic(scroll.dataset.scroll);
    return;
  }
  const product = event.target.closest('[data-product]');
  if (product) {
    const select = $('#public-order-form [name=product_id]');
    select.value = product.dataset.product;
    scrollPublic('order');
    setTimeout(() => $('#public-order-form [name=quantity]').focus(), 450);
  }
};

$('#public-order-form').onsubmit = async event => {
  event.preventDefault();
  const form = event.target;
  const submit = event.submitter;
  const message = $('#public-order-message');
  const config = window.ICEFRESH_CONFIG || {};
  message.textContent = 'Отправляем заявку…';
  message.classList.remove('error');
  submit.disabled = true;
  try {
    if (!/^https:\/\/.+\.supabase\.co$/.test(config.supabaseUrl || '')) throw new Error('Сервис заявок временно недоступен. Попробуйте позже.');
    const raw = Object.fromEntries(new FormData(form));
    const idempotencyKey = form.dataset.requestKey || crypto.randomUUID();
    form.dataset.requestKey = idempotencyKey;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await fetch(`${config.supabaseUrl}/functions/v1/public-order-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: config.supabasePublishableKey },
        body: JSON.stringify({ customerName: String(raw.customer_name || '').trim(), phone: String(raw.phone || '').trim(), customerType: raw.customer_type, productId: raw.product_id, quantity: Number(raw.quantity), message: String(raw.message || '').trim(), website: String(raw.website || ''), startedAt: Number(raw.started_at), idempotencyKey }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
    let payload = {};
    try { payload = await response.json(); } catch { payload = {}; }
    if (!response.ok) {
      if (response.status === 429) throw new Error('Слишком много заявок. Подождите немного и попробуйте снова.');
      throw new Error(payload.message || 'Не удалось отправить заявку. Попробуйте ещё раз.');
    }
    form.reset();
    delete form.dataset.requestKey;
    form.elements.started_at.value = String(Date.now());
    message.textContent = 'Заявка отправлена. Сотрудник IceFresh свяжется с вами для подтверждения.';
  } catch (error) {
    message.textContent = error?.name === 'AbortError' ? 'Сервис отвечает слишком долго. Проверьте интернет и попробуйте снова.' : friendlyError(error);
    message.classList.add('error');
  } finally {
    submit.disabled = false;
  }
};

$('#auth-mode').onclick = () => go(authMode === 'signin' ? 'register' : 'login');
$('#auth-form').onsubmit = async event => {
  event.preventDefault();
  showMessage('#auth-message', 'Подождите…');
  const submit = event.submitter;
  submit.disabled = true;
  const form = new FormData(event.target);
  const email = String(form.get('email')).trim();
  const password = String(form.get('password'));
  const fullName = String(form.get('full_name') || '').trim();
  try {
    if (authMode === 'signin') {
      const { data: result, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await enter(result.session);
    } else {
      const inviteToken = sessionStorage.getItem('icefresh-invite') || '';
      if (!/^[0-9a-f-]{36}$/i.test(inviteToken)) throw new Error('Регистрация доступна только по ссылке-приглашению владельца.');
      const emailRedirectTo = `${location.origin}${location.pathname}?invite=${encodeURIComponent(inviteToken)}#/register`;
      const { data: result, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName }, emailRedirectTo }
      });
      if (error) throw error;
      if (result.session) await enter(result.session);
      else showMessage('#auth-message', 'Готово. Подтвердите email по ссылке в письме — приглашение сохранено в ссылке подтверждения.');
    }
  } catch (error) {
    showMessage('#auth-message', friendlyError(error), true);
  } finally {
    submit.disabled = false;
  }
};

$('#create-org').onsubmit = event => {
  event.preventDefault();
  showMessage('#onboarding-message', 'Новая организация в IceFresh не создаётся самостоятельно. Используйте приглашение владельца.', true);
};

$('#join-org').onsubmit = async event => {
  event.preventDefault();
  showMessage('#onboarding-message', 'Подключаю…');
  const form = new FormData(event.target);
  const { error } = await supabase.rpc('accept_invite', { p_token: String(form.get('invite_token')).trim(), p_full_name: String(form.get('full_name')) });
  if (error) {
    showMessage('#onboarding-message', friendlyError(error), true);
    return;
  }
  sessionStorage.removeItem('icefresh-invite');
  await enter(session, true);
};

$('#nav').onclick = event => {
  const button = event.target.closest('button');
  if (button) go(button.dataset.section);
};

$('#app').onclick = async event => {
  const target = event.target.closest('[data-go]');
  if (target) {
    go(target.dataset.go);
    return;
  }
  const emptyAction = event.target.closest('[data-empty-route]');
  if (emptyAction) {
    go(emptyAction.dataset.emptyRoute);
    openForm();
    return;
  }
  const aiQuestion = event.target.closest('[data-ai-question]');
  if (aiQuestion) {
    await askAi(aiQuestion.dataset.aiQuestion);
    return;
  }
  const integrationCopy = event.target.closest('[data-copy-integration]');
  if (integrationCopy) {
    const value = integrationCopyValue(integrationCopy.dataset.copyIntegration);
    if (value) await copyText(value, 'Параметр скопирован');
    return;
  }
  if (event.target.closest('[data-ai-reset]')) {
    aiMessages = [];
    aiError = '';
    render();
    return;
  }
  const requestAction = event.target.closest('[data-request-status]');
  if (requestAction) {
    await updateWebsiteRequest(requestAction.dataset.requestId, requestAction.dataset.requestStatus);
    return;
  }
  const requestAccept = event.target.closest('[data-accept-request]');
  if (requestAccept) {
    await acceptWebsiteRequest(requestAccept.dataset.acceptRequest, requestAccept);
    return;
  }
  if (event.target.closest('#invite')) {
    await createInvite();
    return;
  }
  const copyInvite = event.target.closest('[data-copy-invite]');
  if (copyInvite) {
    await copyText(inviteUrl(copyInvite.dataset.copyInvite), 'Ссылка скопирована');
    return;
  }
  const revoke = event.target.closest('[data-revoke-invite]');
  if (revoke) {
    await revokeInvite(revoke.dataset.revokeInvite);
    return;
  }
  const orderEdit = event.target.closest('[data-edit-order]');
  if (orderEdit) {
    openForm(data.orders.find(item => item.id === orderEdit.dataset.editOrder));
    return;
  }
  const clientEdit = event.target.closest('[data-edit-client]');
  if (clientEdit) {
    openForm(data.clients.find(item => item.id === clientEdit.dataset.editClient));
    return;
  }
  const productionEdit = event.target.closest('[data-edit-production]');
  if (productionEdit) {
    openForm(data.production.find(item => item.id === productionEdit.dataset.editProduction));
    return;
  }
  if (event.target.closest('[data-stock-adjust]')) {
    openInventoryAdjustmentForm();
    return;
  }
  const retry = event.target.closest('[data-retry-notification]');
  if (retry) {
    await retryNotification(retry.dataset.retryNotification, retry);
    return;
  }
  const employeeEdit = event.target.closest('[data-edit-employee]');
  if (employeeEdit) {
    openForm(data.employees.find(item => item.id === employeeEdit.dataset.editEmployee));
    return;
  }
  const productEdit = event.target.closest('[data-edit-product]');
  if (productEdit) {
    openProductForm(data.products.find(item => item.id === productEdit.dataset.editProduct));
    return;
  }
  const scheduleEdit = event.target.closest('[data-edit-schedule]');
  if (scheduleEdit) {
    openScheduleForm(data.schedule.find(item => item.id === scheduleEdit.dataset.editSchedule));
    return;
  }
  const calendarDate = event.target.closest('[data-calendar-date]');
  if (calendarDate) {
    openScheduleForm(null, calendarDate.dataset.calendarDate);
    return;
  }
  const monthNav = event.target.closest('[data-month-nav]');
  if (monthNav) {
    const amount = Number(monthNav.dataset.monthNav);
    calendarCursor = amount === 0 ? new Date(new Date().getFullYear(), new Date().getMonth(), 1) : new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + amount, 1);
    render();
  }
};

$('#app').onsubmit = async event => {
  if (!event.target.matches('#ai-form')) return;
  event.preventDefault();
  const form = new FormData(event.target);
  await askAi(form.get('question'));
};

$('#app').onchange = async event => {
  const card = event.target.closest('[data-member-card]');
  if (card && (event.target.matches('[data-member-role]') || event.target.matches('[data-member-active]'))) await updateMember(card);
};

$('#add').onclick = () => openForm();
$('#close').onclick = $('#cancel').onclick = () => $('#modal').close();
$('#menu').onclick = () => setSidebarOpen(!document.querySelector('.sidebar').classList.contains('open'));
$('#sidebar-backdrop').onclick = () => setSidebarOpen(false);
$('#mobile-bottom-nav').onclick = event => {
  const routeButton = event.target.closest('[data-section]');
  if (routeButton) { go(routeButton.dataset.section); return; }
  if (event.target.closest('[data-more]')) setSidebarOpen(true);
};
document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.querySelector('.sidebar').classList.contains('open')) setSidebarOpen(false); });
$('#go-site').onclick = () => go('home');

$('#form').onclick = async event => {
  const addLine = event.target.closest('[data-add-order-line]');
  if (addLine) {
    const lines = $('#fields [data-order-lines]');
    const index = lines.querySelectorAll('[data-order-line]').length;
    lines.insertAdjacentHTML('beforeend', orderLineTemplate({}, index));
    refreshOrderLineNames();
    recalcOrderEditorTotals();
    return;
  }
  const removeLine = event.target.closest('[data-remove-order-line]');
  if (removeLine) {
    const lines = $('#fields [data-order-lines]');
    if (lines.querySelectorAll('[data-order-line]').length <= 1) { toast('В заказе должна остаться хотя бы одна позиция.'); return; }
    removeLine.closest('[data-order-line]').remove();
    refreshOrderLineNames();
    recalcOrderEditorTotals();
    return;
  }
  const refund = event.target.closest('[data-refund-order]');
  if (refund) { await refundOrder(refund.dataset.refundOrder); return; }
  const remove = event.target.closest('[data-delete-schedule]');
  if (remove) {
    await deleteSchedule(remove.dataset.deleteSchedule);
    return;
  }
  const archive = event.target.closest('[data-archive-employee]');
  if (archive) await archiveEmployee(archive.dataset.archiveEmployee);
};

$('#form').onchange = event => {
  const productSelect = event.target.closest('[data-order-product]');
  if (!productSelect) return;
  const line = productSelect.closest('[data-order-line]');
  const product = activeProducts().find(item => item.id === productSelect.value);
  const priceInput = line?.querySelector('[data-order-price]');
  if (priceInput && product) priceInput.value = String(product.price || 0);
  recalcOrderEditorTotals();
};

$('#form').oninput = event => {
  if (event.target.closest('[data-order-qty], [data-order-price]')) recalcOrderEditorTotals();
};

$('#form').onsubmit = async event => {
  event.preventDefault();
  const submit = event.submitter;
  submit.disabled = true;
  const wasEditing = Boolean(editingRecord);
  try {
    const saved = await saveRecord(event.target);
    if (saved === false) return;
    $('#modal').close();
    await loadAll();
    render();
    toast(wasEditing ? 'Изменения сохранены' : 'Запись сохранена');
    editingRecord = null;
  } catch (error) {
    toast(friendlyError(error));
  } finally {
    submit.disabled = false;
  }
};

$('#backup').onclick = () => {
  const exportData = {
    version: 3,
    exportedAt: new Date().toISOString(),
    organization: organization?.name,
    orders: data.orders,
    clients: data.clients,
    production: data.production,
    employees: data.employees,
    accruals: data.accruals,
    products: data.products,
    schedule: data.schedule,
    requests: data.requests
  };
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' }));
  anchor.download = `icefresh-backup-${localDateKey()}.json`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
  toast('Резервная копия скачана');
};

$('#signout').onclick = $('#onboarding-signout').onclick = async () => {
  stopRealtime();
  await supabase.auth.signOut();
  resetIdentity();
  replaceRoute('login');
  applyRoute();
};

$('#global-search').oninput = event => renderGlobalSearch(event.target.value);
$('#global-search').onkeydown = event => {
  if (event.key === 'Escape') {
    event.target.value = '';
    renderGlobalSearch('');
  }
  if (event.key === 'Enter') {
    const firstResult = $('#global-search-results [data-search-route]');
    if (firstResult) firstResult.click();
  }
};
$('#global-search-results').onclick = event => {
  const result = event.target.closest('[data-search-route]');
  if (!result) return;
  $('#global-search').value = '';
  renderGlobalSearch('');
  go(result.dataset.searchRoute);
};
document.addEventListener('click', event => {
  if (!event.target.closest('.global-search')) renderGlobalSearch('');
});

$('#pwa-update-button').onclick = () => {
  if (waitingServiceWorker) waitingServiceWorker.postMessage({ type: 'SKIP_WAITING' });
};
$('#pwa-update-later').onclick = () => { $('#pwa-update').hidden = true; };
$('#reload-app').onclick = () => location.reload();

window.addEventListener('online', updateNetworkState);
window.addEventListener('offline', updateNetworkState);
window.addEventListener('error', event => showFatalError(event.error || event.message));
window.addEventListener('unhandledrejection', event => showFatalError(event.reason));
window.addEventListener('popstate', applyRoute);
window.addEventListener('hashchange', applyRoute);
init();
