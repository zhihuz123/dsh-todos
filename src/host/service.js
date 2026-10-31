/**
 * Workspace todo service: the one place that validates and mutates durable
 * todos. The HTTP transport and the Agent tool both call this object; neither
 * touches the storage domain directly.
 *
 * @module dsh-plugin-todos/host/service
 */

import { randomUUID } from 'node:crypto'

import { BUCKETS, PRIORITIES, STATUSES, scopeKey, todosDomainSpec } from './schema.js'
import { workspaceExists } from './scope.js'

/** A typed business failure with an HTTP status for the transport. */
export class TodoError extends Error {
  /**
   * @param {string} code - stable machine code, e.g. `todo/not-found`.
   * @param {string} message - human-readable message.
   * @param {number} [status] - HTTP status for the Fetch route.
   */
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'TodoError'
    this.code = code
    this.status = status
  }
}

/** @returns {number} */
const now = () => Date.now()

/**
 * Validate and trim a title.
 * @param {unknown} value
 * @returns {string}
 */
function titleOf(value) {
  if (typeof value !== 'string') throw new TodoError('todo/invalid-title', 'title must be a string')
  const title = value.trim()
  if (title.length === 0) throw new TodoError('todo/invalid-title', 'title must not be empty')
  if (title.length > 200) throw new TodoError('todo/invalid-title', 'title must be at most 200 characters')
  return title
}

/**
 * Validate and trim an optional description.
 * @param {unknown} value
 * @returns {string | undefined}
 */
function descriptionOf(value) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new TodoError('todo/invalid-description', 'description must be a string')
  const description = value.trim()
  if (description.length === 0) return undefined
  if (description.length > 2000) throw new TodoError('todo/invalid-description', 'description must be at most 2000 characters')
  return description
}

/**
 * @param {unknown} value
 * @param {readonly string[]} allowed
 * @param {string} field
 * @returns {string | undefined}
 */
function enumOf(value, allowed, field) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new TodoError(`todo/invalid-${field}`, `${field} must be one of ${allowed.join(', ')}`)
  }
  return value
}

/**
 * Validate a write scope. Stored scopes are not re-validated against the
 * registry (a removed workspace must keep its records); new writes are.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {unknown} input
 * @returns {{ type: 'workspace', workspaceId: string } | { type: 'inbox' }}
 */
function scopeOf(ctx, input) {
  if (input === null || typeof input !== 'object') throw new TodoError('todo/invalid-scope', 'scope is required')
  const scope = /** @type {any} */ (input)
  if (scope.type === 'inbox') return { type: 'inbox' }
  if (scope.type === 'workspace' && typeof scope.workspaceId === 'string' && scope.workspaceId.length > 0) {
    if (!workspaceExists(ctx, scope.workspaceId)) {
      throw new TodoError('todo/workspace-not-found', 'workspace does not exist', 404)
    }
    return { type: 'workspace', workspaceId: scope.workspaceId }
  }
  throw new TodoError('todo/invalid-scope', 'scope must be workspace or inbox')
}

/** Deep-copy one stored record for callers. */
const clone = (todo) => ({ ...todo, scope: { ...todo.scope } })

/**
 * Canonical outward view of a stored record:
 * - Plan always carries a priority (legacy records fall back to high).
 * - Backlog never carries one.
 */
const view = (todo) => {
  const copy = clone(todo)
  if (copy.bucket === 'plan') {
    if (copy.priority === undefined) copy.priority = 'high'
  } else {
    delete copy.priority
  }
  return copy
}

export class TodoStore {
  /** @param {import('@deepseek-ai/cordis').Context} ctx */
  constructor(ctx) {
    this.ctx = ctx
    /** @type {import('@deepseek-ai/dsh-storage-domain').Domain<any> | undefined} */
    this.domain = undefined
    /** @type {import('@deepseek-ai/dsh-storage-domain').KvTable<string, any> | undefined} */
    this.table = undefined
  }

  /** Open the declared domain. */
  async open() {
    this.domain = await this.ctx.storageDomain.open(todosDomainSpec)
    this.table = this.domain.table('todos')
  }

  /** Close the domain, restoring the name for a later plugin generation. */
  async close() {
    const domain = this.domain
    this.domain = undefined
    this.table = undefined
    if (domain !== undefined) await domain.close()
  }

  /** @returns {import('@deepseek-ai/dsh-storage-domain').KvTable<string, any>} */
  requireTable() {
    if (this.table === undefined) throw new TodoError('todo/not-ready', 'todo storage is not open', 503)
    return this.table
  }

  /**
   * Every stored todo, ordered by group then manual order.
   * @returns {any[]}
   */
  list() {
    const table = this.requireTable()
    return [...table.entries()]
      .map(([, todo]) => view(todo))
      .sort((left, right) => {
        const group = scopeKey(left.scope).localeCompare(scopeKey(right.scope))
        if (group !== 0) return group
        if (left.bucket !== right.bucket) return left.bucket === 'plan' ? -1 : 1
        if (left.bucket === 'plan') {
          const rank = { high: 0, medium: 1, low: 2 }
          const priority = (rank[left.priority ?? 'high'] ?? 0) - (rank[right.priority ?? 'high'] ?? 0)
          if (priority !== 0) return priority
        }
        if (left.order !== right.order) return left.order - right.order
        return left.createdAt - right.createdAt
      })
  }

  /**
   * @param {string} id
   * @returns {any}
   */
  get(id) {
    if (typeof id !== 'string' || id.length === 0) throw new TodoError('todo/invalid-id', 'id is required')
    const todo = this.requireTable().get(id)
    if (todo === undefined) throw new TodoError('todo/not-found', 'todo not found', 404)
    return view(todo)
  }

  /**
   * Next manual position within one (scope, bucket).
   * @param {any} scope
   * @param {'plan' | 'backlog'} bucket
   * @param {string} [excludeId]
   * @returns {number}
   */
  nextOrder(scope, bucket, excludeId) {
    let max = -1
    for (const [id, todo] of this.requireTable().entries()) {
      if (id === excludeId) continue
      if (scopeKey(todo.scope) !== scopeKey(scope) || todo.bucket !== bucket) continue
      if (todo.order > max) max = todo.order
    }
    return max + 1
  }

  /**
   * Create one durable todo.
   * @param {object} input
   * @param {unknown} input.scope
   * @param {unknown} [input.bucket]
   * @param {unknown} input.title
   * @param {unknown} [input.description]
   * @param {unknown} [input.priority]
   * @param {'user' | 'agent' | 'system'} createdBy
   * @param {string} [sourceSessionId]
   * @returns {Promise<{ todo: any, duplicate: boolean }>}
   */
  async create(input, createdBy, sourceSessionId) {
    const table = this.requireTable()
    const scope = scopeOf(this.ctx, input?.scope)
    const requestedBucket = /** @type {'plan' | 'backlog'} */ (enumOf(input?.bucket, BUCKETS, 'bucket') ?? 'backlog')
    const inbox = scope.type === 'inbox'
    const bucket = inbox ? 'backlog' : requestedBucket
    const downgraded = inbox && requestedBucket === 'plan'
    const title = titleOf(input?.title)
    const description = descriptionOf(input?.description)
    const requestedPriority = enumOf(input?.priority, PRIORITIES, 'priority')
    const priority = bucket === 'plan' ? (requestedPriority ?? 'high') : undefined
    const normalized = title.toLocaleLowerCase()

    for (const todo of this.list()) {
      if (todo.status === 'completed') continue
      if (todo.bucket !== bucket) continue
      if (scopeKey(todo.scope) !== scopeKey(scope)) continue
      if (todo.title.toLocaleLowerCase() === normalized) {
        return { todo, duplicate: true, ...(downgraded ? { downgraded: true, reason: 'inbox-is-backlog-only' } : {}) }
      }
    }

    const timestamp = now()
    const todo = {
      id: randomUUID(),
      scope,
      bucket,
      title,
      ...(description === undefined ? {} : { description }),
      status: 'pending',
      ...(priority === undefined ? {} : { priority }),
      order: this.nextOrder(scope, bucket),
      ...(sourceSessionId === undefined ? {} : { sourceSessionId }),
      createdBy,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await table.put(todo.id, todo)
    return { todo: view(todo), duplicate: false, ...(downgraded ? { downgraded: true, reason: 'inbox-is-backlog-only' } : {}) }
  }

  /**
   * Apply a partial update.
   * @param {string} id
   * @param {object} patch
   * @param {unknown} [patch.title]
   * @param {unknown} [patch.description]
   * @param {unknown} [patch.bucket]
   * @param {unknown} [patch.status]
   * @param {unknown} [patch.priority]
   * @returns {Promise<any>}
   */
  async update(id, patch = {}) {
    const table = this.requireTable()
    if (typeof id !== 'string' || id.length === 0) throw new TodoError('todo/invalid-id', 'id is required')
    const title = patch.title === undefined ? undefined : titleOf(patch.title)
    const hasDescription = Object.prototype.hasOwnProperty.call(patch, 'description')
    const description = hasDescription ? descriptionOf(patch.description) : undefined
    const bucket = patch.bucket === undefined ? undefined : enumOf(patch.bucket, BUCKETS, 'bucket')
    const status = patch.status === undefined ? undefined : enumOf(patch.status, STATUSES, 'status')
    const priority = patch.priority === undefined ? undefined : enumOf(patch.priority, PRIORITIES, 'priority')
    if (title === undefined && !hasDescription && bucket === undefined && status === undefined && priority === undefined) {
      throw new TodoError('todo/empty-update', 'at least one field is required')
    }

    let updated
    try {
      updated = await table.update(id, (current) => {
        const targetBucket = bucket ?? current.bucket
        if (current.scope.type === 'inbox' && targetBucket === 'plan') {
          throw new TodoError('todo/inbox-is-backlog-only', 'Inbox todos are backlog-only', 400)
        }
        const timestamp = now()
        const next = { ...current }
        if (title !== undefined) next.title = title
        if (hasDescription) {
          if (description === undefined) delete next.description
          else next.description = description
        }
        if (bucket !== undefined && bucket !== current.bucket) {
          next.bucket = bucket
          next.order = this.nextOrder(current.scope, bucket, id)
        }
        if (next.bucket === 'plan') {
          if (bucket !== undefined && bucket !== current.bucket) next.priority = 'medium'
          if (priority !== undefined) next.priority = priority
          if (next.priority === undefined) next.priority = current.bucket === 'plan' ? 'high' : 'medium'
        } else {
          delete next.priority
        }
        if (status !== undefined && status !== current.status) {
          next.status = status
          if (status === 'completed') next.completedAt = timestamp
          else delete next.completedAt
        }
        next.updatedAt = timestamp
        return next
      })
    } catch (error) {
      if (error?.code === 'missing-key') throw new TodoError('todo/not-found', 'todo not found', 404)
      throw error
    }
    return view(updated)
  }

  /**
   * Permanently delete completed todos in one scope (or all scopes when omitted).
   * Storage has no cross-record transaction; a mid-way failure leaves the
   * records deleted so far, and the caller refreshes to the true remaining set.
   * @param {unknown} [scope]
   * @returns {Promise<number>}
   */
  async clearCompleted(scope) {
    const table = this.requireTable()
    let matches
    if (scope === undefined) {
      matches = () => true
    } else {
      if (scope === null || typeof scope !== 'object') throw new TodoError('todo/invalid-scope', 'scope must be workspace or inbox')
      const value = /** @type {any} */ (scope)
      if (value.type === 'inbox') matches = (todo) => todo.scope.type === 'inbox'
      else if (value.type === 'workspace' && typeof value.workspaceId === 'string' && value.workspaceId.length > 0) {
        matches = (todo) => todo.scope.type === 'workspace' && todo.scope.workspaceId === value.workspaceId
      } else {
        throw new TodoError('todo/invalid-scope', 'scope must be workspace or inbox')
      }
    }
    const targets = [...table.entries()]
      .filter(([, todo]) => todo.status === 'completed' && matches(todo))
      .map(([id]) => id)
    for (const id of targets) await table.delete(id)
    return targets.length
  }

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  async delete(id) {
    if (typeof id !== 'string' || id.length === 0) throw new TodoError('todo/invalid-id', 'id is required')
    const removed = await this.requireTable().delete(id)
    if (!removed) throw new TodoError('todo/not-found', 'todo not found', 404)
  }
}
