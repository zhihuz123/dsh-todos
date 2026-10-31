// src/host/index.js
import { Service } from "@deepseek-ai/cordis";

// src/host/guidance.js
var GUIDANCE_ORDER = 5200;
var GUIDANCE = `Workspace todo board has three layers. todo_write is the current turn's execution checklist and is cleared when the next turn starts. Workspace Plan is work already decided to do next. Workspace Backlog is work worth doing later but not committed. Use todo_add for work that must survive this session: bucket "backlog" (the default) when you discover a concrete, actionable, out-of-scope issue, when a necessary follow-up will not be completed now, or when the user asks you to track actionable work; use bucket "plan" only when the user explicitly commits the work as a next step ("add this to plan", "we will do next", "make it a plan"). A plan you propose is not a commitment; wait for user confirmation. Do not add: steps you are about to execute now (use todo_write); speculative improvements, minor observations, or exhaustive wishlists; work already completed; items already tracked (check for duplicates); facts, preferences, or decisions that are not actionable work. When you add autonomously, mention it briefly in the final response. Be selective: one item per task. Do not pass a workspace \u2014 the host resolves it from this session. Never mirror todo_write into the workspace board. Plan defaults to high priority and uses high | medium | low; Backlog has no priority; Inbox is backlog-only. Use todo_update to mark in_progress or completed, or to move between backlog and plan; do not move to plan without explicit user commitment.`;

// src/host/scope.js
import { sep } from "node:path";
function workspaceOfSession(workspaces, sessionId) {
  if (sessionId === void 0 || sessionId === null) return void 0;
  return workspaces.find((workspace) => Array.isArray(workspace.sessionIds) && workspace.sessionIds.includes(sessionId));
}
function contains(cwd, path) {
  if (cwd === path) return true;
  const prefix = path.endsWith(sep) ? path : `${path}${sep}`;
  return cwd.startsWith(prefix);
}
function resolveScope(ctx, session) {
  const workspaces = ctx.workspaceRegistry?.list?.() ?? [];
  const direct = workspaceOfSession(workspaces, session?.id);
  if (direct !== void 0) return { type: "workspace", workspaceId: direct.id };
  const parentId = session?.header?.parentSession;
  const parent = workspaceOfSession(workspaces, parentId);
  if (parent !== void 0) return { type: "workspace", workspaceId: parent.id };
  const cwd = session?.header?.cwd;
  if (typeof cwd === "string" && cwd.length > 0) {
    let best;
    for (const workspace of workspaces) {
      if (typeof workspace.path !== "string" || !contains(cwd, workspace.path)) continue;
      if (best === void 0 || workspace.path.length > best.path.length) best = workspace;
    }
    if (best !== void 0) return { type: "workspace", workspaceId: best.id };
  }
  return { type: "inbox" };
}
function workspaceExists(ctx, workspaceId) {
  const workspaces = ctx.workspaceRegistry?.list?.() ?? [];
  return workspaces.some((workspace) => workspace.id === workspaceId);
}

// src/host/commands.js
var USAGE = "Usage: /todo <text> | /todo plan <text> | /todo backlog <text> | /todo add <text>";
var collapse = (text) => text.replace(/\s+/g, " ").trim();
function parseTodoCommand(rawInput) {
  const text = typeof rawInput === "string" ? rawInput.trim() : "";
  if (text.length === 0) return { error: USAGE };
  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(text);
  if (match === null) return { error: USAGE };
  const head = match[1].toLowerCase();
  const tail = collapse(match[2] ?? "");
  if (head === "plan" || head === "backlog" || head === "add") {
    if (tail.length === 0) return { error: USAGE };
    return { bucket: head === "plan" ? "plan" : "backlog", title: tail };
  }
  return { bucket: "backlog", title: collapse(text) };
}
async function handleTodoCommand(ctx, invocation) {
  const parsed = parseTodoCommand(invocation?.rawInput);
  if ("error" in parsed) return { kind: "error", text: parsed.error };
  const session = invocation?.agent?.session;
  if (session === void 0) return { kind: "error", text: "/todo requires an owning session." };
  const store = ctx.get?.("todos")?.store;
  if (store === void 0) return { kind: "error", text: "Todo storage is not ready." };
  const scope = resolveScope(ctx, session);
  if (scope.type === "inbox" && parsed.bucket === "plan") {
    return { kind: "error", text: "Inbox only holds Backlog. Assign this session to a workspace first." };
  }
  try {
    const result = await store.create({ scope, bucket: parsed.bucket, title: parsed.title }, "user", session.id);
    const label = parsed.bucket === "plan" ? "Plan" : "Backlog";
    if (result.duplicate) return { kind: "success", text: `Already tracked in ${label}: ${result.todo.title}` };
    if (result.downgraded) return { kind: "success", text: `Inbox only holds Backlog; added to Backlog: ${result.todo.title}` };
    const priority = parsed.bucket === "plan" ? ` (${result.todo.priority ?? "high"})` : "";
    return { kind: "success", text: `Added to ${label}${priority}: ${result.todo.title}` };
  } catch (error) {
    return { kind: "error", text: error instanceof Error ? error.message : "Could not add todo." };
  }
}
function registerTodoCommands(ctx) {
  return ctx.commands.register({
    name: "todo",
    description: "Record a durable workspace todo (Backlog by default; Plan only when explicitly requested)",
    input: { hint: "<text> | plan <text> | backlog <text> | add <text>" },
    handler: (invocation) => handleTodoCommand(ctx, invocation)
  });
}

// src/host/service.js
import { randomUUID } from "node:crypto";

// src/host/schema.js
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { z } from "zod";
var TODOS_DOMAIN = "workspace_todos";
var BUCKETS = ["plan", "backlog"];
var STATUSES = ["pending", "in_progress", "completed"];
var PRIORITIES = ["low", "medium", "high"];
var scopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("workspace"), workspaceId: z.string().min(1) }),
  z.object({ type: z.literal("inbox") })
]);
var todoSchema = z.object({
  id: z.string().min(1),
  scope: scopeSchema,
  bucket: z.enum(BUCKETS),
  title: z.string().min(1).max(200),
  description: z.string().max(2e3).optional(),
  status: z.enum(STATUSES),
  priority: z.enum(PRIORITIES).optional(),
  /** Manual sort key inside one (scope, bucket); created items append. */
  order: z.number().int().nonnegative(),
  /** Session that captured the item, when an Agent wrote it. */
  sourceSessionId: z.string().min(1).optional(),
  createdBy: z.enum(["user", "agent", "system"]),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative().optional()
});
var todosDomainSpec = defineDomain({
  name: TODOS_DOMAIN,
  version: 1,
  tables: { todos: domainTable(todoSchema) }
});
function scopeKey(scope) {
  return scope.type === "workspace" ? `workspace:${scope.workspaceId}` : "inbox";
}

// src/host/service.js
var TodoError = class extends Error {
  /**
   * @param {string} code - stable machine code, e.g. `todo/not-found`.
   * @param {string} message - human-readable message.
   * @param {number} [status] - HTTP status for the Fetch route.
   */
  constructor(code, message, status = 400) {
    super(message);
    this.name = "TodoError";
    this.code = code;
    this.status = status;
  }
};
var now = () => Date.now();
function titleOf(value) {
  if (typeof value !== "string") throw new TodoError("todo/invalid-title", "title must be a string");
  const title = value.trim();
  if (title.length === 0) throw new TodoError("todo/invalid-title", "title must not be empty");
  if (title.length > 200) throw new TodoError("todo/invalid-title", "title must be at most 200 characters");
  return title;
}
function descriptionOf(value) {
  if (value === void 0 || value === null) return void 0;
  if (typeof value !== "string") throw new TodoError("todo/invalid-description", "description must be a string");
  const description = value.trim();
  if (description.length === 0) return void 0;
  if (description.length > 2e3) throw new TodoError("todo/invalid-description", "description must be at most 2000 characters");
  return description;
}
function enumOf(value, allowed, field) {
  if (value === void 0 || value === null) return void 0;
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new TodoError(`todo/invalid-${field}`, `${field} must be one of ${allowed.join(", ")}`);
  }
  return value;
}
function scopeOf(ctx, input) {
  if (input === null || typeof input !== "object") throw new TodoError("todo/invalid-scope", "scope is required");
  const scope = (
    /** @type {any} */
    input
  );
  if (scope.type === "inbox") return { type: "inbox" };
  if (scope.type === "workspace" && typeof scope.workspaceId === "string" && scope.workspaceId.length > 0) {
    if (!workspaceExists(ctx, scope.workspaceId)) {
      throw new TodoError("todo/workspace-not-found", "workspace does not exist", 404);
    }
    return { type: "workspace", workspaceId: scope.workspaceId };
  }
  throw new TodoError("todo/invalid-scope", "scope must be workspace or inbox");
}
var clone = (todo) => ({ ...todo, scope: { ...todo.scope } });
var view = (todo) => {
  const copy = clone(todo);
  if (copy.bucket === "plan") {
    if (copy.priority === void 0) copy.priority = "high";
  } else {
    delete copy.priority;
  }
  return copy;
};
var TodoStore = class {
  /** @param {import('@deepseek-ai/cordis').Context} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.domain = void 0;
    this.table = void 0;
  }
  /** Open the declared domain. */
  async open() {
    this.domain = await this.ctx.storageDomain.open(todosDomainSpec);
    this.table = this.domain.table("todos");
  }
  /** Close the domain, restoring the name for a later plugin generation. */
  async close() {
    const domain = this.domain;
    this.domain = void 0;
    this.table = void 0;
    if (domain !== void 0) await domain.close();
  }
  /** @returns {import('@deepseek-ai/dsh-storage-domain').KvTable<string, any>} */
  requireTable() {
    if (this.table === void 0) throw new TodoError("todo/not-ready", "todo storage is not open", 503);
    return this.table;
  }
  /**
   * Every stored todo, ordered by group then manual order.
   * @returns {any[]}
   */
  list() {
    const table = this.requireTable();
    return [...table.entries()].map(([, todo]) => view(todo)).sort((left, right) => {
      const group = scopeKey(left.scope).localeCompare(scopeKey(right.scope));
      if (group !== 0) return group;
      if (left.bucket !== right.bucket) return left.bucket === "plan" ? -1 : 1;
      if (left.bucket === "plan") {
        const rank = { high: 0, medium: 1, low: 2 };
        const priority = (rank[left.priority ?? "high"] ?? 0) - (rank[right.priority ?? "high"] ?? 0);
        if (priority !== 0) return priority;
      }
      if (left.order !== right.order) return left.order - right.order;
      return left.createdAt - right.createdAt;
    });
  }
  /**
   * @param {string} id
   * @returns {any}
   */
  get(id) {
    if (typeof id !== "string" || id.length === 0) throw new TodoError("todo/invalid-id", "id is required");
    const todo = this.requireTable().get(id);
    if (todo === void 0) throw new TodoError("todo/not-found", "todo not found", 404);
    return view(todo);
  }
  /**
   * Next manual position within one (scope, bucket).
   * @param {any} scope
   * @param {'plan' | 'backlog'} bucket
   * @param {string} [excludeId]
   * @returns {number}
   */
  nextOrder(scope, bucket, excludeId) {
    let max = -1;
    for (const [id, todo] of this.requireTable().entries()) {
      if (id === excludeId) continue;
      if (scopeKey(todo.scope) !== scopeKey(scope) || todo.bucket !== bucket) continue;
      if (todo.order > max) max = todo.order;
    }
    return max + 1;
  }
  /**
   * Create one durable todo.
   * @param {object} input
   * @param {unknown} input.scope
   * @param {unknown} [input.bucket]
   * @param {unknown} input.title
   * @param {unknown} [input.description]
   * @param {unknown} [input.priority]
   * @param {'user' | 'agent' | 'system'} createdBy
   * @param {string} [sourceSessionId]
   * @returns {Promise<{ todo: any, duplicate: boolean }>}
   */
  async create(input, createdBy, sourceSessionId) {
    const table = this.requireTable();
    const scope = scopeOf(this.ctx, input?.scope);
    const requestedBucket = (
      /** @type {'plan' | 'backlog'} */
      enumOf(input?.bucket, BUCKETS, "bucket") ?? "backlog"
    );
    const inbox = scope.type === "inbox";
    const bucket = inbox ? "backlog" : requestedBucket;
    const downgraded = inbox && requestedBucket === "plan";
    const title = titleOf(input?.title);
    const description = descriptionOf(input?.description);
    const requestedPriority = enumOf(input?.priority, PRIORITIES, "priority");
    const priority = bucket === "plan" ? requestedPriority ?? "high" : void 0;
    const normalized = title.toLocaleLowerCase();
    for (const todo2 of this.list()) {
      if (todo2.status === "completed") continue;
      if (todo2.bucket !== bucket) continue;
      if (scopeKey(todo2.scope) !== scopeKey(scope)) continue;
      if (todo2.title.toLocaleLowerCase() === normalized) {
        return { todo: todo2, duplicate: true, ...downgraded ? { downgraded: true, reason: "inbox-is-backlog-only" } : {} };
      }
    }
    const timestamp = now();
    const todo = {
      id: randomUUID(),
      scope,
      bucket,
      title,
      ...description === void 0 ? {} : { description },
      status: "pending",
      ...priority === void 0 ? {} : { priority },
      order: this.nextOrder(scope, bucket),
      ...sourceSessionId === void 0 ? {} : { sourceSessionId },
      createdBy,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await table.put(todo.id, todo);
    return { todo: view(todo), duplicate: false, ...downgraded ? { downgraded: true, reason: "inbox-is-backlog-only" } : {} };
  }
  /**
   * Apply a partial update.
   * @param {string} id
   * @param {object} patch
   * @param {unknown} [patch.title]
   * @param {unknown} [patch.description]
   * @param {unknown} [patch.bucket]
   * @param {unknown} [patch.status]
   * @param {unknown} [patch.priority]
   * @returns {Promise<any>}
   */
  async update(id, patch = {}) {
    const table = this.requireTable();
    if (typeof id !== "string" || id.length === 0) throw new TodoError("todo/invalid-id", "id is required");
    const title = patch.title === void 0 ? void 0 : titleOf(patch.title);
    const hasDescription = Object.prototype.hasOwnProperty.call(patch, "description");
    const description = hasDescription ? descriptionOf(patch.description) : void 0;
    const bucket = patch.bucket === void 0 ? void 0 : enumOf(patch.bucket, BUCKETS, "bucket");
    const status = patch.status === void 0 ? void 0 : enumOf(patch.status, STATUSES, "status");
    const priority = patch.priority === void 0 ? void 0 : enumOf(patch.priority, PRIORITIES, "priority");
    if (title === void 0 && !hasDescription && bucket === void 0 && status === void 0 && priority === void 0) {
      throw new TodoError("todo/empty-update", "at least one field is required");
    }
    let updated;
    try {
      updated = await table.update(id, (current) => {
        const targetBucket = bucket ?? current.bucket;
        if (current.scope.type === "inbox" && targetBucket === "plan") {
          throw new TodoError("todo/inbox-is-backlog-only", "Inbox todos are backlog-only", 400);
        }
        const timestamp = now();
        const next = { ...current };
        if (title !== void 0) next.title = title;
        if (hasDescription) {
          if (description === void 0) delete next.description;
          else next.description = description;
        }
        if (bucket !== void 0 && bucket !== current.bucket) {
          next.bucket = bucket;
          next.order = this.nextOrder(current.scope, bucket, id);
        }
        if (next.bucket === "plan") {
          if (bucket !== void 0 && bucket !== current.bucket) next.priority = "medium";
          if (priority !== void 0) next.priority = priority;
          if (next.priority === void 0) next.priority = current.bucket === "plan" ? "high" : "medium";
        } else {
          delete next.priority;
        }
        if (status !== void 0 && status !== current.status) {
          next.status = status;
          if (status === "completed") next.completedAt = timestamp;
          else delete next.completedAt;
        }
        next.updatedAt = timestamp;
        return next;
      });
    } catch (error) {
      if (error?.code === "missing-key") throw new TodoError("todo/not-found", "todo not found", 404);
      throw error;
    }
    return view(updated);
  }
  /**
   * Permanently delete completed todos in one scope (or all scopes when omitted).
   * Storage has no cross-record transaction; a mid-way failure leaves the
   * records deleted so far, and the caller refreshes to the true remaining set.
   * @param {unknown} [scope]
   * @returns {Promise<number>}
   */
  async clearCompleted(scope) {
    const table = this.requireTable();
    let matches;
    if (scope === void 0) {
      matches = () => true;
    } else {
      if (scope === null || typeof scope !== "object") throw new TodoError("todo/invalid-scope", "scope must be workspace or inbox");
      const value = (
        /** @type {any} */
        scope
      );
      if (value.type === "inbox") matches = (todo) => todo.scope.type === "inbox";
      else if (value.type === "workspace" && typeof value.workspaceId === "string" && value.workspaceId.length > 0) {
        matches = (todo) => todo.scope.type === "workspace" && todo.scope.workspaceId === value.workspaceId;
      } else {
        throw new TodoError("todo/invalid-scope", "scope must be workspace or inbox");
      }
    }
    const targets = [...table.entries()].filter(([, todo]) => todo.status === "completed" && matches(todo)).map(([id]) => id);
    for (const id of targets) await table.delete(id);
    return targets.length;
  }
  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  async delete(id) {
    if (typeof id !== "string" || id.length === 0) throw new TodoError("todo/invalid-id", "id is required");
    const removed = await this.requireTable().delete(id);
    if (!removed) throw new TodoError("todo/not-found", "todo not found", 404);
  }
};

// src/host/routes.js
var HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};
function ok(value, status = 200) {
  return new Response(JSON.stringify({ ok: true, value }), { status, headers: HEADERS });
}
function fail(error) {
  return new Response(JSON.stringify({
    ok: false,
    error: { code: error.code, message: error.message }
  }), { status: error.status, headers: HEADERS });
}
function crash(error) {
  const message = error instanceof Error ? error.message : String(error);
  return fail(new TodoError("todo/internal", message, 500));
}
async function bodyOf(request) {
  let value;
  try {
    value = await request.json();
  } catch {
    throw new TodoError("todo/invalid-json", "request body must be JSON");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TodoError("todo/invalid-json", "request body must be a JSON object");
  }
  return (
    /** @type {Record<string, unknown>} */
    value
  );
}
function registerTodoRoutes(ctx, store) {
  const requireStore = () => {
    if (store === void 0) throw new TodoError("todo/not-ready", "todo storage is not ready", 503);
    return store;
  };
  const disposers = [
    ctx.connection.fetch.register({
      path: "/api/todos",
      methods: ["GET"],
      requestBody: "buffered",
      fetch: async () => {
        try {
          return ok({ todos: requireStore().list() });
        } catch (error) {
          return error instanceof TodoError ? fail(error) : crash(error);
        }
      }
    }),
    ctx.connection.fetch.register({
      path: "/api/todos/create",
      methods: ["POST"],
      requestBody: "buffered",
      fetch: async (request) => {
        try {
          const body = await bodyOf(request);
          const result = await requireStore().create(body, "user");
          return ok(result, 201);
        } catch (error) {
          return error instanceof TodoError ? fail(error) : crash(error);
        }
      }
    }),
    ctx.connection.fetch.register({
      path: "/api/todos/update",
      methods: ["POST"],
      requestBody: "buffered",
      fetch: async (request) => {
        try {
          const body = await bodyOf(request);
          const id = body.id;
          if (typeof id !== "string") throw new TodoError("todo/invalid-id", "id is required");
          const { id: _id, ...patch } = body;
          return ok({ todo: await requireStore().update(id, patch) });
        } catch (error) {
          return error instanceof TodoError ? fail(error) : crash(error);
        }
      }
    }),
    ctx.connection.fetch.register({
      path: "/api/todos/clear-completed",
      methods: ["POST"],
      requestBody: "buffered",
      fetch: async (request) => {
        try {
          const body = await bodyOf(request);
          if (body.scope === void 0) throw new TodoError("todo/invalid-scope", "scope is required", 400);
          const deleted = await requireStore().clearCompleted(body.scope);
          return ok({ deleted });
        } catch (error) {
          return error instanceof TodoError ? fail(error) : crash(error);
        }
      }
    }),
    ctx.connection.fetch.register({
      path: "/api/todos/delete",
      methods: ["POST"],
      requestBody: "buffered",
      fetch: async (request) => {
        try {
          const body = await bodyOf(request);
          if (typeof body.id !== "string") throw new TodoError("todo/invalid-id", "id is required");
          await requireStore().delete(body.id);
          return ok({ id: body.id });
        } catch (error) {
          return error instanceof TodoError ? fail(error) : crash(error);
        }
      }
    })
  ];
  return async () => {
    await Promise.all(disposers.map((dispose) => dispose()));
  };
}

// src/host/tools.js
import { defineTool } from "@deepseek-ai/dsh-tools";
var ADD_DESCRIPTION = 'Persist actionable work to the current workspace. Use for work that should survive this session: concrete out-of-scope issues, necessary follow-ups not completed now, or actionable work the user explicitly asks you to track. Default to bucket "backlog". Use bucket "plan" only when the user explicitly commits the work as a next step; never use plan for your own suggestions, because a plan you propose is not a commitment. Do not use for: steps you are about to execute now (use todo_write), speculative improvements, minor observations, completed work, duplicates, or facts/preferences. Do NOT pass a workspace \u2014 the host resolves it from this session. Plan priority defaults to high and may be high | medium | low; Backlog has no priority and ignores a supplied one. Inbox (no workspace) is backlog-only, so a plan request there is downgraded. Be selective: one item per task.';
var UPDATE_DESCRIPTION = "Update one durable workspace todo by id: change status (pending | in_progress | completed), move it between buckets (backlog \u2194 plan), or edit title, description, or plan priority. Do not move an item to plan without explicit user commitment; that is a commitment, not an agent suggestion. Plan priorities are high | medium | low; Backlog has none. Moving backlog \u2192 plan sets medium; moving plan \u2192 backlog clears the priority. Inbox todos cannot move to plan. Use this when you finish a workspace plan item or promote user-committed backlog work.";
var TODO_OBJECT = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    bucket: { type: "string", enum: [...BUCKETS] },
    status: { type: "string", enum: [...STATUSES] },
    scope: { type: "object", additionalProperties: true }
  }
};
var ADD_OUTPUT = {
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      todo: { ...TODO_OBJECT, required: true },
      duplicate: { type: "boolean", required: true },
      downgraded: { type: "boolean" },
      reason: { type: "string" }
    }
  },
  render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
};
var UPDATE_OUTPUT = {
  schema: {
    type: "object",
    additionalProperties: false,
    properties: { todo: { ...TODO_OBJECT, required: true } }
  },
  render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
};
function registerTodoTools(ctx, store) {
  const storeOf = () => store ?? ctx.get?.("todos")?.store;
  ctx.effect(() => {
    const definition = defineTool({
      name: "todo_add",
      description: ADD_DESCRIPTION,
      parameters: {
        title: {
          type: "string",
          required: true,
          description: "One imperative line. What must be done, not a status report."
        },
        bucket: {
          type: "string",
          enum: [...BUCKETS],
          description: "backlog (default: worth doing later) or plan (only when the user explicitly commits it as a next step)."
        },
        description: {
          type: "string",
          description: "Optional longer context for the item."
        },
        priority: {
          type: "string",
          enum: [...PRIORITIES],
          description: "Plan priority (high | medium | low); affects Plan ordering. Ignored for Backlog."
        }
      },
      output: ADD_OUTPUT,
      execute(args, exec) {
        const session = exec.agent?.session;
        if (session === void 0) throw new Error("todo_add requires an owning agent session");
        const current = storeOf();
        if (current === void 0) throw new Error("todo storage is not ready");
        const scope = resolveScope(ctx, session);
        return current.create({ ...args, scope }, "agent", session.id).then((result) => ({
          todo: result.todo,
          duplicate: result.duplicate,
          ...result.downgraded ? { downgraded: true, reason: result.reason } : {}
        }));
      }
    });
    const dispose = ctx.tools.register(definition);
    return dispose;
  }, "dsh-plugin-todos: todo_add");
  ctx.effect(() => {
    const definition = defineTool({
      name: "todo_update",
      description: UPDATE_DESCRIPTION,
      parameters: {
        id: {
          type: "string",
          required: true,
          description: "The id returned by todo_add or shown by the workspace todo board."
        },
        status: {
          type: "string",
          enum: [...STATUSES],
          description: "New lifecycle state."
        },
        bucket: {
          type: "string",
          enum: [...BUCKETS],
          description: "Move the item between plan and backlog."
        },
        title: { type: "string", description: "Replacement title." },
        description: { type: "string", description: "Replacement description." },
        priority: { type: "string", enum: [...PRIORITIES], description: "Replacement priority." }
      },
      output: UPDATE_OUTPUT,
      execute(args) {
        const current = storeOf();
        if (current === void 0) throw new Error("todo storage is not ready");
        const { id, ...patch } = args;
        return current.update(id, patch).then((todo) => ({ todo }));
      }
    });
    const dispose = ctx.tools.register(definition);
    return dispose;
  }, "dsh-plugin-todos: todo_update");
}

// src/host/index.js
var name = "dsh-plugin-todos";
var inject = ["storageDomain", "connection", "workspaceRegistry", "tools", "systemPrompt", "commands"];
var TodosService = class extends Service {
  static inject = ["storageDomain", "connection"];
  /** @param {import('@deepseek-ai/cordis').Context} ctx */
  constructor(ctx) {
    super(ctx, "todos");
    this.store = new TodoStore(ctx);
  }
  /** Open the durable domain and own its close. */
  async [Service.init]() {
    await this.store.open();
    this.ctx.effect(() => () => this.store.close(), "dsh-plugin-todos: domain close");
    this.ctx.effect(() => registerTodoRoutes(this.ctx, this.store), "dsh-plugin-todos: routes");
  }
};
function apply(ctx) {
  ctx.plugin(TodosService);
  registerTodoTools(ctx);
  ctx.effect(() => registerTodoCommands(ctx), "dsh-plugin-todos: /todo command");
  ctx.effect(() => ctx.systemPrompt.section({
    name: "plugin:todos-board",
    order: GUIDANCE_ORDER,
    text: ({ scope }) => ctx.tools.get("todo_add", scope) === void 0 ? "" : GUIDANCE
  }), "dsh-plugin-todos: workspace todo guidance");
}
export {
  apply,
  inject,
  name
};

