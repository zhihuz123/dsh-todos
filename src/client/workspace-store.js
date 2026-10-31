/**
 * Observable cache over the durable workspace todos.
 *
 * Polling only runs while the Overview is mounted and the page is visible:
 * activate -> immediate read + 4.5s interval; hidden -> timer stops; visible or
 * focus -> immediate read; mutation -> immediate read. The store keeps the last
 * successful list on errors so a transient outage does not blank the board.
 *
 * @module dsh-plugin-todos/client/workspace-store
 */

import { clearCompleted, createTodo, deleteTodo, listTodos, updateTodo } from './api.js'

const POLL_MS = 4500
const RETRY_MS = 8000

/** @typedef {{ status: 'loading' | 'ready' | 'error', todos: any[], error: string | null, updatedAt: number }} WorkspaceTodoSnapshot */

export function createWorkspaceTodoStore() {
  /** @type {WorkspaceTodoSnapshot} */
  let snapshot = { status: 'loading', todos: [], error: null, updatedAt: 0 }
  const listeners = new Set()
  let disposed = false
  let active = false
  /** @type {Promise<void> | null} */
  let inFlight = null
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null

  const emit = () => {
    for (const listener of [...listeners]) listener()
  }

  /** @param {Partial<WorkspaceTodoSnapshot>} patch */
  const publish = (patch) => {
    snapshot = { ...snapshot, ...patch }
    emit()
  }

  const load = () => {
    if (disposed) return Promise.resolve()
    if (inFlight !== null) return inFlight
    inFlight = (async () => {
      try {
        const todos = await listTodos()
        if (!disposed) publish({ status: 'ready', todos, error: null, updatedAt: Date.now() })
      } catch (error) {
        if (!disposed) publish({ status: 'error', error: error instanceof Error ? error.message : String(error) })
      } finally {
        inFlight = null
      }
    })()
    return inFlight
  }

  /**
   * A mutation must not reuse a list read that started before it. Wait for the
   * current read, then issue a fresh one.
   */
  const reload = async () => {
    while (inFlight !== null) {
      try {
        await inFlight
      } catch {
        // load() handles its own failures.
      }
    }
    return load()
  }

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'

  /** @param {number} delay */
  const schedule = (delay) => {
    clearTimer()
    if (disposed || !active || !visible()) return
    timer = setTimeout(() => {
      timer = null
      tick()
    }, delay)
    timer.unref?.()
  }

  const tick = () => {
    if (disposed || !active || !visible()) return
    load().finally(() => {
      if (!disposed && active) schedule(snapshot.status === 'error' ? RETRY_MS : POLL_MS)
    })
  }

  const onVisibility = () => {
    if (disposed || !active) return
    if (visible()) {
      load()
      schedule(POLL_MS)
    } else {
      clearTimer()
    }
  }
  const onFocus = () => {
    if (disposed || !active || !visible()) return
    load().finally(() => {
      if (!disposed && active) schedule(POLL_MS)
    })
  }
  const listen = () => {
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('visibilitychange', onVisibility)
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('focus', onFocus)
  }
  const unlisten = () => {
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') document.removeEventListener('visibilitychange', onVisibility)
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') window.removeEventListener('focus', onFocus)
  }

  return {
    /** @param {() => void} listener */
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot() {
      return snapshot
    },
    /** The Overview mounted: read once, then poll while visible. */
    activate() {
      if (disposed || active) return
      active = true
      listen()
      load().finally(() => {
        if (!disposed && active) schedule(POLL_MS)
      })
    },
    /** The Overview unmounted: stop polling; keep the last snapshot. */
    deactivate() {
      active = false
      clearTimer()
      unlisten()
    },
    /** Re-read now; resolves after this read settles. */
    refresh() {
      return reload()
    },
    /** @param {{ scope: any, bucket?: string, title: string, description?: string, priority?: string }} input */
    async create(input) {
      const result = await createTodo(input)
      await reload()
      return result
    },
    /** @param {string} id @param {Record<string, unknown>} patch */
    async update(id, patch) {
      const todo = await updateTodo(id, patch)
      await reload()
      return todo
    },
    /** @param {string} id */
    async remove(id) {
      await deleteTodo(id)
      await reload()
    },
    /** @param {{ type: 'workspace', workspaceId: string } | { type: 'inbox' }} scope */
    async clearCompleted(scope) {
      const deleted = await clearCompleted(scope)
      await reload()
      return deleted
    },
    dispose() {
      disposed = true
      active = false
      clearTimer()
      listeners.clear()
      unlisten()
    },
  }
}
