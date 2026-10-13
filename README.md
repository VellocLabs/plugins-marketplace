# Velloc marketplace

The plugins and mods Velloc installs on its own. One repository, one origin,
released on its own cadence: Velloc's runtime holds nothing but the origin's
address and reads two files from it.

Repository: `claude-code-mods/velloc-marketplace`. Origin: `https://plugins.velloc.app`,
the custom domain of the `velloc-marketplace` worker. The owner block in
`.claude-plugin/marketplace.json` names the publisher.

## Layout

```
.claude-plugin/marketplace.json      the catalog: name "velloc", one listing per plugin
plugins/<name>/                      one folder per plugin, named in the catalog as ./plugins/<name>
plugins/<name>/.claude-plugin/plugin.json   name (= folder), version (required), description
plugins/<name>/skills/<skill>/SKILL.md      a skill plugin
plugins/<name>/hooks/hooks.json             a mod: {"modules": ["./register.js"]} beside register.js
scripts/check_marketplace.mjs        the gate every change passes
scripts/stage_site.mjs               builds site/ (what the origin serves)
worker/asset_gateway.mjs             the worker in front of the static files
wrangler.toml                        the Cloudflare worker
.github/workflows/                   ci.yml (check), deploy.yml (publish), rollback.yml
```

## A listing

```json
{
  "name": "velloc-starter-skills",
  "description": "What a listing says about itself.",
  "source": "./plugins/velloc-starter-skills",
  "onByDefault": true,
  "betaOnly": false
}
```

- `source` is always a `./plugins/<name>` path inside this repository: the
  whole marketplace travels as one tarball, so an install needs no second
  download.
- `onByDefault` (default `true`): `false` installs the plugin switched off;
  the person turns it on in Settings → Plugins & Mods.
- `betaOnly` (default `false`): `true` lists and installs the plugin only
  on the beta channel.
- `version` in the plugin's `plugin.json` is mandatory. It names the folder
  the plugin is installed into and is what a client compares to decide an
  upgrade. Bump it with every change to the plugin.

## What the origin serves

| Path | Content | Cache |
| --- | --- | --- |
| `/marketplace.tar.gz` | this repository's `.claude-plugin/` and `plugins/` as a gzip tar with one wrapper directory | `no-cache` |
| `/index.json` | `{ name, buildId, generatedAt, sourceCommit, tarball, sha256, size }` | `no-cache` |

A client downloads the tarball on its first start, then reads `index.json`
once a day and downloads again only when `buildId` changed, checking
`sha256`. New listings are installed by their defaults; installed plugins
with a newer `version` are upgraded; a plugin the person uninstalled or
switched off is left alone.

## Working on it

```bash
npm ci
node scripts/check_marketplace.mjs      # the gate
node scripts/stage_site.mjs             # writes site/
node --test scripts/stage_site.test.mjs   # the stager's own test
```

To try a build against a Velloc profile without publishing: serve `site/`
with any static server, point the `velloc` entry of
`~/.velloc/plugins/known_marketplaces.json` at `http://<host>/marketplace.tar.gz`,
and start Velloc. A client that already ran once re-checks after a day;
set `lastCheckedAt` in `~/.velloc/plugins/builtin_marketplace.json` back
to force the check.

## Releasing

1. Merge to `main`. CI runs the check and a dry stage.
2. Run the **Deploy** workflow on `main` (ref + a note). It checks, stages,
   deploys with `wrangler deploy`, and publishes a GitHub Release
   `marketplace-<date>.<n>` carrying `site.zip` and `index.json`.
3. Clients pick the build up within a day.
4. A bad build: run **Rollback** with the previous release's tag. It
   redeploys that `site.zip` verbatim — no checkout, no build.

One-time setup: the repository secrets `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN` (a token with Workers Scripts edit), and the custom
domain on the worker in the Cloudflare dashboard.
