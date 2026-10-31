/**
 * `/todo` human command.
 *
 * Commands run on the Host against the same TodoStore as the tools and HTTP
 * routes: no model turn, no Connection round-trip, and the scope still comes
 * from the invoking Agent's session. Explicit user input is recorded as a
 * `user` write, not an agent write.
 *
 * @module dsh-plugin-todos/host/commands
 */

import { resolveScope } from './scope.js'

const USAGE = 'Usage: /todo <text> | /todo plan <text> | /todo backlog <text> | /todo add <text>'

/** Collapse command whitespace into one imperative title line. */
const collapse = (text) => text.replace(/\s+/g, ' ').trim()

/**
 * Parse the text after `/todo`.
 * @param {string} rawInput
 * @returns {{ bucket: 'plan' | 'backlog', title: string } | { error: string }}
 */
export function parseTodoCommand(rawInput) {
  const text = typeof rawInput === 'string' ? rawInput.trim() : ''
  if (text.length === 0) return { error: USAGE }
  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(text)
  if (match === null) return { error: USAGE }
  const head = match[1].toLowerCase()
  const tail = collapse(match[2] ?? '')
  if (head === 'plan' || head === 'backlog' || head === 'add') {
    if (tail.length === 0) return { error: USAGE }
    return { bucket: head === 'plan' ? 'plan' : 'backlog', title: tail }
  }
  return { bucket: 'backlog', title: collapse(text) }
}

/**
 * Execute one `/todo` invocation.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ rawInput: string, agent?: { session?: any } }} invocation
 * @returns {Promise<{ kind: 'success', text: string } | { kind: 'error', text: string }>}
 */
export async function handleTodoCommand(ctx, invocation) {
  const parsed = parseTodoCommand(invocation?.rawInput)
  if ('error' in parsed) return { kind: 'error', text: parsed.error }

  const session = invocation?.agent?.session
  if (session === undefined) return { kind: 'error', text: '/todo requires an owning session.' }

  const store = ctx.get?.('todos')?.store
  if (store === undefined) return { kind: 'error', text: 'Todo storage is not ready.' }

  const scope = resolveScope(ctx, session)
  if (scope.type === 'inbox' && parsed.bucket === 'plan') {
    return { kind: 'error', text: 'Inbox only holds Backlog. Assign this session to a workspace first.' }
  }

  try {
    const result = await store.create({ scope, bucket: parsed.bucket, title: parsed.title }, 'user', session.id)
    const label = parsed.bucket === 'plan' ? 'Plan' : 'Backlog'
    if (result.duplicate) return { kind: 'success', text: `Already tracked in ${label}: ${result.todo.title}` }
    if (result.downgraded) return { kind: 'success', text: `Inbox only holds Backlog; added to Backlog: ${result.todo.title}` }
    const priority = parsed.bucket === 'plan' ? ` (${result.todo.priority ?? 'high'})` : ''
    return { kind: 'success', text: `Added to ${label}${priority}: ${result.todo.title}` }
  } catch (error) {
    return { kind: 'error', text: error instanceof Error ? error.message : 'Could not add todo.' }
  }
}

/**
 * Register `/todo` for every human-command adapter.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @returns {() => void}
 */
export function registerTodoCommands(ctx) {
  return ctx.commands.register({
    name: 'todo',
    description: 'Record a durable workspace todo (Backlog by default; Plan only when explicitly requested)',
    input: { hint: '<text> | plan <text> | backlog <text> | add <text>' },
    handler: (invocation) => handleTodoCommand(ctx, invocation),
  })
}
