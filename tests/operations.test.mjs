import test from 'node:test'
import assert from 'node:assert/strict'
import { canAdjustInventory, inventoryState, validateProductionForm } from '../src/operationsDomain.js'

test('manual inventory adjustment is owner-only', () => {
  assert.equal(canAdjustInventory('owner'), true)
  assert.equal(canAdjustInventory('admin'), false)
  assert.equal(canAdjustInventory('staff'), false)
})

test('inventory state respects minimum stock threshold', () => {
  assert.equal(inventoryState({ available: 20, min_stock: 5 }), 'ok')
  assert.equal(inventoryState({ available: 5, min_stock: 5 }), 'low')
  assert.equal(inventoryState({ available: -1, min_stock: 5 }), 'critical')
})

test('production form validation requires positive quantity and references', () => {
  assert.equal(validateProductionForm({ production_date: '2026-08-22', product_id: 'bag1', employee_id: 'x', quantity: 12 }), '')
  assert.match(validateProductionForm({ production_date: '2026-08-22', product_id: 'bag1', employee_id: 'x', quantity: 0 }), /больше нуля/)
  assert.match(validateProductionForm({ production_date: '', product_id: 'bag1', employee_id: 'x', quantity: 1 }), /дату/)
})
