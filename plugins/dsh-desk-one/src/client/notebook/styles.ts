/**
 * Notebook page styles: layout only.
 *
 * The page is one fixed-height screen: the header-owned actions sit in the panel top bar, the body
 * is a toolbar plus an internally scrolling, paginated list. Rows follow the session list's compact
 * single-line geometry so the two tabs read as one product. Every value is an official theme alias.
 */

export const NOTEBOOK_CSS = `
/* --- fixed page shell ---------------------------------------------------- */
.dsh-desk-notebookview {
  box-sizing: border-box;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding: calc(var(--dsh-desk-header-h) + 16px) clamp(20px, 3vw, 40px) 16px;
}
.dsh-desk-notebook-error,
.dsh-desk-notebook-notice {
  box-sizing: border-box;
  flex: none;
  width: 100%;
  max-width: 960px;
  margin: 0 auto 10px;
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
.dsh-desk-notebook-column {
  box-sizing: border-box;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 960px;
  min-height: 0;
  margin: 0 auto;
}

/* --- new-note form ------------------------------------------------------- */
.dsh-desk-notebook-new {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12));
  border-radius: var(--dsw-radius-lg, 14px);
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02));
}
.dsh-desk-notebook-brief {
  box-sizing: border-box;
  width: 100%;
  min-height: 64px;
  max-height: 180px;
  padding: 7px 10px;
  border: 0.5px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12));
  border-radius: var(--dsw-radius-md, 12px);
  outline: none;
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2329);
  font: inherit;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
}
.dsh-desk-notebook-brief::placeholder {
  color: var(--dsw-alias-label-dimmed, #9aa1ab);
}
.dsh-desk-notebook-brief:focus {
  border-color: var(--dsw-alias-state-business-primary, #4176e6);
}
.dsh-desk-notebook-newfoot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}
.dsh-desk-notebook-newactions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}
.dsh-desk-notebook-skill {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-height: 20px;
}
.dsh-desk-notebook-skillname {
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
}
.dsh-desk-notebook-info {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  cursor: pointer;
}
.dsh-desk-notebook-info svg {
  display: block;
  width: 13px;
  height: 13px;
}
.dsh-desk-notebook-info:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-desk-notebook-link {
  appearance: none;
  padding: 0 2px;
  border: 0;
  background: none;
  color: var(--dsw-alias-state-business-primary, #4176e6);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.dsh-desk-notebook-link:disabled {
  opacity: 0.4;
  cursor: default;
}

/* --- toolbar ------------------------------------------------------------- */
.dsh-desk-notebook-toolbar {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.dsh-desk-notebook-search {
  flex: 0 1 320px;
  min-width: 180px;
}
.dsh-desk-notebook-tabs {
  flex: 0 1 420px;
  min-width: 0;
}

/* --- list: one card, internally scrolling rows, page footer -------------- */
.dsh-desk-notebook-listwrap {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
}
.dsh-desk-notebook-listmeta {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 0 2px;
}
.dsh-desk-notebook-card {
  box-sizing: border-box;
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  min-height: 0;
  max-height: 100%;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-radius: var(--dsw-radius-sm, 8px);
  background: var(--dsw-alias-bg-layer-1, #ffffff);
}
.dsh-desk-notebook-rows {
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
}
.dsh-desk-notebook-row {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 10px;
  border-top: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
}
.dsh-desk-notebook-row:nth-child(1) {
  border-top: 0;
}
.dsh-desk-notebook-rowbody {
  box-sizing: border-box;
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
}
button.dsh-desk-notebook-rowbody {
  cursor: pointer;
}
.dsh-desk-notebook-rowtitle {
  flex: 0 0 34%;
  overflow: hidden;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 13px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-desk-notebook-rowpath {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 11px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-desk-notebook-rowmeta {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
}
.dsh-desk-notebook-rowdate {
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 11px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dsh-desk-notebook-rowaction {
  display: inline-flex;
  flex: none;
  align-items: center;
}
.dsh-desk-notebook-empty {
  margin: 0;
  padding: 14px 12px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 13px;
  line-height: 20px;
}
.dsh-desk-notebook-pager {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  min-height: 28px;
}
.dsh-desk-notebook-pagerstatus {
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 11px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}
.dsh-desk-notebook-fineprint {
  margin: 0;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 12px;
  line-height: 18px;
}

/* --- unlinked state: centred offer -------------------------------------- */
.dsh-desk-notebook-center {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 24px 0 48px;
}
.dsh-desk-notebook-centerinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 640px;
  text-align: center;
}

.dsh-desk-notebook-centeractions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.dsh-desk-notebook-centerdivider {
  align-self: stretch;
  height: 0;
  margin-top: 2px;
  border-top: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.06));
}
.dsh-desk-notebook-centerhint {
  margin: 0;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 12px;
  line-height: 18px;
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
