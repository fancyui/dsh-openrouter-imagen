/**
 * Peer-compatibility check against the INSTALLED DeepSeek Harness.
 *
 * Run this first whenever a DSH upgrade stops the plugin from loading. A boot
 * denial is silent in the UI: dsh-app-boot's preflight() sets row.disabled on
 * an incompatible row and only writes the reason to stderr, which the desktop
 * shell does not surface. This reproduces that decision offline.
 *
 * Rule replicated from dsh-app-boot/lib/index.js (evaluatePluginCompatibility):
 *   - only `@deepseek-ai/dsh` and `@deepseek-ai/dsh-*` peers are checked;
 *   - `workspace:^` / `workspace:~` / `workspace:*` collapse to the runtime version;
 *   - the runtime version is tested with `includePrerelease: true`;
 *   - an exact-version exemption in the profile's compatibility.json can
 *     override the denial, and this script reports whether one is active.
 *
 * Both the runtime manifest and semver are read out of the installed app.asar,
 * so the verdict is the one this machine's DSH would reach — no guessing.
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REPO = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\/$/, '')
const ASAR = 'C:/Users/WR/AppData/Local/Programs/DeepSeek Harness/resources/app.asar'
const PROFILE = 'C:/Users/WR/.dsh/profiles/desktop'

const fail = (message) => {
  console.error(`\n${message}`)
  process.exit(2)
}

if (!existsSync(ASAR)) fail(`Cannot find the installed app.asar at ${ASAR} — is DSH installed at the expected path?`)

/* Pull the runtime manifest and a working semver out of the archive. */
const scratch = mkdtempSync(join(tmpdir(), 'dsh-peers-'))
const extract = (script, ...args) =>
  execFileSync(process.execPath, [join(REPO, script), ...args], { encoding: 'utf8' })

let dsh
try {
  extract('asar-inspect.mjs', ASAR, 'get', 'dsh/package.json', join(scratch, 'dsh.json'))
  extract('asar-extract-dir.mjs', ASAR, 'dsh/node_modules/semver', join(scratch, 'semver'))
  dsh = JSON.parse(readFileSync(join(scratch, 'dsh.json'), 'utf8'))
} catch (error) {
  fail(`Could not read the installed runtime: ${error.message}`)
} finally {
  // Keep the tree until semver is required below; removed on the way out.
}

const require = createRequire(import.meta.url)
const semver = require(join(scratch, 'semver', 'index.js'))

const plugin = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))
const runtimeVersion = dsh.version

console.log(`plugin  : ${plugin.name}@${plugin.version}`)
console.log(`runtime : ${runtimeVersion}  (${dsh.name})`)
console.log(`profile : ${PROFILE}\n`)

const compatPath = join(PROFILE, 'compatibility.json')
const exemptions = existsSync(compatPath) ? JSON.parse(readFileSync(compatPath, 'utf8')) : {}

const peers = {}
for (const [name, range] of Object.entries(plugin.peerDependencies ?? {})) {
  if (name !== '@deepseek-ai/dsh' && !name.startsWith('@deepseek-ai/dsh-')) {
    console.log(`SKIP  ${name} — not a dsh-* peer, never checked at boot`)
    continue
  }
  const requirement = ['workspace:^', 'workspace:~', 'workspace:*'].includes(range) ? runtimeVersion : range
  const ok = requirement.trim() !== '' && semver.satisfies(runtimeVersion, requirement, { includePrerelease: true })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${range}  ->  ${ok}`)
  if (!ok) peers[name] = range
}

rmSync(scratch, { recursive: true, force: true })

const names = Object.keys(peers)
if (names.length === 0) {
  console.log('\nRESULT: compatible — DSH will not disable this plugin at boot.')
  process.exit(0)
}

const key = `${plugin.name}@${plugin.version}`
const exempted = exemptions[key]?.includes(runtimeVersion) === true
console.log(`\nRESULT: INCOMPATIBLE — DSH disables this row before load.`)
console.log(`  peers      : ${JSON.stringify(peers, null, 2).split('\n').join('\n               ')}`)
console.log(`  exemption  : ${key} on ${runtimeVersion} is ${exempted ? 'ACTIVE' : 'NOT ACTIVE'}`)
console.log('\nFix the peer ranges in package.json, or accept the risk explicitly:')
console.log(`  dsh plugin --profile desktop allow-version ${key} --dsh-version ${runtimeVersion} --accept-risk`)
process.exit(1)
