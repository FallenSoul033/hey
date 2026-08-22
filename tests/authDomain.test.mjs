import test from 'node:test'
import assert from 'node:assert/strict'
import { isMissingAuthSession } from '../src/authDomain.js'

test('missing auth session is treated as a signed-out visitor', () => {
  assert.equal(isMissingAuthSession({ name: 'AuthSessionMissingError' }), true)
  assert.equal(isMissingAuthSession({ name: 'AuthApiError' }), false)
  assert.equal(isMissingAuthSession(null), false)
})
