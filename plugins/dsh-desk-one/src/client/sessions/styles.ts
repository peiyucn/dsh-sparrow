/** Session archive management CSS (A2). */

export const SESSIONS_CSS = `
.dsh-desk-archive-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.dsh-desk-archive-list .dsh-desk-archive-list {
  border-top: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
}
.dsh-desk-archive-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 3px 10px 3px 12px;
  border-top: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
}
.dsh-desk-archive-list > li:first-child > .dsh-desk-archive-row {
  border-top: 0;
}
.dsh-desk-archive-row[data-live='true'] {
  opacity: .72;
}
.dsh-desk-archive-row-toggle {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  padding: 0;
  cursor: pointer;
}
.dsh-desk-archive-row-toggle:disabled { cursor: default; }
.dsh-desk-archive-caret {
  width: 14px;
  flex: none;
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  cursor: pointer;
}
.dsh-desk-archive-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 18px;
}
.dsh-desk-archive-badge {
  flex: none;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.06));
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 10px;
  line-height: 16px;
}
.dsh-desk-archive-meta {
  flex: none;
  margin-left: auto;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  white-space: nowrap;
}
.dsh-desk-archive-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
}
.dsh-desk-archive-action {
  border: 0.5px solid var(--dsw-alias-border-l2, #d8dde5);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 11px;
  line-height: 20px;
  padding: 0 7px;
  border-radius: 6px;
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
.dsh-desk-archive-loadmore {
  margin: 6px auto;
  display: block;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
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
`
