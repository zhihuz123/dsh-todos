/**
 * Model-facing policy for the three todo layers.
 *
 * The section is emitted only where `todo_add` is actually visible, so presets
 * without the durable tool are not told to call it.
 *
 * @module dsh-plugin-todos/host/guidance
 */

/** Placement after the tool sections and before deliverable references. */
export const GUIDANCE_ORDER = 5200

export const GUIDANCE = 'Workspace todo board has three layers. todo_write is the current turn\'s execution checklist and is cleared when the next turn starts. Workspace Plan is work already decided to do next. Workspace Backlog is work worth doing later but not committed. Use todo_add for work that must survive this session: bucket "backlog" (the default) when you discover a concrete, actionable, out-of-scope issue, when a necessary follow-up will not be completed now, or when the user asks you to track actionable work; use bucket "plan" only when the user explicitly commits the work as a next step ("add this to plan", "we will do next", "make it a plan"). A plan you propose is not a commitment; wait for user confirmation. Do not add: steps you are about to execute now (use todo_write); speculative improvements, minor observations, or exhaustive wishlists; work already completed; items already tracked (check for duplicates); facts, preferences, or decisions that are not actionable work. When you add autonomously, mention it briefly in the final response. Be selective: one item per task. Do not pass a workspace — the host resolves it from this session. Never mirror todo_write into the workspace board. Plan defaults to high priority and uses high | medium | low; Backlog has no priority; Inbox is backlog-only. Use todo_update to mark in_progress or completed, or to move between backlog and plan; do not move to plan without explicit user commitment.'
