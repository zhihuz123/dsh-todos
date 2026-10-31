/**
 * Render smoke test for the built bundle.
 *
 * Loads lib/client.js exactly as the Web shell does (through the
 * `window.__ModuleLoader__` envelope), stubs only the platform modules, applies
 * the plugin to a fake Cordis context, and renders the registered panel to
 * static markup. This catches envelope, export, registration, and render
 * regressions without a browser or a running Host.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import * as React from 'react'
import * as JsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import TestRenderer, { act } from 'react-test-renderer'

const require = createRequire(import.meta.url)

let entry
globalThis.window = {
  __ModuleLoader__: {
    load: (loaded) => {
      entry = loaded
    },
  },
}
globalThis.document = {
  createElement: () => ({ dataset: {}, style: {}, textContent: '', remove() {} }),
  head: { appendChild() {} },
  documentElement: { lang: 'zh-CN' },
}

require('../lib/client.js')

/** Platform primitive stub: every icon renders a marker element. */
const primitives = new Proxy({}, {
  get: (_target, key) => (props) => React.createElement('svg', {
    'data-icon': String(key),
    width: props?.size,
    height: props?.size,
  }),
})

const plugin = entry.factory((id) => {
  if (id === 'react') return React
  if (id === 'react/jsx-runtime') return JsxRuntime
  if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitives
  throw new Error(`unexpected platform module: ${id}`)
})

const session = (id, displayTitle, todos, overrides = {}) => ({
  id,
  displayTitle,
  updatedAt: Date.now() - 5 * 60_000,
  blank: false,
  running: false,
  retainedBy: {},
  projectionValues: { todos },
  ...overrides,
})

const sessionsSnapshot = {
  ids: ['s1', 's2'],
  byId: {
    s1: session('s1', 'Add EdgeOne caching', [
      { content: 'Raise HTML s-maxage to 60', status: 'in_progress' },
      { content: 'Verify EdgeOne honors s-maxage', status: 'pending' },
      { content: 'Re-measure TTFB', status: 'completed' },
    ], { retainedBy: { mainView: 1 } }),
    s2: session('s2', 'Old finished work', [
      { content: 'Already done', status: 'completed' },
    ]),
  },
  phase: 'ready',
}

const workspacesSnapshot = {
  items: [
    { workspaceId: 'w1', title: 'iherb-calendar', path: '/root/iherb-calendar', sessionIds: ['s1', 's2'] },
  ],
  archivedSessionIds: [],
  phase: 'ready',
}

class SnapshotStore {
  #value
  constructor(value) { this.#value = value }
  getSnapshot() { return this.#value }
  subscribe() { return () => {} }
}

const makeStore = (snapshot) => new SnapshotStore(snapshot)

/** Minimal Cordis + slot surface used by `apply`. */
function createContext(openSession) {
  const registrations = []
  let dictionary = null
  const effects = []
  const ctx = {
    sessions: { list: makeStore(sessionsSnapshot), refresh: async () => {} },
    workspaces: { list: makeStore(workspacesSnapshot) },
    uiWorkspace: { openSession },
    locale: {
      register: (_namespace, dict) => {
        dictionary = dict.zh
        return () => {}
      },
      bind: () => (key, params) => {
        const template = dictionary?.[key] ?? key
        return template.replace(/\{(\w+)\}/g, (_match, name) => String(params?.[name] ?? ''))
      },
    },
    slots: {
      inject: (_name, register) => register(),
      register: (registration, component) => {
        registrations.push({ registration, component })
        return () => {}
      },
    },
    effect: (callback) => {
      const dispose = callback()
      effects.push(dispose)
      return () => {}
    },
  }
  return { ctx, registrations, effects }
}

test('bundle exposes the Cordis plugin face', () => {
  assert.equal(entry.id, 'dsh-plugin-todos')
  assert.equal(plugin.name, 'dsh-plugin-todos')
  assert.deepEqual(plugin.inject, ['slots', 'locale', 'sessions', 'workspaces', 'uiWorkspace'])
  assert.equal(typeof plugin.apply, 'function')
})

test('apply registers the main panel and its sidebar entry', () => {
  const { ctx, registrations, effects } = createContext(() => {})
  plugin.apply(ctx)
  assert.deepEqual(registrations.map(({ registration }) => registration.name), ['main', 'sidebar.panellist'])
  const [main, panel] = registrations
  assert.equal(main.registration.key, 'todos')
  assert.equal(panel.registration.id, 'todos')
  assert.equal(panel.registration.label(), '待办')
  assert.ok(effects.length >= 3, 'styles, dictionaries, and store disposal are owned effects')
})

test('the board renders durable plan/backlog items and calls mutations', () => {
  const opened = []
  const { ctx, registrations } = createContext((id) => opened.push(id))
  plugin.apply(ctx)
  const [main] = registrations
  const now = Date.now()
  const todos = [
    {
      id: 't-plan',
      scope: { type: 'workspace', workspaceId: 'w1' },
      bucket: 'plan',
      title: 'Ship the durable board',
      status: 'in_progress',
      priority: 'high',
      order: 0,
      sourceSessionId: 's1',
      createdBy: 'agent',
      createdAt: now - 1000,
      updatedAt: now - 1000,
    },
    {
      id: 't-backlog',
      scope: { type: 'workspace', workspaceId: 'w1' },
      bucket: 'backlog',
      title: 'Investigate unrelated flake',
      status: 'pending',
      order: 0,
      createdBy: 'agent',
      createdAt: now - 2000,
      updatedAt: now - 2000,
    },
    {
      id: 't-done',
      scope: { type: 'workspace', workspaceId: 'w1' },
      bucket: 'backlog',
      title: 'Completed item',
      status: 'completed',
      order: 1,
      createdBy: 'agent',
      createdAt: now - 3000,
      updatedAt: now - 3000,
      completedAt: now - 1000,
    },
  ]
  const calls = []
  const snapshot = { status: 'ready', todos, error: null, updatedAt: now }
  const fakeStore = {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    activate: () => {},
    deactivate: () => {},
    refresh: async () => {},
    create: async (input) => calls.push(['create', input]),
    update: async (id, patch) => calls.push(['update', id, patch]),
    remove: async (id) => calls.push(['remove', id]),
    clearCompleted: async (scope) => calls.push(['clearCompleted', scope]),
  }
  const t = (key, params) => {
    const dictionary = {
      'page.title': '待办',
      'page.subtitle': 'sub',
      'workspaceTodos.placeholder': '记一条',
      'workspaceTodos.add': '添加',
      'workspaceTodos.target': '位置',
      'workspaceTodos.bucket': '类型',
      'workspaceTodos.plan': '计划',
      'workspaceTodos.backlog': '待办池',
      'workspaceTodos.inbox': '收件箱',
      'workspaceTodos.removed': '已删除',
      'workspaceTodos.meta': '{open} open / {total} total',
      'workspaceTodos.source': 'from session',
      'workspaceTodos.complete': 'complete',
      'workspaceTodos.delete': 'delete',
      'workspaceTodos.toPlan': 'to plan',
      'workspaceTodos.toBacklog': 'to backlog',
      'workspaceTodos.error': '{message}',
      'workspaceTodos.loading': 'loading',
      'workspaceTodos.priority.high': 'high',
      'filter.open': 'open',
      'workspace.current': 'current',
      'workspace.other': 'other',
      'session.open': 'open session',
      'session.running': 'running',
      'status.in_progress': 'in progress',
      'time.justNow': 'now',
    }
    return (dictionary[key] ?? key).replace(/\{(\w+)\}/g, (_m, name) => String(params?.[name] ?? ''))
  }
  const props = { ...main.registration.inject(), workspaceStore: fakeStore, t }
  let renderer
  act(() => {
    renderer = TestRenderer.create(React.createElement(main.component, props))
  })
  const html = renderer.toJSON()
  const text = JSON.stringify(html)
  assert.match(text, /Ship the durable board/)
  assert.match(text, /Investigate unrelated flake/)
  assert.match(text, /计划/)
  assert.match(text, /待办池/)

  const checkbox = renderer.root.findAllByType('button')
    .find((button) => button.props.className === 'dsh-todos-check')
  assert.ok(checkbox !== undefined)
  act(() => checkbox.props.onClick())
  assert.deepEqual(calls[0], ['update', 't-plan', { status: 'completed' }])

  const source = renderer.root.findAllByType('button')
    .find((button) => button.props.className === 'dsh-todos-source')
  assert.ok(source !== undefined)
  act(() => source.props.onClick())
  assert.deepEqual(opened, ['s1'])

  const completedTab = renderer.root.findAllByType('button')
    .find((button) => Array.isArray(button.props.children) && button.props.children[0] === 'filter.completed')
  assert.ok(completedTab !== undefined)
  act(() => completedTab.props.onClick())
  assert.match(JSON.stringify(renderer.toJSON()), /Completed item/)

  const clear = renderer.root.findAllByType('button')
    .find((button) => typeof button.props.children === 'string' && button.props.children.startsWith('workspaceTodos.clearCompleted'))
  assert.ok(clear !== undefined)
  act(() => clear.props.onClick())
  const confirm = renderer.root.findAllByType('button')
    .find((button) => button.props.children === 'workspaceTodos.confirm')
  assert.ok(confirm !== undefined)
  act(() => confirm.props.onClick())
  assert.deepEqual(calls.find((call) => call[0] === 'clearCompleted'), ['clearCompleted', { type: 'workspace', workspaceId: 'w1' }])

  const restore = renderer.root.findAllByType('button')
    .find((button) => button.props.children === 'workspaceTodos.restore')
  assert.ok(restore !== undefined)
  act(() => restore.props.onClick())
  assert.deepEqual(calls.find((call) => call[0] === 'update' && call[1] === 't-done'), ['update', 't-done', { status: 'pending' }])

  act(() => renderer.unmount())
})

test('the board surfaces a read error instead of the empty state', () => {
  const { ctx, registrations } = createContext(() => {})
  plugin.apply(ctx)
  const [main] = registrations
  const snapshot = { status: 'error', todos: [], error: 'boom', updatedAt: 0 }
  const fakeStore = {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    activate: () => {},
    deactivate: () => {},
    refresh: async () => {},
    create: async () => {},
    update: async () => {},
    remove: async () => {},
    clearCompleted: async () => {},
  }
  const t = (key, params) => key.replace(/\{(\w+)\}/g, (_match, name) => String(params?.[name] ?? ''))
  const props = { ...main.registration.inject(), workspaceStore: fakeStore, t }
  let renderer
  act(() => {
    renderer = TestRenderer.create(React.createElement(main.component, props))
  })
  const text = JSON.stringify(renderer.toJSON())
  assert.match(text, /refreshFailed/)
  assert.doesNotMatch(text, /empty.title/)
  act(() => renderer.unmount())
})
