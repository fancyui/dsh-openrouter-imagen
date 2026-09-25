/**
 * dsh-openrouter-imagen — bundled skill provider.
 *
 * Ships `skills/openrouter-imagen/SKILL.md` inside this npm package and files it
 * into the DSH skill registry, so installing the plugin installs the skill: no
 * second step, no file dropped into `$DSH_HOME/skills`, and the playbook version
 * always matches the tool version it describes.
 *
 * This is a separate Cordis plugin mounted by `lib/index.js` through
 * `ctx.plugin()`, not merged into the main `apply`. The reason is `inject`:
 * declaring `skills` on the main plugin would park the *whole* plugin — the
 * paid `openrouter_generate_imagen` tool included — on any surface that has no
 * skill registry. As a child fiber, this half simply waits, and the tool keeps
 * working either way. (The same split ships in `dsh-univer-office`.)
 *
 * The file is read once at apply: one small local file, so there is no reason to
 * touch the filesystem on every catalog read, and a packaging mistake (a
 * `skills/` directory left out of `files`) surfaces as one warning at boot
 * instead of an empty catalog later.
 *
 * @module dsh-openrouter-imagen/skills
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BUNDLED_SKILL_RANK } from '@deepseek-ai/dsh-skill'

/** Cordis plugin name for this child fiber. */
export const name = 'openrouter-imagen-skills'

/** The registry this provider files into. */
export const inject = ['skills']

/**
 * Provider identity. Must be unique across every mounted provider — it is the
 * key `ctx.skills.registerProvider` inserts under, and the value every candidate
 * must echo back in `candidate.provider`.
 */
const PROVIDER_NAME = 'dsh-openrouter-imagen'

const SKILL_NAME = 'openrouter-imagen'
const SKILL_DIR = new URL('../skills/openrouter-imagen/', import.meta.url)
const SKILL_FILE = new URL('SKILL.md', SKILL_DIR)

/**
 * The catalog line the model selects on, so it carries the trigger conditions
 * rather than a description of the file. Kept identical to the frontmatter in
 * SKILL.md: the frontmatter makes that file valid for the filesystem provider
 * too, so a user can copy the directory into `$DSH_HOME/skills` and get the same
 * skill without this plugin.
 *
 * This is the ONLY surface that decides whether the model reaches for the skill
 * at all, and `@deepseek-ai/dsh-tool-skill` truncates it at 500 characters
 * (`catalogDescriptionMaxLength`), cutting the TAIL. So the trigger words come
 * first: both intents (生成 / 修改), the style families a user might name
 * (摄影 / 3D / 插画 / 卡通 / 线稿 / 扁平 / 像素), and the deliverable nouns —
 * in both languages the user actually writes in. Anything past 500 characters is
 * invisible; `npm run smoke` asserts the budget.
 */
const DESCRIPTION =
  '生成、绘制、修改图片 —— 文生图与图生图，画风不限：摄影/写实、3D 渲染、插画、水彩、卡通动漫、线条图、矢量图标、扁平、像素风，或任何其他风格。改图包括换背景、换风格、改颜色、去物加物、重绘、扩图、放大、出变体。用户想要图片、照片、产品图、海报、头像、图标、贴纸、mockup、渲染图，或想改、想重做、想基于已有照片再生成一张时用本 skill。Generate and edit raster images in any visual style through the OpenRouter Image API — photography, 3D, illustration, cartoon, line art, vector, pixel art, or any other style; text-to-image and image-to-image, including restyle, relight, recolor, background replacement, object removal, inpainting and variations.'

const INVOCATION = { modelInvocable: true, userInvocable: true }

/**
 * Drop the leading YAML frontmatter block, and the blank line after it.
 *
 * The registry hands `content` to the model verbatim between
 * `<skill_instructions>` tags, where a `---` header is noise. The metadata it
 * carries is delivered separately as the candidate's `description`, so nothing
 * is lost. `dsh-univer-office` strips it the same way; the extra blank-line
 * trim is what keeps the rendered block from opening with two newlines, since
 * the renderer already inserts one separator.
 *
 * @param value - raw file contents.
 * @returns the body with any leading frontmatter removed.
 */
export function stripFrontmatter(value) {
  if (!value.startsWith('---\n')) return value
  const end = value.indexOf('\n---\n', 4)
  return end === -1 ? value : value.slice(end + 5).replace(/^\r?\n/u, '')
}

/**
 * Read the bundled playbook.
 *
 * @returns the frontmatter-free body.
 * @throws when the packaged file is missing or unreadable, which is a manifest
 *   problem (`files` must list `skills`) rather than a runtime condition.
 */
export function readBundledSkill() {
  return stripFrontmatter(readFileSync(SKILL_FILE, 'utf8'))
}

/**
 * Register the bundled skill.
 *
 * A failure here is contained on purpose: the image tool is the product and the
 * playbook is an accessory, so a broken package logs one line and loses the
 * skill rather than taking down generation for the whole profile.
 *
 * @param ctx - Context carrying `skills` (guaranteed by `inject`).
 */
export function apply(ctx) {
  let content
  try {
    content = readBundledSkill()
  } catch (error) {
    ctx.logger?.warn?.(`openrouter-imagen: bundled skill unavailable (${error?.message ?? error}); is "skills" missing from package.json files?`)
    return
  }

  const resourceBase = { kind: 'directory', path: fileURLToPath(SKILL_DIR) }
  // `locator` is opaque to the registry and only ever handed back to this
  // provider's own `get()`, so it can carry the preloaded body.
  const candidate = {
    name: SKILL_NAME,
    description: DESCRIPTION,
    invocation: INVOCATION,
    provider: PROVIDER_NAME,
    source: 'bundled',
    resourceBase,
    // Precedence within one layer only. A packaged skill ranks below every
    // filesystem root (project 100/200, custom 300, user 400/500), so a user who
    // writes their own `openrouter-imagen` skill overrides this one instead of
    // colliding with it.
    rank: BUNDLED_SKILL_RANK,
    locator: { content },
  }

  const provider = {
    name: PROVIDER_NAME,
    list: () => Promise.resolve([candidate]),
    get: (selected) =>
      Promise.resolve({
        name: SKILL_NAME,
        description: DESCRIPTION,
        invocation: INVOCATION,
        provider: PROVIDER_NAME,
        source: 'bundled',
        resourceBase,
        content: selected?.locator?.content ?? content,
      }),
  }

  ctx.skills.registerProvider(() => provider)
}
