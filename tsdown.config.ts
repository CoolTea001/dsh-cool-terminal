import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'

const PACKAGE_ID = 'dsh-cool-terminal'

/**
 * xterm's own stylesheet is inlined into the client bundle.
 *
 * The browser half is loaded by the platform's module loader from one JS file,
 * so a sibling `.css` asset would never be fetched; a build-time `define`
 * keeps the dependency's stylesheet authoritative instead of vendoring a copy
 * into `src/`.
 */
const XTERM_CSS = readFileSync(
  fileURLToPath(new URL('./node_modules/@xterm/xterm/css/xterm.css', import.meta.url)),
  'utf8',
)

export default defineConfig([
  {
    name: PACKAGE_ID,
    entry: { index: 'src/host/index.ts' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
  },
  {
    name: `${PACKAGE_ID}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    define: {
      __DSH_CT_XTERM_CSS__: JSON.stringify(XTERM_CSS),
    },
    deps: {
      // Both are platform module-table seed words the web boot answers before
      // any bundle materializes (packages/client/web/src/platform.ts), so they
      // must stay `require` calls rather than being inlined.
      neverBundle: ['react', '@deepseek-ai/dsh-client-ui-primitives'],
      // xterm is a build-time-only devDependency: the platform's module loader
      // loads this package as one JS file and its module table knows nothing
      // about xterm, so it must be inlined here rather than resolved at
      // runtime. Naming it explicitly keeps that true even if the package is
      // later promoted to a real dependency.
      alwaysBundle: ['@xterm/xterm', '@xterm/addon-fit'],
      // Bundling is deliberate here, not an oversight: silence the advisory
      // that lists dependencies pulled into the bundle.
      onlyBundle: false,
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
