/**
 * Durable workspace todo board — browser half.
 *
 * The board reads only the Host's `/api/todos` records. The official session
 * `todo_write` projection is deliberately not shown here.
 *
 * @module dsh-plugin-todos/client
 */

import * as React from 'react'
import {
  IconCheckCircleOutlineRegular,
  IconChecklistOutlineRegular,
  IconRefreshOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'

import { currentWorkspaceIdOf, groupWorkspaceTodos } from './derive.js'
import { en, zh } from './locales.js'
import { STYLE } from './styles.js'
import { createWorkspaceTodoStore } from './workspace-store.js'

export const name = 'dsh-plugin-todos'
export const inject = ['slots', 'locale', 'sessions', 'workspaces', 'uiWorkspace']

const NS = 'dsh-todos'
const PANEL_ID = 'todos'

function WorkspaceTodo({ todo, t, pending, onToggle, onMove, onDelete, onPriority, onOpenSession }) {
  return (
    <li className="dsh-todos-wtodo" data-status={todo.status} data-pending={pending || undefined}>
      <button
        type="button"
        className="dsh-todos-check"
        aria-label={t('workspaceTodos.complete')}
        onClick={() => onToggle(todo)}
        disabled={pending}
      >
      </button>
      <div className="dsh-todos-wtodo-body">
        <span className="dsh-todos-wtodo-title">{todo.title}</span>
        <div className="dsh-todos-wtodo-meta">
          {todo.sourceSessionId ? (
            <button
              type="button"
              className="dsh-todos-source"
              onClick={() => onOpenSession(todo.sourceSessionId)}
              title={t('workspaceTodos.source')}
            >
              {t('workspaceTodos.source')}
            </button>
          ) : null}
          {todo.bucket === 'plan' ? (
            <select
              className="dsh-todos-priority-select"
              value={todo.priority ?? 'high'}
              onChange={(event) => onPriority(todo, event.target.value)}
              disabled={pending}
              aria-label={t('workspaceTodos.priorityLabel')}
            >
              <option value="high">{t('workspaceTodos.priority.high')}</option>
              <option value="medium">{t('workspaceTodos.priority.medium')}</option>
              <option value="low">{t('workspaceTodos.priority.low')}</option>
            </select>
          ) : null}
        </div>
      </div>
      <div className="dsh-todos-wactions">
        {todo.scope?.type === 'inbox' ? null : (
          <button type="button" onClick={() => onMove(todo)} disabled={pending}>
            {todo.bucket === 'plan' ? t('workspaceTodos.toBacklog') : t('workspaceTodos.toPlan')}
          </button>
        )}
        <button
          type="button"
          className="dsh-todos-delete"
          onClick={() => onDelete(todo)}
          disabled={pending}
          aria-label={t('workspaceTodos.delete')}
          title={t('workspaceTodos.delete')}
        >
          ×
        </button>
      </div>
    </li>
  )
}

function Bucket({ label, items, ...rest }) {
  return (
    <div className="dsh-todos-bucket">
      <h3>{label}<span className="dsh-todos-bucket-count">{items.length}</span></h3>
      <ul className="dsh-todos-wlist">
        {items.map((todo) => (
          <WorkspaceTodo key={todo.id} todo={todo} {...rest} />
        ))}
      </ul>
    </div>
  )
}

/**
 * Compact completion timestamp for the completed tab.
 * @param {number | undefined} timestamp
 * @returns {string}
 */
function formatCompleted(timestamp) {
  if (typeof timestamp !== 'number') return ''
  const locale = document.documentElement.lang || undefined
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(timestamp)
  } catch {
    return new Date(timestamp).toISOString().slice(0, 16).replace('T', ' ')
  }
}

function CompletedTodo({ todo, t, pending, onRestore, onDelete }) {
  return (
    <li className="dsh-todos-wtodo" data-status="completed" data-pending={pending || undefined}>
      <button
        type="button"
        className="dsh-todos-check"
        aria-pressed={true}
        aria-label={t('workspaceTodos.restore')}
        onClick={() => onRestore(todo)}
        disabled={pending}
      >
        <IconCheckCircleOutlineRegular size={14} />
      </button>
      <div className="dsh-todos-wtodo-body">
        <span className="dsh-todos-wtodo-title">{todo.title}</span>
        <div className="dsh-todos-wtodo-meta">
          <span>{formatCompleted(todo.completedAt ?? todo.updatedAt)}</span>
        </div>
      </div>
      <div className="dsh-todos-wactions">
        <button type="button" onClick={() => onRestore(todo)} disabled={pending}>
          {t('workspaceTodos.restore')}
        </button>
        <button
          type="button"
          className="dsh-todos-delete"
          onClick={() => onDelete(todo)}
          disabled={pending}
          aria-label={t('workspaceTodos.delete')}
          title={t('workspaceTodos.delete')}
        >
          ×
        </button>
      </div>
    </li>
  )
}

/** @param {string} key */
function parseScope(key) {
  return key === 'inbox'
    ? { type: 'inbox' }
    : { type: 'workspace', workspaceId: key.slice('workspace:'.length) }
}

class BoardBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[dsh-plugin-todos] board render failed', error, info)
  }

  render() {
    if (this.state.error !== null) {
      return (
        <div className="dsh-todos-page">
          <div className="dsh-todos-content">
            <p className="dsh-todos-error" style={{ marginTop: 32 }}>
              {this.props.t?.('workspaceTodos.error', { message: String(this.state.error?.message ?? this.state.error) })}
            </p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function BoardPage(props) {
  if (!props || !props.workspaceStore || !props.workspaces || !props.sessions) {
    return (
      <div style={{ padding: 24, color: 'var(--dsw-alias-state-error-primary)', fontSize: 13 }}>
        dsh-plugin-todos: missing injected props
      </div>
    )
  }
  return <BoardBoundary t={props.t}><TodosPage {...props} /></BoardBoundary>
}

export function TodosPage({ workspaceStore, workspaces, sessions, onOpenSession, t }) {
  if (typeof t !== 'function') {
    return <div style={{ padding: 24, fontSize: 13 }}>dsh-plugin-todos: missing locale</div>
  }
  const todoState = React.useSyncExternalStore(workspaceStore.subscribe, workspaceStore.getSnapshot, workspaceStore.getSnapshot)
  const wsSnap = React.useSyncExternalStore(workspaces.subscribe, workspaces.getSnapshot, workspaces.getSnapshot)
  const sessionSnap = React.useSyncExternalStore(sessions.subscribe, sessions.getSnapshot, sessions.getSnapshot)

  const currentWs = currentWorkspaceIdOf(sessionSnap, wsSnap)
  const wsView = groupWorkspaceTodos({ todos: todoState.todos, workspaces: wsSnap, currentWorkspaceId: currentWs })

  const [filter, setFilter] = React.useState('open')
  const [confirmClear, setConfirmClear] = React.useState(null)
  const [clearing, setClearing] = React.useState(null)
  const [text, setText] = React.useState('')
  const [target, setTarget] = React.useState(null)
  const [bucket, setBucket] = React.useState('backlog')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState(null)
  const [notice, setNotice] = React.useState(null)
  const [pending, setPending] = React.useState(null)

  React.useEffect(() => {
    workspaceStore.activate()
    return () => workspaceStore.deactivate()
  }, [workspaceStore])

  React.useEffect(() => {
    setConfirmClear(null)
  }, [filter])


  const scopeOptions = [
    ...(Array.isArray(wsSnap.items) ? wsSnap.items : []).map((workspace) => ({
      key: `workspace:${workspace.workspaceId}`,
      label: workspace.title || workspace.path,
    })),
    { key: 'inbox', label: t('workspaceTodos.inbox') },
  ]
  const fallbackTarget = currentWs
    ? `workspace:${currentWs}`
    : (scopeOptions[0]?.key ?? 'inbox')
  const effectiveTarget = scopeOptions.some((option) => option.key === target) ? target : fallbackTarget

  React.useEffect(() => {
    if (effectiveTarget === 'inbox' && bucket === 'plan') setBucket('backlog')
  }, [effectiveTarget, bucket])

  const fail = (reason) => setError(reason instanceof Error ? reason.message : String(reason))

  const refresh = () => {
    setError(null)
    workspaceStore.refresh().catch(fail)
  }

  const submit = (event) => {
    event.preventDefault()
    const title = text.trim()
    if (title.length === 0 || busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    workspaceStore.create({
      scope: parseScope(effectiveTarget),
      bucket,
      title,
    })
      .then((result) => {
        setText('')
        if (result?.duplicate) {
          setNotice(t('workspaceTodos.duplicate', { title: result.todo?.title ?? title }))
        }
      })
      .catch(fail)
      .finally(() => setBusy(false))
  }

  const mutate = (todo, patch) => {
    setPending(todo.id)
    setError(null)
    workspaceStore.update(todo.id, patch).catch(fail).finally(() => setPending(null))
  }
  const toggle = (todo) => mutate(todo, { status: todo.status === 'completed' ? 'pending' : 'completed' })
  const move = (todo) => mutate(todo, { bucket: todo.bucket === 'plan' ? 'backlog' : 'plan' })
  const changePriority = (todo, next) => mutate(todo, { priority: next })
  const remove = (todo) => {
    setPending(todo.id)
    setError(null)
    workspaceStore.remove(todo.id).catch(fail).finally(() => setPending(null))
  }
  const restore = (todo) => mutate(todo, { status: 'pending' })
  const clearCompleted = (group) => {
    const scope = group.inbox
      ? { type: 'inbox' }
      : { type: 'workspace', workspaceId: group.id.slice('workspace:'.length) }
    setClearing(group.id)
    setError(null)
    workspaceStore.clearCompleted(scope).catch(fail).finally(() => setClearing(null))
    setConfirmClear(null)
  }

  const openGroups = wsView.groups
    .map((group) => ({
      ...group,
      plan: group.plan.filter((todo) => todo.status !== 'completed'),
      backlog: group.backlog.filter((todo) => todo.status !== 'completed'),
    }))
    .filter((group) => group.plan.length > 0 || group.backlog.length > 0)
  const completedGroups = wsView.groups.filter((group) => group.completed.length > 0)

  const openTotal = wsView.open
  const completedTotal = wsView.done
  const allEmpty = wsView.total === 0
  const openEmpty = !allEmpty && filter === 'open' && openGroups.length === 0
  const completedEmpty = !allEmpty && filter === 'completed' && completedGroups.length === 0

  const groupTitle = (group) => group.inbox
    ? t('workspaceTodos.inbox')
    : group.missing
      ? t('workspaceTodos.removed')
      : group.title || t('workspace.other')

  return (
    <section className="dsh-todos-page" aria-label={t('page.title')} data-testid="todos-page">
      <div className="dsh-todos-scroll">
        <div className="dsh-todos-content">
          <header className="dsh-todos-heading">
            <div className="dsh-todos-heading-text">
              <h1>{t('page.title')}</h1>
              <p className="dsh-todos-subtitle">{t('page.subtitle')}</p>
            </div>
            <button type="button" className="dsh-todos-refresh" onClick={refresh} disabled={busy}>
              <IconRefreshOutlineRegular size={14} />
              <span>{t('refresh')}</span>
            </button>
          </header>

          <form className="dsh-todos-composer" onSubmit={submit}>
            <input
              className="dsh-todos-input"
              value={text}
              onChange={(event) => { setText(event.target.value); setNotice(null) }}
              placeholder={t('workspaceTodos.placeholder')}
              aria-label={t('workspaceTodos.placeholder')}
              disabled={busy}
            />
            <select
              className="dsh-todos-select"
              value={effectiveTarget}
              onChange={(event) => setTarget(event.target.value)}
              aria-label={t('workspaceTodos.target')}
              disabled={busy}
            >
              {scopeOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
            <select
              className="dsh-todos-select"
              value={bucket}
              onChange={(event) => setBucket(event.target.value)}
              aria-label={t('workspaceTodos.bucket')}
              disabled={busy}
            >
              <option value="backlog">{t('workspaceTodos.backlog')}</option>
              <option value="plan" disabled={effectiveTarget === 'inbox'}>{t('workspaceTodos.plan')}</option>
            </select>
            <button type="submit" className="dsh-todos-add" disabled={busy || text.trim().length === 0}>
              {t('workspaceTodos.add')}
            </button>
          </form>

          {error ? <p className="dsh-todos-error">{t('workspaceTodos.error', { message: error })}</p> : null}
          {!error && todoState.status === 'error' && todoState.error ? (
            <p className="dsh-todos-error">{t('refreshFailed', { message: todoState.error })}</p>
          ) : null}
          {notice ? <p className="dsh-todos-notice">{notice}</p> : null}

          <div className="dsh-todos-filters" role="group" aria-label={t('page.title')}>
            <button
              type="button"
              className="dsh-todos-filter"
              aria-pressed={filter === 'open'}
              onClick={() => setFilter('open')}
            >
              {t('filter.open')}
              <span className="dsh-todos-filter-count">{openTotal}</span>
            </button>
            <button
              type="button"
              className="dsh-todos-filter"
              aria-pressed={filter === 'completed'}
              onClick={() => setFilter('completed')}
            >
              {t('filter.completed')}
              <span className="dsh-todos-filter-count">{completedTotal}</span>
            </button>
          </div>

          {allEmpty && todoState.status === 'loading' ? (
            <div className="dsh-todos-loading">{t('workspaceTodos.loading')}</div>
          ) : null}

          {allEmpty && todoState.status !== 'loading' && todoState.status !== 'error' ? (
            <div className="dsh-todos-empty">
              <div className="dsh-todos-empty-icon"><IconChecklistOutlineRegular size={30} /></div>
              <h2>{t('empty.title')}</h2>
              <p>{t('empty.body')}</p>
            </div>
          ) : null}

          {openEmpty ? (
            <div className="dsh-todos-empty">
              <div className="dsh-todos-empty-icon"><IconCheckCircleOutlineRegular size={30} /></div>
              <h2>{t('emptyFiltered.title')}</h2>
              <p>{t('emptyFiltered.body')}</p>
              <div className="dsh-todos-empty-action">
                <button type="button" className="dsh-todos-filter" onClick={() => setFilter('completed')}>
                  {t('empty.viewCompleted')}
                </button>
              </div>
            </div>
          ) : null}

          {completedEmpty ? (
            <div className="dsh-todos-empty">
              <div className="dsh-todos-empty-icon"><IconChecklistOutlineRegular size={30} /></div>
              <h2>{t('workspaceTodos.completedEmptyTitle')}</h2>
              <p>{t('workspaceTodos.completedEmptyBody')}</p>
              <div className="dsh-todos-empty-action">
                <button type="button" className="dsh-todos-filter" onClick={() => setFilter('open')}>
                  {t('empty.viewOpen')}
                </button>
              </div>
            </div>
          ) : null}

          {filter === 'open' ? openGroups.map((group) => (
            <section key={group.id} className="dsh-todos-group">
              <div className="dsh-todos-group-head">
                <h2>
                  <span className="dsh-todos-group-title" title={group.path ?? undefined}>{groupTitle(group)}</span>
                  {group.current ? <span className="dsh-todos-chip">{t('workspace.current')}</span> : null}
                </h2>
                <span className="dsh-todos-group-meta">
                  {t('workspaceTodos.meta', { open: group.open, total: group.total })}
                </span>
              </div>
              {group.path && !group.inbox ? (
                <p className="dsh-todos-group-path" title={group.path}>{group.path}</p>
              ) : null}
              {group.plan.length > 0 ? (
                <Bucket
                  label={t('workspaceTodos.plan')}
                  items={group.plan}
                  t={t}
                  pending={pending}
                  onToggle={toggle}
                  onMove={move}
                  onDelete={remove}
                  onPriority={changePriority}
                  onOpenSession={onOpenSession}
                />
              ) : null}
              {group.backlog.length > 0 ? (
                <Bucket
                  label={t('workspaceTodos.backlog')}
                  items={group.backlog}
                  t={t}
                  pending={pending}
                  onToggle={toggle}
                  onMove={move}
                  onDelete={remove}
                  onPriority={changePriority}
                  onOpenSession={onOpenSession}
                />
              ) : null}
            </section>
          )) : completedGroups.map((group) => (
            <section key={group.id} className="dsh-todos-group">
              <div className="dsh-todos-group-head">
                <h2>
                  <span className="dsh-todos-group-title" title={group.path ?? undefined}>{groupTitle(group)}</span>
                  {group.current ? <span className="dsh-todos-chip">{t('workspace.current')}</span> : null}
                </h2>
                <div className="dsh-todos-group-actions">
                  {confirmClear === group.id ? (
                    <span className="dsh-todos-confirm">
                      <span>{t('workspaceTodos.confirmClear', { count: group.completed.length })}</span>
                      <button type="button" onClick={() => clearCompleted(group)} disabled={clearing === group.id}>
                        {t('workspaceTodos.confirm')}
                      </button>
                      <button type="button" onClick={() => setConfirmClear(null)}>
                        {t('workspaceTodos.cancel')}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="dsh-todos-clear"
                      onClick={() => setConfirmClear(group.id)}
                      disabled={clearing === group.id}
                    >
                      {t('workspaceTodos.clearCompleted', { count: group.completed.length })}
                    </button>
                  )}
                </div>
              </div>
              {group.path && !group.inbox ? (
                <p className="dsh-todos-group-path" title={group.path}>{group.path}</p>
              ) : null}
              <ul className="dsh-todos-wlist">
                {group.completed.map((todo) => (
                  <CompletedTodo
                    key={todo.id}
                    todo={todo}
                    t={t}
                    pending={pending === todo.id}
                    onRestore={restore}
                    onDelete={remove}
                  />
                ))}
              </ul>
            </section>
          ))}

        </div>
      </div>
    </section>
  )
}

function TodosIcon({ size }) {
  return React.createElement(IconChecklistOutlineRegular, { size })
}

export function apply(ctx) {
  const workspaceStore = createWorkspaceTodoStore()
  ctx.effect(() => () => workspaceStore.dispose(), 'dsh-plugin-todos: workspace store')

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = name
    style.textContent = STYLE
    document.head.appendChild(style)
    return () => style.remove()
  }, 'dsh-plugin-todos: styles')

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-plugin-todos: dictionaries')
  const t = ctx.locale.bind(NS)

  const workspaces = ctx.workspaces.list
  const sessions = ctx.sessions.list
  const workspaceSnapshot = {
    subscribe: (listener) => workspaces.subscribe(listener),
    getSnapshot: () => workspaces.getSnapshot(),
  }
  const sessionSnapshot = {
    subscribe: (listener) => sessions.subscribe(listener),
    getSnapshot: () => sessions.getSnapshot(),
  }

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: () => ({
      workspaceStore,
      workspaces: workspaceSnapshot,
      sessions: sessionSnapshot,
      onOpenSession: (id) => ctx.uiWorkspace.openSession(id),
    }),
  }, BoardPage))

  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 20,
    locale: NS,
    label: () => t('panel.label'),
  }, TodosIcon))
}
