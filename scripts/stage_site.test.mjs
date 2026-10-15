/**
 * The stager over a scratch marketplace: the tarball strips to the right
 * paths, index.json names its digest, a tree the check refuses is not staged.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { gunzipSync } from 'node:zlib'
import { checkMarketplace } from './check_marketplace.mjs'
import { INDEX_NAME, TARBALL_NAME, stageSite } from './stage_site.mjs'

function scratchMarketplace(plugins) {
  const root = mkdtempSync(join(tmpdir(), 'plugins-marketplace-'))
  mkdirSync(join(root, '.claude-plugin'), { recursive: true })
  writeFileSync(
    join(root, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({
      name: 'velloc',
      plugins: plugins.map(p => ({ name: p.name, description: `${p.name}.`, source: `./plugins/${p.name}`, ...p.flags })),
    }),
  )
  for (const p of plugins) {
    const dir = join(root, 'plugins', p.name)
    mkdirSync(join(dir, '.claude-plugin'), { recursive: true })
    writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: p.name, version: p.version }))
    mkdirSync(join(dir, 'skills', 'hello'), { recursive: true })
    writeFileSync(join(dir, 'skills', 'hello', 'SKILL.md'), '---\nname: hello\ndescription: hi\n---\n')
  }
  return root
}

/** The entry paths of a gzip ustar archive. */
function tarPaths(gz) {
  const bytes = gunzipSync(gz)
  const paths = []
  let offset = 0
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512)
    if (header.every(b => b === 0)) break
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '')
    const size = parseInt(header.subarray(124, 136).toString('ascii').replace(/\0.*$/, ''), 8)
    paths.push(prefix ? `${prefix}/${name}` : name)
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return paths
}

test('stages the catalog and the plugins under one wrapper directory, with the digest in the index', () => {
  const root = scratchMarketplace([
    { name: 'alpha', version: '1.0.0', flags: { onByDefault: false } },
    { name: 'beta', version: '2.0.0', flags: { betaOnly: true } },
  ])
  const out = join(root, 'site')
  const index = stageSite(root, out, { sourceCommit: 'abcdef0123456789', runId: '42', generatedAt: '2026-10-13T00:00:00.000Z' })
  const tarball = readFileSync(join(out, TARBALL_NAME))
  assert.equal(index.buildId, 'abcdef0-42')
  assert.equal(index.sha256, createHash('sha256').update(tarball).digest('hex'))
  assert.equal(index.size, tarball.length)
  assert.deepEqual(JSON.parse(readFileSync(join(out, INDEX_NAME), 'utf8')), index)
  const paths = tarPaths(tarball)
  assert.ok(paths.every(p => p.startsWith('plugins-marketplace-abcdef0/')), paths.join('\n'))
  const stripped = paths.map(p => p.slice('plugins-marketplace-abcdef0/'.length))
  assert.deepEqual(stripped, [
    '.claude-plugin/marketplace.json',
    'plugins/alpha/.claude-plugin/plugin.json',
    'plugins/alpha/skills/hello/SKILL.md',
    'plugins/beta/.claude-plugin/plugin.json',
    'plugins/beta/skills/hello/SKILL.md',
  ])
  assert.match(readFileSync(join(out, '_headers'), 'utf8'), /\/index\.json\n {2}! Cache-Control\n {2}Cache-Control: no-cache/)
})

test('the same tree stages to the same bytes', () => {
  const root = scratchMarketplace([{ name: 'alpha', version: '1.0.0', flags: {} }])
  const a = stageSite(root, join(root, 'a'), { sourceCommit: 'abcdef0', runId: '1', generatedAt: 'x' })
  const b = stageSite(root, join(root, 'b'), { sourceCommit: 'abcdef0', runId: '1', generatedAt: 'x' })
  assert.equal(a.sha256, b.sha256)
})

test('refuses a tree the check does not pass', () => {
  const root = scratchMarketplace([{ name: 'alpha', version: 'one', flags: { betaOnly: 'yes' } }])
  const problems = checkMarketplace(root)
  assert.ok(problems.some(p => /version/.test(p)))
  assert.ok(problems.some(p => /betaOnly/.test(p)))
  assert.throws(() => stageSite(root, join(root, 'site')), /the check fails/)
})

test('a listing whose folder is missing or misnamed is a problem', () => {
  const root = scratchMarketplace([{ name: 'alpha', version: '1.0.0', flags: {} }])
  writeFileSync(
    join(root, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({
      name: 'velloc',
      plugins: [
        { name: 'alpha', description: 'a', source: './plugins/alpha' },
        { name: 'alpha', description: 'a', source: './plugins/alpha' },
        { name: 'gone', description: 'g', source: './plugins/gone' },
        { name: 'outside', description: 'o', source: '../plugins/alpha' },
      ],
    }),
  )
  const problems = checkMarketplace(root)
  assert.ok(problems.some(p => /listed twice/.test(p)))
  assert.ok(problems.some(p => /plugins\/gone\/ does not exist/.test(p)))
  assert.ok(problems.some(p => /outside.*"source"/.test(p)))
})
