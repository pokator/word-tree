import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import dataPins from './src/data/dataPins.json' with { type: 'json' }

// Where production loads public/data/*.gzjson from. Every first visit
// downloads ~7MB of dictionary, which on Vercel alone used up the free
// tier's 100GB of Fast Data Transfer; jsDelivr serves the same files
// straight from the public GitHub repo at no cost.
//
// The dictionary and the meaning data each have their own pin
// (src/data/dataPins.json): a URL change makes every returning visitor
// download that file again, so rebuilding one shouldn't cost a re-download of
// the other. The pins are committed rather than asked of git at build time,
// where a shallow clone may not reach the commit that last changed a file.
// After regenerating data, commit it, then move its pin to that commit
// (dataPins.test.js fails until you do).
//
// Only for git-based Vercel builds; everything else, and any CDN failure at
// runtime (datasetWorker.js), uses our own origin.
function dataCdnBases() {
  const { VERCEL_GIT_PROVIDER, VERCEL_GIT_REPO_OWNER, VERCEL_GIT_REPO_SLUG } = process.env
  if (VERCEL_GIT_PROVIDER !== 'github') return null
  const at = (pin) => `https://cdn.jsdelivr.net/gh/${VERCEL_GIT_REPO_OWNER}/${VERCEL_GIT_REPO_SLUG}@${pin}/public/`
  return { dictionary: at(dataPins.dictionary), meaning: at(dataPins.meaning) }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  define: {
    __DATA_CDN_BASES__: JSON.stringify(command === 'build' ? dataCdnBases() : null),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    css: false,
    // agent worktrees live under .claude/worktrees -- don't run their copies
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
}))
