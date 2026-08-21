import { supabase } from './supabase.js'

function throwIfError(result) {
  if (result.error) throw result.error
  return result.data
}

export async function loadInventory() {
  const [inventoryResult, productsResult] = await Promise.all([
    supabase.rpc('get_inventory_summary_rc'),
    supabase.from('products')
      .select('id,name,unit,min_stock,active,sort_order')
      .eq('active', true)
      .order('sort_order'),
  ])
  const rows = throwIfError(inventoryResult) || []
  const products = throwIfError(productsResult) || []
  const byId = new Map(products.map((product) => [product.id, product]))
  return rows.map((row) => ({ ...row, ...byId.get(row.product_id) }))
}

export async function adjustInventory(productId, quantityDelta, reason) {
  return throwIfError(await supabase.rpc('record_inventory_adjustment_rc', {
    p_idempotency_key: crypto.randomUUID(),
    p_product_id: productId,
    p_quantity_delta: Number(quantityDelta),
    p_reason: reason,
  }))
}

export async function loadProductionWorkspace() {
  const [entriesResult, employeesResult, productsResult] = await Promise.all([
    supabase.from('production_entries')
      .select('id,production_date,product_id,quantity,employee_id,employee_name,created_at,updated_at')
      .order('production_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300),
    supabase.from('employees')
      .select('id,full_name,position,active')
      .eq('active', true)
      .order('full_name'),
    supabase.from('products')
      .select('id,name,unit,active,sort_order')
      .eq('active', true)
      .order('sort_order'),
  ])

  return {
    entries: throwIfError(entriesResult) || [],
    employees: throwIfError(employeesResult) || [],
    products: throwIfError(productsResult) || [],
  }
}

export async function saveProductionEntry(entry, form) {
  return throwIfError(await supabase.rpc('save_production_entry_rc', {
    p_idempotency_key: crypto.randomUUID(),
    p_entry_id: entry?.id || null,
    p_production_date: form.production_date,
    p_product_id: form.product_id,
    p_quantity: Number(form.quantity),
    p_employee_id: form.employee_id,
  }))
}
