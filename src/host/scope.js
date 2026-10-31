/**
 * Workspace identity resolution for Agent writes.
 *
 * The model never supplies `workspaceId`. The Host resolves it from the calling
 * Session: workspace membership first, then the parent Session (subagents), then
 * the longest matching canonical directory, then Inbox.
 *
 * @module dsh-plugin-todos/host/scope
 */

import { sep } from 'node:path'

/**
 * Find the registered workspace that directly accounts for a Session.
 * @param {readonly any[]} workspaces
 * @param {string | undefined} sessionId
 * @returns {any | undefined}
 */
function workspaceOfSession(workspaces, sessionId) {
  if (sessionId === undefined || sessionId === null) return undefined
  return workspaces.find((workspace) => Array.isArray(workspace.sessionIds) && workspace.sessionIds.includes(sessionId))
}

/**
 * Match a directory against a workspace path with a separator boundary, so
 * `/work/a` never matches `/work/ab`.
 * @param {string} cwd
 * @param {string} path
 * @returns {boolean}
 */
function contains(cwd, path) {
  if (cwd === path) return true
  const prefix = path.endsWith(sep) ? path : `${path}${sep}`
  return cwd.startsWith(prefix)
}

/**
 * Resolve one Agent Session's durable todo scope.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {any} session - the calling Agent's Session
 * @returns {{ type: 'workspace', workspaceId: string } | { type: 'inbox' }}
 */
export function resolveScope(ctx, session) {
  const workspaces = ctx.workspaceRegistry?.list?.() ?? []
  const direct = workspaceOfSession(workspaces, session?.id)
  if (direct !== undefined) return { type: 'workspace', workspaceId: direct.id }

  const parentId = session?.header?.parentSession
  const parent = workspaceOfSession(workspaces, parentId)
  if (parent !== undefined) return { type: 'workspace', workspaceId: parent.id }

  const cwd = session?.header?.cwd
  if (typeof cwd === 'string' && cwd.length > 0) {
    let best
    for (const workspace of workspaces) {
      if (typeof workspace.path !== 'string' || !contains(cwd, workspace.path)) continue
      if (best === undefined || workspace.path.length > best.path.length) best = workspace
    }
    if (best !== undefined) return { type: 'workspace', workspaceId: best.id }
  }

  return { type: 'inbox' }
}

/**
 * Whether a workspace identity still exists in the registry. Stored todos may
 * outlive a removed workspace; new writes may not target an unknown one.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {string} workspaceId
 * @returns {boolean}
 */
export function workspaceExists(ctx, workspaceId) {
  const workspaces = ctx.workspaceRegistry?.list?.() ?? []
  return workspaces.some((workspace) => workspace.id === workspaceId)
}
