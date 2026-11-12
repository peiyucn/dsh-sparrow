/** Notebook library styles (official theme aliases only, light/dark adaptive). */

export const NOTEBOOK_CSS = `
.dsh-desk-notebookview {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
  padding: calc(var(--dsh-desk-header-h) + 12px) 14px 14px;
  overflow-y: auto;
}
.dsh-desk-notebook-error {
  margin: 0;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.04));
  color: var(--dsw-alias-state-error-primary, #c0503f);
  font-size: 11px;
}
.dsh-desk-notebook-hint {
  margin: 0;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 11px;
  line-height: 1.6;
}
.dsh-desk-notebook-empty {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 16px;
  border: 0.5px dashed var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12));
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02));
}
.dsh-desk-notebook-empty h3 {
  margin: 0;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 13px;
}
.dsh-desk-notebook-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.dsh-desk-notebook-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dsh-desk-notebook-pickeritem {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 8px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary, #1f2329);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.dsh-desk-notebook-pickeritem:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04));
}
.dsh-desk-notebook-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsh-desk-notebook-search {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: 8px;
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2329);
  font: inherit;
  font-size: 12px;
}
.dsh-desk-notebook-search::placeholder {
  color: var(--dsw-alias-label-caption, #8a919f);
}
.dsh-desk-notebook-search:focus {
  outline: none;
  border-color: var(--dsw-alias-brand-primary, #4176e6);
}
.dsh-desk-notebook-stats {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.dsh-desk-notebook-stat {
  padding: 2px 8px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}
.dsh-desk-notebook-stat[data-active='true'] {
  color: var(--dsw-alias-label-primary, #1f2329);
  background: var(--dsw-alias-interactive-bg-secondary, rgba(0, 0, 0, 0.05));
}
.dsh-desk-notebook-root {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 10px;
}
.dsh-desk-notebook-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dsh-desk-notebook-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.04));
}
.dsh-desk-notebook-open {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 4px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dsh-desk-notebook-open:hover .dsh-desk-notebook-row-title {
  color: var(--dsw-alias-brand-primary, #4176e6);
}
.dsh-desk-notebook-row-title {
  flex: none;
  max-width: 52%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 12px;
  font-weight: 600;
}
.dsh-desk-notebook-row-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 10px;
}
.dsh-desk-notebook-row-date {
  flex: none;
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.dsh-desk-notebook-tags {
  display: flex;
  flex: none;
  gap: 4px;
}
.dsh-desk-notebook-tag {
  padding: 0 5px;
  border-radius: 4px;
  background: var(--dsw-alias-interactive-bg-secondary, rgba(0, 0, 0, 0.05));
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 9px;
  line-height: 15px;
}
`
