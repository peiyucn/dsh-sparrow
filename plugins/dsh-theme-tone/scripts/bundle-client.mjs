/** 构建 DSH 客户端 lazy-CJS 工厂包：window.__ModuleLoader__.load({ id, factory }) 。 */
import { build } from 'esbuild'
import { resolve } from 'node:path'

const id = '@dsh-sparrow/dsh-theme-tone'
await build({
  entryPoints: [resolve(process.cwd(), 'src/client/index.ts')],
  outfile: resolve(process.cwd(), 'lib/client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  // tsconfig 的 jsx: react-jsx 由 esbuild 自动读取，输出 require('react/jsx-runtime')，
  // 该 specifier 是平台种子词（client/web/src/platform.ts:8-14），必须保持 external。
  jsx: 'automatic',
  sourcemap: true,
  legalComments: 'none',
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {
var module = { exports: {} };` },
  footer: { js: 'return module.exports; } });' },
  // 只外部化平台种子词（react 系 / cordis / store / slots / primitives）——
  // 这些由 shell 的冻结模块表提供，恒可 require；其余一律内联。
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-store',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-ui-primitives',
  ],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  logLevel: 'info',
})
