/**
 * Host half of dsh-plugin-todos.
 *
 * One service owns the storage domain and every mutation; the authenticated
 * Connection routes and the Agent tools are two front doors to that same
 * service. Session todos stay in the session projection and are never synced.
 *
 * @module dsh-plugin-todos
 */

import { Service } from '@deepseek-ai/cordis'

import { GUIDANCE, GUIDANCE_ORDER } from './guidance.js'
import { registerTodoCommands } from './commands.js'
import { registerTodoRoutes } from './routes.js'
import { TodoStore } from './service.js'
import { registerTodoTools } from './tools.js'

/** Loader row name; matches the package name so client-modules resolves the bundle. */
export const name = 'dsh-plugin-todos'

/** Host services used by the board. */
export const inject = ['storageDomain', 'connection', 'workspaceRegistry', 'tools', 'systemPrompt', 'commands']

/** Cordis service exposing the one todo store. */
class TodosService extends Service {
  static inject = ['storageDomain', 'connection']

  /** @param {import('@deepseek-ai/cordis').Context} ctx */
  constructor(ctx) {
    super(ctx, 'todos')
    this.store = new TodoStore(ctx)
  }

  /** Open the durable domain and own its close. */
  async [Service.init]() {
    await this.store.open()
    this.ctx.effect(() => () => this.store.close(), 'dsh-plugin-todos: domain close')
    this.ctx.effect(() => registerTodoRoutes(this.ctx, this.store), 'dsh-plugin-todos: routes')
  }
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.plugin(TodosService)

  registerTodoTools(ctx)
  ctx.effect(() => registerTodoCommands(ctx), 'dsh-plugin-todos: /todo command')

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'plugin:todos-board',
    order: GUIDANCE_ORDER,
    text: ({ scope }) => (ctx.tools.get('todo_add', scope) === undefined ? '' : GUIDANCE),
  }), 'dsh-plugin-todos: workspace todo guidance')
}
