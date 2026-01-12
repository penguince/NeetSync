// Build script for content scripts (IIFE format)
const esbuild = require('esbuild');
const path = require('path');

async function buildContentScripts() {
  const contentScripts = [
    { input: 'src/content/neetcode_problem.ts', output: 'dist/content/neetcode_problem.js' },
    { input: 'src/content/neetcode_catalog.ts', output: 'dist/content/neetcode_catalog.js' },
    { input: 'src/content/inject_editor_bridge.ts', output: 'dist/content/inject_editor_bridge.js' },
  ];

  for (const script of contentScripts) {
    await esbuild.build({
      entryPoints: [script.input],
      bundle: true,
      outfile: script.output,
      format: 'iife',
      target: 'es2020',
      minify: false,
      sourcemap: false,
    });
    console.log(`Built ${script.output}`);
  }
}

buildContentScripts().catch((err) => {
  console.error(err);
  process.exit(1);
});
