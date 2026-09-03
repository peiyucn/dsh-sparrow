/** 构建 DSH 客户端 lazy-CJS 工厂包：window.__ModuleLoader__.load({ id, factory }) 。 */
import { build } from 'esbuild'
import { resolve } from 'node:path'

const id = '@dsh-sparrow/dsh-codebuddy-credits'
await build({
  entryPoints: [resolve(process.cwd(), 'src/client/index.ts')],
  outfile: resolve(process.cwd(), 'lib/client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  legalComments: 'none',
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {
var module = { exports: {} };` },
  footer: { js: 'return module.exports; } });' },
  external: ['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-runtime/client', '@deepseek-ai/dsh-client-ui-settings-models/client'],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  logLevel: 'info',
})
