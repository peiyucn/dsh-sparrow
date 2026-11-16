/** Session archive management CSS (A2). */

export const SESSIONS_CSS = `
.dsh-desk-archive-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
/* Capsule + action geometry match the notebook list rows, so both tabs read as one product. */
.dsh-desk-archive-badge {
  flex: none;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-module-platform, rgba(0,0,0,.04));
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 11px;
  font-weight: 500;
  line-height: 17px;
}
.dsh-desk-archive-action {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l3, #d4d8e0);
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-primary, #1f2329);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
  white-space: nowrap;
}
.dsh-desk-archive-action:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
.dsh-desk-archive-action:disabled { opacity: .45; cursor: default; }
.dsh-desk-archive-action[data-danger='true'] {
  border-color: color-mix(in srgb, #c2410c 55%, transparent);
  color: #c2410c;
}
.dsh-desk-archive-deletebox {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px 8px;
}
.dsh-desk-archive-input {
  flex: 1;
  min-width: 0;
  font: inherit;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 0.5px solid var(--dsw-alias-border-l2, #d8dde5);
  background: transparent;
  color: inherit;
}
.dsh-desk-archive-note {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
.dsh-desk-archive-error {
  margin: 0;
  font-size: 12px;
  color: #c2410c;
}
.dsh-desk-archive-bulk {
  display: flex;
  gap: 4px;
  margin-left: auto;
}
.dsh-desk-archive-trashdir {
  align-self: flex-start;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6);
  font: inherit;
  font-size: 11px;
  padding: 0;
  cursor: pointer;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* One row shape for active / archived / stray / trash, so icons, indentation and spacing match. */
.dsh-desk-tree-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 10px;
  border-top: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
}
/* Each row is the only child of its <li>, so :nth-child(1) on the row matched every row and
   removed every separator. Drop the line only for the first row of a list instead. */
.dsh-desk-session-list > li:first-child > .dsh-desk-tree-row,
.dsh-desk-tree-children > li:first-child > .dsh-desk-tree-row,
.dsh-desk-archive-list > li:first-child > .dsh-desk-tree-row {
  border-top: 0;
}
.dsh-desk-tree-row[data-nested='true'] {
  background: transparent;
}
/* Nested group uses the same soft status tint as task-board session chips, not a hard rail. */
.dsh-desk-tree-children {
  list-style: none;
  margin: 3px 8px 3px 18px;
  padding: 2px 0;
  border-radius: 8px;
  background: color-mix(in srgb, var(--dsw-alias-label-secondary, #6b7280) 4%, transparent);
}
.dsh-desk-tree-row-toggle {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  padding: 0;
  cursor: pointer;
}
.dsh-desk-tree-row-toggle:disabled { cursor: default; }
.dsh-desk-tree-caret {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-left: -4px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  cursor: pointer;
  border-radius: 4px;
}
.dsh-desk-tree-caret:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.06)); }
.dsh-desk-tree-title {
  /* Same two-column reading as the notebook list: fixed title column, facts to the right. */
  flex: 0 0 34%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: 18px;
}
.dsh-desk-tree-meta,
.dsh-desk-tree-status {
  flex: none;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  white-space: nowrap;
}
.dsh-desk-tree-meta { margin-left: auto; }
.dsh-desk-tree-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
}
.dsh-desk-row-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0.5px solid var(--dsw-alias-border-l2, #d8dde5);
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  cursor: pointer;
}
.dsh-desk-row-action svg {
  width: 16px;
  height: 16px;
}
.dsh-desk-row-action:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); color: inherit; }
.dsh-desk-row-action:disabled { opacity: .4; cursor: default; }
.dsh-desk-row-action[data-armed='true'] { border-color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6); color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6); }
.dsh-desk-row-action[data-danger='true'] { color: #c2410c; border-color: color-mix(in srgb, #c2410c 45%, transparent); }
/* Copy feedback stays on the button itself: green check on success, red tint on a rejected write. */
.dsh-desk-row-copy[data-copy-state='copied'] {
  color: var(--dsw-alias-state-success-primary, #3a9a5b);
  border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary, #3a9a5b) 45%, transparent);
}
.dsh-desk-row-copy[data-copy-state='failed'] {
  color: var(--dsw-alias-state-error-primary, #c0503f);
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary, #c0503f) 45%, transparent);
}
`
