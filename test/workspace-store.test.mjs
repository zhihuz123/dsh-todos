import assert from 'node:assert/strict'
import test from 'node:test'

import { createWorkspaceTodoStore } from '../src/client/workspace-store.js'

const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('condition was not reached')
}

const response = (value) => new Response(JSON.stringify(value), {
  status: 200,
  headers: { 'content-type': 'application/json' },
})

test('a mutation waits for the in-flight read and then loads fresh state', async () => {
  const originalFetch = globalThis.fetch
  const originalDocument = globalThis.document
  const reads = []
  const oldTodo = {
    id: 't1', scope: { type: 'workspace', workspaceId: 'w1' }, bucket: 'backlog',
    title: 'Finish me', status: 'pending', order: 0, createdBy: 'user', createdAt: 1, updatedAt: 1,
  }
  const newTodo = { ...oldTodo, status: 'completed', completedAt: 2, updatedAt: 2 }

  globalThis.document = { baseURI: 'http://host/' }
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(String(url), 'http://host/').pathname
    if ((init.method ?? 'GET') === 'GET' && path === '/api/todos') {
      return new Promise((resolve) => { reads.push(resolve) })
    }
    if (init.method === 'POST' && path === '/api/todos/update') {
      return response({ ok: true, value: { todo: newTodo } })
    }
    throw new Error(`unexpected request: ${init.method ?? 'GET'} ${path}`)
  }

  const store = createWorkspaceTodoStore()
  try {
    const first = store.refresh()
    await waitFor(() => reads.length === 1)

    const updating = store.update('t1', { status: 'completed' })
    await Promise.resolve()
    await Promise.resolve()

    reads.shift()(response({ ok: true, value: { todos: [oldTodo] } }))
    await waitFor(() => reads.length === 1)

    reads.shift()(response({ ok: true, value: { todos: [newTodo] } }))
    await updating
    await first
    assert.deepEqual(store.getSnapshot().todos, [newTodo])
    assert.equal(store.getSnapshot().status, 'ready')
  } finally {
    store.dispose()
    globalThis.fetch = originalFetch
    globalThis.document = originalDocument
  }
})
