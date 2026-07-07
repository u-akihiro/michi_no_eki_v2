import { cp, rm, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const webDistDir = resolve(rootDir, 'apps/web/dist')
const apiAssetsDir = resolve(rootDir, 'apps/api/dist/assets')

try {
  const webDist = await stat(webDistDir)
  if (!webDist.isDirectory()) {
    throw new Error(`${webDistDir} is not a directory`)
  }
} catch (error) {
  throw new Error(
    'apps/web/dist が存在しません。先に web の build を実行してください',
    { cause: error },
  )
}

await rm(apiAssetsDir, { recursive: true, force: true })
await cp(webDistDir, apiAssetsDir, { recursive: true })
