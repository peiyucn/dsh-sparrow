/**
 * Notebook home page styles: layout only.
 *
 * The controls on this page are official primitives (`Button` / `Input` / `SegmentedTabs` /
 * `Tag`), so their geometry, color and states come from the host; this file only owns the page
 * column, the title row, the toolbar composition and the two-line row rhythm. Every value below
 * is an official theme alias with a light fallback, so dark / light and theme-tone all adapt.
 */

export const NOTEBOOK_CSS = `
/* --- page column --------------------------------------------------------- */
.dsh-desk-notebookview {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: calc(var(--dsh-desk-header-h) + 20px) clamp(20px, 3vw, 40px) 40px;
}
.dsh-desk-notebook-column {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
}
.dsh-desk-notebook-error,
.dsh-desk-notebook-notice {
  box-sizing: border-box;
  width: 100%;
  max-width: 960px;
  margin: 0 auto 12px;
  padding: 8px 12px;
  border-radius: var(--dsw-radius-md, 12px);
  font-size: 13px;
  line-height: 20px;
}
.dsh-desk-notebook-error {
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #c62828) 8%, transparent);
  color: var(--dsw-alias-state-error-primary, #c62828);
}
.dsh-desk-notebook-notice {
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.03));
  color: var(--dsw-alias-label-secondary, #6b7280);
}

/* --- title row: page stance + the primary action ------------------------- */
.dsh-desk-notebook-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}
.dsh-desk-notebook-headmain {
  min-width: 0;
}
.dsh-desk-notebook-title {
  margin: 0;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 20px;
  font-weight: 500;
  line-height: 28px;
}
.dsh-desk-notebook-intro {
  margin: 4px 0 0;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 13px;
  line-height: 20px;
}
.dsh-desk-notebook-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 8px 0 0;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 12px;
  line-height: 18px;
}
.dsh-desk-notebook-headactions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

/* --- new-note form ------------------------------------------------------- */
.dsh-desk-notebook-new {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12));
  border-radius: var(--dsw-radius-lg, 14px);
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02));
}
.dsh-desk-notebook-newrow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.dsh-desk-notebook-newtitle {
  flex: 1 1 260px;
  max-width: 420px;
  min-width: 0;
}

/* --- toolbar: search, record views, unlink ------------------------------- */
.dsh-desk-notebook-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.dsh-desk-notebook-search {
  flex: 0 1 320px;
  min-width: 200px;
}
.dsh-desk-notebook-tabs {
  flex: none;
  width: 300px;
}
.dsh-desk-notebook-disconnect {
  margin-left: auto;
  padding: 0 2px;
  border: 0;
  background: none;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.dsh-desk-notebook-disconnect:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-desk-notebook-disconnect:disabled {
  opacity: 0.4;
  cursor: default;
}

/* --- rows ---------------------------------------------------------------- */
.dsh-desk-notebook-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dsh-desk-notebook-listhead {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 0 2px;
}
.dsh-desk-notebook-listhead h2 {
  margin: 0;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
}
.dsh-desk-notebook-listhead span {
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 12px;
  line-height: 18px;
}
.dsh-desk-notebook-usage {
  margin-left: auto;
  font-size: 11px;
}
.dsh-desk-notebook-usage-warn {
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-state-error-primary, #c62828);
  border-radius: 999px;
  color: var(--dsw-alias-state-error-primary, #c62828);
}
.dsh-desk-notebook-empty {
  margin: 8px 2px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 13px;
  line-height: 20px;
}
.dsh-desk-notebook-fineprint {
  margin: 0;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 12px;
  line-height: 18px;
}
.dsh-desk-notebook-rows {
  display: flex;
  flex-direction: column;
}
.dsh-desk-notebook-row {
  display: flex;
  align-items: center;
  gap: 12px;
  border-top: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.04));
}
.dsh-desk-notebook-row:first-child {
  border-top: 0;
}
.dsh-desk-notebook-rowbody {
  box-sizing: border-box;
  display: flex;
  flex: 1;
  align-items: center;
  gap: 16px;
  min-width: 0;
  margin: 0;
  padding: 10px 8px;
  border: 0;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
}
button.dsh-desk-notebook-rowbody {
  cursor: pointer;
}
button.dsh-desk-notebook-rowbody:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.dsh-desk-notebook-rowmain {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.dsh-desk-notebook-rowtitle {
  overflow: hidden;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-desk-notebook-rowpath {
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-desk-notebook-rowmeta {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 8px;
}
.dsh-desk-notebook-rowdate {
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 12px;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dsh-desk-notebook-rowaction {
  display: inline-flex;
  flex: none;
  align-items: center;
  padding-right: 8px;
}

/* --- unlinked state: centred offer -------------------------------------- */
.dsh-desk-notebook-center {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 24px 0 48px;
}
.dsh-desk-notebook-centerinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 520px;
  text-align: center;
}
.dsh-desk-notebook-centertitle {
  margin: 0;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 18px;
  font-weight: 500;
  line-height: 26px;
}
.dsh-desk-notebook-centertext {
  margin: 0;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 13px;
  line-height: 20px;
}
.dsh-desk-notebook-centeractions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 4px;
}
.dsh-desk-notebook-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  margin-top: 4px;
  text-align: left;
}
.dsh-desk-notebook-pickeritem {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 8px 10px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  border-radius: var(--dsw-radius-md, 12px);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dsh-desk-notebook-pickeritem:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.dsh-desk-notebook-pickeritem:disabled {
  opacity: 0.5;
  cursor: default;
}
.dsh-desk-notebook-pickertitle {
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
}
`
