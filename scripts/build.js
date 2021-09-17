#!/usr/bin/env node

const cp = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const esbuild = require('esbuild');

let revision = '';
try {
  const res = cp.execSync('git rev-parse HEAD', {
    encoding: 'utf8',
    cwd: path.resolve(__dirname, '../coc.nvim'),
  });
  revision = `${res.trim().slice(0, 10)}-patched`;
} catch (e) {
  // ignore
}

const envPlugin = {
  name: 'env',
  setup(build) {
    build.onResolve({ filter: /\/appenders/ }, (args) => {
      const fullpath = path.join(args.resolveDir, args.path);
      return {
        path: path.relative(path.resolve(__dirname, '..'), fullpath).replace(/\\/g, '/'),
        namespace: 'env-ns',
      };
    });
    build.onLoad({ filter: /\/node_modules\/log4js\/lib\/appenders$/, namespace: 'env-ns' }, (args) => {
      const content = fs.readFileSync(path.join(args.path, 'index.js'), 'utf8');
      return {
        contents: content.replace(/require\.main/g, '""'),
        resolveDir: args.path,
      };
    });
  },
};

async function start(watch) {
  await esbuild.build({
    entryPoints: ['coc.nvim/src/main.ts'],
    bundle: true,
    watch,
    minify: process.env.NODE_ENV === 'production',
    sourcemap: process.env.NODE_ENV === 'development',
    define: { REVISION: `"${revision}"`, ESBUILD: 'true' },
    mainFields: ['module', 'main'],
    platform: 'node',
    target: 'node12.12',
    outfile: 'build/index.js',
    banner: {
      js: `(function () {
  var v = process.version
  var parts = v.slice(1).split('.')
  var major = parseInt(parts[0], 10)
  var minor = parseInt(parts[1], 10)
  if (major < 12 || (major == 12 && minor < 12)) {
    throw new Error('coc.nvim requires node >= v12.12.0, current version: ' + v)
  }
})(); `,
    },
    plugins: [envPlugin],
  });

  // TODO: watch
  const toCopy = ['autoload/coc', 'autoload/health', 'autoload/coc.vim', 'bin', 'data', 'doc', 'plugin'];

  if (fs.existsSync('/tmp/coc-patched-build-trash')) {
    fs.rmSync('/tmp/coc-patched-build-trash', { recursive: true });
  }
  toCopy.forEach((f) => {
    const from = path.resolve(__dirname, '../coc.nvim', f);
    const to = path.resolve(__dirname, '..', f);
    const trash = path.resolve('/tmp/coc-patched-build-trash', f);
    if (fs.existsSync(to)) {
      fs.mkdirSync(path.dirname(trash), { recursive: true });
      fs.renameSync(to, trash);
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copySync(from, to, { recursive: true });
  });
}

let watch = false;
if (process.argv.length > 2 && process.argv[2] === '--watch') {
  console.log('watching...');
  watch = {
    onRebuild(error) {
      if (error) {
        console.error('watch build failed:', error);
      } else {
        console.log('watch build succeeded');
      }
    },
  };
}

start(watch).catch((e) => {
  console.error(e);
  process.exit(1);
});
