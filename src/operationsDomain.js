export const canAdjustInventory = (role) => role === 'owner'

export function inventoryState(row) {
  const available = Number(row?.available || 0)
  const minStock = Number(row?.min_stock || 0)
  if (available < 0) return 'critical'
  if (available <= minStock) return 'low'
  return 'ok'
}

export function validateProductionForm(form) {
  if (!form?.production_date) return 'Укажите дату производства'
  if (!form?.product_id) return 'Выберите продукцию'
  if (!form?.employee_id) return 'Выберите сотрудника'
  if (!Number.isFinite(Number(form?.quantity)) || Number(form.quantity) <= 0) return 'Количество должно быть больше нуля'
  return ''
}
