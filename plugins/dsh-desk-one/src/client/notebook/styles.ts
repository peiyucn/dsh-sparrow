/**
 * Notebook styles: library workspace picker, search-first hero, folder tree, page list, and the
 * review tab's source view / inline composer / bottom bar. Official theme aliases only.
 */

export const NOTEBOOK_CSS = `
/* --- page shell ---------------------------------------------------------- */
.dsh-desk-notebookview {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
  padding: calc(var(--dsh-desk-header-h) + 12px) 18px 14px;
  overflow: hidden;
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
.dsh-desk-notebook-fineprint {
  margin: 4px 0 0;
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 10px;
  line-height: 1.5;
}

/* --- centered empty state ------------------------------------------------ */
.dsh-desk-notebook-center {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dsh-desk-notebook-center-card {
  width: min(520px, 92%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 26px 28px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02));
  text-align: center;
}
.dsh-desk-notebook-center-card h3 {
  margin: 0;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 15px;
}
.dsh-desk-notebook-center-card p {
  margin: 0;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 12px;
  line-height: 1.7;
}
.dsh-desk-notebook-center-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.dsh-desk-notebook-center-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
  text-align: left;
}

/* --- hero + search ------------------------------------------------------- */
.dsh-desk-notebook-hero {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: none;
}
.dsh-desk-notebook-hero-main {
  display: flex;
  align-items: center;
  gap: 14px;
}
.dsh-desk-notebook-newbutton {
  flex: none;
  height: 44px;
  padding: 0 22px;
  font-size: 14px;
  font-weight: 600;
}
.dsh-desk-notebook-hero-copy h3 {
  margin: 0 0 3px;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 15px;
}
.dsh-desk-notebook-hero-copy p {
  margin: 0;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 11px;
  line-height: 1.6;
}
.dsh-desk-notebook-searchengine {
  box-sizing: border-box;
  width: min(640px, 100%);
  margin: 0 auto;
  padding: 11px 18px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: 999px;
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2329);
  font: inherit;
  font-size: 13px;
  text-align: center;
  box-shadow: var(--dsw-elevation-panel, 0 2px 10px rgba(0, 0, 0, 0.06));
}
.dsh-desk-notebook-searchengine::placeholder {
  color: var(--dsw-alias-label-caption, #8a919f);
}
.dsh-desk-notebook-searchengine:focus {
  outline: none;
  border-color: var(--dsw-alias-brand-primary, #4176e6);
}
.dsh-desk-notebook-new {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02));
}
.dsh-desk-notebook-search {
  box-sizing: border-box;
  width: min(420px, 100%);
  padding: 7px 10px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: 8px;
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2329);
  font: inherit;
  font-size: 12px;
}
.dsh-desk-notebook-search:focus {
  outline: none;
  border-color: var(--dsw-alias-brand-primary, #4176e6);
}
.dsh-desk-notebook-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* --- split layout: tree + list ------------------------------------------ */
.dsh-desk-notebook-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 0;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: 12px;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02));
}
.dsh-desk-notebook-side {
  flex: 0 0 30%;
  min-width: 190px;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06));
  background: var(--dsw-alias-bg-base, #ffffff);
}
.dsh-desk-notebook-sidehead {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 8px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06));
}
.dsh-desk-notebook-tree {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 4px;
}
.dsh-desk-notebook-treebranch {
  display: flex;
  flex-direction: column;
}
.dsh-desk-notebook-treeitem {
  display: flex;
  align-items: center;
  gap: 2px;
  border-radius: 6px;
}
.dsh-desk-notebook-treeitem:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04));
}
.dsh-desk-notebook-treeitem[data-selected] {
  background: var(--dsw-alias-interactive-bg-secondary, rgba(0, 0, 0, 0.06));
}
.dsh-desk-notebook-treetoggle {
  flex: none;
  width: 16px;
  height: 22px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 9px;
  cursor: pointer;
}
.dsh-desk-notebook-treelabel {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 3px 4px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dsh-desk-notebook-treefolder {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 12px;
}
.dsh-desk-notebook-treecount {
  flex: none;
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
}
.dsh-desk-notebook-sidentries {
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  border-top: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06));
}
.dsh-desk-notebook-sideentry {
  flex: 1;
  padding: 4px 6px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}
.dsh-desk-notebook-sideentry[data-active] {
  color: var(--dsw-alias-label-primary, #1f2329);
  background: var(--dsw-alias-interactive-bg-secondary, rgba(0, 0, 0, 0.06));
}
.dsh-desk-notebook-side .dsh-desk-notebook-fineprint {
  padding: 0 8px 8px;
}
.dsh-desk-notebook-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.dsh-desk-notebook-mainhead {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06));
}
.dsh-desk-notebook-mainhead h4 {
  flex: 1;
  margin: 0;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 12px;
  font-weight: 600;
}
.dsh-desk-notebook-pages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: 4px 8px 10px;
}
.dsh-desk-notebook-page {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 7px 8px;
  border: 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.05));
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dsh-desk-notebook-page:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04));
}
.dsh-desk-notebook-page-title {
  flex: none;
  max-width: 46%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 12px;
  font-weight: 600;
}
.dsh-desk-notebook-page-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 10px;
}
.dsh-desk-notebook-page-date {
  flex: none;
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.dsh-desk-notebook-badge {
  flex: none;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--dsw-alias-interactive-bg-secondary, rgba(0, 0, 0, 0.06));
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 9px;
  line-height: 15px;
  white-space: nowrap;
}
.dsh-desk-notebook-meters {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
}
.dsh-desk-notebook-meter {
  padding: 2px 8px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: 999px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 10px;
}
.dsh-desk-notebook-meter-warn {
  padding: 2px 8px;
  border: 1px solid var(--dsw-alias-state-error-primary, #c0503f);
  border-radius: 999px;
  color: var(--dsw-alias-state-error-primary, #c0503f);
  font-size: 10px;
}
.dsh-desk-notebook-history {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 8px 10px;
}
.dsh-desk-notebook-historyrow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 6px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.05));
}
.dsh-desk-notebook-historymain {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
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
`
