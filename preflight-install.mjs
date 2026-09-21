/**
 * Install pre-flight: checks the SHAPE OF THIS INSTALL before a restart,
 * because a boot is the only moment the real loader runs and a mistake there
 * costs a full app restart.
 *
 * The install channel matters and is asserted here:
 *   - the package must resolve by bare name from the profile;
 *   - the mount row must live in the profile's OWN cordis.patch.yml, which the
 *     launcher does not reconcile;
 *   - `dsh.profile.bundles` must NOT also name it, because two mounts register
 *     the same `(kind, path)` route twice and that fails the plugin tree.
 */
import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const PROFILE = 'C:/Users/WR/.dsh/profiles/desktop'
const TARGET = 'dsh-openrouter-imagen'
const require = createRequire(`file:///${PROFILE}/package.json`)

// Bare ESM imports in this file would resolve from the workspace, not from the
// profile — so third-party helpers are loaded through the profile's own
// resolver, which is also the rule this install depends on.
const YAML = require('yaml')

let failures = 0
const check = (label, ok, detail) => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

/* 1. resolvable from the profile by bare name (the loader resolves the row's `name`) */
let manifest = null
try {
  manifest = require.resolve(`${TARGET}/package.json`)
} catch (error) {
  check(`resolve ${TARGET} from the profile`, false, error.code ?? error.message)
}
if (manifest !== null) {
  check(`resolve ${TARGET} from the profile`, true, dirname(manifest).replace(/\\/g, '/'))
}

/* 2. the profile's own patch carries the mount row */
const profilePatchPath = join(PROFILE, 'cordis.patch.yml')
const profilePatch = YAML.parse(readFileSync(profilePatchPath, 'utf8'))
const mounts = []
for (const section of Array.isArray(profilePatch) ? profilePatch : [profilePatch]) {
  for (const [op, rows] of Object.entries(section ?? {})) {
    if (op !== 'insert') continue
    for (const row of Array.isArray(rows) ? rows : [rows]) mounts.push(row)
  }
}
const mount = mounts.find((row) => row?.name === TARGET)
check('profile cordis.patch.yml mounts the plugin', mount !== undefined, mount ? `id=${mount.id}` : 'no insert row')
if (mount !== undefined) {
  check('mount uses the package name verbatim', mount.name === TARGET, mount.name)
}

/* 3. no double mount through the reconciled manifest */
const profile = JSON.parse(readFileSync(join(PROFILE, 'package.json'), 'utf8'))
const bundles = profile.dsh?.profile?.bundles ?? []
check('dsh.profile.bundles does NOT also list it', !bundles.includes(TARGET), `${bundles.length} bundles`)

/* 4. the package's own contents */
if (manifest !== null) {
  const root = dirname(manifest)
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
  check('main entry exists', existsSync(join(root, pkg.main)), pkg.main)
  check('bundle patch exists', existsSync(join(root, pkg.dsh?.bundle?.patch ?? '')), pkg.dsh?.bundle?.patch)

  const clientRel = pkg.exports?.['./client'] ?? pkg.dsh?.client?.entry
  const clientPath = join(root, (clientRel ?? '').replace(/^\.\//, ''))
  check('client entry exists', existsSync(clientPath), clientRel)

  const source = existsSync(clientPath) ? readFileSync(clientPath, 'utf8') : ''
  const loaderId = source.match(/__ModuleLoader__\.load\(\{\s*id:\s*'([^']+)'/)?.[1]
  check('client loader id matches the package name', loaderId === pkg.name, `${loaderId} vs ${pkg.name}`)
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
