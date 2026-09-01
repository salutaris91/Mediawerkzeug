import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DOM Mocking helper
function createMockElement() {
    const classSet = new Set();
    return {
        textContent: "",
        innerHTML: "",
        style: {},
        dataset: {},
        __listeners: {},
        classList: {
            add: (c) => classSet.add(c),
            remove: (c) => classSet.delete(c),
            contains: (c) => classSet.has(c)
        },
        closest() {
            return createMockElement();
        },
        querySelectorAll: () => [],
        querySelector: () => null,
        contains: () => true,
        appendChild: () => {},
        addEventListener(type) {
            this.__listeners[type] = (this.__listeners[type] || 0) + 1;
        },
        cloneNode() {
            return createMockElement();
        },
        replaceWith() {}
    };
}

const elements = {};
globalThis.document = {
    documentElement: {
        style: {
            setProperty: () => {},
            removeProperty: () => {}
        }
    },
    getElementById(id) {
        if (!elements[id]) {
            elements[id] = createMockElement();
        }
        return elements[id];
    },
    createElement() {
        return createMockElement();
    },
    querySelectorAll() {
        return [];
    },
    querySelector() {
        return null;
    },
    addEventListener() {
        // Ignoriere Event-Registrierungen in der Testumgebung
    }
};

globalThis.window = {
    scrollTo: () => {},
    addEventListener: () => {}
};

globalThis.escapeHTML = (str) => str;
globalThis.renderIgnoredFooter = () => "";
globalThis.wireRestoreAll = () => {};
globalThis.alert = () => {};

// Mock relative fetch during load
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options) => {
    if (typeof url === "string" && url.startsWith("/")) {
        return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ capabilities: { open_local_folder: true } })
        });
    }
    if (originalFetch) {
        return originalFetch(url, options);
    }
    return Promise.reject("Fetch mock error");
};

// Lade und evaluiere app.js
const appJsPath = path.resolve(__dirname, '../../gui/static/app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

// Wir entfernen nur native Browser-Imports, die in Node.js eval() einen Syntaxfehler werfen.
let cleanAppJs = appJsContent.replace(/import\s+[\s\S]*?from\s+['"].*?['"];?/g, "");

// Exponiere die Funktionen fuer die Testumgebung global
cleanAppJs += `
globalThis.renderHealthStatus = renderHealthStatus;
globalThis.renderDuplicateStatus = renderDuplicateStatus;
globalThis.loadNormalizePreview = loadNormalizePreview;
globalThis.renderNormalizePlan = renderNormalizePlan;
globalThis.renderQueue = renderQueue;
globalThis.renderNfoAgentFiles = renderNfoAgentFiles;
globalThis.triggerNfoAgentMediaTypeChange = triggerNfoAgentMediaTypeChange;
globalThis.submitNfoAgentJob = submitNfoAgentJob;
globalThis.updateNfoAgentCompletenessWarning = updateNfoAgentCompletenessWarning;
globalThis.setNfoAgentScanData = (val) => { nfoAgentScanData = val; };
globalThis.setNfoAgentCurrentPath = (val) => { nfoAgentCurrentPath = val; };
globalThis.waitForServerRestart = waitForServerRestart;
globalThis.restoreServerRestartButton = restoreServerRestartButton;
`;

eval(cleanAppJs);
globalThis.fetch = originalFetch;

test('renderHealthStatus - warning state renders warning alert, not success', () => {
    // Zurücksetzen
    const issuesEl = globalThis.document.getElementById("health-issues");
    const statusEl = globalThis.document.getElementById("health-scan-status");
    issuesEl.innerHTML = "";
    statusEl.textContent = "";

    const data = {
        status: "warning",
        message: "Scan nicht aussagekräftig",
        issues: []
    };

    globalThis.renderHealthStatus(data);

    assert.ok(statusEl.textContent.includes("Warnung:"));
    assert.ok(issuesEl.innerHTML.includes("Scan nicht aussagekräftig: keine Bibliotheksordner gefunden."));
    assert.ok(!issuesEl.innerHTML.includes("Keine Auffälligkeiten gefunden"));
});

test('renderDuplicateStatus - warning state renders warning alert, not success', () => {
    const groupsEl = globalThis.document.getElementById("duplicate-groups");
    const statusEl = globalThis.document.getElementById("duplicate-scan-status");
    groupsEl.innerHTML = "";
    statusEl.textContent = "";

    const data = {
        status: "warning",
        message: "Scan nicht aussagekräftig",
        groups: []
    };

    globalThis.renderDuplicateStatus(data);

    assert.ok(statusEl.textContent.includes("Warnung:"));
    assert.ok(groupsEl.innerHTML.includes("Scan nicht aussagekräftig: keine Bibliotheksordner gefunden."));
    assert.ok(!groupsEl.innerHTML.includes("Keine Duplikate gefunden"));
});

test('loadNormalizePreview - status 400 shows warning alert, not success', async () => {
    const statusEl = globalThis.document.getElementById("normalize-status");
    const planEl = globalThis.document.getElementById("normalize-plan");
    statusEl.innerHTML = "";
    planEl.innerHTML = "";

    // Mock global fetch for preview endpoint returning 400
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (url) => {
        if (url === "/api/nas/normalize-films/preview") {
            return Promise.resolve({
                ok: false,
                status: 400,
                json: () => Promise.resolve({ error: "Keine Bibliotheksordner gefunden." })
            });
        }
        return Promise.reject("Unexpected fetch");
    };

    try {
        await globalThis.loadNormalizePreview();

        assert.ok(statusEl.innerHTML.includes("Warnung:"));
        assert.ok(statusEl.innerHTML.includes("Keine Bibliotheksordner gefunden."));
        assert.ok(planEl.innerHTML.includes("Scan nicht aussagekräftig: keine Bibliotheksordner gefunden."));
        assert.ok(!statusEl.innerHTML.includes("Alles sauber"));
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('renderNormalizePlan - 1 item renders Singular "Vorschlag"', () => {
    const statusEl = globalThis.document.getElementById("normalize-status");
    statusEl.textContent = "";

    const plan = [
        { label: "Test Movie 1", kind: "genre", conflict: false }
    ];

    globalThis.renderNormalizePlan(plan);

    assert.ok(statusEl.textContent.includes("1 Vorschlag"));
    assert.ok(!statusEl.textContent.includes("Vorschläge"));
});

test('renderNormalizePlan - 2 items renders Plural "Vorschläge"', () => {
    const statusEl = globalThis.document.getElementById("normalize-status");
    statusEl.textContent = "";

    const plan = [
        { label: "Test Movie 1", kind: "genre", conflict: false },
        { label: "Test Movie 2", kind: "lose", conflict: false }
    ];

    globalThis.renderNormalizePlan(plan);

    assert.ok(statusEl.textContent.includes("2 Vorschläge"));
    assert.ok(!statusEl.textContent.includes("Vorschlag "));
});

test('renderNormalizePlan - empty plan renders neutral empty state without emoji', () => {
    const statusEl = globalThis.document.getElementById("normalize-status");
    const planEl = globalThis.document.getElementById("normalize-plan");
    statusEl.textContent = "Alter Status";
    planEl.innerHTML = "<div>Alter Plan</div>";

    globalThis.renderNormalizePlan([]);

    assert.equal(statusEl.textContent, "Keine Auffälligkeiten gefunden.");
    assert.equal(planEl.innerHTML, "");
    assert.ok(!statusEl.textContent.includes("🎉"));
    assert.ok(!statusEl.textContent.includes("Alles sauber"));
});

test('renderQueue - pipeline step message uses existing HTML escaping helper', () => {
    const listEl = globalThis.document.getElementById("queue-list");
    const badgeEl = globalThis.document.getElementById("queue-badge");
    const headerBadgeEl = globalThis.document.getElementById("header-queue-badge");
    listEl.innerHTML = "";
    listEl.appendChild = (child) => {
        listEl.innerHTML += child.innerHTML || "";
    };
    badgeEl.textContent = "";
    headerBadgeEl.textContent = "";

    const jobs = [{
        id: "job-queue-message",
        name: "Queue Message Movie",
        type: "movie",
        status: "running",
        progress: 42,
        message: "Upload läuft",
        pipeline: {
            metadata: { status: "done", progress: 100 },
            convert: { status: "done", progress: 100 },
            nas: { status: "done", progress: 100, message: "Auf NAS gespeichert" },
            pcloud: { status: "running", progress: 0, message: '<script>alert("x")</script>' }
        }
    }];

    assert.doesNotThrow(() => globalThis.renderQueue(jobs));
    assert.ok(listEl.innerHTML.includes("alert"));
    assert.ok(listEl.innerHTML.includes("script"));
    assert.ok(!listEl.innerHTML.includes("<script"));
    assert.ok(!listEl.innerHTML.includes('<script>alert("x")</script>'));
});

test('renderHealthStatus - renders summary chips with total and group counts and no severity grouping', () => {
    globalThis.window.healthGroupMode = "type";
    const summaryEl = globalThis.document.getElementById("health-summary");
    const issuesEl = globalThis.document.getElementById("health-issues");
    summaryEl.innerHTML = "";
    issuesEl.innerHTML = "";

    const data = {
        status: "done",
        message: "Scan abgeschlossen",
        issues: [
            { key: "1", type: "missing_nfo", category: "Filme", severity: "critical", message: "Fehlende NFO", path: "/path/to/movie" },
            { key: "2", type: "missing_poster", category: "Filme", severity: "warning", message: "Fehlendes Poster", path: "/path/to/movie" },
            { key: "3", type: "small_file", category: "Filme", severity: "warning", message: "Kleine Datei", path: "/path/to/movie/file.mkv" },
            { key: "4", type: "nested_duplicate", category: "Filme", severity: "warning", message: "Verschachtelter Ordner", path: "/path/to/movie" }
        ],
        finished_at: 1719816000
    };

    globalThis.renderHealthStatus(data);

    // Summary-Chips: Gesamt und Gruppen (Metadaten, Artwork, Dateien, Struktur)
    assert.ok(summaryEl.innerHTML.includes("Gesamt: 4"));
    assert.ok(summaryEl.innerHTML.includes("Metadaten: 1"));
    assert.ok(summaryEl.innerHTML.includes("Artwork: 1"));
    assert.ok(summaryEl.innerHTML.includes("Dateien: 1"));
    assert.ok(summaryEl.innerHTML.includes("Struktur: 1"));
    // Keine Schweregrad-Chips mehr
    assert.ok(!summaryEl.innerHTML.includes("Kritisch"));
    assert.ok(!summaryEl.innerHTML.includes("Warnung"));
    assert.ok(!summaryEl.innerHTML.includes("Hinweis"));

    // Keine Schweregrad-Gruppierung mehr
    assert.ok(!issuesEl.innerHTML.includes('data-sev="critical"'));
    assert.ok(!issuesEl.innerHTML.includes('data-sev='));
});

test('renderHealthStatus - type grouping renders type groups, checkboxes and tool-connectors', () => {
    globalThis.window.healthGroupMode = "type";
    const issuesEl = globalThis.document.getElementById("health-issues");
    issuesEl.innerHTML = "";

    const data = {
        status: "done",
        message: "Scan abgeschlossen",
        issues: [
            { key: "1", type: "missing_nfo", category: "Filme", severity: "critical", message: "Fehlende NFO", path: "/path/to/movie" },
            { key: "2", type: "missing_age_rating", category: "Filme", severity: "warning", message: "FSK fehlt", path: "/path/to/movie/movie.nfo", agent_path: "/path/to/movie", media_kind: "movie", scope_kind: "movie" }
        ],
        finished_at: 1719816000
    };

    globalThis.renderHealthStatus(data);

    // Sollte Details für Fehlertyp rendern
    assert.ok(issuesEl.innerHTML.includes('data-type-id="missing_nfo"'));
    // Sollte Checkboxen zur Sammel-Auswahl rendern
    assert.ok(issuesEl.innerHTML.includes('class="health-group-select-all"'));
    assert.ok(issuesEl.innerHTML.includes('class="health-item-select"'));
    // Sollte Empfehlung anzeigen
    assert.ok(issuesEl.innerHTML.includes("Empfehlung:"));
    // Sollte pro Befund einen NFO-Agent-Button rendern (kein Batch-Button mehr,
    // da jede Serie eine eigene Metadatenquelle/ID braucht)
    assert.ok(issuesEl.innerHTML.includes('health-nfo-agent'));
    assert.ok(!issuesEl.innerHTML.includes('data-tool="tool_nfo_agent"'));
    assert.ok(issuesEl.innerHTML.includes('health-fix-fsk'));
    assert.ok(issuesEl.innerHTML.includes("Metadaten bearbeiten"));
    assert.ok(!issuesEl.innerHTML.includes(">NFO Agent</button>"));
    assert.ok(!issuesEl.innerHTML.includes(">FSK setzen</button>"));
});

test('renderHealthStatus - only nested_duplicate / structure issues displays tab specific empty state on media tab', () => {
    globalThis.window.healthGroupMode = "type";

    const issuesEl = globalThis.document.getElementById("health-issues");
    const structureIssuesEl = globalThis.document.getElementById("health-issues-structure");
    const structureContainer = globalThis.document.getElementById("structure-health-issues-container");

    issuesEl.innerHTML = "";
    structureIssuesEl.innerHTML = "";
    structureContainer.style.display = "none";

    const data = {
        status: "done",
        message: "Scan abgeschlossen",
        issues: [
            { key: "1", type: "nested_duplicate", category: "Filme", severity: "warning", message: "Verschachtelter Ordner", path: "/path/to/movie" }
        ],
        finished_at: 1719816000
    };

    globalThis.renderHealthStatus(data);

    // Der Medien-Sub-Tab darf keine globale Entwarnung anzeigen, sondern den Hinweis auf den Struktur-Tab
    assert.ok(issuesEl.innerHTML.includes("Keine Auffälligkeiten für einzelne Medien. Strukturprobleme findest du im Tab Struktur."));
    assert.ok(!issuesEl.innerHTML.includes("Keine Auffälligkeiten gefunden. 🎉"));

    // Der Struktur-Sub-Tab sollte das Problem gerendert haben
    assert.ok(structureIssuesEl.innerHTML.includes("Verschachtelter Ordner"));
    // Der Struktur-Container sollte eingeblendet sein
    assert.strictEqual(structureContainer.style.display, "block");

    // Neue Buttons müssen gerendert werden
    assert.ok(structureIssuesEl.innerHTML.includes('class="btn btn-secondary btn-sm health-structure-preview"'));
    assert.ok(structureIssuesEl.innerHTML.includes('class="btn btn-primary btn-sm health-structure-apply"'));
    // Alter Button darf nicht mehr gerendert werden
    assert.ok(!structureIssuesEl.innerHTML.includes('health-fix-flatten'));
});

test('renderHealthStatus - structure-only result wires structure batch button', () => {
    globalThis.window.healthGroupMode = "type";

    elements["btn-structure-batch-check"] = createMockElement();
    elements["view-library"] = createMockElement();
    const issuesEl = globalThis.document.getElementById("health-issues");
    const structureIssuesEl = globalThis.document.getElementById("health-issues-structure");
    const structureContainer = globalThis.document.getElementById("structure-health-issues-container");
    const libraryView = globalThis.document.getElementById("view-library");

    issuesEl.innerHTML = "";
    structureIssuesEl.innerHTML = "";
    structureContainer.style.display = "none";
    libraryView.dataset = {};
    libraryView.__listeners = {};

    const data = {
        status: "done",
        message: "Scan abgeschlossen",
        issues: [
            { key: "1", type: "nested_duplicate", category: "Filme", severity: "warning", message: "Verschachtelter Ordner", path: "/path/to/movie-a" },
            { key: "2", type: "genre_container", category: "Filme", severity: "warning", message: "Sammelordner", path: "/path/to/action" }
        ],
        finished_at: 1719816000
    };

    globalThis.renderHealthStatus(data);

    assert.ok(structureIssuesEl.innerHTML.includes('id="btn-structure-batch-check"'));
    assert.strictEqual(libraryView.dataset.structureFixDelegated, "true");
    assert.ok(libraryView.__listeners.click > 0);
});

test('renderHealthStatus - transition running -> warning clears loading spinner and hides structure container', () => {
    const statusEl = globalThis.document.getElementById("health-scan-status");
    const progWrap = globalThis.document.getElementById("health-progress-wrap");
    const progBar = globalThis.document.getElementById("health-progress-bar");
    const summaryEl = globalThis.document.getElementById("health-summary");
    const issuesEl = globalThis.document.getElementById("health-issues");
    const groupControls = globalThis.document.getElementById("health-group-controls");
    const structureBadge = globalThis.document.getElementById("badge-count-structure");
    const mediaBadge = globalThis.document.getElementById("badge-count-media");
    const structureIssuesEl = globalThis.document.getElementById("health-issues-structure");
    const structureContainer = globalThis.document.getElementById("structure-health-issues-container");
    const overviewLastScan = globalThis.document.getElementById("overview-last-scan");
    const overviewHealthSummary = globalThis.document.getElementById("overview-health-summary");
    const overviewStructureSummary = globalThis.document.getElementById("overview-structure-summary");

    // Simulate setting initial state to visible & pre-populated dashboard values
    structureContainer.style.display = "block";
    overviewLastScan.textContent = "12.07.2026, 10:00:00";
    overviewHealthSummary.innerHTML = "0 kritisch, 1 warnend";
    overviewStructureSummary.textContent = "1 Strukturfehler";

    issuesEl.innerHTML = "";
    structureIssuesEl.innerHTML = "";
    summaryEl.innerHTML = "Existing content";

    // 1. Übergang running
    const runningData = {
        status: "running",
        progress: 45
    };

    globalThis.renderHealthStatus(runningData);

    assert.strictEqual(statusEl.textContent, "Scan läuft...");
    assert.strictEqual(progWrap.style.display, "block");
    assert.strictEqual(progBar.style.width, "45%");
    assert.strictEqual(groupControls.style.display, "none");
    assert.strictEqual(structureBadge.style.display, "none");
    assert.strictEqual(mediaBadge.style.display, "none");
    assert.strictEqual(summaryEl.innerHTML, "");
    assert.ok(issuesEl.innerHTML.includes("Health-Scan wird aktualisiert"));
    assert.ok(issuesEl.innerHTML.includes("loading-spinner"));
    assert.ok(structureIssuesEl.innerHTML.includes("Health-Scan wird aktualisiert"));
    assert.ok(structureIssuesEl.innerHTML.includes("loading-spinner"));

    // Overview dashboard shows "Scan läuft..." during scan
    assert.strictEqual(overviewLastScan.textContent, "Scan läuft...");
    assert.strictEqual(overviewHealthSummary.textContent, "Scan läuft...");

    // 2. Übergang warning
    const warningData = {
        status: "warning",
        message: "Keine Bibliotheksordner gefunden."
    };

    globalThis.renderHealthStatus(warningData);

    assert.strictEqual(statusEl.textContent, "Warnung: Keine Bibliotheksordner gefunden.");
    assert.strictEqual(progWrap.style.display, "none");
    assert.strictEqual(structureIssuesEl.innerHTML, "");
    assert.strictEqual(structureContainer.style.display, "none");
    assert.strictEqual(issuesEl.innerHTML.includes("loading-spinner"), false);
    assert.strictEqual(issuesEl.innerHTML.includes("Scan nicht aussagekräftig"), true);

    // Dashboard values reset to "Keine Daten"
    assert.strictEqual(overviewHealthSummary.textContent, "Keine Daten");
    assert.strictEqual(overviewStructureSummary.textContent, "Keine Daten");
});

test('renderNfoAgentFiles - mediaType tvshow renders tvshow.nfo status matrix', () => {
    elements["nfo-agent-media-type"] = createMockElement();
    elements["nfo-agent-media-type"].value = "tvshow";
    elements["nfo-agent-main-nfo-section"] = createMockElement();
    elements["nfo-agent-main-nfo-status"] = createMockElement();
    elements["nfo-agent-episodes-list"] = createMockElement();
    elements["nfo-agent-season"] = createMockElement();
    elements["nfo-agent-season"].value = "1";

    const mainNfoBody = elements["nfo-agent-main-nfo-status"];
    const episodeList = elements["nfo-agent-episodes-list"];
    episodeList.children = [];
    episodeList.appendChild = (child) => episodeList.children.push(child);

    // Status matrix: [exists, parseable, complete, expectedStatus]
    const testCases = [
        [false, false, false, "Fehlende Metadaten"],
        [true, false, false, "Metadaten nicht lesbar"],
        [true, true, false, "Metadaten unvollständig"],
        [true, true, true, "Metadaten vollständig"]
    ];

    testCases.forEach(([exists, parseable, complete, expectedStatus]) => {
        mainNfoBody.children = [];
        mainNfoBody.appendChild = (child) => {
            mainNfoBody.children.push(child);
        };

        const scanData = {
            files: [],
            show_nfo_status: {
                path: "/path/to/tvshow.nfo",
                exists,
                parseable,
                complete
            },
            file_nfo_statuses: {}
        };

        globalThis.renderNfoAgentFiles(scanData, {});

        assert.strictEqual(mainNfoBody.children.length, 1);
        const row = mainNfoBody.children[0];
        assert.ok(row.innerHTML.includes("tvshow.nfo"));
        assert.ok(row.innerHTML.includes(expectedStatus), `Expected status ${expectedStatus} to be rendered in row HTML: ${row.innerHTML}`);
        assert.ok(row.innerHTML.includes('id="nfo-agent-show-nfo-action"'));
        assert.strictEqual(elements["nfo-agent-main-nfo-section"].style.display, "block");
        assert.ok(!episodeList.children.some((child) => child.innerHTML.includes("tvshow.nfo")));
    });
});

test('NFO Agent combines the main NFO status with the metadata editor', () => {
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../../gui/static/index.html'), 'utf8');
    const findingIndex = indexHtml.indexOf('id="nfo-agent-main-nfo-section"');
    const detailsIndex = indexHtml.indexOf('id="nfo-agent-details-container"');
    const episodesIndex = indexHtml.indexOf('id="nfo-agent-episodes-section"');

    assert.ok(findingIndex > detailsIndex, "main NFO status must live inside the metadata editor");
    assert.ok(detailsIndex < episodesIndex, "metadata editor must precede episode mappings");
    assert.ok(!indexHtml.includes('id="nfo-agent-completeness-warning"'));
    assert.ok(!indexHtml.includes('id="nfo-agent-main-nfo-heading"'));
});

test('NFO Agent movie mode renders movie.nfo without series controls', () => {
    elements["nfo-agent-media-type"] = createMockElement();
    elements["nfo-agent-media-type"].value = "movie";
    elements["nfo-agent-provider"] = createMockElement();
    elements["nfo-agent-season-container"] = createMockElement();
    elements["nfo-agent-episodes-section"] = createMockElement();
    elements["nfo-agent-modal-title"] = createMockElement();
    elements["nfo-agent-search-label"] = createMockElement();
    elements["nfo-agent-title-label"] = createMockElement();
    elements["nfo-agent-main-nfo-heading"] = createMockElement();
    elements["nfo-agent-details-heading"] = createMockElement();
    elements["nfo-agent-files-heading"] = createMockElement();
    elements["nfo-agent-main-nfo-section"] = createMockElement();
    elements["nfo-agent-main-nfo-status"] = createMockElement();
    elements["nfo-agent-episodes-list"] = createMockElement();

    const listBody = elements["nfo-agent-episodes-list"];
    listBody.children = [];
    listBody.appendChild = (child) => listBody.children.push(child);
    const mainNfoBody = elements["nfo-agent-main-nfo-status"];
    mainNfoBody.children = [];
    mainNfoBody.appendChild = (child) => mainNfoBody.children.push(child);

    globalThis.setNfoAgentScanData({
        type: "movie",
        files: ["Example Movie.mkv"],
        main_nfo_status: {
            path: "/media/Filme/Example Movie/movie.nfo",
            filename: "movie.nfo",
            exists: true,
            parseable: true,
            complete: false
        },
        file_nfo_statuses: {
            "Example Movie.mkv": { exists: false, complete: false }
        }
    });

    globalThis.triggerNfoAgentMediaTypeChange();

    assert.strictEqual(elements["nfo-agent-season-container"].style.display, "none");
    assert.strictEqual(elements["nfo-agent-episodes-section"].style.display, "none");
    assert.strictEqual(elements["nfo-agent-modal-title"].textContent, "NFO Agent: Film-Metadaten");
    assert.strictEqual(elements["nfo-agent-search-label"].textContent, "Name des Films:");
    assert.strictEqual(elements["nfo-agent-title-label-text"].textContent, "Filmtitel (movie.nfo):");
    assert.strictEqual(elements["nfo-agent-details-heading"].textContent, "Film-Metadaten");
    assert.strictEqual(mainNfoBody.children.length, 1);
    assert.ok(mainNfoBody.children[0].innerHTML.includes("movie.nfo"));
    assert.ok(!mainNfoBody.children[0].innerHTML.includes("tvshow.nfo"));
    assert.strictEqual(listBody.children.length, 0);
    assert.ok(!listBody.children.some((child) => child.innerHTML.includes("Example Movie.mkv")));
});

test('submitNfoAgentJob - payload structures and write_show_nfo semantics', () => {
    // Expose mock inputs in elements dictionary
    elements["nfo-agent-provider"] = createMockElement();
    elements["nfo-agent-provider"].value = "tmdb_tv";
    elements["nfo-agent-media-type"] = createMockElement();
    elements["nfo-agent-media-type"].value = "tvshow";
    elements["nfo-agent-metadata-id"] = createMockElement();
    elements["nfo-agent-metadata-id"].value = "123456";
    elements["nfo-agent-season"] = createMockElement();
    elements["nfo-agent-season"].value = "2";
    elements["nfo-agent-overwrite-nfo"] = createMockElement();
    elements["nfo-agent-overwrite-nfo"].checked = true;

    elements["nfo-agent-show-title"] = createMockElement();
    elements["nfo-agent-show-title"].value = "Original Title";
    elements["nfo-agent-show-year"] = createMockElement();
    elements["nfo-agent-show-year"].value = "2026";
    elements["nfo-agent-show-plot"] = createMockElement();
    elements["nfo-agent-show-plot"].value = "Plot description";
    elements["nfo-agent-show-genres"] = createMockElement();
    elements["nfo-agent-show-genres"].value = "Drama, Komödie";
    elements["nfo-agent-show-fsk"] = createMockElement();
    elements["nfo-agent-show-fsk"].value = "12";

    elements["nfo-agent-show-nfo-action"] = createMockElement();

    // Set global metadata variables
    globalThis.setNfoAgentCurrentPath("/media/Serien/Show/Staffel 2");
    globalThis.setNfoAgentScanData({
        metadata_name: "Original Title",
        metadata_year: "2026",
        metadata_plot: "Plot description",
        metadata_genres: [],
        metadata_fsk: "",
        main_nfo_status: {
            exists: true,
            fingerprint: { path: "/media/Serien/Show/tvshow.nfo", size: 12, hash: "abc" }
        }
    });

    let interceptedUrl = null;
    let interceptedOptions = null;

    globalThis.fetch = (url, options) => {
        interceptedUrl = url;
        interceptedOptions = options;
        return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ task_id: "test-task" })
        });
    };

    // Case A: show NFO action is "process"
    elements["nfo-agent-show-nfo-action"].value = "process";
    globalThis.submitNfoAgentJob();

    assert.strictEqual(interceptedUrl, "/api/process");
    let payload = JSON.parse(interceptedOptions.body);
    assert.strictEqual(payload.write_show_nfo, true);
    assert.strictEqual(payload.show_id, "123456");
    assert.strictEqual(payload.movie_id, "123456");
    assert.strictEqual(payload.season, 2);
    assert.strictEqual(payload.overwrite_nfo, true);
    assert.strictEqual(payload.nfo_write_mode, "replace");
    assert.deepStrictEqual(payload.nfo_overrides.show.genres, ["Drama", "Komödie"]);
    assert.strictEqual(payload.nfo_overrides.show.fsk, "12");
    assert.strictEqual(payload.main_nfo_fingerprint.hash, "abc");

    // Case B: show NFO action is "skip"
    elements["nfo-agent-show-nfo-action"].value = "skip";
    globalThis.submitNfoAgentJob();

    payload = JSON.parse(interceptedOptions.body);
    assert.strictEqual(payload.write_show_nfo, false);
    assert.strictEqual(payload.show_id, "123456"); // show_id remains unchanged
});

test('NFO Agent shows a calm non-blocking completeness hint', () => {
    elements["nfo-agent-show-title"].value = "Titel";
    elements["nfo-agent-show-year"].value = "2026";
    elements["nfo-agent-show-plot"].value = "Beschreibung";
    elements["nfo-agent-show-genres"].value = "";
    elements["nfo-agent-show-fsk"].value = "";
    elements["nfo-agent-main-nfo-current-status"] = createMockElement();
    elements["nfo-agent-main-nfo-current-status"].dataset.nfoState = "incomplete";
    elements["btn-nfo-agent-submit"] = createMockElement();

    const missing = globalThis.updateNfoAgentCompletenessWarning();

    assert.deepStrictEqual(missing, ["Genre", "FSK"]);
    assert.strictEqual(elements["nfo-agent-main-nfo-current-status"].textContent, "Metadaten unvollständig");
    assert.strictEqual(elements["btn-nfo-agent-submit"].textContent, "Trotz unvollständiger Metadaten fortfahren");

    elements["nfo-agent-show-genres"].value = "Drama";
    elements["nfo-agent-show-fsk"].value = "12";
    assert.deepStrictEqual(globalThis.updateNfoAgentCompletenessWarning(), []);
    assert.strictEqual(elements["nfo-agent-main-nfo-current-status"].textContent, "Metadaten vollständig");
    assert.strictEqual(elements["btn-nfo-agent-submit"].textContent, "Metadaten übernehmen");
});

test('waitForServerRestart succeeds after a temporary connection failure', async () => {
    let attempts = 0;
    const fetchStatus = async () => {
        attempts += 1;
        if (attempts === 1) {
            throw new Error("server offline");
        }
        return { ok: true };
    };

    const result = await globalThis.waitForServerRestart(fetchStatus, {
        maxAttempts: 3,
        pollDelayMs: 0,
        sleep: async () => {}
    });

    assert.strictEqual(result, true);
    assert.strictEqual(attempts, 2);
});

test('waitForServerRestart stops after the configured attempt limit', async () => {
    let attempts = 0;
    const fetchStatus = async () => {
        attempts += 1;
        throw new Error("server remains offline");
    };

    const result = await globalThis.waitForServerRestart(fetchStatus, {
        maxAttempts: 3,
        pollDelayMs: 0,
        sleep: async () => {}
    });

    assert.strictEqual(result, false);
    assert.strictEqual(attempts, 3);
});

test('restoreServerRestartButton clears the loading state', () => {
    const button = createMockElement();
    button.disabled = true;
    button.innerHTML = "Starte neu...";

    globalThis.restoreServerRestartButton(button);

    assert.strictEqual(button.disabled, false);
    assert.ok(button.innerHTML.includes("Server neu starten"));
});
