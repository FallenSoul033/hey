import { useCallback, useEffect, useMemo, useState } from 'react'
import { adjustInventory, loadInventory, loadProductionWorkspace, saveProductionEntry } from './operationsApi.js'
import { canAdjustInventory, inventoryState, validateProductionForm } from './operationsDomain.js'
import { formatDate } from './domain.js'

export function InventoryPage({ profile }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [target, setTarget] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try { setRows(await loadInventory()) }
    catch (e) { setError(e.message || 'Не удалось загрузить склад') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return <section className="stack">
    <div className="heading"><div><h2>Склад</h2><p>Фактические остатки, резервы и доступное количество</p></div><button className="secondary" onClick={refresh}>↻ Обновить</button></div>
    {error && <div className="error">{error}</div>}
    {loading ? <div className="panel empty">Загрузка…</div> : <div className="stock-grid">{rows.map((row) => {
      const state = inventoryState(row)
      return <article className={`stock-card stock-${state}`} key={row.product_id}>
        <div className="stock-title"><div><b>{row.name || row.product_id}</b><small>{row.product_id}</small></div><span className={`stock-state ${state}`}>{state === 'ok' ? 'В норме' : state === 'low' ? 'Низкий остаток' : 'Критично'}</span></div>
        <div className="stock-values"><div><span>На складе</span><b>{num(row.on_hand)}</b></div><div><span>В резерве</span><b>{num(row.reserved)}</b></div><div><span>Доступно</span><b>{num(row.available)}</b></div></div>
        <div className="stock-meta"><span>Произведено: {num(row.produced)}</span><span>Отгружено: {num(row.shipped)}</span><span>Корректировки: {num(row.adjustments)}</span></div>
        {canAdjustInventory(profile.role) && <button className="secondary stock-adjust" onClick={() => setTarget(row)}>Корректировать остаток</button>}
      </article>
    })}</div>}
    {target && <InventoryAdjustment row={target} onClose={() => setTarget(null)} onDone={async () => { setTarget(null); await refresh() }} />}
  </section>
}

function InventoryAdjustment({ row, onClose, onDone }) {
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('Инвентаризация склада')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault(); setError('')
    const value = Number(delta)
    if (!Number.isFinite(value) || value === 0) return setError('Укажите ненулевую корректировку')
    if (reason.trim().length < 5) return setError('Причина должна содержать минимум 5 символов')
    setBusy(true)
    try { await adjustInventory(row.product_id, value, reason.trim()); await onDone() }
    catch (e) { setError(e.message || 'Не удалось скорректировать остаток') }
    finally { setBusy(false) }
  }
  return <Overlay title={`Корректировка: ${row.name || row.product_id}`} onClose={onClose}><form className="form" onSubmit={submit}>
    <div className="warning"><b>Только для владельца</b><span>Положительное число добавит остаток, отрицательное — спишет. Операция попадёт в складской ledger и журнал.</span></div>
    <label>Изменение количества<input type="number" step="0.01" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="Например, -5 или 12" /></label>
    <label>Причина<textarea rows="3" maxLength="500" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
    {error && <div className="error">{error}</div>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Отмена</button><button className="primary" disabled={busy}>{busy ? 'Сохраняем…' : 'Провести корректировку'}</button></div>
  </form></Overlay>
}

export function ProductionPage() {
  const [workspace, setWorkspace] = useState({ entries: [], employees: [], products: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(undefined)

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try { setWorkspace(await loadProductionWorkspace()) }
    catch (e) { setError(e.message || 'Не удалось загрузить производство') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { refresh() }, [refresh])

  const productNames = useMemo(() => new Map(workspace.products.map((p) => [p.id, p.name])), [workspace.products])
  const todayTotal = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return workspace.entries.filter((e) => e.production_date === today).reduce((sum, e) => sum + Number(e.quantity || 0), 0)
  }, [workspace.entries])

  return <section className="stack">
    <div className="heading"><div><h2>Производство</h2><p>Фиксация факта производства с автоматическим приходом на склад</p></div><button className="primary" onClick={() => setEditing(null)}>+ Добавить факт</button></div>
    {error && <div className="error">{error}</div>}
    <div className="metrics compact"><article className="metric"><span>Сегодня произведено</span><b>{num(todayTotal)}</b><small>суммарное количество единиц</small></article><article className="metric"><span>Активные сотрудники</span><b>{workspace.employees.length}</b><small>доступны для фиксации</small></article><article className="metric"><span>Виды продукции</span><b>{workspace.products.length}</b><small>активный каталог</small></article><article className="metric"><span>Записей</span><b>{workspace.entries.length}</b><small>последние 300</small></article></div>
    <div className="panel no-pad">{loading ? <div className="empty">Загрузка…</div> : !workspace.entries.length ? <div className="empty">Фактов производства пока нет</div> : <div className="table-wrap"><table><thead><tr><th>Дата</th><th>Продукция</th><th>Количество</th><th>Сотрудник</th><th>Обновлено</th><th /></tr></thead><tbody>{workspace.entries.map((entry) => <tr key={entry.id}><td>{formatDate(entry.production_date)}</td><td><b>{productNames.get(entry.product_id) || entry.product_id}</b><small className="id">{entry.product_id}</small></td><td><b>{num(entry.quantity)}</b></td><td>{entry.employee_name}</td><td>{formatDate(entry.updated_at, true)}</td><td><button className="link" onClick={() => setEditing(entry)}>Изменить</button></td></tr>)}</tbody></table></div>}</div>
    {editing !== undefined && <ProductionEditor entry={editing} workspace={workspace} onClose={() => setEditing(undefined)} onSaved={async () => { setEditing(undefined); await refresh() }} />}
  </section>
}

function ProductionEditor({ entry, workspace, onClose, onSaved }) {
  const firstProduct = workspace.products[0]
  const firstEmployee = workspace.employees[0]
  const [form, setForm] = useState({
    production_date: entry?.production_date || new Date().toISOString().slice(0, 10),
    product_id: entry?.product_id || firstProduct?.id || '',
    quantity: entry?.quantity || 1,
    employee_id: entry?.employee_id || firstEmployee?.id || '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault(); setError('')
    const validationError = validateProductionForm(form)
    if (validationError) return setError(validationError)
    setBusy(true)
    try { await saveProductionEntry(entry, form); await onSaved() }
    catch (e) { setError(e.message || 'Не удалось сохранить факт производства') }
    finally { setBusy(false) }
  }

  return <Overlay title={entry ? 'Изменить факт производства' : 'Новый факт производства'} onClose={onClose}><form className="form" onSubmit={submit}>
    {entry && <div className="warning"><b>Без удаления записи</b><span>Корректировка количества проводится тем же RPC и создаёт соответствующее движение в складском ledger.</span></div>}
    <div className="form-grid">
      <label>Дата<input type="date" value={form.production_date} onChange={(e) => setForm({ ...form, production_date: e.target.value })} /></label>
      <label>Количество<input type="number" min="0.01" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
      <label>Продукция<select value={form.product_id} disabled={Boolean(entry)} onChange={(e) => setForm({ ...form, product_id: e.target.value })}>{workspace.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Сотрудник<select value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>{workspace.employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} — {e.position}</option>)}</select></label>
    </div>
    {error && <div className="error">{error}</div>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Отмена</button><button className="primary" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button></div>
  </form></Overlay>
}

function Overlay({ title, onClose, children }) {
  return <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header><h3>{title}</h3><button onClick={onClose} aria-label="Закрыть">×</button></header><div className="modal-body">{children}</div></section></div>
}

function num(value) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(value || 0))
}
