/** Notebook management-page styles (official theme aliases only, light/dark adaptive). */

export const NOTEBOOK_CSS = `
/* --- page shell ---------------------------------------------------------- */
.dsh-desk-notebookview {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: calc(var(--dsh-desk-header-h) + 12px) 18px 14px;
  overflow-y: auto;
}
/* Content column: the panel can be very wide; keep one readable centered column
   instead of stretching hero controls and list rows across the whole frame. */
.dsh-desk-notebook-content {
  box-sizing: border-box;
  width: 100%;
  max-width: 920px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  flex: 1;
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
  margin: 0;
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
  border-radius: var(--dsw-radius-lg, 14px);
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
.dsh-desk-notebook-pickeritem {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 8px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: var(--dsw-radius-md, 12px);
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
  gap: 12px;
}
.dsh-desk-notebook-newbutton {
  flex: none;
  height: 40px;
  padding: 0 20px;
  font-size: 13px;
  font-weight: 600;
}
.dsh-desk-notebook-hero-copy {
  flex: 1;
  min-width: 0;
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
  width: 100%;
  padding: 9px 16px;
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
  border-radius: var(--dsw-radius-md, 12px);
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

/* --- record panels ------------------------------------------------------- */
.dsh-desk-notebook-panelbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06));
}
.dsh-desk-notebook-paneltab {
  padding: 4px 10px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.dsh-desk-notebook-paneltab[data-active] {
  color: var(--dsw-alias-label-primary, #1f2329);
  background: var(--dsw-alias-interactive-bg-secondary, rgba(0, 0, 0, 0.06));
}
.dsh-desk-notebook-panelhint {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-desk-notebook-pages {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 4px 8px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02));
}
.dsh-desk-notebook-page:first-child {
  border-top: 0;
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
.dsh-desk-notebook-recent {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 10px 10px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02));
}
.dsh-desk-notebook-recenthead {
  padding: 2px 2px 4px;
}
.dsh-desk-notebook-recenthead h4 {
  margin: 0;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 11px;
  font-weight: 600;
}
.dsh-desk-notebook-badge-review {
  color: var(--dsw-alias-brand-primary, #4176e6);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4176e6) 12%, transparent);
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
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 8px 10px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02));
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
`
