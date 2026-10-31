/**
 * Durable domain declaration for workspace todos.
 *
 * The domain is the single source of truth for workspace-scoped work. Session
 * todos (`todo_write`) deliberately live elsewhere and are never mirrored here.
 *
 * @module dsh-plugin-todos/host/schema
 */

import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

/** Durable domain name; also the storage unit name. */
export const TODOS_DOMAIN = 'workspace_todos'

/** The two durable buckets. Plan is committed work; Backlog is discovered work. */
export const BUCKETS = ['plan', 'backlog']

/** Item lifecycle, shared with the official todo vocabulary. */
export const STATUSES = ['pending', 'in_progress', 'completed']

/** Plan urgency; Plan lists sort by this rank, then manual order. Backlog never carries it. */
export const PRIORITIES = ['low', 'medium', 'high']

/**
 * Where a durable todo belongs. A workspace scope keeps the stable workspace
 * identity; Inbox is its own explicit state, never `workspaceId: null`.
 */
export const scopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('workspace'), workspaceId: z.string().min(1) }),
  z.object({ type: z.literal('inbox') }),
])

/** One durable record stored under its generated id. */
export const todoSchema = z.object({
  id: z.string().min(1),
  scope: scopeSchema,
  bucket: z.enum(BUCKETS),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: z.enum(STATUSES),
  priority: z.enum(PRIORITIES).optional(),
  /** Manual sort key inside one (scope, bucket); created items append. */
  order: z.number().int().nonnegative(),
  /** Session that captured the item, when an Agent wrote it. */
  sourceSessionId: z.string().min(1).optional(),
  createdBy: z.enum(['user', 'agent', 'system']),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative().optional(),
})

/** The domain spec opened by the service. */
export const todosDomainSpec = defineDomain({
  name: TODOS_DOMAIN,
  version: 1,
  tables: { todos: domainTable(todoSchema) },
})

/**
 * Stable grouping key for one scope.
 * @param {{ type: 'workspace', workspaceId: string } | { type: 'inbox' }} scope
 * @returns {string}
 */
export function scopeKey(scope) {
  return scope.type === 'workspace' ? `workspace:${scope.workspaceId}` : 'inbox'
}
