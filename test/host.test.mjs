/**
 * Host-side tests: schema, service, tool surface, routes, and scope resolution.
 * They use an in-memory table so no storage backend is opened.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { handleTodoCommand, parseTodoCommand, registerTodoCommands } from '../src/host/commands.js'
import { GUIDANCE, GUIDANCE_ORDER } from '../src/host/guidance.js'
import { registerTodoRoutes } from '../src/host/routes.js'
import { todoSchema } from '../src/host/schema.js'
import { resolveScope } from '../src/host/scope.js'
import { TodoError, TodoStore } from '../src/host/service.js'
import { registerTodoTools } from '../src/host/tools.js'

function createTable() {
  const rows = new Map()
  return {
    get: (key) => rows.get(key),
    entries: () => rows.entries(),
    keys: () => rows.keys(),
    get size() { return rows.size },
    async put(key, value) { rows.set(key, structuredClone(value)) },
    async delete(key) { return rows.delete(key) },
    async update(key, transform) {
      if (!rows.has(key)) {
        const error = new Error('missing key')
        error.code = 'missing-key'
        throw error
      }
      const next = transform(rows.get(key))
      rows.set(key, structuredClone(next))
      return structuredClone(next)
    },
  }
}

function createHost({ workspaces = [{ id: 'w1', path: '/work/a', sessionIds: ['s1'] }] } = {}) {
  const table = createTable()
  const routes = []
  const tools = []
  const ctx = {
    storageDomain: {
      async open() {
        return { table: () => table, async close() {} }
      },
    },
    workspaceRegistry: { list: () => workspaces },
    connection: {
      fetch: {
        register(route) {
          routes.push(route)
          return async () => {}
        },
      },
    },
    tools: {
      register(tool) {
        tools.push(tool)
        return () => {}
      },
    },
    effect(callback) {
      const dispose = callback()
      return () => {
        if (typeof dispose === 'function') dispose()
      }
    },
  }
  return { ctx, table, routes, tools }
}

async function openStore(host) {
  const store = new TodoStore(host.ctx)
  await store.open()
  return store
}

const workspaceTodo = (overrides = {}) => ({
  scope: { type: 'workspace', workspaceId: 'w1' },
  bucket: 'backlog',
  title: 'Fix metadata bug',
  ...overrides,
})

test('schema accepts a durable todo and rejects an unknown scope', () => {
  const record = {
    id: 't1',
    scope: { type: 'inbox' },
    bucket: 'backlog',
    title: 'A',
    status: 'pending',
    order: 0,
    createdBy: 'user',
    createdAt: 1,
    updatedAt: 1,
  }
  assert.equal(todoSchema.parse(record).title, 'A')
  assert.throws(() => todoSchema.parse({ ...record, scope: { type: 'global' } }))
})

test('service creates, dedupes, updates, moves, and deletes', async () => {
  const host = createHost()
  const store = await openStore(host)

  const first = await store.create(workspaceTodo(), 'user')
  assert.equal(first.duplicate, false)
  assert.equal(first.todo.scope.workspaceId, 'w1')
  assert.equal(first.todo.bucket, 'backlog')
  assert.equal(first.todo.status, 'pending')

  const duplicate = await store.create(workspaceTodo({ title: '  fix metadata bug  ' }), 'agent')
  assert.equal(duplicate.duplicate, true)
  assert.equal(duplicate.todo.id, first.todo.id)

  const promoted = await store.update(first.todo.id, { bucket: 'plan', status: 'in_progress' })
  assert.equal(promoted.bucket, 'plan')
  assert.equal(promoted.status, 'in_progress')

  const completed = await store.update(first.todo.id, { status: 'completed' })
  assert.equal(completed.completedAt > 0, true)

  const reopened = await store.update(first.todo.id, { status: 'pending' })
  assert.equal(reopened.completedAt, undefined)

  assert.equal(store.list().length, 1)
  await store.delete(first.todo.id)
  assert.equal(store.list().length, 0)
  await assert.rejects(store.delete(first.todo.id), (error) => error instanceof TodoError && error.status === 404)
})

test('service rejects unknown workspaces for new writes but keeps stored orphans', async () => {
  const host = createHost()
  const store = await openStore(host)
  await assert.rejects(
    store.create(workspaceTodo({ scope: { type: 'workspace', workspaceId: 'gone' } }), 'user'),
    (error) => error instanceof TodoError && error.code === 'todo/workspace-not-found',
  )
  const created = await store.create(workspaceTodo(), 'user')
  host.ctx.workspaceRegistry.list = () => []
  assert.equal(store.list()[0].id, created.todo.id)
})

test('inbox scope is explicit and never a null workspace', async () => {
  const host = createHost()
  const store = await openStore(host)
  const result = await store.create({ scope: { type: 'inbox' }, title: 'Someday' }, 'agent')
  assert.deepEqual(result.todo.scope, { type: 'inbox' })
})

test('scope resolution prefers workspace membership, then parent, then cwd, then inbox', () => {
  const ctx = createHost({
    workspaces: [
      { id: 'w1', path: '/work/a', sessionIds: ['s1'] },
      { id: 'w2', path: '/work/ab', sessionIds: [] },
    ],
  }).ctx

  assert.deepEqual(resolveScope(ctx, { id: 's1', header: { cwd: '/other' } }), { type: 'workspace', workspaceId: 'w1' })
  assert.deepEqual(resolveScope(ctx, { id: 'child', header: { parentSession: 's1', cwd: '/other' } }), { type: 'workspace', workspaceId: 'w1' })
  assert.deepEqual(resolveScope(ctx, { id: 's3', header: { cwd: '/work/a/sub' } }), { type: 'workspace', workspaceId: 'w1' })
  assert.deepEqual(resolveScope(ctx, { id: 's4', header: { cwd: '/work/abc' } }), { type: 'inbox' })
  assert.deepEqual(resolveScope(ctx, { id: 's5', header: {} }), { type: 'inbox' })
})

test('todo_add and todo_update are registered and share the service', async () => {
  const host = createHost()
  const store = await openStore(host)
  registerTodoTools(host.ctx, store)
  assert.deepEqual(host.tools.map((tool) => tool.name), ['todo_add', 'todo_update'])

  const add = host.tools[0]
  const exec = { agent: { session: { id: 's1', header: { cwd: '/work/a' } } } }
  const added = await add.execute({ title: 'Remember this', bucket: 'backlog' }, exec)
  assert.equal(added.todo.scope.workspaceId, 'w1')
  assert.equal(added.todo.createdBy, 'agent')
  assert.equal(added.todo.sourceSessionId, 's1')

  const update = host.tools[1]
  const updated = await update.execute({ id: added.todo.id, status: 'completed' }, exec)
  assert.equal(updated.todo.status, 'completed')
})

test('Fetch routes cover list, create, update, clear, and delete with a stable envelope', async () => {
  const host = createHost()
  const store = await openStore(host)
  registerTodoRoutes(host.ctx, store)
  assert.deepEqual(host.routes.map((route) => route.path), ['/api/todos', '/api/todos/create', '/api/todos/update', '/api/todos/clear-completed', '/api/todos/delete'])
  assert.ok(host.routes.every((route) => route.requestBody === 'buffered'))

  const createRoute = host.routes.find((route) => route.path === '/api/todos/create')
  const created = await createRoute.fetch(new Request('http://host/api/todos/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope: { type: 'workspace', workspaceId: 'w1' }, bucket: 'plan', title: 'Ship it' }),
  }))
  assert.equal(created.status, 201)
  const createdBody = await created.json()
  assert.equal(createdBody.ok, true)
  assert.equal(createdBody.value.todo.bucket, 'plan')

  const listRoute = host.routes.find((route) => route.path === '/api/todos')
  const listed = await listRoute.fetch(new Request('http://host/api/todos'))
  const listBody = await listed.json()
  assert.equal(listBody.value.todos.length, 1)
  assert.match(listed.headers.get('cache-control'), /no-store/)

  const bad = await createRoute.fetch(new Request('http://host/api/todos/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope: { type: 'inbox' }, title: '  ' }),
  }))
  assert.equal(bad.status, 400)
  assert.equal((await bad.json()).error.code, 'todo/invalid-title')

  const updateRoute = host.routes.find((route) => route.path === '/api/todos/update')
  const updated = await updateRoute.fetch(new Request('http://host/api/todos/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: createdBody.value.todo.id, status: 'completed' }),
  }))
  assert.equal((await updated.json()).value.todo.status, 'completed')

  const clearRoute = host.routes.find((route) => route.path === '/api/todos/clear-completed')
  const cleared = await clearRoute.fetch(new Request('http://host/api/todos/clear-completed', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope: { type: 'workspace', workspaceId: 'w1' } }),
  }))
  assert.equal((await cleared.json()).value.deleted, 1)
})

test('guidance distinguishes the three todo layers', () => {
  assert.equal(GUIDANCE_ORDER, 5200)
  assert.match(GUIDANCE, /todo_write/)
  assert.match(GUIDANCE, /todo_add/)
  assert.match(GUIDANCE, /bucket "plan"/)
  assert.match(GUIDANCE, /Never mirror/)
  assert.match(GUIDANCE, /explicitly commits/)
  assert.match(GUIDANCE, /facts, preferences/)
})

test('plan priorities default high, backlog has none, and bucket moves normalize', async () => {
  const host = createHost()
  const store = await openStore(host)
  const plan = await store.create({ scope: { type: 'workspace', workspaceId: 'w1' }, bucket: 'plan', title: 'Plan item' }, 'user')
  assert.equal(plan.todo.priority, 'high')

  const backlog = await store.create({ scope: { type: 'workspace', workspaceId: 'w1' }, bucket: 'backlog', title: 'Backlog item', priority: 'high' }, 'user')
  assert.equal(backlog.todo.priority, undefined)

  const ignored = await store.update(backlog.todo.id, { priority: 'low' })
  assert.equal(ignored.priority, undefined)

  const promoted = await store.update(backlog.todo.id, { bucket: 'plan' })
  assert.equal(promoted.priority, 'medium')

  const demoted = await store.update(promoted.id, { bucket: 'backlog' })
  assert.equal(demoted.priority, undefined)

  const adjusted = await store.update(plan.todo.id, { priority: 'low' })
  assert.equal(adjusted.priority, 'low')

  const inbox = await store.create({ scope: { type: 'inbox' }, bucket: 'plan', title: 'Inbox plan' }, 'user')
  assert.equal(inbox.todo.bucket, 'backlog')
  assert.equal(inbox.downgraded, true)
  await assert.rejects(
    store.update(inbox.todo.id, { bucket: 'plan' }),
    (error) => error instanceof TodoError && error.code === 'todo/inbox-is-backlog-only',
  )
})

test('clearCompleted removes completed items only in the requested scope', async () => {
  const host = createHost({
    workspaces: [
      { id: 'w1', path: '/work/a', sessionIds: ['s1'] },
      { id: 'w2', path: '/work/b', sessionIds: [] },
    ],
  })
  const store = await openStore(host)
  const a = await store.create({ scope: { type: 'workspace', workspaceId: 'w1' }, title: 'A done' }, 'user')
  const b = await store.create({ scope: { type: 'workspace', workspaceId: 'w2' }, title: 'B done' }, 'user')
  const c = await store.create({ scope: { type: 'inbox' }, title: 'Inbox done' }, 'user')
  const open = await store.create({ scope: { type: 'workspace', workspaceId: 'w1' }, title: 'Still open' }, 'user')
  await store.update(a.todo.id, { status: 'completed' })
  await store.update(b.todo.id, { status: 'completed' })
  await store.update(c.todo.id, { status: 'completed' })

  assert.equal(await store.clearCompleted({ type: 'workspace', workspaceId: 'w1' }), 1)
  const left = store.list()
  assert.equal(left.some((todo) => todo.id === a.todo.id), false)
  assert.equal(left.some((todo) => todo.id === b.todo.id), true)
  assert.equal(left.some((todo) => todo.id === c.todo.id), true)
  assert.equal(left.some((todo) => todo.id === open.todo.id), true)
  assert.equal(await store.clearCompleted({ type: 'inbox' }), 1)
  assert.equal(store.list().length, 2)
})

test('/todo parses, writes through the store, and rejects Inbox plans', async () => {
  assert.deepEqual(parseTodoCommand('  Fix auth bug  '), { bucket: 'backlog', title: 'Fix auth bug' })
  assert.deepEqual(parseTodoCommand('plan Fix auth bug'), { bucket: 'plan', title: 'Fix auth bug' })
  assert.deepEqual(parseTodoCommand('backlog plan the migration'), { bucket: 'backlog', title: 'plan the migration' })
  assert.deepEqual(parseTodoCommand('add plan the migration'), { bucket: 'backlog', title: 'plan the migration' })
  assert.equal('error' in parseTodoCommand(''), true)
  assert.equal('error' in parseTodoCommand('plan'), true)

  const host = createHost()
  const store = await openStore(host)
  const ctx = {
    workspaceRegistry: host.ctx.workspaceRegistry,
    get: (name) => name === 'todos' ? { store } : undefined,
  }
  const invocation = (rawInput, session = { id: 's1', header: {} }) => ({
    rawInput,
    agent: { session },
    signal: new AbortController().signal,
  })

  const plan = await handleTodoCommand(ctx, invocation('plan Fix auth bug'))
  assert.equal(plan.kind, 'success')
  assert.match(plan.text, /Added to Plan \(high\)/)
  assert.equal(store.list()[0].bucket, 'plan')
  assert.equal(store.list()[0].priority, 'high')

  const duplicate = await handleTodoCommand(ctx, invocation('plan fix auth bug'))
  assert.equal(duplicate.kind, 'success')
  assert.match(duplicate.text, /Already tracked in Plan/)

  const backlog = await handleTodoCommand(ctx, invocation('Investigate SSE'))
  assert.equal(backlog.kind, 'success')
  assert.match(backlog.text, /Added to Backlog/)
  assert.equal(store.list().find((todo) => todo.title === 'Investigate SSE').priority, undefined)

  const inbox = { id: 's2', header: { cwd: '/tmp/elsewhere' } }
  const rejected = await handleTodoCommand(ctx, invocation('plan Inbox plan', inbox))
  assert.equal(rejected.kind, 'error')
  assert.match(rejected.text, /Inbox only holds Backlog/)

  const definitions = []
  const dispose = registerTodoCommands({
    commands: {
      register(definition) {
        definitions.push(definition)
        return () => {}
      },
    },
  })
  assert.equal(definitions.length, 1)
  assert.equal(definitions[0].name, 'todo')
  assert.match(definitions[0].input.hint, /plan/)
  dispose()
})

test('description can be cleared and list sorts Plan by priority then order', async () => {
  const host = createHost()
  const store = await openStore(host)
  const created = await store.create({
    scope: { type: 'workspace', workspaceId: 'w1' },
    bucket: 'plan',
    title: 'Described',
    description: 'initial',
  }, 'user')
  assert.equal(created.todo.description, 'initial')
  const cleared = await store.update(created.todo.id, { description: '' })
  assert.equal(cleared.description, undefined)
  const recreated = await store.update(created.todo.id, { description: 'again' })
  assert.equal(recreated.description, 'again')
  const clearedUndefined = await store.update(created.todo.id, { description: undefined })
  assert.equal(clearedUndefined.description, undefined)

  await store.create({ scope: { type: 'workspace', workspaceId: 'w1' }, bucket: 'plan', title: 'Low', priority: 'low' }, 'user')
  await store.create({ scope: { type: 'workspace', workspaceId: 'w1' }, bucket: 'plan', title: 'High', priority: 'high' }, 'user')
  await store.create({ scope: { type: 'workspace', workspaceId: 'w1' }, bucket: 'plan', title: 'Medium', priority: 'medium' }, 'user')
  assert.deepEqual(
    store.list().filter((todo) => todo.bucket === 'plan').map((todo) => todo.priority),
    ['high', 'high', 'medium', 'low'],
  )
})
