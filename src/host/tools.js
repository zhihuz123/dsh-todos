/**
 * Model-facing tools for durable workspace todos.
 *
 * These are deliberately separate from `todo_write`: that tool writes the
 * current turn's session checklist, while these write workspace records that
 * survive the turn, the session, and a Host restart.
 *
 * @module dsh-plugin-todos/host/tools
 */

import { defineTool } from '@deepseek-ai/dsh-tools'

import { BUCKETS, PRIORITIES, STATUSES } from './schema.js'
import { resolveScope } from './scope.js'

const ADD_DESCRIPTION = 'Persist actionable work to the current workspace. Use for work that should survive this session: concrete out-of-scope issues, necessary follow-ups not completed now, or actionable work the user explicitly asks you to track. Default to bucket "backlog". Use bucket "plan" only when the user explicitly commits the work as a next step; never use plan for your own suggestions, because a plan you propose is not a commitment. Do not use for: steps you are about to execute now (use todo_write), speculative improvements, minor observations, completed work, duplicates, or facts/preferences. Do NOT pass a workspace — the host resolves it from this session. Plan priority defaults to high and may be high | medium | low; Backlog has no priority and ignores a supplied one. Inbox (no workspace) is backlog-only, so a plan request there is downgraded. Be selective: one item per task.'

const UPDATE_DESCRIPTION = 'Update one durable workspace todo by id: change status (pending | in_progress | completed), move it between buckets (backlog ↔ plan), or edit title, description, or plan priority. Do not move an item to plan without explicit user commitment; that is a commitment, not an agent suggestion. Plan priorities are high | medium | low; Backlog has none. Moving backlog → plan sets medium; moving plan → backlog clears the priority. Inbox todos cannot move to plan. Use this when you finish a workspace plan item or promote user-committed backlog work.'

const TODO_OBJECT = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    bucket: { type: 'string', enum: [...BUCKETS] },
    status: { type: 'string', enum: [...STATUSES] },
    scope: { type: 'object', additionalProperties: true },
  },
}

const ADD_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      todo: { ...TODO_OBJECT, required: true },
      duplicate: { type: 'boolean', required: true },
      downgraded: { type: 'boolean' },
      reason: { type: 'string' },
    },
  },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
}

const UPDATE_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: { todo: { ...TODO_OBJECT, required: true } },
  },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
}

/**
 * Register both tools for this plugin's lifetime.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {import('./service.js').TodoStore} store
 */
export function registerTodoTools(ctx, store) {
  const storeOf = () => store ?? ctx.get?.('todos')?.store
  ctx.effect(() => {
    const definition = defineTool({
    name: 'todo_add',
    description: ADD_DESCRIPTION,
    parameters: {
      title: {
        type: 'string',
        required: true,
        description: 'One imperative line. What must be done, not a status report.',
      },
      bucket: {
        type: 'string',
        enum: [...BUCKETS],
        description: 'backlog (default: worth doing later) or plan (only when the user explicitly commits it as a next step).',
      },
      description: {
        type: 'string',
        description: 'Optional longer context for the item.',
      },
      priority: {
        type: 'string',
        enum: [...PRIORITIES],
        description: 'Plan priority (high | medium | low); affects Plan ordering. Ignored for Backlog.',
      },
    },
    output: ADD_OUTPUT,
    execute(args, exec) {
      const session = exec.agent?.session
      if (session === undefined) throw new Error('todo_add requires an owning agent session')
      const current = storeOf()
      if (current === undefined) throw new Error('todo storage is not ready')
      const scope = resolveScope(ctx, session)
      return current.create({ ...args, scope }, 'agent', session.id).then((result) => ({
        todo: result.todo,
        duplicate: result.duplicate,
        ...(result.downgraded ? { downgraded: true, reason: result.reason } : {}),
      }))
    },
    })
    const dispose = ctx.tools.register(definition)
    return dispose
  }, 'dsh-plugin-todos: todo_add')

  ctx.effect(() => {
    const definition = defineTool({
    name: 'todo_update',
    description: UPDATE_DESCRIPTION,
    parameters: {
      id: {
        type: 'string',
        required: true,
        description: 'The id returned by todo_add or shown by the workspace todo board.',
      },
      status: {
        type: 'string',
        enum: [...STATUSES],
        description: 'New lifecycle state.',
      },
      bucket: {
        type: 'string',
        enum: [...BUCKETS],
        description: 'Move the item between plan and backlog.',
      },
      title: { type: 'string', description: 'Replacement title.' },
      description: { type: 'string', description: 'Replacement description.' },
      priority: { type: 'string', enum: [...PRIORITIES], description: 'Replacement priority.' },
    },
    output: UPDATE_OUTPUT,
    execute(args) {
      const current = storeOf()
      if (current === undefined) throw new Error('todo storage is not ready')
      const { id, ...patch } = args
      return current.update(id, patch).then((todo) => ({ todo }))
    },
    })
    const dispose = ctx.tools.register(definition)
    return dispose
  }, 'dsh-plugin-todos: todo_update')
}
