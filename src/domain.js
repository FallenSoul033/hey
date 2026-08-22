export const ORDER_STATUSES = [
  'Новый', 'Подтверждён', 'В производстве', 'Собирается', 'Готов',
  'На доставке', 'Доставлен', 'Выполнен', 'Отменён',
]

export const STAFF_TRANSITIONS = {
  'Новый': ['Новый', 'Подтверждён', 'Отменён'],
  'Подтверждён': ['Подтверждён', 'В производстве', 'Собирается', 'Готов', 'Отменён'],
  'В производстве': ['В производстве', 'Собирается', 'Готов', 'Отменён'],
  'Собирается': ['Собирается', 'Готов', 'Отменён'],
  'Готов': ['Готов', 'На доставке', 'Отменён'],
  'На доставке': ['На доставке', 'Доставлен'],
  'Доставлен': ['Доставлен', 'Выполнен'],
  'Выполнен': ['Выполнен'],
  'Отменён': ['Отменён'],
}

export const isManager = (role) => role === 'owner' || role === 'admin'
export const canArchiveOrder = (role) => role === 'owner'
export const isFinanciallyActiveOrder = (order) => !order?.deleted_at && order?.status !== 'Отменён'

export function formatMoney(value) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(amount) + ' ₸'
}

export function formatDate(value, withTime = false) {
  if (!value) return '—'
  const date = new Date(value)
  return new Intl.DateTimeFormat('ru-RU', withTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }).format(date)
}

export function statusOptions(role, currentStatus, isNew = false) {
  if (isManager(role)) return ORDER_STATUSES
  if (isNew) return ['Новый']
  return STAFF_TRANSITIONS[currentStatus] || [currentStatus]
}

export function eventLabel(eventType) {
  const labels = {
    'order.created': 'Создан заказ',
    'order.updated': 'Изменён заказ',
    'order.deleted_by_owner': 'Заказ удалён владельцем',
  }
  return labels[eventType] || eventType || 'Системное событие'
}
