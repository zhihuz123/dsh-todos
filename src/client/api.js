/**
 * Thin browser client for the authenticated `/api/todos` Fetch routes.
 *
 * Same-origin fetch carries the browser session cookie; Connection's Host and
 * Origin fence plus its Peer authentication do the rest. No plugin token.
 *
 * @module dsh-plugin-todos/client/api
 */

const BASE = 'api/todos'

/** @param {string} path */
function endpoint(path) {
  return new URL(`${BASE}${path}`, document.baseURI)
}

export class TodoApiError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} status
   */
  constructor(code, message, status) {
    super(message)
    this.name = 'TodoApiError'
    this.code = code
    this.status = status
  }
}

/**
 * @param {string} path
 * @param {{ method?: string, body?: unknown }} [options]
 * @returns {Promise<any>}
 */
async function request(path, options = {}) {
  const init = {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    headers: {},
  }
  if (options.body !== undefined) {
    init.headers['content-type'] = 'application/json'
    init.body = JSON.stringify(options.body)
  }
  let response
  try {
    response = await fetch(endpoint(path), init)
  } catch (error) {
    throw new TodoApiError('todo/network', error instanceof Error ? error.message : String(error), 0)
  }
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new TodoApiError('todo/invalid-response', `HTTP ${response.status}`, response.status)
  }
  if (!response.ok || payload?.ok !== true) {
    const code = payload?.error?.code ?? 'todo/request-failed'
    const message = payload?.error?.message ?? `HTTP ${response.status}`
    throw new TodoApiError(code, message, response.status)
  }
  return payload.value
}

export async function listTodos() {
  const value = await request('')
  return Array.isArray(value?.todos) ? value.todos : []
}

export async function createTodo(input) {
  const value = await request('/create', { method: 'POST', body: input })
  return value
}

export async function updateTodo(id, patch) {
  const value = await request('/update', { method: 'POST', body: { id, ...patch } })
  return value?.todo
}

export async function deleteTodo(id) {
  await request('/delete', { method: 'POST', body: { id } })
}

export async function clearCompleted(scope) {
  const value = await request('/clear-completed', { method: 'POST', body: { scope } })
  return value?.deleted ?? 0
}
