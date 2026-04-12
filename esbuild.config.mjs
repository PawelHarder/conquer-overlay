import esbuild from 'esbuild';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

// Plugin: import .html files as plain text strings so tab partials can be
// bundled alongside the renderer without a fetch() call at runtime.
const htmlTextPlugin = {
  name: 'html-text-loader',
  setup(build) {
    build.onLoad({ filter: /\.html$/ }, args => {
      const content = readFileSync(args.path, 'utf8');
      return {
        contents: `export default ${JSON.stringify(content)}`,
        loader: 'js',
      };
    });
  },
};

const shared = {
  bundle: true,
  minify: false,
  sourcemap: false,
  logLevel: 'info',
};

// JS entry points — both renderer bundles use the html-text-loader plugin.
const jsEntries = [
  {
    entryPoints: [path.join(__dirname, 'src/renderer.js')],
    outfile: path.join(__dirname, 'public/dist/renderer.js'),
    platform: 'browser',
    format: 'iife',
    plugins: [htmlTextPlugin],
    ...shared,
  },
  {
    entryPoints: [path.join(__dirname, 'src/hud-renderer.js')],
    outfile: path.join(__dirname, 'public/dist/hud-renderer.js'),
    platform: 'browser',
    format: 'iife',
    ...shared,
  },
];

// CSS entry points — one bundle per HTML page. Each entry file uses @import
// to pull in the individual component sheets; esbuild merges them into one file.
const cssEntries = [
  {
    entryPoints: [path.join(__dirname, 'public/css/main-entry.css')],
    outfile: path.join(__dirname, 'public/dist/main.css'),
  },
  {
    entryPoints: [path.join(__dirname, 'public/css/watch-overlay-entry.css')],
    outfile: path.join(__dirname, 'public/dist/watch-overlay.css'),
  },
  {
    entryPoints: [path.join(__dirname, 'public/css/automation-hud-entry.css')],
    outfile: path.join(__dirname, 'public/dist/automation-hud.css'),
  },
  {
    entryPoints: [path.join(__dirname, 'public/css/automation-buffs-entry.css')],
    outfile: path.join(__dirname, 'public/dist/automation-buffs.css'),
  },
].map(e => ({ ...shared, ...e, platform: 'browser' }));

const allEntries = [...jsEntries, ...cssEntries];

if (isWatch) {
  const contexts = await Promise.all(allEntries.map(opts => esbuild.context(opts)));
  await Promise.all(contexts.map(ctx => ctx.watch()));
  console.log('[esbuild] Watching for changes — Ctrl+C to stop…');
} else {
  await Promise.all(allEntries.map(opts => esbuild.build(opts)));
  console.log('[esbuild] Build complete.');
}
