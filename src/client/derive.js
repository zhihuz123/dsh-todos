/**
 * Pure view model for the durable workspace todo board.
 *
 * The board joins the registry snapshot with the Host store's todos; it never
 * reads session plans or opens a Session.
 *
 * @module dsh-plugin-todos/derive
 */

/**
 * The workspace of the Session currently shown in the main view, when one is
 * selected and accounted to a registered workspace.
 * @param {any} sessions
 * @param {any} workspaces
 * @returns {string | undefined}
 */
export function currentWorkspaceIdOf(sessions, workspaces) {
  const byId = sessions?.byId ?? {}
  const selected = (Array.isArray(sessions?.ids) ? sessions.ids : [])
    .find((id) => (byId[id]?.retainedBy?.mainView ?? 0) > 0)
  if (selected === undefined) return undefined
  const workspace = (Array.isArray(workspaces?.items) ? workspaces.items : [])
    .find((item) => Array.isArray(item.sessionIds) && item.sessionIds.includes(selected))
  return workspace === undefined ? undefined : String(workspace.workspaceId)
}

/**
 * Group durable workspace todos by scope for the Overview.
 *
 * The source of truth is the Host store; this function only shapes the view.
 * Stored todos whose workspace has been removed are kept as a `missing` group
 * rather than silently dropped or reclassified as Inbox.
 *
 * @param {object} input
 * @param {any[]} input.todos
 * @param {any} input.workspaces
 * @param {string | undefined} [input.currentWorkspaceId]
 */
export function groupWorkspaceTodos({ todos, workspaces, currentWorkspaceId }) {
  const items = Array.isArray(workspaces?.items) ? workspaces.items : []
  const byId = new Map(items.map((workspace) => [String(workspace.workspaceId), workspace]))
  /** @type {Map<string, any>} */
  const groups = new Map()

  const groupOf = (todo) => {
    const scope = todo?.scope
    const key = scope?.type === 'workspace' ? `workspace:${scope.workspaceId}` : 'inbox'
    const known = groups.get(key)
    if (known !== undefined) return known
    const workspace = scope?.type === 'workspace' ? byId.get(String(scope.workspaceId)) : undefined
    const group = {
      id: key,
      title: workspace?.title ?? '',
      path: workspace?.path ?? null,
      inbox: scope?.type !== 'workspace',
      missing: scope?.type === 'workspace' && workspace === undefined,
      current: scope?.type === 'workspace' && String(scope.workspaceId) === currentWorkspaceId,
      plan: [],
      backlog: [],
      completed: [],
      open: 0,
      done: 0,
      total: 0,
      latest: 0,
    }
    groups.set(key, group)
    return group
  }

  for (const todo of Array.isArray(todos) ? todos : []) {
    if (todo === null || typeof todo !== 'object') continue
    if (todo.bucket !== 'plan' && todo.bucket !== 'backlog') continue
    const group = groupOf(todo)
    const target = todo.bucket === 'plan' ? group.plan : group.backlog
    target.push(todo)
    group.total += 1
    if (todo.status === 'completed') {
      group.done += 1
      group.completed.push(todo)
    } else group.open += 1
    if (typeof todo.updatedAt === 'number' && todo.updatedAt > group.latest) group.latest = todo.updatedAt
  }

  for (const group of groups.values()) {
    const byOrder = (left, right) => (left.order ?? 0) - (right.order ?? 0)
      || (left.createdAt ?? 0) - (right.createdAt ?? 0)
    const rank = { high: 0, medium: 1, low: 2 }
    group.plan.sort((left, right) => (rank[left.priority ?? 'high'] ?? 0) - (rank[right.priority ?? 'high'] ?? 0) || byOrder(left, right))
    group.backlog.sort(byOrder)
    group.completed.sort((left, right) => (right.completedAt ?? right.updatedAt ?? 0) - (left.completedAt ?? left.updatedAt ?? 0))
  }

  const ordered = [...groups.values()].sort((left, right) => {
    if (left.inbox !== right.inbox) return left.inbox ? 1 : -1
    if (left.current !== right.current) return left.current ? -1 : 1
    if (left.latest !== right.latest) return right.latest - left.latest
    return left.title.localeCompare(right.title)
  })

  return {
    groups: ordered,
    open: ordered.reduce((sum, group) => sum + group.open, 0),
    done: ordered.reduce((sum, group) => sum + group.done, 0),
    total: ordered.reduce((sum, group) => sum + group.total, 0),
  }
}
