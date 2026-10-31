/**
 * Board styles, injected once per plugin lifetime. Class names are plugin-local;
 * colors and radii come from the shell's design tokens so the page follows the
 * active theme and density.
 *
 * @module dsh-plugin-todos/styles
 */

export const STYLE = `
.dsh-todos-page {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
  font-size: 14px;
  line-height: 1.6;
  overflow: hidden;
}
.dsh-todos-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
}
.dsh-todos-content {
  box-sizing: border-box;
  max-width: 920px;
  margin: 0 auto;
  padding: 0 clamp(24px, 4vw, 48px) 56px;
}
.dsh-todos-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-top: 28px;
  margin-bottom: 6px;
}
[data-platform="darwin"] .dsh-todos-heading {
  padding-top: calc(28px + var(--dsh-frame-top-clearance, 0px));
}
.dsh-todos-heading-text { min-width: 0; }
.dsh-todos-heading h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
  line-height: 28px;
}
.dsh-todos-subtitle {
  max-width: 560px;
  margin: 4px 0 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 21px;
}
.dsh-todos-refresh {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 14px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 20px;
  cursor: pointer;
}
.dsh-todos-refresh:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dsh-todos-refresh:disabled { opacity: 0.55; cursor: default; }
.dsh-todos-refresh > span { white-space: nowrap; }
.dsh-todos-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 18px 0 4px;
}
.dsh-todos-filter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 11px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 13px;
  line-height: 22px;
  white-space: nowrap;
  cursor: pointer;
}
.dsh-todos-filter:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-todos-filter[aria-pressed="true"] {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dsh-todos-filter-count {
  color: var(--dsw-alias-label-caption);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
}
.dsh-todos-filter[aria-pressed="true"] .dsh-todos-filter-count { color: var(--dsw-alias-label-tertiary); }
.dsh-todos-error {
  margin: 10px 0 0;
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 20px;
}
.dsh-todos-notice {
  margin: 10px 0 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 20px;
}
.dsh-todos-group { margin-top: 28px; }
.dsh-todos-group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.dsh-todos-group-head h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
}
.dsh-todos-group-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-todos-chip {
  flex: none;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--dsw-alias-fill-l2);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-weight: 400;
  line-height: 18px;
}
.dsh-todos-group-meta {
  flex: none;
  color: var(--dsw-alias-label-caption);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.dsh-todos-group-path {
  margin: 2px 0 10px;
  color: var(--dsw-alias-label-caption);
  font-family: var(--dsw-font-mono);
  font-size: 11px;
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-todos-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 64px 20px;
  color: var(--dsw-alias-label-tertiary);
  text-align: center;
}
.dsh-todos-empty-icon { margin-bottom: 12px; color: var(--dsw-alias-label-caption); }
.dsh-todos-empty h2 {
  margin: 0 0 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
}
.dsh-todos-empty p {
  max-width: 460px;
  margin: 0;
  font-size: 13px;
  line-height: 21px;
}
.dsh-todos-empty-action { margin-top: 16px; }
.dsh-todos-loading {
  padding: 56px 20px;
  color: var(--dsw-alias-label-tertiary);
  text-align: center;
  font-size: 13px;
}
.dsh-todos-composer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 16px 0 4px;
}
.dsh-todos-input {
  flex: 1 1 260px;
  min-width: 180px;
  height: 34px;
  padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 10px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
}
.dsh-todos-input::placeholder { color: var(--dsw-alias-label-caption); }
.dsh-todos-input:focus { border-color: var(--dsw-alias-state-business-primary); outline: none; }
.dsh-todos-select {
  max-width: 200px;
  height: 34px;
  padding: 0 8px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 10px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 20px;
}
.dsh-todos-add {
  height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 10px;
  background: var(--dsw-alias-state-business-primary);
  color: #fff;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.dsh-todos-add:disabled { opacity: 0.5; cursor: default; }
.dsh-todos-bucket { margin-top: 14px; }
.dsh-todos-bucket h3 {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0 0 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
}
.dsh-todos-bucket-count { color: var(--dsw-alias-label-caption); font-weight: 400; font-variant-numeric: tabular-nums; }
.dsh-todos-wlist {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.dsh-todos-wtodo {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 10px;
}
.dsh-todos-wtodo:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-todos-wtodo[data-pending] { opacity: 0.6; }
.dsh-todos-check {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 20px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-caption);
  cursor: pointer;
}
.dsh-todos-check::before {
  content: "";
  width: 10px;
  height: 10px;
  border: 1.5px solid var(--dsw-alias-border-l2);
  border-radius: 50%;
}
.dsh-todos-check[aria-pressed="true"]::before { display: none; }
.dsh-todos-check:disabled { cursor: default; }
.dsh-todos-wtodo-body { display: flex; flex: 1; flex-direction: column; gap: 1px; min-width: 0; }
.dsh-todos-wtodo-title { overflow-wrap: anywhere; font-size: 13px; line-height: 20px; }
.dsh-todos-wtodo[data-status="completed"] .dsh-todos-wtodo-title {
  color: var(--dsw-alias-label-caption);
  text-decoration: line-through;
  text-decoration-color: var(--dsw-alias-border-l2);
}
.dsh-todos-wtodo-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 16px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
.dsh-todos-source {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-state-business-primary);
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  cursor: pointer;
}
.dsh-todos-source:hover { text-decoration: underline; }
.dsh-todos-priority-select {
  height: 20px;
  padding: 0 4px;
  border: 0;
  border-radius: 5px;
  background: var(--dsw-alias-fill-l2);
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 10px;
  line-height: 16px;
  cursor: pointer;
}
.dsh-todos-priority-select:hover { color: var(--dsw-alias-label-primary); }
.dsh-todos-priority-select:disabled { opacity: 0.6; cursor: default; }

.dsh-todos-wactions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.12s;
}
.dsh-todos-wtodo:hover .dsh-todos-wactions,
.dsh-todos-wtodo:focus-within .dsh-todos-wactions { opacity: 1; }
.dsh-todos-wactions button {
  padding: 1px 5px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 11px;
  line-height: 18px;
  cursor: pointer;
}
.dsh-todos-wactions button:hover { background: var(--dsw-alias-fill-l1); color: var(--dsw-alias-label-primary); }
.dsh-todos-wactions button:disabled { opacity: 0.5; cursor: default; }
.dsh-todos-delete { font-size: 14px; line-height: 18px; }

.dsh-todos-group-actions { display: flex; align-items: center; gap: 8px; }
.dsh-todos-clear {
  padding: 1px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
  cursor: pointer;
}
.dsh-todos-clear:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-todos-clear:disabled { opacity: 0.55; cursor: default; }
.dsh-todos-confirm {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
}
.dsh-todos-confirm button {
  padding: 1px 6px;
  border: 0;
  border-radius: 6px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  line-height: 18px;
  cursor: pointer;
}
.dsh-todos-confirm button:first-of-type { color: var(--dsw-alias-state-error-primary); }
.dsh-todos-confirm button:disabled { opacity: 0.55; cursor: default; }
@media (hover: none) {
  .dsh-todos-wactions { opacity: 1; }
}
@media (max-width: 640px) {
  .dsh-todos-input { flex-basis: 100%; }
  .dsh-todos-select { flex: 1; max-width: none; }
  .dsh-todos-add { flex: 1; }
}
.dsh-todos-page :focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
`
