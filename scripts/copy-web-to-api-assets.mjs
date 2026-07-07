import { cp, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const webDistDir = resolve(rootDir, 'apps/web/dist')
const apiAssetsDir = resolve(rootDir, 'apps/api/dist/assets')

await rm(apiAssetsDir, { recursive: true, force: true })
await cp(webDistDir, apiAssetsDir, { recursive: true })
