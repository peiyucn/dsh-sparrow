/**
 * Drafting-skill line of the new-note form: the current skill, a one-line explanation behind an
 * info icon, and a picker over the skills the host already exposes. Nothing is injected into a
 * session — the chosen name only rides the prefilled prompt, and the agent loads the skill itself.
 */

import { useState } from 'react'
import type { ReactElement } from 'react'
import { IconInfoOutlineRegular, Menu, MenuItemButton, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { NotebookPageController } from '../hooks/useNotebookPage.js'

/** Skill selector row rendered under the new-note brief. */
export function SkillPicker({ page }: { readonly page: NotebookPageController }): ReactElement {
  const { t } = page
  const [open, setOpen] = useState(false)
  const noteSkills = page.skills.filter(skill => skill.note)
  const otherSkills = page.skills.filter(skill => !skill.note)
  const info = page.skillName === 'note2md' ? t('notebook.skillInfoNote2md') : t('notebook.skillInfoGeneric')

  const choose = (name: string | null): void => {
    setOpen(false)
    void page.chooseSkill(name)
  }

  return (
    <div className="dsh-desk-notebook-skill">
      <span className="dsh-desk-notebook-fineprint">{t('notebook.skillLabel')}</span>
      <span className="dsh-desk-notebook-skillname" title={page.skills.find(skill => skill.name === page.skillName)?.description}>
        {page.skillName ?? t('notebook.skillNone')}
      </span>
      <Tooltip label={info} side="top" delayMs={300} maxWidth={320}>
        <button type="button" className="dsh-desk-notebook-info" aria-label={t('notebook.skillInfoLabel')} disabled={page.busy}>
          <IconInfoOutlineRegular />
        </button>
      </Tooltip>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        align="start"
        anchor={(
          <button type="button" className="dsh-desk-notebook-link" aria-haspopup="menu" aria-expanded={open} disabled={page.busy} onClick={() => setOpen(value => !value)}>
            {t('notebook.skillChange')}
          </button>
        )}
      >
        {noteSkills.map(skill => (
          <MenuItemButton key={skill.name} current={skill.name === page.skillName} onSelect={() => choose(skill.name)}>
            <span title={skill.description}>{skill.name}</span>
          </MenuItemButton>
        ))}
        {otherSkills.map((skill, index) => (
          <MenuItemButton
            key={skill.name}
            current={skill.name === page.skillName}
            separatorBefore={index === 0 && noteSkills.length > 0}
            onSelect={() => choose(skill.name)}
          >
            <span title={skill.description}>{skill.name}</span>
          </MenuItemButton>
        ))}
        <MenuItemButton separatorBefore={page.skills.length > 0} current={page.skillName === null} onSelect={() => choose(null)}>
          {t('notebook.skillNone')}
        </MenuItemButton>
      </Menu>
      <span className="dsh-desk-notebook-fineprint">{t('notebook.skillHint')}</span>
    </div>
  )
}
