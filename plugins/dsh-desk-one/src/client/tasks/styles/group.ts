/** Draft card, one-level groups and the compact lane form used by narrow panels. */

export const TASK_GROUP_CSS = `
/* Draft card: an empty title cancels instead of creating an empty task. */
.dsh-task-draft {
  flex: none;
  padding: 8px 10px;
  border: 1px dashed var(--dsw-alias-border-l2, #cfd4dc);
  border-radius: var(--dsw-radius-md, 12px);
  background: transparent;
}
/* One-level groups inside a lane: a bordered container so a group reads as a real block. */
.dsh-task-group {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 2px;
  padding: 6px 8px 8px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-radius: var(--dsw-radius-md, 12px);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #ffffff) 82%, var(--dsw-alias-label-primary, #1f2329));
  transition: border-color 0.12s ease, background 0.12s ease;
}
.dsh-task-group[data-over='true'] {
  border-color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #ffffff) 74%, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6) 35%, transparent);
}
.dsh-task-group[data-dragging='true'] {
  opacity: 0.45;
}
.dsh-task-group-head {
  display: grid;
  grid-template-columns: 16px 18px minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  column-gap: 4px;
  row-gap: 1px;
  align-items: center;
  min-height: 28px;
  padding: 2px;
  border-radius: var(--dsw-radius-sm, 8px);
}
.dsh-task-group-head:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04));
}
/* Two-row header: row 1 = name, row 2 = count; grip / chevron / actions span both rows. */
.dsh-task-group-head > .dsh-task-group-grip {
  grid-column: 1;
  grid-row: 1 / span 2;
}
.dsh-task-group-head > .dsh-task-add {
  grid-column: 2;
  grid-row: 1 / span 2;
}
.dsh-task-group-main {
  grid-column: 3;
  grid-row: 1 / span 2;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.dsh-task-group-title {
  display: flex;
  align-items: center;
  min-width: 0;
}
.dsh-task-group-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 14px;
  font-size: 11px;
  line-height: 14px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-task-group-meta .dsh-task-count {
  margin-left: 0;
  font-size: 11px;
  white-space: nowrap;
}
.dsh-task-group-grip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 16px;
  height: 22px;
  margin-left: -2px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  cursor: grab;
  opacity: 0.45;
  transition: opacity 0.12s ease;
}
.dsh-task-group-head:hover .dsh-task-group-grip {
  opacity: 0.95;
}
.dsh-task-group-grip:active {
  cursor: grabbing;
}
/* Whole-group drag: the cloned group block follows the pointer, exactly like a card ghost. */
.dsh-task-group-ghost {
  position: fixed;
  box-sizing: border-box;
  opacity: 0.96;
  pointer-events: none;
  box-shadow: 0 18px 40px -20px rgba(20, 25, 40, 0.55);
}
.dsh-task-group-grip svg {
  display: block;
  width: 8px;
  height: 14px;
}
.dsh-task-group-name {
  appearance: none;
  border: none;
  background: transparent;
  padding: 0 2px;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  cursor: text;
}
.dsh-task-group-input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 1px 4px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-radius: var(--dsw-radius-xs, 4px);
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2329);
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  outline: none;
}
.dsh-task-group-actions {
  grid-column: 4;
  grid-row: 1 / span 2;
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.12s ease;
}
/* The shared icon primitive (app styles) keeps group actions quieter through hover-only reveal. */
.dsh-task-group-head:hover .dsh-task-group-actions {
  opacity: 1;
}
.dsh-task-group-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
}
.dsh-task-group-empty {
  margin: 4px 2px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-task-group-new {
  padding: 2px 2px 0;
}
/* Compact lanes: count-only columns for narrow panels (replaces a horizontal scrollbar). */
.dsh-task-lane[data-compact='true'] {
  padding: 8px;
}
.dsh-task-compact {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
}
.dsh-task-compact-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px;
  border-radius: var(--dsw-radius-xs, 4px);
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-task-compact-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-task-compact-count {
  flex: none;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-variant-numeric: tabular-nums;
}
`
