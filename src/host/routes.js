/**
 * Authenticated Fetch routes for the Overview.
 *
 * These are registered on Connection, not the bare web server: the carrier
 * applies its Host/Origin fence and browser authentication before the handler
 * runs, and only the owner Peer reaches an exact route. The plugin therefore
 * adds no token, cookie, or CSRF machinery of its own.
 *
 * Exact routes support GET/HEAD/POST only; all mutations are POST.
 *
 * @module dsh-plugin-todos/host/routes
 */

import { TodoError } from './service.js'

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

/**
 * @param {unknown} value
 * @param {number} [status]
 * @returns {Response}
 */
function ok(value, status = 200) {
  return new Response(JSON.stringify({ ok: true, value }), { status, headers: HEADERS })
}

/**
 * @param {TodoError} error
 * @returns {Response}
 */
function fail(error) {
  return new Response(JSON.stringify({
    ok: false,
    error: { code: error.code, message: error.message },
  }), { status: error.status, headers: HEADERS })
}

/**
 * @param {unknown} error
 * @returns {Response}
 */
function crash(error) {
  const message = error instanceof Error ? error.message : String(error)
  return fail(new TodoError('todo/internal', message, 500))
}

/**
 * Read one JSON object body.
 * @param {Request} request
 * @returns {Promise<Record<string, unknown>>}
 */
async function bodyOf(request) {
  let value
  try {
    value = await request.json()
  } catch {
    throw new TodoError('todo/invalid-json', 'request body must be JSON')
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TodoError('todo/invalid-json', 'request body must be a JSON object')
  }
  return /** @type {Record<string, unknown>} */ (value)
}

/**
 * Register the exact routes. Connection dispatches on the full pathname, so
 * every exact path includes the `/api` prefix (as shipped routes do).
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {import('./service.js').TodoStore} store
 * @returns {() => Promise<void>} combined disposer
 */
export function registerTodoRoutes(ctx, store) {
  const requireStore = () => {
    if (store === undefined) throw new TodoError('todo/not-ready', 'todo storage is not ready', 503)
    return store
  }
  const disposers = [
    ctx.connection.fetch.register({
      path: '/api/todos',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async () => {
        try {
          return ok({ todos: requireStore().list() })
        } catch (error) {
          return error instanceof TodoError ? fail(error) : crash(error)
        }
      },
    }),
    ctx.connection.fetch.register({
      path: '/api/todos/create',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const body = await bodyOf(request)
          const result = await requireStore().create(body, 'user')
          return ok(result, 201)
        } catch (error) {
          return error instanceof TodoError ? fail(error) : crash(error)
        }
      },
    }),
    ctx.connection.fetch.register({
      path: '/api/todos/update',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const body = await bodyOf(request)
          const id = body.id
          if (typeof id !== 'string') throw new TodoError('todo/invalid-id', 'id is required')
          const { id: _id, ...patch } = body
          return ok({ todo: await requireStore().update(id, patch) })
        } catch (error) {
          return error instanceof TodoError ? fail(error) : crash(error)
        }
      },
    }),
    ctx.connection.fetch.register({
      path: '/api/todos/clear-completed',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const body = await bodyOf(request)
          if (body.scope === undefined) throw new TodoError('todo/invalid-scope', 'scope is required', 400)
          const deleted = await requireStore().clearCompleted(body.scope)
          return ok({ deleted })
        } catch (error) {
          return error instanceof TodoError ? fail(error) : crash(error)
        }
      },
    }),
    ctx.connection.fetch.register({
      path: '/api/todos/delete',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const body = await bodyOf(request)
          if (typeof body.id !== 'string') throw new TodoError('todo/invalid-id', 'id is required')
          await requireStore().delete(body.id)
          return ok({ id: body.id })
        } catch (error) {
          return error instanceof TodoError ? fail(error) : crash(error)
        }
      },
    }),
  ]

  return async () => {
    await Promise.all(disposers.map((dispose) => dispose()))
  }
}
