/**
 * Unit tests for the pure view model. They run without a browser and without a
 * DSH host: the two snapshots are ordinary objects.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { currentWorkspaceIdOf } from '../src/client/derive.js'

const session = (id, overrides = {}) => ({
  id,
  displayTitle: `Session ${id}`,
  updatedAt: 1_000,
  blank: false,
  running: false,
  retainedBy: {},
  ...overrides,
})

const sessionsOf = (rows, phase = 'ready') => ({
  ids: rows.map((row) => row.id),
  byId: Object.fromEntries(rows.map((row) => [row.id, row])),
  phase,
})

const workspacesOf = (items) => ({ items })

const workspace = (workspaceId, title, path, sessionIds) => ({
  workspaceId,
  title,
  path,
  sessionIds,
})

test('workspace todos group by scope, keep inbox last, and preserve missing workspaces', async () => {
  const { groupWorkspaceTodos } = await import('../src/client/derive.js')
  const todos = [
    {
      id: 'b1', scope: { type: 'workspace', workspaceId: 'w1' }, bucket: 'backlog',
      title: 'Later', status: 'pending', order: 1, createdAt: 1, updatedAt: 5,
    },
    {
      id: 'p1', scope: { type: 'workspace', workspaceId: 'w1' }, bucket: 'plan',
      title: 'Now', status: 'in_progress', order: 0, createdAt: 2, updatedAt: 6,
    },
    {
      id: 'i1', scope: { type: 'inbox' }, bucket: 'backlog',
      title: 'Inbox item', status: 'completed', order: 0, createdAt: 3, updatedAt: 4,
    },
    {
      id: 'o1', scope: { type: 'workspace', workspaceId: 'gone' }, bucket: 'plan',
      title: 'Orphan', status: 'pending', order: 0, createdAt: 4, updatedAt: 3,
    },
  ]
  const workspaces = {
    items: [
      { workspaceId: 'w1', title: 'Alpha', path: '/alpha', sessionIds: [] },
      { workspaceId: 'w2', title: 'Beta', path: '/beta', sessionIds: [] },
    ],
  }
  const view = groupWorkspaceTodos({ todos, workspaces, currentWorkspaceId: 'w1' })
  assert.deepEqual(view.groups.map((group) => group.id), ['workspace:w1', 'workspace:gone', 'inbox'])
  assert.equal(view.groups[0].current, true)
  assert.equal(view.groups[0].plan[0].id, 'p1')
  assert.equal(view.groups[0].backlog[0].id, 'b1')
  assert.equal(view.groups[1].missing, true)
  assert.equal(view.groups[1].title, '')
  assert.equal(view.groups[2].inbox, true)
  assert.equal(view.open, 3)
  assert.equal(view.done, 1)
  assert.equal(view.total, 4)
})

test('the current workspace comes from the selected session', async () => {
  const { currentWorkspaceIdOf } = await import('../src/client/derive.js')
  const sessions = sessionsOf([
    session('s1', { retainedBy: { mainView: 1 } }),
    session('s2'),
  ])
  const workspaces = workspacesOf([
    workspace('w1', 'Alpha', '/alpha', ['s2']),
    workspace('w2', 'Beta', '/beta', ['s1']),
  ])
  assert.equal(currentWorkspaceIdOf(sessions, workspaces), 'w2')
  assert.equal(currentWorkspaceIdOf(sessionsOf([]), workspaces), undefined)
})

test('workspace plan items sort by priority first, then manual order', async () => {
  const { groupWorkspaceTodos } = await import('../src/client/derive.js')
  const item = (id, priority, order) => ({
    id,
    scope: { type: 'workspace', workspaceId: 'w1' },
    bucket: 'plan',
    title: id,
    status: 'pending',
    priority,
    order,
    createdAt: order,
    updatedAt: order,
  })
  const view = groupWorkspaceTodos({
    todos: [item('low', 'low', 0), item('high', 'high', 3), item('medium', 'medium', 1)],
    workspaces: { items: [{ workspaceId: 'w1', title: 'W', path: '/w', sessionIds: [] }] },
  })
  assert.deepEqual(view.groups[0].plan.map((todo) => todo.id), ['high', 'medium', 'low'])
})

test('completed items are grouped separately and sorted by completion time', async () => {
  const { groupWorkspaceTodos } = await import('../src/client/derive.js')
  const base = {
    scope: { type: 'workspace', workspaceId: 'w1' },
    bucket: 'plan',
    status: 'completed',
    priority: 'high',
    order: 0,
    createdAt: 1,
  }
  const old = { ...base, id: 'old', title: 'Old', completedAt: 10, updatedAt: 10 }
  const recent = { ...base, id: 'recent', title: 'Recent', completedAt: 20, updatedAt: 20 }
  const pending = { ...base, id: 'pending', title: 'Pending', status: 'pending', completedAt: undefined, updatedAt: 30 }
  const view = groupWorkspaceTodos({
    todos: [old, recent, pending],
    workspaces: { items: [{ workspaceId: 'w1', title: 'W', path: '/w', sessionIds: [] }] },
  })
  assert.deepEqual(view.groups[0].completed.map((todo) => todo.id), ['recent', 'old'])
  assert.equal(view.groups[0].done, 2)
  assert.equal(view.groups[0].open, 1)
})
