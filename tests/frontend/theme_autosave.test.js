import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const indexHtmlPath = path.resolve(__dirname, '../../gui/static/index.html');
const appJsPath = path.resolve(__dirname, '../../gui/static/app.js');
const styleCssPath = path.resolve(__dirname, '../../gui/static/style.css');
const roadmapPath = path.resolve(__dirname, '../../ROADMAP.md');

test('DOM Structure & Styling: index.html contains settings-app-theme-error with theme class and no inline style', () => {
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

    // Verify settings-tab-appearance contains settings-app-theme
    assert.ok(indexHtml.includes('id="settings-tab-appearance"'), 'index.html must contain settings-tab-appearance');
    assert.ok(indexHtml.includes('id="settings-app-theme"'), 'index.html must contain settings-app-theme select');
    assert.ok(indexHtml.includes('id="settings-app-theme-error"'), 'index.html must contain settings-app-theme-error container');

    // Verify placement: settings-app-theme appears before settings-app-theme-error, within appearance tab
    const appearanceTabStart = indexHtml.indexOf('id="settings-tab-appearance"');
    const themeSelectPos = indexHtml.indexOf('id="settings-app-theme"', appearanceTabStart);
    const themeErrorPos = indexHtml.indexOf('id="settings-app-theme-error"', appearanceTabStart);

    assert.ok(themeSelectPos > appearanceTabStart, 'settings-app-theme must be inside settings-tab-appearance');
    assert.ok(themeErrorPos > themeSelectPos, 'settings-app-theme-error must be located after settings-app-theme');

    // Verify default hidden class and theme-autosave-error class without inline styles
    const errorTagMatch = indexHtml.match(/<div[^>]*id="settings-app-theme-error"[^>]*>/);
    assert.ok(errorTagMatch, 'settings-app-theme-error tag must exist');
    assert.ok(/\bclass="[^"]*\bhidden\b[^"]*"/.test(errorTagMatch[0]), 'settings-app-theme-error must have class="hidden" by default');
    assert.ok(/\bclass="[^"]*\btheme-autosave-error\b[^"]*"/.test(errorTagMatch[0]), 'settings-app-theme-error must have class="theme-autosave-error"');
    assert.strictEqual(/style\s*=\s*"[^"]*"/.test(errorTagMatch[0]), false, 'settings-app-theme-error must not have an inline style attribute');

    // Verify style.css defines theme-autosave-error with var(--danger, ...)
    const styleCss = fs.readFileSync(styleCssPath, 'utf8');
    assert.ok(styleCss.includes('.theme-autosave-error'), 'style.css must define .theme-autosave-error');
    const cssRuleMatch = styleCss.match(/\.theme-autosave-error\s*\{([^}]+)\}/);
    assert.ok(cssRuleMatch, '.theme-autosave-error rule block must exist in style.css');
    assert.ok(cssRuleMatch[1].includes('var(--danger'), '.theme-autosave-error must use var(--danger, ...)');
});

// DOM Mocking helper
function createMockElement(id = '') {
    const classSet = new Set();
    const listeners = {};
    return {
        id,
        value: '',
        textContent: '',
        innerHTML: '',
        style: {},
        dataset: {},
        classList: {
            add: (cls) => classSet.add(cls),
            remove: (cls) => classSet.delete(cls),
            contains: (cls) => classSet.has(cls)
        },
        addEventListener: (event, handler) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(handler);
        },
        dispatchEvent: async function(eventObj) {
            const eventList = listeners[eventObj.type] || [];
            for (const handler of eventList) {
                await handler.call(this, eventObj);
            }
        }
    };
}

function setupThemeAutosaveEnvironment() {
    const elements = {};
    function getElement(id) {
        if (!elements[id]) {
            elements[id] = createMockElement(id);
        }
        return elements[id];
    }

    const themeSelect = getElement('settings-app-theme');
    const themeError = getElement('settings-app-theme-error');
    themeError.classList.add('hidden');

    const mockDoc = {
        getElementById: (id) => getElement(id)
    };

    // Extract exact theme autosave code snippet from app.js
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');
    const startMarker = 'const themeSelect = document.getElementById("settings-app-theme");';
    const startIndex = appJsContent.indexOf(startMarker);
    assert.ok(startIndex !== -1, 'Theme autosave start marker must exist in app.js');

    const endIndex = appJsContent.indexOf('loadStatus();', startIndex);
    assert.ok(endIndex !== -1, 'End marker after theme autosave must exist in app.js');

    const themeHandlerCode = appJsContent.substring(startIndex, endIndex);

    return {
        themeSelect,
        themeError,
        mockDoc,
        themeHandlerCode
    };
}

test('Theme Autosave AK1 & AK3 & AK5: non-ok response shows visible informative error and logs console.error', async () => {
    const env = setupThemeAutosaveEnvironment();

    const originalFetch = globalThis.fetch;
    const originalConsoleError = console.error;

    const consoleErrors = [];
    console.error = (...args) => {
        consoleErrors.push(args);
    };

    let fetchCall = null;
    const mockFetch = (url, options) => {
        fetchCall = { url, options };
        return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error'
        });
    };

    // Execute the exact code extracted from app.js in a controlled sandbox
    const runner = new Function('document', 'fetch', 'applyTheme', 'currentSettings', 'console', env.themeHandlerCode);
    runner(
        env.mockDoc,
        mockFetch,
        () => {},
        { app_theme: 'deep-space', import_sources: [], sync_categories: [], local_download_folders: [] },
        console
    );

    try {
        env.themeSelect.value = 'nordic-slate';
        await env.themeSelect.dispatchEvent({ type: 'change' });

        assert.ok(fetchCall, 'fetch must be called for settings auto-save');
        assert.strictEqual(fetchCall.url, '/api/settings');

        // AK1: Error is visible (not hidden)
        assert.strictEqual(
            env.themeError.classList.contains('hidden'),
            false,
            'Error element must NOT have class "hidden" after failed save'
        );

        // AK3: Error message states theme was NOT saved
        assert.ok(
            env.themeError.textContent.includes('nicht gespeichert'),
            `Error message "${env.themeError.textContent}" must indicate that theme was not saved`
        );

        // AK5: console.error was preserved and called
        assert.ok(consoleErrors.length > 0, 'console.error must be called on failure');
        assert.ok(
            consoleErrors.some(args => args.some(a => String(a).includes('automatischen Speichern des Themes'))),
            'console.error must log theme save error message'
        );
    } finally {
        globalThis.fetch = originalFetch;
        console.error = originalConsoleError;
    }
});

test('Theme Autosave AK2 & AK3 & AK5: network exception in catch block shows visible informative error and logs console.error', async () => {
    const env = setupThemeAutosaveEnvironment();

    const originalFetch = globalThis.fetch;
    const originalConsoleError = console.error;

    const consoleErrors = [];
    console.error = (...args) => {
        consoleErrors.push(args);
    };

    const networkError = new TypeError('Failed to fetch');
    const mockFetch = () => Promise.reject(networkError);

    const runner = new Function('document', 'fetch', 'applyTheme', 'currentSettings', 'console', env.themeHandlerCode);
    runner(
        env.mockDoc,
        mockFetch,
        () => {},
        { app_theme: 'deep-space', import_sources: [], sync_categories: [], local_download_folders: [] },
        console
    );

    try {
        env.themeSelect.value = 'amber-warmth';
        await env.themeSelect.dispatchEvent({ type: 'change' });

        // AK2: catch block shows visible error message
        assert.strictEqual(
            env.themeError.classList.contains('hidden'),
            false,
            'Error element must NOT have class "hidden" after network exception in catch block'
        );

        // AK3: Actionable message
        assert.ok(
            env.themeError.textContent.includes('nicht gespeichert'),
            `Error message "${env.themeError.textContent}" must indicate that theme was not saved`
        );

        // AK5: console.error was called with the exception
        assert.ok(consoleErrors.length > 0, 'console.error must be called on exception');
        assert.ok(
            consoleErrors.some(args => args.includes(networkError) || args.some(a => String(a).includes('automatischen Speichern des Themes'))),
            'console.error must log theme save error exception'
        );
    } finally {
        globalThis.fetch = originalFetch;
        console.error = originalConsoleError;
    }
});

test('Theme Autosave AK4: successful save clears any previous error and keeps error hidden', async () => {
    const env = setupThemeAutosaveEnvironment();

    // Pre-populate an old error state
    env.themeError.textContent = 'Alter Fehler von vorheriger Aktion';
    env.themeError.classList.remove('hidden');

    const originalFetch = globalThis.fetch;
    const originalConsoleError = console.error;

    const consoleErrors = [];
    console.error = (...args) => {
        consoleErrors.push(args);
    };

    const mockFetch = () => Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true })
    });

    const runner = new Function('document', 'fetch', 'applyTheme', 'currentSettings', 'console', env.themeHandlerCode);
    runner(
        env.mockDoc,
        mockFetch,
        () => {},
        { app_theme: 'deep-space', import_sources: [], sync_categories: [], local_download_folders: [] },
        console
    );

    try {
        env.themeSelect.value = 'apple-black';
        await env.themeSelect.dispatchEvent({ type: 'change' });

        // AK4: Error must be cleared and hidden on success
        assert.strictEqual(
            env.themeError.classList.contains('hidden'),
            true,
            'Error element must have class "hidden" after successful save'
        );
        assert.strictEqual(
            env.themeError.textContent,
            '',
            'Error element textContent must be empty on success'
        );

        // AK5: No console.error on success
        assert.strictEqual(consoleErrors.length, 0, 'No console.error should be emitted on success');
    } finally {
        globalThis.fetch = originalFetch;
        console.error = originalConsoleError;
    }
});

test('Roadmap: Item 60 retains deferred context and reason in ROADMAP.md', () => {
    const roadmap = fs.readFileSync(roadmapPath, 'utf8');
    assert.ok(roadmap.includes('## 60. Theme-Autosave: Fehler sichtbar statt nur in Browser-Konsole'), 'ROADMAP.md must contain Item 60');
    const item60Section = roadmap.substring(roadmap.indexOf('## 60. Theme-Autosave'));
    assert.ok(item60Section.includes('Scope Creep'), 'Item 60 must mention avoiding Scope Creep on Item #24');
    assert.ok(item60Section.includes('localhost'), 'Item 60 must mention localhost rationale');
    assert.ok(item60Section.includes('Status:** Erledigt'), 'Item 60 status must remain Erledigt');
});
