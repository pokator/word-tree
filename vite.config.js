import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'

// Where production loads public/data/*.gzjson from. Every first visit
// downloads ~7MB of dictionary, which on Vercel alone used up the free
// tier's 100GB of Fast Data Transfer; jsDelivr serves the same files
// straight from the public GitHub repo at no cost. Pinned to the last commit
// that touched public/data, so the URL (and every browser's cached copy)
// only changes when the data does. Only for git-based Vercel builds, where
// that commit is guaranteed to be on GitHub; everything else, and any CDN
// failure at runtime (datasetWorker.js), uses our own origin.
function dataCdnBase() {
  const { VERCEL_GIT_PROVIDER, VERCEL_GIT_REPO_OWNER, VERCEL_GIT_REPO_SLUG, VERCEL_GIT_COMMIT_SHA } = process.env
  if (VERCEL_GIT_PROVIDER !== 'github' || !VERCEL_GIT_COMMIT_SHA) return null
  let ref = ''
  try {
    ref = execSync('git log -1 --format=%H -- public/data', { encoding: 'utf8' }).trim()
  } catch {
    // no git history in the build; the deploy's own commit has the same files
  }
  return `https://cdn.jsdelivr.net/gh/${VERCEL_GIT_REPO_OWNER}/${VERCEL_GIT_REPO_SLUG}@${ref || VERCEL_GIT_COMMIT_SHA}/public/`
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  define: {
    __DATA_CDN_BASE__: JSON.stringify(command === 'build' ? dataCdnBase() : null),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    css: false,
    // agent worktrees live under .claude/worktrees -- don't run their copies
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
}))
