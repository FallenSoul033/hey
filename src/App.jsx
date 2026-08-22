import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  archiveOrder, loadAuditTrail, loadCatalog, loadCurrentProfile, loadEventDetail,
  loadEvents, loadFinanceSummary, loadOrders, saveOrder, signIn, signOut,
} from './api.js'
import {
  canArchiveOrder, eventLabel, formatDate, formatMoney, isManager, statusOptions,
} from './domain.js'
import { InventoryPage, ProductionPage } from './Operations.jsx'

const NAV = [
  ['dashboard', '⌂', 'Обзор'],
  ['orders', '▤', 'Заказы'],
  ['production', '◈', 'Производство'],
  ['inventory', '▦', 'Склад'],
  ['events', '◎', 'События системы'],
]

function App() {
  const [profile, setProfile] = useState(undefined)
  const [page, setPage] = useState('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    loadCurrentProfile().then(setProfile).catch((error) => {
      console.error(error)
      setProfile(null)
    })
  }, [])

  if (profile === undefined) return <div className="center"><div className="spinner" /><b>IceFresh</b><span>Загрузка…</span></div>
  if (!profile) return <Login onDone={async () => setProfile(await loadCurrentProfile())} />
  if (!profile.active || profile.role === 'pending' || !profile.organization_id) {
    return <PendingAccess profile={profile} onExit={async () => { await signOut(); setProfile(null) }} />
  }

  const nav = NAV.filter(([id]) => id !== 'events' || isManager(profile.role))
  return (
    <div className="shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand"><div className="snow">❄</div><div><b>IceFresh</b><small>CRM</small></div></div>
        <nav className="nav">{nav.map(([id, icon, label]) => (
          <button key={id} className={page === id ? 'active' : ''} onClick={() => { setPage(id); setMenuOpen(false) }}>
            <span>{icon}</span>{label}
          </button>
        ))}</nav>
        <div className="account">
          <div className="avatar">{(profile.full_name || profile.email || '?')[0].toUpperCase()}</div>
          <div><b>{profile.full_name || 'Пользователь'}</b><small>{roleName(profile.role)}</small></div>
          <button className="link" onClick={async () => { await signOut(); setProfile(null) }}>Выйти</button>
        </div>
      </aside>
      {menuOpen && <button className="scrim" aria-label="Закрыть меню" onClick={() => setMenuOpen(false)} />}
      <main>
        <header className="topbar">
          <button className="burger" onClick={() => setMenuOpen(true)}>☰</button>
          <div><h1>{nav.find(([id]) => id === page)?.[2] || 'IceFresh'}</h1><p>Управление заказами и производством</p></div>
          <span className="role">{roleName(profile.role)}</span>
        </header>
        <div className="content">
          {page === 'dashboard' && <Dashboard profile={profile} goOrders={() => setPage('orders')} />}
          {page === 'orders' && <Orders profile={profile} />}
          {page === 'production' && <ProductionPage />}
          {page === 'inventory' && <InventoryPage profile={profile} />}
          {page === 'events' && isManager(profile.role) && <Events profile={profile} />}
        </div>
      </main>
    </div>
  )
}

function Login({ onDone }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try { await signIn(email.trim(), password); await onDone() }
    catch (e) { setError(e.message || 'Не удалось войти') }
    finally { setBusy(false) }
  }
  return <div className="login-wrap"><form className="login-card" onSubmit={submit}>
    <div className="login-logo">❄</div><h1>IceFresh</h1><p>Вход в CRM</p>
    <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
    <label>Пароль<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
    {error && <div className="error">{error}</div>}
    <button className="primary" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button>
  </form></div>
}

function PendingAccess({ profile, onExit }) {
  return <div className="login-wrap"><section className="login-card pending-card">
    <div className="login-logo">❄</div><h1>Доступ ожидает подтверждения</h1>
    <p>{profile.full_name || profile.email}, аккаунт создан, но роль в IceFresh ещё не назначена.</p>
    <div className="warning"><b>Рабочие данные пока закрыты</b><span>Владелец или администратор должен добавить пользователя в организацию и назначить роль.</span></div>
    <button className="secondary" onClick={onExit}>Выйти</button>
  </section></div>
}

function Dashboard({ profile, goOrders }) {
  const [orders, setOrders] = useState([])
  const [finance, setFinance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [orderRows, financeRow] = await Promise.all([loadOrders(profile), loadFinanceSummary(profile)])
      setOrders(orderRows); setFinance(financeRow)
    } catch (e) { setError(e.message || 'Ошибка загрузки') }
    finally { setLoading(false) }
  }, [profile])
  useEffect(() => { refresh() }, [refresh])
  const counts = useMemo(() => ({
    all: orders.length,
    active: orders.filter((o) => !['Выполнен', 'Отменён'].includes(o.status)).length,
    done: orders.filter((o) => o.status === 'Выполнен').length,
    cancelled: orders.filter((o) => o.status === 'Отменён').length,
  }), [orders])
  return <section className="stack">
    <Heading title="Сегодня в IceFresh" text="Ключевые показатели" action={<button className="secondary" onClick={refresh}>↻ Обновить</button>} />
    {error && <div className="error">{error}</div>}
    {isManager(profile.role) && <div className="metrics">
      <Metric title="Продажи" value={loading ? '…' : formatMoney(finance?.sales)} note="Только доставленные и выполненные" />
      <Metric title="Оплачено" value={loading ? '…' : formatMoney(finance?.paid)} note="Фактически полученные платежи" />
      <Metric title="Дебиторка" value={loading ? '…' : formatMoney(finance?.debt)} note="Неоплаченный остаток" />
      <Metric title="Возвраты" value={loading ? '…' : formatMoney(finance?.refunded)} note="Проведённые возвраты" />
    </div>}
    <div className="metrics compact">
      <Metric title="Заказов" value={loading ? '…' : counts.all} note="В текущем списке" />
      <Metric title="Активные" value={loading ? '…' : counts.active} note="Требуют действий" />
      <Metric title="Выполнено" value={loading ? '…' : counts.done} note="Завершённые" />
      <Metric title="Отменено" value={loading ? '…' : counts.cancelled} note="Не входит в выручку" />
    </div>
    <div className="panel"><div className="panel-head"><div><h3>Последние заказы</h3><p>Быстрый контроль</p></div><button className="link" onClick={goOrders}>Все заказы →</button></div><OrderTable orders={orders.slice(0, 6)} profile={profile} /></div>
  </section>
}

function Metric({ title, value, note }) {
  return <article className="metric"><span>{title}</span><b>{value}</b><small>{note}</small></article>
}

function Orders({ profile }) {
  const [orders, setOrders] = useState([])
  const [catalog, setCatalog] = useState({ clients: [], products: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(undefined)
  const [archiveTarget, setArchiveTarget] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [orderRows, catalogRows] = await Promise.all([loadOrders(profile), loadCatalog()])
      setOrders(orderRows); setCatalog(catalogRows)
    } catch (e) { setError(e.message || 'Ошибка загрузки заказов') }
    finally { setLoading(false) }
  }, [profile])
  useEffect(() => { refresh() }, [refresh])

  const filtered = orders.filter((o) => {
    const needle = query.trim().toLowerCase()
    return !needle || `${o.client_name} ${o.status} ${o.id}`.toLowerCase().includes(needle)
  })

  return <section className="stack">
    <Heading title="Заказы" text="Создание, статусы, оплаты и контроль владельца" action={<button className="primary" onClick={() => setEditing(null)}>+ Новый заказ</button>} />
    <div className="toolbar"><input placeholder="Поиск по клиенту, статусу или ID" value={query} onChange={(e) => setQuery(e.target.value)} /><button className="secondary" onClick={refresh}>↻</button></div>
    {error && <div className="error">{error}</div>}
    <div className="panel no-pad">{loading ? <div className="empty">Загрузка…</div> : <OrderTable orders={filtered} profile={profile} onEdit={setEditing} onArchive={canArchiveOrder(profile.role) ? setArchiveTarget : null} />}</div>
    {editing !== undefined && <OrderEditor profile={profile} order={editing} catalog={catalog} onClose={() => setEditing(undefined)} onSaved={async () => { setEditing(undefined); await refresh() }} />}
    {archiveTarget && <ArchiveDialog order={archiveTarget} onClose={() => setArchiveTarget(null)} onDone={async () => { setArchiveTarget(null); await refresh() }} />}
  </section>
}

function OrderTable({ orders, profile, onEdit, onArchive }) {
  if (!orders.length) return <div className="empty">Заказов пока нет</div>
  return <div className="table-wrap"><table><thead><tr><th>Дата</th><th>Клиент</th><th>Состав</th><th>Статус</th>{isManager(profile.role) && <th>Сумма</th>}{onEdit && <th />}</tr></thead><tbody>
    {orders.map((o) => <tr key={o.id}><td>{formatDate(o.order_date)}</td><td><b>{o.client_name}</b><small className="id">{o.id.slice(0, 8)}</small></td><td>{(o.items || []).map((i) => <div key={i.id || `${o.id}-${i.product_id}`}>{i.product_id} × {Number(i.quantity)}</div>)}</td><td><span className={`status ${statusTone(o.status)}`}>{o.status}</span></td>{isManager(profile.role) && <td><b>{formatMoney(o.total_amount ?? (o.items || []).reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_price || 0), 0))}</b><small className="id">оплачено {formatMoney(o.paid_amount)}</small></td>}{onEdit && <td><div className="actions"><button className="link" onClick={() => onEdit(o)}>Изменить</button>{onArchive && <button className="danger-link" onClick={() => onArchive(o)}>Удалить</button>}</div></td>}</tr>)}
  </tbody></table></div>
}

function OrderEditor({ profile, order, catalog, onClose, onSaved }) {
  const fallbackProduct = catalog.products[0]
  const initialItems = order?.items?.length ? order.items : [{ product_id: fallbackProduct?.id || '', quantity: 1, unit_price: fallbackProduct?.default_price || 0 }]
  const [form, setForm] = useState({
    order_date: order?.order_date || new Date().toISOString().slice(0, 10),
    client_id: order?.client_id || catalog.clients[0]?.id || '',
    status: order?.status || 'Новый',
    paid_amount: order?.paid_amount || 0,
    items: initialItems.map((item) => ({
      product_id: item.product_id,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price ?? catalog.products.find((p) => p.id === item.product_id)?.default_price ?? 0),
    })),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const options = statusOptions(profile.role, order?.status, !order)

  function patchItem(index, field, value) {
    setForm((current) => ({ ...current, items: current.items.map((item, i) => {
      if (i !== index) return item
      if (field === 'product_id') {
        const product = catalog.products.find((p) => p.id === value)
        return { ...item, product_id: value, unit_price: Number(product?.default_price || 0) }
      }
      return { ...item, [field]: value }
    }) }))
  }

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      if (!form.client_id) throw new Error('Выберите клиента')
      if (!form.items.length || form.items.some((i) => !i.product_id || Number(i.quantity) <= 0)) throw new Error('Проверьте состав заказа')
      await saveOrder({ profile, order, form }); await onSaved()
    } catch (e) { setError(e.message || 'Не удалось сохранить заказ') }
    finally { setBusy(false) }
  }

  return <Modal title={order ? 'Изменить заказ' : 'Новый заказ'} onClose={onClose}><form className="form" onSubmit={submit}>
    <div className="form-grid">
      <label>Дата<input type="date" value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} required /></label>
      <label>Клиент<select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} required><option value="">Выберите клиента</option>{catalog.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Статус<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{options.map((s) => <option key={s}>{s}</option>)}</select></label>
      {isManager(profile.role) && <label>Оплачено, ₸<input type="number" min="0" step="1" value={form.paid_amount} onChange={(e) => setForm({ ...form, paid_amount: e.target.value })} /></label>}
    </div>
    <div className="subsection"><div className="subhead"><b>Состав заказа</b><button type="button" className="link" onClick={() => setForm({ ...form, items: [...form.items, { product_id: fallbackProduct?.id || '', quantity: 1, unit_price: fallbackProduct?.default_price || 0 }] })}>+ Добавить позицию</button></div>
      {form.items.map((item, index) => <div className="item-row" key={`${index}-${item.product_id}`}>
        <select value={item.product_id} onChange={(e) => patchItem(index, 'product_id', e.target.value)}>{catalog.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <input aria-label="Количество" type="number" min="0.01" step="0.01" value={item.quantity} onChange={(e) => patchItem(index, 'quantity', e.target.value)} />
        {isManager(profile.role) && <input aria-label="Цена" type="number" min="0" step="1" value={item.unit_price} onChange={(e) => patchItem(index, 'unit_price', e.target.value)} />}
        {form.items.length > 1 && <button type="button" className="remove" onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== index) })}>×</button>}
      </div>)}
    </div>
    {error && <div className="error">{error}</div>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Отмена</button><button className="primary" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button></div>
  </form></Modal>
}

function ArchiveDialog({ order, onClose, onDone }) {
  const [reason, setReason] = useState('Удалено владельцем')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try { await archiveOrder(order.id, reason.trim() || 'Удалено владельцем'); await onDone() }
    catch (e) { setError(e.message || 'Не удалось удалить заказ') }
    finally { setBusy(false) }
  }
  return <Modal title="Удалить заказ" onClose={onClose}><form className="form" onSubmit={submit}>
    <div className="warning"><b>Безопасное удаление</b><span>Заказ будет скрыт, статус станет «Отменён», резерв освободится, а действие останется в журнале.</span></div>
    <label>Причина<textarea rows="3" maxLength="500" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
    {error && <div className="error">{error}</div>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Отмена</button><button className="danger" disabled={busy}>{busy ? 'Удаляем…' : 'Удалить заказ'}</button></div>
  </form></Modal>
}

function Events({ profile }) {
  const [events, setEvents] = useState([])
  const [selected, setSelected] = useState(null)
  const [audit, setAudit] = useState([])
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try { setEvents(await loadEvents(profile)) }
    catch (e) { setError(e.message || 'Ошибка загрузки событий') }
    finally { setLoading(false) }
  }, [profile])
  useEffect(() => { refresh() }, [refresh])

  async function openInfo(item) {
    setDetailLoading(true); setAudit([])
    try {
      const [detail, trail] = await Promise.all([
        loadEventDetail(item.source, item.event_id),
        item.entity_id ? loadAuditTrail(item.entity_id) : Promise.resolve([]),
      ])
      setSelected(detail)
      setAudit(trail)
    } catch (e) {
      setError(e.message || 'Не удалось получить подробности события')
    } finally {
      setDetailLoading(false)
    }
  }

  return <section className="stack">
    <Heading title="События системы" text="Подробный журнал действий и изменений" action={<button className="secondary" onClick={refresh}>↻ Обновить</button>} />
    {error && <div className="error">{error}</div>}
    <div className="panel no-pad">{loading ? <div className="empty">Загрузка…</div> : !events.length ? <div className="empty">Событий пока нет</div> : <div className="event-list">{events.map((item) => <article className="event" key={`${item.source}-${item.event_id}`}><span className={`dot sev-${item.severity}`} /><div><b>{eventLabel(item.event_type)}</b><p>{item.message}</p><small>{formatDate(item.occurred_at, true)} · {item.actor_name || 'Система'} · {item.entity_type}{item.entity_id ? ` · ${item.entity_id.slice(0, 8)}` : ''}</small></div><button className="info" disabled={detailLoading} onClick={() => openInfo(item)}>{detailLoading ? 'Загрузка…' : 'Информация'}</button></article>)}</div>}</div>
    {selected && <EventInfo item={selected} audit={audit} onClose={() => setSelected(null)} />}
  </section>
}

function EventInfo({ item, audit, onClose }) {
  const changed = item.changed_fields || []
  return <Modal title="Информация о событии" onClose={onClose} wide>
    <div className="details"><Detail k="Источник" v={item.source || '—'} /><Detail k="Событие" v={eventLabel(item.event_type)} /><Detail k="Время" v={formatDate(item.occurred_at, true)} /><Detail k="Исполнитель" v={item.actor_name || 'Система'} /><Detail k="Сущность" v={item.entity_type || '—'} /><Detail k="ID сущности" v={item.entity_id || '—'} />{item.request_id && <Detail k="Request ID" v={item.request_id} />}{item.severity && <Detail k="Уровень" v={item.severity} />}</div>
    {item.details && <div className="subsection"><b>Детали действия</b><pre>{JSON.stringify(item.details, null, 2)}</pre></div>}
    {changed.length > 0 && <div className="subsection"><b>Изменённые поля</b><p className="muted">{changed.join(', ')}</p></div>}
    {item.before && <div className="subsection"><b>До изменения</b><pre>{JSON.stringify(item.before, null, 2)}</pre></div>}
    {item.after && <div className="subsection"><b>После изменения</b><pre>{JSON.stringify(item.after, null, 2)}</pre></div>}
    <div className="subsection"><b>История изменений записи</b>{!audit.length ? <p className="muted">Связанных audit-записей нет.</p> : audit.map((row) => <article className="audit" key={row.id}><div><b>{row.operation} · {row.table_name}</b><span>{formatDate(row.occurred_at, true)}</span></div><p>Изменены поля: {(row.changed_fields || []).join(', ') || '—'}</p>{row.before_data && <details><summary>До изменения</summary><pre>{JSON.stringify(row.before_data, null, 2)}</pre></details>}{row.after_data && <details><summary>После изменения</summary><pre>{JSON.stringify(row.after_data, null, 2)}</pre></details>}</article>)}</div>
  </Modal>
}

function Heading({ title, text, action }) { return <div className="heading"><div><h2>{title}</h2><p>{text}</p></div>{action}</div> }
function Detail({ k, v }) { return <div className="detail"><span>{k}</span><b>{v}</b></div> }
function Modal({ title, onClose, wide = false, children }) { return <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}><section className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><h3>{title}</h3><button onClick={onClose} aria-label="Закрыть">×</button></header><div className="modal-body">{children}</div></section></div> }
function roleName(role) { return ({ owner: 'Владелец', admin: 'Администратор', staff: 'Сотрудник', pending: 'Ожидает доступа' })[role] || role }
function statusTone(status) { if (status === 'Отменён') return 'red'; if (status === 'Выполнен') return 'green'; if (['На доставке', 'Доставлен'].includes(status)) return 'blue'; return 'yellow' }

export default App
