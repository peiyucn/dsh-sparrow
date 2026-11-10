/** Notebook shelf styles: a reading list over the local markdown library (no editor surface). */

export const NOTEBOOK_CSS = `
.dsh-desk-notebookview {
  box-sizing: border-box;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: calc(var(--dsh-desk-header-h) + 14px) 28px 0;
  overflow: hidden;
}
.dsh-desk-notebook-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.dsh-desk-notebook-search {
  flex: 1 1 240px;
  min-width: 180px;
  height: 32px;
  padding: 0 12px;
  border: 0.5px solid var(--dsw-alias-border-l2, #d5d9e0);
  border-radius: 9px;
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 12px;
  outline: none;
}
.dsh-desk-notebook-search:focus {
  border-color: var(--dsw-alias-brand-primary, #4f7cff);
}
.dsh-desk-notebook-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.dsh-desk-notebook-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l2, #d5d9e0);
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 11px;
  cursor: pointer;
}
.dsh-desk-notebook-chip:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.dsh-desk-notebook-chip[data-active='true'] {
  border-color: var(--dsw-alias-brand-primary, #4f7cff);
  color: var(--dsw-alias-brand-primary, #4f7cff);
}
.dsh-desk-notebook-chip b {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.dsh-desk-notebook-listhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 16px 2px 8px;
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 11px;
}
.dsh-desk-notebook-rows {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-bottom: 24px;
}
.dsh-desk-notebook-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.dsh-desk-notebook-row:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}

.dsh-desk-notebook-row-title {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 13px;
}
.dsh-desk-notebook-row-path {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 11px;
}
.dsh-desk-notebook-row-badge {
  flex: none;
  padding: 1px 6px;
  border-radius: 6px;
  background: color-mix(in srgb, #e2a03c 16%, transparent);
  color: #a86500;
  font-size: 10px;
}
.dsh-desk-notebook-row-date {
  flex: none;
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.dsh-desk-notebook-tags {
  display: flex;
  gap: 4px;
  flex: none;
}
.dsh-desk-notebook-tag {
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 10px;
}
.dsh-desk-notebook-empty {
  margin: auto;
  max-width: 420px;
  padding: 24px;
  text-align: center;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-desk-notebook-empty h3 {
  margin: 0 0 8px;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 15px;
  font-weight: 600;
}
.dsh-desk-notebook-empty p {
  margin: 0 0 16px;
  font-size: 12px;
  line-height: 1.7;
}
.dsh-desk-notebook-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}
.dsh-desk-notebook-error {
  margin: 0 0 10px;
  padding: 8px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, #d94a3d 10%, transparent);
  color: #b2352a;
  font-size: 12px;
}

.dsh-desk-notebook-picker {
  margin: 10px auto 0;
  width: min(520px, 100%);
  padding: 16px;
  border: 0.5px solid var(--dsw-alias-border-l2, #d5d9e0);
  border-radius: 12px;
  background: var(--dsw-menu-surface-fill, var(--dsw-specific-menu, #ffffff));
  box-shadow: var(--dsw-elevation-panel, 0 10px 30px -12px rgba(20, 25, 40, 0.4));
  text-align: left;
}
.dsh-desk-notebook-picker h4 {
  margin: 0 0 10px;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 13px;
  font-weight: 600;
}
.dsh-desk-notebook-picker-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 180px;
  overflow-y: auto;
  margin-bottom: 10px;
}
.dsh-desk-notebook-picker-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 9px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.dsh-desk-notebook-picker-row:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.dsh-desk-notebook-picker-row[data-picked='true'] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4f7cff) 10%, transparent);
}
.dsh-desk-notebook-picker-name {
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 12px;
}
.dsh-desk-notebook-picker-path {
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 10px;
  word-break: break-all;
}

.dsh-desk-notebook-picker-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.dsh-desk-notebook-hint {
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 11px;
  line-height: 1.6;
}
`
