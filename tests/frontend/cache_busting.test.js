import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const indexHtmlPath = path.resolve(__dirname, '../../gui/static/index.html');
const appJsPath = path.resolve(__dirname, '../../gui/static/app.js');

test('Cache-Busting: index.html app.js version matches all ES-module import versions in app.js', () => {
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    const appJs = fs.readFileSync(appJsPath, 'utf8');

    // Extract app.js version from index.html
    const indexScriptMatch = indexHtml.match(/<script\s+[^>]*src=["']app\.js\?v=([^"']+)["']/);
    assert.ok(indexScriptMatch, 'index.html must include <script type="module" src="app.js?v=...">');
    const indexVersion = indexScriptMatch[1];
    assert.ok(indexVersion && indexVersion.length > 0, 'index.html app.js version string must not be empty');

    // Extract all ES module imports in app.js
    const importRegex = /import\s+(?:\{[^}]*\}|\*\s+as\s+[^'"]+|[\w$]+)\s+from\s+['"](\.\/js\/[^'"]+)['"]/g;
    const imports = [];
    let match;
    while ((match = importRegex.exec(appJs)) !== null) {
        imports.push(match[1]);
    }

    // Ensure we actually found the imported modules (e.g. theme, utils, format, parse, fsk_batch, welcome, intelligence, nfo_ui)
    assert.ok(imports.length >= 8, `Expected at least 8 ES-module imports in app.js, found ${imports.length}`);

    // Check that each import contains ?v=<version> and that it strictly matches indexVersion
    for (const importPath of imports) {
        const versionMatch = importPath.match(/\?v=([^&'"]+)/);
        assert.ok(
            versionMatch,
            `Import path "${importPath}" in app.js is missing the cache-busting query parameter ?v=`
        );
        const moduleVersion = versionMatch[1];
        assert.strictEqual(
            moduleVersion,
            indexVersion,
            `Version mismatch in app.js import "${importPath}": expected ?v=${indexVersion} (matching index.html), but found ?v=${moduleVersion}`
        );
    }
});

test('Cache-Busting: style.css in index.html has a non-empty ?v= version query', () => {
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    const match = indexHtml.match(/<link\s+[^>]*href=["']style\.css\?v=([^"']+)["']/);
    assert.ok(match, 'index.html must include <link rel="stylesheet" href="style.css?v=...">');
    const version = match[1];
    assert.ok(version && version.length > 0, 'index.html style.css version string must not be empty');
});

test('Cache-Busting: utilities.css in index.html has a non-empty ?v= version query', () => {
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    const match = indexHtml.match(/<link\s+[^>]*href=["']utilities\.css\?v=([^"']+)["']/);
    assert.ok(match, 'index.html must include <link rel="stylesheet" href="utilities.css?v=...">');
    const version = match[1];
    assert.ok(version && version.length > 0, 'index.html utilities.css version string must not be empty');
});
