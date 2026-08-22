import { supabase } from './supabase.js'
import { isManager } from './domain.js'
import { isMissingAuthSession } from './authDomain.js'

function throwIfError(result) {
  if (result.error) throw result.error
  return result.data
}

export async function signIn(email, password) {
  return throwIfError(await supabase.auth.signInWithPassword({ email, password }))
}

export async function signOut() {
  return throwIfError(await supabase.auth.signOut())
}

export async function loadCurrentProfile() {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) {
    if (isMissingAuthSession(authError)) return null
    throw authError
  }
  if (!authData.user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('id,full_name,role,active,organization_id')
    .eq('id', authData.user.id)
    .single()
  if (error) throw error
  return { ...data, email: authData.user.email }
}

export async function loadCatalog() {
  const [clientsResult, productsResult] = await Promise.all([
    supabase.from('clients').select('id,name,category').order('name'),
    supabase.from('products').select('id,name,default_price,unit,active').eq('active', true).order('sort_order'),
  ])
  return {
    clients: throwIfError(clientsResult) || [],
    products: throwIfError(productsResult) || [],
  }
}

export async function loadOrders(profile) {
  const operational = throwIfError(await supabase.rpc('list_orders_operational_rc', { p_limit: 400 })) || []
  if (!isManager(profile.role) || operational.length === 0) return operational

  const ids = operational.map((order) => order.id)
  const [ordersResult, itemsResult] = await Promise.all([
    supabase.from('orders')
      .select('id,paid_amount,total_amount,debt_amount,deleted_at')
      .in('id', ids),
    supabase.from('order_items')
      .select('id,order_id,product_id,quantity,unit_price')
      .in('order_id', ids),
  ])

  const financeRows = throwIfError(ordersResult) || []
  const priceItems = throwIfError(itemsResult) || []
  const financeById = new Map(financeRows.map((row) => [row.id, row]))
  const itemsByOrder = new Map()
  for (const item of priceItems) {
    const list = itemsByOrder.get(item.order_id) || []
    list.push(item)
    itemsByOrder.set(item.order_id, list)
  }

  return operational.map((order) => ({
    ...order,
    ...financeById.get(order.id),
    items: itemsByOrder.get(order.id) || order.items || [],
  }))
}

export async function loadFinanceSummary(profile) {
  if (!isManager(profile.role)) return null
  const data = throwIfError(await supabase.rpc('get_finance_summary_rc')) || []
  return data[0] || { sales: 0, paid: 0, debt: 0, refunded: 0, credits: 0 }
}

export async function loadEvents(profile) {
  if (!isManager(profile.role)) return []
  return throwIfError(await supabase.rpc('list_system_events_rc', { p_limit: 200 })) || []
}

export async function loadEventDetail(source, eventId) {
  return throwIfError(await supabase.rpc('get_system_event_detail_rc', {
    p_source: source,
    p_event_id: eventId,
  }))
}

export async function loadAuditTrail(recordId) {
  if (!recordId) return []
  const data = throwIfError(await supabase
    .from('audit_log')
    .select('id,actor_id,table_name,operation,record_id,occurred_at,before_data,after_data,changed_fields')
    .eq('record_id', recordId)
    .order('occurred_at', { ascending: false })
    .limit(30))
  return data || []
}

export async function saveOrder({ profile, order, form }) {
  const payload = {
    p_idempotency_key: crypto.randomUUID(),
    p_order_id: order?.id || null,
    p_order_date: form.order_date,
    p_client_id: form.client_id,
    p_items: form.items.map((item) => {
      const base = { product_id: item.product_id, quantity: Number(item.quantity) }
      return isManager(profile.role) ? { ...base, unit_price: Number(item.unit_price) } : base
    }),
    p_status: form.status,
  }

  if (isManager(profile.role)) {
    payload.p_paid_amount = Number(form.paid_amount || 0)
    return throwIfError(await supabase.rpc('save_order_manager_rc', payload))
  }
  return throwIfError(await supabase.rpc('save_order_operational_rc', payload))
}

export async function archiveOrder(orderId, reason) {
  return throwIfError(await supabase.rpc('archive_order_owner_rc', {
    p_order_id: orderId,
    p_reason: reason,
  }))
}
