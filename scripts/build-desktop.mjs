import {build} from 'esbuild';

await build({
  entryPoints: ['apps/desktop/main.ts'],
  outfile: 'dist/desktop/main.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron', 'vite'],
});

await build({
  entryPoints: ['apps/desktop/preload.ts'],
  outfile: 'dist/desktop/preload.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
});
