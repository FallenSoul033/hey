/* global IceCore, IceRoutes */
const C=IceCore, R=IceRoutes, SDK_VERSION='2.111.0', today=()=>new Date().toISOString().slice(0,10);
const $=s=>document.querySelector(s), prod=x=>C.PRODUCTS.find(p=>p.id===x)?.name||x;
let supabase=null,session=null,profile=null,organization=null,manager=false,section='dashboard',authMode='signin',realtime=null,refreshTimer=null,appLoaded=false,hydration=null,hydratingUserId=null,hydratedUserId=null;
let data={orders:[],clients:[],production:[],employees:[],accruals:[],requests:[]};

const navAll=[['dashboard','⌂','Обзор'],['requests','✦','Заявки сайта'],['orders','▤','Заказы'],['clients','♙','Клиенты'],['production','❄','Производство'],['employees','♧','Сотрудники'],['accruals','₸','Начисления'],['warehouse','▦','Склад'],['analytics','↗','Аналитика']];
const titles={dashboard:['Обзор','Панель управления'],requests:['Продажи','Заявки с сайта'],orders:['Продажи','Заказы'],clients:['CRM','Клиенты'],production:['Операции','Производство'],employees:['Команда','Сотрудники'],accruals:['Оплата труда','Начисления'],warehouse:['Остатки','Склад'],analytics:['Показатели','Аналитика']};
const toast=t=>{const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2400)};
const showMessage=(selector,text,error=false)=>{const e=$(selector);e.textContent=text;e.classList.toggle('error',error)};
const setSync=(text,state='')=>{const e=$('#sync-state');e.textContent=text;e.className=`sync-state ${state}`};
const friendlyError=e=>{const m=e?.message||String(e||'');if(/invalid login/i.test(m))return'Неверный email или пароль.';if(/email not confirmed/i.test(m))return'Подтвердите email по ссылке в письме.';if(/already registered/i.test(m))return'Такой email уже зарегистрирован.';if(/invite is invalid/i.test(m))return'Код приглашения неверен или истёк.';if(/row-level security/i.test(m))return'У вас нет прав для этого действия.';return m||'Не удалось выполнить действие.'};

function showOnly(target){$('#public-site').hidden=target!=='public';$('#auth-screen').hidden=target!=='auth';$('#onboarding').hidden=target!=='onboarding';document.body.classList.toggle('app-ready',target==='app');document.body.classList.toggle('public-ready',target==='public')}
function route(){return R.parseHash(location.hash)}
function replaceRoute(next){history.replaceState(null,'',`${location.pathname}${location.search}#/${next}`)}
function go(next){const hash=`#/${next}`;if(location.hash===hash)applyRoute();else location.hash=hash}
function setAuthMode(next){const wanted=next==='register'?'signup':'signin',changed=authMode!==wanted;authMode=wanted;const signup=authMode==='signup';$('#auth-copy').textContent=signup?'Создайте личный аккаунт для работы в IceFresh.':'Войдите, чтобы работать с общей базой компании.';$('#auth-mode').textContent=signup?'У меня уже есть аккаунт':'Создать новый аккаунт';$('#auth-form button').textContent=signup?'Зарегистрироваться':'Войти';$('#auth-form [name=full_name]').parentElement.hidden=!signup;$('#auth-form [name=full_name]').required=signup;$('#auth-form [name=password]').autocomplete=signup?'new-password':'current-password';if(changed)showMessage('#auth-message','')}
function access(){return{authenticated:Boolean(session),active:profile?profile.active:Boolean(session),onboarded:Boolean(profile?.organization_id&&profile.role!=='pending'),role:profile?.role||null}}
function applyRoute(){
  const requested=route(),decision=R.resolve(requested,access());
  if(decision.route!==requested)replaceRoute(decision.route);
  if(decision.screen==='public'){showOnly('public');return}
  if(decision.screen==='auth'){setAuthMode(decision.route);showOnly('auth');return}
  if(decision.screen==='onboarding'){showOnly('onboarding');return}
  if(!appLoaded)return;
  section=decision.route;showOnly('app');render();
}
function resetIdentity(){stopRealtime();session=null;profile=null;organization=null;manager=false;appLoaded=false;hydratedUserId=null;hydratingUserId=null;data={orders:[],clients:[],production:[],employees:[],accruals:[],requests:[]}}

async function init(){
  $('#logo').src=$('#auth-logo').src=document.querySelector('.onboarding-logo').src=window.ICEFRESH_LOGO;
  document.querySelectorAll('.public-logo').forEach(x=>x.src=window.ICEFRESH_LOGO);
  $('#public-order-form [name=started_at]').value=String(Date.now());
  $('#auth-form [name=full_name]').parentElement.hidden=true;
  $('#setup-warning').hidden=true;$('#setup-warning').style.display='none';$('#auth-form').querySelectorAll('input,button').forEach(x=>x.disabled=false);
  const cfg=window.ICEFRESH_CONFIG||{};
  if(!/^https:\/\/.+\.supabase\.co$/.test(cfg.supabaseUrl||'')||!(/^(sb_publishable_|eyJ)/.test(cfg.supabasePublishableKey||''))){
    $('#setup-warning').hidden=false;$('#setup-warning').style.display='grid';$('#auth-form').querySelectorAll('input,button').forEach(x=>x.disabled=true);applyRoute();return;
  }
  try{
    const {createClient}=await import(`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${SDK_VERSION}/+esm`);
    supabase=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    supabase.auth.onAuthStateChange((event,next)=>{
      session=next;
      if(!next){resetIdentity();if(route()!=='home')replaceRoute('login');setTimeout(applyRoute,0);return}
      if(event==='SIGNED_IN'||event==='USER_UPDATED')setTimeout(()=>enter(next),0);
    });
    const {data:{session:existing},error:sessionError}=await supabase.auth.getSession();
    if(sessionError)throw sessionError;
    if(existing){
      const {data:{user},error:userError}=await supabase.auth.getUser();
      if(userError||!user||user.id!==existing.user.id){await supabase.auth.signOut({scope:'local'});resetIdentity();replaceRoute('login');applyRoute()}
      else await enter({...existing,user});
    }else applyRoute();
  }catch(e){showMessage('#auth-message',`Не удалось подключиться: ${friendlyError(e)}`,true);showOnly('auth')}
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js');
}

async function enter(nextSession,force=false){
  const userId=nextSession?.user?.id;if(!userId)return;
  session=nextSession;
  if(!force&&hydration&&hydratingUserId===userId)return hydration;
  if(!force&&hydratedUserId===userId&&profile){applyRoute();return}
  hydratingUserId=userId;
  hydration=(async()=>{
    setSync('Синхронизация…');
    const {data:p,error}=await supabase.from('profiles').select('id,organization_id,full_name,role,active').eq('id',userId).maybeSingle();
    if(error){showMessage('#auth-message',friendlyError(error),true);showOnly('auth');return}
    profile=p;hydratedUserId=userId;
    if(!profile||!profile.organization_id||profile.role==='pending'){appLoaded=false;stopRealtime();replaceRoute('onboarding');applyRoute();return}
    if(!profile.active){await supabase.auth.signOut();showMessage('#auth-message','Ваш доступ отключён владельцем.',true);return}
    manager=['owner','admin'].includes(profile.role);buildNav();
    appLoaded=await loadAll();
    if(!appLoaded)return;
    subscribe();applyRoute();
  })();
  try{return await hydration}finally{if(hydratingUserId===userId){hydration=null;hydratingUserId=null}}
}

async function loadAll(){
  setSync('Синхронизация…');
  const requests=[
    supabase.from('organizations').select('id,name').eq('id',profile.organization_id).single(),
    supabase.from('clients').select('*').order('created_at',{ascending:false}),
    supabase.from('employees').select('*').eq('active',true).order('full_name'),
    supabase.from('orders').select('*').order('order_date',{ascending:false}).order('created_at',{ascending:false}),
    supabase.from('production_entries').select('*').order('production_date',{ascending:false}).order('created_at',{ascending:false}),
    supabase.from('website_requests').select('id,organization_id,customer_name,phone,customer_type,product_id,quantity,message,status,source,created_at,updated_at').order('created_at',{ascending:false})
  ];
  if(manager)requests.push(supabase.from('accruals').select('*').order('accrual_date',{ascending:false}).order('created_at',{ascending:false}));
  const results=await Promise.all(requests),firstError=results.find(x=>x.error)?.error;
  if(firstError){setSync('Ошибка','bad');toast(friendlyError(firstError));return false}
  organization=results[0].data;
  data.clients=results[1].data.map(x=>({id:x.id,name:x.name,category:x.category,phone:x.phone}));
  data.employees=results[2].data.map(x=>({id:x.id,name:x.full_name,role:x.position,phone:x.phone}));
  data.orders=results[3].data.map(x=>({id:x.id,date:x.order_date,clientId:x.client_id,client:x.client_name,product:x.product_id,qty:Number(x.quantity),price:Number(x.unit_price),paid:Number(x.paid_amount),status:x.status}));
  data.production=results[4].data.map(x=>({id:x.id,date:x.production_date,product:x.product_id,qty:Number(x.quantity),employeeId:x.employee_id,employee:x.employee_name}));
  data.requests=results[5].data.map(x=>({id:x.id,date:x.created_at,name:x.customer_name,phone:x.phone,type:x.customer_type,product:x.product_id,qty:Number(x.quantity),message:x.message,status:x.status,source:x.source}));
  data.accruals=manager?results[6].data.map(x=>({id:x.id,date:x.accrual_date,employeeId:x.employee_id,employee:x.employee_name,description:x.description,qty:Number(x.quantity),rate:Number(x.rate),paid:x.paid})):[];
  document.querySelector('.brand small').textContent=organization.name;document.querySelector('.privacy').textContent=`● Онлайн · ${profile.full_name}`;
  buildNav();setSync('Синхронизировано','ok');return true;
}

function subscribe(){stopRealtime();realtime=supabase.channel(`icefresh-${profile.organization_id}`);for(const tableName of ['clients','employees','orders','production_entries','website_requests',...(manager?['accruals']:[])])realtime.on('postgres_changes',{event:'*',schema:'public',table:tableName,filter:`organization_id=eq.${profile.organization_id}`},scheduleRefresh);realtime.subscribe(status=>setSync(status==='SUBSCRIBED'?'Онлайн':'Подключение…',status==='SUBSCRIBED'?'ok':''))}
function stopRealtime(){if(realtime&&supabase)supabase.removeChannel(realtime);realtime=null}
function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(loadAll,350)}
function buildNav(){const allowed=manager?navAll:navAll.filter(x=>!['employees','accruals','analytics'].includes(x[0])),newCount=data.requests.filter(x=>x.status==='Новая').length;$('#nav').innerHTML=allowed.map(n=>`<button data-section="${n[0]}"><span>${n[1]}</span>${n[2]}${n[0]==='requests'&&newCount?` <b class="nav-count">${newCount}</b>`:''}</button>`).join('')}

function metrics(){const os=data.orders.filter(o=>o.status!=='Отменён'),sales=os.reduce((s,o)=>s+C.calcOrder(o).total,0),paid=os.reduce((s,o)=>s+C.calcOrder(o).paid,0),wage=data.accruals.reduce((s,a)=>s+C.calcAccrual(a),0);return{sales,paid,debt:sales-paid,wage,orders:os.length}}
function cards(){const m=metrics();return `<div class="metrics"><article><i>Продажи</i><b>${C.money(m.sales)}</b><small>${m.orders} активных заказов</small></article><article><i>Получено</i><b>${C.money(m.paid)}</b><small class="ok">Оплаченная сумма</small></article><article><i>Дебиторка</i><b>${C.money(m.debt)}</b><small class="warn">Ожидается оплата</small></article>${manager?`<article><i>Начисления</i><b>${C.money(m.wage)}</b><small>За весь период</small></article>`:`<article><i>Статус</i><b class="online-big">Онлайн</b><small>Общая база обновляется</small></article>`}</div>`}
const empty=t=>`<div class="empty">${C.esc(t)}</div>`,badge=s=>`<span class="badge ${s==='Выполнен'||s==='Оплачено'?'green':s==='Отменён'?'red':''}">${C.esc(s)}</span>`;
const requestBadge=s=>`<span class="badge ${s==='Принята'?'green':s==='Закрыта'?'red':''}">${C.esc(s)}</span>`,dateTime=v=>new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short'}).format(new Date(v));
function table(headers,rows){return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${headers.length}">${empty('Записей пока нет')}</td></tr>`}</tbody></table></div>`}
function dashboard(){const inv=C.inventory(data.production,data.orders),newRequests=data.requests.filter(x=>x.status==='Новая').length,requestAlert=newRequests?`<button class="request-alert" data-go="requests"><span><b>${newRequests} ${newRequests===1?'новая заявка':'новых заявок'} с сайта</b><span>Посетители IceFresh ожидают обратной связи.</span></span><strong>Открыть →</strong></button>`:'';return `${requestAlert}${cards()}<div class="grid2"><article class="panel"><div class="panel-head"><div><p class="eyebrow">Актуальные данные</p><h2>Последние заказы</h2></div><button class="link" data-go="orders">Все заказы →</button></div>${table(['Клиент','Товар','Сумма','Статус'],data.orders.slice(0,5).map(o=>`<tr><td><b>${C.esc(o.client)}</b></td><td>${prod(o.product)} × ${o.qty}</td><td>${C.money(C.calcOrder(o).total)}</td><td>${badge(o.status)}</td></tr>`).join(''))}</article><article class="panel"><div class="panel-head"><div><p class="eyebrow">Остатки</p><h2>Склад готовой продукции</h2></div><button class="link" data-go="warehouse">Подробнее →</button></div><div class="stocks">${inv.map(x=>`<div><span>${x.name}<small>${x.made} произведено · ${x.sold} отгружено</small></span><b class="${x.stock<0?'danger':''}">${x.stock} ${x.unit}</b></div>`).join('')}</div></article></div>`}
function requests(){const fresh=data.requests.filter(x=>x.status==='Новая').length,active=data.requests.filter(x=>['Новая','Связались','Принята'].includes(x.status)).length;return `<div class="metrics mini"><article><i>Новые</i><b>${fresh}</b><small>Нужно связаться</small></article><article><i>В работе</i><b>${active}</b><small>Открытые заявки</small></article><article><i>Всего</i><b>${data.requests.length}</b><small>За всё время</small></article></div><article class="panel">${table(['Дата','Клиент','Телефон','Тип','Продукция','Кол-во','Комментарий','Статус','Действия'],data.requests.map(x=>`<tr><td>${dateTime(x.date)}</td><td><b>${C.esc(x.name)}</b></td><td>${C.esc(x.phone)}</td><td>${x.type==='business'?'Бизнес':'Частный'}</td><td>${prod(x.product)}</td><td>${x.qty}</td><td>${C.esc(x.message||'—')}</td><td>${requestBadge(x.status)}</td><td><div class="request-actions">${x.status==='Новая'?`<button data-request-id="${x.id}" data-request-status="Связались">Связались</button>`:''}${x.status!=='Принята'&&x.status!=='Закрыта'?`<button data-request-id="${x.id}" data-request-status="Принята">Принять</button>`:''}${x.status!=='Закрыта'?`<button data-request-id="${x.id}" data-request-status="Закрыта">Закрыть</button>`:`<button data-request-id="${x.id}" data-request-status="Новая">Вернуть</button>`}</div></td></tr>`).join(''))}</article><p class="note">Заявка с сайта не меняет склад и финансовые показатели. После подтверждения создайте обычный заказ.</p>`}
function orders(){return cards()+`<article class="panel">${table(['Дата','Клиент','Товар','Кол-во','Итого','Оплачено','Долг','Статус'],data.orders.map(o=>{const x=C.calcOrder(o);return `<tr><td>${o.date}</td><td><b>${C.esc(o.client)}</b></td><td>${prod(o.product)}</td><td>${o.qty}</td><td>${C.money(x.total)}</td><td>${C.money(x.paid)}</td><td class="${x.debt?'danger':''}">${C.money(x.debt)}</td><td>${badge(o.status)}</td></tr>`}).join(''))}</article>`}
function clients(){return `<div class="category-row">${['Магазины','HoReCa','Частные клиенты','Оптовые клиенты'].map(x=>`<article><span>${x}</span><b>${data.clients.filter(c=>c.category===x).length}</b></article>`).join('')}</div><article class="panel">${table(['Клиент','Категория','Телефон','Заказов','Выручка'],data.clients.map(c=>{const os=data.orders.filter(o=>o.clientId===c.id),sum=os.reduce((s,o)=>s+C.calcOrder(o).total,0);return `<tr><td><b>${C.esc(c.name)}</b></td><td>${badge(c.category)}</td><td>${C.esc(c.phone)}</td><td>${os.length}</td><td>${C.money(sum)}</td></tr>`}).join(''))}</article>`}
function production(){return `<article class="panel">${table(['Дата','Продукция','Количество','Сотрудник'],data.production.map(x=>`<tr><td>${x.date}</td><td><b>${prod(x.product)}</b></td><td>${x.qty} шт.</td><td>${C.esc(x.employee)}</td></tr>`).join(''))}</article>`}
function employees(){return `<div class="section-actions"><button class="primary" id="invite">＋ Создать приглашение</button><span>Код действует 7 дней и используется один раз.</span></div><div class="people">${data.employees.map(e=>`<article class="person"><div class="avatar">${C.esc(e.name).slice(0,1)}</div><div><h3>${C.esc(e.name)}</h3><p>${C.esc(e.role)}</p><small>${C.esc(e.phone)}</small></div></article>`).join('')||empty('Добавьте первого сотрудника')}</div>`}
function accruals(){const total=data.accruals.reduce((s,a)=>s+C.calcAccrual(a),0),paid=data.accruals.filter(a=>a.paid).reduce((s,a)=>s+C.calcAccrual(a),0);return `<div class="metrics mini"><article><i>Всего начислено</i><b>${C.money(total)}</b></article><article><i>Выплачено</i><b>${C.money(paid)}</b></article><article><i>К выплате</i><b>${C.money(total-paid)}</b></article></div><article class="panel">${table(['Дата','Сотрудник','Основание','Объём','Ставка','Начислено','Статус'],data.accruals.map(a=>`<tr><td>${a.date}</td><td><b>${C.esc(a.employee)}</b></td><td>${C.esc(a.description)}</td><td>${a.qty}</td><td>${C.money(a.rate)}</td><td>${C.money(C.calcAccrual(a))}</td><td>${badge(a.paid?'Оплачено':'К выплате')}</td></tr>`).join(''))}</article><p class="note">Начисление = объём выполненной работы × ставка. Отметка выплаты не меняет сумму начисления.</p>`}
function warehouse(){const inv=C.inventory(data.production,data.orders);return `<div class="product-cards">${inv.map(x=>`<article><div class="cube">❄</div><h3>${x.name}</h3><b class="stock-big ${x.stock<0?'danger':''}">${x.stock} <small>${x.unit}</small></b><div class="stock-line"><span>Произведено <b>${x.made}</b></span><span>Отгружено <b>${x.sold}</b></span></div>${x.stock<0?'<p class="alert">Остаток отрицательный: проверьте производство и отгрузки.</p>':''}</article>`).join('')}</div><p class="note">Остаток рассчитывается автоматически: произведено − отгружено по неотменённым заказам.</p>`}
function analytics(){const m=metrics(),by=C.PRODUCTS.map(p=>({name:p.name,total:data.orders.filter(o=>o.product===p.id&&o.status!=='Отменён').reduce((s,o)=>s+C.calcOrder(o).total,0)})),max=Math.max(1,...by.map(x=>x.total));return `${cards()}<div class="grid2"><article class="panel"><h2>Продажи по ассортименту</h2><div class="bars">${by.map(x=>`<div><span>${x.name}</span><div><i style="width:${x.total/max*100}%"></i></div><b>${C.money(x.total)}</b></div>`).join('')}</div></article><article class="panel"><h2>Финансовая сводка</h2><dl class="summary"><div><dt>Начисленная выручка</dt><dd>${C.money(m.sales)}</dd></div><div><dt>Поступившие оплаты</dt><dd>${C.money(m.paid)}</dd></div><div><dt>Дебиторская задолженность</dt><dd>${C.money(m.debt)}</dd></div><div><dt>Начисления сотрудникам</dt><dd>${C.money(m.wage)}</dd></div></dl><p class="note">Это управленческий учёт, не налоговая или бухгалтерская отчётность.</p></article></div>`}
const views={dashboard,requests,orders,clients,production,employees,accruals,warehouse,analytics};
function render(){if(!views[section])section='dashboard';const t=titles[section];$('#eyebrow').textContent=t[0];$('#title').textContent=t[1];$('#app').innerHTML=views[section]();document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.section===section));$('#add').hidden=['dashboard','requests','warehouse','analytics'].includes(section)||(!manager&&['employees','accruals'].includes(section));document.querySelector('.sidebar').classList.remove('open')}

const schemas={
  orders:[['date','Дата','date',today()],['clientId','Клиент','select',()=>data.clients.map(x=>[x.id,x.name])],['product','Продукция','select',C.PRODUCTS.map(x=>[x.id,x.name])],['qty','Количество','number',1],['price','Цена за единицу, ₸','number',500],['paid','Оплачено, ₸','number',0],['status','Статус','select',['Новый','В доставке','Выполнен','Отменён']]],
  clients:[['name','Название / имя','text',''],['category','Категория','select',['Магазины','HoReCa','Частные клиенты','Оптовые клиенты']],['phone','Телефон','tel','']],
  production:[['date','Дата','date',today()],['product','Продукция','select',C.PRODUCTS.map(x=>[x.id,x.name])],['qty','Количество','number',1],['employeeId','Сотрудник','select',()=>data.employees.map(x=>[x.id,x.name])]],
  employees:[['name','Имя сотрудника','text',''],['role','Должность','text','Сотрудник производства'],['phone','Телефон','tel','']],
  accruals:[['date','Дата','date',today()],['employeeId','Сотрудник','select',()=>data.employees.map(x=>[x.id,x.name])],['description','Основание начисления','text','Фасовка продукции'],['qty','Объём работы','number',1],['rate','Ставка за единицу, ₸','number',25],['paid','Выплачено','checkbox',false]]
};
function openForm(){const s=schemas[section];if(!s)return;if(['orders','production','accruals'].includes(section)&&((section==='orders'&&!data.clients.length)||(section!=='orders'&&!data.employees.length))){toast(section==='orders'?'Сначала добавьте клиента':'Сначала добавьте сотрудника');return}$('#modal-title').textContent=({orders:'Добавить заказ',clients:'Добавить клиента',production:'Записать производство',employees:'Добавить сотрудника',accruals:'Добавить начисление'})[section];$('#fields').innerHTML=s.map(([n,l,t,v])=>{v=typeof v==='function'?v():v;if(t==='select')return `<label>${l}<select name="${n}" required>${v.map(o=>Array.isArray(o)?`<option value="${C.esc(o[0])}">${C.esc(o[1])}</option>`:`<option>${C.esc(o)}</option>`).join('')}</select></label>`;if(t==='checkbox')return `<label class="check"><input name="${n}" type="checkbox"> ${l}</label>`;return `<label>${l}<input name="${n}" type="${t}" value="${C.esc(v)}" ${t==='number'?'min="0" step="0.01"':''} required></label>`}).join('');$('#modal').showModal()}

async function saveRecord(form){
  const raw=Object.fromEntries(new FormData(form));(schemas[section]||[]).forEach(([n,,t])=>{if(t==='number')raw[n]=Number(raw[n]);if(t==='checkbox')raw[n]=form.elements[n].checked});
  const common={organization_id:profile.organization_id,created_by:session.user.id};let tableName,payload;
  if(section==='clients'){tableName='clients';payload={...common,name:raw.name.trim(),category:raw.category,phone:raw.phone.trim()}}
  if(section==='employees'){tableName='employees';payload={...common,full_name:raw.name.trim(),position:raw.role.trim(),phone:raw.phone.trim()}}
  if(section==='orders'){const c=data.clients.find(x=>x.id===raw.clientId);tableName='orders';payload={...common,order_date:raw.date,client_id:c.id,client_name:c.name,product_id:raw.product,quantity:raw.qty,unit_price:raw.price,paid_amount:raw.paid,status:raw.status}}
  if(section==='production'){const e=data.employees.find(x=>x.id===raw.employeeId);tableName='production_entries';payload={...common,production_date:raw.date,product_id:raw.product,quantity:raw.qty,employee_id:e.id,employee_name:e.name}}
  if(section==='accruals'){const e=data.employees.find(x=>x.id===raw.employeeId);tableName='accruals';payload={...common,accrual_date:raw.date,employee_id:e.id,employee_name:e.name,description:raw.description.trim(),quantity:raw.qty,rate:raw.rate,paid:raw.paid}}
  if(!tableName)throw Error('Раздел недоступен');const {error}=await supabase.from(tableName).insert(payload);if(error)throw error;
}

async function createInvite(){const {data:invite,error}=await supabase.from('organization_invites').insert({organization_id:profile.organization_id,role:'staff',created_by:session.user.id}).select('token,expires_at').single();if(error){toast(friendlyError(error));return}let copied=false;try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(invite.token);copied=true}}catch{copied=false}window.prompt('Передайте этот одноразовый код сотруднику:',invite.token);toast(copied?'Код приглашения скопирован':'Код приглашения создан')}

async function updateWebsiteRequest(id,status){
  if(!['Новая','Связались','Принята','Закрыта'].includes(status))return;
  const {error}=await supabase.from('website_requests').update({status}).eq('id',id);
  if(error){toast(friendlyError(error));return}
  await loadAll();render();toast('Статус заявки обновлён');
}

function scrollPublic(id){document.getElementById(id)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})}

$('#public-site').onclick=e=>{
  const scroll=e.target.closest('[data-scroll]');if(scroll){scrollPublic(scroll.dataset.scroll);return}
  const product=e.target.closest('[data-product]');if(product){const select=$('#public-order-form [name=product_id]');select.value=product.dataset.product;scrollPublic('order');setTimeout(()=>$('#public-order-form [name=quantity]').focus(),450)}
};

$('#public-order-form').onsubmit=async e=>{
  e.preventDefault();const form=e.target,submit=e.submitter,message=$('#public-order-message'),cfg=window.ICEFRESH_CONFIG||{};
  message.textContent='Отправляем заявку…';message.classList.remove('error');submit.disabled=true;
  try{
    if(!/^https:\/\/.+\.supabase\.co$/.test(cfg.supabaseUrl||''))throw Error('Сервис заявок временно недоступен. Попробуйте позже.');
    const raw=Object.fromEntries(new FormData(form));
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    let response;
    try{response=await fetch(`${cfg.supabaseUrl}/functions/v1/public-order-request`,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.supabasePublishableKey},body:JSON.stringify({customerName:String(raw.customer_name||'').trim(),phone:String(raw.phone||'').trim(),customerType:raw.customer_type,productId:raw.product_id,quantity:Number(raw.quantity),message:String(raw.message||'').trim(),website:String(raw.website||''),startedAt:Number(raw.started_at)}),signal:controller.signal})}finally{clearTimeout(timer)}
    let payload={};try{payload=await response.json()}catch{payload={}}
    if(!response.ok){if(response.status===429)throw Error('Слишком много заявок. Подождите немного и попробуйте снова.');throw Error(payload.message||'Не удалось отправить заявку. Попробуйте ещё раз.');}
    form.reset();form.elements.started_at.value=String(Date.now());message.textContent='Заявка отправлена. Сотрудник IceFresh свяжется с вами для подтверждения.';
  }catch(err){message.textContent=err?.name==='AbortError'?'Сервис отвечает слишком долго. Проверьте интернет и попробуйте снова.':friendlyError(err);message.classList.add('error')}
  finally{submit.disabled=false}
};

$('#auth-mode').onclick=()=>go(authMode==='signin'?'register':'login');
$('#auth-form').onsubmit=async e=>{e.preventDefault();showMessage('#auth-message','Подождите…');const submit=e.submitter;submit.disabled=true;const f=new FormData(e.target),email=String(f.get('email')).trim(),password=String(f.get('password')),full_name=String(f.get('full_name')||'').trim();try{if(authMode==='signin'){const {data:r,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;await enter(r.session)}else{const {data:r,error}=await supabase.auth.signUp({email,password,options:{data:{full_name}}});if(error)throw error;if(r.session)await enter(r.session);else showMessage('#auth-message','Готово. Подтвердите email по ссылке в письме.')}}catch(err){showMessage('#auth-message',friendlyError(err),true)}finally{submit.disabled=false}};
$('#create-org').onsubmit=async e=>{e.preventDefault();showMessage('#onboarding-message','Создаю…');const f=new FormData(e.target),{error}=await supabase.rpc('create_organization',{p_name:String(f.get('organization_name')),p_full_name:String(f.get('full_name'))});if(error){showMessage('#onboarding-message',friendlyError(error),true);return}await enter(session,true)};
$('#join-org').onsubmit=async e=>{e.preventDefault();showMessage('#onboarding-message','Подключаю…');const f=new FormData(e.target),{error}=await supabase.rpc('accept_invite',{p_token:String(f.get('invite_token')).trim(),p_full_name:String(f.get('full_name'))});if(error){showMessage('#onboarding-message',friendlyError(error),true);return}await enter(session,true)};
$('#nav').onclick=e=>{const b=e.target.closest('button');if(b)go(b.dataset.section)};
$('#app').onclick=e=>{const target=e.target.closest('[data-go]');if(target){go(target.dataset.go);return}const requestAction=e.target.closest('[data-request-status]');if(requestAction){updateWebsiteRequest(requestAction.dataset.requestId,requestAction.dataset.requestStatus);return}if(e.target.closest('#invite'))createInvite()};
$('#add').onclick=openForm;$('#close').onclick=$('#cancel').onclick=()=>$('#modal').close();$('#menu').onclick=()=>document.querySelector('.sidebar').classList.toggle('open');
$('#form').onsubmit=async e=>{e.preventDefault();const submit=e.submitter;submit.disabled=true;try{await saveRecord(e.target);$('#modal').close();await loadAll();toast('Запись сохранена')}catch(err){toast(friendlyError(err))}finally{submit.disabled=false}};
$('#backup').onclick=()=>{const exportData={version:2,exportedAt:new Date().toISOString(),organization:organization?.name,...data};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(exportData,null,2)],{type:'application/json'}));a.download=`icefresh-backup-${today()}.json`;a.click();URL.revokeObjectURL(a.href);toast('Резервная копия скачана')};
$('#signout').onclick=$('#onboarding-signout').onclick=async()=>{stopRealtime();await supabase.auth.signOut();resetIdentity();replaceRoute('login');applyRoute()};
window.addEventListener('hashchange',applyRoute);

init();
