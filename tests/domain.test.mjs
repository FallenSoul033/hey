import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canArchiveOrder, isFinanciallyActiveOrder, isManager, statusOptions,
} from '../src/domain.js'

test('cancelled orders are never treated as financially active', () => {
  assert.equal(isFinanciallyActiveOrder({ status: 'Отменён', deleted_at: null }), false)
  assert.equal(isFinanciallyActiveOrder({ status: 'Выполнен', deleted_at: '2026-08-21' }), false)
  assert.equal(isFinanciallyActiveOrder({ status: 'Выполнен', deleted_at: null }), true)
})

test('only owner can archive an order', () => {
  assert.equal(canArchiveOrder('owner'), true)
  assert.equal(canArchiveOrder('admin'), false)
  assert.equal(canArchiveOrder('staff'), false)
})

test('owner and admin are managers', () => {
  assert.equal(isManager('owner'), true)
  assert.equal(isManager('admin'), true)
  assert.equal(isManager('staff'), false)
})

test('staff status transitions follow the server workflow', () => {
  assert.deepEqual(statusOptions('staff', 'Новый', false), ['Новый', 'Подтверждён', 'Отменён'])
  assert.deepEqual(statusOptions('staff', 'На доставке', false), ['На доставке', 'Доставлен'])
  assert.deepEqual(statusOptions('staff', null, true), ['Новый'])
})
