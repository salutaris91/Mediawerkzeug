import { applyTheme } from './js/theme.js?v=91';
import { cleanSeriesName } from './js/utils.js?v=91';
import { formatBytes } from './js/format.js?v=91';
import { guessSeasonAndEpisode, guessEpisodeNumber, cleanFilenameForManualTitle } from './js/parse.js?v=91';
import { osBasename, formatFskLabel } from './js/fsk_batch.js?v=91';
import { fetchStats, fetchYoutubeSubscriptions, fetchSmartInboxSuggestions } from './js/welcome.js?v=91';
import { loadConversionRecommendations, triggerQualityHintUpdates } from './js/intelligence.js?v=91';
import { updateMwDataPanel, prepareSeriesPayload } from './js/nfo_ui.js?v=91';
import { setupMaskedInput, setMaskedInputValue, validateAllMaskedFields } from './js/masked_input.js?v=91';

// ==========================================================================
// AUTHENTICATION & CSRF WRAPPER
// ==========================================================================
const originalFetch = window.fetch;
window.fetch = async function (resource, options = {}) {
    options.headers = options.headers || {};

    const csrfToken = getCookie('mw_csrf_token');
    const method = (options.method || 'GET').toUpperCase();
    if (csrfToken && ['POST', 'PUT', 'DELETE'].includes(method)) {
        if (!(options.headers instanceof Headers)) {
            options.headers['X-CSRF-Token'] = csrfToken;
        } else {
            options.headers.set('X-CSRF-Token', csrfToken);
        }
    }

    const response = await originalFetch(resource, options);

    if (response.status === 401 && !resource.toString().includes('/api/auth/status')) {
        showLoginScreen();
    }

    return response;
};

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

function showLoginScreen() {
    const screen = document.getElementById('login-screen');
    if (screen) {
        screen.classList.remove('hidden');
        const pwInput = document.getElementById('login-password');
        if (pwInput) pwInput.focus();
    }
}

function hideLoginScreen() {
    const screen = document.getElementById('login-screen');
    if (screen) {
        screen.classList.add('hidden');
    }
}

async function checkAuthStatus() {
    try {
        const response = await originalFetch('/api/auth/status');
        const data = await response.json();

        const statusText = document.getElementById('settings-password-status-text');
        const currentPwGroup = document.getElementById('settings-current-password-group');
        const logoutArea = document.getElementById('settings-logout-area');
        const sidebarLogout = document.getElementById('btn-sidebar-logout');

        if (data.auth_required) {
            if (statusText) {
                statusText.textContent = "Geschützt (Passwort aktiv)";
                statusText.style.color = "#10b981";
            }
            if (currentPwGroup) {
                currentPwGroup.classList.remove('hidden');
            }
            if (logoutArea) {
                logoutArea.classList.remove('hidden');
            }
            if (sidebarLogout) {
                sidebarLogout.classList.remove('hidden');
            }

            if (!data.authenticated) {
                showLoginScreen();
                return false;
            }
        } else {
            if (statusText) {
                statusText.textContent = "Ungeschützt (Kein Passwort gesetzt)";
                statusText.style.color = "#ef4444";
            }
            if (currentPwGroup) {
                currentPwGroup.classList.add('hidden');
            }
            if (logoutArea) {
                logoutArea.classList.add('hidden');
            }
            if (sidebarLogout) {
                sidebarLogout.classList.add('hidden');
            }
        }
        hideLoginScreen();
        return true;
    } catch (e) {
        console.error("Error checking auth status:", e);
        return true;
    }
}

async function handleLoginSubmit(event) {
    event.preventDefault();
    const passwordInput = document.getElementById('login-password');
    const password = passwordInput.value;
    const errorMsg = document.getElementById('login-error-message');

    if (errorMsg) errorMsg.classList.add('hidden');

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: password })
        });

        const data = await response.json();

        if (response.status === 200 && data.status === 'success') {
            hideLoginScreen();
            passwordInput.value = '';
            window.location.reload();
        } else {
            if (errorMsg) {
                errorMsg.textContent = data.message || "Ungültiges Passwort.";
                errorMsg.classList.remove('hidden');
            }
        }
    } catch (e) {
        console.error("Login error:", e);
        if (errorMsg) {
            errorMsg.textContent = "Netzwerkfehler beim Anmelden.";
            errorMsg.classList.remove('hidden');
        }
    }
}

async function handlePasswordUpdate() {
    const currentPasswordInput = document.getElementById('settings-current-password');
    const newPasswordInput = document.getElementById('settings-new-password');
    const errorMsg = document.getElementById('settings-password-error-message');
    const successMsg = document.getElementById('settings-password-success-message');

    if (errorMsg) errorMsg.classList.add('hidden');
    if (successMsg) successMsg.classList.add('hidden');

    const current_password = currentPasswordInput ? currentPasswordInput.value : '';
    const new_password = newPasswordInput ? newPasswordInput.value : '';

    try {
        const response = await fetch('/api/settings/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                current_password: current_password,
                new_password: new_password
            })
        });

        const data = await response.json();

        if (response.status === 200) {
            if (successMsg) {
                successMsg.textContent = data.message || "Passwort erfolgreich aktualisiert.";
                successMsg.classList.remove('hidden');
            }
            if (currentPasswordInput) currentPasswordInput.value = '';
            if (newPasswordInput) newPasswordInput.value = '';

            checkAuthStatus();
        } else {
            if (errorMsg) {
                errorMsg.textContent = data.message || "Fehler beim Aktualisieren des Passworts.";
                errorMsg.classList.remove('hidden');
            }
        }
    } catch (e) {
        console.error("Password update error:", e);
        if (errorMsg) {
            errorMsg.textContent = "Netzwerkfehler.";
            errorMsg.classList.remove('hidden');
        }
    }
}

async function handleLogout() {
    try {
        const response = await fetch('/api/auth/logout', {
            method: 'POST'
        });
        if (response.ok) {
            window.location.reload();
        } else {
            alert("Fehler beim Abmelden.");
        }
    } catch (e) {
        console.error("Logout error:", e);
        alert("Netzwerkfehler beim Abmelden.");
    }
}

window.handleLogout = handleLogout;

window.handleLoginSubmit = handleLoginSubmit;
window.handlePasswordUpdate = handlePasswordUpdate;
window.checkAuthStatus = checkAuthStatus;

// ==========================================================================
// STATE MANAGEMENT
// ==========================================================================
let currentProject = "";
let projectFiles = [];
let currentProjectIsDoku = false;
let currentProjectSuggestedQuery = "";
let selectedShow = null;
let selectedMovie = null;
let episodesData = {}; // maps episode number (string) to title/info
let fetchedEpisodeMetadataCache = {}; // caches fetched episode metadata: provider_showid_season_episode -> {title, plot, aired}
let eventSource = null;
let isManualMovieMode = false;
let isManualSeriesMode = false;
let allLocalProfiles = [];
let selectShowRequestId = 0;

// YouTube Downloader states
let ytFetchedInfo = null;
let ytSelectedMovie = null;
let ytSelectedShow = null;
let ytEpisodesData = {};
let activeYtTaskId = null;
let ytStatusInterval = null;
let ytDownloaderMergeMode = false;
let ytDownloaderMergeItems = [];
let ytDownloaderMergeSubId = null;
function escapeHTML(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const qualityInfoCache = {};
const lastQualityRequestIds = {};
function updateQualityIndicator(quality, valElId) {
    const el = document.getElementById(valElId);
    if (!el) return;

    const qVal = parseInt(quality, 10);
    if (isNaN(qVal)) {
        el.textContent = quality;
        return;
    }

    // Immer sofort die Request-ID für dieses Element erhöhen, um ältere Inflight-Requests zu entwerten
    const requestId = (lastQualityRequestIds[valElId] || 0) + 1;
    lastQualityRequestIds[valElId] = requestId;

    if (qualityInfoCache[qVal]) {
        el.textContent = `${qVal} (${qualityInfoCache[qVal]})`;
        return;
    }

    el.textContent = qVal; // Sofortiger Fallback

    fetch(`/api/system/quality-info?quality=${qVal}`)
        .then(res => {
            if (!res.ok) throw new Error("API error");
            return res.json();
        })
        .then(data => {
            if (requestId !== lastQualityRequestIds[valElId]) return; // Veralteten Request verwerfen
            if (data && data.param_name && data.param_value !== undefined) {
                const text = `${data.param_name} ${data.param_value}`;
                qualityInfoCache[qVal] = text;
                el.textContent = `${qVal} (${text})`;
            }
        })
        .catch(err => {
            console.error("Fehler beim Laden des Qualitäts-Mappings:", err);
        });
}

function getCatIdBySub(sub, fallbackId) {
    const cats = (typeof currentSettings !== "undefined" && currentSettings.sync_categories) || [];
    const found = cats.find(c => c.nas_sub === sub);
    return found ? found.id : fallbackId;
}

// ==========================================================================
// NAS SEASONS INFO
// ==========================================================================
async function fetchNasSeasons(requestId = null) {
    const targetRequestId = requestId !== null ? requestId : selectShowRequestId;
    const folderInput = document.getElementById("series-nas-folder-override");
    const destSelect = document.getElementById("series-nas-destination");
    const infoContainer = document.getElementById("selected-show-nas-seasons-info");
    if (!infoContainer) return;

    const folderName = folderInput ? folderInput.value.trim() : "";
    if (!folderName) {
        infoContainer.innerHTML = "";
        return;
    }

    const destId = destSelect ? destSelect.value : "";
    infoContainer.innerHTML = '<span style="color:var(--text-muted); font-style:italic;">Lade Staffelinfo vom NAS...</span>';

    let url = `/api/nas-seasons?folder=${encodeURIComponent(folderName)}&destination_id=${encodeURIComponent(destId)}`;
    if (window.disableNasFuzzyMatch) {
        url += "&exact=1";
    }

    try {
        const res = await fetch(url);
        if (targetRequestId !== selectShowRequestId) return;
        if (!res.ok) throw new Error("Fehler beim Laden");
        const data = await res.json();
        if (targetRequestId !== selectShowRequestId) return;

        if (data.connected === false) {
            infoContainer.innerHTML = '<span style="color:var(--text-warning); font-size: 0.9em; display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-circle" style="height:12px; width:12px; color:var(--text-warning);"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="12" y2="16"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>NAS offline (keine Staffelinfo verfügbar)</span>';
            return;
        }

        // 1. Check if the backend matched a different destination category
        if (data.matched_destination_id && destSelect && destSelect.value !== data.matched_destination_id) {
            window.isProgrammaticCategoryChange = true;
            try {
                destSelect.value = data.matched_destination_id;
                destSelect.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof appendConsoleLog === "function") {
                    appendConsoleLog(`[System]: Serie in anderer Kategorie gefunden. Kategorie auf '${destSelect.options[destSelect.selectedIndex].text}' geändert.`);
                }
            } finally {
                window.isProgrammaticCategoryChange = false;
            }
        }

        if (data.seasons && data.seasons.length > 0) {
            const badges = data.seasons.map(s => {
                const episodeText = s.episodes === 1 ? "1 Episode" : `${s.episodes} Episoden`;
                const sourceText = s.source ? ` [${s.source}]` : "";
                return `<span style="display:inline-block; padding:2px 8px; margin:2px 4px 2px 0; border-radius:var(--radius-sm); background:rgba(139,92,246,0.15); color:var(--accent); font-size:11px; font-weight:500;">${s.name} <span style='opacity:0.7'>(${episodeText})${sourceText}</span></span>`;
            }).join("");

            infoContainer.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; background: rgba(255, 179, 0, 0.05); padding: 8px; border-radius: 6px; border: 1px solid rgba(255, 179, 0, 0.2);">
                    <div>
                        <span style="font-size:11px; color:var(--text-muted);">Auf NAS vorhanden:</span><br>${badges}
                    </div>
                    <button class="btn btn-xs" style="background:var(--error); color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; flex-shrink: 0;" onclick="clearNasOverride()" title="Falsche NAS-Zuordnung trennen und Serie als neu anlegen">✕ Falscher NAS-Ordner?</button>
                </div>
            `;

            // 2. Auto-check absolute numbering if only Staffel 1 exists
            if (data.seasons.length === 1 && !window.currentShowHasCustomProfile) {
                const sName = data.seasons[0].name.toLowerCase();
                if (sName === "staffel 1" || sName === "season 1") {
                    const absoluteCb = document.getElementById("series-option-absolute-numbering");
                    if (absoluteCb && !absoluteCb.checked) {
                        absoluteCb.checked = true;
                        absoluteCb.dispatchEvent(new Event('change', { bubbles: true }));
                        if (typeof appendConsoleLog === "function") {
                            appendConsoleLog("[System]: Nur Staffel 1 auf NAS gefunden. Absolute Nummerierung wurde automatisch aktiviert.");
                        }
                    }
                }
            }
        } else {
            infoContainer.innerHTML = '<span style="font-size:11px; color:var(--text-muted);"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder" style="display:inline-block; vertical-align:middle; margin-right: 4px; color: var(--accent);"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/></svg>Keine Staffeln auf dem NAS gefunden.</span>';
        }
    } catch (e) {
        console.error("Error fetching NAS seasons:", e);
        infoContainer.innerHTML = "";
    }
}

async function fetchYtNasSeasons() {
    const folderInput = document.getElementById("yt-series-nas-folder-override");
    const destSelect = document.getElementById("yt-nas-destination");
    const infoContainer = document.getElementById("yt-selected-series-nas-seasons-info");
    if (!infoContainer) return;

    const folderName = folderInput ? folderInput.value.trim() : "";
    if (!folderName) {
        infoContainer.innerHTML = "";
        return;
    }

    const destId = destSelect ? destSelect.value : "";
    infoContainer.innerHTML = '<span style="color:var(--text-muted); font-style:italic;">Lade Staffelinfo vom NAS...</span>';

    try {
        const res = await fetch(`/api/nas-seasons?folder=${encodeURIComponent(folderName)}&destination_id=${encodeURIComponent(destId)}`);
        if (!res.ok) throw new Error("Fehler beim Laden");
        const data = await res.json();

        if (data.seasons && data.seasons.length > 0) {
            const badges = data.seasons.map(s => {
                const episodeText = s.episodes === 1 ? "1 Episode" : `${s.episodes} Episoden`;
                const sourceText = s.source ? ` [${s.source}]` : "";
                return `<span style="display:inline-block; padding:2px 8px; margin:2px 4px 2px 0; border-radius:var(--radius-sm); background:rgba(139,92,246,0.15); color:var(--accent); font-size:11px; font-weight:500;">${s.name} <span style='opacity:0.7'>(${episodeText})${sourceText}</span></span>`;
            }).join("");
            infoContainer.innerHTML = `<span style="font-size:11px; color:var(--text-muted);"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder" style="display:inline-block; vertical-align:middle; margin-right: 4px; color: var(--accent);"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/></svg>Auf NAS vorhanden:</span><br>${badges}`;
        } else {
            infoContainer.innerHTML = '<span style="font-size:11px; color:var(--text-muted);"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder" style="display:inline-block; vertical-align:middle; margin-right: 4px; color: var(--accent);"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/></svg>Keine Staffeln auf dem NAS gefunden.</span>';
        }
    } catch (e) {
        console.error("Error fetching YT NAS seasons:", e);
        infoContainer.innerHTML = "";
    }
}

// ==========================================================================
// INITIALIZATION
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
    // Check security authentication first
    checkAuthStatus();

    // Bind security settings button
    const btnUpdatePw = document.getElementById("btn-update-password");
    if (btnUpdatePw) {
        btnUpdatePw.addEventListener("click", handlePasswordUpdate);
    }

    // Bind logout buttons
    const btnLogout = document.getElementById("btn-logout");
    if (btnLogout) {
        btnLogout.addEventListener("click", handleLogout);
    }
    const btnSidebarLogout = document.getElementById("btn-sidebar-logout");
    if (btnSidebarLogout) {
        btnSidebarLogout.addEventListener("click", handleLogout);
    }

    // Apply theme from localStorage immediately to prevent flashes on load
    const savedTheme = localStorage.getItem("app_theme");
    if (savedTheme) {
        applyTheme(savedTheme);
    }

    loadCapabilities().then(() => {
        initViews();
        initConsole();
        initEventListeners();
        initQueue();

        // Load settings and status immediately
        loadSettings().then(() => {
            triggerLaunchQuote();
            if (typeof loadDashboard === "function") {
                loadDashboard();
            }
        });
    });

    const themeSelect = document.getElementById("settings-app-theme");
    if (themeSelect) {
        themeSelect.addEventListener("change", async function() {
            const newTheme = this.value;
            applyTheme(newTheme);

            // Auto-save setting to backend settings.json
            if (currentSettings) {
                currentSettings.app_theme = newTheme;
                try {
                    const keyFields = [
                        "tmdb_api_key",
                        "tvdb_api_key",
                        "telegram_token",
                        "telegram_chat_id",
                        "whatsapp_apikey",
                        "whatsapp_phone"
                    ];
                    const payload = {
                        ...currentSettings,
                        app_theme: newTheme,
                        import_sources: (currentSettings.import_sources || []).filter(s => s.trim() !== ""),
                        sync_categories: (currentSettings.sync_categories || []).filter(c => c.id.trim() !== "" && c.name.trim() !== ""),
                        local_download_folders: (currentSettings.local_download_folders || []).filter(f => f.path && f.path.trim() !== "")
                    };
                    for (const k of keyFields) {
                        delete payload[k];
                    }
                    const response = await fetch("/api/settings", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    });
                    if (!response.ok) {
                        console.error("Fehler beim automatischen Speichern des Themes:", response.status, response.statusText);
                    }
                } catch (e) {
                    console.error("Fehler beim automatischen Speichern des Themes:", e);
                }
            }
        });
    }

    loadStatus();
    loadConversionRecommendations();
    initHealthDashboard();
    initDuplicateDashboard();
    initNormalizeTool();
    initNasRenamerTool();
    applyStorageTargetLabels();

    // Periodic status check (every 6 seconds)
    setInterval(loadStatus, 6000);

    setupNasFolderAutocomplete("series-nas-folder-override", "series-nas-folder-dropdown", "btn-load-nas-series", "series-nas-destination");
    setupNasFolderAutocomplete("yt-series-nas-folder-override", "yt-series-nas-folder-dropdown", "btn-load-yt-nas-series", "yt-nas-destination");

    // Register change listeners to update existing NAS seasons info
    const seriesNasDest = document.getElementById("series-nas-destination");
    if (seriesNasDest) {
        seriesNasDest.addEventListener("change", fetchNasSeasons);
    }
    const seriesOverrideInput = document.getElementById("series-nas-folder-override");
    if (seriesOverrideInput) {
        seriesOverrideInput.addEventListener("input", () => {
            window.nasFolderSelected = seriesOverrideInput.value;
        });
        seriesOverrideInput.addEventListener("change", () => {
            fetchNasSeasons();
            if (window.selectedShow) fetchEpisodes();
        });
    }

    const ytNasDest = document.getElementById("yt-nas-destination");
    if (ytNasDest) {
        ytNasDest.addEventListener("change", fetchYtNasSeasons);
    }
    const ytOverrideInput = document.getElementById("yt-series-nas-folder-override");
    if (ytOverrideInput) {
        ytOverrideInput.addEventListener("input", () => {
            window.ytNasFolderSelected = ytOverrideInput.value;
        });
        ytOverrideInput.addEventListener("change", fetchYtNasSeasons);
    }

    // Automatically match pCloud destination with NAS destination
    if (seriesNasDest) {
        seriesNasDest.addEventListener("change", (e) => {
            if (window.isProgrammaticCategoryChange) return;
            const pcloudDest = document.getElementById("series-pcloud-destination");
            if (pcloudDest) {
                pcloudDest.value = e.target.value;
                pcloudDest.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }
    if (ytNasDest) {
        ytNasDest.addEventListener("change", (e) => {
            if (window.isProgrammaticCategoryChange) return;
            const pcloudDest = document.getElementById("yt-pcloud-destination");
            if (pcloudDest) {
                pcloudDest.value = e.target.value;
                pcloudDest.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }
    const movieNasDest = document.getElementById("movie-nas-destination");
    if (movieNasDest) {
        movieNasDest.addEventListener("change", (e) => {
            if (window.isProgrammaticCategoryChange) return;
            const pcloudDest = document.getElementById("movie-pcloud-destination");
            if (pcloudDest) {
                pcloudDest.value = e.target.value;
                pcloudDest.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }

    // Initialize Onboarding Wizard, FAQ navigation and Tooltips
    initOnboardingWizard();
    initTooltips();
});

// ==========================================================================
// ONBOARDING WIZARD & TOOLTIPS (PHASE 3)
// ==========================================================================
async function initOnboardingWizard() {
    const overlay = document.getElementById("onboarding-wizard-overlay");
    if (!overlay) return;

    try {
        const response = await fetch('/api/onboarding/status');
        if (response.ok) {
            const data = await response.json();
            if (data.onboarded) {
                overlay.classList.add("hidden");
                return;
            } else {
                overlay.classList.remove("hidden");
                loadOnboardingFields();
            }
        }
    } catch (e) {
        console.error("Fehler beim Abrufen des Onboarding-Status:", e);
    }

    let currentStep = parseInt(localStorage.getItem('mw_onboarding_step') || '1');
    if (isNaN(currentStep) || currentStep < 1 || currentStep > 7) currentStep = 1;
    const totalSteps = 7;

    function showStep(stepNum) {
        document.querySelectorAll(".onboarding-step").forEach(step => {
            step.classList.add("hidden");
            step.classList.remove("active");
        });
        const targetStep = document.getElementById(`onboarding-step-${stepNum}`);
        if (targetStep) {
            targetStep.classList.remove("hidden");
            targetStep.classList.add("active");
        }

        document.querySelectorAll(".step-dot").forEach(dot => {
            const dStep = parseInt(dot.getAttribute("data-step"));
            dot.classList.remove("active", "completed");
            if (dStep === stepNum) {
                dot.classList.add("active");
            } else if (dStep < stepNum) {
                dot.classList.add("completed");
            }
        });

        currentStep = stepNum;
        localStorage.setItem('mw_onboarding_step', stepNum.toString());

        const resetBtn = document.getElementById("btn-onboarding-reset");
        if (resetBtn) {
            if (stepNum > 1) {
                resetBtn.classList.remove("hidden");
                resetBtn.style.display = "inline-block";
            } else {
                resetBtn.classList.add("hidden");
                resetBtn.style.display = "none";
            }
        }

        if (stepNum === 6) {
            checkOnboardingDependencies();
        }
    }

    const btnReset = document.getElementById("btn-onboarding-reset");
    if (btnReset) {
        btnReset.addEventListener("click", () => {
            if (confirm("Möchtest du das Onboarding wirklich von vorne beginnen? Bisherige Fortschritte werden zurückgesetzt.")) {
                localStorage.removeItem('mw_onboarding_step');
                showStep(1);
            }
        });
    }

    document.querySelectorAll(".btn-onboarding-prev").forEach(btn => {
        btn.addEventListener("click", () => {
            const target = parseInt(btn.getAttribute("data-target"));
            if (target >= 1 && target <= totalSteps) {
                showStep(target);
            }
        });
    });

    const btnNext1 = document.getElementById("btn-onboarding-next-1");
    if (btnNext1) {
        btnNext1.addEventListener("click", () => {
            showStep(2);
        });
    }

    const btnNext2 = document.getElementById("btn-onboarding-next-2");
    if (btnNext2) {
        btnNext2.addEventListener("click", async () => {
            const pwInput = document.getElementById("onboarding-password");
            const password = pwInput ? pwInput.value : "";

            if (password) {
                btnNext2.disabled = true;
                btnNext2.textContent = "Speichere...";
                try {
                    const res = await fetch('/api/onboarding/set-password', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ password: password })
                    });
                    const data = await res.json();
                    if (res.ok && data.status === 'success') {
                        document.cookie = `mw_csrf_token=${data.csrf_token}; path=/; SameSite=Strict`;
                        showStep(3);
                    } else {
                        alert("Fehler beim Speichern des Passworts: " + (data.error || "Unbekannter Fehler"));
                    }
                } catch (e) {
                    console.error("Error setting onboarding password:", e);
                    alert("Verbindungsfehler beim Passwort-Speichern.");
                } finally {
                    btnNext2.disabled = false;
                    btnNext2.textContent = "Weiter →";
                }
            } else {
                showStep(3);
            }
        });
    }

    const btnNext3 = document.getElementById("btn-onboarding-next-3");
    if (btnNext3) {
        btnNext3.addEventListener("click", async () => {
            const tmdbKey = document.getElementById("onboarding-tmdb-key")?.value.trim() || "";
            const tvdbKey = document.getElementById("onboarding-tvdb-key")?.value.trim() || "";
            if (tmdbKey || tvdbKey) {
                btnNext3.disabled = true;
                btnNext3.textContent = "Speichere...";
                try {
                    const keyPayload = {};
                    if (tmdbKey) keyPayload.TMDB_API_KEY = tmdbKey;
                    if (tvdbKey) keyPayload.TVDB_API_KEY = tvdbKey;

                    const res = await fetch('/api/keys', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(keyPayload)
                    });
                    if (res.ok) {
                        showStep(4);
                    } else {
                        const data = await res.json();
                        alert("Fehler beim Speichern des TMDB Keys: " + (data.error || "Unbekannter Fehler"));
                    }
                } catch (e) {
                    console.error("Error saving TMDB key:", e);
                    alert("Verbindungsfehler beim Speichern des Keys.");
                } finally {
                    btnNext3.disabled = false;
                    btnNext3.textContent = "Weiter →";
                }
            } else {
                showStep(4);
            }
        });
    }

    const btnNext4 = document.getElementById("btn-onboarding-next-4");
    if (btnNext4) {
        btnNext4.addEventListener("click", async () => {
            const nasIp = document.getElementById("onboarding-nas-ip").value.trim();
            const nasShare = document.getElementById("onboarding-nas-share").value.trim();
            const nasRoot = document.getElementById("onboarding-nas-root").value.trim();
            const nasHostname = document.getElementById("onboarding-nas-hostname").value.trim();

            const storage_targets = [
                {
                    id: "nas",
                    name: "NAS Server",
                    root_path: nasRoot,
                    nas_ip: nasIp,
                    nas_share: nasShare,
                    nas_hostname: nasHostname,
                    enabled: true
                }
            ];

            btnNext4.disabled = true;
            btnNext4.textContent = "Speichere...";
            try {
                const res = await fetch('/api/onboarding/setup-settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ storage_targets: storage_targets })
                });
                if (res.ok) {
                    showStep(5);
                } else {
                    const data = await res.json();
                    alert("Fehler beim Speichern der Speicherziele: " + (data.error || "Unbekannter Fehler"));
                }
            } catch (e) {
                console.error("Error saving storage targets:", e);
                alert("Verbindungsfehler.");
            } finally {
                btnNext4.disabled = false;
                btnNext4.textContent = "Weiter →";
            }
        });
    }

    const btnNext5 = document.getElementById("btn-onboarding-next-5");
    if (btnNext5) {
        btnNext5.addEventListener("click", async () => {
            const inboxDir = document.getElementById("onboarding-inbox-dir").value.trim();
            const outboxDir = document.getElementById("onboarding-outbox-dir").value.trim();
            const mediaServer = document.getElementById("onboarding-medienserver").value;

            if (!inboxDir || !outboxDir || !mediaServer) {
                alert("Bitte fülle alle Pflichtfelder aus (Inbox-Verzeichnis, Outbox-Verzeichnis, Medienserver).");
                return;
            }

            btnNext5.disabled = true;
            btnNext5.textContent = "Speichere...";
            try {
                const res = await fetch('/api/onboarding/setup-settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        inbox_dir: inboxDir,
                        outbox_dir: outboxDir,
                        media_server: mediaServer
                    })
                });
                if (res.ok) {
                    showStep(6);
                } else {
                    const data = await res.json();
                    alert("Fehler beim Speichern: " + (data.error || "Unbekannter Fehler"));
                }
            } catch (e) {
                console.error("Error saving paths:", e);
                alert("Verbindungsfehler.");
            } finally {
                btnNext5.disabled = false;
                btnNext5.textContent = "Weiter →";
            }
        });
    }

    const btnNext6 = document.getElementById("btn-onboarding-next-6");
    if (btnNext6) {
        btnNext6.addEventListener("click", () => {
            showStep(7);
        });
    }

    const btnFinish = document.getElementById("btn-onboarding-finish");
    if (btnFinish) {
        btnFinish.addEventListener("click", async () => {
            const telemetryChecked = document.getElementById("onboarding-telemetry").checked;
            btnFinish.disabled = true;
            btnFinish.textContent = "Schließe ab...";
            try {
                const res = await fetch('/api/onboarding/complete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telemetry_enabled: telemetryChecked })
                });
                if (res.ok) {
                    localStorage.removeItem('mw_onboarding_step');
                    overlay.classList.add("hidden");
                    window.location.reload();
                } else {
                    const data = await res.json();
                    alert("Fehler beim Abschließen des Setups: " + (data.error || "Unbekannter Fehler"));
                }
            } catch (e) {
                console.error("Error completing onboarding:", e);
                alert("Verbindungsfehler.");
            } finally {
                btnFinish.disabled = false;
                btnFinish.textContent = "Onboarding abschliessen";
            }
        });
    }

    const btnSkip = document.getElementById("btn-onboarding-skip");
    if (btnSkip) {
        btnSkip.addEventListener("click", async () => {
            if (!confirm("Bist du sicher, dass du das Onboarding überspringen möchtest? (Empfohlen nur für Experten)")) {
                return;
            }
            btnSkip.disabled = true;
            try {
                const res = await fetch('/api/onboarding/skip', { method: 'POST' });
                if (res.ok) {
                    localStorage.removeItem('mw_onboarding_step');
                    overlay.classList.add("hidden");
                    window.location.reload();
                } else {
                    const data = await res.json();
                    alert("Fehler beim Überspringen: " + (data.error || "Unbekannter Fehler"));
                }
            } catch (e) {
                console.error("Error skipping onboarding:", e);
                alert("Verbindungsfehler.");
            } finally {
                btnSkip.disabled = false;
            }
        });
    }

    const btnTestNas = document.getElementById("btn-onboarding-test-nas");
    if (btnTestNas) {
        btnTestNas.addEventListener("click", async () => {
            const nasIp = document.getElementById("onboarding-nas-ip").value.trim();
            const nasShare = document.getElementById("onboarding-nas-share").value.trim();
            const nasRoot = document.getElementById("onboarding-nas-root").value.trim();
            const nasHostname = document.getElementById("onboarding-nas-hostname").value.trim();
            const statusDiv = document.getElementById("onboarding-nas-test-status");

            if (window.AppCapabilities && window.AppCapabilities.runtime === "docker") {
                if (!nasRoot) {
                    if (statusDiv) {
                        statusDiv.textContent = "Bitte Einhängepfad (nasRoot) ausfüllen.";
                        statusDiv.style.color = "var(--danger)";
                    }
                    return;
                }
            } else {
                if (!nasIp || !nasShare || !nasRoot) {
                    if (statusDiv) {
                        statusDiv.textContent = "Bitte IP, Share und Einhängepfad ausfüllen.";
                        statusDiv.style.color = "var(--danger)";
                    }
                    return;
                }
            }

            if (statusDiv) {
                statusDiv.textContent = "Teste Verbindung...";
                statusDiv.style.color = "var(--text-muted)";
            }
            btnTestNas.disabled = true;

            try {
                const res = await fetch('/api/onboarding/test-nas-connection', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nas_ip: nasIp,
                        nas_share: nasShare,
                        root_path: nasRoot,
                        nas_hostname: nasHostname
                    })
                });
                const data = await res.json();
                if (statusDiv) {
                    statusDiv.textContent = data.message;
                    statusDiv.style.color = data.ok ? "var(--success)" : "var(--danger)";
                }
            } catch (e) {
                console.error("Error testing NAS connection:", e);
                if (statusDiv) {
                    statusDiv.textContent = "Fehler bei der Verbindung zum Backend.";
                    statusDiv.style.color = "var(--danger)";
                }
            } finally {
                btnTestNas.disabled = false;
            }
        });
    }

    const newsletterToggle = document.getElementById("onboarding-newsletter-toggle");
    const newsletterContainer = document.getElementById("onboarding-newsletter-email-container");
    if (newsletterToggle && newsletterContainer) {
        newsletterToggle.addEventListener("change", () => {
            if (newsletterToggle.checked) {
                newsletterContainer.classList.remove("hidden");
            } else {
                newsletterContainer.classList.add("hidden");
            }
        });
    }

    const btnRegisterEmail = document.getElementById("btn-onboarding-register-email");
    if (btnRegisterEmail) {
        btnRegisterEmail.addEventListener("click", async () => {
            const emailInput = document.getElementById("onboarding-newsletter-email");
            const email = emailInput ? emailInput.value.trim() : "";
            const statusDiv = document.getElementById("onboarding-newsletter-status");

            if (!email) {
                if (statusDiv) {
                    statusDiv.textContent = "Bitte E-Mail-Adresse eingeben.";
                    statusDiv.style.color = "var(--danger)";
                }
                return;
            }

            if (statusDiv) {
                statusDiv.textContent = "Registriere...";
                statusDiv.style.color = "var(--text-muted)";
            }
            btnRegisterEmail.disabled = true;

            try {
                const res = await fetch('/api/onboarding/register-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email })
                });
                const data = await res.json();
                if (res.ok) {
                    if (statusDiv) {
                        statusDiv.textContent = data.message || "Erfolgreich registriert!";
                        statusDiv.style.color = "var(--success)";
                    }
                    if (emailInput) emailInput.disabled = true;
                    btnRegisterEmail.disabled = true;
                } else {
                    if (statusDiv) {
                        statusDiv.textContent = data.error || "Fehler bei der Registrierung.";
                        statusDiv.style.color = "var(--danger)";
                    }
                    btnRegisterEmail.disabled = false;
                }
            } catch (e) {
                console.error("Error registering newsletter email:", e);
                if (statusDiv) {
                    statusDiv.textContent = "Verbindungsfehler.";
                    statusDiv.style.color = "var(--danger)";
                }
                btnRegisterEmail.disabled = false;
            }
        });
    }

    const btnCheckDeps = document.getElementById("btn-onboarding-check-deps");
    if (btnCheckDeps) {
        btnCheckDeps.addEventListener("click", checkOnboardingDependencies);
    }
}

async function loadOnboardingFields() {
    try {
        const keysRes = await fetch('/api/keys');
        if (keysRes.ok) {
            const keys = await keysRes.json();
            const tmdbInput = document.getElementById("onboarding-tmdb-key");
            if (tmdbInput && keys.TMDB_API_KEY && !keys.TMDB_API_KEY.includes("...")) {
                tmdbInput.value = keys.TMDB_API_KEY;
            }
            const tvdbInput = document.getElementById("onboarding-tvdb-key");
            if (tvdbInput && keys.TVDB_API_KEY && !keys.TVDB_API_KEY.includes("...")) {
                tvdbInput.value = keys.TVDB_API_KEY;
            }
        }
    } catch (e) {
        console.error("Error loading onboarding keys:", e);
    }
}

async function checkOnboardingDependencies() {
    const listContainer = document.getElementById("onboarding-dep-list");
    if (!listContainer) return;

    const renderOnboardingDepCard = (name, status) => {
        const statusLabels = {
            "missing": "Nicht installiert",
            "installed": "Bereit",
            "up_to_date": "Aktuell",
            "update_available": "Update verfügbar",
            "unknown": "Unbekannt"
        };
        const card = document.createElement("div");
        card.className = `dep-card status-${status}`;
        card.style.display = "flex";
        card.style.justifyContent = "space-between";
        card.style.alignItems = "center";
        card.style.padding = "10px 15px";
        card.style.background = "rgba(255,255,255,0.03)";
        card.style.border = "1px solid var(--border-light)";
        card.style.borderRadius = "var(--radius-sm)";
        card.style.marginBottom = "8px";

        const label = statusLabels[status] || status;
        const badgeColor = status === "missing" ? "var(--danger)" : "var(--success)";
        card.innerHTML = `
            <span style="font-weight: 600;">${name}</span>
            <span class="dep-badge" style="background: ${status === 'missing' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'}; color: ${badgeColor}; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 500;">${label}</span>
        `;
        listContainer.appendChild(card);
    };

    if (window.AppCapabilities && window.AppCapabilities.runtime === "docker") {
        listContainer.innerHTML = "";
        ["deno", "ffmpeg", "rclone", "yt-dlp"].forEach(name => renderOnboardingDepCard(name, "installed"));
        return;
    }

    listContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);"><span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-2" style="animation: spin 1s linear infinite; height: 12px; width: 12px; margin-right: 8px;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Abhängigkeiten werden geprüft...</span></div>';

    try {
        const response = await fetch('/api/check-dependencies?force=true');
        if (response.ok) {
            const data = await response.json();
            listContainer.innerHTML = "";
            for (const [name, info] of Object.entries(data)) {
                renderOnboardingDepCard(name, info.status);
            }
        } else {
            listContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--danger);">Fehler beim Abrufen des Status der Abhängigkeiten.</div>`;
        }
    } catch (e) {
        console.error("Error checking onboarding dependencies:", e);
        listContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--danger);">Verbindungsfehler: ${e.message}</div>`;
    }
}

// Tooltips Logic
function initTooltips() {
    const triggers = document.querySelectorAll(".tooltip-trigger");
    triggers.forEach(trigger => {
        const box = trigger.nextElementSibling;
        if (!box || !box.classList.contains("tooltip-box")) return;

        trigger.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleTooltip(trigger, box);
            }
        });

        trigger.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleTooltip(trigger, box);
        });
    });

    document.addEventListener("click", () => {
        closeAllTooltips();
    });
}

function toggleTooltip(trigger, box) {
    const container = trigger.closest(".tooltip-container");
    const isActive = container.classList.contains("active");

    closeAllTooltips();

    if (!isActive) {
        container.classList.add("active");
        trigger.setAttribute("aria-expanded", "true");
    }
}

function closeAllTooltips() {
    document.querySelectorAll(".tooltip-container").forEach(container => {
        container.classList.remove("active");
        const trigger = container.querySelector(".tooltip-trigger");
        if (trigger) trigger.setAttribute("aria-expanded", "false");
    });
}

// Central helper to create HSL gradient fallback artwork
function createFallbackPoster(title, isTv, width, height) {
    const fallback = document.createElement("div");
    fallback.className = "fallback-poster";

    let hash = 0;
    for (let i = 0; i < title.length; i++) {
        hash = title.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    fallback.style.background = `linear-gradient(135deg, hsl(${hue}, 45%, 16%) 0%, hsl(${(hue + 45) % 360}, 50%, 26%) 100%)`;

    const icon = document.createElement("div");
    icon.className = "fallback-poster-icon";
    icon.innerHTML = isTv
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-tv" style="height:28px; width:28px; color:var(--text-muted); opacity: 0.5;"><rect width="20" height="15" x="2" y="7" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-film" style="height:28px; width:28px; color:var(--text-muted); opacity: 0.5;"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M17 3v18"/><path d="M3 7h4"/><path d="M3 17h4"/><path d="M17 17h4"/><path d="M17 7h4"/><path d="M7 12h10"/></svg>`;

    const titleEl = document.createElement("p");
    titleEl.className = "fallback-poster-title";
    titleEl.textContent = title;

    fallback.appendChild(icon);
    fallback.appendChild(titleEl);

    fallback.style.width = width || "100%";
    fallback.style.height = height || "auto";
    return fallback;
}

window.AppCapabilities = {
    runtime: "desktop",
    dev_mode: false,
    capabilities: {
        open_local_folder: true,
        mount_nas: true,
        native_notifications: true,
        import_sources: true,
        browser_upload: false,
        safe_delete: true
    }
};

function loadCapabilities() {
    return fetch('/api/system/capabilities')
        .then(res => res.json())
        .then(data => {
            if (data.capabilities) {
                window.AppCapabilities = data;
                if (data.runtime === 'docker') {
                    document.body.classList.add('runtime-docker');

                    // Buttontexte für Docker-Modus anpassen
                    const btnOpenInbox = document.getElementById("btn-open-inbox");
                    if (btnOpenInbox) {
                        btnOpenInbox.innerHTML = btnOpenInbox.innerHTML.replace("Öffnen", "Ansehen");
                    }
                    const btnOpenOutbox = document.getElementById("btn-open-outbox");
                    if (btnOpenOutbox) {
                        btnOpenOutbox.innerHTML = btnOpenOutbox.innerHTML.replace("Öffnen", "Ansehen");
                    }

                    const headerBadge = document.getElementById("header-version-badge");
                    if (headerBadge) headerBadge.textContent = "v1.0 Docker/Server Edition";

                    const nasIpGroup = document.getElementById("onboarding-nas-ip-group");
                    if (nasIpGroup) nasIpGroup.classList.add("hidden");
                    const nasShareGroup = document.getElementById("onboarding-nas-share-group");
                    if (nasShareGroup) nasShareGroup.classList.add("hidden");
                    const nasHostnameGroup = document.getElementById("onboarding-nas-hostname-group");
                    if (nasHostnameGroup) nasHostnameGroup.classList.add("hidden");

                    const nasRootLabel = document.getElementById("onboarding-nas-root-label");
                    if (nasRootLabel) nasRootLabel.textContent = "Medien-Root im Container:";

                    const depDesc = document.getElementById("onboarding-dep-desc");
                    if (depDesc) depDesc.classList.add("hidden");
                    const dockerDepNote = document.getElementById("onboarding-docker-dep-note");
                    if (dockerDepNote) dockerDepNote.classList.remove("hidden");

                    const tooltipBox = document.querySelector(".tooltip-box");
                    if (tooltipBox) {
                        tooltipBox.textContent = "Der Container-Pfad, unter dem dein Medienordner im Docker-Container gemountet ist (z.B. /media).";
                    }
                    const rootInput = document.getElementById("onboarding-nas-root");
                    if (rootInput) {
                        rootInput.placeholder = "z.B. /media";
                        if (!rootInput.value) rootInput.value = "/media";
                    }
                    const testNasBtn = document.getElementById("btn-onboarding-test-nas");
                    if (testNasBtn) testNasBtn.textContent = "Medien-Root prüfen";
                    const inInput = document.getElementById("onboarding-inbox-dir");
                    if (inInput && !inInput.value) inInput.value = "/media/Input";
                    const outInput = document.getElementById("onboarding-outbox-dir");
                    if (outInput && !outInput.value) outInput.value = "/media/Output";

                    const finderElements = [
                        "btn-open-nas-folder-series",
                        "btn-settings-toggle-inbox",
                        "btn-settings-toggle-outbox",
                        "yt-open-losslesscut-container"
                    ];
                    finderElements.forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.style.display = 'none';
                    });

                    const losslessCutCheck = document.getElementById("yt-open-losslesscut");
                    if (losslessCutCheck) losslessCutCheck.checked = false;

                    const outboxFinder = document.getElementById("settings-open-outbox-finder");
                    if (outboxFinder) {
                        const group = outboxFinder.closest('.form-group');
                        if (group) group.style.display = 'none';
                    }

                    const notifyMacos = document.getElementById("settings-notify-macos");
                    if (notifyMacos) {
                        const group = notifyMacos.closest('.inline-style-130');
                        if (group) group.style.display = 'none';
                    }

                    const monitorNotifyMacos = document.getElementById("set-monitor-notify-macos");
                    if (monitorNotifyMacos) {
                        const label = monitorNotifyMacos.closest('label');
                        if (label) label.style.display = 'none';
                    }
                }

                // Hardware Encoding Diagnostics
                if (data.hardware_encoding_diagnostics) {
                    const diag = data.hardware_encoding_diagnostics;
                    const diagList = document.getElementById("hardware-diagnostics-list");
                    if (diagList) {
                        let html = '';

                        if (diag.dri_exists) {
                            html += '<div style="display: flex; align-items: center; gap: 10px;"><span class="status-indicator active" style="background-color: var(--success);"></span><span>Render-Geräte (/dev/dri/renderD*) gefunden.</span></div>';
                        } else {
                            html += '<div style="display: flex; align-items: center; gap: 10px;"><span class="status-indicator error" style="background-color: var(--danger);"></span><span>Keine Render-Geräte (/dev/dri/renderD*) gefunden.</span></div>';
                        }

                        if (diag.dri_exists) {
                            if (diag.dri_writable && diag.device_path) {
                                html += '<div style="display: flex; align-items: center; gap: 10px;"><span class="status-indicator active" style="background-color: var(--success);"></span><span>Lese-/Schreibzugriff auf ' + diag.device_path + ' erfolgreich.</span></div>';
                            } else {
                                html += '<div style="display: flex; align-items: center; gap: 10px;"><span class="status-indicator error" style="background-color: var(--danger);"></span><span>Fehlende Rechte auf /dev/dri. Bitte "devices" und "group_add" im Docker-Compose prüfen!</span></div>';
                            }
                        }

                        if (diag.dri_writable) {
                            if (diag.vaapi_probe_success) {
                                html += '<div style="display: flex; align-items: center; gap: 10px;"><span class="status-indicator active" style="background-color: var(--success);"></span><span>VAAPI Hardware-Encoding Probe erfolgreich. HEVC-Beschleunigung ist einsatzbereit. <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-zap" style="display:inline-block; vertical-align:middle; margin-left: 4px; color: var(--success);"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span></div>';
                            } else {
                                html += '<div style="display: flex; align-items: center; gap: 10px;"><span class="status-indicator error" style="background-color: var(--danger);"></span><span>VAAPI Probe fehlgeschlagen. Möglicherweise falsche Treiber (i915 vs xe) oder nicht unterstützte Hardware.</span></div>';
                            }
                        }

                        diagList.innerHTML = html;
                    }

                    const hwWarning = document.getElementById("hero-hw-warning");
                    if (hwWarning && data.runtime === 'docker' && (!diag.dri_writable || !diag.vaapi_probe_success)) {
                        const updateHwWarning = () => {
                            const movieConv = document.getElementById("movie-option-convert");
                            const seriesConv = document.getElementById("series-option-convert");
                            if ((movieConv && movieConv.checked) || (seriesConv && seriesConv.checked)) {
                                hwWarning.style.display = 'block';
                            } else {
                                hwWarning.style.display = 'none';
                            }
                        };

                        const movieConv = document.getElementById("movie-option-convert");
                        const seriesConv = document.getElementById("series-option-convert");
                        if (movieConv) movieConv.addEventListener("change", updateHwWarning);
                        if (seriesConv) seriesConv.addEventListener("change", updateHwWarning);

                        // Initial check
                        updateHwWarning();
                    }
                }

                // Dev Mode / Console visibility logic
                const devModeActive = !!data.dev_mode;

                if (typeof currentSettings !== "undefined" && currentSettings) {
                    applyConsoleVisibility(currentSettings.show_console || false);
                } else {
                    applyConsoleVisibility(false);
                }

                const showConsoleCheckbox = document.getElementById("settings-show-console");
                if (showConsoleCheckbox) {
                    const group = showConsoleCheckbox.closest('.form-group');
                    if (group) {
                        group.style.display = devModeActive ? '' : 'none';
                    }
                }
            }
        })
        .catch(err => {
            console.error("Failed to load capabilities", err);
        });
}

// Global variables Error Handler for CSS fallbacks
window.addEventListener('error', function (e) {
    if (e.target.tagName && e.target.tagName.toLowerCase() === 'img') {
        const img = e.target;
        if (img.classList.contains("poster-img") || img.getAttribute("data-fallback") === "true") {
            const title = img.getAttribute("alt") || img.getAttribute("data-title") || "Medienwerkzeug";
            const isTv = img.getAttribute("data-media-type") === "tv" || img.classList.contains("type-tv");
            const width = img.style.width || "100%";
            const height = img.style.height || "auto";

            const fallback = createFallbackPoster(title, isTv, width, height);
            img.replaceWith(fallback);
        }
    }
}, true);


// ==========================================================================
// NAS RENAMER TOOL
// ==========================================================================
let renamerPreviewPlan = [];

function initNasRenamerTool() {
    setupNasFolderAutocomplete("renamer-nas-folder", "renamer-nas-folder-dropdown", "btn-load-renamer-series", "renamer-nas-destination");

    const btnPreview = document.getElementById("btn-renamer-preview");
    if (btnPreview) btnPreview.addEventListener("click", loadNasRenamerPreview);

    const btnApply = document.getElementById("btn-renamer-apply");
    if (btnApply) btnApply.addEventListener("click", applyNasRenamer);

    const btnSelectAll = document.getElementById("btn-renamer-select-all");
    if (btnSelectAll) btnSelectAll.addEventListener("click", () => setNasRenamerSelection(true));

    const btnDeselectAll = document.getElementById("btn-renamer-deselect-all");
    if (btnDeselectAll) btnDeselectAll.addEventListener("click", () => setNasRenamerSelection(false));

    const btnRollback = document.getElementById("btn-renamer-rollback");
    if (btnRollback) btnRollback.addEventListener("click", rollbackNasRenamer);

    // Automatically fill Destination Dropdown
    const destSelect = document.getElementById("renamer-nas-destination");
    if (destSelect && typeof currentSettings !== "undefined" && currentSettings.sync_categories) {
        destSelect.innerHTML = currentSettings.sync_categories.map(c =>
            `<option value="${c.id}">${c.name} (${c.nas_sub})</option>`
        ).join("");
    }
}

async function loadNasRenamerPreview() {
    const statusEl = document.getElementById("renamer-status");
    const container = document.getElementById("renamer-preview-container");
    const tbody = document.getElementById("renamer-preview-tbody");

    const destId = document.getElementById("renamer-nas-destination").value;
    const folderName = document.getElementById("renamer-nas-folder").value.trim();

    if (!folderName) {
        if (statusEl) statusEl.textContent = "Bitte einen Ordnernamen angeben.";
        return;
    }

    if (statusEl) statusEl.textContent = "Scanne Ordner und lade Metadaten...";
    if (container) container.classList.add("hidden");
    if (tbody) tbody.innerHTML = "";

    try {
        const res = await fetch("/api/nas-renamer/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ destination_id: destId, folder_name: folderName })
        });
        const data = await res.json();

        if (data.status === "error") {
            if (statusEl) statusEl.innerHTML = `<span style="color: var(--danger);">${escapeHTML(data.message)}</span>`;
            return;
        }

        renamerPreviewPlan = data.items || [];
        renderNasRenamerPreview();

        if (statusEl) {
            statusEl.textContent = `Provider: ${data.provider} | ID: ${data.show_id} | ${renamerPreviewPlan.length} Video-Dateien gefunden.`;
        }
        if (container) container.classList.remove("hidden");

    } catch (e) {
        console.error("Error generating preview", e);
        if (statusEl) statusEl.textContent = "Fehler bei der Vorschau.";
    }
}

function renderNasRenamerPreview() {
    const tbody = document.getElementById("renamer-preview-tbody");
    if (!tbody) return;

    let html = "";
    let currentSeason = -1;

    renamerPreviewPlan.forEach((item, index) => {
        // Render season group header if season changed
        if (item.season !== null && item.season !== currentSeason) {
            currentSeason = item.season;
            html += `
                <tr style="background: rgba(255,255,255,0.05);">
                    <td colspan="5" style="padding: 8px;">
                        <label style="display:flex; align-items:center; gap:8px; font-weight:bold; cursor:pointer;">
                            <input type="checkbox" class="renamer-season-toggle" data-season="${currentSeason}" checked>
                            Staffel ${currentSeason}
                        </label>
                    </td>
                </tr>
            `;
        }

        let statusBadge = "";
        let isChecked = false;
        let isRowDisabled = false;
        let ext = item.current_filename.substring(item.current_filename.lastIndexOf('.'));

        if (item.status === "passt_bereits") {
            statusBadge = '<span style="color: var(--success); font-size: 0.85em; display: inline-flex; align-items: center; gap: 4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check" style="height: 12px; width: 12px;"><path d="M20 6 9 17l-5-5"/></svg>Passt</span>';
            isRowDisabled = true;
        } else if (item.status === "kein_treffer") {
            statusBadge = '<span style="color: var(--warning); font-size: 0.85em; display: inline-flex; align-items: center; gap: 4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle" style="height: 12px; width: 12px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>Kein Treffer</span>';
            // User requirement: Fallback input for manual assign
            // We'll replace the "Vorgeschlagener Pfad" with an input field
        } else {
            statusBadge = '<span style="color: var(--accent); font-size: 0.85em; display: inline-flex; align-items: center; gap: 4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-cw" style="height: 12px; width: 12px;"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>Anpassen</span>';
            isChecked = true;
        }

        let proposedHtml = "";
        if (item.status === "kein_treffer") {
            proposedHtml = `
                <div style="display: flex; gap: 5px; align-items: center;">
                    <input type="text" class="renamer-manual-input" data-idx="${index}" placeholder="z.B. S01E02 - Titel" style="width: 100%; padding: 4px; font-size: 0.85em; border-radius: 4px; border: 1px solid var(--border-light); background: var(--bg-surface);">
                    <span style="font-size: 0.85em; color: var(--text-muted);">${ext}</span>
                </div>
            `;
            // Uncheck by default if no match
            isChecked = false;
        } else {
            proposedHtml = `<span style="word-break: break-all;">${escapeHTML(item.proposed_rel_path)}</span>`;
        }

        const seBadge = (item.season !== null && item.episode !== null) ? `S${String(item.season).padStart(2,'0')}E${String(item.episode).padStart(2,'0')}` : "?";

        html += `
            <tr style="${isRowDisabled ? 'opacity: 0.6;' : ''}">
                <td style="text-align: center;">
                    <input type="checkbox" class="renamer-item-checkbox season-${currentSeason}" data-idx="${index}" ${isChecked ? 'checked' : ''} ${isRowDisabled ? 'disabled' : ''}>
                </td>
                <td>${statusBadge}</td>
                <td><span style="font-size: 0.8em; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">${seBadge}</span></td>
                <td style="word-break: break-all; font-size: 0.9em;">${escapeHTML(item.rel_path)}</td>
                <td style="font-size: 0.9em;">${proposedHtml}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    // Attach listeners
    tbody.querySelectorAll(".renamer-item-checkbox").forEach(cb => cb.addEventListener("change", updateNasRenamerApplyCount));

    tbody.querySelectorAll(".renamer-season-toggle").forEach(toggle => {
        toggle.addEventListener("change", (e) => {
            const season = e.target.getAttribute("data-season");
            const isChecked = e.target.checked;
            tbody.querySelectorAll(`.renamer-item-checkbox.season-${season}:not([disabled])`).forEach(cb => {
                cb.checked = isChecked;
            });
            updateNasRenamerApplyCount();
        });
    });

    tbody.querySelectorAll(".renamer-manual-input").forEach(input => {
        input.addEventListener("input", (e) => {
            const idx = e.target.getAttribute("data-idx");
            const cb = tbody.querySelector(`.renamer-item-checkbox[data-idx="${idx}"]`);
            if (e.target.value.trim() !== "") {
                cb.checked = true;

                // Update the plan data
                let ext = renamerPreviewPlan[idx].current_filename.substring(renamerPreviewPlan[idx].current_filename.lastIndexOf('.'));
                let targetDir = renamerPreviewPlan[idx].rel_path.substring(0, renamerPreviewPlan[idx].rel_path.lastIndexOf('/'));
                if (targetDir === renamerPreviewPlan[idx].rel_path) targetDir = "";

                renamerPreviewPlan[idx].proposed_rel_path = (targetDir ? targetDir + '/' : '') + e.target.value.trim() + ext;
                renamerPreviewPlan[idx].status = "manuell"; // Mark as manually edited

            } else {
                cb.checked = false;
            }
            updateNasRenamerApplyCount();
        });
    });

    updateNasRenamerApplyCount();
}

function setNasRenamerSelection(checked) {
    const tbody = document.getElementById("renamer-preview-tbody");
    if (!tbody) return;

    tbody.querySelectorAll(".renamer-item-checkbox:not([disabled])").forEach(cb => {
        cb.checked = checked;
    });
    tbody.querySelectorAll(".renamer-season-toggle").forEach(cb => {
        cb.checked = checked;
    });
    updateNasRenamerApplyCount();
}

function updateNasRenamerApplyCount() {
    const tbody = document.getElementById("renamer-preview-tbody");
    const applyBtn = document.getElementById("btn-renamer-apply");
    const countEl = document.getElementById("renamer-selected-count");
    if (!tbody || !applyBtn || !countEl) return;

    const checkedBoxes = Array.from(tbody.querySelectorAll(".renamer-item-checkbox:checked"));
    countEl.textContent = `${checkedBoxes.length} Dateien ausgewählt`;
    applyBtn.disabled = checkedBoxes.length === 0;
}

async function applyNasRenamer() {
    const tbody = document.getElementById("renamer-preview-tbody");
    const applyBtn = document.getElementById("btn-renamer-apply");
    const statusEl = document.getElementById("renamer-status");

    const destId = document.getElementById("renamer-nas-destination").value;
    const folderName = document.getElementById("renamer-nas-folder").value.trim();

    const checkedBoxes = Array.from(tbody.querySelectorAll(".renamer-item-checkbox:checked"));
    const planToApply = checkedBoxes.map(cb => {
        const idx = parseInt(cb.getAttribute("data-idx"));
        return renamerPreviewPlan[idx];
    });

    if (planToApply.length === 0) return;

    if (!confirm(`Sollen ${planToApply.length} Dateien jetzt umbenannt werden?`)) return;

    applyBtn.disabled = true;
    if (statusEl) statusEl.textContent = "Wende Umbenennungen an...";

    try {
        const res = await fetch("/api/nas-renamer/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                destination_id: destId,
                folder_name: folderName,
                rename_plan: planToApply
            })
        });
        const data = await res.json();

        if (data.status === "error") {
            if (statusEl) statusEl.innerHTML = `<span style="color: var(--danger);">Fehler: ${escapeHTML(data.message)}</span>`;
            applyBtn.disabled = false;
            return;
        }

        if (statusEl) {
            statusEl.innerHTML = `<span style="color: var(--success); display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle" style="height:12px; width:12px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>${data.success_count} Dateien erfolgreich umbenannt.</span>`;
            if (data.errors && data.errors.length > 0) {
                statusEl.innerHTML += `<br><span style="color: var(--warning);">${data.errors.length} Fehler aufgetreten (siehe Konsole).</span>`;
                console.warn("Renamer Errors:", data.errors);
            }
        }

        // Show Rollback Container
        const rollbackContainer = document.getElementById("renamer-rollback-container");
        const rollbackInfo = document.getElementById("renamer-last-transaction-info");
        if (rollbackContainer && rollbackInfo && data.transaction_id) {
            rollbackContainer.setAttribute("data-transaction-id", data.transaction_id);
            rollbackInfo.textContent = `Transaktions-ID: ${data.transaction_id}`;
            rollbackContainer.style.display = "block";
        }

        // Refresh preview
        setTimeout(loadNasRenamerPreview, 1000);

    } catch (e) {
        console.error("Error applying renames", e);
        if (statusEl) statusEl.textContent = "Netzwerkfehler beim Anwenden.";
        applyBtn.disabled = false;
    }
}

async function rollbackNasRenamer() {
    const rollbackContainer = document.getElementById("renamer-rollback-container");
    const transactionId = rollbackContainer.getAttribute("data-transaction-id");
    const statusEl = document.getElementById("renamer-status");

    if (!transactionId) return;

    if (!confirm("Sollen die letzten Umbenennungen wirklich rückgängig gemacht werden?")) return;

    if (statusEl) statusEl.textContent = "Führe Rollback aus...";

    try {
        const res = await fetch("/api/nas-renamer/rollback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transaction_id: transactionId })
        });
        const data = await res.json();

        if (data.status === "error") {
            if (statusEl) statusEl.innerHTML = `<span style="color: var(--danger);">Fehler beim Rollback: ${escapeHTML(data.message)}</span>`;
            return;
        }

        if (statusEl) {
            statusEl.innerHTML = `<span style="color: var(--success); display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle" style="height:12px; width:12px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>Rollback erfolgreich (${data.success_count} Dateien wiederhergestellt).</span>`;
        }

        rollbackContainer.style.display = "none";
        rollbackContainer.removeAttribute("data-transaction-id");

        // Refresh preview
        setTimeout(loadNasRenamerPreview, 1000);

    } catch (e) {
        console.error("Error during rollback", e);
        if (statusEl) statusEl.textContent = "Netzwerkfehler beim Rollback.";
    }
}
// ==========================================================================
// UTILS / HELPERS
// ==========================================================================

function scrollToDetailTop() {
    // 1. Scroll main window / document root (used in responsive/zoomed layouts)
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    // 2. Scroll the detail panel container (used in standard desktop layout)
    const detailContent = document.querySelector(".detail-content");
    if (detailContent) {
        detailContent.scrollTop = 0;
    }
}

// ==========================================================================
// VIEW ROUTING (MASTER-DETAIL)
// ==========================================================================
function initViews() {
    const goHome = () => {
        document.querySelectorAll(".project-item").forEach(item => item.classList.remove("active"));

        // Hide all views and show empty view (welcome homepage)
        document.querySelectorAll(".view-panel").forEach(p => {
            p.classList.add("hidden");
            p.classList.remove("active");
        });
        const emptyView = document.getElementById("view-empty");
        if (emptyView) {
            emptyView.classList.remove("hidden");
            emptyView.classList.add("active");
        }

        // Clear active project
        currentProject = "";

        // Refresh homepage data immediately
        loadStatus();
        if (typeof loadDashboard === "function") {
            loadDashboard();
        }

        // Reset scroll position to top
        scrollToDetailTop();
    };
    window.goHome = goHome;

    const btnHome = document.getElementById("master-btn-home");
    if(btnHome) {
        btnHome.addEventListener("click", goHome);
    }

    const modes = ["movie", "series", "tools"];
    modes.forEach(mode => {
        const card = document.getElementById(`mode-${mode}`);
        if(card) {
            card.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    card.click();
                }
            });
            card.addEventListener("click", () => {
                // UI styling
                modes.forEach(m => {
                    const el = document.getElementById(`mode-${m}`);
                    if (el) {
                        el.classList.remove("active");
                        el.setAttribute("aria-checked", "false");
                    }
                });
                card.classList.add("active");
                card.setAttribute("aria-checked", "true");

                document.querySelectorAll(".context-panel").forEach(c => c.classList.add("hidden"));

                // Reset/close collapsible details
                const movieDetails = document.getElementById("movie-nfo-details");
                if (movieDetails) movieDetails.removeAttribute("open");
                const seriesDetails = document.getElementById("series-nfo-details");
                if (seriesDetails) seriesDetails.removeAttribute("open");

                let ctxTarget = `context-${mode}`;
                const ctx = document.getElementById(ctxTarget);
                if(ctx) {
                    ctx.classList.remove("hidden");

                    // Autofill logic based on current project
                    let cleanedQuery = currentProjectSuggestedQuery || currentProject;
                    if (cleanedQuery) {
                        cleanedQuery = cleanedQuery.replace(/[._\-]/g, " ").trim();
                        cleanedQuery = cleanedQuery.replace(/\([0-9]{4}\)/g, "").trim();
                    }



                    if (mode === "movie") {
                        const isDoku = currentProjectIsDoku || (cleanedQuery && (cleanedQuery.toLowerCase().includes("doku") || cleanedQuery.toLowerCase().includes("dokumentation")));

                        if (isDoku) {
                            document.getElementById("context-movie-header").innerText = "Doku verarbeiten";
                            document.getElementById("movie-nas-destination").value = getCatIdBySub("/Dokus/Einzelne Dokus", "3");
                            document.getElementById("movie-pcloud-destination").value = getCatIdBySub("/Dokus/Einzelne Dokus", "3");
                        } else {
                            document.getElementById("context-movie-header").innerText = "Film verarbeiten";
                            document.getElementById("movie-nas-destination").value = getCatIdBySub("/Filme", "1");
                            document.getElementById("movie-pcloud-destination").value = getCatIdBySub("/Filme", "1");
                        }

                        document.getElementById("movie-search-query").value = cleanedQuery;
                        searchMovie();
                        updateSizeEstimation("movie");
                        triggerQualityHintUpdates();
                    } else if (mode === "series") {
                        document.getElementById("series-nas-destination").value = getCatIdBySub("/Serien", "2");
                        document.getElementById("series-pcloud-destination").value = getCatIdBySub("/Serien", "2");
                        document.getElementById("series-search-query").value = cleanedQuery;
                        detectExistingSeries(currentProject);
                        updateSizeEstimation("series");
                        triggerQualityHintUpdates();
                    }
                }
            });
        }
    });

    // Dashboard Nav
    const navDashboard = document.getElementById("nav-dashboard");

    // Tools Dashboard Nav
    const navTools = document.getElementById("nav-tools-dashboard");
    if(navTools) {
        navTools.addEventListener("click", () => {
            // Remove active from inbox items
            document.querySelectorAll(".project-item").forEach(item => item.classList.remove("active"));
            navTools.classList.add("active");
            if(navDashboard) navDashboard.classList.remove("active");

            // Show only tools view
            document.querySelectorAll(".view-panel").forEach(p => {
                p.classList.add("hidden");
                p.classList.remove("active");
            });
            const vt = document.getElementById("view-tools");
            if (vt) {
                vt.classList.remove("hidden");
                vt.classList.add("active");
            }
            scrollToDetailTop();

            // Auto-fill path if a project was selected
            const pathInput = document.getElementById("tools-target-path");
            if(currentProject && !pathInput.value) {
                pathInput.value = currentProject;
            }
        });
    }

    // YouTube Downloader Nav
    const navYtDownloader = document.getElementById("nav-youtube-downloader");
    if (navYtDownloader) {
        navYtDownloader.addEventListener("click", () => {
            document.querySelectorAll(".project-item").forEach(item => item.classList.remove("active"));
            navYtDownloader.classList.add("active");

            document.querySelectorAll(".view-panel").forEach(p => {
                p.classList.add("hidden");
                p.classList.remove("active");
            });
            const ytView = document.getElementById("view-youtube");
            if (ytView) {
                ytView.classList.remove("hidden");
                ytView.classList.add("active");
            }
            scrollToDetailTop();

            // Clear active project
            currentProject = "";
        });
    }

    // Click on top logo goes home
    const headerLogo = document.querySelector(".header-logo");
    if (headerLogo) {
        headerLogo.addEventListener("click", goHome);
    }

    // Quick YouTube Abos page link on Welcome Dashboard
    window.openYoutubeAbosPage = function() {
        document.querySelectorAll(".project-item").forEach(item => item.classList.remove("active"));
        const navDashboard = document.getElementById("nav-dashboard");
        if(navDashboard) navDashboard.classList.remove("active");
        const navTools = document.getElementById("nav-tools-dashboard");
        if(navTools) navTools.classList.remove("active");
        const navSettings = document.getElementById("nav-settings-dashboard");
        if(navSettings) navSettings.classList.remove("active");

        document.querySelectorAll(".view-panel").forEach(p => p.classList.add("hidden"));
        const abosView = document.getElementById("view-youtube-abos");
        if (abosView) {
            abosView.classList.remove("hidden");
            abosView.classList.add("active");
        }

        loadSubscriptions();
        scrollToDetailTop();
        currentProject = "";
    };

    const btnHeroYtAbos = document.getElementById("btn-hero-yt-abos");
    if (btnHeroYtAbos) {
        btnHeroYtAbos.addEventListener("click", window.openYoutubeAbosPage);
    }



    // Bibliothek & Wartung Nav (NAS-Check + Duplikate)
    const navLibrary = document.getElementById("nav-library");
    function openLibraryView() {
        document.querySelectorAll(".project-item").forEach(item => item.classList.remove("active"));
        if (navLibrary) navLibrary.classList.add("active");
        document.querySelectorAll(".view-panel").forEach(p => {
            p.classList.add("hidden");
            p.classList.remove("active");
        });
        const lib = document.getElementById("view-library");
        if (lib) { lib.classList.remove("hidden"); lib.classList.add("active"); }

        // Reset tabs to Overview and Subtab to Structure
        if (typeof window.switchLibraryTab === "function") {
            window.switchLibraryTab("overview");
        }
        if (typeof window.switchLibrarySubTab === "function") {
            window.switchLibrarySubTab("structure");
        }

        // Gecachte Scan-Ergebnisse beim Öffnen aktualisieren
        if (typeof pollHealthStatus === "function") pollHealthStatus(false);
        if (typeof pollDuplicateStatus === "function") pollDuplicateStatus(false);
        scrollToDetailTop();
    }
    window.openLibraryView = openLibraryView;
    if (navLibrary) navLibrary.addEventListener("click", openLibraryView);
    const cardHeroLibrary = document.getElementById("card-hero-library");
    if (cardHeroLibrary) cardHeroLibrary.addEventListener("click", openLibraryView);
    const btnHomeOpenLibrary = document.getElementById("btn-home-open-library");
    if (btnHomeOpenLibrary) btnHomeOpenLibrary.addEventListener("click", openLibraryView);

    // Settings Dashboard Nav
    const navSettings = document.getElementById("nav-settings-dashboard");
    if(navSettings) {
        navSettings.addEventListener("click", () => {
            document.querySelectorAll(".project-item").forEach(item => item.classList.remove("active"));
            navSettings.classList.add("active");
            if(navDashboard) navDashboard.classList.remove("active");
            if(navTools) navTools.classList.remove("active");
            if(navFaq) navFaq.classList.remove("active");

            document.querySelectorAll(".view-panel").forEach(p => {
                p.classList.add("hidden");
                p.classList.remove("active");
            });
            const vs = document.getElementById("view-settings");
            if (vs) {
                vs.classList.remove("hidden");
                vs.classList.add("active");
            }

            loadSettings();
            scrollToDetailTop();
        });
    }

    // Hilfe & FAQ Nav
    const navFaq = document.getElementById("nav-faq");
    if(navFaq) {
        navFaq.addEventListener("click", () => {
            document.querySelectorAll(".project-item").forEach(item => item.classList.remove("active"));
            navFaq.classList.add("active");
            if(navDashboard) navDashboard.classList.remove("active");
            if(navTools) navTools.classList.remove("active");
            if(navSettings) navSettings.classList.remove("active");

            document.querySelectorAll(".view-panel").forEach(p => {
                p.classList.add("hidden");
                p.classList.remove("active");
            });
            const faqView = document.getElementById("view-faq");
            if (faqView) {
                faqView.classList.remove("hidden");
                faqView.classList.add("active");
            }
            scrollToDetailTop();
            currentProject = "";
        });
    }

    // Set up collapsible sidebar sections
    setupCollapsibleSections();
}

function setupCollapsibleSections() {
    document.querySelectorAll(".collapsible-section").forEach(sec => {
        const header = sec.querySelector(".section-header");
        const content = sec.querySelector(".section-content");
        if (!header || !content) return;

        const secId = sec.id;

        // Restore expanded state from localStorage (default to false - collapsed by default)
        // For project folders, we always start collapsed on page load
        const isExpanded = secId === "section-project-folders" ? false : (localStorage.getItem(`expanded_${secId}`) === "true");
        if (isExpanded) {
            sec.classList.add("expanded");
            content.style.maxHeight = "none";
            content.style.opacity = "1";
        } else {
            sec.classList.remove("expanded");
            content.style.maxHeight = "0px";
            content.style.opacity = "0";
        }

        // Toggle function using dynamic heights for a perfectly smooth transition
        const toggleSection = (forceState) => {
            const willExpand = forceState !== undefined ? forceState : !sec.classList.contains("expanded");

            if (willExpand) {
                sec.classList.add("expanded");
                // Animate to scrollHeight
                content.style.maxHeight = content.scrollHeight + "px";
                content.style.opacity = "1";
                localStorage.setItem(`expanded_${secId}`, "true");

                // Allow overflow-y visible once transition completes so content layout works properly
                setTimeout(() => {
                    if (sec.classList.contains("expanded")) {
                        content.style.maxHeight = "none";
                    }
                }, 1200);
            } else {
                // Set explicit height to start transition
                content.style.maxHeight = content.scrollHeight + "px";
                // Force layout reflow
                content.offsetHeight;

                sec.classList.remove("expanded");
                content.style.maxHeight = "0px";
                content.style.opacity = "0";
                localStorage.setItem(`expanded_${secId}`, "false");
            }
        };

        header.addEventListener("click", () => toggleSection());

        // Expose toggle control for startpage interaction
        sec.toggleSection = toggleSection;
    });
}

// ==========================================================================
// CONSOLE / TERMINAL LOGS
// ==========================================================================
function initConsole() {
    const consoleHeader = document.getElementById("console-header-toggle");
    const appConsole = document.getElementById("app-console");
    const toggleIcon = document.getElementById("console-toggle-btn-icon");
    const clearBtn = document.getElementById("btn-clear-console");

    consoleHeader.addEventListener("click", (e) => {
        // Prevent toggle if clicking on clear button
        if (e.target === clearBtn) return;

        const devModeActive = window.AppCapabilities && window.AppCapabilities.dev_mode;
        if (!devModeActive) return;

        if (appConsole.classList.contains("collapsed")) {
            appConsole.classList.remove("collapsed");
            appConsole.classList.add("expanded");
            toggleIcon.textContent = "▼";
            document.documentElement.style.setProperty('--console-height', '320px');
        } else {
            appConsole.classList.remove("expanded");
            appConsole.classList.add("collapsed");
            toggleIcon.textContent = "▲";
            document.documentElement.style.setProperty('--console-height', '40px');
        }
    });

    clearBtn.addEventListener("click", () => {
        const consoleBody = document.getElementById("console-body-text");
        consoleBody.innerHTML = '<div class="console-line system-line">[System]: Konsole geleert.</div>';
    });

    const showConsoleCheckbox = document.getElementById("settings-show-console");
    if (showConsoleCheckbox) {
        showConsoleCheckbox.addEventListener("change", (e) => {
            applyConsoleVisibility(e.target.checked);
        });
    }
}

function applyConsoleVisibility(show) {
    const appConsole = document.getElementById("app-console");
    if (!appConsole) return;

    const devModeActive = window.AppCapabilities && window.AppCapabilities.dev_mode;

    if (show && devModeActive) {
        appConsole.classList.remove("hidden-console");
        if (appConsole.classList.contains("expanded")) {
            document.documentElement.style.setProperty('--console-height', '320px');
        } else {
            document.documentElement.style.setProperty('--console-height', '40px');
        }
    } else {
        appConsole.classList.add("hidden-console");
        document.documentElement.style.setProperty('--console-height', '0px');
    }
}

function expandConsole() {
    const devModeActive = window.AppCapabilities && window.AppCapabilities.dev_mode;
    if (!devModeActive) {
        return;
    }
    const showConsoleCheckbox = document.getElementById("settings-show-console");
    if (showConsoleCheckbox && !showConsoleCheckbox.checked) {
        return;
    }
    const appConsole = document.getElementById("app-console");
    const toggleIcon = document.getElementById("console-toggle-btn-icon");
    if (appConsole.classList.contains("collapsed")) {
        appConsole.classList.remove("collapsed");
        appConsole.classList.add("expanded");
        toggleIcon.textContent = "▼";
        document.documentElement.style.setProperty('--console-height', '320px');
    }
}

function appendConsoleLog(line) {
    const consoleBody = document.getElementById("console-body-text");
    const div = document.createElement("div");
    div.className = "console-line";

    // Styling special logs
    if (line.startsWith("[System]") || line.startsWith("===")) {
        div.classList.add("system-line");
    } else if (line.includes("❌") || line.toLowerCase().includes("error") || line.toLowerCase().includes("fehler")) {
        div.style.color = "var(--danger)";
    } else if (line.includes("✅") || line.includes("successful") || line.includes("erfolgreich")) {
        div.style.color = "var(--success)";
    } else if (line.includes("⏳") || line.includes("convert") || line.includes("konvertiere")) {
        div.style.color = "var(--warning)";
    }

    div.textContent = line;
    consoleBody.appendChild(div);
    consoleBody.scrollTop = consoleBody.scrollHeight;
}

function connectLogStream() {
    if (eventSource) {
        eventSource.close();
    }

    const pulse = document.getElementById("console-pulse");
    pulse.classList.remove("hidden");

    eventSource = new EventSource("/api/logs");
    eventSource.onmessage = function(event) {
        appendConsoleLog(event.data);

        if (event.data.includes("=== VORGANG BEENDET ===")) {
            pulse.classList.add("hidden");
            eventSource.close();
            // Refresh status
            setTimeout(loadStatus, 2000);
            if (currentProject) {
                setTimeout(() => scanProject(currentProject), 2000);
            }
        }
    };

    eventSource.onerror = function() {
        pulse.classList.add("hidden");
        if (eventSource) {
            eventSource.close();
        }
    };
}

// ==========================================================================
// STATUS & BADGES
// ==========================================================================
async function loadStatus(forceNasCheck = false) {
    if (document.hidden) return;
    if (document.visibilityState === "hidden") return;
    try {
        const url = forceNasCheck ? "/api/status?force_nas_check=true" : "/api/status";
        const response = await fetch(url);
        if (!response.ok) return;
        const data = await response.json();

        // Update NAS Badge
        const nasBadge = document.getElementById("nas-badge");
        const connectNasBtn = document.getElementById("btn-connect-nas");
        nasBadge.className = "status-badge";
        if (data.nas_status === "connected") {
            nasBadge.textContent = "Verbunden";
            nasBadge.classList.add("online");
            connectNasBtn?.classList.add("hidden");
        } else if (data.nas_status === "connected_but_no_library_paths") {
            nasBadge.textContent = "Unvollständig";
            nasBadge.classList.add("warning");
            connectNasBtn?.classList.add("hidden");
        } else if (data.nas_status === "available_not_mounted") {
            nasBadge.textContent = "Bereit (Nicht gemountet)";
            nasBadge.classList.add("warning");
            connectNasBtn?.classList.remove("hidden");
        } else {
            nasBadge.textContent = "Offline";
            nasBadge.classList.add("offline");
            connectNasBtn?.classList.remove("hidden");
        }

        // Update StreamFab Badge
        const sfBadge = document.getElementById("streamfab-badge");
        const sfBtn = document.getElementById("btn-streamfab-import");
        if (data.streamfab_downloads && data.streamfab_downloads.length > 0) {
            sfBadge.textContent = `${data.streamfab_downloads.length} Datei(en)`;
            sfBadge.className = "status-badge warning";
            sfBtn.classList.remove("hidden");
        } else {
            sfBadge.textContent = "Leer";
            sfBadge.className = "status-badge neutral";
            sfBtn.classList.add("hidden");
        }

        // Render project lists (sidebar)
        renderProjectList(data.projects, data.project_types);

        // Update Welcome Dashboard if elements exist (includes folder-size warnings)
        if (typeof updateHomepageData === "function") {
            updateHomepageData(data);
        }

    } catch (e) {
        console.error("Error fetching status:", e);
    }
}

let activeProjectsProcessing = new Set();
let lastProjectListJson = "";
let lastActiveProject = "";

function renderProjectList(projects, projectTypes) {
    const currentJson = JSON.stringify({ projects, projectTypes });
    if (currentJson === lastProjectListJson && currentProject === lastActiveProject) {
        return; // Skip DOM update if data hasn't changed
    }
    lastProjectListJson = currentJson;
    lastActiveProject = currentProject;
    const container = document.getElementById("project-list-container");
    if (!container) return;
    const countEl = document.getElementById("project-folders-count");
    if (countEl) {
        countEl.textContent = projects.length;
    }

    if (projects.length === 0) {
        container.innerHTML = '<p class="text-muted text-center" style="padding: 20px;">Keine Ordner in der Inbox</p>';
        return;
    }

    // Save current active list name to keep it selected
    let html = `
        <button class="project-item ${currentProject === "" ? "active" : ""}" data-project="">
            <span class="project-item-name">
                <span class="nav-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-inbox" style="height:14px; width:14px; color:var(--accent);"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg></span>
                <span class="nav-label">Unsortierte Einzeldateien</span>
            </span>
        </button>
        <button class="project-item ${currentProject === "__inbox_recursive__" ? "active" : ""}" data-project="__inbox_recursive__">
            <span class="project-item-name">
                <span class="nav-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-open" style="height:14px; width:14px; color:var(--accent);"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg></span>
                <span class="nav-label">Alle Dateien (inkl. Unterordner)</span>
            </span>
        </button>
    `;

    projects.forEach(p => {
        let name = p;
        let isDir = true;
        if (p && typeof p === 'object') {
            name = p.name;
            isDir = p.is_directory;
        } else if (projectTypes && projectTypes[p] !== undefined) {
            isDir = projectTypes[p];
        }
        const escapedP = escapeHTML(name);
        const icon = isDir ? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder" style="height:14px; width:14px; color:var(--accent); pointer-events: none;"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/></svg>` : `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-video" style="height:14px; width:14px; color:var(--accent); pointer-events: none;"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>`;
        const deleteTitle = isDir ? "Ordner in Quarantäne verschieben" : "Datei in Quarantäne verschieben";
        html += `
            <button class="project-item ${currentProject === name ? "active" : ""}" data-project="${escapedP}" data-is-dir="${isDir}" draggable="true">
                <span class="project-item-name">
                    <span class="nav-icon" aria-hidden="true">${icon}</span>
                    <span class="nav-label">${escapedP}</span>
                </span>
                <span class="project-item-delete" title="${deleteTitle}" data-project="${escapedP}" data-is-dir="${isDir}"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2" style="height:13px; width:13px; color:#ef4444; pointer-events: none;"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg></span>
            </button>
        `;
    });

    container.innerHTML = html;

    // Bind click events
    container.querySelectorAll(".project-item").forEach(item => {
        item.addEventListener("click", (e) => {
            // Prevent selecting the project if delete icon was clicked
            if (e.target.classList.contains("project-item-delete")) {
                return;
            }
            const p = item.getAttribute("data-project");
            selectProject(p);
        });
    });

    // Bind delete events
    container.querySelectorAll(".project-item-delete").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const p = btn.getAttribute("data-project");
            const isDir = btn.getAttribute("data-is-dir") !== "false";
            const typeStr = isDir ? "Ordner" : "Datei";
            const confirmMsg = isDir
                ? `Möchtest du den Ordner "${p}" und alle darin enthaltenen Dateien wirklich in Quarantäne verschieben?`
                : `Möchtest du die Datei "${p}" wirklich in Quarantäne verschieben?`;
            if (confirm(confirmMsg)) {
                await deleteProject(p);
            }
        });
    });

    updateSidebarProcessingStates(activeProjectsProcessing);
}

function updateSidebarProcessingStates(activeProjects) {
    if (!activeProjects) activeProjects = new Set();

    const items = document.querySelectorAll("#project-list-container .project-item");
    items.forEach(item => {
        const p = item.getAttribute("data-project") || "";
        const iconEl = item.querySelector(".nav-icon");
        const deleteEl = item.querySelector(".project-item-delete");
        const isProcessing = activeProjects.has(p);

        if (isProcessing) {
            item.classList.add("processing");
            if (iconEl) {
                iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-2 spinning-icon" style="height:14px; width:14px;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
                iconEl.classList.add("spinning-icon");
            }
            if (deleteEl) {
                deleteEl.style.display = "none";
            }
        } else {
            item.classList.remove("processing");
            if (iconEl) {
                const isDir = item.getAttribute("data-is-dir") !== "false";
                if (p === "") {
                    iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-inbox" style="height:14px; width:14px; color:var(--accent);"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`;
                } else if (p === "__inbox_recursive__") {
                    iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-open" style="height:14px; width:14px; color:var(--accent);"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>`;
                } else if (isDir) {
                    iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder" style="height:14px; width:14px; color:var(--accent);"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`;
                } else {
                    iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-video" style="height:14px; width:14px; color:var(--accent);"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>`;
                }
                iconEl.classList.remove("spinning-icon");
            }
            if (deleteEl) {
                deleteEl.style.display = "";
            }
        }
    });

    updateProjectProcessingStatus(activeProjects);
}

function updateProjectProcessingStatus(activeProjects) {
    if (!activeProjects) activeProjects = new Set();

    const isCurrentProcessing = activeProjects.has(currentProject || "");
    const warningEl = document.getElementById("project-processing-warning");
    const modeSelector = document.getElementById("folder-mode-selector");
    const cleanBtn = document.getElementById("btn-clean-project");

    if (warningEl) {
        if (isCurrentProcessing) {
            warningEl.classList.remove("hidden");
        } else {
            warningEl.classList.add("hidden");
        }
    }

    if (modeSelector) {
        if (isCurrentProcessing) {
            modeSelector.style.opacity = "0.5";
            modeSelector.style.pointerEvents = "none";
        } else {
            modeSelector.style.opacity = "1.0";
            modeSelector.style.pointerEvents = "auto";
        }
    }

    if (cleanBtn) {
        if (isCurrentProcessing) {
            cleanBtn.style.opacity = "0.5";
            cleanBtn.style.pointerEvents = "none";
        } else {
            cleanBtn.style.opacity = "1.0";
            cleanBtn.style.pointerEvents = "auto";
        }
    }

    // Update Smart Inbox items in DOM reactively
    const smartItems = document.querySelectorAll("#smart-inbox-list .smart-inbox-item");
    smartItems.forEach(item => {
        const p = item.getAttribute("data-project") || "";
        const isProcessing = activeProjects.has(p);
        const btn = item.querySelector(".btn-select-smart");
        const deleteBtn = item.querySelector(".btn-delete-smart");

        if (isProcessing) {
            item.style.border = "1px solid rgba(0, 229, 255, 0.3)";
            item.style.background = "rgba(0, 229, 255, 0.03)";
        } else {
            item.style.border = "1px solid var(--border-light)";
            item.style.background = "rgba(255,255,255,0.02)";
        }

        if (deleteBtn) {
            deleteBtn.disabled = isProcessing;
            if (isProcessing) {
                deleteBtn.style.opacity = "0.5";
                deleteBtn.style.cursor = "not-allowed";
                deleteBtn.onclick = null;
            } else {
                deleteBtn.style.opacity = "1";
                deleteBtn.style.cursor = "pointer";
                deleteBtn.onclick = () => {
                    if (confirm(`Möchtest du das gesamte Inbox-Projekt "${p}" wirklich in die Quarantäne verschieben?`)) {
                        deleteProject(p);
                    }
                };
            }
        }

        configureSmartInboxButton(btn, p, isProcessing);
    });
}

function configureSmartInboxButton(btn, projectName, isProcessing) {
    if (!btn) return;

    btn.className = `btn ${isProcessing ? "btn-secondary" : "btn-primary"} btn-sm btn-select-smart`;
    btn.style.whiteSpace = "nowrap";
    btn.style.cursor = isProcessing ? "not-allowed" : "";
    btn.style.opacity = isProcessing ? "0.7" : "";
    btn.disabled = isProcessing;
    btn.innerHTML = isProcessing
        ? `<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-2" style="animation: spin 1s linear infinite; height: 12px; width: 12px;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>In Bearbeitung...</span>`
        : `<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-zap" style="height: 12px; width: 12px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>Auswählen</span>`;
    btn.onclick = isProcessing
        ? null
        : () => handleSmartInboxClick(
            projectName,
            btn.getAttribute("data-media-type") || "",
            btn.getAttribute("data-suggested-query") || ""
        );
}

async function deleteProject(project) {
    try {
        const response = await fetch("/api/delete-project", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ project })
        });
        const data = await response.json();
        if (data.status === "success") {
            appendConsoleLog(`Ordner "${project}" wurde erfolgreich in Quarantäne verschoben.`);
            alert(`Ordner "${project}" wurde erfolgreich in Quarantäne verschoben.`);
            if (currentProject === project) {
                selectProject("");
            }
            await loadStatus();
        } else {
            alert(`Fehler beim Verschieben des Ordners in Quarantäne: ${data.error}`);
        }
    } catch (e) {
        console.error("Error deleting project:", e);
        alert(`Netzwerkfehler beim Verschieben des Ordners in Quarantäne.`);
    }
}

async function splitProjectFile(project, fileName) {
    if (!confirm(`Möchtest du die Datei "${fileName}" und alle zugehörigen Begleitdateien in ein separates Projekt abspalten?`)) {
        return;
    }

    try {
        const response = await fetch("/api/split-project-file", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ project, file_name: fileName })
        });
        const data = await response.json();
        if (data.status === "success") {
            appendConsoleLog(`✂️ Datei "${fileName}" wurde in das Projekt "${data.new_project}" abgespalten.`);
            await loadStatus();
            if (data.new_project) {
                selectProject(data.new_project);
            } else {
                selectProject(currentProject);
            }
        } else {
            alert(`Fehler beim Trennen der Datei: ${data.error}`);
        }
    } catch (e) {
        console.error("Error splitting project file:", e);
        alert(`Netzwerkfehler beim Trennen der Datei.`);
    }
}

// ==========================================================================
// SIZE ESTIMATION FOR H.265 CONVERSION
// ==========================================================================


async function updateSizeEstimation(mediaType) {
    const panelId = mediaType === "movie" ? "movie-size-estimate-panel" : "series-size-estimate-panel";
    const textId = mediaType === "movie" ? "movie-size-estimate-text" : "series-size-estimate-text";
    const convertId = mediaType === "movie" ? "movie-option-convert" : "series-option-convert";

    const panel = document.getElementById(panelId);
    const textEl = document.getElementById(textId);
    const convertCb = document.getElementById(convertId);

    if (!panel || !textEl || !convertCb) return;

    const sliderContainerId = mediaType === "movie" ? "movie-quality-slider-container" : "series-quality-slider-container";
    const sliderContainer = document.getElementById(sliderContainerId);

    if (!convertCb.checked) {
        panel.classList.add("hidden");
        if (sliderContainer) sliderContainer.classList.add("hidden");
        return;
    }

    if (sliderContainer) sliderContainer.classList.remove("hidden");

    // Check if we have video files
    const videoFiles = projectFiles.filter(f => {
        const isDir = f.endsWith("/");
        if (isDir) return false;
        const ext = f.split('.').pop().toLowerCase();
        return ['mp4', 'mkv', 'avi', 'webm', 'mov'].includes(ext);
    });

    if (videoFiles.length === 0) {
        panel.classList.add("hidden");
        return;
    }

    const sliderId = mediaType === "movie" ? "movie-quality-slider" : "series-quality-slider";
    const sliderInput = document.getElementById(sliderId);
    const qualityVal = sliderInput ? parseInt(sliderInput.value, 10) : 60;

    panel.classList.remove("hidden");
    if (mediaType === "movie") {
        textEl.textContent = "Dateigrößen-Prognose: Test-Konvertierung läuft für präzise Schätzung (ca. 15 Sek.)...";
    } else {
        textEl.textContent = "Dateigrößen-Prognose: Test-Konvertierung der ersten Folge läuft (ca. 15 Sek.)...";
    }

    try {
        const response = await fetch("/api/estimate-conversion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                project_name: currentProject,
                filenames: videoFiles,
                quality: qualityVal
            })
        });

        if (!response.ok) {
            textEl.textContent = "Dateigrößen-Prognose: Fehler bei der Berechnung";
            return;
        }

        const data = await response.json();
        const estimates = data.estimates || {};

        let totalSizeIn = 0;
        let totalSizeOut = 0;
        let successCount = 0;

        for (const [file, est] of Object.entries(estimates)) {
            if (est.size_in !== undefined && est.size_out !== undefined) {
                totalSizeIn += est.size_in;
                totalSizeOut += est.size_out;
                successCount++;
            }
        }

        if (successCount > 0 && totalSizeIn > 0) {
            const savings = totalSizeIn - totalSizeOut;
            const pct = Math.round((savings / totalSizeIn) * 100);

            const inStr = formatBytes(totalSizeIn);
            const outStr = formatBytes(totalSizeOut);

            textEl.textContent = `Voraussichtliche Ersparnis: ${inStr} → ~${outStr} (-${pct}%)`;
        } else {
            textEl.textContent = "Dateigrößen-Prognose nicht verfügbar";
        }

    } catch (e) {
        console.error("Error updating size estimation:", e);
        textEl.textContent = "Dateigrößen-Prognose: Verbindungsfehler";
    }
}

// ==========================================================================
// INBOX FILES SCANNING
// ==========================================================================
function selectProject(projectName, isDir = true) {
    currentProject = projectName;
    window.isNfoAgentMode = false;

    window.nasFolderSelected = null;
    window.ytNasFolderSelected = null;

    // Reset local profile search
    const profileSearchInput = document.getElementById("series-local-profile-search");
    if (profileSearchInput) {
        profileSearchInput.value = "";
    }
    if (typeof allLocalProfiles !== "undefined") {
        renderLocalProfilesDropdown(allLocalProfiles);
    }

    // Reset manual mode variables
    isManualMovieMode = false;
    isManualSeriesMode = false;

    const manualMovieContainer = document.getElementById("manual-movie-container");
    if (manualMovieContainer) manualMovieContainer.classList.add("hidden");
    const manualSeriesContainer = document.getElementById("manual-series-container");
    if (manualSeriesContainer) manualSeriesContainer.classList.add("hidden");

    const btnManualMovie = document.getElementById("btn-manual-movie");
    if (btnManualMovie) {
        btnManualMovie.classList.remove("active");
        btnManualMovie.textContent = "Manuell eintragen";
    }
    const btnManualSeries = document.getElementById("btn-manual-series");
    if (btnManualSeries) {
        btnManualSeries.classList.remove("active");
        btnManualSeries.textContent = "Manuell eintragen";
    }

    const mMovieTitle = document.getElementById("manual-movie-title");
    if (mMovieTitle) mMovieTitle.value = "";
    const mMovieYear = document.getElementById("manual-movie-year");
    if (mMovieYear) mMovieYear.value = "";
    const mMoviePlot = document.getElementById("manual-movie-plot");
    if (mMoviePlot) mMoviePlot.value = "";
    const mSeriesTitle = document.getElementById("manual-series-title");
    if (mSeriesTitle) mSeriesTitle.value = "";
    const mSeriesPlot = document.getElementById("manual-series-plot");
    if (mSeriesPlot) mSeriesPlot.value = "";

    selectedMovie = null;
    selectedShow = null;
    const moviePanel = document.getElementById("selected-movie-panel");
    if (moviePanel) moviePanel.classList.add("hidden");
    const showPanel = document.getElementById("selected-show-panel");
    if (showPanel) showPanel.classList.add("hidden");
    const movieResults = document.getElementById("movie-search-results");
    if (movieResults) movieResults.innerHTML = "";
    const seriesResults = document.getElementById("series-search-results");
    if (seriesResults) seriesResults.innerHTML = "";
    const matchContainer = document.getElementById("matching-panel-container");
    if (matchContainer) matchContainer.innerHTML = "";
    const seriesExec = document.getElementById("series-execution-panel");
    if (seriesExec) seriesExec.classList.add("hidden");

    // Update active state in UI list
    document.querySelectorAll(".project-item").forEach(item => {
        if (item.getAttribute("data-project") === projectName) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });
    // Also remove active from system navs
    const navYtDownloader = document.getElementById("nav-youtube-downloader");
    if(navYtDownloader) navYtDownloader.classList.remove("active");
    const navTools = document.getElementById("nav-tools-dashboard");
    if(navTools) navTools.classList.remove("active");
    const navSettings = document.getElementById("nav-settings-dashboard");
    if(navSettings) navSettings.classList.remove("active");
    const navYtAbos = document.getElementById("nav-youtube-abos");
    if(navYtAbos) navYtAbos.classList.remove("active");
    const navDashboard = document.getElementById("nav-dashboard");
    if(navDashboard) navDashboard.classList.remove("active");

    // Hide context panels and reset mode cards on new project selection
    document.querySelectorAll(".context-panel").forEach(c => c.classList.add("hidden"));
    ["movie", "series", "doku", "tools"].forEach(m => {
        const el = document.getElementById(`mode-${m}`);
        if (el) {
            el.classList.remove("active");
            el.setAttribute("aria-checked", "false");
        }
    });

    // Close NFO details panels by default
    const movieDetails = document.getElementById("movie-nfo-details");
    if (movieDetails) movieDetails.removeAttribute("open");
    const seriesDetails = document.getElementById("series-nfo-details");
    if (seriesDetails) seriesDetails.removeAttribute("open");

    triggerQualityHintUpdates();
    scanProject(projectName);
}

function applySmartConversionDefault(hasInefficientVideo) {
    const isSmartDefault = currentSettings.smart_conversion_default !== false; // default to true
    const shouldConvert = isSmartDefault && hasInefficientVideo;

    const movieConvertCb = document.getElementById("movie-option-convert");
    const seriesConvertCb = document.getElementById("series-option-convert");

    if (movieConvertCb) {
        movieConvertCb.checked = shouldConvert;
        movieConvertCb.dispatchEvent(new Event('change'));
    }
    if (seriesConvertCb) {
        seriesConvertCb.checked = shouldConvert;
        seriesConvertCb.dispatchEvent(new Event('change'));
    }
}

async function scanProject(project) {
    updateProjectProcessingStatus(activeProjectsProcessing);
    const title = document.getElementById("current-project-title");
    const path = document.getElementById("current-project-path");
    const statsContainer = document.getElementById("project-stats-container");
    const statsBadges = document.getElementById("stats-badges-container");
    const tbody = document.getElementById("files-table-body");

    // UI View Switching
    document.querySelectorAll(".view-panel").forEach(p => {
        p.classList.add("hidden");
        p.classList.remove("active");
    });
    document.getElementById("view-folder").classList.remove("hidden");
    document.getElementById("view-folder").classList.add("active");
    scrollToDetailTop();


    title.textContent = project === "" ? "Unsortierte Einzeldateien verarbeiten" : (project === "__inbox_recursive__" ? "Alle Dateien (inkl. Unterordner) verarbeiten" : `Projekt: ${project}`);
    path.textContent = "Scanne Ordner...";
    tbody.innerHTML = '<tr><td colspan="3" class="text-center"><div class="loading-spinner"></div></td></tr>';
    statsContainer.style.display = "none";

    const modeSelector = document.getElementById("folder-mode-selector");
    const recursiveNotice = document.getElementById("recursive-mode-notice");
    if (project === "__inbox_recursive__") {
        if (modeSelector) modeSelector.classList.add("hidden");
        if (recursiveNotice) recursiveNotice.classList.remove("hidden");
    } else {
        if (modeSelector) modeSelector.classList.remove("hidden");
        if (recursiveNotice) recursiveNotice.classList.add("hidden");
    }

    try {
        const response = await fetch(`/api/scan-project?project=${encodeURIComponent(project)}`);
        if (!response.ok) {
            if (response.status === 404 && project !== "") {
                console.warn(`Project folder "${project}" not found, redirecting home.`);
                if (typeof window.goHome === "function") {
                    window.goHome();
                } else {
                    document.querySelectorAll(".project-item").forEach(item => item.classList.remove("active"));
                    document.querySelectorAll(".view-panel").forEach(p => {
                        p.classList.add("hidden");
                        p.classList.remove("active");
                    });
                    const emptyView = document.getElementById("view-empty");
                    if (emptyView) {
                        emptyView.classList.remove("hidden");
                        emptyView.classList.add("active");
                    }
                    currentProject = "";
                    loadStatus();
                    scrollToDetailTop();
                }
                return;
            }
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-danger">Fehler beim Laden des Projektinhalts.</td></tr>';
            return;
        }

        const data = await response.json();
        path.textContent = `Pfad: ${data.current_dir}`;
        projectFiles = data.files || [];
        window.currentProjectFileNfoStatuses = data.file_nfo_statuses || {};
        currentProjectIsDoku = data.is_doku || false;
        currentProjectSuggestedQuery = data.suggested_query || "";

        // Auto load existing metadata provider and id if found
        if (data.metadata_provider && data.metadata_id) {
            let mediaType = "series";
            if (data.metadata_provider.startsWith("tmdb_movie") || data.metadata_provider === "ytdlp_movie") {
                mediaType = "movie";
            }

            setTimeout(() => {
                const modeCard = document.getElementById(mediaType === "series" ? "mode-series" : "mode-movie");
                if (modeCard) {
                    modeCard.click();
                }

                const metaObj = {
                    id: data.metadata_id,
                    provider: data.metadata_provider,
                    name: data.metadata_name || data.suggested_query || project
                };

                setTimeout(() => {
                    if (mediaType === "series") {
                        selectShow(metaObj);
                    } else {
                        selectMovie(metaObj);
                    }
                }, 100);
            }, 100);
        }

        applySmartConversionDefault(data.has_inefficient_video || false);

        if (projectFiles.length === 0) {
            const emptyMsg = project === "" ? "Keine unsortierten Einzeldateien in der Hauptinbox gefunden." : (project === "__inbox_recursive__" ? "Keine Dateien in der gesamten Inbox (inkl. Unterordnern) gefunden." : "Dieser Ordner ist leer.");
            tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted">${emptyMsg}</td></tr>`;
            return;
        }

        // Render files list
        let rowsHtml = "";
        projectFiles.forEach(f => {
            const isDir = f.endsWith("/");
            const name = isDir ? f.slice(0, -1) : f;
            const ext = isDir ? "ordner" : f.split('.').pop().toLowerCase();
            const isVideo = ['mp4', 'mkv', 'avi', 'webm', 'mov'].includes(ext);

            let badgeClass = "file-type-badge";
            if (isDir) badgeClass += " dir";
            else if (isVideo) badgeClass += " video";
            else if (['srt', 'vtt', 'ass', 'ssa', 'sub', 'idx'].includes(ext)) badgeClass += " subtitle";
            else if (ext === 'nfo') badgeClass += " nfo";

            let actionHtml = "";
            if (!isDir && isVideo && project !== "__inbox_recursive__" && !data.is_single_file && project !== "") {
                actionHtml = `<button class="btn btn-sm btn-split-file" data-project="${escapeHTML(project)}" data-file="${escapeHTML(name)}" title="In ein separates Projekt abspalten" style="background: rgba(255, 255, 255, 0.1); border: 1px solid var(--border-glass); color: var(--text-normal); cursor: pointer; padding: 3px 8px; border-radius: var(--radius-sm); font-size: 0.7rem; transition: all 0.2s ease;">Trennen</button>`;
            }

            rowsHtml += `
                <tr>
                    <td>${escapeHTML(name)}</td>
                    <td><span class="${badgeClass}">${isDir ? "ORDNER" : ext.toUpperCase()}</span></td>
                    <td style="text-align:right;">${actionHtml}</td>
                </tr>
            `;
        });
        tbody.innerHTML = rowsHtml;

        tbody.querySelectorAll(".btn-split-file").forEach(btn => {
            btn.addEventListener("click", () => {
                const proj = btn.getAttribute("data-project");
                const fname = btn.getAttribute("data-file");
                splitProjectFile(proj, fname);
            });
        });

        // Render statistics
        if (data.ext_counts && Object.keys(data.ext_counts).length > 0) {
            statsContainer.style.display = "block";
            let badgesHtml = "";
            for (const [ext, count] of Object.entries(data.ext_counts)) {
                badgesHtml += `<span class="stat-badge">${count}x .${ext}</span>`;
            }
            statsBadges.innerHTML = badgesHtml;
        }

        // Trigger size estimations for the currently active context panel if any
        const movieContext = document.getElementById("context-movie");
        const seriesContext = document.getElementById("context-series");
        if (movieContext && !movieContext.classList.contains("hidden")) {
            updateSizeEstimation("movie");
        }
        if (seriesContext && !seriesContext.classList.contains("hidden")) {
            updateSizeEstimation("series");
        }

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger">Verbindungsfehler: ${e}</td></tr>`;
    }
}

// ==========================================================================
// AUTO MATCHING ALGORITHM
// ==========================================================================

async function detectExistingSeries(projectName) {
    if (!projectName) {
        searchSeries();
        return;
    }
    const nasDestId = document.getElementById("series-nas-destination").value;
    try {
        const url = `/api/series/detect?project_name=${encodeURIComponent(projectName)}&nas_destination_id=${encodeURIComponent(nasDestId)}`;
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            if (data.found && data.show_id && data.provider) {
                console.log("[Auto-Detect] Found existing show:", data);
                selectShow({
                    id: data.show_id,
                    name: data.show_name || projectName,
                    provider: data.provider,
                    loadedFromNfo: true,
                    title: data.title,
                    year: data.year,
                    plot: data.plot,
                    mw_data: data.mw_data
                });
                return;
            }
        }
    } catch (err) {
        console.error("Error in detectExistingSeries:", err);
    }
    autoMatchNasFolder("series-nas-folder-override", "series-nas-destination", projectName);
    searchSeries();
}

async function triggerSeriesMatchingFromFolder(folderName) {
    if (!folderName) return;

    // Show a loading spinner in the matching panel
    const matchingContainer = document.getElementById("matching-panel-container");
    if (matchingContainer) {
        matchingContainer.innerHTML = `
            <div class="loading-spinner"></div>
            <p class="text-center text-muted" style="margin-top:10px;">Lese tvshow.nfo...</p>
        `;
    }

    const nasDestId = document.getElementById("series-nas-destination").value;
    try {
        const url = `/api/series/detect?project_name=${encodeURIComponent(folderName)}&nas_destination_id=${encodeURIComponent(nasDestId)}`;
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            if (data.found && data.show_id && data.provider) {
                console.log("[Folder Select] Found existing show from tvshow.nfo:", data);
                appendConsoleLog(`[System]: tvshow.nfo gefunden. Serie "${data.show_name}" wird geladen...`);
                selectShow({
                    id: data.show_id,
                    name: data.show_name || folderName,
                    provider: data.provider,
                    loadedFromNfo: true,
                    title: data.title,
                    year: data.year,
                    plot: data.plot,
                    mw_data: data.mw_data
                });
                return;
            }
        }
    } catch (err) {
        console.error("Error in triggerSeriesMatchingFromFolder detect:", err);
    }

    // Clear the loading spinner since no existing tvshow.nfo was found
    if (matchingContainer) {
        matchingContainer.innerHTML = "";
    }

    // If tvshow.nfo not found, trigger online search automatically
    appendConsoleLog(`[System]: Keine tvshow.nfo gefunden. Starte Online-Suche nach "${folderName}"...`);
    const searchQueryInput = document.getElementById("series-search-query");
    if (searchQueryInput) {
        const cleanQuery = folderName.replace(/\([0-9]{4}\)/g, "").replace(/_/g, " ").trim();
        searchQueryInput.value = cleanQuery;
        searchSeries();
    }
}

// ==========================================================================
// SEARCH & METADATA HANDLERS (SERIES & MOVIES)
// ==========================================================================
let currentSearchSeriesController = null;
let lastSearchSeriesQuery = "";

async function searchSeries() {
    const query = document.getElementById("series-search-query").value.trim();
    const resultsContainer = document.getElementById("series-search-results");

    if (!query) return;

    if (currentSearchSeriesController) {
        currentSearchSeriesController.abort();
    }
    currentSearchSeriesController = new AbortController();
    lastSearchSeriesQuery = query;

    resultsContainer.innerHTML = '<div class="loading-spinner"></div>';

    try {

        const destId = getCatIdBySub("/Dokus/Doku-Serien", "4");
        const nasDestSelect = document.getElementById("series-nas-destination");
        const isDokuDest = nasDestSelect && nasDestSelect.value === destId;
        const isDokuQuery = query.toLowerCase().includes("doku") || query.toLowerCase().includes("dokumentation");
        const isDokuMode = isDokuDest || isDokuQuery || currentProjectIsDoku;
        const searchType = isDokuMode ? "doku" : "tv";

        const response = await fetch(`/api/search?type=${searchType}&q=${encodeURIComponent(query)}`, {
            signal: currentSearchSeriesController.signal
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP-Fehler ${response.status}`);
        }
        const data = await response.json();
        if (!Array.isArray(data)) {
            throw new Error(data.error || "Unerwartetes Antwortformat vom Server");
        }

        if (query !== lastSearchSeriesQuery) return;

        if (data.length === 0) {
            resultsContainer.innerHTML = '<p class="text-muted text-center" style="padding:15px;">Keine Serie gefunden.</p>';
            return;
        }

        // Auto-select if URL query returns exactly one result
        const isUrlSearch = query.startsWith("http://") || query.startsWith("https://");
        if (isUrlSearch && data.length === 1) {
            const item = data[0];
            const targetMediaType = item.media_type;
            const showObj = {
                id: item.id,
                name: item.name,
                provider: item.provider
            };

            resultsContainer.innerHTML = "";
            if (targetMediaType === "movie") {
                document.querySelectorAll(".context-panel").forEach(c => c.classList.add("hidden"));
                document.getElementById("context-movie").classList.remove("hidden");
                document.getElementById("movie-search-query").value = query;
                selectMovie(showObj);
            } else {
                selectShow(showObj);
            }
            return;
        }

        let html = "";
        data.forEach(item => {
            let badge = "";
            if (isDokuMode) {
                if (item.media_type === "movie") {
                    badge = `<span class="badge badge-movie" style="background: var(--primary); padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 8px;">Film</span>`;
                } else if (item.media_type === "tv" && item.provider === "mediathek") {
                    badge = `<span class="badge badge-mediathek" style="background: #e67e22; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 8px;">Mediathek</span>`;
                } else {
                    badge = `<span class="badge badge-series" style="background: #2ecc71; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 8px;">Serie</span>`;
                }
            }

            const escapedId = escapeHTML(item.id);
            const escapedName = escapeHTML(item.name);
            const escapedProvider = escapeHTML(item.provider);
            const escapedMediaType = escapeHTML(item.media_type);
            html += `
                <div class="search-item" data-id="${escapedId}" data-name="${escapedName}" data-provider="${escapedProvider}" data-media-type="${escapedMediaType}">
                    <div class="search-item-name">${badge}${escapedName}</div>
                    <div class="search-item-provider">Metadatendienst: ${escapedProvider}</div>
                </div>
            `;
        });
        resultsContainer.innerHTML = html;

        // Bind selection clicks
        resultsContainer.querySelectorAll(".search-item").forEach(item => {
            item.addEventListener("click", () => {
                // Visual feedback: remove selected class from all, add to this
                resultsContainer.querySelectorAll(".search-item").forEach(i => {
                    i.style.background = "";
                    i.style.borderColor = "var(--border-light)";
                });
                item.style.background = "var(--primary-light)";
                item.style.borderColor = "var(--primary)";

                const targetMediaType = item.getAttribute("data-media-type");
                const showObj = {
                    id: item.getAttribute("data-id"),
                    name: item.getAttribute("data-name"),
                    provider: item.getAttribute("data-provider")
                };

                if (targetMediaType === "movie") {
                    document.querySelectorAll(".context-panel").forEach(c => c.classList.add("hidden"));
                    document.getElementById("context-movie").classList.remove("hidden");
                    document.getElementById("movie-search-query").value = showObj.name;
                    selectMovie(showObj);

                    setTimeout(() => {
                        const panel = document.getElementById("selected-movie-panel");
                        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 200);
                } else {
                    selectShow(showObj);

                    setTimeout(() => {
                        const panel = document.getElementById("selected-show-panel");
                        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 200);
                }
            });
        });

    } catch (e) {
        if (e.name === 'AbortError') return; // Ignore aborted requests
        if (query !== lastSearchSeriesQuery) return;
        resultsContainer.innerHTML = `<p class="text-center text-danger">Suchfehler: ${e.message || e}</p>`;
    }
}

function renderProviderInfo(element, providerName, id, loadedFromNfo) {
    if (!element) return;
    element.innerHTML = "";
    element.className = "provider-badge-container";
    element.style.display = "flex";
    element.style.flexWrap = "wrap";
    element.style.gap = "8px";
    element.style.alignItems = "center";
    element.style.marginTop = "8px";
    element.style.marginBottom = "12px";

    // Source Badge (NAS or Online)
    const srcBadge = document.createElement("span");
    srcBadge.className = "source-badge";
    if (loadedFromNfo) {
        srcBadge.textContent = "NAS (tvshow.nfo)";
        srcBadge.style.background = "rgba(139, 92, 246, 0.15)";
        srcBadge.style.color = "#a78bfa";
        srcBadge.style.border = "1px solid rgba(139, 92, 246, 0.35)";
    } else {
        srcBadge.textContent = "Online-Suche";
        srcBadge.style.background = "rgba(59, 130, 246, 0.15)";
        srcBadge.style.color = "#60a5fa";
        srcBadge.style.border = "1px solid rgba(59, 130, 246, 0.35)";
    }
    element.appendChild(srcBadge);

    // Provider Badge
    const provBadge = document.createElement("span");
    let displayProvider = (providerName || "unbekannt").toLowerCase();

    if (displayProvider === "tvdb") {
        provBadge.className = "provider-badge tvdb";
        provBadge.textContent = "Metadatendienst: TVDB";
    } else if (displayProvider === "tmdb_tv" || displayProvider === "tmdb") {
        provBadge.className = "provider-badge tmdb";
        provBadge.textContent = "Metadatendienst: TMDb";
    } else if (displayProvider === "mediathek") {
        provBadge.className = "provider-badge mediathek";
        provBadge.textContent = "Metadatendienst: Mediathek";
    } else if (displayProvider === "ytdlp" || displayProvider === "youtube") {
        provBadge.className = "provider-badge ytdlp";
        provBadge.textContent = "Metadatendienst: YouTube / yt-dlp";
    } else if (displayProvider === "manual" || displayProvider === "manuell") {
        provBadge.className = "provider-badge manual";
        provBadge.textContent = "Metadatendienst: Manuell";
    } else {
        provBadge.className = "provider-badge manual";
        provBadge.textContent = "Metadatendienst: " + providerName.toUpperCase();
    }
    element.appendChild(provBadge);

    // ID Badge/Text
    if (id && id !== "null" && id !== "undefined" && !id.startsWith("{")) {
        const idBadge = document.createElement("span");
        idBadge.className = "provider-badge manual"; // use simple styling
        idBadge.style.background = "rgba(255, 255, 255, 0.05)";
        idBadge.style.color = "var(--text-muted)";
        idBadge.style.border = "1px solid var(--border-glass)";
        idBadge.textContent = `ID: ${id}`;
        element.appendChild(idBadge);
    }
}

async function selectShow(show) {
    selectShowRequestId++;
    const currentRequestId = selectShowRequestId;
    selectedShow = show;
    window.currentShowHasCustomProfile = false;

    // Update local profile dropdown selection to match this show if possible
    const localProfileSelect = document.getElementById("series-local-profile-select");
    if (localProfileSelect) {
        let found = false;
        const normalizeCompareName = (name) => {
            if (!name) return "";
            return name.toLowerCase().replace(/[^a-z0-9]/g, "");
        };
        const normS = normalizeCompareName(show.name);

        for (let i = 0; i < localProfileSelect.options.length; i++) {
            const opt = localProfileSelect.options[i];
            if (opt.value) {
                try {
                    const pData = JSON.parse(opt.value);
                    const normP = normalizeCompareName(pData.show_name);
                    const normF = pData.filename ? normalizeCompareName(pData.filename.replace(".json", "")) : "";

                    const idMatch = (pData.show_id && show.id && String(pData.show_id) === String(show.id) && pData.provider === show.provider);

                    if (idMatch ||
                        pData.show_name === show.name ||
                        (normP && normP === normS) ||
                        (normF && normF === normS)) {
                        localProfileSelect.selectedIndex = i;
                        found = true;
                        break;
                    }
                } catch(e) {}
            }
        }
        if (!found) {
            localProfileSelect.value = "";
        }
    }

    const overrideInput = document.getElementById("series-nas-folder-override");
    const matchStatusLabel = document.getElementById("series-nas-folder-match-status");
    if (matchStatusLabel) {
        matchStatusLabel.classList.add("hidden");
        matchStatusLabel.textContent = "";
    }

    const panel = document.getElementById("selected-show-panel");
    const title = document.getElementById("selected-show-title");
    const provider = document.getElementById("selected-show-provider-info");
    const seasonsInfo = document.getElementById("selected-show-seasons-info");

    title.textContent = show.name;
    renderProviderInfo(provider, show.provider, show.id, show.loadedFromNfo);
    seasonsInfo.textContent = "Lade Staffel-Informationen...";
    panel.classList.remove("hidden");

    const clearBtn = document.getElementById("btn-clear-profile-selection");
    if (clearBtn) clearBtn.classList.remove("hidden");

    // Reset and close series details collapsible block
    const seriesDetails = document.getElementById("series-nfo-details");
    if (seriesDetails) {
        seriesDetails.removeAttribute("open");
    }
    const seriesNfoTitle = document.getElementById("series-nfo-title");
    const seriesNfoYear = document.getElementById("series-nfo-year");
    const seriesNfoPlot = document.getElementById("series-nfo-plot");
    if (seriesNfoTitle) seriesNfoTitle.value = show.name;
    if (seriesNfoYear) seriesNfoYear.value = "";
    if (seriesNfoPlot) seriesNfoPlot.value = "Lade Metadaten...";

    const hasLocalMetadata = show.loadedFromNfo === true && (
        (show.title && show.title.trim().length > 0) ||
        (show.year && String(show.year).trim().length > 0) ||
        (show.plot && show.plot.trim().length > 0)
    );

    if (hasLocalMetadata) {
        if (seriesNfoTitle) seriesNfoTitle.value = show.title || "";
        if (seriesNfoYear) seriesNfoYear.value = show.year || "";
        if (seriesNfoPlot) seriesNfoPlot.value = show.plot || "";
    } else {
        // Fetch and populate show NFO metadata (background thread, guarded)
        fetch(`/api/metadata/fetch?media_type=tv&provider=${encodeURIComponent(show.provider)}&show_id=${encodeURIComponent(show.id)}`)
            .then(res => {
                if (currentRequestId !== selectShowRequestId) return null;
                return res.json();
            })
            .then(data => {
                if (!data || currentRequestId !== selectShowRequestId) return;
                if (seriesNfoTitle && data.title) seriesNfoTitle.value = data.title;
                if (seriesNfoYear && data.year) seriesNfoYear.value = data.year;
                if (seriesNfoPlot) seriesNfoPlot.value = data.plot || "";
            })
            .catch(err => {
                console.error("Error fetching show NFO preview:", err);
                if (currentRequestId === selectShowRequestId && seriesNfoPlot) {
                    seriesNfoPlot.value = "";
                }
            });
    }

    // Safely update the mw_data UI panel
    const mwDataContainer = document.getElementById("selected-show-mw-data");
    const mwUrlSpan = document.getElementById("selected-show-mw-url");
    const mwSyncSpan = document.getElementById("selected-show-mw-sync");
    updateMwDataPanel(mwDataContainer, mwUrlSpan, mwSyncSpan, show.mw_data);

    // 1. Find folder on NAS (AWAIT)
    let nasFolder = cleanSeriesName(show.name);
    if (window.nasFolderSelected) {
        nasFolder = window.nasFolderSelected;
    } else {
        const destSelect = document.getElementById("series-nas-destination");
        const destVal = destSelect ? destSelect.value : "";
        try {
            const res = await fetch(`/api/series/find-folder-by-id?provider=${encodeURIComponent(show.provider)}&show_id=${encodeURIComponent(show.id)}&destination_id=${encodeURIComponent(destVal)}`);
            if (currentRequestId !== selectShowRequestId) return;
            if (res.ok) {
                const data = await res.json();
                if (currentRequestId !== selectShowRequestId) return;
                if (data.folder) {
                    nasFolder = data.folder;
                    if (matchStatusLabel) {
                        matchStatusLabel.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px; color:var(--success);"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle" style="height:12px; width:12px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>Zugeordnet zu existierendem NAS-Ordner: ${escapeHTML(data.folder)}</span>`;
                        matchStatusLabel.classList.remove("hidden");
                    }
                }
            }
        } catch (err) {
            console.error("Error finding folder by show ID:", err);
        }
    }
    if (overrideInput) {
        overrideInput.value = nasFolder;
    }
    autoMatchNasFolder("series-nas-folder-override", "series-nas-destination", nasFolder);

    let hasLoadedAllSeasons = false;

    // 2. Fetch and apply profile settings (AWAIT)
    try {
        const profRes = await fetch(`/api/profile?show_name=${encodeURIComponent(show.name)}`);
        if (currentRequestId !== selectShowRequestId) return;
        if (profRes.ok) {
            const profile = await profRes.json();
            if (currentRequestId !== selectShowRequestId) return;
            if (profile) {
                window.currentShowHasCustomProfile = !!profile.is_custom;

                // Apply auto_h265
                const convertCb = document.getElementById("series-option-convert");
                if (convertCb) {
                    convertCb.checked = (profile.auto_h265 === "j");
                }

                // Apply copy_to_nas
                const nasCb = document.getElementById("series-option-copy-nas");
                if (nasCb) {
                    if (profile.copy_to_nas !== undefined) {
                        nasCb.checked = profile.copy_to_nas;
                    } else {
                        nasCb.checked = true; // default
                    }
                    nasCb.dispatchEvent(new Event('change'));
                }

                // Apply copy_to_pcloud
                const pcloudCb = document.getElementById("series-option-copy-pcloud");
                if (pcloudCb) {
                    if (profile.copy_to_pcloud !== undefined) {
                        pcloudCb.checked = profile.copy_to_pcloud;
                    } else {
                        pcloudCb.checked = (profile.pcloud_sonstiges === "j");
                    }
                    pcloudCb.dispatchEvent(new Event('change'));
                }

                // Apply destination category (wrapped in programmatic change block to prevent override sync)
                const nasSelect = document.getElementById("series-nas-destination");
                const pcloudSelect = document.getElementById("series-pcloud-destination");

                window.isProgrammaticCategoryChange = true;
                try {
                    if (nasSelect) {
                        if (profile.nas_destination_id) {
                            nasSelect.value = profile.nas_destination_id;
                        } else {
                            nasSelect.value = "2"; // Default for Serien
                        }
                        nasSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    }

                    if (pcloudSelect) {
                        if (profile.pcloud_destination_id) {
                            pcloudSelect.value = profile.pcloud_destination_id;
                        } else {
                            if (profile.pcloud_sonstiges === "j") {
                                pcloudSelect.value = "6"; // Sonstiges category ID
                            } else {
                                pcloudSelect.value = "2"; // Serien category ID
                            }
                        }
                        pcloudSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                } finally {
                    window.isProgrammaticCategoryChange = false;
                }

                // Apply force_absolute_season_1
                const absoluteCb = document.getElementById("series-option-absolute-numbering");
                if (absoluteCb) {
                    absoluteCb.checked = !!profile.force_absolute_season_1;
                    absoluteCb.dispatchEvent(new Event('change', { bubbles: true }));
                }

                // Apply all_seasons
                const allSeasonsCb = document.getElementById("series-all-seasons");
                if (allSeasonsCb) {
                    allSeasonsCb.checked = !!profile.all_seasons;
                    const seasonInput = document.getElementById("series-season-num");
                    if (seasonInput) {
                        if (allSeasonsCb.checked) {
                            seasonInput.disabled = true;
                            seasonInput.style.opacity = "0.5";
                            hasLoadedAllSeasons = true;
                        } else {
                            seasonInput.disabled = false;
                            seasonInput.style.opacity = "1";
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.error("Error loading show profile:", err);
    }

    // 3. Auto-routing destination for Dokus (default fallback before profile application)
    const nameLower = show.name.toLowerCase();
    const isDoku = nameLower.includes("doku") || nameLower.includes("dokumentation") || currentProjectIsDoku;
    if (isDoku) {
        const destId = getCatIdBySub("/Dokus/Doku-Serien", "4");
        const nasSelect = document.getElementById("series-nas-destination");
        const pcloudSelect = document.getElementById("series-pcloud-destination");
        if (nasSelect) {
            nasSelect.value = destId;
            nasSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (pcloudSelect) {
            pcloudSelect.value = destId;
            pcloudSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    // 4. Fetch NAS seasons now that profile and correct folder/destination is loaded (AWAIT)
    await fetchNasSeasons(currentRequestId);
    if (currentRequestId !== selectShowRequestId) return;

    updateSizeEstimation("series");

    try {
        const response = await fetch(`/api/fetch-show-info?provider=${show.provider}&show_id=${show.id}`);
        if (currentRequestId !== selectShowRequestId) return;
        const data = await response.json();
        if (currentRequestId !== selectShowRequestId) return;
        seasonsInfo.textContent = data.info || "Keine Info gefunden";
    } catch (e) {
        if (currentRequestId === selectShowRequestId) {
            seasonsInfo.textContent = "Fehler beim Laden der Details.";
        }
    }

    if (hasLoadedAllSeasons) {
        fetchEpisodes(currentRequestId);
    } else {
        // Auto guess season
        const videoFiles = projectFiles.filter(f => {
            const isDir = f.endsWith("/");
            if (isDir) return false;
            const ext = f.split('.').pop().toLowerCase();
            return ['mp4', 'mkv', 'avi', 'webm', 'mov'].includes(ext);
        });

        if (videoFiles.length > 0) {
            try {
                const guessResponse = await fetch("/api/guess-season", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        provider: show.provider,
                        show_id: show.id,
                        filenames: videoFiles
                    })
                });
                if (currentRequestId !== selectShowRequestId) return;
                if (guessResponse.ok) {
                    const guessData = await guessResponse.json();
                    if (currentRequestId !== selectShowRequestId) return;
                    if (guessData.season) {
                        const seasonInput = document.getElementById("series-season-num");
                        if (seasonInput) {
                            seasonInput.value = guessData.season;
                        }
                        // Automatically trigger fetchEpisodes to populate matrix!
                        fetchEpisodes(currentRequestId);
                    }
                }
            } catch (err) {
                console.error("Error guessing season:", err);
            }
        }
    }
}

async function fetchEpisodes(requestId = null) {
    if (requestId && typeof requestId !== 'number') {
        requestId = null; // Ignore Event objects from click listeners
    }
    const targetRequestId = requestId !== null ? requestId : selectShowRequestId;
    if (!selectedShow) return;

    const allSeasonsCb = document.getElementById("series-all-seasons");
    const isAllSeasons = allSeasonsCb && allSeasonsCb.checked;
    const season = isAllSeasons ? "all" : document.getElementById("series-season-num").value;
    const matchingContainer = document.getElementById("matching-panel-container");
    const execPanel = document.getElementById("series-execution-panel");

    matchingContainer.innerHTML = '<div class="loading-spinner"></div>';
    execPanel.classList.add("hidden");

    if (isManualSeriesMode) {
        renderMatchingMatrix();
        execPanel.classList.remove("hidden");
        return;
    }

    try {
        const response = await fetch(`/api/fetch-episodes?provider=${selectedShow.provider}&show_id=${selectedShow.id}&season=${season}`);
        if (targetRequestId !== selectShowRequestId) return;
        episodesData = await response.json();
        if (targetRequestId !== selectShowRequestId) return;

        if (Object.keys(episodesData).length === 0) {
            matchingContainer.innerHTML = '<p class="text-center text-danger">Keine Episoden gefunden.</p>';
            return;
        }

        // Get video files
        const videoFiles = projectFiles.filter(f => {
            const isDir = f.endsWith("/");
            if (isDir) return false;
            const ext = f.split('.').pop().toLowerCase();
            return ['mp4', 'mkv', 'avi', 'webm', 'mov'].includes(ext);
        });

        let matches = {};
        let duplicates = {};
        const nasDestEl = document.getElementById("series-nas-destination");
        const nasFolderEl = document.getElementById("series-nas-folder-override");
        if (videoFiles.length > 0) {
            try {
                const matchResponse = await fetch('/api/match-episodes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        provider: selectedShow.provider,
                        show_id: selectedShow.id,
                        season: season,
                        filenames: videoFiles,
                        show_name: selectedShow.name,
                        nas_destination_id: nasDestEl ? nasDestEl.value : null,
                        nas_show_folder: nasFolderEl ? nasFolderEl.value : null
                    })
                });
                if (targetRequestId !== selectShowRequestId) return;
                if (matchResponse.ok) {
                    const matchData = await matchResponse.json();
                    if (targetRequestId !== selectShowRequestId) return;
                    matches = matchData.matches || {};
                    duplicates = matchData.duplicates || {};
                }
            } catch (err) {
                console.error("Error matching episodes:", err);
            }
        }

        if (targetRequestId !== selectShowRequestId) return;
        renderMatchingMatrix(matches, duplicates);
        execPanel.classList.remove("hidden");

    } catch (e) {
        matchingContainer.innerHTML = `<p class="text-center text-danger">Fehler beim Episoden-Laden: ${e}</p>`;
    }
}

function renderMatchingMatrix(matches = {}, duplicates = {}) {
    const container = document.getElementById("matching-panel-container");

    // Filter only local video files
    const videoFiles = projectFiles.filter(f => {
        const isDir = f.endsWith("/");
        if (isDir) return false;
        const ext = f.split('.').pop().toLowerCase();
        return ['mp4', 'mkv', 'avi', 'webm', 'mov'].includes(ext);
    });

    if (videoFiles.length === 0) {
        container.innerHTML = '<p class="text-center text-warning">Keine Videodateien im Projektordner zum Zuordnen gefunden.</p>';
        return;
    }

    if (isManualSeriesMode) {
        let html = "";
        const defaultSeason = document.getElementById("series-season-num")?.value || "1";

        videoFiles.forEach((file, index) => {
            let seasonVal = defaultSeason;
            let episodeVal = (index + 1).toString();

            // Try to parse season and episode from filename
            const guessedStr = guessSeasonAndEpisode(file);
            if (guessedStr) {
                const s_e_match = guessedStr.match(/^S(\d+)E(\d+)$/i);
                if (s_e_match) {
                    seasonVal = parseInt(s_e_match[1], 10).toString();
                    episodeVal = parseInt(s_e_match[2], 10).toString();
                }
            } else {
                const guessedEp = guessEpisodeNumber(file);
                if (guessedEp !== null && !isNaN(guessedEp)) {
                    episodeVal = guessedEp.toString();
                }
            }

            const cleanTitle = cleanFilenameForManualTitle(file);

            html += `
                <div class="matching-row manual-matching-row" data-file="${file}" style="display: flex; flex-direction: column; gap: 10px; padding: 15px; border: 1px solid var(--border-glass); border-radius: var(--radius-md); margin-bottom: 15px; background: rgba(255,255,255,0.02);">
                    <div style="font-weight: bold; color: var(--text-main); word-break: break-all;">${file}</div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px;">
                        <div>
                            <label style="display:block; font-size:11px; color:var(--text-muted); margin-bottom:5px;">Staffel:</label>
                            <input type="number" class="manual-season" id="manual-season-${index}" value="${seasonVal}" style="width:100%;">
                        </div>
                        <div>
                            <label style="display:block; font-size:11px; color:var(--text-muted); margin-bottom:5px;">Episode:</label>
                            <input type="number" class="manual-episode" id="manual-episode-${index}" value="${episodeVal}" style="width:100%;">
                        </div>
                        <div style="grid-column: span 2;">
                            <label style="display:block; font-size:11px; color:var(--text-muted); margin-bottom:5px;">Episodentitel:</label>
                            <input type="text" class="manual-title" id="manual-title-${index}" value="${cleanTitle}" style="width:100%;">
                        </div>
                    </div>

                    <div style="display: flex; gap: 10px; align-items: flex-end;">
                        <div style="flex: 1;">
                            <label style="display:block; font-size:11px; color:var(--text-muted); margin-bottom:5px;">Episode URL (Scraping):</label>
                            <input type="text" class="manual-url" id="manual-url-${index}" placeholder="z.B. ARD Mediathek oder YouTube Video URL" style="width:100%;">
                        </div>
                        <button type="button" class="btn btn-secondary btn-scrape-row" data-index="${index}" style="padding: 0 15px; height: 38px; display: flex; align-items: center; justify-content: center;">Scrapieren</button>
                    </div>

                    <div>
                        <label style="display:block; font-size:11px; color:var(--text-muted); margin-bottom:5px;">Plot / Beschreibung:</label>
                        <textarea class="manual-plot" id="manual-plot-${index}" rows="2" placeholder="Beschreibung für diese Folge..." style="width:100%; resize:vertical;"></textarea>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Bind scrape listeners for each row
        videoFiles.forEach((file, index) => {
            const btnScrape = container.querySelector(`.btn-scrape-row[data-index="${index}"]`);
            if (btnScrape) {
                btnScrape.addEventListener("click", async () => {
                    const urlInput = document.getElementById(`manual-url-${index}`);
                    const urlVal = urlInput ? urlInput.value.trim() : "";
                    if (!urlVal) {
                        alert("Bitte geben Sie zuerst eine URL ein!");
                        return;
                    }

                    btnScrape.disabled = true;
                    btnScrape.textContent = "...";

                    try {
                        const response = await fetch('/api/yt/fetch', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: urlVal })
                        });
                        if (response.ok) {
                            const data = await response.json();
                            if (data.error) {
                                alert("Fehler beim Scraping: " + data.error);
                            } else {
                                const titleInput = document.getElementById(`manual-title-${index}`);
                                const plotTextarea = document.getElementById(`manual-plot-${index}`);
                                if (titleInput && data.title) {
                                    titleInput.value = data.title;
                                }
                                if (plotTextarea && data.description) {
                                    plotTextarea.value = data.description;
                                }
                            }
                        } else {
                            alert("Fehler bei der Anfrage an den Scraper.");
                        }
                    } catch (err) {
                        alert("Fehler beim Abrufen der Metadaten: " + err.message);
                    } finally {
                        btnScrape.disabled = false;
                        btnScrape.textContent = "Scrapieren";
                    }
                });
            }
        });

        return;
    }

    const allSeasonsCb = document.getElementById("series-all-seasons");
    const isAllSeasons = allSeasonsCb && allSeasonsCb.checked;

    let html = "";
    videoFiles.forEach((file, index) => {
        // Try backend match first, fallback to frontend guess
        let guessedEp = matches[file];
        if (guessedEp === undefined || guessedEp === null) {
            if (isAllSeasons) {
                guessedEp = guessSeasonAndEpisode(file);
            } else {
                guessedEp = guessEpisodeNumber(file);
            }
        }

        html += `
            <div class="matching-row" data-file="${file}">
                <div class="match-file" title="${file}">
                    <div style="word-break: break-all;">${file}</div>
                    <div class="duplicate-badge-container" id="dup-badge-${index}">${duplicates[file] ? `
                        <div class="duplicate-badge" data-existing-path="${duplicates[file].path}" data-existing-filename="${duplicates[file].filename}" data-new-file="${file}" data-badge-id="dup-badge-${index}" style="margin-top: 5px; font-size: 11px; color: #ffb300; background: rgba(255, 179, 0, 0.08); border: 1px solid rgba(255, 179, 0, 0.25); padding: 4px 8px; border-radius: var(--radius-sm); display: inline-flex; align-items: center; gap: 6px; font-weight: normal; line-height: 1.2; max-width: 100%; box-sizing: border-box; cursor: pointer;" title="Klicken für Video-Vergleich & Upgrade">
                            <span><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle" style="display:inline-block; vertical-align:middle; margin-right: 4px; color: #ffb300; height: 12px; width: 12px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>Bereits auf NAS:</span>
                            <span style="font-weight: 500; opacity: 0.9; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 150px;" title="${duplicates[file].filename}">${duplicates[file].filename}</span>
                            <span style="opacity: 0.6; font-size: 10px;">(${duplicates[file].size_gb.toFixed(2)} GB${duplicates[file].resolution ? `, ${duplicates[file].resolution}` : ''})</span>
                        </div>
                    ` : ''}</div>
                </div>
                <div class="match-selection">
                    <div style="display: flex; gap: 8px; width: 100%;">
                        <input type="text" class="match-search-input" id="match-search-${index}" placeholder="Filtern..." style="flex: 0 0 35%; min-width: 80px;">
                        <select class="match-select" id="match-select-${index}" style="flex: 1; min-width: 0;">
                            ${(() => {
                                const fileStatus = window.currentProjectFileNfoStatuses ? window.currentProjectFileNfoStatuses[file] : null;
                                const shouldSkip = fileStatus && fileStatus.exists && fileStatus.complete;
                                return `<option value="skip" ${shouldSkip ? 'selected' : ''}>-- Überspringen --</option>`;
                            })()}
                            ${Object.entries(episodesData).map(([num, ep]) => {
                                const title = typeof ep === 'object' ? ep.title : ep;
                                const fileStatus = window.currentProjectFileNfoStatuses ? window.currentProjectFileNfoStatuses[file] : null;
                                const shouldSkip = fileStatus && fileStatus.exists && fileStatus.complete;

                                let isSelected = false;
                                if (!shouldSkip) {
                                    if (isAllSeasons) {
                                        isSelected = (guessedEp === num);
                                    } else {
                                        isSelected = (guessedEp === parseInt(num, 10) || String(guessedEp) === String(num));
                                    }
                                }

                                let label = `Episode ${num}: ${title}`;
                                if (isAllSeasons) {
                                    const s_e_match = num.match(/^S(\d+)E(\d+)$/i);
                                    if (s_e_match) {
                                        const s = parseInt(s_e_match[1], 10);
                                        const e = parseInt(s_e_match[2], 10);
                                        label = `Staffel ${s} - Folge ${e}: ${title}`;
                                    }
                                }
                                return `<option value="${num}" ${isSelected ? 'selected' : ''}>${label}</option>`;
                            }).join('')}
                        </select>
                    </div>
                    <div class="selected-match-info" id="selected-match-info-${index}"></div>
                </div>

                <!-- Episoden NFO Editier-Bereich (Spans both columns for full width) -->
                <details class="episode-nfo-details" id="episode-nfo-details-${index}" data-index="${index}" style="grid-column: span 2; margin-top: 10px; border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-sm); padding: 8px; background: rgba(0,0,0,0.15); width: 100%; box-sizing: border-box;">
                    <summary style="cursor: pointer; font-size: 11px; color: var(--text-muted);">📝 NFO für diese Episode bearbeiten</summary>
                    <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                            <div>
                                <label style="display:block; font-size:10px; color:var(--text-muted); margin-bottom:3px;">Staffel Override (optional):</label>
                                <input type="number" class="episode-nfo-season-override" id="episode-nfo-season-override-${index}" placeholder="z.B. 1" style="width:100%; font-size: 12px; padding: 6px; box-sizing: border-box;">
                            </div>
                            <div>
                                <label style="display:block; font-size:10px; color:var(--text-muted); margin-bottom:3px;">Episode Override (optional):</label>
                                <input type="number" class="episode-nfo-episode-override" id="episode-nfo-episode-override-${index}" placeholder="z.B. 5" style="width:100%; font-size: 12px; padding: 6px; box-sizing: border-box;">
                            </div>
                        </div>
                        <div>
                            <label style="display:block; font-size:10px; color:var(--text-muted); margin-bottom:3px;">Episodentitel:</label>
                            <input type="text" class="episode-nfo-title" id="episode-nfo-title-${index}" style="width:100%; font-size: 12px; padding: 6px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="display:block; font-size:10px; color:var(--text-muted); margin-bottom:3px;">Erstausstrahlung (Aired):</label>
                            <input type="text" class="episode-nfo-aired" id="episode-nfo-aired-${index}" style="width:100%; font-size: 12px; padding: 6px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="display:block; font-size:10px; color:var(--text-muted); margin-bottom:3px;">Beschreibung / Plot:</label>
                            <textarea class="episode-nfo-plot" id="episode-nfo-plot-${index}" rows="2" style="width:100%; resize:vertical; font-size: 12px; padding: 6px; box-sizing: border-box;"></textarea>
                        </div>
                    </div>
                </details>
            </div>
        `;
    });

    container.innerHTML = html;

    // Bind change listeners to update the selected match info and search inputs
    videoFiles.forEach((file, index) => {
        const select = document.getElementById(`match-select-${index}`);
        const search = document.getElementById(`match-search-${index}`);
        const info = document.getElementById(`selected-match-info-${index}`);
        const seasonOverrideInput = document.getElementById(`episode-nfo-season-override-${index}`);
        const episodeOverrideInput = document.getElementById(`episode-nfo-episode-override-${index}`);
        if (select && info) {
            const updateInfo = () => {
                const selectedOption = select.options[select.selectedIndex];
                if (selectedOption) {
                    const text = selectedOption.text;
                    const val = selectedOption.value;
                    if (val === 'skip') {
                        info.innerHTML = '<span style="display:inline-flex; align-items:center; gap:4px; color:var(--text-muted);"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-circle" style="height:12px; width:12px; color:var(--warning);"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>Wird übersprungen</span>';
                        info.classList.remove("matched");
                    } else {
                        info.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px; color:var(--success);"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check" style="height:12px; width:12px;"><polyline points="20 6 9 17 4 12"/></svg>Zugeordnet: ${escapeHTML(text)}</span>`;
                        info.classList.add("matched");
                    }
                }
            };

            const checkNasDuplicate = async () => {
                const val = select.value;
                const badgeContainer = document.getElementById(`dup-badge-${index}`);
                if (!badgeContainer) return;

                if (val === 'skip') {
                    badgeContainer.innerHTML = '';
                    return;
                }

                // Parse season/episode from the selected value, respecting overrides if set
                let epSeason, epNum;
                const sOverride = seasonOverrideInput ? parseInt(seasonOverrideInput.value, 10) : NaN;
                const eOverride = episodeOverrideInput ? parseInt(episodeOverrideInput.value, 10) : NaN;

                if (!isNaN(sOverride)) {
                    epSeason = sOverride;
                } else {
                    const seMatch = val.match(/^S(\d+)E(\d+)$/i);
                    if (seMatch) {
                        epSeason = parseInt(seMatch[1], 10);
                    } else {
                        epSeason = parseInt(document.getElementById("series-season-num")?.value || "1", 10);
                    }
                }

                if (!isNaN(eOverride)) {
                    epNum = eOverride;
                } else {
                    const seMatch = val.match(/^S(\d+)E(\d+)$/i);
                    if (seMatch) {
                        epNum = parseInt(seMatch[2], 10);
                    } else {
                        epNum = parseInt(val, 10);
                    }
                }

                if (isNaN(epSeason) || isNaN(epNum)) {
                    badgeContainer.innerHTML = '';
                    return;
                }

                const nasDestEl = document.getElementById("series-nas-destination");
                const nasFolderEl = document.getElementById("series-nas-folder-override");

                try {
                    badgeContainer.innerHTML = '<div style="margin-top: 5px; font-size: 10px; color: var(--text-muted); display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-2" style="animation: spin 1s linear infinite; height: 10px; width: 10px;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Prüfe NAS...</div>';
                    const response = await fetch('/api/check-nas-duplicate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            episode: epNum,
                            season: epSeason,
                            show_name: selectedShow?.name || '',
                            nas_show_folder: nasFolderEl?.value || null,
                            nas_destination_id: nasDestEl?.value || null
                        })
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data.duplicate) {
                            const d = data.duplicate;
                             badgeContainer.innerHTML = `
                                <div class="duplicate-badge" data-existing-path="${d.path}" data-existing-filename="${d.filename}" data-new-file="${file}" data-badge-id="dup-badge-${index}" style="margin-top: 5px; font-size: 11px; color: #ffb300; background: rgba(255, 179, 0, 0.08); border: 1px solid rgba(255, 179, 0, 0.25); padding: 4px 8px; border-radius: var(--radius-sm); display: inline-flex; align-items: center; gap: 6px; font-weight: normal; line-height: 1.2; max-width: 100%; box-sizing: border-box; cursor: pointer;" title="Klicken für Video-Vergleich & Upgrade">
                                    <span><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle" style="display:inline-block; vertical-align:middle; margin-right: 4px; color: #ffb300; height: 12px; width: 12px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>Bereits auf NAS:</span>
                                    <span style="font-weight: 500; opacity: 0.9; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 150px;" title="${d.filename}">${d.filename}</span>
                                    <span style="opacity: 0.6; font-size: 10px;">(${d.size_gb.toFixed(2)} GB${d.resolution ? `, ${d.resolution}` : ''})</span>
                                </div>`;
                        } else {
                            badgeContainer.innerHTML = '';
                        }
                    }
                } catch (err) {
                    console.error("NAS duplicate check error:", err);
                    badgeContainer.innerHTML = '';
                }
            };

            select.addEventListener("change", () => {
                updateInfo();
                checkNasDuplicate();
            });

            if (seasonOverrideInput) {
                seasonOverrideInput.addEventListener("input", () => {
                    checkNasDuplicate();
                });
            }
            if (episodeOverrideInput) {
                episodeOverrideInput.addEventListener("input", () => {
                    checkNasDuplicate();
                });
            }

            updateInfo();

            if (search) {
                search.addEventListener("input", () => {
                    const query = search.value;
                    const currentVal = select.value;

                    const searchTerms = query.toLowerCase().split(/\s+/).filter(t => t);

                    let selectHtml = `<option value="skip" ${currentVal === 'skip' ? 'selected' : ''}>-- Überspringen --</option>`;

                    Object.entries(episodesData).forEach(([num, ep]) => {
                        const title = typeof ep === 'object' ? ep.title : ep;
                        let label = `Episode ${num}: ${title}`;
                        if (isAllSeasons) {
                            const s_e_match = num.match(/^S(\d+)E(\d+)$/i);
                            if (s_e_match) {
                                const s = parseInt(s_e_match[1], 10);
                                const e = parseInt(s_e_match[2], 10);
                                label = `Staffel ${s} - Folge ${e}: ${title}`;
                            }
                        }

                        const matchesQuery = searchTerms.every(term =>
                            label.toLowerCase().includes(term) || num.toLowerCase().includes(term)
                        );

                        const isSelected = (currentVal === num);

                        if (matchesQuery || isSelected) {
                            selectHtml += `<option value="${num}" ${isSelected ? 'selected' : ''}>${label}</option>`;
                        }
                    });

                    select.innerHTML = selectHtml;
                    updateInfo();
                });
            }

            // Bind NFO collapsible events
            const details = document.getElementById(`episode-nfo-details-${index}`);
            const epTitleInput = document.getElementById(`episode-nfo-title-${index}`);
            const epAiredInput = document.getElementById(`episode-nfo-aired-${index}`);
            const epPlotTextarea = document.getElementById(`episode-nfo-plot-${index}`);

            const loadEpisodeNfoData = async () => {
                const val = select.value;
                if (val === 'skip') {
                    if (epTitleInput) epTitleInput.value = "";
                    if (epAiredInput) epAiredInput.value = "";
                    if (epPlotTextarea) epPlotTextarea.value = "Folge wird übersprungen";
                    return;
                }

                let epNum = val;
                let epSeason = document.getElementById("series-season-num")?.value || "1";
                if (isAllSeasons) {
                    const s_e_match = val.match(/^S(\d+)E(\d+)$/i);
                    if (s_e_match) {
                        epSeason = parseInt(s_e_match[1], 10).toString();
                        epNum = parseInt(s_e_match[2], 10).toString();
                    }
                }

                const cacheKey = `${selectedShow.provider}_${selectedShow.id}_${epSeason}_${epNum}`;
                if (fetchedEpisodeMetadataCache[cacheKey]) {
                    const cached = fetchedEpisodeMetadataCache[cacheKey];
                    if (epTitleInput) epTitleInput.value = cached.title || "";
                    if (epAiredInput) epAiredInput.value = cached.aired || "";
                    if (epPlotTextarea) epPlotTextarea.value = cached.plot || "";
                    return;
                }

                if (epPlotTextarea) epPlotTextarea.value = "Lade Metadaten...";
                try {
                    const response = await fetch(`/api/metadata/fetch?media_type=episode&provider=${encodeURIComponent(selectedShow.provider)}&show_id=${encodeURIComponent(selectedShow.id)}&season=${encodeURIComponent(epSeason)}&episode=${encodeURIComponent(epNum)}`);
                    if (response.ok) {
                        const data = await response.json();
                        const cacheKeys = Object.keys(fetchedEpisodeMetadataCache);
                        if (cacheKeys.length >= 500) {
                            delete fetchedEpisodeMetadataCache[cacheKeys[0]];
                        }
                        fetchedEpisodeMetadataCache[cacheKey] = data;
                        if (select.value === val) {
                            if (epTitleInput) epTitleInput.value = data.title || "";
                            if (epAiredInput) epAiredInput.value = data.aired || "";
                            if (epPlotTextarea) epPlotTextarea.value = data.plot || "";
                        }
                    }
                } catch (err) {
                    console.error("Error fetching episode NFO:", err);
                    if (epPlotTextarea) epPlotTextarea.value = "";
                }
            };

            if (details) {
                details.addEventListener("toggle", () => {
                    if (details.open) {
                        loadEpisodeNfoData();
                    }
                });
            }

            select.addEventListener("change", () => {
                if (details && details.open) {
                    loadEpisodeNfoData();
                }
            });
        }
    });
}

let currentSearchMovieController = null;
let lastSearchMovieQuery = "";

async function searchMovie() {
    const query = document.getElementById("movie-search-query").value.trim();
    const resultsContainer = document.getElementById("movie-search-results");

    if (!query) return;

    if (currentSearchMovieController) {
        currentSearchMovieController.abort();
    }
    currentSearchMovieController = new AbortController();
    lastSearchMovieQuery = query;

    resultsContainer.innerHTML = '<div class="loading-spinner"></div>';

    try {

        const destId = getCatIdBySub("/Dokus/Einzelne Dokus", "3");
        const nasDestSelect = document.getElementById("movie-nas-destination");
        const isDokuDest = nasDestSelect && nasDestSelect.value === destId;
        const queryLower = query.toLowerCase();
        const isDokuQuery = queryLower.includes("doku") || queryLower.includes("dokumentation");

        const searchType = (isDokuDest || isDokuQuery || currentProjectIsDoku) ? "doku" : "movie";

        const response = await fetch(`/api/search?type=${searchType}&q=${encodeURIComponent(query)}`, {
            signal: currentSearchMovieController.signal
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP-Fehler ${response.status}`);
        }
        const data = await response.json();
        if (!Array.isArray(data)) {
            throw new Error(data.error || "Unerwartetes Antwortformat vom Server");
        }

        if (query !== lastSearchMovieQuery) return;

        if (data.length === 0) {
            resultsContainer.innerHTML = '<p class="text-muted text-center" style="padding:15px;">Keine Einträge gefunden.</p>';
            return;
        }

        // Auto-select if URL query returns exactly one result
        const isUrlSearch = query.startsWith("http://") || query.startsWith("https://");
        if (isUrlSearch && data.length === 1) {
            const item = data[0];
            const targetMediaType = item.media_type;
            const showObj = {
                id: item.id,
                name: item.name,
                provider: item.provider
            };

            resultsContainer.innerHTML = "";
            if (targetMediaType === "tv") {
                document.querySelectorAll(".context-panel").forEach(c => c.classList.add("hidden"));
                document.getElementById("context-series").classList.remove("hidden");
                document.getElementById("series-search-query").value = query;
                selectShow(showObj);
            } else {
                selectMovie(showObj);
            }
            return;
        }

        let html = "";
        data.forEach(item => {
            let badge = "";
            if (searchType === "doku") {
                if (item.media_type === "movie") {
                    badge = `<span class="badge badge-movie" style="background: var(--primary); padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 8px;">Film</span>`;
                } else if (item.media_type === "tv" && item.provider === "mediathek") {
                    badge = `<span class="badge badge-mediathek" style="background: #e67e22; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 8px;">Mediathek</span>`;
                } else {
                    badge = `<span class="badge badge-series" style="background: #2ecc71; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 8px;">Serie</span>`;
                }
            }

            const escapedId = escapeHTML(item.id);
            const escapedName = escapeHTML(item.name);
            const escapedProvider = escapeHTML(item.provider);
            const escapedMediaType = escapeHTML(item.media_type);
            html += `
                <div class="search-item" data-id="${escapedId}" data-name="${escapedName}" data-provider="${escapedProvider}" data-media-type="${escapedMediaType}">
                    <div class="search-item-name">${badge}${escapedName}</div>
                    <div class="search-item-provider">Metadatendienst: ${escapedProvider}</div>
                </div>
            `;
        });
        resultsContainer.innerHTML = html;

        resultsContainer.querySelectorAll(".search-item").forEach(item => {
            item.addEventListener("click", () => {
                const targetMediaType = item.getAttribute("data-media-type");
                const showObj = {
                    id: item.getAttribute("data-id"),
                    name: item.getAttribute("data-name"),
                    provider: item.getAttribute("data-provider")
                };

                if (targetMediaType === "tv") {
                    document.querySelectorAll(".context-panel").forEach(c => c.classList.add("hidden"));
                    document.getElementById("context-series").classList.remove("hidden");
                    document.getElementById("series-search-query").value = showObj.name;
                    selectShow(showObj);
                } else {
                    selectMovie(showObj);
                }
            });
        });

    } catch (e) {
        if (e.name === 'AbortError') return; // Ignore aborted requests
        if (query !== lastSearchMovieQuery) return;
        resultsContainer.innerHTML = `<p class="text-center text-danger">Suchfehler: ${e.message || e}</p>`;
    }
}

function selectMovie(movie) {
    selectedMovie = movie;

    const panel = document.getElementById("selected-movie-panel");
    const title = document.getElementById("selected-movie-title");
    const provider = document.getElementById("selected-movie-provider-info");

    title.textContent = movie.name;
    renderProviderInfo(provider, movie.provider, movie.id, movie.loadedFromNfo);
    panel.classList.remove("hidden");

    // Reset and close movie details collapsible block
    const movieDetails = document.getElementById("movie-nfo-details");
    if (movieDetails) {
        movieDetails.removeAttribute("open");
    }
    const movieNfoTitle = document.getElementById("movie-nfo-title");
    const movieNfoYear = document.getElementById("movie-nfo-year");
    const movieNfoPlot = document.getElementById("movie-nfo-plot");
    if (movieNfoTitle) movieNfoTitle.value = movie.name;
    if (movieNfoYear) movieNfoYear.value = "";
    if (movieNfoPlot) movieNfoPlot.value = "Lade Metadaten...";

    // Fetch and populate movie NFO metadata
    fetch(`/api/metadata/fetch?media_type=movie&provider=${encodeURIComponent(movie.provider)}&movie_id=${encodeURIComponent(movie.id)}`)
        .then(res => res.json())
        .then(data => {
            if (movieNfoTitle && data.title) movieNfoTitle.value = data.title;
            if (movieNfoYear && data.year) movieNfoYear.value = data.year;
            if (movieNfoPlot) movieNfoPlot.value = data.plot || "";
        })
        .catch(err => {
            console.error("Error fetching movie NFO preview:", err);
            if (movieNfoPlot) movieNfoPlot.value = "";
        });

    // Auto-routing destination for Dokus
    const nameLower = movie.name.toLowerCase();
    const isDoku = nameLower.includes("doku") || nameLower.includes("dokumentation") || currentProjectIsDoku;
    if (isDoku) {

        const destId = getCatIdBySub("/Dokus/Einzelne Dokus", "3");

        const nasSelect = document.getElementById("movie-nas-destination");
        const pcloudSelect = document.getElementById("movie-pcloud-destination");
        if (nasSelect) nasSelect.value = destId;
        if (pcloudSelect) pcloudSelect.value = destId;
    }
}

// ==========================================================================
// CORE EXECUTION HANDLERS (SERIES & MOVIES & YOUTUBE & TOOLS)
// ==========================================================================
async function executeSeriesWorkflow() {
    if (activeProjectsProcessing && activeProjectsProcessing.has(currentProject || "")) {
        alert("Dieses Projekt wird bereits verarbeitet oder befindet sich in der Warteschlange!");
        return;
    }
    if (!selectedShow) return;

    const allSeasonsCb = document.getElementById("series-all-seasons");
    const isAllSeasons = allSeasonsCb && allSeasonsCb.checked;

    // Collect mappings
    const mappings = {};
    const rows = document.querySelectorAll(".matching-row");

    if (isManualSeriesMode) {
        rows.forEach((row, index) => {
            const file = row.getAttribute("data-file");
            const seasonInput = document.getElementById(`manual-season-${index}`);
            const episodeInput = document.getElementById(`manual-episode-${index}`);
            const titleInput = document.getElementById(`manual-title-${index}`);
            const plotTextarea = document.getElementById(`manual-plot-${index}`);

            const seasonVal = seasonInput ? parseInt(seasonInput.value, 10) : 1;
            const episodeVal = episodeInput ? parseInt(episodeInput.value, 10) : 1;
            const titleVal = titleInput ? titleInput.value.trim() : "";
            const plotVal = plotTextarea ? plotTextarea.value.trim() : "";

            mappings[file] = {
                season: isNaN(seasonVal) ? 1 : seasonVal,
                episode: isNaN(episodeVal) ? 1 : episodeVal,
                title: titleVal,
                plot: plotVal
            };
        });
    } else {
        rows.forEach((row, index) => {
            const file = row.getAttribute("data-file");
            const select = document.getElementById(`match-select-${index}`);
            const val = select.value;
            if (val !== "skip") {
                const sOverrideEl = document.getElementById(`episode-nfo-season-override-${index}`);
                const eOverrideEl = document.getElementById(`episode-nfo-episode-override-${index}`);
                const sOverride = sOverrideEl ? parseInt(sOverrideEl.value, 10) : NaN;
                const eOverride = eOverrideEl ? parseInt(eOverrideEl.value, 10) : NaN;

                if (!isNaN(sOverride) || !isNaN(eOverride)) {
                    let defaultSeason, defaultEpisode;
                    const seMatch = val.match(/^S(\d+)E(\d+)$/i);
                    if (seMatch) {
                        defaultSeason = parseInt(seMatch[1], 10);
                        defaultEpisode = parseInt(seMatch[2], 10);
                    } else {
                        defaultSeason = parseInt(document.getElementById("series-season-num")?.value || "1", 10);
                        defaultEpisode = parseInt(val, 10);
                    }

                    mappings[file] = {
                        season: !isNaN(sOverride) ? sOverride : defaultSeason,
                        episode: !isNaN(eOverride) ? eOverride : defaultEpisode,
                        metadata_ep_num: val
                    };
                } else {
                    if (isAllSeasons) {
                        mappings[file] = val;
                    } else {
                        mappings[file] = parseInt(val, 10);
                    }
                }
            }
        });
    }

    if (Object.keys(mappings).length === 0) {
        alert("Bitte mindestens eine Datei einer Episode zuordnen!");
        return;
    }

    let season = "1";
    if (isManualSeriesMode) {
        const firstEp = Object.values(mappings)[0];
        season = firstEp ? firstEp.season.toString() : "1";
    } else {
        season = isAllSeasons ? "all" : document.getElementById("series-season-num").value;
    }

    const convert = document.getElementById("series-option-convert").checked;
    const deleteOrig = document.getElementById("series-option-delete").checked;
    const copyNas = document.getElementById("series-option-copy-nas").checked;
    const copyPcloud = document.getElementById("series-option-copy-pcloud").checked;
    const nasDestId = document.getElementById("series-nas-destination").value;
    const pcloudDestId = document.getElementById("series-pcloud-destination").value;
    const quality = document.getElementById("series-quality-slider") ? parseInt(document.getElementById("series-quality-slider").value, 10) : 60;

    const nasShowFolder = document.getElementById("series-nas-folder-override")?.value?.trim();
    const forceAbsoluteSeason1 = document.getElementById("series-option-absolute-numbering") ? document.getElementById("series-option-absolute-numbering").checked : false;

    const payload = {
        media_type: "tv",
        project_name: currentProject,
        show_name: selectedShow.name,
        show_id: selectedShow.id,
        provider: selectedShow.provider,
        season: (isManualSeriesMode || !isAllSeasons) ? parseInt(season, 10) : "all",
        ui_season: parseInt(document.getElementById("series-season-num")?.value || "1", 10) || 1,
        mappings: mappings,
        convert: convert,
        quality: quality,
        delete_original: deleteOrig,
        copy_to_nas: copyNas,
        copy_to_pcloud: copyPcloud,
        destination_id: nasDestId,
        nas_destination_id: nasDestId,
        pcloud_destination_id: pcloudDestId,
        force_absolute_season_1: forceAbsoluteSeason1,
        is_anime: document.getElementById("series-is-anime")?.checked || false,
        overwrite_nfo: false
    };
    if (nasShowFolder) {
        payload.nas_show_folder = nasShowFolder;
    }

    // Collect NFO overrides
    const nfoOverrides = {
        show: {},
        episodes: {}
    };
    const showTitle = document.getElementById("series-nfo-title")?.value?.trim();
    const showYear = document.getElementById("series-nfo-year")?.value?.trim();
    const showPlot = document.getElementById("series-nfo-plot")?.value?.trim();
    if (showTitle) nfoOverrides.show.title = showTitle;
    if (showYear) nfoOverrides.show.year = showYear;
    if (showPlot) nfoOverrides.show.plot = showPlot;

    if (!isManualSeriesMode) {
        rows.forEach((row, index) => {
            const file = row.getAttribute("data-file");
            const select = document.getElementById(`match-select-${index}`);
            if (select && select.value !== "skip") {
                const epTitle = document.getElementById(`episode-nfo-title-${index}`)?.value?.trim();
                const epAired = document.getElementById(`episode-nfo-aired-${index}`)?.value?.trim();
                const epPlot = document.getElementById(`episode-nfo-plot-${index}`)?.value?.trim();

                const epOverrides = {};
                if (epTitle) epOverrides.title = epTitle;
                if (epAired) epOverrides.aired = epAired;
                if (epPlot) epOverrides.plot = epPlot;

                if (Object.keys(epOverrides).length > 0) {
                    nfoOverrides.episodes[file] = epOverrides;
                }
            }
        });
    }
    payload.nfo_overrides = nfoOverrides;

    const finalPayload = prepareSeriesPayload(selectedShow, payload);
    openPreviewModal(finalPayload);
}

async function executeMovieWorkflow() {
    if (activeProjectsProcessing && activeProjectsProcessing.has(currentProject || "")) {
        alert("Dieses Projekt wird bereits verarbeitet oder befindet sich in der Warteschlange!");
        return;
    }
    if (!selectedMovie) {
        alert("Bitte zuerst einen Film suchen und auswählen!");
        return;
    }

    const convert = document.getElementById("movie-option-convert").checked;
    const deleteOrig = document.getElementById("movie-option-delete").checked;
    const copyNas = document.getElementById("movie-option-copy-nas").checked;
    const copyPcloud = document.getElementById("movie-option-copy-pcloud").checked;
    const nasDestId = document.getElementById("movie-nas-destination").value;
    const pcloudDestId = document.getElementById("movie-pcloud-destination").value;
    const quality = document.getElementById("movie-quality-slider") ? parseInt(document.getElementById("movie-quality-slider").value, 10) : 60;

    let titleVal = document.getElementById("movie-nfo-title")?.value?.trim() || selectedMovie.name;
    titleVal = titleVal.replace(/\s*\(Mediathek.*?\)/g, "").replace(/\s*\(Freie Mediathek.*?\)/g, "").trim();

    const yearVal = document.getElementById("movie-nfo-year")?.value?.trim();
    let finalMovieName = titleVal;
    if (yearVal && /^\d{4}$/.test(yearVal)) {
        titleVal = titleVal.replace(/\s*\(\d{4}\)$/, "").trim();
        finalMovieName = `${titleVal} (${yearVal})`;
    }

    const payload = {
        media_type: "movie",
        project_name: currentProject,
        movie_name: finalMovieName,
        movie_id: selectedMovie.id,
        provider: selectedMovie.provider,
        convert: convert,
        quality: quality,
        delete_original: deleteOrig,
        copy_to_nas: copyNas,
        copy_to_pcloud: copyPcloud,
        destination_id: nasDestId,
        nas_destination_id: nasDestId,
        pcloud_destination_id: pcloudDestId,
        overwrite_nfo: false
    };

    // Collect NFO overrides
    const nfoOverrides = {
        movie: {}
    };
    const movieTitle = document.getElementById("movie-nfo-title")?.value?.trim();
    const movieYear = document.getElementById("movie-nfo-year")?.value?.trim();
    const moviePlot = document.getElementById("movie-nfo-plot")?.value?.trim();
    if (movieTitle) nfoOverrides.movie.title = movieTitle;
    if (movieYear) nfoOverrides.movie.year = movieYear;
    if (moviePlot) nfoOverrides.movie.plot = moviePlot;
    payload.nfo_overrides = nfoOverrides;

    openPreviewModal(payload);
}

// ==========================================================================
// YOUTUBE DOWNLOADER PIPELINE HANDLERS
// ==========================================================================
async function analyseYtLink(isHandoff = false) {
    if (isHandoff !== true) {
        ytDownloaderMergeMode = false;
        ytDownloaderMergeItems = [];
        ytDownloaderMergeSubId = null;
    }

    const url = document.getElementById("yt-url").value.trim();
    if (!url) {
        alert("Bitte eine gültige YouTube-/Mediathek-URL eingeben!");
        return;
    }

    const loading = document.getElementById("yt-loading-indicator");
    const detailsPanel = document.getElementById("yt-details-panel");

    loading.classList.remove("hidden");
    detailsPanel.classList.add("hidden");

    try {
        const response = await fetch('/api/yt/fetch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url })
        });
        if (!response.ok) {
            if (response.status === 401) {
                alert("Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.");
                window.location.reload();
                return;
            }
            alert("Fehler bei der Link-Analyse. Bitte Logs prüfen.");
            loading.classList.add("hidden");
            return;
        }
        const data = await response.json();
        if (data.error) {
            alert("Fehler: " + data.error);
            loading.classList.add("hidden");
            return;
        }

        ytFetchedInfo = data;

        // Render Preview Info
        const previewContainer = document.getElementById("yt-video-info-preview");
        const minutes = Math.floor(data.duration / 60);
        const seconds = Math.floor(data.duration % 60);
        const durationStr = `${minutes}:${seconds.toString().padStart(2, '0')} Min.`;

        previewContainer.innerHTML = `
            <div class="yt-preview-box">
                ${data.thumbnail ? `<div class="yt-preview-thumbnail" style="background-image: url('${data.thumbnail}')"></div>` : ''}
                <div class="yt-preview-title">${data.title}</div>
                <div class="yt-preview-meta">
                    <span>👤 ${data.uploader}</span>
                    <span>⏱️ ${durationStr}</span>
                </div>
            </div>
        `;

        // Populate Formats/Resolutions
        const formatSelect = document.getElementById("yt-format-select");
        formatSelect.innerHTML = "";

        data.resolutions.forEach(optData => {
            const opt = document.createElement("option");
            opt.value = optData.id;
            opt.textContent = optData.label;
            formatSelect.appendChild(opt);
        });

        // Populate Subtitles Checkboxes
        const subsContainer = document.getElementById("yt-subtitles-container");
        subsContainer.innerHTML = "";
        if (data.subtitles.length === 0) {
            subsContainer.innerHTML = '<span class="text-muted" style="font-size:12px;">Keine Untertitel gefunden.</span>';
        } else {
            data.subtitles.forEach(sub => {
                const label = document.createElement("label");
                label.className = "checkbox-container";
                label.style.fontSize = "12px";
                label.style.paddingLeft = "22px";
                label.style.marginBottom = "5px";
                label.innerHTML = `
                    <input type="checkbox" name="yt-subs" value="${sub}" ${['de', 'deu', 'ger'].includes(sub.toLowerCase()) ? 'checked' : ''}>
                    <span class="checkmark" style="height:14px; width:14px; top:2px;"></span>
                    ${sub}
                `;
                subsContainer.appendChild(label);
            });
        }

        // Handle Merge Mode VS Tagging/Trim sections visibility
        const taggingSection = document.getElementById("yt-tagging-section");
        const trimSection = document.getElementById("yt-trim-section");
        const mergeDetailsSection = document.getElementById("yt-merge-details-section");

        if (ytDownloaderMergeMode) {
            if (taggingSection) taggingSection.classList.add("hidden");
            if (trimSection) trimSection.classList.add("hidden");
            if (mergeDetailsSection) {
                mergeDetailsSection.classList.remove("hidden");
                renderDownloaderMergeItems();
            }
        } else {
            if (taggingSection) taggingSection.classList.remove("hidden");
            if (trimSection) trimSection.classList.remove("hidden");
            if (mergeDetailsSection) mergeDetailsSection.classList.add("hidden");

            // Reset Search Fields
            document.getElementById("yt-meta-mode").value = "youtube";
            toggleYtMetaSection();
        }

        // Show Panel
        detailsPanel.classList.remove("hidden");

    } catch (e) {
        alert("Fehler: " + e.message);
    } finally {
        loading.classList.add("hidden");
    }
}

function renderDownloaderMergeItems() {
    const listContainer = document.getElementById("yt-merge-details-list");
    if (!listContainer) return;

    listContainer.innerHTML = "";

    ytDownloaderMergeItems.forEach((item, index) => {
        const row = document.createElement("div");
        row.className = "merge-item-row";
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.justifyContent = "space-between";
        row.style.gap = "10px";
        row.style.background = "rgba(255,255,255,0.02)";
        row.style.border = "1px solid var(--border-glass)";
        row.style.borderRadius = "var(--radius-sm)";
        row.style.padding = "8px 12px";
        row.style.transition = "all 0.2s ease";

        // Left part: Checkbox + Thumbnail + Title
        const left = document.createElement("div");
        left.style.display = "flex";
        left.style.alignItems = "center";
        left.style.gap = "10px";
        left.style.flex = "1";
        left.style.minWidth = "0";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = item.checked;
        checkbox.disabled = item.isInitial; // Initial item must be checked
        checkbox.style.cursor = item.isInitial ? "default" : "pointer";
        checkbox.addEventListener("change", (e) => {
            item.checked = e.target.checked;
            const checked = ytDownloaderMergeItems.filter(x => x.checked);
            const unchecked = ytDownloaderMergeItems.filter(x => !x.checked);
            ytDownloaderMergeItems = [...checked, ...unchecked];
            renderDownloaderMergeItems();
        });
        left.appendChild(checkbox);

        if (item.thumbnail) {
            const img = document.createElement("img");
            img.className = "poster-img";
            img.setAttribute("data-fallback", "true");
            img.setAttribute("alt", item.title || "Video");
            img.setAttribute("data-media-type", "tv");
            img.style.width = "54px";
            img.style.height = "30px";
            img.style.objectFit = "cover";
            img.style.borderRadius = "2px";
            img.src = item.thumbnail;
            left.appendChild(img);
        } else {
            const fallback = createFallbackPoster(item.title || "Video", true, "54px", "30px");
            left.appendChild(fallback);
        }

        const info = document.createElement("div");
        info.style.minWidth = "0";

        const titleSpan = document.createElement("div");
        titleSpan.style.fontWeight = "500";
        titleSpan.style.fontSize = "12px";
        titleSpan.style.whiteSpace = "nowrap";
        titleSpan.style.overflow = "hidden";
        titleSpan.style.textOverflow = "ellipsis";
        titleSpan.textContent = item.title;
        titleSpan.title = item.title;
        info.appendChild(titleSpan);

        if (item.isInitial) {
            const badge = document.createElement("span");
            badge.style.fontSize = "9px";
            badge.style.background = "rgba(16, 185, 129, 0.15)";
            badge.style.color = "var(--success)";
            badge.style.padding = "1px 4px";
            badge.style.borderRadius = "3px";
            badge.style.marginLeft = "0px";
            badge.style.fontWeight = "bold";
            badge.textContent = "AUSGANGS-VIDEO";
            info.appendChild(badge);
        }

        left.appendChild(info);
        row.appendChild(left);

        // Right part: Re-order controls
        const right = document.createElement("div");
        right.style.display = "flex";
        right.style.gap = "4px";

        const btnUp = document.createElement("button");
        btnUp.className = "btn btn-secondary btn-xs";
        btnUp.style.padding = "2px 6px";
        btnUp.innerHTML = "▲";
        btnUp.disabled = index === 0;
        btnUp.addEventListener("click", () => {
            // Swap with previous
            const temp = ytDownloaderMergeItems[index - 1];
            ytDownloaderMergeItems[index - 1] = ytDownloaderMergeItems[index];
            ytDownloaderMergeItems[index] = temp;
            renderDownloaderMergeItems();
        });

        const btnDown = document.createElement("button");
        btnDown.className = "btn btn-secondary btn-xs";
        btnDown.style.padding = "2px 6px";
        btnDown.innerHTML = "▼";
        btnDown.disabled = index === ytDownloaderMergeItems.length - 1;
        btnDown.addEventListener("click", () => {
            // Swap with next
            const temp = ytDownloaderMergeItems[index + 1];
            ytDownloaderMergeItems[index + 1] = ytDownloaderMergeItems[index];
            ytDownloaderMergeItems[index] = temp;
            renderDownloaderMergeItems();
        });

        right.appendChild(btnUp);
        right.appendChild(btnDown);
        row.appendChild(right);

        listContainer.appendChild(row);
    });
}

function toggleYtMetaSection() {
    const mode = document.getElementById("yt-meta-mode").value;
    const movieSec = document.getElementById("yt-movie-search-section");
    const tvSec = document.getElementById("yt-series-search-section");

    movieSec.classList.add("hidden");
    tvSec.classList.add("hidden");

    // Clear selections
    ytSelectedMovie = null;
    ytSelectedShow = null;
    document.getElementById("yt-selected-movie-card").classList.add("hidden");
    document.getElementById("yt-selected-series-card").classList.add("hidden");
    document.getElementById("yt-movie-search-results").innerHTML = "";
    document.getElementById("yt-series-search-results").innerHTML = "";
    document.getElementById("yt-movie-search-query").value = "";
    document.getElementById("yt-series-search-query").value = "";

    if (mode === "movie") {
        movieSec.classList.remove("hidden");
        // Pre-fill query
        document.getElementById("yt-movie-search-query").value = ytFetchedInfo ? ytFetchedInfo.title.replace(/\([0-9]{4}\)/g, "").trim() : "";
    } else if (mode === "tv") {
        tvSec.classList.remove("hidden");
        // Pre-fill query
        document.getElementById("yt-series-search-query").value = ytFetchedInfo ? ytFetchedInfo.title.replace(/\([0-9]{4}\)/g, "").trim() : "";
    }
}

let currentSearchYtMovieController = null;
let lastSearchYtMovieQuery = "";
let currentSearchYtSeriesController = null;
let lastSearchYtSeriesQuery = "";

async function searchYtMovie() {
    const query = document.getElementById("yt-movie-search-query").value.trim();
    const resultsContainer = document.getElementById("yt-movie-search-results");
    if (!query) return;

    if (currentSearchYtMovieController) {
        currentSearchYtMovieController.abort();
    }
    currentSearchYtMovieController = new AbortController();
    lastSearchYtMovieQuery = query;

    resultsContainer.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const response = await fetch(`/api/search?type=movie&q=${encodeURIComponent(query)}`, {
            signal: currentSearchYtMovieController.signal
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP-Fehler ${response.status}`);
        }
        const data = await response.json();
        if (!Array.isArray(data)) {
            throw new Error(data.error || "Unerwartetes Antwortformat vom Server");
        }

        if (query !== lastSearchYtMovieQuery) return;

        if (data.length === 0) {
            resultsContainer.innerHTML = '<p class="text-muted text-center" style="padding:10px;">Keine Filme gefunden.</p>';
            return;
        }

        let html = "";
        data.forEach(item => {
            const escapedId = escapeHTML(item.id);
            const escapedName = escapeHTML(item.name);
            const escapedProvider = escapeHTML(item.provider);
            html += `
                <div class="search-item yt-movie-search-item" data-id="${escapedId}" data-name="${escapedName}" data-provider="${escapedProvider}">
                    <div class="search-item-name">${escapedName}</div>
                    <div class="search-item-provider">Metadatendienst: ${escapedProvider}</div>
                </div>
            `;
        });
        resultsContainer.innerHTML = html;

        resultsContainer.querySelectorAll(".yt-movie-search-item").forEach(item => {
            item.addEventListener("click", () => {
                ytSelectedMovie = {
                    id: item.getAttribute("data-id"),
                    name: item.getAttribute("data-name"),
                    provider: item.getAttribute("data-provider")
                };

                const card = document.getElementById("yt-selected-movie-card");
                document.getElementById("yt-selected-movie-title").textContent = ytSelectedMovie.name;
                document.getElementById("yt-selected-movie-info").textContent = `Provider: ${ytSelectedMovie.provider} (ID: ${ytSelectedMovie.id})`;
                card.classList.remove("hidden");
            });
        });

    } catch (e) {
        if (e.name === 'AbortError') return; // Ignore aborted requests
        if (query !== lastSearchYtMovieQuery) return;
        resultsContainer.innerHTML = `<p class="text-center text-danger">Suchfehler: ${e.message || e}</p>`;
    }
}

async function searchYtSeries() {
    const query = document.getElementById("yt-series-search-query").value.trim();
    const resultsContainer = document.getElementById("yt-series-search-results");
    if (!query) return;

    if (currentSearchYtSeriesController) {
        currentSearchYtSeriesController.abort();
    }
    currentSearchYtSeriesController = new AbortController();
    lastSearchYtSeriesQuery = query;

    resultsContainer.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const response = await fetch(`/api/search?type=tv&q=${encodeURIComponent(query)}`, {
            signal: currentSearchYtSeriesController.signal
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP-Fehler ${response.status}`);
        }
        const data = await response.json();
        if (!Array.isArray(data)) {
            throw new Error(data.error || "Unerwartetes Antwortformat vom Server");
        }

        if (query !== lastSearchYtSeriesQuery) return;

        if (data.length === 0) {
            resultsContainer.innerHTML = '<p class="text-muted text-center" style="padding:10px;">Keine Serie gefunden.</p>';
            return;
        }

        let html = "";
        data.forEach(item => {
            const escapedId = escapeHTML(item.id);
            const escapedName = escapeHTML(item.name);
            const escapedProvider = escapeHTML(item.provider);
            html += `
                <div class="search-item yt-series-search-item" data-id="${escapedId}" data-name="${escapedName}" data-provider="${escapedProvider}">
                    <div class="search-item-name">${escapedName}</div>
                    <div class="search-item-provider">Metadatendienst: ${escapedProvider}</div>
                </div>
            `;
        });
        resultsContainer.innerHTML = html;

        resultsContainer.querySelectorAll(".yt-series-search-item").forEach(item => {
            item.addEventListener("click", () => {
                ytSelectedShow = {
                    id: item.getAttribute("data-id"),
                    name: item.getAttribute("data-name"),
                    provider: item.getAttribute("data-provider")
                };

                const card = document.getElementById("yt-selected-series-card");
                document.getElementById("yt-selected-series-title").textContent = ytSelectedShow.name;
                document.getElementById("yt-selected-series-info").textContent = `Provider: ${ytSelectedShow.provider} (ID: ${ytSelectedShow.id})`;
                card.classList.remove("hidden");

                const ytOverrideInput = document.getElementById("yt-series-nas-folder-override");
                if (ytOverrideInput) {
                    if (window.ytNasFolderSelected) {
                        ytOverrideInput.value = window.ytNasFolderSelected;
                    } else {
                        ytOverrideInput.value = cleanSeriesName(ytSelectedShow.name);
                    }
                    autoMatchNasFolder("yt-series-nas-folder-override", "yt-nas-destination", ytOverrideInput.value);
                }

                fetchYtNasSeasons();
            });
        });

    } catch (e) {
        if (e.name === 'AbortError') return; // Ignore aborted requests
        if (query !== lastSearchYtSeriesQuery) return;
        resultsContainer.innerHTML = `<p class="text-center text-danger">Suchfehler: ${e.message || e}</p>`;
    }
}

function resetYtDownload() {
    document.getElementById("yt-url").value = "";
    document.getElementById("yt-details-panel").classList.add("hidden");
    document.getElementById("yt-video-info-preview").innerHTML = "";
    const overrideInput = document.getElementById("yt-series-nas-folder-override");
    if (overrideInput) {
        overrideInput.value = "";
    }
    ytFetchedInfo = null;
    ytSelectedMovie = null;
    ytSelectedShow = null;
    ytEpisodesData = {};
    ytDownloaderMergeMode = false;
    ytDownloaderMergeItems = [];
    ytDownloaderMergeSubId = null;
}

async function startYtPipeline() {
    if (!ytFetchedInfo) {
        alert("Bitte zuerst Video-Informationen abrufen ('Analysieren' klicken)!");
        return;
    }

    if (ytDownloaderMergeMode) {
        const finalTitleInput = document.getElementById("yt-merge-details-title");
        const finalTitle = finalTitleInput ? finalTitleInput.value.trim() : "";
        if (!finalTitle) {
            alert("Bitte gib einen Dateinamen für das zusammengefügte Video an!");
            return;
        }

        const selectedItems = ytDownloaderMergeItems.filter(item => item.checked);
        if (selectedItems.length === 0) {
            alert("Bitte wähle mindestens ein Video aus!");
            return;
        }

        const urls = selectedItems.map(item => item.url);
        const videoIdsToRemove = selectedItems.map(item => item.id);

        const copyToNas = document.getElementById("yt-option-copy-nas").checked;
        const copyToPcloud = document.getElementById("yt-option-copy-pcloud").checked;
        const copyToLocal = document.getElementById("yt-option-copy-local").checked;

        const nasDest = document.getElementById("yt-nas-destination").value;
        const pcloudDest = document.getElementById("yt-pcloud-destination").value;
        const localDest = document.getElementById("yt-local-destination").value;

        const ytFormat = document.getElementById("yt-format-select").value;

        expandConsole();
        appendConsoleLog(`[System]: Starte Merge-Job für "${finalTitle}" mit ${urls.length} Teilen...`);

        try {
            const res = await fetch("/api/youtube/merge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    urls: urls,
                    title: finalTitle,
                    subscription_id: ytDownloaderMergeSubId,
                    video_ids_to_remove: videoIdsToRemove,
                    thumbnail: selectedItems[0].thumbnail || "",
                    copy_to_nas: copyToNas,
                    copy_to_pcloud: copyToPcloud,
                    copy_to_local: copyToLocal,
                    nas_destination_id: nasDest,
                    pcloud_destination_id: pcloudDest,
                    local_destination_id: localDest,
                    yt_format: ytFormat
                })
            });
            const data = await res.json();

            if (res.ok && data.task_id) {
                appendConsoleLog(`[System]: Merge-Job im Hintergrund gestartet (Task ID: ${data.task_id}).`);

                // Clear the merge mode state
                ytDownloaderMergeMode = false;
                ytDownloaderMergeItems = [];
                ytDownloaderMergeSubId = null;

                // Hide details panel
                document.getElementById("yt-details-panel").classList.add("hidden");

                // Switch to Queue panel automatically
                if (typeof window.openQueue === "function") {
                    window.openQueue();
                }
            } else {
                appendConsoleLog(`[System]: Fehler beim Starten des Merge-Jobs: ${data.error || 'Serverfehler'}`);
            }
        } catch (err) {
            console.error(err);
            appendConsoleLog(`[System]: Netzwerkfehler beim Starten des Zusammenfügens: ${err}`);
        }
        return;
    }

    const mode = document.getElementById("yt-meta-mode").value;
    if (mode === "movie" && !ytSelectedMovie) {
        alert("Bitte wähle zuerst einen Film aus!");
        return;
    }
    if (mode === "tv" && !ytSelectedShow) {
        alert("Bitte wähle zuerst eine Serie aus!");
        return;
    }

    // Subtitles
    const checkedSubs = [];
    document.querySelectorAll("input[name='yt-subs']:checked").forEach(cb => {
        checkedSubs.push(cb.value);
    });

    // Payload building
    const payload = {
        media_type: "youtube",
        yt_url: document.getElementById("yt-url").value.trim(),
        yt_format: document.getElementById("yt-format-select").value,
        yt_subtitles: checkedSubs,
        yt_embed_thumbnail: true,
        yt_thumbnail: ytFetchedInfo ? ytFetchedInfo.thumbnail : "",

        split_chapters: document.getElementById("yt-split-chapters").checked,
        open_losslesscut: document.getElementById("yt-open-losslesscut").checked,
        trim_start: document.getElementById("yt-trim-start").value.trim(),
        trim_end: document.getElementById("yt-trim-end").value.trim(),

        metadata_mode: mode,
        copy_to_nas: document.getElementById("yt-option-copy-nas").checked,
        copy_to_pcloud: document.getElementById("yt-option-copy-pcloud").checked,
        copy_to_local: document.getElementById("yt-option-copy-local").checked,
        destination_id: document.getElementById("yt-nas-destination").value,
        nas_destination_id: document.getElementById("yt-nas-destination").value,
        pcloud_destination_id: document.getElementById("yt-pcloud-destination").value,
        local_destination_id: document.getElementById("yt-local-destination").value
    };

    // Enrich details based on mode
    if (mode === "movie") {
        payload.movie_id = ytSelectedMovie.id;
        payload.movie_name = ytSelectedMovie.name;
        payload.provider = ytSelectedMovie.provider;
    } else if (mode === "tv") {
        const seasonVal = parseInt(document.getElementById("yt-series-season").value, 10);
        if (!isNaN(seasonVal) && seasonVal >= 1000) {
            const confirmed = confirm(`Warnung: Die Staffel-Nummer ist eine Jahreszahl (${seasonVal})! Bitte prüfen, ob das korrekt ist (z.B. Staffel 56 statt 2026). Möchtest du trotzdem fortfahren?`);
            if (!confirmed) {
                return;
            }
        }
        payload.show_id = ytSelectedShow.id;
        payload.show_name = ytSelectedShow.name;
        payload.season = seasonVal;
        payload.provider = ytSelectedShow.provider;
        const nasShowFolder = document.getElementById("yt-series-nas-folder-override")?.value?.trim();
        if (nasShowFolder) {
            payload.nas_show_folder = nasShowFolder;
        }
    } else {
        // General YouTube mode
        payload.yt_title = ytFetchedInfo.title;
        payload.yt_uploader = ytFetchedInfo.uploader;
        payload.yt_description = ytFetchedInfo.description;
    }

    expandConsole();
    appendConsoleLog("[System]: Starte YouTube Download Pipeline...");

    try {
        const response = await fetch("/api/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (response.ok && data.task_id) {
            connectLogStream();
            startYtTaskPolling(data.task_id);
            document.getElementById("yt-details-panel").classList.add("hidden");
        } else {
            appendConsoleLog("[System] Fehler beim Starten der Pipeline.");
        }
    } catch (e) {
        appendConsoleLog(`[System] Fehler: ${e}`);
    }
}

async function markYtCutDone() {
    if (!activeYtTaskId) return;
    try {
        const response = await fetch("/api/yt/cut-done", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ task_id: activeYtTaskId })
        });
        if (response.ok) {
            appendConsoleLog("[System] Schnitt-Freigabe gesendet. Warte auf Segment-Scan...");
            document.getElementById("yt-losslesscut-modal").classList.add("hidden");
        }
    } catch (e) {
        console.error("Error setting cut done:", e);
    }
}

async function finalizeYtMapping() {
    if (!activeYtTaskId) return;

    const mapping = {};
    document.querySelectorAll(".mapping-row").forEach((row, index) => {
        const seg = row.getAttribute("data-segment");
        const val = document.getElementById(`yt-seg-select-${index}`).value;
        if (val !== "skip") {
            mapping[seg] = parseInt(val, 10);
        }
    });

    try {
        const response = await fetch("/api/yt/finalize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                task_id: activeYtTaskId,
                mapping: mapping
            })
        });
        if (response.ok) {
            appendConsoleLog("[System] Episodenzuordnung gesendet.");
            document.getElementById("yt-mapping-modal").classList.add("hidden");
            stopYtTaskPolling();
        }
    } catch (e) {
        console.error("Error sending finalize mapping:", e);
    }
}

async function loadYtEpisodesForMapping(provider, showId, season) {
    try {
        const response = await fetch(`/api/fetch-episodes?provider=${provider}&show_id=${showId}&season=${season}`);
        ytEpisodesData = await response.json();
    } catch (e) {
        console.error("Error loading mapping episodes:", e);
    }
}

function renderYtMappingRows(segments) {
    const listContainer = document.getElementById("yt-mapping-list");
    let html = "";
    segments.forEach((seg, index) => {
        const guessed = guessEpisodeNumber(seg);
        html += `
            <div class="mapping-row" data-segment="${seg}">
                <div class="filename" title="${seg}">${seg}</div>
                <div class="match-selection">
                    <select class="match-select yt-segment-select" id="yt-seg-select-${index}">
                        <option value="skip">-- Überspringen --</option>
                        ${Object.entries(ytEpisodesData).map(([num, ep]) => {
                            const title = typeof ep === 'object' ? ep.title : ep;
                            const isSel = guessed === parseInt(num, 10);
                            return `<option value="${num}" ${isSel ? 'selected' : ''}>Episode ${num}: ${title}</option>`;
                        }).join('')}
                    </select>
                    <div class="selected-match-info" id="yt-selected-match-info-${index}"></div>
                </div>
            </div>
        `;
    });
    listContainer.innerHTML = html;

    // Bind change listeners to update the selected match info
    segments.forEach((seg, index) => {
        const select = document.getElementById(`yt-seg-select-${index}`);
        const info = document.getElementById(`yt-selected-match-info-${index}`);
        if (select && info) {
            const updateInfo = () => {
                const selectedOption = select.options[select.selectedIndex];
                if (selectedOption) {
                    const text = selectedOption.text;
                    const val = selectedOption.value;
                    if (val === 'skip') {
                        info.innerHTML = '<span style="display:inline-flex; align-items:center; gap:4px; color:var(--text-muted);"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-circle" style="height:12px; width:12px; color:var(--warning);"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>Wird übersprungen</span>';
                        info.classList.remove("matched");
                    } else {
                        info.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px; color:var(--success);"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check" style="height:12px; width:12px;"><polyline points="20 6 9 17 4 12"/></svg>Zugeordnet: ${escapeHTML(text)}</span>`;
                        info.classList.add("matched");
                    }
                }
            };
            select.addEventListener("change", updateInfo);
            updateInfo();
        }
    });
}

function startYtTaskPolling(taskId) {
    activeYtTaskId = taskId;
    if (ytStatusInterval) clearInterval(ytStatusInterval);

    let mappingRendered = false;

    ytStatusInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/yt/segments?taskId=${taskId}`);
            if (!response.ok) {
                stopYtTaskPolling();
                return;
            }
            const data = await response.json();
            if (data.error) {
                stopYtTaskPolling();
                return;
            }

            const state = data.state;
            const losslessModal = document.getElementById("yt-losslesscut-modal");
            const mappingModal = document.getElementById("yt-mapping-modal");

            if (state === "waiting_for_cut") {
                losslessModal.classList.remove("hidden");
                mappingModal.classList.add("hidden");
            } else if (state === "waiting_for_mapping") {
                losslessModal.classList.add("hidden");
                mappingModal.classList.remove("hidden");

                if (!mappingRendered) {
                    mappingRendered = true;
                    const mode = document.getElementById("yt-meta-mode").value;
                    if (mode === "tv" && ytSelectedShow) {
                        const season = document.getElementById("yt-series-season").value;
                        await loadYtEpisodesForMapping(ytSelectedShow.provider, ytSelectedShow.id, season);
                        renderYtMappingRows(data.segments);
                    }
                }
            } else {
                losslessModal.classList.add("hidden");
                mappingModal.classList.add("hidden");
            }
        } catch (e) {
            console.error("Error polling task:", e);
        }
    }, 2000);
}

function stopYtTaskPolling() {
    if (ytStatusInterval) {
        clearInterval(ytStatusInterval);
        ytStatusInterval = null;
    }
    document.getElementById("yt-losslesscut-modal").classList.add("hidden");
    document.getElementById("yt-mapping-modal").classList.add("hidden");
    activeYtTaskId = null;
}

// ==========================================================================
// YOUTUBE SUBSCRIPTIONS MONITORING HANDLERS
// ==========================================================================
let currentSubscriptions = [];

async function loadSubscriptions() {
    try {
        const [settingsRes, subsRes] = await Promise.all([
            fetch("/api/settings"),
            fetch("/api/youtube/subscriptions")
        ]);

        if (settingsRes.ok) {
            currentSettings = await settingsRes.json();
            updateDestinationDropdowns();
        }

        if (subsRes.ok) {
            const data = await subsRes.json();
            currentSubscriptions = data.subscriptions || [];
            renderSubscriptionsList();
        }
    } catch (e) {
        console.error("Error loading subscriptions:", e);
        const listContainer = document.getElementById("youtube-abos-list");
        if (listContainer) {
            listContainer.innerHTML = `<div style="text-align:center; padding:30px; color:var(--danger);">Fehler beim Laden der Abonnements.</div>`;
        }
    }
}

function renderSubscriptionsList() {
    const listContainer = document.getElementById("youtube-abos-list");
    if (!listContainer) return;

    if (currentSubscriptions.length === 0) {
        listContainer.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">Keine aktiven Abonnements vorhanden. Füge oben ein neues hinzu.</div>`;
        return;
    }

    listContainer.innerHTML = "";

    // Sort subscriptions: enabled ones at the top, disabled ones at the bottom
    const sortedSubs = [...currentSubscriptions].sort((a, b) => {
        if (a.enabled === b.enabled) return 0;
        return a.enabled ? -1 : 1;
    });

    sortedSubs.forEach((sub) => {
        const item = document.createElement("div");
        item.className = "subscription-item";
        item.dataset.id = sub.id;

        // Inline premium styles with transitions
        item.style.background = "rgba(255, 255, 255, 0.02)";
        item.style.border = "1px solid var(--border-glass)";
        item.style.borderRadius = "var(--radius-md)";
        item.style.padding = "12px 20px";
        item.style.display = "flex";
        item.style.flexDirection = "column";
        item.style.gap = "0";
        item.style.transition = "all 0.3s ease";

        const headerRow = document.createElement("div");
        headerRow.style.display = "flex";
        headerRow.style.justifyContent = "space-between";
        headerRow.style.alignItems = "center";
        headerRow.style.gap = "15px";
        headerRow.style.flexWrap = "wrap";

        // Find category name
        const cats = currentSettings.sync_categories || [];

        // Format last checked timestamp
        let lastCheckedStr = "Nie";
        if (sub.last_checked) {
            const date = new Date(sub.last_checked * 1000);
            lastCheckedStr = date.toLocaleString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        // Info column
        const infoCol = document.createElement("div");
        infoCol.style.flex = "1";
        infoCol.style.minWidth = "250px";

        const titleRow = document.createElement("div");
        titleRow.style.display = "flex";
        titleRow.style.alignItems = "center";
        titleRow.style.gap = "10px";
        titleRow.style.marginBottom = "5px";

        // Collapse/Expand Caret
        const expandCaret = document.createElement("span");
        expandCaret.style.display = "inline-block";
        expandCaret.style.marginRight = "6px";
        expandCaret.style.color = "var(--text-muted)";
        expandCaret.style.transition = "all 0.2s ease";
        expandCaret.innerHTML = "▶";
        titleRow.appendChild(expandCaret);

        // Show YouTube channel avatar if available
        if (sub.avatar_url) {
            const avatarImg = document.createElement("img");
            avatarImg.src = sub.avatar_url;
            avatarImg.alt = "Kanal-Logo";
            avatarImg.style.width = "24px";
            avatarImg.style.height = "24px";
            avatarImg.style.borderRadius = "50%";
            avatarImg.style.objectFit = "cover";
            avatarImg.style.border = "1px solid rgba(255, 255, 255, 0.15)";
            avatarImg.style.marginRight = "8px";
            titleRow.appendChild(avatarImg);
        }

        const titleSpan = document.createElement("span");
        titleSpan.style.fontWeight = "600";
        titleSpan.style.fontSize = "15px";
        titleSpan.style.color = "var(--text-main)";
        titleSpan.textContent = sub.name;
        titleRow.appendChild(titleSpan);

        // Active indicator badge
        const activeBadge = document.createElement("span");
        activeBadge.style.fontSize = "10px";
        activeBadge.style.fontWeight = "bold";
        activeBadge.style.padding = "2px 6px";
        activeBadge.style.borderRadius = "4px";
        activeBadge.style.transition = "all 0.3s ease";

        const updateBadge = (isEnabled) => {
            if (isEnabled) {
                activeBadge.style.background = "rgba(16, 185, 129, 0.15)";
                activeBadge.style.color = "var(--success)";
                activeBadge.textContent = "AKTIV";
                item.style.opacity = "1";
                item.style.borderColor = "var(--border-glass)";
            } else {
                activeBadge.style.background = "rgba(239, 68, 68, 0.15)";
                activeBadge.style.color = "var(--danger)";
                activeBadge.textContent = "DEAKTIVIERT";
                item.style.opacity = "0.6";
                item.style.borderColor = "transparent";
            }
        };
        updateBadge(sub.enabled);
        titleRow.appendChild(activeBadge);

        let pendingVideos = sub.pending_videos || [];
        if (pendingVideos.length > 0) {
            const pendingBadge = document.createElement("span");
            pendingBadge.style.fontSize = "10px";
            pendingBadge.style.fontWeight = "bold";
            pendingBadge.style.padding = "2px 6px";
            pendingBadge.style.borderRadius = "4px";
            pendingBadge.style.background = "rgba(255, 159, 67, 0.15)";
            pendingBadge.style.color = "rgb(255, 159, 67)";
            pendingBadge.style.marginLeft = "5px";
            pendingBadge.textContent = `${pendingVideos.length} AUSSTEHEND`;
            titleRow.appendChild(pendingBadge);
        }

        infoCol.appendChild(titleRow);

        // Collapsible details container
        const detailsContainer = document.createElement("div");
        detailsContainer.style.display = "none";
        detailsContainer.style.flexDirection = "column";
        detailsContainer.style.gap = "15px";
        detailsContainer.style.marginTop = "15px";
        detailsContainer.style.paddingTop = "10px";
        detailsContainer.style.borderTop = "1px solid rgba(255, 255, 255, 0.05)";

        // Details row
        const detailsRow = document.createElement("div");
        detailsRow.style.fontSize = "12.5px";
        detailsRow.style.color = "var(--text-muted)";
        detailsRow.style.display = "flex";
        detailsRow.style.flexWrap = "wrap";
        detailsRow.style.gap = "15px";

        // URL link
        const urlItem = document.createElement("div");
        urlItem.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-external-link" style="height:12px; width:12px; color:var(--text-muted);"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg><a href="${sub.url.startsWith('http') ? sub.url : '#'}" target="_blank" style="color: var(--accent); text-decoration: none;">${sub.url.startsWith('http') ? 'Link öffnen' : 'Suchbegriff: "' + sub.url + '"'}</a></span>`;
        detailsRow.appendChild(urlItem);

        // Filter badge
        if (sub.search_filter && sub.search_filter.trim() !== "") {
            const filterItem = document.createElement("div");
            filterItem.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search" style="height:12px; width:12px; color:var(--text-muted);"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>Filter: <span style="background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px; color: var(--text-main); font-weight: 500;">"${sub.search_filter}"</span></span>`;
            detailsRow.appendChild(filterItem);
        }

        // Category/Transfer destination badges
        const copyToNas = sub.copy_to_nas !== false;
        if (copyToNas) {
            const nasId = sub.nas_destination_id || sub.destination_id;
            const cat = cats.find(c => c.id === nasId);
            const catName = cat ? cat.name : (nasId || "Unbekannt");
            const nasItem = document.createElement("div");
            nasItem.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-server" style="height:12px; width:12px; color:var(--text-muted);"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>NAS: <span style="color: var(--text-main); font-weight: 500;">${escapeHTML(catName)}</span></span>`;
            detailsRow.appendChild(nasItem);
        }

        const copyToPcloud = !!sub.copy_to_pcloud;
        if (copyToPcloud) {
            const pcloudId = sub.pcloud_destination_id || sub.destination_id;
            const cat = cats.find(c => c.id === pcloudId);
            const catName = cat ? cat.name : (pcloudId || "Unbekannt");
            const pcloudItem = document.createElement("div");
            pcloudItem.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-cloud" style="height:12px; width:12px; color:var(--text-muted);"><path d="M17.5 19A3.5 3.5 0 0 0 21 15.5c0-2.79-2.54-4.5-5-4.5-.42-1.02-1.2-1.85-2.2-2.4C12.8 8.05 11.9 7.7 11 7.7A4.8 4.8 0 0 0 6 12.5c0 .4.04.8.1 1.2A3.5 3.5 0 0 0 3 17.2a3.3 3.3 0 0 0 3.3 3.3c.4 0 .76-.1 1.1-.3"/></svg>pCloud: <span style="color: var(--text-main); font-weight: 500;">${escapeHTML(catName)}</span></span>`;
            detailsRow.appendChild(pcloudItem);
        }

        const copyToLocal = !!sub.copy_to_local;
        if (copyToLocal) {
            const localId = sub.local_destination_id;
            let localName = localId || "Unbekannt";
            if (localId === "__inbox__") {
                localName = "Input-Ordner";
            } else if (localId === "__outbox__") {
                localName = "Output-Ordner";
            } else if (localId && localId.startsWith("__cat_")) {
                const cat = cats.find(c => c.id === localId.substring(6));
                localName = cat ? `${cat.name} (Output)` : localId;
            } else if (localId && localId.startsWith("__custom_")) {
                try {
                    const idx = parseInt(localId.substring(9), 10);
                    const customFolder = (currentSettings.local_download_folders || [])[idx];
                    localName = customFolder ? customFolder.name : localId;
                } catch(e) {
                    localName = localId;
                }
            }
            const localItem = document.createElement("div");
            localItem.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-monitor" style="height:12px; width:12px; color:var(--text-muted);"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>Lokal: <span style="color: var(--text-main); font-weight: 500;">${escapeHTML(localName)}</span></span>`;
            detailsRow.appendChild(localItem);
        }

        if (!copyToNas && !copyToPcloud && !copyToLocal) {
            const warningItem = document.createElement("div");
            warningItem.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle" style="height:12px; width:12px; color:var(--danger);"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg><span style="color: var(--danger); font-weight: 500;">Kein Transferziel aktiviert</span></span>`;
            detailsRow.appendChild(warningItem);
        }

        // Mode badge
        const isAuto = sub.auto_download !== false;
        const modeItem = document.createElement("div");
        modeItem.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings" style="height:12px; width:12px; color:var(--text-muted);"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>Modus: <span style="color: var(--text-main); font-weight: 500;">${isAuto ? "Direkt laden" : "Freigabeliste"}</span></span>`;
        detailsRow.appendChild(modeItem);

        // Schedule badge
        const schedule = sub.schedule || "hourly";
        let scheduleText = "Stündlich";
        if (schedule === "daily") scheduleText = "Täglich";
        else if (schedule === "on_startup") scheduleText = "Beim App-Start";
        else if (schedule === "manual") scheduleText = "Nur manuell";

        const scheduleItem = document.createElement("div");
        scheduleItem.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-cw" style="height:12px; width:12px; color:var(--text-muted);"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>Aktualisierung: <span style="color: var(--text-main); font-weight: 500;">${escapeHTML(scheduleText)}</span></span>`;
        detailsRow.appendChild(scheduleItem);

        // German language filter badge
        if (sub.filter_german) {
            const deItem = document.createElement("div");
            deItem.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px;">Sprachfilter: <span style="background: rgba(16, 185, 129, 0.1); padding: 2px 6px; border-radius: 4px; color: var(--success); font-weight: 500; font-size: 11px;">Nur Deutsch</span></span>`;
            detailsRow.appendChild(deItem);
        }

        // Exclude keywords badge
        if (sub.exclude_keywords && sub.exclude_keywords.trim() !== "") {
            const excludeItem = document.createElement("div");
            excludeItem.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-ban" style="height:12px; width:12px; color:var(--danger);"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>Ausschluss: <span style="background: rgba(239, 68, 68, 0.08); padding: 2px 6px; border-radius: 4px; color: var(--danger); font-weight: 500; font-size: 11px;">"${escapeHTML(sub.exclude_keywords)}"</span></span>`;
            detailsRow.appendChild(excludeItem);
        }

        // Last checked timestamp
        const timeItem = document.createElement("div");
        timeItem.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-clock" style="height:12px; width:12px; color:var(--text-muted);"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Letzter Check: ${escapeHTML(lastCheckedStr)}</span>`;
        detailsRow.appendChild(timeItem);

        detailsContainer.appendChild(detailsRow);
        headerRow.appendChild(infoCol);

        // Controls column (Toggle + Delete)
        const ctrlCol = document.createElement("div");
        ctrlCol.style.display = "flex";
        ctrlCol.style.alignItems = "center";
        ctrlCol.style.gap = "20px";

        // Toggle Switch Container
        const switchLabel = document.createElement("label");
        switchLabel.className = "checkbox-container";
        switchLabel.style.margin = "0";
        switchLabel.style.paddingLeft = "28px";
        switchLabel.style.fontSize = "13px";
        switchLabel.style.fontWeight = "500";

        const switchInput = document.createElement("input");
        switchInput.type = "checkbox";
        switchInput.checked = !!sub.enabled;

        const switchCheckmark = document.createElement("span");
        switchCheckmark.className = "checkmark";

        const statusText = document.createTextNode(sub.enabled ? "Aktiv" : "Aus");

        switchInput.addEventListener("change", async (e) => {
            const isEnabled = e.target.checked;
            sub.enabled = isEnabled;
            statusText.textContent = isEnabled ? "Aktiv" : "Aus";
            updateBadge(isEnabled);

            // Background save without full list refresh
            await saveAllSubscriptions();
            // Re-render list to sort disabled ones to the bottom
            renderSubscriptionsList();
        });

        switchLabel.appendChild(switchInput);
        switchLabel.appendChild(switchCheckmark);
        switchLabel.appendChild(statusText);

        ctrlCol.appendChild(switchLabel);

        // Delete button
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "btn btn-danger btn-sm";
        deleteBtn.innerHTML = '<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2" style="height:13px; width:13px;"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>In Quarantäne</span>';
        deleteBtn.addEventListener("click", async () => {
            if (confirm(`Abonnement "${sub.name}" wirklich löschen?`)) {
                // Visual fadeout effect
                item.style.transform = "scale(0.9)";
                item.style.opacity = "0";

                setTimeout(async () => {
                    currentSubscriptions = currentSubscriptions.filter(s => s.id !== sub.id);
                    item.remove();
                    await saveAllSubscriptions();
                    if (currentSubscriptions.length === 0) {
                        renderSubscriptionsList();
                    }
                }, 300);
            }
        });
        ctrlCol.appendChild(deleteBtn);

        headerRow.appendChild(ctrlCol);
        item.appendChild(headerRow);

        // Render Inbox (pending_videos) if mode is manual
        pendingVideos = sub.pending_videos || [];
        if (!isAuto) {
            const inboxDiv = document.createElement("div");
            inboxDiv.style.marginTop = "10px";
            inboxDiv.style.paddingTop = "15px";
            inboxDiv.style.borderTop = "1px solid rgba(255, 255, 255, 0.05)";
            inboxDiv.style.display = "flex";
            inboxDiv.style.flexDirection = "column";
            inboxDiv.style.gap = "10px";

            const inboxHeader = document.createElement("div");
            inboxHeader.style.display = "flex";
            inboxHeader.style.justifyContent = "space-between";
            inboxHeader.style.alignItems = "center";
            inboxHeader.style.fontSize = "13px";
            inboxHeader.style.fontWeight = "600";
            inboxHeader.style.color = "var(--text-muted)";
            inboxHeader.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-inbox" style="height:13px; width:13px;"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>Freigabeliste (${pendingVideos.length} ausstehend)</span>`;
            inboxDiv.appendChild(inboxHeader);

            if (pendingVideos.length === 0) {
                const emptyMsg = document.createElement("div");
                emptyMsg.style.fontSize = "12.5px";
                emptyMsg.style.color = "var(--text-muted)";
                emptyMsg.style.fontStyle = "italic";
                emptyMsg.style.padding = "5px 0";
                emptyMsg.textContent = "Keine neuen Videos ausstehend.";
                inboxDiv.appendChild(emptyMsg);
            } else {
                const listDiv = document.createElement("div");
                listDiv.style.display = "flex";
                listDiv.style.flexDirection = "column";
                listDiv.style.gap = "8px";

                pendingVideos.forEach(v => {
                    const vRow = document.createElement("div");
                    vRow.style.display = "flex";
                    vRow.style.alignItems = "center";
                    vRow.style.justifyContent = "space-between";
                    vRow.style.gap = "12px";
                    vRow.style.background = "rgba(255, 255, 255, 0.01)";
                    vRow.style.border = "1px solid rgba(255, 255, 255, 0.03)";
                    vRow.style.borderRadius = "var(--radius-sm)";
                    vRow.style.padding = "8px 12px";
                    vRow.style.flexWrap = "wrap";
                    vRow.style.transition = "all 0.3s ease";

                    const vLeft = document.createElement("div");
                    vLeft.style.display = "flex";
                    vLeft.style.alignItems = "center";
                    vLeft.style.gap = "12px";
                    vLeft.style.flex = "1";
                    vLeft.style.minWidth = "200px";

                    if (v.thumbnail) {
                        const img = document.createElement("img");
                        img.className = "poster-img";
                        img.setAttribute("data-fallback", "true");
                        img.setAttribute("alt", v.title || "Video");
                        img.setAttribute("data-media-type", "tv");
                        img.style.width = "72px";
                        img.style.height = "40px";
                        img.style.objectFit = "cover";
                        img.style.borderRadius = "4px";
                        img.style.border = "1px solid rgba(255, 255, 255, 0.05)";
                        img.src = v.thumbnail;
                        vLeft.appendChild(img);
                    } else {
                        const fallback = createFallbackPoster(v.title || "Video", true, "72px", "40px");
                        vLeft.appendChild(fallback);
                    }

                    const vInfo = document.createElement("div");
                    vInfo.style.display = "flex";
                    vInfo.style.flexDirection = "column";
                    vInfo.style.gap = "2px";

                    const vTitle = document.createElement("div");
                    vTitle.style.fontWeight = "500";
                    vTitle.style.fontSize = "13px";
                    vTitle.style.color = "var(--text-main)";
                    vTitle.textContent = v.title;
                    vInfo.appendChild(vTitle);

                    const vMeta = document.createElement("div");
                    vMeta.style.fontSize = "11px";
                    vMeta.style.color = "var(--text-muted)";
                    vMeta.textContent = `${v.channel || "Unbekannter Kanal"}${v.published_at ? " • " + v.published_at : ""}`;
                    vInfo.appendChild(vMeta);

                    vLeft.appendChild(vInfo);
                    vRow.appendChild(vLeft);

                    const vRight = document.createElement("div");
                    vRight.style.display = "flex";
                    vRight.style.gap = "8px";

                    const btnApprove = document.createElement("button");
                    btnApprove.className = "btn btn-success btn-xs";
                    btnApprove.style.padding = "4px 8px";
                    btnApprove.style.fontSize = "11px";
                    btnApprove.style.fontWeight = "600";
                    btnApprove.innerHTML = '<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download" style="height:12px; width:12px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>Jetzt laden</span>';

                    const btnProcessInDownloader = document.createElement("button");
                    btnProcessInDownloader.className = "btn btn-primary btn-xs";
                    btnProcessInDownloader.style.padding = "4px 8px";
                    btnProcessInDownloader.style.fontSize = "11px";
                    btnProcessInDownloader.style.fontWeight = "600";
                    btnProcessInDownloader.innerHTML = '<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play" style="height:12px; width:12px;"><polygon points="6 3 20 12 6 21 6 3"/></svg>Im Downloader verarbeiten</span>';

                    const btnSearchParts = document.createElement("button");
                    btnSearchParts.className = "btn btn-accent btn-xs";
                    btnSearchParts.style.padding = "4px 8px";
                    btnSearchParts.style.fontSize = "11px";
                    btnSearchParts.style.fontWeight = "600";
                    btnSearchParts.innerHTML = '<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search" style="height:12px; width:12px;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>Teile suchen</span>';

                    const btnIgnore = document.createElement("button");
                    btnIgnore.className = "btn btn-secondary btn-xs";
                    btnIgnore.style.padding = "4px 8px";
                    btnIgnore.style.fontSize = "11px";
                    btnIgnore.style.fontWeight = "600";
                    btnIgnore.innerHTML = '<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2" style="height:12px; width:12px; color:var(--text-muted);"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>Ignorieren</span>';

                    const btnLink = document.createElement("a");
                    btnLink.href = v.url || `https://www.youtube.com/watch?v=${v.id}`;
                    btnLink.target = "_blank";
                    btnLink.className = "btn btn-info btn-xs";
                    btnLink.style.padding = "4px 8px";
                    btnLink.style.fontSize = "11px";
                    btnLink.style.fontWeight = "600";
                    btnLink.style.textDecoration = "none";
                    btnLink.innerHTML = '<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-external-link" style="height:12px; width:12px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>Link</span>';

                    btnApprove.addEventListener("click", async () => {
                        btnApprove.disabled = true;
                        btnIgnore.disabled = true;
                        btnApprove.innerHTML = '<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-2" style="animation: spin 1s linear infinite; height: 12px; width: 12px;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Starte...</span>';
                        try {
                            const res = await fetch("/api/youtube/subscriptions/approve", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ subscription_id: sub.id, video_id: v.id })
                            });
                            if (res.ok) {
                                vRow.style.opacity = "0.5";
                                vRow.style.transform = "scale(0.98)";
                                setTimeout(() => {
                                    vRow.remove();
                                    sub.pending_videos = sub.pending_videos.filter(pv => pv.id !== v.id);
                                    if (sub.pending_videos.length === 0) {
                                        inboxHeader.innerHTML = '<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-inbox" style="height:13px; width:13px;"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>Freigabeliste (0 ausstehend)</span>';
                                        listDiv.innerHTML = `<div style="font-size:12.5px; color:var(--text-muted); font-style:italic; padding:5px 0;">Keine neuen Videos ausstehend.</div>`;
                                    } else {
                                        inboxHeader.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-inbox" style="height:13px; width:13px;"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>Freigabeliste (${sub.pending_videos.length} ausstehend)</span>`;
                                    }
                                }, 300);
                                appendConsoleLog(`[System]: Video "${v.title}" zur Warteschlange hinzugefügt.`);
                            } else {
                                alert("Fehler beim Freigeben des Videos");
                                btnApprove.disabled = false;
                                btnIgnore.disabled = false;
                                btnApprove.innerHTML = '<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download" style="height:12px; width:12px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>Jetzt laden</span>';
                            }
                        } catch (err) {
                            console.error(err);
                            alert("Netzwerkfehler beim Freigeben");
                            btnApprove.disabled = false;
                            btnIgnore.disabled = false;
                            btnApprove.innerHTML = '<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download" style="height:12px; width:12px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>Jetzt laden</span>';
                        }
                    });

                    btnProcessInDownloader.addEventListener("click", () => {
                        sendVideoToDownloader(sub, v);
                    });

                    btnIgnore.addEventListener("click", async () => {
                        btnApprove.disabled = true;
                        btnIgnore.disabled = true;
                        btnIgnore.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-2" style="animation: spin 1s linear infinite; height:12px; width:12px;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Ignoriere...</span>`;
                        try {
                            const res = await fetch("/api/youtube/subscriptions/ignore", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ subscription_id: sub.id, video_id: v.id })
                            });
                            if (res.ok) {
                                vRow.style.opacity = "0.5";
                                vRow.style.transform = "scale(0.98)";
                                setTimeout(() => {
                                    vRow.remove();
                                    sub.pending_videos = sub.pending_videos.filter(pv => pv.id !== v.id);
                                    if (sub.pending_videos.length === 0) {
                                        inboxHeader.innerHTML = '<span style="display:inline-flex; align-items:center; gap:6px;"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-inbox" style="height:15px; width:15px; color:var(--accent);"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>Freigabeliste (0 ausstehend)</span>';
                                        listDiv.innerHTML = `<div style="font-size:12.5px; color:var(--text-muted); font-style:italic; padding:5px 0;">Keine neuen Videos ausstehend.</div>`;
                                    } else {
                                        inboxHeader.innerHTML = `<span style="display:inline-flex; align-items:center; gap:6px;"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-inbox" style="height:15px; width:15px; color:var(--accent);"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>Freigabeliste (${sub.pending_videos.length} ausstehend)</span>`;
                                    }
                                }, 300);
                                appendConsoleLog(`[System]: Video "${v.title}" als ignoriert markiert.`);
                            } else {
                                alert("Fehler beim Ignorieren des Videos");
                                btnApprove.disabled = false;
                                btnIgnore.disabled = false;
                                btnIgnore.innerHTML = '<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2" style="height:12px; width:12px; color:var(--text-muted);"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>Ignorieren</span>';
                            }
                        } catch (err) {
                            console.error(err);
                            alert("Netzwerkfehler beim Ignorieren");
                            btnApprove.disabled = false;
                            btnIgnore.disabled = false;
                            btnIgnore.innerHTML = '<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2" style="height:12px; width:12px; color:var(--text-muted);"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>Ignorieren</span>';
                        }
                    });

                    btnSearchParts.addEventListener("click", () => {
                        handoffMergeToDownloader(sub, v);
                    });

                    vRight.appendChild(btnApprove);
                    vRight.appendChild(btnProcessInDownloader);
                    vRight.appendChild(btnSearchParts);
                    vRight.appendChild(btnIgnore);
                    vRight.appendChild(btnLink);
                    vRow.appendChild(vRight);
                    listDiv.appendChild(vRow);
                });
                inboxDiv.appendChild(listDiv);
            }
            detailsContainer.appendChild(inboxDiv);
        }

        // Collapsible states & Click handler
        let isExpanded = false;

        const updateExpandState = () => {
            if (isExpanded) {
                detailsContainer.style.display = "flex";
                expandCaret.innerHTML = "▼";
                expandCaret.style.color = "var(--accent)";
            } else {
                detailsContainer.style.display = "none";
                expandCaret.innerHTML = "▶";
                expandCaret.style.color = "var(--text-muted)";
            }
        };
        updateExpandState();

        infoCol.style.cursor = "pointer";
        infoCol.addEventListener("click", () => {
            isExpanded = !isExpanded;
            updateExpandState();
        });

        item.appendChild(detailsContainer);
        listContainer.appendChild(item);
    });
}

async function saveAllSubscriptions() {
    try {
        const response = await fetch("/api/youtube/subscriptions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscriptions: currentSubscriptions })
        });
        if (!response.ok) {
            throw new Error("Fehler beim Speichern");
        }
        appendConsoleLog("[System]: YouTube-Abonnements erfolgreich aktualisiert.");
    } catch (e) {
        console.error("Error saving subscriptions:", e);
        alert("Fehler beim Speichern der Abonnements!");
    }
}

async function sendVideoToDownloader(sub, v) {
    document.querySelectorAll(".view-panel").forEach(p => {
        p.classList.add("hidden");
        p.classList.remove("active");
    });
    const viewYt = document.getElementById("view-youtube");
    if (viewYt) {
        viewYt.classList.remove("hidden");
        viewYt.classList.add("active");
    }
    document.querySelectorAll(".project-item").forEach(el => el.classList.remove("active"));

    // Reset merge modes
    ytDownloaderMergeMode = false;
    ytDownloaderMergeItems = [];
    ytDownloaderMergeSubId = null;

    // 2. Pre-fill URL
    const ytUrlInput = document.getElementById("yt-url");
    if (ytUrlInput) {
        ytUrlInput.value = v.url || `https://www.youtube.com/watch?v=${v.id}`;
    }

    // 3. Pre-fill storage options
    const cbNas = document.getElementById("yt-option-copy-nas");
    const cbPcloud = document.getElementById("yt-option-copy-pcloud");
    const cbLocal = document.getElementById("yt-option-copy-local");

    if (cbNas) {
        cbNas.checked = sub.copy_to_nas !== false;
        cbNas.dispatchEvent(new Event("change"));
    }
    if (cbPcloud) {
        cbPcloud.checked = !!sub.copy_to_pcloud;
        cbPcloud.dispatchEvent(new Event("change"));
    }
    if (cbLocal) {
        cbLocal.checked = !!sub.copy_to_local;
        cbLocal.dispatchEvent(new Event("change"));
    }

    const selNas = document.getElementById("yt-nas-destination");
    const selPcloud = document.getElementById("yt-pcloud-destination");
    const selLocal = document.getElementById("yt-local-destination");

    const nasDestId = sub.nas_destination_id || sub.destination_id || "";
    const pcloudDestId = sub.pcloud_destination_id || "";
    const localDestId = sub.local_destination_id || "";

    if (selNas && nasDestId) selNas.value = nasDestId;
    if (selPcloud && pcloudDestId) selPcloud.value = pcloudDestId;
    if (selLocal && localDestId) selLocal.value = localDestId;

    // 4. Remove from subscriptions list in background
    try {
        await fetch("/api/youtube/subscriptions/ignore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscription_id: sub.id, video_id: v.id })
        });
        // Remove locally from state and refresh UI
        sub.pending_videos = sub.pending_videos.filter(pv => pv.id !== v.id);
        renderSubscriptionsList();
    } catch (e) {
        console.error("Error archiving video on handoff:", e);
    }

    // 5. Start Link Analysis automatically
    analyseYtLink(true);
}

async function handoffMergeToDownloader(sub, v) {
    document.querySelectorAll(".view-panel").forEach(p => {
        p.classList.add("hidden");
        p.classList.remove("active");
    });
    const viewYt = document.getElementById("view-youtube");
    if (viewYt) {
        viewYt.classList.remove("hidden");
        viewYt.classList.add("active");
    }
    document.querySelectorAll(".project-item").forEach(el => el.classList.remove("active"));

    // 2. Set merge mode states
    ytDownloaderMergeMode = true;
    ytDownloaderMergeSubId = sub.id;
    ytDownloaderMergeItems = [];

    // Pre-fill URL in downloader tab
    const ytUrlInput = document.getElementById("yt-url");
    if (ytUrlInput) {
        ytUrlInput.value = v.url || `https://www.youtube.com/watch?v=${v.id}`;
    }

    // Pre-fill storage targets
    const cbNas = document.getElementById("yt-option-copy-nas");
    const cbPcloud = document.getElementById("yt-option-copy-pcloud");
    const cbLocal = document.getElementById("yt-option-copy-local");

    if (cbNas) {
        cbNas.checked = sub.copy_to_nas !== false;
        cbNas.dispatchEvent(new Event("change"));
    }
    if (cbPcloud) {
        cbPcloud.checked = !!sub.copy_to_pcloud;
        cbPcloud.dispatchEvent(new Event("change"));
    }
    if (cbLocal) {
        cbLocal.checked = !!sub.copy_to_local;
        cbLocal.dispatchEvent(new Event("change"));
    }

    const selNas = document.getElementById("yt-nas-destination");
    const selPcloud = document.getElementById("yt-pcloud-destination");
    const selLocal = document.getElementById("yt-local-destination");

    const nasDestId = sub.nas_destination_id || sub.destination_id || "";
    const pcloudDestId = sub.pcloud_destination_id || "";
    const localDestId = sub.local_destination_id || "";

    if (selNas && nasDestId) selNas.value = nasDestId;
    if (selPcloud && pcloudDestId) selPcloud.value = pcloudDestId;
    if (selLocal && localDestId) selLocal.value = localDestId;

    // Clean up merge title override
    let cleanTitle = v.title;
    const patterns = [
        /\bteil\s*\d+\b/i,
        /\bpart\s*\d+\b/i,
        /\bepisode\s*\d+\b/i,
        /#\s*\d+\b/i,
        /\b\d+\s*\/\s*\d+\b/i,
        /\b\d+\s*von\s*\d+\b/i,
        /\b\d+\.\s*teil\b/i,
        /\b\d+\.\s*part\b/i
    ];
    patterns.forEach(p => {
        cleanTitle = cleanTitle.replace(p, "");
    });
    cleanTitle = cleanTitle.replace(/\s*-\s*$/, "").replace(/\s+/g, " ").trim();

    const mergeTitleInput = document.getElementById("yt-merge-details-title");
    if (mergeTitleInput) {
        mergeTitleInput.value = cleanTitle || v.title;
    }

    const listContainer = document.getElementById("yt-merge-details-list");
    if (listContainer) {
        listContainer.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-2" style="display:inline-block; vertical-align:middle; margin-right: 6px; animation: spin 1s linear infinite; height: 14px; width: 14px;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Suche nach Teilen auf YouTube...</div>`;
    }

    // Search parts
    fetch(`/api/youtube/search-parts?title=${encodeURIComponent(v.title)}`)
        .then(res => res.json())
        .then(data => {
            const results = data.results || [];

            // Build unique list of items
            const items = [];

            // 1. Add our initial video
            items.push({
                id: v.id,
                title: v.title,
                url: v.url || `https://www.youtube.com/watch?v=${v.id}`,
                thumbnail: v.thumbnail,
                checked: true,
                isInitial: true
            });

            // 2. Add search results, avoiding duplicates of the initial video
            results.forEach(r => {
                if (r.id !== v.id) {
                    items.push({
                        id: r.id,
                        title: r.title,
                        url: r.url,
                        thumbnail: r.thumbnail,
                        checked: false,
                        isInitial: false
                    });
                }
            });

            ytDownloaderMergeItems = items;
            renderDownloaderMergeItems();
        })
        .catch(err => {
            console.error(err);
            if (listContainer) {
                listContainer.innerHTML = `<div style="text-align:center; padding:20px; color:var(--danger);">Fehler bei der Suche nach Teilen.</div>`;
            }
        });

    // 3. Start Link Analysis automatically on the initial URL to populate formats
    analyseYtLink(true);
}

async function addSubscription() {
    const nameInput = document.getElementById("abo-name");
    const urlInput = document.getElementById("abo-url");
    const filterInput = document.getElementById("abo-filter");
    const modeSelect = document.getElementById("abo-mode");
    const scheduleSelect = document.getElementById("abo-schedule");
    const filterGermanCheck = document.getElementById("abo-filter-german");
    const excludeInput = document.getElementById("abo-exclude");

    const copyNasCheck = document.getElementById("abo-copy-nas");
    const copyPcloudCheck = document.getElementById("abo-copy-pcloud");
    const copyLocalCheck = document.getElementById("abo-copy-local");
    const nasDestSelect = document.getElementById("abo-nas-destination");
    const pcloudDestSelect = document.getElementById("abo-pcloud-destination");
    const localDestSelect = document.getElementById("abo-local-destination");

    if (!nameInput || !urlInput) return;

    const name = nameInput.value.trim();
    const url = urlInput.value.trim();
    const filter = filterInput ? filterInput.value.trim() : "";
    const excludeKeywords = excludeInput ? excludeInput.value.trim() : "";
    const autoDownload = modeSelect ? (modeSelect.value !== "manual") : true;
    const schedule = scheduleSelect ? scheduleSelect.value : "hourly";
    const filterGerman = filterGermanCheck ? !!filterGermanCheck.checked : false;

    const copyToNas = copyNasCheck ? !!copyNasCheck.checked : true;
    const copyToPcloud = copyPcloudCheck ? !!copyPcloudCheck.checked : false;
    const copyToLocal = copyLocalCheck ? !!copyLocalCheck.checked : false;
    const nasDestId = nasDestSelect ? nasDestSelect.value : "";
    const pcloudDestId = pcloudDestSelect ? pcloudDestSelect.value : "";
    const localDestId = localDestSelect ? localDestSelect.value : "";

    if (!name || !url) {
        alert("Bitte geben Sie einen Namen und eine YouTube-URL oder einen Suchbegriff ein!");
        return;
    }

    // Generate UUID
    const newId = crypto.randomUUID();

    const newSub = {
        id: newId,
        name: name,
        url: url,
        search_filter: filter,
        exclude_keywords: excludeKeywords,
        destination_id: nasDestId, // Fallback/Backward compatibility
        nas_destination_id: nasDestId,
        pcloud_destination_id: pcloudDestId,
        local_destination_id: localDestId,
        copy_to_nas: copyToNas,
        copy_to_pcloud: copyToPcloud,
        copy_to_local: copyToLocal,
        enabled: true,
        last_checked: null,
        last_checked_timestamp: 0,
        downloaded_ids: [],
        auto_download: autoDownload,
        schedule: schedule,
        filter_german: filterGerman,
        pending_videos: []
    };

    currentSubscriptions.push(newSub);

    // Reset form inputs
    nameInput.value = "";
    urlInput.value = "";
    if (filterInput) filterInput.value = "";
    if (excludeInput) excludeInput.value = "";
    if (modeSelect) modeSelect.value = "auto";
    if (scheduleSelect) scheduleSelect.value = "hourly";
    if (filterGermanCheck) filterGermanCheck.checked = false;

    if (copyNasCheck) {
        copyNasCheck.checked = true;
        copyNasCheck.dispatchEvent(new Event("change"));
    }
    if (copyPcloudCheck) {
        copyPcloudCheck.checked = false;
        copyPcloudCheck.dispatchEvent(new Event("change"));
    }
    if (copyLocalCheck) {
        copyLocalCheck.checked = false;
        copyLocalCheck.dispatchEvent(new Event("change"));
    }

    // Optimistic render and background save
    renderSubscriptionsList();
    await saveAllSubscriptions();
}

async function checkAllSubscriptions() {
    const btn = document.getElementById("btn-check-all-abos");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-2" style="animation: spin 1s linear infinite; height: 12px; width: 12px;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Prüfe...</span>`;
    }

    appendConsoleLog("[System]: Starte manuelle Prüfung aller YouTube Abos...");

    try {
        const response = await fetch("/api/youtube/subscriptions/check", {
            method: "POST"
        });
        if (response.ok) {
            appendConsoleLog("YouTube Abo-Überprüfung im Hintergrund gestartet.");
            alert("Abo-Überprüfung im Hintergrund gestartet! Das kann einige Minuten dauern.");
        } else {
            throw new Error("API meldet Fehler");
        }
    } catch (e) {
        console.error("Error checking subscriptions:", e);
        appendConsoleLog(`❌ Fehler beim Starten der Abo-Überprüfung: ${e}`);
        alert("Fehler beim Starten der Abo-Überprüfung!");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-cw" style="height: 12px; width: 12px;"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>Jetzt alle prüfen</span>`;
        }
    }
}


// Helper to render files list in clean modal with sizes and video codecs
function renderCleanFileList(files, isJunk) {
    const sortedFiles = [...files].sort((a, b) => {
        const nameA = typeof a === "string" ? a : (a.name || "");
        const nameB = typeof b === "string" ? b : (b.name || "");
        return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: "base" });
    });
    return sortedFiles.map(fileObj => {
        const f = typeof fileObj === "string" ? fileObj : fileObj.name;
        const sizeBytes = fileObj.size_bytes || 0;
        const codec = fileObj.codec || "";
        const resolution = fileObj.resolution || "";

        let sizeStr = "";
        if (sizeBytes > 0) {
            if (sizeBytes > 1024 * 1024 * 1024) {
                sizeStr = `(${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB)`;
            } else if (sizeBytes > 1024 * 1024) {
                sizeStr = `(${(sizeBytes / (1024 * 1024)).toFixed(1)} MB)`;
            } else {
                sizeStr = `(${(sizeBytes / 1024).toFixed(0)} KB)`;
            }
        }

        let detailsStr = "";
        if (codec || resolution) {
            const parts = [];
            if (codec) parts.push(codec.toUpperCase());
            if (resolution) parts.push(resolution);
            detailsStr = `<span style="background: rgba(var(--accent-rgb), 0.15); color: var(--accent); font-size: 9.5px; font-weight: 600; padding: 1.5px 5px; border-radius: 4px; margin-left: 6px; letter-spacing: 0.3px;">${parts.join(" • ")}</span>`;
        }

        return `
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding: 2px 0;">
                <input type="checkbox" class="clean-cb-item" data-file="${escapeHTML(f)}" ${isJunk ? 'checked' : ''} style="accent-color:#ff4757;">
                <span style="font-size:11px; color:var(--text-main); word-break:break-all;">
                    ${escapeHTML(f)}
                    <span style="color:var(--text-muted); font-size: 10.5px; margin-left: 4px;">${sizeStr}</span>
                    ${detailsStr}
                </span>
            </label>
        `;
    }).join("");
}

// Helper clean project
async function cleanCurrentProject() {
    if (!currentProject) return;

    // UI Loading state
    const overlay = document.getElementById("clean-modal-overlay");
    const modal = document.getElementById("clean-modal");
    const list = document.getElementById("clean-list");

    list.innerHTML = `<div style="color:var(--text-muted); font-size:12px;">Scanne Ordner...</div>`;

    overlay.classList.remove("hidden");
    setTimeout(() => {
        overlay.style.opacity = "1";
        overlay.style.pointerEvents = "auto";
        modal.style.transform = "translateY(0)";
    }, 10);

    try {
        const response = await fetch("/api/preview_clean", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ project: currentProject })
        });

        if (!response.ok) throw new Error("Fehler beim Scannen");
        const data = await response.json();

        if (data.error) {
            alert(data.error);
            closeCleanModal();
            return;
        }

        list.innerHTML = "";

        const groups = data.groups || {};
        if (Object.keys(groups).length === 0) {
            list.innerHTML = `<div style="color:var(--text-muted); font-size:12px;">Ordner ist bereits komplett leer.</div>`;
            return;
        }

        // Render groups sorted alphabetically by extension
        const sortedKeys = Object.keys(groups).sort();
        for (const ext of sortedKeys) {
            const files = groups[ext];
            // Check by default if it's typical junk
            const isJunk = ['txt', 'url', 'exe', 'ds_store', 'nfo', 'jpg', 'png'].includes(ext);

            const groupDiv = document.createElement("div");
            groupDiv.className = "clean-group-container";
            groupDiv.style.marginBottom = "10px";
            groupDiv.innerHTML = `
                <div style="font-size:12px; font-weight:bold; color:var(--accent); text-transform:uppercase; margin-bottom:5px; display:flex; justify-content:space-between; align-items:center;">
                    <span>Dateityp: .${ext} <span style="color:var(--text-muted); font-weight:normal;">(${files.length} Dateien)</span></span>
                    <span class="group-select-toggle" data-ext="${ext}" style="font-size:10px; color:var(--text-muted); text-transform:none; font-weight:normal; cursor:pointer; text-decoration:underline;">Alle aus-/abwählen</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:5px; padding-left:10px; border-left:2px solid rgba(255,255,255,0.05);">
                    ${renderCleanFileList(files, isJunk)}
                </div>
            `;
            list.appendChild(groupDiv);
        }

        // Store target path for execution
        document.getElementById("btn-clean-execute").dataset.target = currentProject;

    } catch (e) {
        alert("Fehler: " + e.message);
        closeCleanModal();
    }
}

// Tool events
async function runToolPullFiles() {
    const targetPath = document.getElementById("tools-target-path").value || currentProject;
    if (activeProjectsProcessing && activeProjectsProcessing.has(targetPath)) {
        alert("Dieses Projekt wird bereits verarbeitet oder befindet sich in der Warteschlange!");
        return;
    }
    expandConsole();
    appendConsoleLog("[System]: Verschiebe Dateien aus Unterordnern nach oben...");

    try {
        const response = await fetch("/api/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                media_type: "tool_pull_files",
                project_name: targetPath
            })
        });
        if (response.ok) {
            connectLogStream();
        } else {
            appendConsoleLog(`[System]: ❌ Serverfehler (${response.status}) beim Verschieben.`);
        }
    } catch (e) {
        console.error("Error in runToolPullFiles:", e);
        appendConsoleLog(`[System]: ❌ Fehler beim Verschieben: ${e.message}`);
    }
}
async function runToolClean(path) {
    const targetPath = path || currentProject;
    if (!targetPath) {
        alert("Bitte wähle zuerst einen Zielordner-Pfad aus!");
        return;
    }

    // UI Loading state
    const overlay = document.getElementById("clean-modal-overlay");
    const modal = document.getElementById("clean-modal");
    const list = document.getElementById("clean-list");

    list.innerHTML = `<div style="color:var(--text-muted); font-size:12px;">Scanne Ordner...</div>`;

    overlay.classList.remove("hidden");
    setTimeout(() => {
        overlay.style.opacity = "1";
        overlay.style.pointerEvents = "auto";
        modal.style.transform = "translateY(0)";
    }, 10);

    try {
        const response = await fetch("/api/preview_clean", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ project: targetPath })
        });

        if (!response.ok) throw new Error("Fehler beim Scannen");
        const data = await response.json();

        if (data.error) {
            alert(data.error);
            closeCleanModal();
            return;
        }

        list.innerHTML = "";

        const groups = data.groups || {};
        if (Object.keys(groups).length === 0) {
            list.innerHTML = `<div style="color:var(--text-muted); font-size:12px;">Ordner ist bereits komplett leer.</div>`;
            return;
        }

        // Render groups sorted alphabetically by extension
        const sortedKeys = Object.keys(groups).sort();
        for (const ext of sortedKeys) {
            const files = groups[ext];
            // Check by default if it's typical junk
            const isJunk = ['txt', 'url', 'exe', 'ds_store', 'nfo', 'jpg', 'png'].includes(ext);

            const groupDiv = document.createElement("div");
            groupDiv.className = "clean-group-container";
            groupDiv.style.marginBottom = "10px";
            groupDiv.innerHTML = `
                <div style="font-size:12px; font-weight:bold; color:var(--accent); text-transform:uppercase; margin-bottom:5px; display:flex; justify-content:space-between; align-items:center;">
                    <span>Dateityp: .${ext} <span style="color:var(--text-muted); font-weight:normal;">(${files.length} Dateien)</span></span>
                    <span class="group-select-toggle" data-ext="${ext}" style="font-size:10px; color:var(--text-muted); text-transform:none; font-weight:normal; cursor:pointer; text-decoration:underline;">Alle aus-/abwählen</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:5px; padding-left:10px; border-left:2px solid rgba(255,255,255,0.05);">
                    ${renderCleanFileList(files, isJunk)}
                </div>
            `;
            list.appendChild(groupDiv);
        }

        // Store target path for execution
        document.getElementById("btn-clean-execute").dataset.target = targetPath;

    } catch (e) {
        alert("Fehler: " + e.message);
        closeCleanModal();
    }
}

function closeCleanModal() {
    const overlay = document.getElementById("clean-modal-overlay");
    const modal = document.getElementById("clean-modal");

    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
    modal.style.transform = "translateY(20px)";
    setTimeout(() => {
        overlay.classList.add("hidden");
    }, 300);
}

// Medienpfade bereinigen (Clean Paths Tool)
function openPathsCleanModal(selectInbox = true, selectOutput = true) {
    const overlay = document.getElementById("paths-clean-modal-overlay");
    const modal = document.getElementById("paths-clean-modal");

    // Phase 1 anzeigen und Checkboxen entsprechend setzen
    document.getElementById("paths-clean-opt-inbox").checked = selectInbox;
    document.getElementById("paths-clean-opt-output").checked = selectOutput;
    document.getElementById("paths-clean-phase-select").classList.remove("hidden");
    document.getElementById("paths-clean-phase-preview").classList.add("hidden");
    document.getElementById("paths-clean-list").innerHTML = "";

    overlay.classList.remove("hidden");
    setTimeout(() => {
        overlay.style.opacity = "1";
        overlay.style.pointerEvents = "auto";
        modal.style.transform = "translateY(0)";
    }, 10);
}

function closePathsCleanModal() {
    const overlay = document.getElementById("paths-clean-modal-overlay");
    const modal = document.getElementById("paths-clean-modal");

    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
    modal.style.transform = "translateY(20px)";
    setTimeout(() => {
        overlay.classList.add("hidden");
    }, 300);
}

function backToPathsCleanSelect() {
    document.getElementById("paths-clean-phase-preview").classList.add("hidden");
    document.getElementById("paths-clean-phase-select").classList.remove("hidden");
}

async function runPathsCleanScan() {
    const scanInbox = document.getElementById("paths-clean-opt-inbox").checked;
    const scanOutput = document.getElementById("paths-clean-opt-output").checked;

    if (!scanInbox && !scanOutput) {
        alert("Bitte wähle mindestens einen Pfad aus (Inbox und/oder Output)!");
        return;
    }

    const list = document.getElementById("paths-clean-list");
    list.innerHTML = `<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:20px;"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-2" style="display:inline-block; vertical-align:middle; margin-right: 6px; animation: spin 1s linear infinite; height: 14px; width: 14px;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Scanne Medienpfade, bitte warten...</div>`;

    // Zu Phase 2 wechseln
    document.getElementById("paths-clean-phase-select").classList.add("hidden");
    document.getElementById("paths-clean-phase-preview").classList.remove("hidden");

    try {
        const response = await fetch("/api/paths/preview_clean", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inbox: scanInbox, output: scanOutput })
        });

        if (!response.ok) throw new Error("Fehler beim Scannen der Medienpfade.");
        const data = await response.json();

        if (data.error) {
            alert(data.error);
            backToPathsCleanSelect();
            return;
        }

        list.innerHTML = "";

        const inboxFiles = data.inbox_files || [];
        const outputFiles = data.output_files || [];

        if (inboxFiles.length === 0 && outputFiles.length === 0) {
            list.innerHTML = `<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:20px;">Keine Dateien in den ausgewählten Pfaden gefunden.</div>`;
            return;
        }

        const renderSection = (title, files, source) => {
            if (files.length === 0) return "";

            // Gruppiere Dateien nach Projektordner (erstes Segment des rel_path)
            const groups = {};
            files.forEach(f => {
                const parts = f.rel_path.split('/');
                const groupName = parts.length > 1 ? parts[0] : "Hauptverzeichnis";
                if (!groups[groupName]) {
                    groups[groupName] = [];
                }
                groups[groupName].push(f);
            });

            const totalBytes = files.reduce((sum, f) => sum + (f.size_bytes || 0), 0);

            let groupHtml = "";
            for (const [groupName, groupFiles] of Object.entries(groups)) {
                const groupBytes = groupFiles.reduce((sum, f) => sum + (f.size_bytes || 0), 0);
                groupHtml += `
                    <div style="margin-top: 14px; margin-bottom: 8px; padding-left: 2px;">
                        <span style="font-size: 12px; font-weight: 600; color: var(--text-main); display: flex; justify-content: space-between; align-items: center;">
                            <span><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder" style="vertical-align:middle; margin-right: 4px; display: inline-block; color: var(--accent);"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/></svg>${escapeHTML(groupName)}</span>
                            <span style="color: var(--text-muted); font-weight: normal; font-size: 11px;">(${groupFiles.length} Datei(en), ${formatBytes(groupBytes)})</span>
                        </span>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:6px; padding-left:10px; border-left: 2px solid rgba(255,255,255,0.03); margin-bottom: 12px;">
                        ${groupFiles.map(f => {
                            const isJunk = ['.txt', '.url', '.nfo', '.db', '.ds_store'].some(ext => f.rel_path.toLowerCase().endsWith(ext)) || f.rel_path.toLowerCase().includes("ds_store");
                            const displayPath = f.rel_path.includes('/') ? f.rel_path.substring(f.rel_path.indexOf('/') + 1) : f.rel_path;
                            return `
                                <label class="paths-clean-item-label" style="display:flex; align-items:center; justify-content:space-between; gap:10px; cursor:pointer; padding:6px 10px; background:rgba(255, 255, 255, 0.01); border-radius:var(--radius-sm); border:1px solid rgba(255,255,255,0.02); transition:all 0.15s ease;">
                                    <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
                                        <input type="checkbox" class="paths-clean-cb-item" data-source="${source}" data-file="${escapeHTML(f.rel_path)}" data-junk="${isJunk}" checked style="accent-color:#ff4757; width:16px; height:16px; flex-shrink:0;">
                                        <span style="font-size:12px; color:var(--text-main); word-break:break-all; text-align:left;">${escapeHTML(displayPath)}</span>
                                    </div>
                                    <div style="display:flex; align-items:center; gap:10px; flex-shrink:0;">
                                        <span class="badge-quarantine" style="font-size:10px; padding:2px 8px; border-radius:4px; background:rgba(255, 71, 87, 0.12); color:#ff4757; border: 1px solid rgba(255, 71, 87, 0.25); font-weight:600; text-transform:uppercase; letter-spacing:0.3px; min-width:75px; text-align:center;">Quarantäne</span>
                                        <span style="font-size:11px; color:var(--text-muted); min-width:55px; text-align:right;">${formatBytes(f.size_bytes)}</span>
                                    </div>
                                </label>
                            `;
                        }).join("")}
                    </div>
                `;
            }

            return `
                <div style="margin-bottom: 20px; background: rgba(255,255,255,0.01); padding: 14px; border-radius: 8px; border: 1px solid var(--border-light);">
                    <div style="font-size:13px; font-weight:bold; color:var(--accent); margin-bottom:10px; display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:6px;">
                        <span><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-open" style="vertical-align:middle; margin-right: 6px; display: inline-block; color: var(--accent);"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>${title}</span>
                        <span style="color:var(--text-muted); font-weight:normal; font-size:12px;">Gesamt: ${formatBytes(totalBytes)}</span>
                    </div>
                    ${groupHtml}
                </div>
            `;
        };

        let htmlContent = "";
        if (scanInbox && inboxFiles.length > 0) {
            htmlContent += renderSection("Inbox (Medien Input)", inboxFiles, "inbox");
        }
        if (scanOutput && outputFiles.length > 0) {
            htmlContent += renderSection("Output (Medien Output)", outputFiles, "output");
        }

        list.innerHTML = htmlContent;

        // Event Listener für interaktive Badges registrieren
        document.querySelectorAll(".paths-clean-cb-item").forEach(cb => {
            cb.addEventListener("change", function() {
                const label = this.closest(".paths-clean-item-label");
                if (!label) return;
                const badge = label.querySelector(".badge-quarantine");
                if (!badge) return;

                if (this.checked) {
                    badge.style.background = "rgba(255, 71, 87, 0.12)";
                    badge.style.color = "#ff4757";
                    badge.style.borderColor = "rgba(255, 71, 87, 0.25)";
                    badge.textContent = "Quarantäne";
                    label.style.background = "rgba(255, 255, 255, 0.01)";
                    label.style.borderColor = "rgba(255,255,255,0.02)";
                } else {
                    badge.style.background = "rgba(46, 213, 115, 0.12)";
                    badge.style.color = "#2ed573";
                    badge.style.borderColor = "rgba(46, 213, 115, 0.25)";
                    badge.textContent = "Behalten";
                    label.style.background = "rgba(255, 255, 255, 0.03)";
                    label.style.borderColor = "rgba(46, 213, 115, 0.15)";
                }
            });
        });

    } catch (e) {
        alert("Fehler beim Scannen: " + e.message);
        backToPathsCleanSelect();
    }
}

async function executePathsClean() {
    const cbs = document.querySelectorAll(".paths-clean-cb-item:checked");
    if (cbs.length === 0) {
        alert("Bitte wähle mindestens eine Datei zum Verschieben in Quarantäne aus!");
        return;
    }

    const confirmDelete = confirm(`Bist du sicher, dass du die ${cbs.length} ausgewählten Dateien in Quarantäne verschieben möchtest?`);
    if (!confirmDelete) return;

    const inboxFiles = [];
    const outputFiles = [];

    cbs.forEach(cb => {
        const source = cb.dataset.source;
        const file = cb.dataset.file;
        if (source === "inbox") {
            inboxFiles.push(file);
        } else if (source === "output") {
            outputFiles.push(file);
        }
    });

    closePathsCleanModal();
    expandConsole();
    appendConsoleLog("[System]: Quarantäne-Vorgang gestartet...");

    try {
        const response = await fetch("/api/paths/clean", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                inbox_files: inboxFiles,
                output_files: outputFiles
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Fehler bei der Übertragung an den Server.");
        }

        if (data.status === "ok") {
            const filesDeletedCount = (data.deleted_files || []).length;
            const dirsDeletedCount = (data.deleted_dirs || []).length;
            appendConsoleLog(`[System]: Quarantäne-Vorgang erfolgreich abgeschlossen!`);
            appendConsoleLog(`[System]: -> ${filesDeletedCount} Dateien in Quarantäne verschoben.`);
            if (dirsDeletedCount > 0) {
                appendConsoleLog(`[System]: -> ${dirsDeletedCount} leere Ordner in Quarantäne verschoben.`);
            }
            alert(`Quarantäne-Vorgang erfolgreich abgeschlossen!\n\n${filesDeletedCount} Dateien und ${dirsDeletedCount} Ordner wurden in Quarantäne verschoben.`);
            loadStatus();
        } else {
            appendConsoleLog(`[System]: ❌ Fehler beim Verschieben in Quarantäne: ${data.error || 'Unbekannter Fehler'}`);
            alert(`Fehler beim Verschieben in Quarantäne: ${data.error}`);
        }
    } catch (e) {
        appendConsoleLog(`[System]: ❌ Fehler beim Verschieben in Quarantäne: ${e.message}`);
        alert("Fehler beim Verschieben in Quarantäne: " + e.message);
    }
}

async function runToolConvert() {
    const targetPath = document.getElementById("tools-target-path").value || currentProject;
    if (activeProjectsProcessing && activeProjectsProcessing.has(targetPath)) {
        alert("Dieses Projekt wird bereits verarbeitet oder befindet sich in der Warteschlange!");
        return;
    }
    expandConsole();
    appendConsoleLog("[System]: Starte Batch-H.265-Konvertierung...");
    const quality = document.getElementById("tool-quality-slider") ? parseInt(document.getElementById("tool-quality-slider").value, 10) : 60;
    try {
        const response = await fetch("/api/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                media_type: "tool_batch_convert",
                project_name: targetPath,
                quality: quality
            })
        });
        if (response.ok) {
            connectLogStream();
        } else {
            appendConsoleLog(`[System]: ❌ Serverfehler (${response.status}) bei der Konvertierung.`);
        }
    } catch (e) {
        console.error("Error in runToolConvert:", e);
        appendConsoleLog(`[System]: ❌ Fehler bei der Konvertierung: ${e.message}`);
    }
}

async function runToolGeneric(toolType, logMsg, extraParams = {}) {
    const targetPath = document.getElementById("tools-target-path").value.trim();

    if (!targetPath) {
        alert("Sicherheits-Stopp: Bitte wähle zuerst einen spezifischen Zielordner-Pfad aus oder klicke auf 'Durchsuchen'!");
        return;
    }
    if (activeProjectsProcessing && activeProjectsProcessing.has(targetPath)) {
        alert("Dieses Projekt wird bereits verarbeitet oder befindet sich in der Warteschlange!");
        return;
    }

    // Check if a dangerous root directory is selected
    const nasRoot = currentSettings.nas_root || "";
    const inbox = currentSettings.inbox_dir || "";
    const outbox = currentSettings.outbox_dir || "";

    if (targetPath === nasRoot || targetPath === inbox || targetPath === outbox || targetPath === "/") {
        const confirmRoot = confirm(`WARNUNG: Du hast einen Hauptordner (${targetPath}) ausgewählt!\n\nDas Werkzeug wird auf ALLE Unterordner und Dateien darin angewendet, was sehr lange dauern kann.\n\nBist du dir ganz sicher, dass du keinen spezifischen Unterordner auswählen wolltest?`);
        if (!confirmRoot) return;
    }

    expandConsole();
    appendConsoleLog(`[System]: ${logMsg}`);

    const openAfter = document.getElementById("opt-open-after")?.checked || false;
    const deleteOriginal = document.getElementById("opt-delete-original")?.checked || false;

    const payload = {
        media_type: toolType,
        project_name: targetPath,
        open_after: openAfter,
        delete_original: deleteOriginal,
        ...extraParams
    };

    const response = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (response.ok) connectLogStream();
}

// ==========================================================================
// EVENT LISTENERS BINDINGS
// ==========================================================================
function initEventListeners() {
    // Startseiten-Arbeitsbereich Buttons
    document.getElementById("btn-open-inbox")?.addEventListener("click", () => {
        if (currentSettings && currentSettings.inbox_dir) {
            window.openFolder({ path: currentSettings.inbox_dir });
        } else {
            alert("Inbox-Pfad ist nicht konfiguriert!");
        }
    });
    document.getElementById("btn-open-outbox")?.addEventListener("click", () => {
        if (currentSettings && currentSettings.outbox_dir) {
            window.openFolder({ path: currentSettings.outbox_dir });
        } else {
            alert("Outbox-Pfad ist nicht konfiguriert!");
        }
    });
    document.getElementById("btn-paths-clean-trigger")?.addEventListener("click", () => openPathsCleanModal(true, true));

    // Bibliotheks-Wartung Pflege-Werkzeuge
    document.getElementById("lib-tool-btn-convert")?.addEventListener("click", () => {
        const path = document.getElementById("lib-tools-manual-path")?.value.trim();
        openToolRunnerModal("tool_batch_convert", "H.265 Batch-Konvertierung", "Videos im gewählten Verzeichnis in das platzsparende H.265 (HEVC) Format konvertieren.", true, path || undefined);
    });
    document.getElementById("lib-tool-btn-nfo-agent")?.addEventListener("click", () => {
        const path = document.getElementById("lib-tools-manual-path")?.value.trim();
        if (!path) {
            alert("Bitte gib zuerst ein zu scannendes Verzeichnis ein.");
            return;
        }
        openNfoAgentModal(path);
    });
    document.getElementById("lib-tool-btn-clean")?.addEventListener("click", () => {
        const path = document.getElementById("lib-tools-manual-path")?.value.trim();
        if (path) {
            if (confirm(`Ordner bereinigen für dieses Verzeichnis ausführen?\n\nPfad: ${path}`)) {
                runContextTool("tool_clean", path);
            }
        } else {
            openToolRunnerModal("tool_clean", "Ordner bereinigen", "Entfernt leere Ordner und unerwünschte Junk-Dateien (z.B. txt, url, exe, ds_store, nfo, jpg, png).");
        }
    });
    document.getElementById("lib-tool-btn-manual-sync")?.addEventListener("click", () => {
        const path = document.getElementById("lib-tools-manual-path")?.value.trim();
        openToolRunnerModal("tool_manual_sync", "Speicherziel-Syncing", "Kopiert den gewählten Ordner auf das NAS-Speicherziel und optional in die pCloud.", false, path || undefined);
    });

    const connectNasBtn = document.getElementById("btn-connect-nas");
    if (connectNasBtn) {
        connectNasBtn.addEventListener("click", async () => {
            connectNasBtn.disabled = true;
            connectNasBtn.textContent = "Verbinde...";
            try {
                const response = await fetch("/api/nas/connect", { method: "POST" });
                const data = await response.json();
                alert(data.message || (response.ok ? "NAS wurde verbunden." : "NAS-Verbindung fehlgeschlagen."));
                await loadStatus();
            } catch (error) {
                console.error("NAS-Verbindung fehlgeschlagen:", error);
                alert("NAS-Verbindung fehlgeschlagen. Bitte prüfe, ob der Server erreichbar ist.");
            } finally {
                connectNasBtn.disabled = false;
                connectNasBtn.textContent = "Verbinden";
            }
        });
    }

    const heroConnectNasBtn = document.getElementById("btn-hero-connect-nas");
    if (heroConnectNasBtn) {
        heroConnectNasBtn.addEventListener("click", async () => {
            if (heroConnectNasBtn.textContent.trim() === "Einrichten") {
                const navSettings = document.getElementById("nav-settings-dashboard");
                if (navSettings) {
                    navSettings.click();
                    setTimeout(() => {
                        const syncTabBtn = document.querySelector('.settings-tab-btn[data-settings-tab="tab-sync"]');
                        if (syncTabBtn) syncTabBtn.click();
                        setTimeout(() => {
                            const targetEl = document.getElementById("settings-storage-targets-container");
                            if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth' });
                        }, 100);
                    }, 150);
                }
                return;
            }
            const originalText = heroConnectNasBtn.textContent;
            heroConnectNasBtn.disabled = true;
            heroConnectNasBtn.textContent = "Verbinde...";

            if (connectNasBtn) {
                connectNasBtn.disabled = true;
                connectNasBtn.textContent = "Verbinde...";
            }

            try {
                const response = await fetch("/api/nas/connect", { method: "POST" });
                const data = await response.json();
                alert(data.message || (response.ok ? "NAS wurde verbunden." : "NAS-Verbindung fehlgeschlagen."));
                await loadStatus();
            } catch (error) {
                console.error("NAS-Verbindung fehlgeschlagen:", error);
                alert("NAS-Verbindung fehlgeschlagen. Bitte prüfe, ob der Server erreichbar ist.");
            } finally {
                heroConnectNasBtn.disabled = false;
                heroConnectNasBtn.textContent = originalText;
                if (connectNasBtn) {
                    connectNasBtn.disabled = false;
                    connectNasBtn.textContent = "Verbinden";
                }
            }
        });
    }

    const heroRefreshNasBtn = document.getElementById("btn-hero-refresh-nas");
    if (heroRefreshNasBtn) {
        heroRefreshNasBtn.addEventListener("click", async () => {
            heroRefreshNasBtn.disabled = true;
            const originalText = heroRefreshNasBtn.textContent;
            heroRefreshNasBtn.textContent = "Prüfe...";
            try {
                await loadStatus(true);
            } finally {
                heroRefreshNasBtn.disabled = false;
                heroRefreshNasBtn.textContent = originalText;
            }
        });
    }

    // Settings Sub-Tabs navigation click listeners
    const settingsTabButtons = document.querySelectorAll(".settings-tab-btn");
    const settingsTabDescriptions = {
        "tab-paths": "Passe die globalen Pfade für das Medienwerkzeug an. Diese Werte werden für das Importieren und Verschieben verwendet.",
        "tab-sync": "Verwalte deine Speicherziele, Import-Quellen und Sync-Kategorien für die automatische Medienverteilung.",
        "tab-notifications": "Konfiguriere, wann und wie du über abgeschlossene Verarbeitungen benachrichtigt wirst.",
        "tab-appearance": "Passe das Erscheinungsbild der App an und verwalte die Abhängigkeiten zu externen CLI-Tools."
    };
    settingsTabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetTabId = btn.getAttribute("data-settings-tab");

            settingsTabButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            document.querySelectorAll(".settings-tab-panel").forEach(panel => {
                if (panel.id === `settings-${targetTabId}`) {
                    panel.classList.remove("hidden");
                } else {
                    panel.classList.add("hidden");
                }
            });

            const descEl = document.getElementById("settings-tab-desc");
            if (descEl && settingsTabDescriptions[targetTabId]) {
                descEl.textContent = settingsTabDescriptions[targetTabId];
            }
        });
    });

    // Refresh & Clean
    document.getElementById("btn-scan-project").addEventListener("click", () => scanProject(currentProject));
    document.getElementById("btn-clean-project").addEventListener("click", cleanCurrentProject);

    const cleanList = document.getElementById("clean-list");
    if (cleanList) {
        cleanList.addEventListener("click", (e) => {
            const toggle = e.target.closest(".group-select-toggle");
            if (toggle) {
                const groupContainer = toggle.closest(".clean-group-container");
                if (groupContainer) {
                    const checkboxes = groupContainer.querySelectorAll(".clean-cb-item");
                    const anyUnchecked = Array.from(checkboxes).some(cb => !cb.checked);
                    checkboxes.forEach(cb => {
                        const wasChecked = cb.checked;
                        cb.checked = anyUnchecked;
                        if (wasChecked !== anyUnchecked) {
                            cb.dispatchEvent(new Event("change", { bubbles: true }));
                        }
                    });
                }
            }
        });

        cleanList.addEventListener("change", (e) => {
            const cb = e.target.closest(".clean-cb-item");
            if (cb) {
                const filename = cb.dataset.file;
                if (!filename) return;

                const dotIdx = filename.lastIndexOf(".");
                if (dotIdx === -1) return;
                const ext = filename.substring(dotIdx).toLowerCase();
                const videoExtensions = ['.mp4', '.mkv', '.avi', '.webm', '.mov'];

                if (videoExtensions.includes(ext)) {
                    const baseName = filename.substring(0, dotIdx);
                    const isChecked = cb.checked;

                    const otherCbs = cleanList.querySelectorAll(".clean-cb-item");
                    otherCbs.forEach(otherCb => {
                        if (otherCb === cb) return;
                        const otherFile = otherCb.dataset.file;
                        if (!otherFile) return;
                        const otherDotIdx = otherFile.lastIndexOf(".");
                        if (otherDotIdx === -1) return;

                        const otherBaseName = otherFile.substring(0, otherDotIdx);
                        const otherExt = otherFile.substring(otherDotIdx).toLowerCase();

                        if (otherBaseName === baseName && !videoExtensions.includes(otherExt)) {
                            if (otherCb.checked !== isChecked) {
                                otherCb.checked = isChecked;
                                const label = otherCb.closest("label");
                                if (label) {
                                    label.style.transition = "background-color 0.2s ease";
                                    label.style.backgroundColor = "rgba(var(--accent-rgb), 0.25)";
                                    setTimeout(() => {
                                        label.style.backgroundColor = "transparent";
                                    }, 800);
                                }
                            }
                        }
                    });
                }
            }
        });
    }

    // Import StreamFab Preview & Execution
    let currentImportPreviewData = [];

    document.getElementById("btn-streamfab-import").addEventListener("click", async () => {
        appendConsoleLog("[System]: Lade Import-Vorschau...");
        try {
            const response = await fetch("/api/streamfab-import/preview", { method: "GET" });
            const data = await response.json();
            if (data.status === "ok") {
                currentImportPreviewData = data.preview;
                renderImportPreviewModal(currentImportPreviewData);
                document.getElementById("modal-import-preview").classList.add("active");
            } else {
                appendConsoleLog("❌ Fehler beim Laden der Import-Vorschau.");
            }
        } catch (e) {
            appendConsoleLog(`❌ Fehler beim Laden der Import-Vorschau: ${e}`);
        }
    });

    window.closeImportPreview = function() {
        document.getElementById("modal-import-preview").classList.remove("active");
    };

    window.openFolder = async function(params) {
        if (window.AppCapabilities && window.AppCapabilities.capabilities && !window.AppCapabilities.capabilities.open_local_folder) {
            // Docker Modus: Web-Ansicht öffnen
            document.getElementById("docker-folder-view-list").innerHTML = "";
            document.getElementById("docker-folder-view-loading").classList.remove("hidden");
            document.getElementById("docker-folder-view-empty").classList.add("hidden");
            document.getElementById("docker-folder-view-error").classList.add("hidden");
            document.getElementById("docker-folder-view-path").textContent = params.path || "Lade...";
            document.getElementById("docker-folder-view-title").textContent = "Ordnerinhalt";
            document.getElementById("modal-docker-folder-view").classList.remove("hidden");

            try {
                const res = await fetch('/api/system-folder-contents', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(params)
                });
                const data = await res.json();

                document.getElementById("docker-folder-view-loading").classList.add("hidden");

                if (!res.ok || data.error) {
                    document.getElementById("docker-folder-view-error").textContent = data.error || "Unbekannter Fehler beim Laden des Ordners.";
                    document.getElementById("docker-folder-view-error").classList.remove("hidden");
                    return;
                }

                if (data.path) {
                    document.getElementById("docker-folder-view-path").textContent = data.path;
                }
                if (data.folder_name) {
                    document.getElementById("docker-folder-view-title").textContent = data.folder_name;
                }

                const listEl = document.getElementById("docker-folder-view-list");
                if (!data.files || data.files.length === 0) {
                    document.getElementById("docker-folder-view-empty").classList.remove("hidden");
                } else {
                    data.files.forEach(f => {
                        const tr = document.createElement("tr");
                        tr.style.borderBottom = "1px solid rgba(255,255,255,0.05)";

                        const tdIcon = document.createElement("td");
                        tdIcon.style.padding = "10px 15px";
                        tdIcon.style.color = f.is_error ? "#ef4444" : "inherit";
                        if (f.is_error) {
                            tdIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle" style="display:inline-block; vertical-align:middle; color:#ef4444;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`;
                        } else if (f.is_dir) {
                            tdIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder" style="display:inline-block; vertical-align:middle; color:var(--accent);"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/></svg>`;
                        } else {
                            tdIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file" style="display:inline-block; vertical-align:middle; color:var(--text-muted);"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`;
                        }

                        const tdName = document.createElement("td");
                        tdName.style.padding = "10px 15px";
                        tdName.style.color = f.is_error ? "#ef4444" : "var(--text-main)";
                        tdName.style.wordBreak = "break-all";
                        tdName.textContent = f.name + (f.is_error ? " (Fehler: " + f.error + ")" : "");

                        const tdSize = document.createElement("td");
                        tdSize.style.padding = "10px 15px";
                        tdSize.style.textAlign = "right";
                        tdSize.style.color = "var(--text-muted)";
                        if (!f.is_dir && !f.is_error && f.size_bytes !== null) {
                            tdSize.textContent = formatBytes(f.size_bytes);
                        } else {
                            tdSize.textContent = "-";
                        }

                        const tdTime = document.createElement("td");
                        tdTime.style.padding = "10px 15px";
                        tdTime.style.textAlign = "right";
                        tdTime.style.color = "var(--text-muted)";
                        if (f.modified_time) {
                            const d = new Date(f.modified_time * 1000);
                            tdTime.textContent = d.toLocaleString();
                        } else {
                            tdTime.textContent = "-";
                        }

                        tr.appendChild(tdIcon);
                        tr.appendChild(tdName);
                        tr.appendChild(tdSize);
                        tr.appendChild(tdTime);
                        listEl.appendChild(tr);
                    });
                }
            } catch (e) {
                document.getElementById("docker-folder-view-loading").classList.add("hidden");
                document.getElementById("docker-folder-view-error").textContent = "Netzwerkfehler: " + e.message;
                document.getElementById("docker-folder-view-error").classList.remove("hidden");
            }
        } else {
            // Desktop Modus: Normal im OS öffnen
            return fetch('/api/system-open-folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            }).then(res => res.json()).then(data => {
                if (data.error && params.category_id) {
                    alert(data.error);
                } else if (data.msg && params.category_id) {
                    appendConsoleLog(`[System]: ${data.msg}`);
                }
                return data;
            }).catch(() => {});
        }
    };

    window.openFolderInFinder = function(path) {
        return window.openFolder({ path: path });
    };

    let folderPickerCallback = null;
    let folderPickerCurrentPath = "";
    let folderPickerRootLimit = "";
    let folderPickerTarget = null;

    window.closeFolderPicker = function() {
        document.getElementById("modal-folder-picker").classList.remove("active");
        folderPickerCallback = null;
    };

    window.openFolderPicker = function(startPath, rootLimit, target, title, onSelect) {
        folderPickerCallback = onSelect;
        folderPickerRootLimit = rootLimit || "";
        folderPickerTarget = target;

        let path = startPath || rootLimit || "/media";
        if (rootLimit && !path.startsWith(rootLimit)) {
            path = rootLimit;
        }

        const titleEl = document.getElementById("modal-folder-picker-title");
        if (titleEl) {
            titleEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-open" style="display:inline-block; vertical-align:middle; margin-right: 6px; color: var(--accent);"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>${escapeHTML(title || "Ordner auswählen")}`;
        }

        document.getElementById("modal-folder-picker").classList.add("active");
        loadFolderPickerDir(path);
    };

    async function loadFolderPickerDir(path) {
        folderPickerCurrentPath = path;
        document.getElementById("folder-picker-current-path").textContent = path;

        const upBtn = document.getElementById("folder-picker-up-btn");
        if (upBtn) {
            if (path === folderPickerRootLimit || path === "/" || path === "") {
                upBtn.disabled = true;
                upBtn.style.opacity = "0.5";
            } else {
                upBtn.disabled = false;
                upBtn.style.opacity = "1";
            }
        }

        const listEl = document.getElementById("folder-picker-list");
        const loadingEl = document.getElementById("folder-picker-loading");
        const errorEl = document.getElementById("folder-picker-error");

        listEl.innerHTML = "";
        loadingEl.style.display = "block";
        errorEl.classList.add("hidden");

        try {
            const response = await fetch(`/api/list-subfolders?path=${encodeURIComponent(path)}`);
            const data = await response.json();
            loadingEl.style.display = "none";

            if (data.error) {
                errorEl.textContent = data.error;
                errorEl.classList.remove("hidden");
                return;
            }

            const subfolders = data.subfolders || [];
            if (subfolders.length === 0) {
                const li = document.createElement("li");
                li.style.padding = "10px 15px";
                li.style.color = "var(--text-muted)";
                li.style.fontStyle = "italic";
                li.textContent = "Keine Unterordner vorhanden.";
                listEl.appendChild(li);
            } else {
                subfolders.forEach(sub => {
                    const li = document.createElement("li");
                    li.style.padding = "10px 15px";
                    li.style.borderBottom = "1px solid rgba(255, 255, 255, 0.05)";
                    li.style.cursor = "pointer";
                    li.style.display = "flex";
                    li.style.alignItems = "center";
                    li.style.gap = "8px";
                    const iconSpan = document.createElement("span");
                    iconSpan.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder" style="display:inline-block; vertical-align:middle; color: var(--accent);"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/></svg>';
                    const nameSpan = document.createElement("span");
                    nameSpan.className = "folder-name";
                    nameSpan.textContent = sub;
                    li.appendChild(iconSpan);
                    li.appendChild(nameSpan);

                    li.addEventListener("mouseenter", () => {
                        li.style.background = "rgba(255, 255, 255, 0.03)";
                    });
                    li.addEventListener("mouseleave", () => {
                        li.style.background = "transparent";
                    });
                    li.addEventListener("click", () => {
                        let newPath = path;
                        if (!newPath.endsWith("/")) newPath += "/";
                        newPath += sub;
                        loadFolderPickerDir(newPath);
                    });
                    listEl.appendChild(li);
                });
            }
        } catch (e) {
            loadingEl.style.display = "none";
            errorEl.textContent = "Netzwerkfehler beim Laden: " + e.message;
            errorEl.classList.remove("hidden");
        }
    }

    const upBtn = document.getElementById("folder-picker-up-btn");
    if (upBtn) {
        upBtn.onclick = (e) => {
            e.preventDefault();
            if (folderPickerCurrentPath === folderPickerRootLimit || folderPickerCurrentPath === "/" || folderPickerCurrentPath === "") {
                return;
            }
            const parts = folderPickerCurrentPath.split("/");
            parts.pop();
            let newPath = parts.join("/");
            if (newPath === "") newPath = "/";
            loadFolderPickerDir(newPath);
        };
    }

    const selectBtn = document.getElementById("folder-picker-select-btn");
    if (selectBtn) {
        selectBtn.onclick = (e) => {
            e.preventDefault();
            if (folderPickerCallback) {
                folderPickerCallback(folderPickerCurrentPath);
            }
            closeFolderPicker();
        };
    }

    function renderImportPreviewModal(previewData) {
        const listContainer = document.getElementById("import-preview-list");
        listContainer.innerHTML = "";

        if (!previewData || previewData.length === 0) {
            listContainer.innerHTML = "<p class='text-muted'>Keine Dateien zum Importieren gefunden.</p>";
            return;
        }

        // --- Bulk Action Toolbar ---
        let allExtensions = new Set();
        previewData.forEach(g => g.files.forEach(f => {
            let parts = f.filename.split('.');
            if (parts.length > 1) {
                allExtensions.add("." + parts[parts.length-1].toLowerCase());
            } else {
                allExtensions.add("Ohne Endung");
            }
        }));

        const bulkDiv = document.createElement("div");
        bulkDiv.className = "flex justify-between items-center mb-4 p-3 rounded";
        bulkDiv.style.background = "var(--bg-main)";
        bulkDiv.style.border = "1px solid var(--border-color)";
        bulkDiv.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="font-bold text-sm">Filter:</span>
                <select id="filter-ext" class="input input-sm" style="width:140px;" onchange="applyVisualFilter()">
                    <option value="all">Alle anzeigen</option>
                    ${Array.from(allExtensions).sort().map(ext => `<option value="${ext}">${ext}</option>`).join("")}
                </select>
            </div>
            <div class="flex items-center gap-3 border-l border-gray-600 pl-4">
                <span class="text-sm">Sichtbare setzen auf:</span>
                <select id="bulk-action" class="input input-sm" style="width:130px;">
                    <option value="import">Importieren</option>
                    <option value="ignore">Ignorieren</option>
                    <option value="delete">In Quarantäne</option>
                </select>
                <button class="btn btn-sm btn-secondary" onclick="applyBulkImportAction()">Anwenden</button>
            </div>
        `;
        listContainer.appendChild(bulkDiv);

        window.applyVisualFilter = function() {
            const ext = document.getElementById("filter-ext").value;
            // Iterate over all groups and their rows
            document.querySelectorAll(".import-group").forEach(groupDiv => {
                let visibleCount = 0;
                groupDiv.querySelectorAll(".file-row").forEach(row => {
                    if (ext === "all" || row.getAttribute("data-ext") === ext) {
                        row.style.display = "flex";
                        visibleCount++;
                    } else {
                        row.style.display = "none";
                    }
                });
                // Hide entire group if no files are visible
                groupDiv.style.display = visibleCount > 0 ? "block" : "none";
            });
        };

        window.applyBulkImportAction = function() {
            const act = document.getElementById("bulk-action").value;
            document.querySelectorAll("#import-preview-list .file-row").forEach(row => {
                if (row.style.display !== "none") {
                    const sel = row.querySelector(".action-select");
                    if (sel) sel.value = act;
                }
            });
        };
        // --- End Bulk Action Toolbar ---

        previewData.forEach((group) => {
            // Sort files by extension, then name
            group.files.sort((a, b) => {
                const extA = a.filename.split('.').pop().toLowerCase();
                const extB = b.filename.split('.').pop().toLowerCase();
                if (extA !== extB) return extA.localeCompare(extB);
                return a.filename.localeCompare(b.filename);
            });

            const groupDiv = document.createElement("div");
            groupDiv.className = "mb-4 border border-gray-700 rounded p-3 inline-style-119 import-group";
            groupDiv.style.background = "var(--bg-card)";

            // Assume all files in group come from roughly same dir
            const firstPath = group.files.length > 0 ? group.files[0].path : "";
            const dirPath = firstPath ? firstPath.substring(0, firstPath.lastIndexOf('/')) : "";

            const header = document.createElement("div");
            header.className = "flex justify-between items-center mb-2 pb-2 border-b border-gray-700";
            header.innerHTML = `
                <div>
                    <strong style="color: var(--accent);">${group.project_name}</strong>
                    <span class="text-muted text-sm ml-2">Ordner: ${group.safe_folder_name}</span>
                </div>
                <button class="btn btn-xs btn-secondary" onclick="openFolderInFinder('${dirPath.replace(/'/g, "\\'")}')" title="Im Finder öffnen"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder" style="display:inline-block; vertical-align:middle; margin-right: 4px; height: 12px; width: 12px;"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/></svg>Finder</button>
            `;
            groupDiv.appendChild(header);

            group.files.forEach((file) => {
                const fileRow = document.createElement("div");
                fileRow.className = "flex justify-between items-center py-1 text-sm file-row";
                fileRow.style.borderBottom = "1px solid var(--border-color)";

                let parts = file.filename.split('.');
                let fExt = parts.length > 1 ? "." + parts[parts.length-1].toLowerCase() : "Ohne Endung";
                fileRow.setAttribute("data-ext", fExt);

                const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
                const defaultAction = "import";

                fileRow.innerHTML = `
                    <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 10px;" title="${file.path}">
                        ${file.filename} <span class="text-muted" style="font-size: 0.8em;">(${sizeMb} MB)</span>
                    </div>
                    <select class="input input-sm action-select" data-group="${group.safe_folder_name}" data-path="${file.path}" data-filename="${file.filename}" style="width: 130px;">
                        <option value="import" ${defaultAction === 'import' ? 'selected' : ''}>Importieren</option>
                        <option value="ignore">Ignorieren</option>
                        <option value="delete">In Quarantäne</option>
                    </select>
                `;
                groupDiv.appendChild(fileRow);
            });

            listContainer.appendChild(groupDiv);
        });
    }

    window.confirmImportPreview = async function() {
        const selects = document.querySelectorAll("#import-preview-list .action-select");
        const importItems = {};
        const deleteItems = [];

        selects.forEach(select => {
            const action = select.value;
            const group = select.getAttribute("data-group");
            const path = select.getAttribute("data-path");

            if (action === "import") {
                if (!importItems[group]) importItems[group] = [];
                importItems[group].push(path);
            } else if (action === "delete") {
                deleteItems.push(path);
            }
        });

        closeImportPreview();
        appendConsoleLog("[System]: Führe Import aus...");

        try {
            const response = await fetch("/api/streamfab-import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ import_items: importItems, delete_items: deleteItems })
            });
            const data = await response.json();
            if (data.status === "ok") {
                appendConsoleLog(`${data.moved_count} Datei(en) in die Inbox importiert.`);
                loadStatus();
                if (currentProject === "") {
                    scanProject("");
                }
            } else {
                appendConsoleLog(`❌ Fehler beim StreamFab Import.`);
            }
        } catch (e) {
            appendConsoleLog(`❌ Fehler beim StreamFab Import: ${e}`);
        }
    };

    // Browse Tools Path
    const btnBrowseTools = document.getElementById("btn-browse-tools-path");
    if (btnBrowseTools) {
        btnBrowseTools.addEventListener("click", async () => {
            const caps = window.AppCapabilities;
            const openLocalEnabled = caps && caps.capabilities && caps.capabilities.open_local_folder;
            const inputEl = document.getElementById("tools-target-path");
            if (!inputEl) return;

            if (!openLocalEnabled) {
                let dockerRoot = "/media";
                const nasTarget = (currentSettings.storage_targets || []).find(t => t.id === "nas");
                if (nasTarget && nasTarget.root_path) {
                    dockerRoot = nasTarget.root_path;
                }
                const val = inputEl.value;
                window.openFolderPicker(val || dockerRoot, dockerRoot, null, "Ordner auswählen", (selectedPath) => {
                    inputEl.value = selectedPath;
                });
            } else {
                try {
                    const response = await fetch("/api/browse-folder");
                    const data = await response.json();
                    if (data.status === "ok" && data.path) {
                        inputEl.value = data.path;
                    }
                } catch (e) {
                    console.error("Browse folder error:", e);
                }
            }
        });
    }

    // Workflow routing relies entirely on the big cards now.

    // Series searches & loads
    document.getElementById("btn-search-series").addEventListener("click", searchSeries);
    document.getElementById("series-search-query").addEventListener("keypress", (e) => {
        if (e.key === "Enter") searchSeries();
    });
    document.getElementById("btn-fetch-episodes").addEventListener("click", fetchEpisodes);
    document.getElementById("btn-execute-series-process").addEventListener("click", executeSeriesWorkflow);

    // Manual Movie setup
    const btnManualMovie = document.getElementById("btn-manual-movie");
    const manualMovieContainer = document.getElementById("manual-movie-container");
    if (btnManualMovie && manualMovieContainer) {
        btnManualMovie.addEventListener("click", () => {
            isManualMovieMode = !isManualMovieMode;
            if (isManualMovieMode) {
                btnManualMovie.classList.add("active");
                btnManualMovie.textContent = "Suche nutzen";
                manualMovieContainer.classList.remove("hidden");
                const movieResults = document.getElementById("movie-search-results");
                if (movieResults) movieResults.innerHTML = "";
                const selectedMoviePanel = document.getElementById("selected-movie-panel");
                if (selectedMoviePanel) selectedMoviePanel.classList.add("hidden");

                updateSelectedMovieFromInputs();
            } else {
                btnManualMovie.classList.remove("active");
                btnManualMovie.textContent = "Manuell eintragen";
                manualMovieContainer.classList.add("hidden");
                selectedMovie = null;
            }
        });
    }

    const updateSelectedMovieFromInputs = () => {
        if (isManualMovieMode) {
            const titleVal = document.getElementById("manual-movie-title").value.trim() || currentProject || "Manueller Film";
            const yearVal = document.getElementById("manual-movie-year").value.trim() || "";
            const plotVal = document.getElementById("manual-movie-plot").value.trim() || "";

            const movieMetaObj = {
                title: titleVal,
                year: yearVal,
                plot: plotVal
            };

            selectedMovie = {
                id: JSON.stringify(movieMetaObj),
                name: titleVal,
                provider: "manual"
            };
        }
    };
    document.getElementById("manual-movie-title")?.addEventListener("input", updateSelectedMovieFromInputs);
    document.getElementById("manual-movie-year")?.addEventListener("input", updateSelectedMovieFromInputs);
    document.getElementById("manual-movie-plot")?.addEventListener("input", updateSelectedMovieFromInputs);

    // Manual Series setup
    const btnManualSeries = document.getElementById("btn-manual-series");
    const manualSeriesContainer = document.getElementById("manual-series-container");
    if (btnManualSeries && manualSeriesContainer) {
        btnManualSeries.addEventListener("click", () => {
            isManualSeriesMode = !isManualSeriesMode;
            if (isManualSeriesMode) {
                btnManualSeries.classList.add("active");
                btnManualSeries.textContent = "Suche nutzen";
                manualSeriesContainer.classList.remove("hidden");
                const seriesResults = document.getElementById("series-search-results");
                if (seriesResults) seriesResults.innerHTML = "";
                const selectedShowPanel = document.getElementById("selected-show-panel");
                if (selectedShowPanel) selectedShowPanel.classList.add("hidden");

                updateSelectedShowFromInputs();
                renderMatchingMatrix();
                const seriesExec = document.getElementById("series-execution-panel");
                if (seriesExec) seriesExec.classList.remove("hidden");
            } else {
                btnManualSeries.classList.remove("active");
                btnManualSeries.textContent = "Manuell eintragen";
                manualSeriesContainer.classList.add("hidden");
                selectedShow = null;
                const matchContainer = document.getElementById("matching-panel-container");
                if (matchContainer) matchContainer.innerHTML = "";
                const seriesExec = document.getElementById("series-execution-panel");
                if (seriesExec) seriesExec.classList.add("hidden");
            }
        });
    }

    const updateSelectedShowFromInputs = () => {
        if (isManualSeriesMode) {
            const titleVal = document.getElementById("manual-series-title").value.trim() || currentProject || "Manuelle Serie";
            const plotVal = document.getElementById("manual-series-plot").value.trim() || "";

            const showMetaObj = {
                title: titleVal,
                plot: plotVal
            };

            selectedShow = {
                id: JSON.stringify(showMetaObj),
                name: titleVal,
                plot: plotVal,
                provider: "manual"
            };
        }
    };
    document.getElementById("manual-series-title")?.addEventListener("input", updateSelectedShowFromInputs);
    document.getElementById("manual-series-plot")?.addEventListener("input", updateSelectedShowFromInputs);

    const allSeasonsCb = document.getElementById("series-all-seasons");
    if (allSeasonsCb) {
        allSeasonsCb.addEventListener("change", (e) => {
            const seasonInput = document.getElementById("series-season-num");
            if (seasonInput) {
                if (e.target.checked) {
                    seasonInput.disabled = true;
                    seasonInput.style.opacity = "0.5";
                } else {
                    seasonInput.disabled = false;
                    seasonInput.style.opacity = "1";
                }
            }
            fetchEpisodes();
        });
    }

    // Movie searches & loads
    document.getElementById("btn-search-movie").addEventListener("click", searchMovie);
    document.getElementById("movie-search-query").addEventListener("keypress", (e) => {
        if (e.key === "Enter") searchMovie();
    });
    document.getElementById("btn-execute-movie-process").addEventListener("click", executeMovieWorkflow);

    // YouTube Downloader
    document.getElementById("btn-analyse-yt-link").addEventListener("click", analyseYtLink);
    document.getElementById("yt-url").addEventListener("keypress", (e) => {
        if (e.key === "Enter") analyseYtLink();
    });

    document.getElementById("yt-meta-mode").addEventListener("change", toggleYtMetaSection);

    document.getElementById("btn-search-yt-movie").addEventListener("click", searchYtMovie);
    document.getElementById("yt-movie-search-query").addEventListener("keypress", (e) => {
        if (e.key === "Enter") searchYtMovie();
    });

    document.getElementById("btn-search-yt-series").addEventListener("click", searchYtSeries);
    document.getElementById("yt-series-search-query").addEventListener("keypress", (e) => {
        if (e.key === "Enter") searchYtSeries();
    });

    document.getElementById("yt-open-losslesscut").addEventListener("change", (e) => {
        const panel = document.getElementById("yt-custom-trim-panel");
        if (e.target.checked) {
            panel.classList.add("hidden");
        } else {
            panel.classList.remove("hidden");
        }
    });

    document.getElementById("btn-yt-reset").addEventListener("click", resetYtDownload);
    document.getElementById("btn-execute-yt-pipeline").addEventListener("click", startYtPipeline);

    document.getElementById("btn-yt-cut-done").addEventListener("click", markYtCutDone);
    document.getElementById("btn-yt-finalize-mapping").addEventListener("click", finalizeYtMapping);

    // YouTube subscriptions event listeners
    const btnAddAbo = document.getElementById("btn-add-abo");
    if (btnAddAbo) {
        btnAddAbo.addEventListener("click", addSubscription);
    }
    const btnCheckAllAbos = document.getElementById("btn-check-all-abos");
    if (btnCheckAllAbos) {
        btnCheckAllAbos.addEventListener("click", checkAllSubscriptions);
    }
    const urlAboInput = document.getElementById("abo-url");
    if (urlAboInput) {
        urlAboInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") addSubscription();
        });
    }


    // Tools Tab
    document.getElementById("tool-btn-pull-files")?.addEventListener("click", () => {
        openToolRunnerModal("tool_pull_files", "Dateien hochziehen", "Löst alle Unterordner im gewählten Verzeichnis auf und zieht alle Mediendateien hoch.");
    });
    document.getElementById("tool-btn-clean")?.addEventListener("click", () => {
        openToolRunnerModal("tool_clean", "Ordner bereinigen", "Entfernt leere Ordner und unerwünschte Junk-Dateien (z.B. txt, url, exe, ds_store, nfo, jpg, png).");
    });
    document.getElementById("tool-btn-paths-clean")?.addEventListener("click", openPathsCleanModal);

    // Modal-Steuerung für Medienpfade bereinigen
    document.getElementById("btn-paths-clean-close").addEventListener("click", closePathsCleanModal);
    document.getElementById("btn-paths-clean-select-cancel").addEventListener("click", closePathsCleanModal);
    document.getElementById("btn-paths-clean-preview-cancel").addEventListener("click", closePathsCleanModal);
    document.getElementById("btn-paths-clean-back").addEventListener("click", backToPathsCleanSelect);
    document.getElementById("btn-paths-clean-scan").addEventListener("click", runPathsCleanScan);
    document.getElementById("btn-paths-clean-execute").addEventListener("click", executePathsClean);

    // Schnellauswahl
    document.getElementById("btn-paths-clean-select-all").addEventListener("click", () => {
        document.querySelectorAll(".paths-clean-cb-item").forEach(cb => cb.checked = true);
    });
    document.getElementById("btn-paths-clean-select-none").addEventListener("click", () => {
        document.querySelectorAll(".paths-clean-cb-item").forEach(cb => cb.checked = false);
    });
    document.getElementById("btn-paths-clean-select-junk").addEventListener("click", () => {
        document.querySelectorAll(".paths-clean-cb-item").forEach(cb => {
            cb.checked = cb.dataset.junk === "true";
        });
    });

    document.getElementById("tool-btn-convert")?.addEventListener("click", () => {
        openToolRunnerModal("tool_batch_convert", "H.265 Batch-Konvertierung", "Videos im gewählten Verzeichnis in das platzsparende H.265 (HEVC) Format konvertieren.", true);
    });

    document.getElementById("tool-btn-nfo-agent")?.addEventListener("click", () => {
        const path = prompt("Bitte gib das zu scannende Verzeichnis für den NFO Agenten ein:");
        if (path && path.trim()) {
            openNfoAgentModal(path.trim());
        }
    });
    document.getElementById("tool-btn-nfo-batch")?.addEventListener("click", () => {
        const fskEl = document.getElementById("tool-fsk-value");
        const fsk = fskEl ? fskEl.value : "6";
        runToolGeneric("tool_nfo_batch_fsk", `Passe FSK auf ${fsk} an...`, { fsk: parseInt(fsk, 10) });
    });
    document.getElementById("tool-btn-manual-sync")?.addEventListener("click", () => {
        openToolRunnerModal("tool_manual_sync", "Speicherziel-Syncing", "Kopiert den gewählten Ordner auf das NAS-Speicherziel und optional in die pCloud.");
    });

    document.getElementById("tool-btn-pcloud-sync")?.addEventListener("click", () => {
        openToolRunnerModal("tool_pcloud_sync", "Reiner pCloud Sync", "Kopiert den gewählten Ordner in den Cloud-Ordner der pCloud.");
    });

    document.getElementById("tool-btn-profiles")?.addEventListener("click", openProfilesModal);
    document.getElementById("close-modal-profiles")?.addEventListener("click", () => {
        document.getElementById("modal-profiles").classList.remove("active");
    });

    // Modal-Tool-Runner Events
    document.getElementById("btn-browse-tool-modal-path")?.addEventListener("click", async () => {
        const caps = window.AppCapabilities;
        const openLocalEnabled = caps && caps.capabilities && caps.capabilities.open_local_folder;
        const inputEl = document.getElementById("tool-modal-target-path");
        if (!inputEl) return;

        if (!openLocalEnabled) {
            const allowedRoots = [];
            if (currentSettings.inbox_dir) allowedRoots.push(currentSettings.inbox_dir);
            if (currentSettings.outbox_dir) allowedRoots.push(currentSettings.outbox_dir);
            if (currentSettings.import_sources) {
                currentSettings.import_sources.forEach(src => { if (src) allowedRoots.push(src); });
            }
            if (currentSettings.local_download_folders) {
                currentSettings.local_download_folders.forEach(f => { if (f && f.path) allowedRoots.push(f.path); });
            }
            if (currentSettings.storage_targets) {
                currentSettings.storage_targets.forEach(t => { if (t && t.root_path) allowedRoots.push(t.root_path); });
            }

            let dockerRoot = "/media";
            const val = inputEl.value;
            if (val && val.startsWith("/")) {
                let longestMatch = "";
                allowedRoots.forEach(root => {
                    if (root) {
                        const normalizedRoot = root.replace(/\/$/, "");
                        const isMatch = val === normalizedRoot || val.startsWith(normalizedRoot + "/");
                        if (isMatch && root.length > longestMatch.length) {
                            longestMatch = root;
                        }
                    }
                });
                if (longestMatch) {
                    dockerRoot = longestMatch;
                } else {
                    const nasTarget = (currentSettings.storage_targets || []).find(t => t.id === "nas");
                    dockerRoot = (nasTarget && nasTarget.root_path) || "/media";
                }
            } else {
                const nasTarget = (currentSettings.storage_targets || []).find(t => t.id === "nas");
                dockerRoot = (nasTarget && nasTarget.root_path) || "/media";
            }

            window.openFolderPicker(val || dockerRoot, dockerRoot, null, "Ordner auswählen", (selectedPath) => {
                inputEl.value = selectedPath;
            });
        } else {
            try {
                let qs = "";
                if (inputEl.value) {
                    qs = "?default_path=" + encodeURIComponent(inputEl.value);
                }
                const response = await fetch("/api/browse-folder" + qs);
                const data = await response.json();
                if (data.status === "ok" && data.path) {
                    inputEl.value = data.path;
                }
            } catch (e) {
                console.error("Fehler beim Browsen im Modal:", e);
            }
        }
    });

    document.getElementById("btn-tool-modal-shortcut-inbox")?.addEventListener("click", () => {
        if (currentSettings && currentSettings.inbox_dir) {
            document.getElementById("tool-modal-target-path").value = currentSettings.inbox_dir;
        }
    });

    document.getElementById("btn-tool-modal-shortcut-outbox")?.addEventListener("click", () => {
        if (currentSettings && currentSettings.outbox_dir) {
            document.getElementById("tool-modal-target-path").value = currentSettings.outbox_dir;
        }
    });

    const closeToolRunnerModal = () => {
        document.getElementById("modal-tool-runner").classList.remove("active");
    };
    document.getElementById("btn-tool-modal-cancel")?.addEventListener("click", closeToolRunnerModal);
    document.getElementById("close-modal-tool-runner")?.addEventListener("click", closeToolRunnerModal);

    document.getElementById("btn-tool-modal-execute")?.addEventListener("click", async () => {
        const path = document.getElementById("tool-modal-target-path").value.trim();
        if (!path) {
            alert("Bitte wähle zuerst einen Zielordner-Pfad aus!");
            return;
        }
        if (activeProjectsProcessing && activeProjectsProcessing.has(path)) {
            alert("Dieses Projekt wird bereits verarbeitet oder befindet sich in der Warteschlange!");
            return;
        }
        closeToolRunnerModal();

        const toolType = window.currentActiveTool;
        if (toolType === "tool_pull_files") {
            expandConsole();
            appendConsoleLog("[System]: Verschiebe Dateien aus Unterordnern nach oben...");
            try {
                const res = await fetch("/api/process", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ media_type: "tool_pull_files", project_name: path })
                });
                if (res.ok) connectLogStream();
                else appendConsoleLog(`[System]: ❌ Serverfehler bei der Ausführung.`);
            } catch(e) {
                appendConsoleLog(`[System]: ❌ Fehler: ${e.message}`);
            }
        } else if (toolType === "tool_batch_convert") {
            const slider = document.getElementById("tool-modal-quality-slider");
            const quality = slider ? parseInt(slider.value, 10) : 60;
            expandConsole();
            appendConsoleLog("[System]: Starte Batch-H.265-Konvertierung...");
            try {
                const res = await fetch("/api/process", {
                     method: "POST",
                     headers: { "Content-Type": "application/json" },
                     body: JSON.stringify({ media_type: "tool_batch_convert", project_name: path, quality: quality })
                });
                if (res.ok) connectLogStream();
                else appendConsoleLog(`[System]: ❌ Serverfehler bei der Ausführung.`);
            } catch(e) {
                appendConsoleLog(`[System]: ❌ Fehler: ${e.message}`);
            }
        } else if (toolType === "tool_nfo_agent") {
            expandConsole();
            appendConsoleLog("[System]: Starte NFO Agent...");
            try {
                const res = await fetch("/api/process", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ media_type: "tool_nfo_agent", project_name: path })
                });
                if (res.ok) connectLogStream();
                else appendConsoleLog(`[System]: ❌ Serverfehler bei der Ausführung.`);
            } catch(e) {
                appendConsoleLog(`[System]: ❌ Fehler: ${e.message}`);
            }
        } else if (toolType === "tool_clean") {
            runToolClean(path);
        } else if (toolType === "tool_manual_sync") {
            const catId = document.getElementById("tool-modal-sync-category")?.value;
            const category = currentSettings.sync_categories?.find(c => String(c.id) === String(catId));
            if(!category) {
                alert("Bitte wähle eine gültige Kategorie."); return;
            }

            const copyToTargets = {};
            if (currentSettings.storage_targets) {
                currentSettings.storage_targets.forEach(t => {
                    const cb = document.getElementById(`tool-sync-target-${t.id}`);
                    if (cb) {
                        copyToTargets[`copy_to_${t.id}`] = cb.checked;
                    }
                });
            }

            expandConsole();
            appendConsoleLog("[System]: Starte NAS Sync...");
            try {
                const res = await fetch("/api/process", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        media_type: "tool_manual_sync",
                        project_name: path,
                        category_id: catId,
                        ...copyToTargets
                    })
                });
                if (res.ok) connectLogStream();
            } catch(e) {
                appendConsoleLog(`[System]: ❌ Fehler: ${e.message}`);
            }
        } else if (toolType === "tool_pcloud_sync") {
            if(!currentSettings.sync_categories || currentSettings.sync_categories.length === 0) {
                alert("Bitte lege zuerst Sync-Kategorien in den Einstellungen an."); return;
            }
            const promptText = "In welchen Cloud-Ordner soll kopiert werden?\n\n" +
                               currentSettings.sync_categories.map(c => `${c.id} = ${c.name}`).join("\n") +
                               "\n\nZiel wählen:";
            const dest = prompt(promptText, currentSettings.sync_categories[0].id);

            const category = currentSettings.sync_categories.find(c => String(c.id) === String(dest));
            if(!category) return;

            expandConsole();
            appendConsoleLog("[System]: Starte reinen pCloud Sync...");
            try {
                const res = await fetch("/api/process", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        media_type: "tool_pcloud_sync",
                        project_name: path,
                        destination: category.nas_sub
                    })
                });
                if (res.ok) connectLogStream();
            } catch(e) {
                appendConsoleLog(`[System]: ❌ Fehler: ${e.message}`);
            }
        }
    });

    setupDestinationToggles();

    // Re-trigger auto-matching if destination is changed
    document.getElementById("series-nas-destination")?.addEventListener("change", () => {
        if (window.isProgrammaticCategoryChange) return;
        const showName = selectedShow ? selectedShow.name : (currentProject ? currentProject.replace(/\([0-9]{4}\)/g, "").replace(/_/g, " ").trim() : "");
        if (showName) {
            autoMatchNasFolder("series-nas-folder-override", "series-nas-destination", showName);
        }
    });

    document.getElementById("yt-nas-destination")?.addEventListener("change", () => {
        if (window.isProgrammaticCategoryChange) return;
        if (ytSelectedShow && ytSelectedShow.name) {
            autoMatchNasFolder("yt-series-nas-folder-override", "yt-nas-destination", ytSelectedShow.name);
        }
    });

    // Welcome Dashboard Hero/Card Listeners
    // (Die frühere "Inbox & Projekte"-Kachel wurde durch die Smart Inbox ersetzt.)

    const cardHeroAbos = document.getElementById("card-hero-abos");
    if (cardHeroAbos) {
        cardHeroAbos.addEventListener("click", () => {
            if (typeof window.openYoutubeAbosPage === "function") {
                window.openYoutubeAbosPage();
            }
        });
    }



    const btnHeroYtGo = document.getElementById("btn-hero-yt-go");
    if (btnHeroYtGo) {
        btnHeroYtGo.addEventListener("click", handleHeroYtDownload);
    }
    const inputHeroYtUrl = document.getElementById("hero-yt-url");
    if (inputHeroYtUrl) {
        inputHeroYtUrl.addEventListener("keypress", (e) => {
            if (e.key === "Enter") handleHeroYtDownload();
        });
    }

    // Conversion Intelligence Event Listeners
    const seriesIsAnime = document.getElementById("series-is-anime");
    if (seriesIsAnime) {
        seriesIsAnime.addEventListener("change", triggerQualityHintUpdates);
    }
    const movieNasDest = document.getElementById("movie-nas-destination");
    if (movieNasDest) {
        movieNasDest.addEventListener("change", triggerQualityHintUpdates);
    }
    const seriesNasDest = document.getElementById("series-nas-destination");
    if (seriesNasDest) {
        seriesNasDest.addEventListener("change", triggerQualityHintUpdates);
    }
}

// ==========================================================================
// SETTINGS DASHBOARD LOGIC
// ==========================================================================
let currentSettings = { import_sources: [] };
let conversionRecommendations = null;

async function checkAppUpdate() {
    const btn = document.getElementById("btn-check-app-update");
    const badge = document.getElementById("app-update-status-badge");
    const detailsArea = document.getElementById("app-update-details-area");
    const currentVal = document.getElementById("app-current-version-val");
    const latestVal = document.getElementById("app-latest-version-val");
    const instructionBox = document.getElementById("app-update-instruction-box");
    const commandVal = document.getElementById("app-update-command-val");

    if (!btn || !badge || !detailsArea || !currentVal || !latestVal || !instructionBox || !commandVal) return;

    btn.disabled = true;
    btn.innerHTML = `<span style="display: inline-block; animation: spin 1s linear infinite; margin-right: 6px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-2" style="height:12px; width:12px;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></span> Prüfe...`;

    badge.style.display = "none";
    detailsArea.style.display = "none";
    instructionBox.style.display = "none";

    try {
        const response = await fetch('/api/update-status');
        if (response.ok) {
            const data = await response.json();

            currentVal.textContent = data.current_version || "N/A";
            latestVal.textContent = data.latest_version || "N/A";
            detailsArea.style.display = "block";

            if (data.update_check_available === false) {
                badge.textContent = "Updates nicht konfiguriert";
                badge.style.backgroundColor = "var(--text-muted)";
                badge.style.color = "#fff";
                badge.style.display = "inline-block";
            } else if (data.update_available) {
                badge.textContent = "Update verfügbar";
                badge.style.backgroundColor = "var(--warning)";
                badge.style.color = "#000";
                badge.style.display = "inline-block";

                if (data.recommended_command) {
                    commandVal.textContent = data.recommended_command;
                    instructionBox.style.display = "block";
                }
            } else if (data.error) {
                badge.textContent = "Fehler bei Prüfung";
                badge.style.backgroundColor = "var(--danger)";
                badge.style.color = "#fff";
                badge.style.display = "inline-block";
            } else {
                badge.textContent = "Aktuell";
                badge.style.backgroundColor = "var(--success)";
                badge.style.color = "#fff";
                badge.style.display = "inline-block";
            }
        } else {
            badge.textContent = "Fehler";
            badge.style.backgroundColor = "var(--danger)";
            badge.style.color = "#fff";
            badge.style.display = "inline-block";
        }
    } catch (e) {
        console.error("Error checking app update:", e);
        badge.textContent = "Verbindungsfehler";
        badge.style.backgroundColor = "var(--danger)";
        badge.style.color = "#fff";
        badge.style.display = "inline-block";
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-cw" style="height:12px; width:12px; margin-right:6px;"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>Auf Aktualisierung prüfen`;
    }
}

async function checkDependencies(force = false) {
    const listContainer = document.getElementById("dependency-status-list");
    if (!listContainer) return;

    if (force) {
        listContainer.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 20px; color: var(--text-muted);">
            <span style="display: inline-block; animation: spin 1s linear infinite; margin-right: 8px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-2" style="height:12px; width:12px;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></span> Abhängigkeiten werden geprüft...
        </div>`;
    }

    try {
        const response = await fetch(`/api/check-dependencies?force=${force}`);
        if (response.ok) {
            const data = await response.json();
            renderDependencyStatus(data);
        } else {
            listContainer.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 20px; color: var(--danger);">
                Fehler beim Abrufen des Status der Abhängigkeiten.
            </div>`;
        }
    } catch (e) {
        console.error("Error checking dependencies:", e);
        listContainer.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 20px; color: var(--danger);">
            Verbindungsfehler: ${e.message}
        </div>`;
    }
}

function renderDependencyStatus(deps) {
    const listContainer = document.getElementById("dependency-status-list");
    if (!listContainer) return;

    listContainer.innerHTML = "";

    const statusLabels = {
        "missing": "Nicht installiert",
        "installed": "Bereit",
        "up_to_date": "Aktuell",
        "update_available": "Update verfügbar",
        "unknown": "Unbekannt"
    };

    const missingDeps = [];

    for (const [name, info] of Object.entries(deps)) {
        const card = document.createElement("div");
        card.className = `dep-card status-${info.status}`;

        const label = statusLabels[info.status] || info.status;

        if (info.status === "missing") {
            missingDeps.push(name);
        }

        let versionLines = "";
        if (info.status === "missing") {
            versionLines = `
                <div class="dep-version-label">
                    <span>Status:</span>
                    <span class="dep-version-val" style="color: var(--danger);">Fehlt</span>
                </div>
            `;
        } else {
            versionLines = `
                <div class="dep-version-label">
                    <span>Installiert:</span>
                    <span class="dep-version-val">${info.installed_version || "N/A"}</span>
                </div>
            `;
            if (info.latest_version) {
                versionLines += `
                    <div class="dep-version-label">
                        <span>Verfügbar:</span>
                        <span class="dep-version-val" style="color: ${info.status === 'update_available' ? 'var(--warning)' : 'var(--text-muted)'};">${info.latest_version}</span>
                    </div>
                `;
            }
        }

        card.innerHTML = `
            <div class="dep-header">
                <span class="dep-name">${name}</span>
                <span class="dep-badge badge-${info.status}">${label}</span>
            </div>
            <div class="dep-version-info">
                ${versionLines}
            </div>
        `;
        listContainer.appendChild(card);
    }

    const sfBadge = document.getElementById("streamfab-badge");
    if (missingDeps.length > 0 && sfBadge && sfBadge.classList.contains("neutral")) {
        const heroSfBadge = document.getElementById("hero-streamfab-badge");
        if (heroSfBadge) {
            heroSfBadge.textContent = `${missingDeps.length} fehlt`;
            heroSfBadge.className = "status-badge error";
        }
    }
}

async function loadDashboard() {
    const tableBody = document.getElementById("dashboard-history-tbody");
    if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 30px;"><div class="loading-spinner"></div> Letzte Statistiken werden geladen...</td></tr>';
    }

    try {
        const response = await fetch("/api/stats");
        if (!response.ok) {
            throw new Error(`Server antwortete mit Code ${response.status}`);
        }
        const data = await response.json();

        // Helper to format bytes
        const formatBytes = (bytes, decimals = 2) => {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
        };

        // 1. NAS Storage Info
        const circle = document.getElementById("nas-usage-circle");
        const percentText = document.getElementById("nas-usage-percent-text");
        const detailText = document.getElementById("nas-usage-detail-text");
        const pathText = document.getElementById("nas-usage-path-text");

        // Label aufs aktive Speicherziel umstellen (NAS, Cloud, ... – je nach Fallback)
        const storageLabel = document.getElementById("dashboard-storage-label");
        if (storageLabel) storageLabel.textContent = (data.nas.name || "Speicher") + " Speicherbelegung";

        if (data.nas.available && data.nas.usage_unreliable) {
            // SMB-Netzlaufwerk: Belegung nicht zuverlässig messbar -> nur freien Platz zeigen
            if (circle) {
                circle.style.strokeDashoffset = 364.4;
                circle.classList.remove("warning", "danger");
            }
            if (percentText) percentText.textContent = "–";
            if (detailText) {
                detailText.innerHTML = `${formatBytes(data.nas.free)} frei<br><span style="color:var(--text-muted); font-size:11px;">(Belegung bei Netzlaufwerk nicht ermittelbar)</span>`;
            }
            if (pathText) pathText.textContent = data.nas.path;
        } else if (data.nas.available) {
            const pct = data.nas.used_percent || 0;
            // stroke dasharray is 364.4 (for radius 58, 2 * Math.PI * 58 = 364.42)
            const offset = 364.4 - (364.4 * pct / 100);
            if (circle) {
                circle.style.strokeDashoffset = offset;
                circle.classList.remove("warning", "danger");
                if (pct >= 95) {
                    circle.classList.add("danger");
                } else if (pct >= 85) {
                    circle.classList.add("warning");
                }
            }
            if (percentText) percentText.textContent = pct.toFixed(1) + "%";
            if (detailText) {
                detailText.innerHTML = `${formatBytes(data.nas.used)} von ${formatBytes(data.nas.total)} belegt<br><span style="color:var(--text-muted); font-size:11px;">(${formatBytes(data.nas.free)} frei)</span>`;
            }
            if (pathText) pathText.textContent = data.nas.path;
        } else {
            if (circle) circle.style.strokeDashoffset = 364.4;
            if (percentText) percentText.textContent = "N/A";
            if (detailText) detailText.innerHTML = `<span class="text-danger">${data.nas.error || 'NAS nicht erreichbar'}</span>`;
            if (pathText) pathText.textContent = data.nas.path;
        }

        // 2. Savings Info
        const savedSpaceVal = document.getElementById("stats-saved-space");
        const savedPercentVal = document.getElementById("stats-saved-percent");
        const sizeInVal = document.getElementById("stats-size-in");
        const sizeOutVal = document.getElementById("stats-size-out");
        const savingsBar = document.getElementById("stats-savings-bar");
        const totalFilesVal = document.getElementById("stats-total-files");

        if (savedSpaceVal) savedSpaceVal.textContent = formatBytes(data.stats.saved_bytes);
        if (savedPercentVal) savedPercentVal.textContent = data.stats.ratio_percent.toFixed(1) + "%";
        if (sizeInVal) sizeInVal.textContent = formatBytes(data.stats.size_in_total);
        if (sizeOutVal) sizeOutVal.textContent = formatBytes(data.stats.size_out_total);
        if (savingsBar) savingsBar.style.width = data.stats.ratio_percent.toFixed(1) + "%";
        if (totalFilesVal) totalFilesVal.textContent = data.stats.total_files;

        // 3. Ratio Info
        const averageRatioVal = document.getElementById("stats-average-ratio");
        const averageRatioPercentVal = document.getElementById("stats-average-ratio-percent");

        if (averageRatioVal) averageRatioVal.textContent = data.stats.average_ratio.toFixed(2) + "x";
        if (averageRatioPercentVal) averageRatioPercentVal.textContent = (data.stats.average_ratio * 100).toFixed(1) + "%";

        // 4. Bar Chart for the last 15 entries
        const barChartContainer = document.getElementById("dashboard-bar-chart");
        if (barChartContainer) {
            barChartContainer.innerHTML = "";
            const historySlice = data.history.slice(0, 15).reverse(); // show chronological order (left to right)

            if (historySlice.length === 0) {
                barChartContainer.innerHTML = '<div style="width: 100%; display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-muted);">Keine Konvertierungsdaten für das Diagramm vorhanden.</div>';
            } else {
                const maxVal = Math.max(...historySlice.map(h => h.size_in), 1);

                historySlice.forEach((item, index) => {
                    const dateObj = new Date(item.timestamp * 1000);
                    const labelStr = dateObj.toLocaleDateString("de-DE", {day: "2-digit", month: "2-digit"});
                    const timeStr = dateObj.toLocaleTimeString("de-DE", {hour: "2-digit", minute: "2-digit"});

                    const percentSaved = Math.max(0, ((item.size_in - item.size_out) / item.size_in) * 100);
                    const formattedSaved = formatBytes(item.size_in - item.size_out);

                    const heightBg = (item.size_in / maxVal) * 100;
                    const heightFill = (item.size_out / maxVal) * 100;

                    const col = document.createElement("div");
                    col.className = "bar-column";

                    col.innerHTML = `
                        <div class="bar-wrapper">
                            <div class="bar-bg-est" style="height: ${heightBg.toFixed(1)}%;"></div>
                            <div class="bar-fill-actual" style="height: ${heightFill.toFixed(1)}%;"></div>
                        </div>
                        <div class="bar-tooltip">
                            <strong>${labelStr} ${timeStr}</strong><br>
                            Codec: ${item.codec} (Q ${item.quality})<br>
                            Größe vorher: ${formatBytes(item.size_in)}<br>
                            Größe nachher: ${formatBytes(item.size_out)}<br>
                            Ersparnis: <span style="color:var(--accent); font-weight:700;">-${formattedSaved} (-${percentSaved.toFixed(1)}%)</span>
                        </div>
                        <div class="bar-label" title="${labelStr}">${labelStr}</div>
                    `;

                    barChartContainer.appendChild(col);
                });
            }
        }

        // 5. History Table
        if (tableBody) {
            tableBody.innerHTML = "";
            if (data.history.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 30px; color: var(--text-muted);">Keine Verlaufsdaten vorhanden.</td></tr>';
            } else {
                data.history.forEach(item => {
                    const tr = document.createElement("tr");

                    let dateStr = "-";
                    if (item.timestamp > 0) {
                        const d = new Date(item.timestamp * 1000);
                        dateStr = `${d.toLocaleDateString("de-DE")} ${d.toLocaleTimeString("de-DE", {hour: '2-digit', minute:'2-digit'})} Uhr`;
                    }

                    const savedBytes = Math.max(0, item.size_in - item.size_out);
                    const savedPct = item.size_in > 0 ? ((savedBytes / item.size_in) * 100) : 0;

                    tr.innerHTML = `
                        <td>${dateStr}</td>
                        <td><span class="badge" style="background:rgba(var(--primary-rgb), 0.15); color:var(--primary);">${item.codec.toUpperCase()} (Q:${item.quality})</span></td>
                        <td>${formatBytes(item.size_in)}</td>
                        <td>${formatBytes(item.size_out)}</td>
                        <td style="color: var(--accent); font-weight:600;">-${formatBytes(savedBytes)} (-${savedPct.toFixed(1)}%)</td>
                        <td>${item.ratio.toFixed(2)}x</td>
                    `;
                    tableBody.appendChild(tr);
                });
            }
        }

    } catch (error) {
        console.error("Error loading dashboard data:", error);
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger" style="padding: 30px;">Fehler beim Laden der Dashboard-Statistiken: ${error.message}</td></tr>`;
        }
    }
}

async function loadSettings() {
    try {
        const response = await fetch("/api/settings");
        if (response.ok) {
            currentSettings = await response.json();

            // Startseite Pfadanzeigen befüllen
            const inboxPathDisplay = document.getElementById("inbox-path-display");
            const outboxPathDisplay = document.getElementById("outbox-path-display");
            if (inboxPathDisplay) {
                inboxPathDisplay.textContent = currentSettings.inbox_dir || "-";
                inboxPathDisplay.title = currentSettings.inbox_dir || "";
            }
            if (outboxPathDisplay) {
                outboxPathDisplay.textContent = currentSettings.outbox_dir || "-";
                outboxPathDisplay.title = currentSettings.outbox_dir || "";
            }

            const inboxEl = document.getElementById("settings-inbox-dir");
            if (inboxEl) inboxEl.value = currentSettings.inbox_dir || "";
            const outboxEl = document.getElementById("settings-outbox-dir");
            if (outboxEl) outboxEl.value = currentSettings.outbox_dir || "";
            const nasRootEl = document.getElementById("settings-nas-root");
            if (nasRootEl) nasRootEl.value = currentSettings.nas_root || "";
            const pcloudDirEl = document.getElementById("settings-pcloud-dir");
            if (pcloudDirEl) pcloudDirEl.value = currentSettings.pcloud_dir || "";

            const checkDepUpdatesEl = document.getElementById("settings-check-dependency-updates");
            if (checkDepUpdatesEl) {
                checkDepUpdatesEl.checked = !!currentSettings.check_dependency_updates;
            }

            const setCheckbox = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.checked = !!val;
            };
            const setInputVal = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.value = val !== undefined ? val : "";
            };

            setCheckbox("settings-open-outbox-finder", currentSettings.open_outbox_finder);
            setCheckbox("settings-open-nas-finder", currentSettings.open_nas_finder);
            setCheckbox("settings-open-pcloud-finder", currentSettings.open_pcloud_finder);

            setCheckbox("settings-notify-macos", currentSettings.notify_macos);
            setCheckbox("settings-notify-telegram", currentSettings.notify_telegram);

            const tgTokenEl = document.getElementById("settings-telegram-token");
            if (tgTokenEl) {
                setupMaskedInput(tgTokenEl);
                setMaskedInputValue(tgTokenEl, currentSettings.telegram_token, {
                    configured: "Hinterlegt",
                    unconfigured: "z.B. 123456:ABC-DEF..."
                });
            }
            const tgChatIdEl = document.getElementById("settings-telegram-chat-id");
            if (tgChatIdEl) {
                setupMaskedInput(tgChatIdEl);
                setMaskedInputValue(tgChatIdEl, currentSettings.telegram_chat_id, {
                    configured: "Hinterlegt",
                    unconfigured: "z.B. -100123456789"
                });
            }

            setCheckbox("settings-notify-whatsapp", currentSettings.notify_whatsapp);

            const waApiKeyEl = document.getElementById("settings-whatsapp-apikey");
            if (waApiKeyEl) {
                setupMaskedInput(waApiKeyEl);
                setMaskedInputValue(waApiKeyEl, currentSettings.whatsapp_apikey, {
                    configured: "Hinterlegt",
                    unconfigured: "apikey von CallMeBot"
                });
            }
            const waPhoneEl = document.getElementById("settings-whatsapp-phone");
            if (waPhoneEl) {
                setupMaskedInput(waPhoneEl);
                setMaskedInputValue(waPhoneEl, currentSettings.whatsapp_phone, {
                    configured: "Hinterlegt",
                    unconfigured: "+49123456789"
                });
            }

            setInputVal("settings-notify-min-size-macos", currentSettings.notify_min_size_macos !== undefined ? currentSettings.notify_min_size_macos : 10);
            setInputVal("settings-notify-min-size-telegram", currentSettings.notify_min_size_telegram !== undefined ? currentSettings.notify_min_size_telegram : 10);
            setInputVal("settings-notify-min-size-whatsapp", currentSettings.notify_min_size_whatsapp !== undefined ? currentSettings.notify_min_size_whatsapp : 10);
            setCheckbox("settings-notify-only-end", currentSettings.notify_only_end !== false); // default to true

            // Folder Monitor Settings
            setCheckbox("set-monitor-enabled", currentSettings.folder_monitor_enabled !== false); // default true
            setInputVal("set-monitor-inbox-gb", currentSettings.folder_monitor_inbox_threshold_gb !== undefined ? currentSettings.folder_monitor_inbox_threshold_gb : 50);
            setInputVal("set-monitor-outbox-gb", currentSettings.folder_monitor_outbox_threshold_gb !== undefined ? currentSettings.folder_monitor_outbox_threshold_gb : 50);
            setInputVal("set-monitor-interval", currentSettings.folder_monitor_interval_minutes !== undefined ? currentSettings.folder_monitor_interval_minutes : 30);

            setCheckbox("set-monitor-notify-macos", currentSettings.folder_monitor_notify_macos !== false); // default true
            setCheckbox("set-monitor-notify-telegram", !!currentSettings.folder_monitor_notify_telegram);
            setCheckbox("set-monitor-notify-whatsapp", !!currentSettings.folder_monitor_notify_whatsapp);

            setCheckbox("settings-show-jokes", currentSettings.show_jokes !== false); // default to true
            setCheckbox("settings-show-quote", currentSettings.show_quote !== false); // default to true
            setCheckbox("settings-smart-conversion-default", currentSettings.smart_conversion_default !== false); // default to true
            setCheckbox("settings-show-console", currentSettings.show_console || false);
            setCheckbox("settings-telemetry-enabled", !!currentSettings.telemetry_enabled);
            applyConsoleVisibility(currentSettings.show_console || false);

            let themeVal = currentSettings.app_theme || "deep-space";
            if (themeVal === "apple-silver") themeVal = "apple-black";
            setInputVal("settings-app-theme", themeVal);
            applyTheme(themeVal);

            setInputVal("settings-media-server", currentSettings.media_server || "");

            // Trash Settings
            setCheckbox("settings-trash-auto-empty", !!currentSettings.trash_auto_empty);
            setInputVal("settings-trash-retention-days", currentSettings.trash_retention_days !== undefined ? currentSettings.trash_retention_days : 7);

            // Stats loading
            loadTrashStats();

            if (!currentSettings.import_sources) currentSettings.import_sources = [];
            if (!currentSettings.sync_categories) currentSettings.sync_categories = [];
            if (!currentSettings.local_download_folders) currentSettings.local_download_folders = [];
            if (!currentSettings.storage_targets) currentSettings.storage_targets = [];
            renderImportSources();
            renderLocalFolders();
            renderSyncCategories();
            renderStorageTargets();
            updateDestinationDropdowns();

            // Fetch API keys separately to populate settings fields
            fetch('/api/keys')
                .then(async res => {
                    if (!res.ok) throw new Error("API keys fetch failed");
                    return res.json();
                })
                .then(keys => {
                    const tmdbInput = document.getElementById("settings-tmdb-key");
                    if (tmdbInput) {
                        setupMaskedInput(tmdbInput);
                        setMaskedInputValue(tmdbInput, keys.TMDB_API_KEY || "", {
                            configured: "Hinterlegt",
                            unconfigured: "Nicht konfiguriert (Metadaten eingeschränkt)"
                        });
                    }
                    const tvdbInput = document.getElementById("settings-tvdb-key");
                    if (tvdbInput) {
                        setupMaskedInput(tvdbInput);
                        setMaskedInputValue(tvdbInput, keys.TVDB_API_KEY || "", {
                            configured: "Hinterlegt",
                            unconfigured: "Nicht konfiguriert (optional)"
                        });
                    }
                })
                .catch(e => {
                    console.error("Error loading API keys:", e);
                    const tmdbInput = document.getElementById("settings-tmdb-key");
                    if (tmdbInput) {
                        setupMaskedInput(tmdbInput);
                        setMaskedInputValue(tmdbInput, "", {
                            unconfigured: "Nicht konfiguriert (Fehler beim Laden)"
                        });
                    }
                    const tvdbInput = document.getElementById("settings-tvdb-key");
                    if (tvdbInput) {
                        setupMaskedInput(tvdbInput);
                        setMaskedInputValue(tvdbInput, "", {
                            unconfigured: "Nicht konfiguriert (Fehler beim Laden)"
                        });
                    }
                });

            checkDependencies(false);
            checkAppUpdate();
            applyDashboardWidgetsSichtbarkeit();
            loadHealthCategories();
        }
    } catch (e) {
        console.error("Error loading settings:", e);
    }
}

function updateDestinationDropdowns() {
    const nasSelects = ["movie-nas-destination", "series-nas-destination", "yt-nas-destination", "abo-nas-destination", "yt-merge-nas-destination"];
    const pcloudSelects = ["movie-pcloud-destination", "series-pcloud-destination", "yt-pcloud-destination", "abo-pcloud-destination", "yt-merge-pcloud-destination"];
    const localSelects = ["yt-local-destination", "abo-local-destination", "yt-merge-local-destination"];

    nasSelects.forEach(selId => {
        const select = document.getElementById(selId);
        if (!select) return;

        const currentVal = select.value;
        select.innerHTML = "";

        currentSettings.sync_categories.forEach(cat => {
            const opt = document.createElement("option");
            opt.value = cat.id;
            opt.textContent = `${cat.name} (NAS: ${cat.nas_sub})`;
            select.appendChild(opt);
        });

        if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) {
            select.value = currentVal;
        } else {
            if (selId.includes("movie") && Array.from(select.options).some(o => o.value === "1")) {
                select.value = "1";
            } else if (selId.includes("series") && Array.from(select.options).some(o => o.value === "2")) {
                select.value = "2";
            }
        }
    });

    pcloudSelects.forEach(selId => {
        const select = document.getElementById(selId);
        if (!select) return;

        const currentVal = select.value;
        select.innerHTML = "";

        currentSettings.sync_categories.forEach(cat => {
            const opt = document.createElement("option");
            opt.value = cat.id;
            opt.textContent = `${cat.name} (pCloud: ${cat.pcloud_remote})`;
            select.appendChild(opt);
        });

        if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) {
            select.value = currentVal;
        } else {
            if (selId.includes("movie") && Array.from(select.options).some(o => o.value === "1")) {
                select.value = "1";
            } else if (selId.includes("series") && Array.from(select.options).some(o => o.value === "2")) {
                select.value = "2";
            }
        }
    });

    localSelects.forEach(selId => {
        const select = document.getElementById(selId);
        if (!select) return;

        const currentVal = select.value;
        select.innerHTML = "";

        // Built-in: Input-Ordner
        const inboxDir = currentSettings.inbox_dir || "~/Downloads/Medien Input";
        const optInbox = document.createElement("option");
        optInbox.value = "__inbox__";
        optInbox.textContent = `Input-Ordner (${inboxDir})`;
        select.appendChild(optInbox);

        // Built-in: Output-Ordner (root)
        const outboxDir = currentSettings.outbox_dir || "~/Downloads/Medien Output";
        const optOutbox = document.createElement("option");
        optOutbox.value = "__outbox__";
        optOutbox.textContent = `Output-Ordner (${outboxDir})`;
        select.appendChild(optOutbox);

        // Sync categories as local outbox subdirectories
        if (currentSettings.sync_categories && currentSettings.sync_categories.length > 0) {
            const optGroup = document.createElement("optgroup");
            optGroup.label = "Kategorien (Output-Unterordner)";
            currentSettings.sync_categories.forEach(cat => {
                const opt = document.createElement("option");
                opt.value = `__cat_${cat.id}`;
                opt.textContent = `${cat.name} (${outboxDir}${cat.nas_sub})`;
                optGroup.appendChild(opt);
            });
            select.appendChild(optGroup);
        }

        // Custom local folders from settings
        if (currentSettings.local_download_folders && currentSettings.local_download_folders.length > 0) {
            const optGroup = document.createElement("optgroup");
            optGroup.label = "Eigene Ordner";
            currentSettings.local_download_folders.forEach((folder, idx) => {
                if (!folder.path) return;
                const opt = document.createElement("option");
                opt.value = `__custom_${idx}`;
                opt.textContent = `${folder.name || 'Ordner'} (${folder.path})`;
                optGroup.appendChild(opt);
            });
            select.appendChild(optGroup);
        }

        if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) {
            select.value = currentVal;
        }
    });
}

function setupDestinationToggles() {
    const pairs = [
        { cb: "movie-option-copy-nas", container: "movie-nas-destination-container" },
        { cb: "movie-option-copy-pcloud", container: "movie-pcloud-destination-container" },
        { cb: "series-option-copy-nas", container: "series-nas-destination-container" },
        { cb: "series-option-copy-pcloud", container: "series-pcloud-destination-container" },
        { cb: "yt-option-copy-nas", container: "yt-nas-destination-container" },
        { cb: "yt-option-copy-pcloud", container: "yt-pcloud-destination-container" },
        { cb: "yt-option-copy-local", container: "yt-local-destination-container" },
        { cb: "abo-copy-nas", container: "abo-nas-destination-container" },
        { cb: "abo-copy-pcloud", container: "abo-pcloud-destination-container" },
        { cb: "abo-copy-local", container: "abo-local-destination-container" },
        { cb: "yt-merge-option-copy-nas", container: "yt-merge-nas-destination-container" },
        { cb: "yt-merge-option-copy-pcloud", container: "yt-merge-pcloud-destination-container" },
        { cb: "yt-merge-option-copy-local", container: "yt-merge-local-destination-container" }
    ];

    pairs.forEach(({ cb, container }) => {
        const checkbox = document.getElementById(cb);
        const cont = document.getElementById(container);
        if (checkbox && cont) {
            const updateVisibility = () => {
                if (checkbox.checked) {
                    cont.classList.remove("hidden");
                } else {
                    cont.classList.add("hidden");
                }
            };
            checkbox.addEventListener("change", updateVisibility);
            updateVisibility();
        }
    });
}

function renderStorageTargets() {
    const container = document.getElementById("settings-storage-targets-container");
    if (!container) return;
    container.innerHTML = "";
    container.style.display = "grid";
    container.style.gridTemplateColumns = "repeat(auto-fit, minmax(320px, 1fr))";
    container.style.gap = "15px";

    if (!currentSettings.storage_targets) currentSettings.storage_targets = [];

    currentSettings.storage_targets.forEach((target, index) => {
        const card = document.createElement("div");
        card.className = "clean-group-container";
        card.style.marginBottom = "15px";
        card.style.padding = "15px";
        card.style.background = "rgba(255, 255, 255, 0.02)";
        card.style.border = "1px solid var(--border-glass)";
        card.style.borderRadius = "var(--radius-md)";
        card.style.position = "relative";

        // Title row with ID/Type and delete button
        const titleRow = document.createElement("div");
        titleRow.style.display = "flex";
        titleRow.style.justifyContent = "space-between";
        titleRow.style.alignItems = "center";
        titleRow.style.marginBottom = "12px";

        const titleText = document.createElement("h4");
        titleText.style.margin = "0";
        titleText.style.fontSize = "13px";
        titleText.style.color = "var(--accent)";
        titleText.style.textTransform = "uppercase";
        titleText.textContent = `Ziel: ${target.name || target.id}`;

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "btn btn-danger btn-xs";
        deleteBtn.textContent = "✕ Ziel entfernen";
        deleteBtn.onclick = (e) => {
            e.preventDefault();
            if (confirm(`Möchtest du das Speicherziel "${target.name || target.id}" wirklich entfernen?`)) {
                currentSettings.storage_targets.splice(index, 1);
                renderStorageTargets();
            }
        };

        titleRow.appendChild(titleText);
        // Only allow deletion for custom targets (keep nas and pcloud)
        if (target.id !== "nas" && target.id !== "pcloud") {
            titleRow.appendChild(deleteBtn);
        }
        card.appendChild(titleRow);

        // Form layout grid
        const grid = document.createElement("div");
        grid.style.display = "grid";
        grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(200px, 1fr))";
        grid.style.gap = "12px";
        grid.style.marginBottom = "10px";

        // Helper to create form controls
        const createField = (labelText, value, placeholder, onchange, helpText = null) => {
            const wrap = document.createElement("div");
            wrap.style.display = "flex";
            wrap.style.flexDirection = "column";
            wrap.style.gap = "4px";

            const label = document.createElement("label");
            label.style.fontSize = "11px";
            label.style.color = "var(--text-muted)";
            label.textContent = labelText;

            const input = document.createElement("input");
            input.type = "text";
            input.className = "form-select";
            input.style.padding = "8px 12px";
            input.style.fontSize = "12px";
            input.style.border = "1px solid var(--border-glass)";
            input.style.background = "var(--bg-surface)";
            input.style.color = "var(--text-main)";
            input.placeholder = placeholder;
            input.value = value || "";
            input.addEventListener("input", (e) => onchange(e.target.value));

            wrap.appendChild(label);
            wrap.appendChild(input);

            if (helpText) {
                const help = document.createElement("span");
                help.style.fontSize = "10px";
                help.style.color = "var(--text-muted)";
                help.style.opacity = "0.7";
                help.style.lineHeight = "1.3";
                help.style.marginTop = "2px";
                help.textContent = helpText;
                wrap.appendChild(help);
            }

            return { wrap, input };
        };

        // Name field
        const nameField = createField("Name des Speicherziels:", target.name, "z.B. NAS Filme", (val) => {
            target.name = val;
            titleText.textContent = `Ziel: ${val || target.id}`;
        });

        // ID field (locked for default ones, editable for custom ones)
        const idField = createField("Eindeutige ID (Schlüssel):", target.id, "z.B. nas_dokus", (val) => {
            target.id = val.toLowerCase().replace(/[^a-z0-9_]/g, "");
            idField.input.value = target.id;
        });
        if (target.id === "nas" || target.id === "pcloud") {
            idField.input.disabled = true;
            idField.input.style.opacity = "0.5";
            idField.input.title = "Standard-IDs können nicht umbenannt werden.";
        }

        // Type select
        const typeWrap = document.createElement("div");
        typeWrap.style.display = "flex";
        typeWrap.style.flexDirection = "column";
        typeWrap.style.gap = "4px";
        const typeLabel = document.createElement("label");
        typeLabel.style.fontSize = "11px";
        typeLabel.style.color = "var(--text-muted)";
        typeLabel.textContent = "Typ des Speichers:";
        if (target.id === "nas" || target.id === "pcloud") {
            const typeText = document.createElement("div");
            typeText.style.padding = "10px 14px";
            typeText.style.fontSize = "12px";
            typeText.style.border = "1px solid var(--border-glass)";
            typeText.style.background = "rgba(255,255,255,0.03)";
            typeText.style.color = "var(--text-muted)";
            typeText.style.borderRadius = "var(--radius-sm)";
            typeText.style.fontWeight = "500";
            if (target.type === "nas") {
                typeText.textContent = "NAS (Netzwerkordner)";
            } else {
                typeText.textContent = "Cloud-Speicher";
            }
            typeWrap.appendChild(typeLabel);
            typeWrap.appendChild(typeText);
        } else {
            const typeSelect = document.createElement("select");
            typeSelect.className = "form-select";
            typeSelect.style.padding = "8px 12px";
            typeSelect.style.fontSize = "12px";
            typeSelect.style.border = "1px solid var(--border-glass)";
            typeSelect.style.background = "var(--bg-surface)";
            typeSelect.style.color = "var(--text-main)";
            typeSelect.innerHTML = `
                <option value="nas" ${target.type === "nas" ? "selected" : ""}>NAS (Netzwerkordner)</option>
                <option value="pcloud" ${target.type === "pcloud" ? "selected" : ""}>Cloud-Speicher (z.B. pCloud, GDrive via rclone)</option>
                <option value="cloud" ${target.type === "cloud" && target.id !== "pcloud" ? "selected" : ""}>Sonstige Cloud (rclone)</option>
            `;
            typeSelect.addEventListener("change", (e) => {
                target.type = e.target.value;
                renderStorageTargets(); // Re-render to show/hide SMB settings
            });
            typeWrap.appendChild(typeLabel);
            typeWrap.appendChild(typeSelect);
        }

        // Enabled checkbox
        const enabledWrap = document.createElement("div");
        enabledWrap.style.display = "flex";
        enabledWrap.style.alignItems = "center";
        enabledWrap.style.gap = "8px";
        enabledWrap.style.marginTop = "15px";

        const enabledCheckbox = document.createElement("input");
        enabledCheckbox.type = "checkbox";
        enabledCheckbox.id = `target-enabled-${index}`;
        enabledCheckbox.checked = target.enabled !== false;
        enabledCheckbox.style.width = "16px";
        enabledCheckbox.style.height = "16px";
        enabledCheckbox.style.accentColor = "var(--accent)";
        enabledCheckbox.addEventListener("change", (e) => {
            target.enabled = e.target.checked;
            renderSyncCategories();
        });

        const enabledLabel = document.createElement("label");
        enabledLabel.htmlFor = `target-enabled-${index}`;
        enabledLabel.style.fontSize = "12px";
        enabledLabel.style.cursor = "pointer";
        enabledLabel.textContent = "Aktiviert (für Synchronisierung nutzen)";

        enabledWrap.appendChild(enabledCheckbox);
        enabledWrap.appendChild(enabledLabel);

        // Local path field with Browse button
        const pathLabel = document.createElement("label");
        pathLabel.style.fontSize = "11px";
        pathLabel.style.color = "var(--text-muted)";
        pathLabel.style.display = "block";
        pathLabel.style.marginBottom = "4px";
        pathLabel.textContent = "Lokal-Pfad (Wurzelverzeichnis auf dem Mac):";

        const pathRow = document.createElement("div");
        pathRow.style.display = "flex";
        pathRow.style.gap = "8px";
        pathRow.style.marginBottom = "12px";

        const pathInput = document.createElement("input");
        pathInput.type = "text";
        pathInput.className = "form-select";
        pathInput.style.flex = "1";
        pathInput.style.padding = "8px 12px";
        pathInput.style.fontSize = "12px";
        pathInput.style.border = "1px solid var(--border-glass)";
        pathInput.style.background = "var(--bg-surface)";
        pathInput.style.color = "var(--text-main)";
        pathInput.placeholder = "z.B. /Volumes/Kino";
        pathInput.value = target.root_path || "";

        const parseNasInputJs = (inputVal) => {
            let val = inputVal.trim();
            while (val.length > 1 && val.endsWith("/")) {
                val = val.substring(0, val.length - 1);
            }
            if (val.toLowerCase().startsWith("smb://")) {
                val = val.substring(6);
                const parts = val.split("/");
                if (parts.length > 0) {
                    const host = parts[0];
                    const share = parts.slice(1).join("/");
                    return { host, share, root_path: share ? `/Volumes/${share}` : "" };
                }
            } else if (val.startsWith("/")) {
                const parts = val.split("/").filter(p => p);
                const share = parts.length > 0 ? parts[parts.length - 1] : "";
                return { host: "", share, root_path: val };
            }
            return { host: "", share: "", root_path: val };
        };

        pathInput.addEventListener("input", (e) => {
            const val = e.target.value;
            target.root_path = val;
            const parsed = parseNasInputJs(val);
            if (parsed.share && !target.nas_share) {
                target.nas_share = parsed.share;
                if (shareField) shareField.input.value = parsed.share;
            }
        });

        const browseBtn = document.createElement("button");
        browseBtn.className = "btn btn-secondary btn-sm";
        const caps = window.AppCapabilities;
        const openLocalEnabled = caps && caps.capabilities && caps.capabilities.open_local_folder;
        if (!openLocalEnabled) {
            browseBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info" style="height: 14px; width: 14px;"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>';
            browseBtn.title = "Lokales Browsen unter Docker deaktiviert";
            browseBtn.onclick = (e) => {
                e.preventDefault();
                alert("Lokales Browsen unter Docker deaktiviert.\n\nBitte gib den Pfad manuell an.");
            };
        } else {
            browseBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search" style="height: 14px; width: 14px;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';
            browseBtn.onclick = async (e) => {
                e.preventDefault();
                try {
                    const response = await fetch("/api/browse-folder");
                    const data = await response.json();
                    if (data.path) {
                        pathInput.value = data.path;
                        target.root_path = data.path;
                        pathInput.dispatchEvent(new Event('input'));
                    }
                } catch (err) {
                    console.error("Browse error:", err);
                }
            };
        }

        pathRow.appendChild(pathInput);
        pathRow.appendChild(browseBtn);

        // rclone remote field
        const rcloneField = createField("rclone Remote Name (Optional für Cloud-Fallbacks):", target.rclone_remote, "z.B. pcloud: oder gdrive:", (val) => {
            target.rclone_remote = val;
        });
        rcloneField.wrap.style.marginBottom = "12px";

        // If type is NAS, show SMB settings
        if (target.type === "nas") {
            const smbTitle = document.createElement("div");
            smbTitle.style.fontSize = "11px";
            smbTitle.style.fontWeight = "bold";
            smbTitle.style.color = "var(--accent)";
            smbTitle.style.marginTop = "15px";
            smbTitle.style.marginBottom = "8px";
            smbTitle.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
            smbTitle.style.paddingBottom = "4px";
            smbTitle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-globe" style="display:inline-block; vertical-align:middle; margin-right: 4px; height: 12px; width: 12px; color: var(--accent);"><circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>SMB-Netzwerk-Mounting Details';

            const smbGrid = document.createElement("div");
            smbGrid.style.display = "grid";
            smbGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(150px, 1fr))";
            smbGrid.style.gap = "10px";

            const cleanServerAddress = (inputVal) => {
                let val = inputVal.trim();
                if (val.toLowerCase().startsWith("smb://")) {
                    val = val.substring(6);
                    const parts = val.split("/");
                    if (parts.length > 0) {
                        const host = parts[0];
                        const share = parts.slice(1).join("/");
                        return { host, share: share || null };
                    }
                }
                return { host: val, share: null };
            };

            let ipField, backupIpField, shareField;

            ipField = createField("Lokale Serveradresse:", target.nas_ip, "z.B. 192.168.2.208", (val) => {
                const cleaned = cleanServerAddress(val);
                target.nas_ip = cleaned.host;
                if (cleaned.host !== val) {
                    ipField.input.value = cleaned.host;
                }
                if (cleaned.share) {
                    target.nas_share = cleaned.share;
                    if (shareField) shareField.input.value = cleaned.share;
                }
            }, "Nur IP oder Hostname eintragen, ohne smb:// und ohne Freigabename. Beispiel: 192.168.2.208");

            backupIpField = createField("Alternative Serveradresse (Tailscale/VPN):", target.nas_ip_backup, "z.B. 100.74.187.125", (val) => {
                const cleaned = cleanServerAddress(val);
                target.nas_ip_backup = cleaned.host;
                if (cleaned.host !== val) {
                    backupIpField.input.value = cleaned.host;
                }
                if (cleaned.share) {
                    target.nas_share = cleaned.share;
                    if (shareField) shareField.input.value = cleaned.share;
                }
            }, "Optional. Nur IP oder Hostname eintragen, ohne smb:// und ohne Freigabename. Beispiel: 100.74.187.125");

            shareField = createField("Freigabename:", target.nas_share, "z.B. media", (val) => {
                target.nas_share = val;
            }, "Name der SMB-Freigabe. Bei smb://192.168.2.208/kino ist kino der Freigabename.");

            smbGrid.appendChild(ipField.wrap);
            smbGrid.appendChild(backupIpField.wrap);
            smbGrid.appendChild(shareField.wrap);

            const smbExample = document.createElement("div");
            smbExample.style.fontSize = "10px";
            smbExample.style.color = "var(--text-muted)";
            smbExample.style.marginTop = "8px";
            smbExample.style.fontStyle = "italic";
            smbExample.textContent = "Aus diesen Angaben erzeugt die App z. B. smb://192.168.2.208/media";

            if (target.id === "nas") {
                // Geführte NAS-Einrichtung!
                const guidedSection = document.createElement("div");
                guidedSection.className = "nas-guided-setup";
                guidedSection.style.marginTop = "10px";
                guidedSection.style.padding = "12px";
                guidedSection.style.background = "rgba(255,255,255,0.01)";
                guidedSection.style.border = "1px dashed rgba(255,255,255,0.1)";
                guidedSection.style.borderRadius = "var(--radius-sm)";
                guidedSection.style.marginBottom = "12px";

                const guidedLabel = document.createElement("label");
                guidedLabel.style.fontSize = "11px";
                guidedLabel.style.fontWeight = "bold";
                guidedLabel.style.color = "var(--text-main)";
                guidedLabel.style.marginBottom = "4px";
                guidedLabel.style.display = "block";

                const isDocker = window.AppCapabilities && window.AppCapabilities.runtime === "docker";
                if (isDocker) {
                    guidedLabel.textContent = "Container-Pfad im Docker-Setup (z.B. /media):";
                } else {
                    guidedLabel.textContent = "Netzwerkadresse (smb://...) oder lokaler Mac-Pfad (/Volumes/...):";
                }

                const guidedRow = document.createElement("div");
                guidedRow.style.display = "flex";
                guidedRow.style.gap = "8px";

                const guidedInput = document.createElement("input");
                guidedInput.type = "text";
                guidedInput.className = "form-select";
                guidedInput.style.flex = "1";
                guidedInput.style.padding = "8px 12px";
                guidedInput.style.fontSize = "12px";
                guidedInput.style.border = "1px solid var(--border-glass)";
                guidedInput.style.background = "var(--bg-surface)";
                guidedInput.style.color = "var(--text-main)";
                if (isDocker) {
                    guidedInput.placeholder = "z.B. /media  oder  /data/movies";
                } else {
                    guidedInput.placeholder = "z.B. smb://192.168.2.208/media  oder  /Volumes/media";
                }

                if (isDocker) {
                    guidedInput.value = target.root_path || "";
                } else if (target.nas_ip && target.nas_share) {
                    guidedInput.value = `smb://${target.nas_ip}/${target.nas_share}`;
                } else if (target.root_path) {
                    guidedInput.value = target.root_path;
                }
                guidedRow.appendChild(guidedInput);

                const caps = window.AppCapabilities;
                const openLocalEnabled = caps && caps.capabilities && caps.capabilities.open_local_folder;
                if (openLocalEnabled) {
                    const guidedBrowseBtn = document.createElement("button");
                    guidedBrowseBtn.type = "button";
                    guidedBrowseBtn.className = "btn btn-secondary btn-sm";
                    guidedBrowseBtn.style.whiteSpace = "nowrap";
                    guidedBrowseBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search" style="margin-right: 4px; height: 12px; width: 12px;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>Ordner wählen';
                    guidedBrowseBtn.onclick = async (e) => {
                        e.preventDefault();
                        try {
                            const response = await fetch("/api/browse-folder");
                            const data = await response.json();
                            if (data.path) {
                                guidedInput.value = data.path;
                                guidedInput.dispatchEvent(new Event('input'));
                            }
                        } catch (err) {
                            console.error("Browse error:", err);
                        }
                    };
                    guidedRow.appendChild(guidedBrowseBtn);
                }

                const guidedHelp = document.createElement("span");
                guidedHelp.style.fontSize = "10px";
                guidedHelp.style.color = "var(--text-muted)";
                guidedHelp.style.opacity = "0.8";
                guidedHelp.style.marginTop = "4px";
                guidedHelp.style.display = "block";
                if (openLocalEnabled) {
                    guidedHelp.textContent = "Trage die SMB-Adresse deines NAS oder den Mac-Pfad ein, oder klicke auf 'Ordner wählen'. Die App leitet alle technischen Einstellungen automatisch für dich ab.";
                } else {
                    guidedHelp.textContent = "Trage die SMB-Adresse deines NAS oder den Container-Pfad manuell ein. (Hinweis: Lokales Browsen im Docker-Modus deaktiviert; binde deinen NAS-Pfad im Docker-Compose als Volume ein, z.B. /media).";
                }

                guidedSection.appendChild(guidedLabel);
                guidedSection.appendChild(guidedRow);
                guidedSection.appendChild(guidedHelp);
                card.appendChild(guidedSection);

                // Button-Bereich
                const testBtnSection = document.createElement("div");
                testBtnSection.style.display = "flex";
                testBtnSection.style.gap = "10px";
                testBtnSection.style.marginTop = "10px";
                testBtnSection.style.marginBottom = "12px";

                const btnCheckNas = document.createElement("button");
                btnCheckNas.type = "button";
                btnCheckNas.className = "btn btn-secondary btn-sm";
                btnCheckNas.style.display = "inline-flex";
                btnCheckNas.style.alignItems = "center";
                btnCheckNas.style.gap = "6px";
                btnCheckNas.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-activity"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>NAS-Verbindung prüfen`;

                const testResultContainer = document.createElement("div");
                testResultContainer.className = "nas-test-result-box hidden";
                testResultContainer.style.marginTop = "10px";
                testResultContainer.style.padding = "10px 14px";
                testResultContainer.style.borderRadius = "var(--radius-sm)";
                testResultContainer.style.fontSize = "12px";
                testResultContainer.style.lineHeight = "1.5";
                testResultContainer.style.background = "rgba(255,255,255,0.02)";
                testResultContainer.style.border = "1px solid var(--border-glass)";

                testBtnSection.appendChild(btnCheckNas);
                card.appendChild(testBtnSection);
                card.appendChild(testResultContainer);

                // Erweitert-Bereich für NAS
                const detailsEl = document.createElement("details");
                detailsEl.style.marginTop = "15px";
                detailsEl.style.border = "1px solid rgba(255,255,255,0.05)";
                detailsEl.style.borderRadius = "var(--radius-sm)";
                detailsEl.style.padding = "8px 12px";
                detailsEl.style.background = "rgba(0,0,0,0.1)";

                const summaryEl = document.createElement("summary");
                summaryEl.style.fontSize = "11px";
                summaryEl.style.fontWeight = "bold";
                summaryEl.style.color = "var(--text-muted)";
                summaryEl.style.cursor = "pointer";
                summaryEl.style.outline = "none";
                summaryEl.textContent = "Erweiterte technische Einstellungen";
                detailsEl.appendChild(summaryEl);

                const detailGrid = document.createElement("div");
                detailGrid.style.marginTop = "10px";
                detailGrid.style.display = "grid";
                detailGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(200px, 1fr))";
                detailGrid.style.gap = "12px";

                // Enabled checkbox
                const nasEnabledWrap = document.createElement("div");
                nasEnabledWrap.style.display = "flex";
                nasEnabledWrap.style.alignItems = "center";
                nasEnabledWrap.style.gap = "8px";
                nasEnabledWrap.appendChild(enabledCheckbox);
                nasEnabledWrap.appendChild(enabledLabel);

                detailGrid.appendChild(nameField.wrap);
                detailGrid.appendChild(idField.wrap);
                detailGrid.appendChild(typeWrap);
                detailGrid.appendChild(nasEnabledWrap);

                const pathWrapDiv = document.createElement("div");
                pathWrapDiv.appendChild(pathLabel);
                pathWrapDiv.appendChild(pathRow);
                detailGrid.appendChild(pathWrapDiv);

                detailGrid.appendChild(rcloneField.wrap);

                const smbWrapDiv = document.createElement("div");
                smbWrapDiv.appendChild(smbTitle);
                smbWrapDiv.appendChild(smbGrid);
                smbWrapDiv.appendChild(smbExample);
                detailGrid.appendChild(smbWrapDiv);

                detailsEl.appendChild(detailGrid);
                card.appendChild(detailsEl);

                // Handler für die guided Eingabe
                guidedInput.addEventListener("input", (e) => {
                    const val = e.target.value.trim();
                    const parsed = parseNasInputJs(val);

                    if (parsed.host) {
                        target.nas_ip = parsed.host;
                        if (ipField) ipField.input.value = parsed.host;
                    }

                    if (parsed.share) {
                        target.nas_share = parsed.share;
                        if (shareField) shareField.input.value = parsed.share;
                    }
                    if (parsed.root_path) {
                        target.root_path = parsed.root_path;
                        pathInput.value = parsed.root_path;
                    }
                });

                btnCheckNas.addEventListener("click", async () => {
                    btnCheckNas.disabled = true;
                    btnCheckNas.innerHTML = "Prüfe...";
                    testResultContainer.classList.remove("hidden");
                    testResultContainer.innerHTML = `<div id="nas-test-status-msg" style="color:var(--text-muted);">Verbindungstest läuft...</div>`;

                    const longWaitTimer = setTimeout(() => {
                        const statusMsgEl = document.getElementById("nas-test-status-msg");
                        if (statusMsgEl) {
                            statusMsgEl.innerHTML = `Verbindungstest läuft...<br><span style="color:#f59e0b; font-size:11px;">Die Prüfung dauert länger, weil das Netzlaufwerk durchsucht wird. Bitte warten...</span>`;
                        }
                    }, 8000);

                    try {
                        const res = await fetch('/api/nas/test', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                nas_ip: target.nas_ip || "",
                                nas_ip_backup: target.nas_ip_backup || "",
                                nas_share: target.nas_share || "",
                                root_path: target.root_path || ""
                            })
                        });

                        const result = await res.json();
                        clearTimeout(longWaitTimer);
                        btnCheckNas.disabled = false;
                        btnCheckNas.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-activity"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>NAS-Verbindung prüfen`;

                        if (result.error) {
                            testResultContainer.innerHTML = `<div style="color:var(--danger); font-weight:bold;">Fehler beim Test: ${result.error}</div>`;
                            return;
                        }

                        let html = `<div style="font-weight:bold; margin-bottom:6px; color:var(--accent);">Prüfungsergebnisse:</div>`;
                        const renderCheckLine = (isOk, text) => {
                            const icon = isOk
                                ? `<span style="color:var(--success); margin-right:6px; font-weight:bold;">✔</span>`
                                : `<span style="color:var(--danger); margin-right:6px; font-weight:bold;">✘</span>`;
                            return `<div style="display:flex; align-items:center; margin-bottom:4px;">${icon}<span>${text}</span></div>`;
                        };

                        // Server erreichbar
                        let serverStatusText = `Server erreichbar (${result.reachable_ip || target.nas_ip || 'keine IP angegeben'})`;
                        if (result.reachable_ip === "Lokal gemountet (keine IP erforderlich)") {
                            serverStatusText = "Server erreichbar (Lokal gemountet, keine IP erforderlich)";
                        } else if (result.reachable_ip === "Container-Pfad erreichbar") {
                            serverStatusText = "Container-Pfad erreichbar";
                        }
                        html += renderCheckLine(result.server_reachable, serverStatusText);

                        let shareText = `Freigabe angegeben (${target.nas_share || 'fehlt'})`;
                        if (result.share_required === false && !target.nas_share) {
                            shareText = "Freigabe angegeben (Nicht erforderlich)";
                        }
                        html += renderCheckLine(result.share_specified, shareText);
                        let pathLabel = isDocker ? "Container-Pfad vorhanden" : "Lokaler Pfad vorhanden";
                        html += renderCheckLine(result.local_path_exists, `${pathLabel} (${target.root_path || 'fehlt'})`);
                        let readableLabel = isDocker ? "Container-Pfad lesbar" : "Lokaler Pfad lesbar";
                        html += renderCheckLine(result.local_path_readable, readableLabel);
                        html += renderCheckLine(result.categories_found, `Kategoriepfade gefunden`);

                        if (result.missing_categories && result.missing_categories.length > 0) {
                            html += `<div style="color:var(--warning); margin-left:20px; font-size:11px; margin-bottom:4px;">Geprüfte Kategorien fehlen auf dem NAS: ${result.missing_categories.join(', ')}</div>`;
                        }

                        html += renderCheckLine(result.media_folders_found, `Bibliotheksordner (Serien/Filme) gefunden`);

                        if (result.server_reachable && result.share_specified && result.local_path_exists && result.local_path_readable && result.categories_found && result.media_folders_found) {
                            html += `<div style="color:var(--success); font-weight:bold; margin-top:6px;">✔ NAS ist voll funktionsfähig und bereit!</div>`;
                        } else {
                            html += `<div style="color:var(--danger); font-weight:bold; margin-top:6px; margin-bottom: 6px;">✘ NAS ist unvollständig konfiguriert.</div>`;

                            // Konkrete Handlungsempfehlungen für den Nutzer
                            if (!result.server_reachable) {
                                html += `<div style="color:var(--text-muted); font-size:11px; margin-left:6px; margin-bottom:4px;">• <strong>Nächster Schritt:</strong> Binde das Netzlaufwerk lokal auf deinem Mac im Finder ein oder trage eine gültige IP-Adresse ein.</div>`;
                            }
                            if (!result.share_specified && result.share_required) {
                                html += `<div style="color:var(--text-muted); font-size:11px; margin-left:6px; margin-bottom:4px;">• <strong>Nächster Schritt:</strong> Trage den Namen der Freigabe (z.B. <code>media</code> oder <code>Kino</code>) ein.</div>`;
                            }
                            if (!result.local_path_exists) {
                                if (isDocker) {
                                    html += `<div style="color:var(--text-muted); font-size:11px; margin-left:6px; margin-bottom:4px;">• <strong>Nächster Schritt:</strong> Der angegebene Pfad <code>${target.root_path || '/media'}</code> existiert nicht im Container. Bitte überprüfe das Volume-Mapping in deiner docker-compose.yml.</div>`;
                                } else {
                                    html += `<div style="color:var(--text-muted); font-size:11px; margin-left:6px; margin-bottom:4px;">• <strong>Nächster Schritt:</strong> Binde die Freigabe auf dem Mac unter dem passenden Pfad ein, damit <code>${target.root_path || '/Volumes/...'}</code> existiert.</div>`;
                                }
                            } else if (!result.local_path_readable) {
                                if (isDocker) {
                                    html += `<div style="color:var(--text-muted); font-size:11px; margin-left:6px; margin-bottom:4px;">• <strong>Nächster Schritt:</strong> Der Pfad existiert, ist aber nicht lesbar. Bitte überprüfe die Benutzer- und Gruppenberechtigungen (UID/GID) für das gemountete Verzeichnis auf dem Host und im Docker-Container.</div>`;
                                } else {
                                    html += `<div style="color:var(--text-muted); font-size:11px; margin-left:6px; margin-bottom:4px;">• <strong>Nächster Schritt:</strong> Der Pfad existiert, ist aber nicht lesbar. Bitte überprüfe die Zugriffsrechte des angemeldeten Mac-Benutzers auf diesen Ordner.</div>`;
                                }
                            } else if (!result.categories_found) {
                                html += `<div style="color:var(--text-muted); font-size:11px; margin-left:6px; margin-bottom:4px;">• <strong>Nächster Schritt:</strong> Der Pfad existiert, aber Kategorie-Unterordner (wie <code>Filme</code>, <code>Serien</code>) fehlen darin. Bitte erstelle diese Ordner auf dem NAS oder passe die Kategorie-Zuordnungen weiter unten unter „Sync-Kategorien“ an. <a href="#" id="jump-to-categories-link" style="color:var(--accent); text-decoration:underline; font-weight:500;">Zu Sync-Kategorien springen</a></div>`;
                            } else if (!result.media_folders_found) {
                                html += `<div style="color:var(--text-muted); font-size:11px; margin-left:6px; margin-bottom:4px;">• <strong>Nächster Schritt:</strong> Es wurden keine Medienordner (Serien- oder Filmordner) gefunden. Bitte lege mindestens einen Medienordner an.</div>`;
                            }
                        }

                        testResultContainer.innerHTML = html;

                        const jumpLink = document.getElementById("jump-to-categories-link");
                        if (jumpLink) {
                            jumpLink.addEventListener("click", (e) => {
                                e.preventDefault();
                                const catCard = document.getElementById("settings-sync-categories-section");
                                if (catCard) {
                                    catCard.scrollIntoView({ behavior: "smooth" });
                                }
                            });
                        }
                    } catch (err) {
                        clearTimeout(longWaitTimer);
                        btnCheckNas.disabled = false;
                        btnCheckNas.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-activity"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>NAS-Verbindung prüfen`;
                        testResultContainer.innerHTML = `<div style="color:var(--danger);">Fehler beim Aufruf der Test-API: ${err}</div>`;
                    }
                });
            } else {
                // pcloud
                const grid = document.createElement("div");
                grid.style.display = "grid";
                grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(200px, 1fr))";
                grid.style.gap = "12px";

                grid.appendChild(nameField.wrap);
                grid.appendChild(idField.wrap);
                grid.appendChild(typeWrap);
                grid.appendChild(enabledWrap);
                card.appendChild(grid);

                card.appendChild(pathLabel);
                card.appendChild(pathRow);
                card.appendChild(rcloneField.wrap);

                card.appendChild(smbTitle);
                card.appendChild(smbGrid);
                card.appendChild(smbExample);
            }
        } else {
            // Normales Speicherziel
            const grid = document.createElement("div");
            grid.style.display = "grid";
            grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(200px, 1fr))";
            grid.style.gap = "12px";

            grid.appendChild(nameField.wrap);
            grid.appendChild(idField.wrap);
            grid.appendChild(typeWrap);
            grid.appendChild(enabledWrap);
            card.appendChild(grid);

            card.appendChild(pathLabel);
            card.appendChild(pathRow);
            card.appendChild(rcloneField.wrap);
        }

        container.appendChild(card);
    });
}

function renderImportSources() {
    const container = document.getElementById("settings-import-sources-container");
    container.innerHTML = "";

    currentSettings.import_sources.forEach((source, index) => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.gap = "10px";

        const input = document.createElement("input");
        input.type = "text";
        input.className = "form-select";
        input.style.flex = "1";
        input.style.padding = "10px 14px";
        input.style.borderRadius = "var(--radius-sm)";
        input.style.border = "1px solid var(--border-glass)";
        input.style.background = "var(--bg-surface)";
        input.style.color = "var(--text-main)";
        input.value = source;
        input.onchange = (e) => { currentSettings.import_sources[index] = e.target.value; };

        const browseBtn = document.createElement("button");
        browseBtn.className = "btn btn-secondary";
        const caps = window.AppCapabilities;
        const openLocalEnabled = caps && caps.capabilities && caps.capabilities.open_local_folder;
        if (!openLocalEnabled) {
            browseBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search" style="height: 14px; width: 14px;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';
            browseBtn.title = "Ordner auf dem NAS auswählen";
            browseBtn.onclick = (e) => {
                e.preventDefault();
                const nasTarget = (currentSettings.storage_targets || []).find(t => t.id === "nas");
                const dockerRoot = (nasTarget && nasTarget.root_path) || "/media";
                window.openFolderPicker(input.value || dockerRoot, dockerRoot, null, "Ordner für Downloads/Import auswählen", (selectedPath) => {
                    input.value = selectedPath;
                    currentSettings.import_sources[index] = selectedPath;
                });
            };
        } else {
            browseBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search" style="height: 14px; width: 14px;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';
            browseBtn.onclick = async () => {
                try {
                    const response = await fetch("/api/browse-folder");
                    const data = await response.json();
                    if (data.path) {
                        input.value = data.path;
                        currentSettings.import_sources[index] = data.path;
                    }
                } catch (e) { console.error("Browse error:", e); }
            };
        }

        const removeBtn = document.createElement("button");
        removeBtn.className = "btn btn-danger";
        removeBtn.textContent = "✕";
        removeBtn.onclick = () => {
            currentSettings.import_sources.splice(index, 1);
            renderImportSources();
        };

        row.appendChild(input);
        row.appendChild(browseBtn);
        row.appendChild(removeBtn);
        container.appendChild(row);
    });
}

function renderLocalFolders() {
    const container = document.getElementById("settings-local-folders-container");
    if (!container) return;
    container.innerHTML = "";

    if (!currentSettings.local_download_folders) currentSettings.local_download_folders = [];

    currentSettings.local_download_folders.forEach((folder, index) => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.gap = "10px";

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.className = "form-select";
        nameInput.style.width = "140px";
        nameInput.style.padding = "10px 14px";
        nameInput.style.borderRadius = "var(--radius-sm)";
        nameInput.style.border = "1px solid var(--border-glass)";
        nameInput.style.background = "var(--bg-surface)";
        nameInput.style.color = "var(--text-main)";
        nameInput.placeholder = "Name";
        nameInput.value = folder.name || "";
        nameInput.onchange = (e) => { currentSettings.local_download_folders[index].name = e.target.value; };

        const pathInput = document.createElement("input");
        pathInput.type = "text";
        pathInput.className = "form-select";
        pathInput.style.flex = "1";
        pathInput.style.padding = "10px 14px";
        pathInput.style.borderRadius = "var(--radius-sm)";
        pathInput.style.border = "1px solid var(--border-glass)";
        pathInput.style.background = "var(--bg-surface)";
        pathInput.style.color = "var(--text-main)";
        pathInput.placeholder = "Pfad (z.B. /Users/benutzer/Videos)";
        pathInput.value = folder.path || "";
        pathInput.onchange = (e) => { currentSettings.local_download_folders[index].path = e.target.value; };

        const browseBtn = document.createElement("button");
        browseBtn.className = "btn btn-secondary";
        const caps = window.AppCapabilities;
        const openLocalEnabled = caps && caps.capabilities && caps.capabilities.open_local_folder;
        if (!openLocalEnabled) {
            browseBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search" style="height: 14px; width: 14px;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';
            browseBtn.title = "Ordner auf dem NAS auswählen";
            browseBtn.onclick = (e) => {
                e.preventDefault();
                const nasTarget = (currentSettings.storage_targets || []).find(t => t.id === "nas");
                const dockerRoot = (nasTarget && nasTarget.root_path) || "/media";
                window.openFolderPicker(pathInput.value || dockerRoot, dockerRoot, null, "Lokalen Ordner auswählen", (selectedPath) => {
                    pathInput.value = selectedPath;
                    currentSettings.local_download_folders[index].path = selectedPath;
                    if (!nameInput.value) {
                        const parts = selectedPath.split("/");
                        nameInput.value = parts[parts.length - 1] || parts[parts.length - 2] || "Ordner";
                        currentSettings.local_download_folders[index].name = nameInput.value;
                    }
                });
            };
        } else {
            browseBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search" style="height: 14px; width: 14px;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';
            browseBtn.onclick = async () => {
                try {
                    const response = await fetch("/api/browse-folder");
                    const data = await response.json();
                    if (data.path) {
                        pathInput.value = data.path;
                        currentSettings.local_download_folders[index].path = data.path;
                        if (!nameInput.value) {
                            const parts = data.path.split("/");
                            nameInput.value = parts[parts.length - 1] || parts[parts.length - 2] || "Ordner";
                            currentSettings.local_download_folders[index].name = nameInput.value;
                        }
                    }
                } catch (e) { console.error("Browse error:", e); }
            };
        }

        const removeBtn = document.createElement("button");
        removeBtn.className = "btn btn-danger";
        removeBtn.textContent = "✕";
        removeBtn.onclick = () => {
            currentSettings.local_download_folders.splice(index, 1);
            renderLocalFolders();
        };

        row.appendChild(nameInput);
        row.appendChild(pathInput);
        row.appendChild(browseBtn);
        row.appendChild(removeBtn);
        container.appendChild(row);
    });
}

function renderSyncCategories() {
    const container = document.getElementById("settings-sync-categories-container");
    if(!container) return;
    container.innerHTML = "";

    // Get enabled storage targets
    const activeTargets = (currentSettings.storage_targets || []).filter(t => t.enabled !== false);

    currentSettings.sync_categories.forEach((cat, index) => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.gap = "8px";
        row.style.marginBottom = "8px";

        const createInput = (val, placeholder, width, onchangeCallback) => {
            const input = document.createElement("input");
            input.type = "text";
            input.className = "form-select";
            input.style.flex = width;
            input.style.padding = "10px";
            input.style.borderRadius = "var(--radius-sm)";
            input.style.border = "1px solid var(--border-glass)";
            input.style.background = "var(--bg-surface)";
            input.style.color = "var(--text-main)";
            input.placeholder = placeholder;
            input.value = val || "";
            input.onchange = onchangeCallback;
            return input;
        };

        row.appendChild(createInput(cat.id, "ID (z.B. 1)", "0.5", (e) => { currentSettings.sync_categories[index].id = e.target.value; }));
        row.appendChild(createInput(cat.name, "Name", "1", (e) => { currentSettings.sync_categories[index].name = e.target.value; }));

        activeTargets.forEach(target => {
            const targetWrapper = document.createElement("div");
            const isCloud = target.id === "pcloud" || target.type === "pcloud" || target.type === "cloud";
            const isNas = target.id === "nas" || target.type === "nas";

            // Normalize rclone remote to avoid double colons
            let remotePrefix = "";
            if (isCloud) {
                const rawRemote = target.rclone_remote || "pcloud";
                remotePrefix = rawRemote.endsWith(":") ? rawRemote : rawRemote + ":";
            }

            targetWrapper.style.flex = isCloud ? "1.5" : "1";
            targetWrapper.style.display = "flex";
            targetWrapper.style.gap = "5px";

            let val = "";
            if (cat.targets && cat.targets[target.id] !== undefined) {
                val = cat.targets[target.id];
            } else if (isNas) {
                val = cat.nas_sub || "";
            } else if (isCloud) {
                val = cat.pcloud_remote || "";
            }

            let placeholder = `${target.name || target.id}`;
            if (isNas) {
                placeholder += ` (z.B. /${cat.name || "Filme"})`;
            } else if (isCloud) {
                placeholder += ` (z.B. ${remotePrefix}04_${cat.name || "Filme"})`;
            } else {
                placeholder += ` (z.B. /${cat.name || "Filme"})`;
            }

            const input = createInput(val, placeholder, "1", (e) => {
                const newVal = e.target.value;
                if (!currentSettings.sync_categories[index].targets) {
                    currentSettings.sync_categories[index].targets = {};
                }
                currentSettings.sync_categories[index].targets[target.id] = newVal;

                // Backwards compatibility spiegeln
                if (isNas) {
                    currentSettings.sync_categories[index].nas_sub = newVal;
                } else if (isCloud) {
                    currentSettings.sync_categories[index].pcloud_remote = newVal;
                }
            });
            targetWrapper.appendChild(input);

            const browseBtn = document.createElement("button");
            browseBtn.className = "btn btn-secondary";
            browseBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search" style="height: 14px; width: 14px;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';
            browseBtn.title = `${target.name || target.id}-Ordner auswählen`;
            browseBtn.style.padding = "5px 10px";

            // Check capability for opening local folder (disable browse under Docker runtime)
            const caps = window.AppCapabilities;
            const openLocalEnabled = caps && caps.capabilities && caps.capabilities.open_local_folder;
            if (!openLocalEnabled) {
                if (isNas) {
                    browseBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search" style="height: 14px; width: 14px;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';
                    browseBtn.title = "Ordner auf dem NAS auswählen";
                    browseBtn.onclick = (e) => {
                        e.preventDefault();
                        const rootPath = target.root_path || "/media";
                        let startPath = rootPath;
                        if (val && val.startsWith("/")) {
                            startPath = rootPath + val;
                        } else if (val) {
                            startPath = rootPath + "/" + val;
                        }
                        const titleStr = cat.name ? `Ordner für ${cat.name} auswählen` : `Ordner auswählen`;
                        window.openFolderPicker(startPath, rootPath, target, titleStr, (selectedPath) => {
                            let subPath = selectedPath;
                            if (subPath.startsWith(rootPath)) {
                                subPath = subPath.substring(rootPath.length);
                            }
                            if (!subPath.startsWith("/")) {
                                subPath = "/" + subPath;
                            }
                            input.value = subPath;
                            if (!currentSettings.sync_categories[index].targets) {
                                currentSettings.sync_categories[index].targets = {};
                            }
                            currentSettings.sync_categories[index].targets[target.id] = subPath;
                            currentSettings.sync_categories[index].nas_sub = subPath;
                        });
                    };
                } else if (isCloud) {
                    browseBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info" style="height: 14px; width: 14px;"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>';
                    browseBtn.title = "Hinweis zur Cloud-Pfadeingabe";
                    browseBtn.onclick = (e) => {
                        e.preventDefault();
                        alert(`${target.name || "Cloud"} ist im Docker-Container nicht als Ordner durchsuchbar. Trage hier einen rclone-Zielpfad ein, z. B. ${remotePrefix}04_${cat.name || "Serien"}. rclone legt fehlende Zielordner beim ersten Upload normalerweise automatisch an. Prüfe den Pfad trotzdem sorgfältig, weil Tippfehler sonst neue, falsch benannte Ordner erzeugen können.`);
                    };
                } else {
                    browseBtn.disabled = true;
                    browseBtn.style.opacity = "0.5";
                    browseBtn.title = "Ordnerauswahl unter Docker deaktiviert";
                }
            } else {
                browseBtn.onclick = async () => {
                    try {
                        const response = await fetch("/api/browse-folder");
                        const data = await response.json();
                        if (data.path) {
                            let subPath = data.path;
                            if (isNas) {
                                const nasRoot = target.root_path || currentSettings.nas_root || "";
                                if (nasRoot && subPath.startsWith(nasRoot)) {
                                    subPath = subPath.substring(nasRoot.length);
                                    if (!subPath.startsWith("/")) subPath = "/" + subPath;
                                }
                            } else if (isCloud) {
                                const pcloudRoot = currentSettings.pcloud_dir || "";
                                if (pcloudRoot && subPath.startsWith(pcloudRoot)) {
                                    subPath = subPath.substring(pcloudRoot.length);
                                    if (subPath.startsWith("/")) subPath = subPath.substring(1);
                                    subPath = remotePrefix + subPath;
                                }
                            }
                            input.value = subPath;
                            if (!currentSettings.sync_categories[index].targets) {
                                currentSettings.sync_categories[index].targets = {};
                            }
                            currentSettings.sync_categories[index].targets[target.id] = subPath;
                            if (isNas) {
                                currentSettings.sync_categories[index].nas_sub = subPath;
                            } else if (isCloud) {
                                currentSettings.sync_categories[index].pcloud_remote = subPath;
                            }
                        }
                    } catch (e) { console.error("Browse error:", e); }
                };
            }

            targetWrapper.appendChild(browseBtn);
            row.appendChild(targetWrapper);
        });

        const removeBtn = document.createElement("button");
        removeBtn.className = "btn btn-danger";
        removeBtn.textContent = "✕";
        removeBtn.onclick = () => {
            currentSettings.sync_categories.splice(index, 1);
            renderSyncCategories();
        };

        row.appendChild(removeBtn);
        container.appendChild(row);
    });
}

const SERVER_RESTART_BUTTON_HTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-power" style="height:12px; width:12px; margin-right:6px;"><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/></svg>Server neu starten';

function restoreServerRestartButton(button) {
    button.disabled = false;
    button.innerHTML = SERVER_RESTART_BUTTON_HTML;
}

async function waitForServerRestart(fetchStatus = () => fetch("/api/status"), options = {}) {
    const maxAttempts = options.maxAttempts ?? 60;
    const pollDelayMs = options.pollDelayMs ?? 1000;
    const sleep = options.sleep ?? ((delay) => new Promise((resolve) => setTimeout(resolve, delay)));

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await sleep(pollDelayMs);
        try {
            const response = await fetchStatus();
            if (response.ok) {
                return true;
            }
        } catch (error) {
            // A short connection failure is expected while the process restarts.
        }
    }
    return false;
}

// Bind Settings Events
document.addEventListener("DOMContentLoaded", () => {
    const btnSaveSettings = document.getElementById("btn-save-settings");
    if(btnSaveSettings) {
        btnSaveSettings.addEventListener("click", async () => {
            const KEY_FIELD_IDS = [
                "settings-tmdb-key",
                "settings-tvdb-key",
                "settings-telegram-token",
                "settings-telegram-chat-id",
                "settings-whatsapp-apikey",
                "settings-whatsapp-phone"
            ];

            // Validation Gate: Check all masked fields
            const validation = validateAllMaskedFields(KEY_FIELD_IDS);
            if (!validation.valid) {
                const firstErr = validation.errors[0];
                const el = document.getElementById(firstErr.fieldId);
                if (el) el.focus();
                alert("Fehler beim Speichern: " + firstErr.error);
                return;
            }

            const changed = validation.changedFields;
            const checkDepUpdatesEl = document.getElementById("settings-check-dependency-updates");
            const payload = {
                inbox_dir: document.getElementById("settings-inbox-dir")?.value || "",
                outbox_dir: document.getElementById("settings-outbox-dir")?.value || "",
                nas_root: document.getElementById("settings-nas-root")?.value || "",
                pcloud_dir: document.getElementById("settings-pcloud-dir")?.value || "",
                check_dependency_updates: checkDepUpdatesEl ? checkDepUpdatesEl.checked : false,

                trash_auto_empty: document.getElementById("settings-trash-auto-empty")?.checked || false,
                trash_retention_days: (() => { const val = parseInt(document.getElementById("settings-trash-retention-days")?.value, 10); return isNaN(val) ? 7 : val; })(),

                open_outbox_finder: document.getElementById("settings-open-outbox-finder")?.checked || false,
                open_nas_finder: document.getElementById("settings-open-nas-finder")?.checked || false,
                open_pcloud_finder: document.getElementById("settings-open-pcloud-finder")?.checked || false,

                notify_macos: document.getElementById("settings-notify-macos")?.checked || false,
                notify_telegram: document.getElementById("settings-notify-telegram")?.checked || false,
                notify_whatsapp: document.getElementById("settings-notify-whatsapp")?.checked || false,
                notify_min_size_macos: parseInt(document.getElementById("settings-notify-min-size-macos")?.value, 10) || 0,
                notify_min_size_telegram: parseInt(document.getElementById("settings-notify-min-size-telegram")?.value, 10) || 0,
                notify_min_size_whatsapp: parseInt(document.getElementById("settings-notify-min-size-whatsapp")?.value, 10) || 0,
                notify_only_end: document.getElementById("settings-notify-only-end")?.checked || false,

                show_jokes: document.getElementById("settings-show-jokes")?.checked || false,
                show_quote: document.getElementById("settings-show-quote")?.checked || false,
                smart_conversion_default: document.getElementById("settings-smart-conversion-default")?.checked || false,
                show_console: document.getElementById("settings-show-console")?.checked || false,
                telemetry_enabled: document.getElementById("settings-telemetry-enabled")?.checked || false,
                app_theme: document.getElementById("settings-app-theme")?.value || "deep-space",
                media_server: document.getElementById("settings-media-server")?.value || "",

                folder_monitor_enabled: document.getElementById("set-monitor-enabled")?.checked || false,
                folder_monitor_inbox_threshold_gb: parseFloat(document.getElementById("set-monitor-inbox-gb")?.value) || 50.0,
                folder_monitor_outbox_threshold_gb: parseFloat(document.getElementById("set-monitor-outbox-gb")?.value) || 50.0,
                folder_monitor_interval_minutes: parseInt(document.getElementById("set-monitor-interval")?.value, 10) || 30,

                folder_monitor_notify_macos: document.getElementById("set-monitor-notify-macos")?.checked || false,
                folder_monitor_notify_telegram: document.getElementById("set-monitor-notify-telegram")?.checked || false,
                folder_monitor_notify_whatsapp: document.getElementById("set-monitor-notify-whatsapp")?.checked || false,

                import_sources: currentSettings.import_sources.filter(s => s.trim() !== ""),
                sync_categories: currentSettings.sync_categories.filter(c => c.id.trim() !== "" && c.name.trim() !== ""),
                local_download_folders: (currentSettings.local_download_folders || []).filter(f => f.path && f.path.trim() !== ""),
                storage_targets: (currentSettings.storage_targets || []).filter(t => t.id && t.id.trim() !== "")
            };

            // Dirty-tracking for settings credentials
            if ("settings-telegram-token" in changed) {
                payload.telegram_token = changed["settings-telegram-token"];
            }
            if ("settings-telegram-chat-id" in changed) {
                payload.telegram_chat_id = changed["settings-telegram-chat-id"];
            }
            if ("settings-whatsapp-apikey" in changed) {
                payload.whatsapp_apikey = changed["settings-whatsapp-apikey"];
            }
            if ("settings-whatsapp-phone" in changed) {
                payload.whatsapp_phone = changed["settings-whatsapp-phone"];
            }

            try {
                const response = await fetch("/api/settings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    const keyPayload = {};
                    if ("settings-tmdb-key" in changed) {
                        keyPayload.TMDB_API_KEY = changed["settings-tmdb-key"];
                    }
                    if ("settings-tvdb-key" in changed) {
                        keyPayload.TVDB_API_KEY = changed["settings-tvdb-key"];
                    }

                    let keysSavedSuccessfully = true;
                    if (Object.keys(keyPayload).length > 0) {
                        try {
                            const keysRes = await fetch('/api/keys', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(keyPayload)
                            });
                            if (!keysRes.ok) {
                                keysSavedSuccessfully = false;
                            }
                        } catch (ek) {
                            console.error("Error saving keys:", ek);
                            keysSavedSuccessfully = false;
                        }
                    }

                    if (keysSavedSuccessfully) {
                        alert("Einstellungen erfolgreich gespeichert!");
                    } else {
                        alert("Einstellungen gespeichert, aber Fehler beim Speichern der API-Keys.");
                    }
                    loadSettings(); // Reload
                } else {
                    const errData = await response.json().catch(() => ({}));
                    alert("Fehler beim Speichern der Einstellungen: " + (errData.error || response.statusText));
                }
            } catch (e) {
                alert("Verbindungsfehler: " + e);
            }
        });
    }

    const btnRestartServer = document.getElementById("btn-restart-server");
    if (btnRestartServer) {
        btnRestartServer.addEventListener("click", async () => {
            if (!confirm("Bist du sicher, dass du den Server neu starten möchtest?")) {
                return;
            }

            btnRestartServer.disabled = true;
            btnRestartServer.innerHTML = '<span style="display:inline-flex; align-items:center; gap:6px;"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-2" style="animation: spin 1s linear infinite; height: 14px; width: 14px;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Starte neu...</span>';

            try {
                const response = await fetch("/api/system/restart", {
                    method: "POST"
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.status === "busy") {
                        alert("Abgebrochen: " + data.message);
                        restoreServerRestartButton(btnRestartServer);
                    } else if (data.status === "restarting") {
                        appendConsoleLog("[System]: Server startet neu... Warte auf Neustart.");
                        expandConsole();
                        const serverIsOnline = await waitForServerRestart();
                        if (serverIsOnline) {
                            appendConsoleLog("[System]: Server wieder online. Lade Seite neu...");
                            setTimeout(() => {
                                location.reload();
                            }, 500);
                        } else {
                            appendConsoleLog("[System]: Neustart nach 60 Sekunden nicht abgeschlossen.");
                            alert("Der Server wurde innerhalb von 60 Sekunden nicht wieder erreichbar. Bitte prüfe den Container-Status und die Server-Logs.");
                            restoreServerRestartButton(btnRestartServer);
                        }
                    } else {
                        alert("Der Server hat den Neustart-Befehl nicht bestätigt.");
                        restoreServerRestartButton(btnRestartServer);
                    }
                } else {
                    alert("Fehler beim Senden des Neustart-Befehls.");
                    restoreServerRestartButton(btnRestartServer);
                }
            } catch (e) {
                appendConsoleLog("[System]: Verbindung getrennt. Warte auf Server...");
                const serverIsOnline = await waitForServerRestart();
                if (serverIsOnline) {
                    appendConsoleLog("[System]: Server wieder online. Lade Seite neu...");
                    setTimeout(() => {
                        location.reload();
                    }, 500);
                } else {
                    appendConsoleLog("[System]: Neustart nach 60 Sekunden nicht abgeschlossen.");
                    alert("Der Server wurde innerhalb von 60 Sekunden nicht wieder erreichbar. Bitte prüfe den Container-Status und die Server-Logs.");
                    restoreServerRestartButton(btnRestartServer);
                }
            }
        });
    }

    const btnCheckDeps = document.getElementById("btn-check-dependencies");
    if (btnCheckDeps) {
        btnCheckDeps.addEventListener("click", () => {
            checkDependencies(true);
        });
    }

    const btnCheckAppUpdate = document.getElementById("btn-check-app-update");
    if (btnCheckAppUpdate) {
        btnCheckAppUpdate.addEventListener("click", () => {
            checkAppUpdate();
        });
    }

    // Storage Targets Help Modal
    const btnStorageHelp = document.getElementById("btn-storage-help");
    const linkRcloneSetup = document.getElementById("link-rclone-setup");
    const storageHelpModal = document.getElementById("storage-help-modal");
    const btnCloseStorageHelp = document.getElementById("btn-close-storage-help");
    const btnCloseStorageHelpOk = document.getElementById("btn-close-storage-help-ok");

    const openStorageHelp = () => {
        if (storageHelpModal) {
            storageHelpModal.classList.remove("hidden");
            setTimeout(() => {
                storageHelpModal.style.opacity = "1";
                storageHelpModal.style.pointerEvents = "auto";
            }, 10);
        }
    };

    const closeStorageHelp = () => {
        if (storageHelpModal) {
            storageHelpModal.style.opacity = "0";
            storageHelpModal.style.pointerEvents = "none";
            setTimeout(() => {
                storageHelpModal.classList.add("hidden");
            }, 300);
        }
    };

    if (btnStorageHelp) btnStorageHelp.addEventListener("click", openStorageHelp);
    if (linkRcloneSetup) linkRcloneSetup.addEventListener("click", openStorageHelp);
    if (btnCloseStorageHelp) btnCloseStorageHelp.addEventListener("click", closeStorageHelp);
    if (btnCloseStorageHelpOk) btnCloseStorageHelpOk.addEventListener("click", closeStorageHelp);

    // Docker Folder View Modal Listeners
    document.getElementById("btn-close-docker-folder-view")?.addEventListener("click", () => {
        document.getElementById("modal-docker-folder-view").classList.add("hidden");
    });
    document.getElementById("btn-docker-folder-view-ok")?.addEventListener("click", () => {
        document.getElementById("modal-docker-folder-view").classList.add("hidden");
    });
    document.getElementById("btn-docker-folder-copy-path")?.addEventListener("click", () => {
        const pathText = document.getElementById("docker-folder-view-path").textContent;
        navigator.clipboard.writeText(pathText).then(() => {
            const btn = document.getElementById("btn-docker-folder-copy-path");
            const oldHtml = btn.innerHTML;
            btn.innerHTML = `<span style="display:inline-flex; align-items:center; gap:4px; color:var(--success);"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check" style="height:12px; width:12px;"><polyline points="20 6 9 17 4 12"/></svg>Kopiert!</span>`;
            setTimeout(() => btn.innerHTML = oldHtml, 2000);
        });
    });

    const btnAddSource = document.getElementById("btn-settings-add-source");
    if(btnAddSource) {
        btnAddSource.addEventListener("click", () => {
            currentSettings.import_sources.push("");
            renderImportSources();
        });
    }

    const btnGenerateDefaults = document.getElementById("btn-settings-generate-default-categories");
    if (btnGenerateDefaults) {
        btnGenerateDefaults.addEventListener("click", () => {
            if (confirm("Dies fügt 'Filme', 'Serien' und 'Dokus' als Standard-Kategorien hinzu. Fortfahren?")) {
                if (!currentSettings.sync_categories) currentSettings.sync_categories = [];

                const defaults = [
                    { id: "movies", name: "Filme", nas_sub: "/Filme" },
                    { id: "series", name: "Serien", nas_sub: "/Serien" },
                    { id: "docs", name: "Dokus", nas_sub: "/Dokus" }
                ];

                defaults.forEach(def => {
                    const existing = currentSettings.sync_categories.find(c => c.id === def.id || c.name === def.name);
                    if (existing) {
                        if (!existing.nas_sub) existing.nas_sub = def.nas_sub;
                        if (!existing.targets) existing.targets = {};
                        if (!existing.targets.nas) existing.targets.nas = def.nas_sub;
                    } else {
                        currentSettings.sync_categories.push({
                            ...def,
                            pcloud_remote: "",
                            targets: { nas: def.nas_sub, pcloud: "" }
                        });
                    }
                });
                renderSyncCategories();
            }
        });
    }

    const btnAddCategory = document.getElementById("btn-settings-add-category");
    if(btnAddCategory) {
        btnAddCategory.addEventListener("click", () => {
            currentSettings.sync_categories.push({id: "", name: "", nas_sub: "", pcloud_remote: "", targets: {}});
            renderSyncCategories();
        });
    }

    const btnAddTarget = document.getElementById("btn-settings-add-target");
    if(btnAddTarget) {
        btnAddTarget.addEventListener("click", () => {
            if (!currentSettings.storage_targets) currentSettings.storage_targets = [];
            const newId = "target_" + Date.now();
            currentSettings.storage_targets.push({
                id: newId,
                name: "Neues Speicherziel",
                type: "cloud",
                root_path: "",
                rclone_remote: "",
                enabled: true
            });
            renderStorageTargets();
        });
    }


    const btnAddLocalFolder = document.getElementById("btn-settings-add-local-folder");
    if (btnAddLocalFolder) {
        btnAddLocalFolder.addEventListener("click", () => {
            if (!currentSettings.local_download_folders) currentSettings.local_download_folders = [];
            currentSettings.local_download_folders.push({ name: "", path: "" });
            renderLocalFolders();
        });
    }

    // Browse Buttons
    const bindBrowse = (btnId, inputId) => {
        const btn = document.getElementById(btnId);
        if(btn) {
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                try {
                    const inputEl = document.getElementById(inputId);
                    let qs = "";
                    if (inputEl && inputEl.value) {
                        qs = "?default_path=" + encodeURIComponent(inputEl.value);
                    }
                    const response = await fetch("/api/browse-folder" + qs);
                    const data = await response.json();
                    if (data.path || data.folder) {
                        if (inputEl) {
                            inputEl.value = data.path || data.folder;
                            inputEl.dispatchEvent(new Event("change", { bubbles: true }));
                        }
                    }
                } catch (e) { console.error("Browse error:", e); }
            });
        }
    };
    bindBrowse("btn-settings-browse-inbox", "settings-inbox-dir");
    bindBrowse("btn-settings-browse-outbox", "settings-outbox-dir");
    bindBrowse("btn-settings-browse-nas", "settings-nas-root");
    bindBrowse("btn-settings-browse-pcloud", "settings-pcloud-dir");

    // Toggle Buttons
    const bindToggle = (btnId, inputId) => {
        const btn = document.getElementById(btnId);
        if(btn) {
            btn.addEventListener("click", async () => {
                const inputEl = document.getElementById(inputId);
                const path = inputEl ? inputEl.value : "";
                if (!path) return;

                const hide = confirm(`Möchtest du den Ordner '${path}' im Finder VERSTECKEN?\n(Abbrechen für WIEDER SICHTBAR MACHEN)`);
                try {
                    const response = await fetch("/api/toggle-visibility", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ path: path, hide: hide })
                    });
                    if (response.ok) {
                        alert(`Ordner wurde ${hide ? "versteckt" : "sichtbar gemacht"}.`);
                    } else {
                        alert("Fehler beim Ändern der Sichtbarkeit.");
                    }
                } catch (e) { console.error(e); }
            });
        }
    };
    bindToggle("btn-settings-toggle-inbox", "settings-inbox-dir");
    bindToggle("btn-settings-toggle-outbox", "settings-outbox-dir");
});

// ==========================================================================
// PREVIEW MODAL LOGIC
// ==========================================================================
let currentPreviewPayload = null;

async function openPreviewModal(basePayload) {
    expandConsole();
    appendConsoleLog("[System]: Erstelle Trockenlauf-Vorschau...");

    // Set loading state in UI
    const overlay = document.getElementById("preview-modal-overlay");
    const modal = document.getElementById("preview-modal");
    const listRenames = document.getElementById("preview-list-renames");
    const listSubs = document.getElementById("preview-list-subs");
    const listJunk = document.getElementById("preview-list-junk");
    const dest = document.getElementById("preview-destination");
    const warningBox = document.getElementById("preview-season-warning");
    const warningText = document.getElementById("preview-season-warning-text");

    if (warningBox) {
        warningBox.classList.add("hidden");
    }

    const mismatchBox = document.getElementById("preview-show-name-mismatch");
    if (mismatchBox) {
        mismatchBox.classList.add("hidden");
    }

    // Check if any mapped season is >= 1000 (possible year warning)
    let hasHighSeason = false;
    let highSeasonNum = null;

    if (!basePayload.force_absolute_season_1) {
        if (basePayload.season && basePayload.season !== "all") {
            const s = parseInt(basePayload.season, 10);
            if (!isNaN(s) && s >= 1000) {
                hasHighSeason = true;
                highSeasonNum = s;
            }
        }
        if (!hasHighSeason && basePayload.mappings) {
            for (const val of Object.values(basePayload.mappings)) {
                if (val && typeof val === "object") {
                    const s = parseInt(val.season, 10);
                    if (!isNaN(s) && s >= 1000) {
                        hasHighSeason = true;
                        highSeasonNum = s;
                        break;
                    }
                } else if (typeof val === "string") {
                    const match = val.match(/^S(\d+)/i);
                    if (match) {
                        const s = parseInt(match[1], 10);
                        if (s >= 1000) {
                            hasHighSeason = true;
                            highSeasonNum = s;
                            break;
                        }
                    }
                }
            }
        }
    }

    if (hasHighSeason && warningBox && warningText) {
        warningText.textContent = `Staffel-Nummer ist eine Jahreszahl (${highSeasonNum})! Bitte prüfen, ob das korrekt ist (z.B. Staffel 56 statt 2026).`;
        warningBox.classList.remove("hidden");
    }

    listRenames.innerHTML = `<div style="color:var(--text-muted); font-size:12px;">Analysiere Ordner und Metadaten...</div>`;
    listSubs.innerHTML = "";
    listJunk.innerHTML = "";
    dest.textContent = "Wird berechnet...";

    // Show modal
    overlay.classList.remove("hidden");
    setTimeout(() => {
        overlay.style.opacity = "1";
        overlay.style.pointerEvents = "auto";
        modal.style.transform = "translateY(0)";
    }, 10);

    try {
        const response = await fetch("/api/preview_process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(basePayload)
        });

        if (!response.ok) throw new Error("Fehler beim Abrufen der Vorschau");
        const data = await response.json();

        if (data.error) {
            alert(data.error);
            closePreviewModal();
            return;
        }

        if (data.warning && warningBox && warningText && !basePayload.force_absolute_season_1) {
            warningText.textContent = data.warning;
            warningBox.classList.remove("hidden");
        }

        if (data.show_name_mismatch && mismatchBox) {
            const mText = document.getElementById("preview-show-name-mismatch-text");
            if (mText) {
                mText.innerHTML = `Der Zielordner auf dem NAS heißt <strong>"${data.show_name_mismatch.nas_name}"</strong>, aber die Vorschau verwendet den Namen <strong>"${data.show_name_mismatch.metadata_name}"</strong>.`;
            }

            const btnAdoptNas = document.getElementById("btn-preview-adopt-nas-name");
            const btnAdoptMeta = document.getElementById("btn-preview-adopt-metadata-name");

            if (btnAdoptNas) {
                const newBtn = btnAdoptNas.cloneNode(true);
                btnAdoptNas.parentNode.replaceChild(newBtn, btnAdoptNas);
                newBtn.addEventListener("click", () => {
                    const overrideInput = document.getElementById("series-nas-folder-override");
                    if (overrideInput) {
                        overrideInput.value = data.show_name_mismatch.nas_name;
                        autoMatchNasFolder("series-nas-folder-override", "series-nas-destination", overrideInput.value);
                    }
                    basePayload.nas_show_folder = data.show_name_mismatch.nas_name;
                    openPreviewModal(basePayload);
                });
            }

            if (btnAdoptMeta) {
                const newBtn = btnAdoptMeta.cloneNode(true);
                btnAdoptMeta.parentNode.replaceChild(newBtn, btnAdoptMeta);
                newBtn.addEventListener("click", () => {
                    const overrideInput = document.getElementById("series-nas-folder-override");
                    if (overrideInput) {
                        overrideInput.value = data.show_name_mismatch.metadata_name;
                        autoMatchNasFolder("series-nas-folder-override", "series-nas-destination", overrideInput.value);
                    }
                    basePayload.nas_show_folder = data.show_name_mismatch.metadata_name;
                    openPreviewModal(basePayload);
                });
            }

            mismatchBox.classList.remove("hidden");
        }

        currentPreviewPayload = basePayload;

        dest.innerHTML = data.destination.replace(/\n/g, '<br>');

        const createCheckbox = (item, checked, groupName) => {
            return `
                <label style="display:flex; align-items:center; gap:10px; background:rgba(0,0,0,0.2); padding:8px 12px; border-radius:var(--radius-sm); border:1px solid rgba(255,255,255,0.05); cursor:pointer;">
                    <input type="checkbox" class="preview-cb-${groupName}" data-old="${item.old || item}" data-new="${item.new || ''}" ${checked ? 'checked' : ''} style="accent-color:var(--accent);">
                    <div style="flex:1; overflow:hidden;">
                        <div style="font-size:11px; color:var(--text-muted); text-decoration:line-through; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.old || item}</div>
                        ${item.new ? `<div style="font-size:13px; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.new}</div>` : ''}
                    </div>
                </label>
            `;
        };

        listRenames.innerHTML = data.renames.length > 0
            ? data.renames.map(r => createCheckbox(r, true, "renames")).join("")
            : `<div style="color:var(--text-muted); font-size:12px;">Keine Videos gefunden.</div>`;

        listSubs.innerHTML = data.subs.length > 0
            ? data.subs.map(s => createCheckbox(s, true, "subs")).join("")
            : `<div style="color:var(--text-muted); font-size:12px;">Keine Untertitel/Extras gefunden.</div>`;

        listJunk.innerHTML = data.junk.length > 0
            ? data.junk.map(j => createCheckbox(j, true, "junk")).join("")
            : `<div style="color:var(--text-muted); font-size:12px;">Keine Müll-Dateien gefunden! Ordner ist sauber.</div>`;

        appendConsoleLog("[System]: Vorschau erfolgreich generiert.");

    } catch (e) {
        alert("Fehler: " + e.message);
        closePreviewModal();
    }
}

function closePreviewModal() {
    const overlay = document.getElementById("preview-modal-overlay");
    const modal = document.getElementById("preview-modal");

    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
    modal.style.transform = "translateY(20px)";
    setTimeout(() => {
        overlay.classList.add("hidden");
    }, 300);
}

function saveConversionSettings() {
    const settings = {
        movieOptionConvert: document.getElementById("movie-option-convert")?.checked,
        movieOptionDelete: document.getElementById("movie-option-delete")?.checked,
        movieOptionCopyNas: document.getElementById("movie-option-copy-nas")?.checked,
        movieOptionCopyPcloud: document.getElementById("movie-option-copy-pcloud")?.checked,
        movieQualitySlider: document.getElementById("movie-quality-slider")?.value,

        seriesOptionConvert: document.getElementById("series-option-convert")?.checked,
        seriesOptionDelete: document.getElementById("series-option-delete")?.checked,
        seriesOptionCopyNas: document.getElementById("series-option-copy-nas")?.checked,
        seriesOptionCopyPcloud: document.getElementById("series-option-copy-pcloud")?.checked,
        seriesOptionAbsoluteNumbering: document.getElementById("series-option-absolute-numbering")?.checked,
        seriesQualitySlider: document.getElementById("series-quality-slider")?.value,

        ytOptionCopyNas: document.getElementById("yt-option-copy-nas")?.checked,
        ytOptionCopyPcloud: document.getElementById("yt-option-copy-pcloud")?.checked,
        ytOptionCopyLocal: document.getElementById("yt-option-copy-local")?.checked,
        ytLocalDestination: document.getElementById("yt-local-destination")?.value,

        toolQualitySlider: document.getElementById("tool-quality-slider")?.value,
        toolForceReconvert: document.getElementById("tool-force-reconvert")?.checked
    };
    localStorage.setItem("conversionSettings", JSON.stringify(settings));
}

function loadConversionSettings() {
    try {
        const stored = localStorage.getItem("conversionSettings");
        if (!stored) return;
        const settings = JSON.parse(stored);

        const setCheckbox = (id, val) => {
            const cb = document.getElementById(id);
            if (cb && val !== undefined) {
                cb.checked = !!val;
                cb.dispatchEvent(new Event('change'));
            }
        };

        const setSlider = (id, valElId, val) => {
            const slider = document.getElementById(id);
            const valEl = document.getElementById(valElId);
            if (slider && val !== undefined) {
                slider.value = val;
                if (valEl) updateQualityIndicator(val, valElId);
            }
        };

        setCheckbox("movie-option-convert", settings.movieOptionConvert);
        setCheckbox("movie-option-delete", settings.movieOptionDelete);
        setCheckbox("movie-option-copy-nas", settings.movieOptionCopyNas);
        setCheckbox("movie-option-copy-pcloud", settings.movieOptionCopyPcloud);
        setSlider("movie-quality-slider", "movie-quality-val", settings.movieQualitySlider);

        setCheckbox("series-option-convert", settings.seriesOptionConvert);
        setCheckbox("series-option-delete", settings.seriesOptionDelete);
        setCheckbox("series-option-copy-nas", settings.seriesOptionCopyNas);
        setCheckbox("series-option-copy-pcloud", settings.seriesOptionCopyPcloud);
        setCheckbox("series-option-absolute-numbering", settings.seriesOptionAbsoluteNumbering);
        setSlider("series-quality-slider", "series-quality-val", settings.seriesQualitySlider);

        setCheckbox("yt-option-copy-nas", settings.ytOptionCopyNas);
        setCheckbox("yt-option-copy-pcloud", settings.ytOptionCopyPcloud);
        setCheckbox("yt-option-copy-local", settings.ytOptionCopyLocal);
        const ytLocalDest = document.getElementById("yt-local-destination");
        if (ytLocalDest && settings.ytLocalDestination) {
            ytLocalDest.value = settings.ytLocalDestination;
        }

        setSlider("tool-quality-slider", "tool-quality-val", settings.toolQualitySlider);
        setCheckbox("tool-force-reconvert", settings.toolForceReconvert);
    } catch (e) {
        console.error("Error loading conversion settings:", e);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    // 1. Load settings from localStorage first
    loadConversionSettings();

    // 2. Register listeners that trigger both size estimation/UI toggles and save settings
    const saveAndEstMovie = () => {
        saveConversionSettings();
        updateSizeEstimation("movie");
        triggerQualityHintUpdates();
    };

    const saveAndEstSeries = () => {
        saveConversionSettings();
        updateSizeEstimation("series");
        triggerQualityHintUpdates();
    };

    document.getElementById("movie-option-convert")?.addEventListener("change", saveAndEstMovie);
    document.getElementById("movie-option-delete")?.addEventListener("change", saveConversionSettings);
    document.getElementById("movie-option-copy-nas")?.addEventListener("change", saveConversionSettings);
    document.getElementById("movie-option-copy-pcloud")?.addEventListener("change", saveConversionSettings);

    document.getElementById("series-option-convert")?.addEventListener("change", saveAndEstSeries);
    document.getElementById("series-option-delete")?.addEventListener("change", saveConversionSettings);
    document.getElementById("series-option-copy-nas")?.addEventListener("change", saveConversionSettings);
    document.getElementById("series-option-copy-pcloud")?.addEventListener("change", saveConversionSettings);
    document.getElementById("series-option-absolute-numbering")?.addEventListener("change", saveConversionSettings);

    document.getElementById("yt-option-copy-nas")?.addEventListener("change", saveConversionSettings);
    document.getElementById("yt-option-copy-pcloud")?.addEventListener("change", saveConversionSettings);
    document.getElementById("yt-option-copy-local")?.addEventListener("change", saveConversionSettings);
    document.getElementById("yt-local-destination")?.addEventListener("change", saveConversionSettings);

    // Movie quality slider
    const movieSlider = document.getElementById("movie-quality-slider");
    const movieVal = document.getElementById("movie-quality-val");
    if (movieSlider && movieVal) {
        movieSlider.addEventListener("input", () => {
            updateQualityIndicator(movieSlider.value, "movie-quality-val");
            triggerQualityHintUpdates();
        });
        movieSlider.addEventListener("change", saveAndEstMovie);
    }
    document.getElementById("movie-nas-destination")?.addEventListener("change", triggerQualityHintUpdates);

    // Series quality slider
    const seriesSlider = document.getElementById("series-quality-slider");
    const seriesVal = document.getElementById("series-quality-val");
    if (seriesSlider && seriesVal) {
        seriesSlider.addEventListener("input", () => {
            updateQualityIndicator(seriesSlider.value, "series-quality-val");
            triggerQualityHintUpdates();
        });
        seriesSlider.addEventListener("change", saveAndEstSeries);
    }
    document.getElementById("series-nas-destination")?.addEventListener("change", triggerQualityHintUpdates);
    document.getElementById("series-is-anime")?.addEventListener("change", triggerQualityHintUpdates);

    // Tool quality slider
    const toolSlider = document.getElementById("tool-quality-slider");
    const toolVal = document.getElementById("tool-quality-val");
    if (toolSlider && toolVal) {
        toolSlider.addEventListener("input", () => {
            updateQualityIndicator(toolSlider.value, "tool-quality-val");
        });
        toolSlider.addEventListener("change", () => {
            saveConversionSettings();
        });
    }

    document.getElementById("tool-force-reconvert")?.addEventListener("change", () => {
        saveConversionSettings();
    });

    // Initialize size estimations and visibility of quality sliders on startup
    updateSizeEstimation("movie");
    updateSizeEstimation("series");

    document.getElementById("btn-open-nas-folder-series")?.addEventListener("click", async () => {
        const catSelect = document.getElementById("series-nas-destination");
        const folderInput = document.getElementById("series-nas-folder-override");
        if (!catSelect) return;
        const catId = catSelect.value;
        const folderName = folderInput ? folderInput.value.trim() : "";

        try {
            await window.openFolder({ category_id: catId, folder_name: folderName });
        } catch (err) {
            console.error("Fehler beim Öffnen des Ordners:", err);
        }
    });

    document.getElementById("btn-preview-close")?.addEventListener("click", closePreviewModal);
    document.getElementById("btn-preview-cancel")?.addEventListener("click", closePreviewModal);

    document.getElementById("btn-preview-execute")?.addEventListener("click", async () => {
        if (!currentPreviewPayload) return;

        // Collect checked items
        const explicitRenames = Array.from(document.querySelectorAll(".preview-cb-renames:checked")).map(cb => ({ old: cb.dataset.old, new: cb.dataset.new }));
        const explicitSubs = Array.from(document.querySelectorAll(".preview-cb-subs:checked")).map(cb => ({ old: cb.dataset.old, new: cb.dataset.new }));
        const explicitJunk = Array.from(document.querySelectorAll(".preview-cb-junk:checked")).map(cb => cb.dataset.old);

        const finalPayload = {
            ...currentPreviewPayload,
            explicit_renames: explicitRenames,
            explicit_subs: explicitSubs,
            explicit_junk: explicitJunk
        };

        // Save profile if media_type is TV and "no-profile" is not checked
        const noProfileCb = document.getElementById("series-option-no-profile");
        const skipProfileSave = noProfileCb ? noProfileCb.checked : false;

        if (finalPayload.media_type === "tv" && !skipProfileSave) {
            try {
                const auto_h265 = document.getElementById("series-option-convert").checked ? "j" : "n";
                const pcloud_sonstiges = document.getElementById("series-option-copy-pcloud").checked ? "j" : "n";
                const copy_to_nas = document.getElementById("series-option-copy-nas").checked;
                const copy_to_pcloud = document.getElementById("series-option-copy-pcloud").checked;
                const nas_destination_id = document.getElementById("series-nas-destination").value;
                const pcloud_destination_id = document.getElementById("series-pcloud-destination").value;
                const force_absolute_season_1 = document.getElementById("series-option-absolute-numbering")?.checked || false;

                await fetch("/api/profile", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        show_name: finalPayload.show_name,
                        profile: {
                            auto_h265: auto_h265,
                            pcloud_sonstiges: pcloud_sonstiges,
                            schema: "staffeln",
                            provider: finalPayload.provider || "",
                            show_id: finalPayload.show_id || "",
                            all_seasons: document.getElementById("series-all-seasons").checked,
                            copy_to_nas: copy_to_nas,
                            copy_to_pcloud: copy_to_pcloud,
                            nas_destination_id: nas_destination_id,
                            pcloud_destination_id: pcloud_destination_id,
                            force_absolute_season_1: force_absolute_season_1
                        }
                    })
                });
            } catch (err) {
                console.error("Error saving show profile on execution:", err);
            }
        }



        closePreviewModal();
        appendConsoleLog("[System]: Starte finalen Verarbeitungsprozess...");

        try {
            const response = await fetch("/api/process", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(finalPayload)
            });

            if (response.ok) {
                connectLogStream();
            } else {
                appendConsoleLog("[System] Fehler beim Starten des Prozesses.");
            }
        } catch (e) {
            appendConsoleLog(`[System] Fehler: ${e}`);
        }
    });

    // Clean Modal Listeners
    document.getElementById("btn-clean-close")?.addEventListener("click", closeCleanModal);
    document.getElementById("btn-clean-cancel")?.addEventListener("click", closeCleanModal);

    document.getElementById("btn-clean-execute")?.addEventListener("click", async (e) => {
        const targetPath = e.currentTarget.dataset.target;
        if (!targetPath) return;

        const explicitFiles = Array.from(document.querySelectorAll(".clean-cb-item:checked")).map(cb => cb.dataset.file);

        if (explicitFiles.length === 0) {
            alert("Es wurden keine Dateien zum Löschen ausgewählt.");
            closeCleanModal();
            return;
        }

        closeCleanModal();
        appendConsoleLog("[System]: Lösche ausgewählte Dateien...");

        try {
            const response = await fetch("/api/clean-project", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ project: targetPath, explicit_files: explicitFiles })
            });
            const data = await response.json();

            if (data.status === "ok") {
                appendConsoleLog(`Bereinigung fertig! (${data.deleted_files.length} Dateien, ${data.deleted_dirs.length} Ordner gelöscht)`);
                scanProject(targetPath);
            }
        } catch (err) {
            appendConsoleLog(`❌ Fehler bei Bereinigung: ${err}`);
        }
    });
});

// ==========================================================================
// TASK QUEUE SYSTEM
// ==========================================================================
function initQueue() {
    const queuePanel = document.getElementById("queue-panel");
    const overlay = document.getElementById("queue-panel-overlay");
    const navBtn = document.getElementById("nav-queue-dashboard");
    const headerBtn = document.getElementById("header-queue-btn");
    const closeBtn = document.getElementById("btn-close-queue");

    function openQueue() {
        overlay.classList.remove("hidden");
        setTimeout(() => {
            overlay.style.opacity = "1";
            overlay.style.pointerEvents = "auto";
            queuePanel.style.transform = "translateX(0)";
        }, 10);
    }

    function closeQueue() {
        overlay.style.opacity = "0";
        overlay.style.pointerEvents = "none";
        queuePanel.style.transform = "translateX(100%)";
        setTimeout(() => {
            overlay.classList.add("hidden");
        }, 300);
    }

    if (navBtn) navBtn.addEventListener("click", openQueue);
    if (headerBtn) headerBtn.addEventListener("click", openQueue);
    if (closeBtn) closeBtn.addEventListener("click", closeQueue);
    if (overlay) overlay.addEventListener("click", closeQueue);

    window.openQueue = openQueue;

    const clearBtn = document.getElementById("btn-clear-queue");
    if (clearBtn) {
        clearBtn.addEventListener("click", async () => {
            if (confirm("Möchtest du die Warteschlange wirklich leeren? (Laufende Aufgaben werden nicht abgebrochen)")) {
                try {
                    const res = await fetch("/api/queue/clear", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({})
                    });
                    if (res.ok) {
                        pollQueue();
                    }
                } catch (e) {
                    console.error("Fehler beim Leeren der Warteschlange:", e);
                }
            }
        });
    }

    setInterval(pollQueue, 2000);
    pollQueue();
}

async function pollQueue() {
    if (document.hidden) return;
    if (document.visibilityState === "hidden") return;
    try {
        const res = await fetch("/api/queue");
        if (!res.ok) return;
        const data = await res.json();
        renderQueue(data.jobs || []);
    } catch (e) {
        // ignore network errors for polling
    }
}

function renderQueue(jobs) {
    const list = document.getElementById("queue-list");
    const badge = document.getElementById("queue-badge");
    const headerBadge = document.getElementById("header-queue-badge");

    const activeSet = new Set();
    jobs.forEach(j => {
        if (j.status === "queued" || j.status === "running") {
            const p = j.project_name;
            if (p !== undefined && p !== null) {
                activeSet.add(p);
            }
        }
    });
    activeProjectsProcessing = activeSet;
    updateSidebarProcessingStates(activeProjectsProcessing);

    const activeJobs = jobs.filter(j => j.status === "queued" || j.status === "running");

    if (activeJobs.length > 0) {
        if (badge) {
            badge.textContent = activeJobs.length;
            badge.classList.remove("hidden");
        }
        if (headerBadge) {
            headerBadge.textContent = activeJobs.length;
            headerBadge.classList.remove("hidden");
        }
    } else {
        if (badge) badge.classList.add("hidden");
        if (headerBadge) headerBadge.classList.add("hidden");
    }

    if (jobs.length === 0) {
        list.innerHTML = `<div style="color:var(--text-muted); text-align:center; padding: 30px;">Keine Aufgaben in der Warteschlange.</div>`;
        return;
    }

    list.innerHTML = "";

    // Sort so newest is at the top
    [...jobs].reverse().forEach(job => {
        let statusColor = "var(--text-muted)";
        let icon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-clock" style="display:inline-block; vertical-align:middle; margin-right: 4px; color: var(--text-muted);"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
        let statusLabel = "Wartet";

        if (job.status === "running") {
            statusColor = "var(--accent)";
            icon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-cw" style="display:inline-block; vertical-align:middle; margin-right: 4px; color: var(--accent); animation: spin 2s linear infinite;"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>`;
            statusLabel = "Läuft";
        }
        else if (job.status === "done") {
            statusColor = "var(--success)";
            icon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check" style="display:inline-block; vertical-align:middle; margin-right: 4px; color: var(--success);"><polyline points="20 6 9 17 4 12"/></svg>`;
            statusLabel = "Abgeschlossen";
        }
        else if (job.status === "warning") {
            statusColor = "var(--warning)";
            icon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle" style="display:inline-block; vertical-align:middle; margin-right: 4px; color: var(--warning);"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`;
            statusLabel = "Warnung";
        }
        else if (job.status === "conflict") {
            statusColor = "var(--warning)";
            icon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-circle" style="display:inline-block; vertical-align:middle; margin-right: 4px; color: var(--warning);"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`;
            statusLabel = "Konflikt";
        }
        else if (job.status === "skipped") {
            statusColor = "var(--text-muted)";
            icon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-minus" style="display:inline-block; vertical-align:middle; margin-right: 4px; color: var(--text-muted);"><line x1="5" x2="19" y1="12" y2="12"/></svg>`;
            statusLabel = "Übersprungen";
        }
        else if (job.status === "partial") {
            statusColor = "var(--warning)";
            icon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle" style="display:inline-block; vertical-align:middle; margin-right: 4px; color: var(--warning);"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`;
            statusLabel = "Teilweise";
        }
        else if (job.status === "error" || job.status === "failed") {
            statusColor = "var(--danger)";
            icon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" style="display:inline-block; vertical-align:middle; margin-right: 4px; color: var(--danger);"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>`;
            statusLabel = "Fehlgeschlagen";
        }

        let progressHtml = "";
        if (job.status === "running" || job.status === "queued" || job.status === "done") {
            const displayProgress = job.progress || 0;
            const isAnimated = job.status === "running" ? "animation: pulse 2s infinite;" : "";
            progressHtml = `
                <div style="background:var(--bg-dark); height:8px; border-radius:4px; margin-top:10px; overflow:hidden;">
                    <div style="background:${statusColor}; height:100%; width:${displayProgress}%; transition:width 0.3s; ${isAnimated}"></div>
                </div>
            `;
        }

        let pipelineHtml = "";
        if (job.pipeline) {
            const steps = [
                { key: "metadata", label: "Metadaten" },
                { key: "convert", label: "Konvertierung" }
            ];

            // Dynamically add storage targets from settings or fallback to pipeline keys
            if (currentSettings && currentSettings.storage_targets) {
                currentSettings.storage_targets.forEach(target => {
                    const t_id = target.id;
                    if (job.pipeline[t_id]) {
                        let label = target.name || t_id;
                        if (t_id === "nas") label = "Auf NAS speichern";
                        else if (t_id === "pcloud") label = "Auf pCloud speichern";
                        steps.push({ key: t_id, label: label });
                    }
                });
            }

            // Fallback for targets in pipeline not present in storage_targets
            Object.keys(job.pipeline).forEach(key => {
                if (key !== "metadata" && key !== "convert" && key !== "local" && !steps.some(s => s.key === key)) {
                    let fallbackLabel = key;
                    if (key === "nas") fallbackLabel = "Auf NAS speichern";
                    else if (key === "pcloud") fallbackLabel = "Auf pCloud speichern";
                    steps.push({ key: key, label: fallbackLabel });
                }
            });

            if (job.pipeline.local) {
                steps.push({ key: "local", label: "In lokalen Ordner speichern" });
            }

            pipelineHtml = `<div class="pipeline-container" style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px; gap: 4px; background: rgba(0,0,0,0.25); padding: 8px; border-radius: var(--radius-md); box-sizing: border-box; width: 100%;">`;

            steps.forEach((step, idx) => {
                const sData = job.pipeline[step.key];
                if (!sData) return;

                let stepColor = "rgba(255, 255, 255, 0.05)";
                let stepIcon = "⚪";
                let textColor = "var(--text-muted)";
                let borderStyle = "1px solid rgba(255,255,255,0.05)";

                if (sData.status === "running") {
                    stepColor = "rgba(59, 130, 246, 0.1)";
                    stepIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-cw" style="display:inline-block; vertical-align:middle; animation: spin 2s linear infinite;"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>`;
                    textColor = "var(--primary)";
                    borderStyle = "1px solid rgba(59, 130, 246, 0.3)";
                } else if (sData.status === "done") {
                    stepColor = "rgba(16, 185, 129, 0.1)";
                    stepIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check" style="display:inline-block; vertical-align:middle;"><polyline points="20 6 9 17 4 12"/></svg>`;
                    textColor = "var(--success)";
                    borderStyle = "1px solid rgba(16, 185, 129, 0.3)";
                } else if (sData.status === "error") {
                    stepColor = "rgba(239, 68, 68, 0.1)";
                    stepIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" style="display:inline-block; vertical-align:middle;"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>`;
                    textColor = "var(--danger)";
                    borderStyle = "1px solid rgba(239, 68, 68, 0.3)";
                } else if (sData.status === "skipped") {
                    stepColor = "rgba(255, 255, 255, 0.02)";
                    stepIcon = "—";
                    textColor = "rgba(255,255,255,0.15)";
                    borderStyle = "1px solid rgba(255,255,255,0.02)";
                }
                const stepMessageHtml = sData.message
                    ? `<span style="font-size: 8px; color: ${textColor}; opacity: 0.85; line-height: 1.1; display: block; max-width: 100%; word-break: break-word;" title="${escapeHTML(sData.message)}">${escapeHTML(sData.message)}</span>`
                    : "";

                pipelineHtml += `
                    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 2px; border-radius: var(--radius-sm); background: ${stepColor}; border: ${borderStyle}; text-align: center; box-sizing: border-box;">
                        <span style="font-size: 13px; line-height: 1; display: inline-flex; align-items: center; justify-content: center;">${stepIcon}</span>
                        <span style="font-size: 9px; font-weight: 500; color: ${textColor}; white-space: normal; line-height: 1.1; word-break: break-word; max-width: 100%; display: block;" title="${step.label}">${step.label}</span>
                        ${sData.status === "running" ? `<span style="font-size: 9px; color: ${textColor}; font-weight: bold; display: block;">${sData.progress}%</span>` : ""}
                        ${stepMessageHtml}
                    </div>
                `;

                if (idx < steps.length - 1) {
                    pipelineHtml += `
                        <div style="font-size: 9px; color: rgba(255,255,255,0.15); font-weight: bold; flex: 0 0 auto;">➔</div>
                    `;
                }
            });

            pipelineHtml += `</div>`;
        }

        let retryHtml = "";
        if (job.status === "error") {
            retryHtml = `
                <div style="margin-top: 12px; display: flex; justify-content: flex-end;">
                    <button class="queue-retry-btn btn-secondary" data-task-id="${job.id}" style="padding: 4px 10px; font-size: 11px; display: flex; align-items: center; gap: 4px; border-radius: var(--radius-sm); cursor: pointer; transition: all 0.2s;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-cw" style="display:inline-block; vertical-align:middle; margin-right: 4px;"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg> Task wiederholen
                    </button>
                </div>
            `;
        }

        const card = document.createElement("div");
        card.style.cssText = "background: var(--bg-surface); border: 1px solid var(--border-glass); border-radius: var(--radius-lg); padding: 15px;";

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px; align-items: center;">
                <strong style="font-size:14px; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding-right:10px; display:inline-flex; align-items:center; gap: 6px;">${icon} ${job.name}</strong>
                <span style="font-size:12px; color:${statusColor}; text-transform:uppercase; font-weight:600;">${statusLabel}</span>
            </div>
            <div style="font-size:12px; color:var(--text-muted); margin-left: 20px;">${job.message || ""}</div>
            ${progressHtml}
            ${pipelineHtml}
            ${retryHtml}
        `;
        list.appendChild(card);
    });

    // Registriere Klick-Handler für Wiederholen-Buttons
    list.querySelectorAll(".queue-retry-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const taskId = e.currentTarget.getAttribute("data-task-id");
            if (!taskId) return;

            // Button deaktivieren und Lade-Status anzeigen
            e.currentTarget.disabled = true;
            e.currentTarget.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-cw" style="display:inline-block; vertical-align:middle; margin-right: 4px; animation: spin 2s linear infinite;"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg> Einreihen...`;

            try {
                const res = await fetch("/api/queue/retry", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ task_id: taskId })
                });

                if (res.ok) {
                    pollQueue();
                } else {
                    const data = await res.json();
                    alert(`Fehler beim Wiederholen: ${data.message || "Unbekannter Fehler"}`);
                    e.currentTarget.disabled = false;
                    e.currentTarget.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-cw" style="display:inline-block; vertical-align:middle; margin-right: 4px;"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg> Task wiederholen`;
                }
            } catch (err) {
                console.error("Fehler beim Wiederholen des Jobs:", err);
                alert("Fehler beim Verbinden mit dem Server.");
                e.currentTarget.disabled = false;
                e.currentTarget.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-cw" style="display:inline-block; vertical-align:middle; margin-right: 4px;"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg> Task wiederholen`;
            }
        });
    });

    // Check for newly finished jobs to show joke
    jobs.forEach(job => {
        if (job.status === "done" || job.status === "error") {
            if (!knownFinishedJobs.has(job.id)) {
                if (!isFirstQueuePoll && job.status === "done") {
                    // Newly finished job! Trigger joke!
                    if (currentSettings && currentSettings.show_jokes !== false) {
                        fetch("/api/joke")
                            .then(res => res.json())
                            .then(data => {
                                if (data.joke) {
                                    showJokeModal(data.joke);
                                }
                            }).catch(err => console.error(err));
                    }
                }
                if (knownFinishedJobs.size >= 100) {
                    const firstVal = knownFinishedJobs.values().next().value;
                    knownFinishedJobs.delete(firstVal);
                }
                knownFinishedJobs.add(job.id);
            }
        }
    });

    if (isFirstQueuePoll) {
        isFirstQueuePoll = false;
    }
}

function setupNasFolderAutocomplete(inputId, dropdownId, loadBtnId, destSelectId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    const loadBtn = document.getElementById(loadBtnId);
    const destSelect = document.getElementById(destSelectId);

    if (!input || !dropdown || !loadBtn || !destSelect) return;

    let allFolders = [];
    let folderDestinations = {};
    const originalBtnText = loadBtn.textContent || "NAS laden";

    const loadFolders = async (shouldFocusInnerSearch = false) => {
        let destVal = destSelect.value;
        if (inputId === "series-nas-folder-override" || inputId === "yt-series-nas-folder-override") {
            destVal = "all";
        }
        loadBtn.disabled = true;
        loadBtn.textContent = "Lade...";
        try {
            const res = await fetch(`/api/nas-series?destination_id=${encodeURIComponent(destVal)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.folders) {
                    allFolders = data.folders;
                    folderDestinations = data.folder_destinations || {};
                    appendConsoleLog(`[System]: ${allFolders.length} Serienordner erfolgreich geladen.`);
                    showDropdown(allFolders, shouldFocusInnerSearch);
                } else {
                    appendConsoleLog("[System]: Keine Serienordner auf dem NAS gefunden.");
                }
            } else {
                appendConsoleLog("[System]: Fehler beim Laden der Serienordner vom NAS.");
            }
        } catch (e) {
            console.error("Error loading NAS folders:", e);
            appendConsoleLog(`[System]: Fehler beim Laden der Serienordner: ${e.message}`);
        } finally {
            loadBtn.disabled = false;
            loadBtn.textContent = originalBtnText;
        }
    };

    const showDropdown = (list, shouldFocusInnerSearch = false) => {
        dropdown.innerHTML = "";

        // Add a search/filter input container at the top of the dropdown
        const searchWrapper = document.createElement("div");
        searchWrapper.className = "autocomplete-search-wrapper";
        searchWrapper.addEventListener("click", (e) => {
            e.stopPropagation();
        });

        // Premium magnifying glass SVG
        searchWrapper.innerHTML = `
            <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
        `;

        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.className = "autocomplete-search-input";
        searchInput.placeholder = "Serienname suchen...";
        searchInput.autocomplete = "off";

        searchWrapper.appendChild(searchInput);
        dropdown.appendChild(searchWrapper);

        const itemsContainer = document.createElement("div");
        itemsContainer.className = "autocomplete-items-container";
        dropdown.appendChild(itemsContainer);

        const renderItems = (filteredList) => {
            itemsContainer.innerHTML = "";
            if (filteredList.length === 0) {
                itemsContainer.innerHTML = `<div class="autocomplete-no-results">Keine Ergebnisse</div>`;
            } else {
                filteredList.forEach(folder => {
                    const item = document.createElement("div");
                    item.className = "autocomplete-item";
                    item.textContent = folder;
                    item.addEventListener("click", (e) => {
                        e.stopPropagation();
                        input.value = folder;
                        if (inputId === "series-nas-folder-override") {
                            window.nasFolderSelected = folder;
                        } else if (inputId === "yt-series-nas-folder-override") {
                            window.ytNasFolderSelected = folder;
                        }
                        closeDropdown();

                        // Automatically switch category if category mapping exists
                        if (destSelect && folderDestinations && folderDestinations[folder.toLowerCase()]) {
                            const matchedDestPath = folderDestinations[folder.toLowerCase()];
                            const nasRoot = currentSettings.nas_root || "";
                            const foundCat = (currentSettings.sync_categories || []).find(cat => {
                                const fullPath = nasRoot + (cat.nas_sub || "");
                                return fullPath.toLowerCase() === matchedDestPath.toLowerCase();
                            });

                            if (foundCat) {
                                const matchedDest = foundCat.id;
                                let hasOption = false;
                                for (let i = 0; i < destSelect.options.length; i++) {
                                    if (destSelect.options[i].value === matchedDest) {
                                        hasOption = true;
                                        break;
                                    }
                                }
                                if (hasOption) {
                                    window.isProgrammaticCategoryChange = true;
                                    destSelect.value = matchedDest;
                                    destSelect.dispatchEvent(new Event("change", { bubbles: true }));
                                    window.isProgrammaticCategoryChange = false;
                                }
                            }
                        }

                        // Trigger listeners
                        input.dispatchEvent(new Event("input", { bubbles: true }));
                        input.dispatchEvent(new Event("change", { bubbles: true }));

                        // Custom action: If this is the series tab autocomplete, trigger show matching!
                        if (inputId === "series-nas-folder-override") {
                            triggerSeriesMatchingFromFolder(folder);
                        } else if (inputId === "yt-series-nas-folder-override") {
                            fetchYtNasSeasons();
                        }
                    });
                    itemsContainer.appendChild(item);
                });
            }
        };

        // Inner search input event listener
        searchInput.addEventListener("input", () => {
            const query = searchInput.value.toLowerCase().trim();
            if (!query) {
                renderItems(list);
            } else {
                const filtered = list.filter(folder => folder.toLowerCase().includes(query));
                renderItems(filtered);
            }
        });

        // Initial render
        renderItems(list);

        dropdown.classList.remove("hidden");

        if (shouldFocusInnerSearch) {
            setTimeout(() => {
                searchInput.focus();
            }, 50);
        }
    };

    const closeDropdown = () => {
        dropdown.classList.add("hidden");
    };

    loadBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        loadFolders(true);
    });

    input.addEventListener("focus", async () => {
        if (allFolders.length === 0) {
            await loadFolders(false);
        } else {
            filterFolders(false);
        }
    });

    const filterFolders = (shouldFocusInnerSearch = false) => {
        const query = input.value.toLowerCase().trim();
        if (allFolders.length === 0) return;
        if (!query) {
            showDropdown(allFolders, shouldFocusInnerSearch);
            return;
        }
        // Case-insensitive substring match (fuzzy)
        const filtered = allFolders.filter(folder => folder.toLowerCase().includes(query));
        showDropdown(filtered, shouldFocusInnerSearch);
    };

    const debouncedFilter = debounce(() => filterFolders(false), 250);
    input.addEventListener("input", debouncedFilter);

    // Clear folder cache when destination select changes
    destSelect.addEventListener("change", () => {
        allFolders = [];
        folderDestinations = {};
    });

    // Close dropdown on click outside
    document.addEventListener("click", (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target) && !loadBtn.contains(e.target)) {
            closeDropdown();
        }
    });
}

function findBestNasFolderMatch(cleanedTitle, folders) {
    if (!cleanedTitle || !folders || folders.length === 0) return null;

    const cleanStr = cleanSeriesName(cleanedTitle).trim();
    if (!cleanStr) return null;

    // 1. Exact case-insensitive match
    for (const f of folders) {
        if (f.toLowerCase().trim() === cleanStr.toLowerCase()) {
            return f;
        }
    }

    // 2. Normalized alphanumeric match
    const normProj = cleanStr.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normProj) {
        for (const f of folders) {
            const normF = f.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normF === normProj) {
                return f;
            }
        }
    }

    // 3. Substring match
    if (normProj.length >= 4) {
        const hasYear = (str) => /\d{4}/.test(str);
        for (const f of folders) {
            const normF = f.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normF.includes(normProj) || normProj.includes(normF)) {
                if (hasYear(normProj) !== hasYear(normF)) {
                    continue; // Skip mismatching years to prevent e.g. Avatar (2024) matching Avatar (2005)
                }
                return f;
            }
        }
    }

    return null;
}

async function autoMatchNasFolder(inputId, destSelectId, originalCleanedName) {
    if (!originalCleanedName) return;
    const input = document.getElementById(inputId);
    const destSelect = document.getElementById(destSelectId);
    if (!input || !destSelect) return;

    const destVal = destSelect.value;
    try {
        const res = await fetch(`/api/nas-series?destination_id=${encodeURIComponent(destVal)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.folders && data.folders.length > 0) {
                const bestMatch = findBestNasFolderMatch(originalCleanedName, data.folders);
                if (bestMatch) {
                    input.value = bestMatch;

                    // Trigger visual flash
                    input.classList.remove("highlight-match-flash");
                    void input.offsetWidth; // trigger reflow
                    input.classList.add("highlight-match-flash");
                    setTimeout(() => {
                        input.classList.remove("highlight-match-flash");
                    }, 1500);

                    appendConsoleLog(`[System]: Automatisch passenden NAS-Ordner "${bestMatch}" zugeordnet.`);
                }
            }
        }
    } catch (e) {
        console.error("Error auto matching NAS folder:", e);
    }
}

let isFirstQueuePoll = true;
let knownFinishedJobs = new Set();

function showJokeModal(jokeText) {
    const existing = document.getElementById("joke-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "joke-modal";
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;

    const content = document.createElement("div");
    content.style.cssText = `
        background: rgba(30, 30, 45, 0.95);
        border: 1px solid var(--border-glass);
        border-radius: var(--radius-lg);
        padding: 30px;
        width: 90%;
        max-width: 450px;
        text-align: center;
        box-shadow: 0 20px 40px rgba(0,0,0,0.5);
        transform: scale(0.9);
        transition: transform 0.3s ease;
    `;

    content.innerHTML = `
        <div style="font-size: 40px; margin-bottom: 15px;">🎭</div>
        <h3 style="margin-top: 0; color: var(--text-main); font-size: 18px; font-weight: 600; letter-spacing: 0.5px;">Witz des Tages</h3>
        <p style="font-size: 14px; color: var(--text-main); line-height: 1.6; margin: 20px 0; font-style: italic;">"${jokeText}"</p>
        <button id="btn-close-joke" class="btn btn-primary" style="margin-top: 10px; min-width: 120px;">Hahaha! 😂</button>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    setTimeout(() => {
        modal.style.opacity = "1";
        content.style.transform = "scale(1)";
    }, 10);

    const closeBtn = content.querySelector("#btn-close-joke");
    const closeModal = () => {
        modal.style.opacity = "0";
        content.style.transform = "scale(0.9)";
        setTimeout(() => modal.remove(), 300);
    };

    closeBtn.addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
    });
}

async function triggerLaunchJoke() {
    if (currentSettings && currentSettings.show_jokes !== false) {
        try {
            const res = await fetch("/api/joke");
            if (res.ok) {
                const data = await res.json();
                if (data.joke) {
                    showJokeModal(data.joke);
                }
            }
        } catch (e) {
            console.error("Failed to load joke:", e);
        }
    }
}

async function triggerLaunchQuote() {
    if (currentSettings && currentSettings.show_quote !== false) {
        try {
            const res = await fetch("/api/quote");
            if (res.ok) {
                const data = await res.json();
                if (data.quote) {
                    showQuoteModal(data);
                }
            }
        } catch (e) {
            console.error("Failed to load quote:", e);
        }
    }
}

function showQuoteModal(quoteData) {
    const existing = document.getElementById("quote-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "quote-modal";
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;

    const content = document.createElement("div");
    content.style.cssText = `
        background: rgba(30, 30, 45, 0.95);
        border: 1px solid var(--border-glass);
        border-radius: var(--radius-lg);
        padding: 35px 30px;
        width: 90%;
        max-width: 500px;
        text-align: center;
        box-shadow: 0 20px 40px rgba(0,0,0,0.5);
        transform: scale(0.9);
        transition: transform 0.3s ease;
        position: relative;
    `;

    const cleanQuote = quoteData.quote.trim();
    const cleanAuthor = (quoteData.authorName || "Unbekannt").trim();
    const authorHtml = quoteData.authorLink
        ? `<a href="${quoteData.authorLink}" target="_blank" style="color: #c084fc; text-decoration: none; border-bottom: 1px dotted #c084fc; font-weight: 500;">— ${cleanAuthor}</a>`
        : `<span style="color: #94a3b8; font-weight: 500;">— ${cleanAuthor}</span>`;

    content.innerHTML = `
        <div style="font-size: 44px; margin-bottom: 15px; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.3));">✍️</div>
        <h3 style="margin-top: 0; color: #94a3b8; font-size: 13px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 20px;">Zitat des Tages</h3>

        <p style="
            font-size: 16px;
            color: #e2e8f0;
            line-height: 1.7;
            margin: 0 0 20px 0;
            font-style: italic;
            font-weight: 400;
        ">
            "${cleanQuote}"
        </p>

        <div style="font-size: 14px; margin-bottom: 30px;">
            ${authorHtml}
        </div>

        <button id="btn-close-quote" class="btn btn-primary" style="min-width: 145px; padding: 10px 24px; font-size: 14px; font-weight: 600;">Inspirierend! 🌟</button>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    setTimeout(() => {
        modal.style.opacity = "1";
        content.style.transform = "scale(1)";
    }, 10);

    const closeModal = () => {
        modal.style.opacity = "0";
        content.style.transform = "scale(0.9)";
        setTimeout(() => modal.remove(), 300);
    };

    content.querySelector("#btn-close-quote").addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
    });
}



// YouTube Merge Modal Logic
let currentMergeItems = [];
let mergeSubId = null;
let mergeInitialVideoId = null;

function openYtMergeModal(initialTitle, initialUrl, initialThumbnail, subId, videoId) {
    mergeSubId = subId;
    mergeInitialVideoId = videoId;

    const modal = document.getElementById("yt-merge-modal");
    if (!modal) return;

    modal.classList.remove("hidden");

    // Load subscription settings if available
    let copyToNas = true;
    let copyToPcloud = false;
    let copyToLocal = false;
    let nasDest = "";
    let pcloudDest = "";
    let localDest = "";

    if (subId && currentSettings && currentSettings.youtube_subscriptions) {
        const sub = currentSettings.youtube_subscriptions.find(s => s.id === subId);
        if (sub) {
            copyToNas = sub.copy_to_nas !== false;
            copyToPcloud = !!sub.copy_to_pcloud;
            copyToLocal = !!sub.copy_to_local;
            nasDest = sub.nas_destination_id || sub.destination_id || "";
            pcloudDest = sub.pcloud_destination_id || "";
            localDest = sub.local_destination_id || "";
        }
    }

    const cbNas = document.getElementById("yt-merge-option-copy-nas");
    const cbPcloud = document.getElementById("yt-merge-option-copy-pcloud");
    const cbLocal = document.getElementById("yt-merge-option-copy-local");

    if (cbNas) cbNas.checked = copyToNas;
    if (cbPcloud) cbPcloud.checked = copyToPcloud;
    if (cbLocal) cbLocal.checked = copyToLocal;

    // Trigger change event to sync visibility
    if (cbNas) cbNas.dispatchEvent(new Event("change"));
    if (cbPcloud) cbPcloud.dispatchEvent(new Event("change"));
    if (cbLocal) cbLocal.dispatchEvent(new Event("change"));

    const selNas = document.getElementById("yt-merge-nas-destination");
    const selPcloud = document.getElementById("yt-merge-pcloud-destination");
    const selLocal = document.getElementById("yt-merge-local-destination");

    if (selNas && nasDest) selNas.value = nasDest;
    if (selPcloud && pcloudDest) selPcloud.value = pcloudDest;
    if (selLocal && localDest) selLocal.value = localDest;

    // Set default final title (clean up part/episode indicators)
    let cleanTitle = initialTitle;
    const patterns = [
        /\bteil\s*\d+\b/i,
        /\bpart\s*\d+\b/i,
        /\bepisode\s*\d+\b/i,
        /#\s*\d+\b/i,
        /\b\d+\s*\/\s*\d+\b/i,
        /\b\d+\s*von\s*\d+\b/i,
        /\b\d+\.\s*teil\b/i,
        /\b\d+\.\s*part\b/i
    ];
    patterns.forEach(p => {
        cleanTitle = cleanTitle.replace(p, "");
    });
    cleanTitle = cleanTitle.replace(/\s*-\s*$/, "").replace(/\s+/g, " ").trim();

    document.getElementById("yt-merge-title").value = cleanTitle || initialTitle;
    document.getElementById("yt-merge-query").textContent = initialTitle;

    const listContainer = document.getElementById("yt-merge-list");
    listContainer.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-2" style="display:inline-block; vertical-align:middle; margin-right: 6px; animation: spin 1s linear infinite; height: 14px; width: 14px;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Suche nach Teilen auf YouTube...</div>`;

    fetch(`/api/youtube/search-parts?title=${encodeURIComponent(initialTitle)}`)
        .then(res => res.json())
        .then(data => {
            const results = data.results || [];

            // Build unique list of items
            const items = [];

            // 1. Add our initial video
            items.push({
                id: videoId,
                title: initialTitle,
                url: initialUrl,
                thumbnail: initialThumbnail,
                checked: true,
                isInitial: true
            });

            // 2. Add search results, avoiding duplicates of the initial video
            results.forEach(r => {
                if (r.id !== videoId) {
                    items.push({
                        id: r.id,
                        title: r.title,
                        url: r.url,
                        thumbnail: r.thumbnail,
                        checked: false,
                        isInitial: false
                    });
                }
            });

            currentMergeItems = items;
            renderMergeItems();
        })
        .catch(err => {
            console.error(err);
            listContainer.innerHTML = `<div style="text-align:center; padding:20px; color:var(--danger);">Fehler bei der Suche nach Teilen.</div>`;
        });
}

function renderMergeItems() {
    const listContainer = document.getElementById("yt-merge-list");
    if (!listContainer) return;

    listContainer.innerHTML = "";

    currentMergeItems.forEach((item, index) => {
        const row = document.createElement("div");
        row.className = "merge-item-row";
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.justifyContent = "space-between";
        row.style.gap = "10px";
        row.style.background = "rgba(255,255,255,0.02)";
        row.style.border = "1px solid var(--border-glass)";
        row.style.borderRadius = "var(--radius-sm)";
        row.style.padding = "8px 12px";
        row.style.transition = "all 0.2s ease";

        // Left part: Checkbox + Thumbnail + Title
        const left = document.createElement("div");
        left.style.display = "flex";
        left.style.alignItems = "center";
        left.style.gap = "10px";
        left.style.flex = "1";
        left.style.minWidth = "0";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = item.checked;
        checkbox.disabled = item.isInitial; // Initial item must be checked
        checkbox.style.cursor = item.isInitial ? "default" : "pointer";
        checkbox.addEventListener("change", (e) => {
            item.checked = e.target.checked;
            const checked = currentMergeItems.filter(x => x.checked);
            const unchecked = currentMergeItems.filter(x => !x.checked);
            currentMergeItems = [...checked, ...unchecked];
            renderMergeItems();
        });
        left.appendChild(checkbox);

        if (item.thumbnail) {
            const img = document.createElement("img");
            img.className = "poster-img";
            img.setAttribute("data-fallback", "true");
            img.setAttribute("alt", item.title || "Video");
            img.setAttribute("data-media-type", "tv");
            img.style.width = "54px";
            img.style.height = "30px";
            img.style.objectFit = "cover";
            img.style.borderRadius = "2px";
            img.src = item.thumbnail;
            left.appendChild(img);
        } else {
            const fallback = createFallbackPoster(item.title || "Video", true, "54px", "30px");
            left.appendChild(fallback);
        }

        const info = document.createElement("div");
        info.style.minWidth = "0";

        const titleSpan = document.createElement("div");
        titleSpan.style.fontWeight = "500";
        titleSpan.style.fontSize = "12px";
        titleSpan.style.whiteSpace = "nowrap";
        titleSpan.style.overflow = "hidden";
        titleSpan.style.textOverflow = "ellipsis";
        titleSpan.textContent = item.title;
        titleSpan.title = item.title;
        info.appendChild(titleSpan);

        if (item.isInitial) {
            const badge = document.createElement("span");
            badge.style.fontSize = "9px";
            badge.style.background = "rgba(16, 185, 129, 0.15)";
            badge.style.color = "var(--success)";
            badge.style.padding = "1px 4px";
            badge.style.borderRadius = "3px";
            badge.style.marginLeft = "0px";
            badge.style.fontWeight = "bold";
            badge.textContent = "AUSGANGS-VIDEO";
            info.appendChild(badge);
        }

        left.appendChild(info);
        row.appendChild(left);

        // Right part: Re-order controls
        const right = document.createElement("div");
        right.style.display = "flex";
        right.style.gap = "4px";

        const btnUp = document.createElement("button");
        btnUp.className = "btn btn-secondary btn-xs";
        btnUp.style.padding = "2px 6px";
        btnUp.innerHTML = "▲";
        btnUp.disabled = index === 0;
        btnUp.addEventListener("click", () => {
            // Swap with previous
            const temp = currentMergeItems[index - 1];
            currentMergeItems[index - 1] = currentMergeItems[index];
            currentMergeItems[index] = temp;
            renderMergeItems();
        });

        const btnDown = document.createElement("button");
        btnDown.className = "btn btn-secondary btn-xs";
        btnDown.style.padding = "2px 6px";
        btnDown.innerHTML = "▼";
        btnDown.disabled = index === currentMergeItems.length - 1;
        btnDown.addEventListener("click", () => {
            // Swap with next
            const temp = currentMergeItems[index + 1];
            currentMergeItems[index + 1] = currentMergeItems[index];
            currentMergeItems[index] = temp;
            renderMergeItems();
        });

        right.appendChild(btnUp);
        right.appendChild(btnDown);
        row.appendChild(right);

        listContainer.appendChild(row);
    });
}

function closeYtMergeModal() {
    document.getElementById("yt-merge-modal").classList.add("hidden");
    currentMergeItems = [];
    mergeSubId = null;
    mergeInitialVideoId = null;
}

// Hook up events
document.addEventListener("DOMContentLoaded", () => {
    const btnClose = document.getElementById("btn-close-yt-merge");
    const btnCancel = document.getElementById("btn-cancel-yt-merge");
    const btnStart = document.getElementById("btn-start-yt-merge");

    if (btnClose) btnClose.addEventListener("click", closeYtMergeModal);
    if (btnCancel) btnCancel.addEventListener("click", closeYtMergeModal);

    if (btnStart) {
        btnStart.addEventListener("click", async () => {
            const finalTitleInput = document.getElementById("yt-merge-title");
            const finalTitle = finalTitleInput ? finalTitleInput.value.trim() : "";

            if (!finalTitle) {
                alert("Bitte gib einen Dateinamen an!");
                return;
            }

            const selectedItems = currentMergeItems.filter(item => item.checked);
            if (selectedItems.length === 0) {
                alert("Bitte wähle mindestens ein Video aus!");
                return;
            }

            const urls = selectedItems.map(item => item.url);
            const videoIdsToRemove = selectedItems.map(item => item.id);

            btnStart.disabled = true;
            btnStart.textContent = "Starte Merge...";

            const copyToNas = document.getElementById("yt-merge-option-copy-nas")?.checked ?? false;
            const copyToPcloud = document.getElementById("yt-merge-option-copy-pcloud")?.checked ?? false;
            const copyToLocal = document.getElementById("yt-merge-option-copy-local")?.checked ?? false;

            const nasDest = document.getElementById("yt-merge-nas-destination")?.value || "";
            const pcloudDest = document.getElementById("yt-merge-pcloud-destination")?.value || "";
            const localDest = document.getElementById("yt-merge-local-destination")?.value || "";

            try {
                const res = await fetch("/api/youtube/merge", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        urls: urls,
                        title: finalTitle,
                        subscription_id: mergeSubId,
                        video_ids_to_remove: videoIdsToRemove,
                        thumbnail: selectedItems[0].thumbnail || "",
                        copy_to_nas: copyToNas,
                        copy_to_pcloud: copyToPcloud,
                        copy_to_local: copyToLocal,
                        nas_destination_id: nasDest,
                        pcloud_destination_id: pcloudDest,
                        local_destination_id: localDest
                    })
                });

                if (res.ok) {
                    appendConsoleLog(`[System]: Merge-Job für "${finalTitle}" mit ${urls.length} Teilen gestartet.`);
                    alert("Merge-Job im Hintergrund gestartet!");
                    closeYtMergeModal();

                    // Remove processed videos from UI
                    loadSubscriptions();
                } else {
                    const data = await res.json();
                    alert(`Fehler beim Starten: ${data.error || 'Serverfehler'}`);
                }
            } catch (err) {
                console.error(err);
                alert("Netzwerkfehler beim Starten des Zusammenfügens.");
            } finally {
                btnStart.disabled = false;
                btnStart.innerHTML = "Teile zusammenfügen & laden";
            }
        });
    }
});

// Duplicate Compare Modal Logic
let activeDuplicateInfo = null;

function openDuplicateCompareModal(existingPath, existingFilename, newFilename, badgeId) {
    const modal = document.getElementById("duplicate-compare-modal");
    if (!modal) return;

    modal.classList.remove("hidden");

    // Reset fields to loading state
    document.getElementById("dup-new-name").textContent = newFilename;
    document.getElementById("dup-new-res").textContent = "Lade...";
    document.getElementById("dup-new-size").textContent = "Lade...";
    document.getElementById("dup-new-vcodec").textContent = "Lade...";
    document.getElementById("dup-new-acodec").textContent = "Lade...";
    document.getElementById("dup-new-bitrate").textContent = "Lade...";
    document.getElementById("dup-new-duration").textContent = "Lade...";

    document.getElementById("dup-exist-name").textContent = existingFilename;
    document.getElementById("dup-exist-res").textContent = "Lade...";
    document.getElementById("dup-exist-size").textContent = "Lade...";
    document.getElementById("dup-exist-vcodec").textContent = "Lade...";
    document.getElementById("dup-exist-acodec").textContent = "Lade...";
    document.getElementById("dup-exist-bitrate").textContent = "Lade...";
    document.getElementById("dup-exist-duration").textContent = "Lade...";

    const projName = typeof currentProject === "string" ? currentProject : "";
    const newPath = currentSettings.inbox_dir + "/" + (projName ? projName + "/" : "") + newFilename;

    activeDuplicateInfo = {
        new_path: newPath,
        existing_path: existingPath,
        badge_id: badgeId
    };

    fetch(`/api/media/compare-files?new_path=${encodeURIComponent(newPath)}&existing_path=${encodeURIComponent(existingPath)}`)
        .then(res => {
            if (!res.ok) throw new Error("HTTP Fehler");
            return res.json();
        })
        .then(data => {
            const n = data.new_file;
            const e = data.existing_file;

            document.getElementById("dup-new-res").textContent = n.resolution;
            document.getElementById("dup-new-size").textContent = n.size_readable;
            document.getElementById("dup-new-vcodec").textContent = n.video_codec;
            document.getElementById("dup-new-acodec").textContent = n.audio_codec;
            document.getElementById("dup-new-bitrate").textContent = n.bitrate_kbps;
            document.getElementById("dup-new-duration").textContent = n.duration_str;

            document.getElementById("dup-exist-res").textContent = e.resolution;
            document.getElementById("dup-exist-size").textContent = e.size_readable;
            document.getElementById("dup-exist-vcodec").textContent = e.video_codec;
            document.getElementById("dup-exist-acodec").textContent = e.audio_codec;
            document.getElementById("dup-exist-bitrate").textContent = e.bitrate_kbps;
            document.getElementById("dup-exist-duration").textContent = e.duration_str;
        })
        .catch(err => {
            console.error("Comparison error:", err);
            ["new", "exist"].forEach(prefix => {
                document.getElementById(`dup-${prefix}-res`).textContent = "Fehler";
                document.getElementById(`dup-${prefix}-size`).textContent = "Fehler beim Laden";
            });
        });
}

function closeDuplicateCompareModal() {
    document.getElementById("duplicate-compare-modal").classList.add("hidden");
    activeDuplicateInfo = null;
}

// Global click event delegation for duplicate badges
document.addEventListener("click", (e) => {
    const badge = e.target.closest(".duplicate-badge");
    if (badge) {
        const existingPath = badge.getAttribute("data-existing-path");
        const existingFilename = badge.getAttribute("data-existing-filename");
        const newFile = badge.getAttribute("data-new-file");
        const badgeId = badge.getAttribute("data-badge-id");

        if (existingPath && newFile) {
            openDuplicateCompareModal(existingPath, existingFilename, newFile, badgeId);
        }
    }
});

// Hook up duplicate modal events
document.addEventListener("DOMContentLoaded", () => {
    const btnClose = document.getElementById("btn-close-dup-compare");
    const btnKeep = document.getElementById("btn-dup-keep-both");
    const btnUpgrade = document.getElementById("btn-dup-upgrade");

    if (btnClose) btnClose.addEventListener("click", closeDuplicateCompareModal);
    if (btnKeep) btnKeep.addEventListener("click", closeDuplicateCompareModal);

    if (btnUpgrade) {
        btnUpgrade.addEventListener("click", async () => {
            if (!activeDuplicateInfo) return;

            if (confirm("Möchtest du die existierende Datei auf dem NAS wirklich in Quarantäne verschieben?")) {
                btnUpgrade.disabled = true;
                btnUpgrade.textContent = "Führe Upgrade aus...";

                try {
                    const res = await fetch("/api/media/resolve-duplicate", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            action: "upgrade",
                            new_path: activeDuplicateInfo.new_path,
                            existing_path: activeDuplicateInfo.existing_path
                        })
                    });

                    if (res.ok) {
                        appendConsoleLog(`[System]: Vorhandene Datei auf NAS gelöscht: ${activeDuplicateInfo.existing_path}`);
                        alert("Upgrade erfolgreich vorbereitet! Die alte Datei auf dem NAS wurde gelöscht. Klicke jetzt auf 'Zuweisung starten', um das neue Video dorthin zu kopieren.");

                        const badgeContainer = document.getElementById(activeDuplicateInfo.badge_id);
                        if (badgeContainer) {
                            badgeContainer.innerHTML = "";
                        }

                        closeDuplicateCompareModal();
                    } else {
                        const data = await res.json();
                        alert(`Fehler beim Upgrade: ${data.error || 'Serverfehler'}`);
                    }
                } catch (err) {
                    console.error(err);
                    alert("Netzwerkfehler beim Ausführen des Upgrades.");
                } finally {
                    btnUpgrade.disabled = false;
                    btnUpgrade.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2" style="display:inline-block; vertical-align:middle; margin-right: 4px; height: 12px; width: 12px;"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>Vorhandene in Quarantäne & Upgrade';
                }
            }
        });
    }
});

// ==========================================================================
// WELCOME DASHBOARD DATA BINDING & INTERACTION
// ==========================================================================
async function updateHomepageData(statusData) {
    if (!statusData) return;

    // 0. Update Workspace Folder Sizes
    const inboxSizeDisplay = document.getElementById("inbox-size-display");
    const outboxSizeDisplay = document.getElementById("outbox-size-display");
    if (inboxSizeDisplay) {
        if (statusData.metrics_loading) {
            inboxSizeDisplay.textContent = "Berechne...";
        } else {
            const rawInboxBytes = statusData.inbox_bytes || 0;
            inboxSizeDisplay.textContent = `Größe: ${formatBytes(rawInboxBytes)}`;
        }
    }
    if (outboxSizeDisplay) {
        if (statusData.metrics_loading) {
            outboxSizeDisplay.textContent = "Berechne...";
        } else {
            const rawOutboxBytes = statusData.outbox_bytes || 0;
            if (rawOutboxBytes > 0) {
                outboxSizeDisplay.style.color = "var(--danger)";
                outboxSizeDisplay.textContent = `Größe: ${formatBytes(rawOutboxBytes)} (nicht leer)`;
            } else {
                outboxSizeDisplay.style.color = "var(--text-muted)";
                outboxSizeDisplay.textContent = `Größe: ${formatBytes(rawOutboxBytes)} (leer)`;
            }
        }
    }

    // 0.1 Folder Size Warnings (Feature 5)
    const warningBanner = document.getElementById("folder-size-warning");
    const warningText = document.getElementById("folder-size-warning-text");
    if (warningBanner && warningText) {
        let warnings = [];
        const inboxSize = statusData.inbox_size_gb || 0;
        const outboxSize = statusData.outbox_size_gb || 0;
        const threshInbox = parseFloat(document.getElementById("set-monitor-inbox-gb")?.value) || 50.0;
        const threshOutbox = parseFloat(document.getElementById("set-monitor-outbox-gb")?.value) || 50.0;

        if (statusData.metrics_loading) {
            warningText.innerHTML = "Speichergrößen werden im Hintergrund berechnet...";
            warningBanner.classList.remove("hidden");
        } else {
            if (inboxSize > threshInbox) {
                warnings.push(`Der Inbox-Ordner belegt ${inboxSize.toFixed(1)} GB (Schwelle: ${threshInbox} GB).`);
            }
            if (outboxSize > threshOutbox) {
                warnings.push(`Der Outbox-Ordner belegt ${outboxSize.toFixed(1)} GB (Schwelle: ${threshOutbox} GB). Denke daran, verarbeitete Projekte zu löschen.`);
            }

            if (warnings.length > 0) {
                warningText.innerHTML = warnings.join("<br>");
                warningBanner.classList.remove("hidden");
            } else {
                warningBanner.classList.add("hidden");
            }
        }
    }

    // 1. (Inbox-Status wird jetzt von der Smart Inbox abgedeckt)

    // 2. NAS Badge
    const nasBadge = document.getElementById("hero-nas-badge");
    if (nasBadge) {
        nasBadge.className = "status-badge";
        if (statusData.nas_details && !statusData.nas_details.has_root) {
            nasBadge.textContent = "Nicht konfiguriert";
            nasBadge.classList.add("warning");
        } else if (statusData.nas_status === "connected_but_no_library_paths") {
            nasBadge.textContent = "Unvollständig";
            nasBadge.classList.add("warning");
        } else if (statusData.nas_status === "connected") {
            nasBadge.textContent = "Verbunden";
            nasBadge.classList.add("online");
        } else if (statusData.nas_status === "available_not_mounted") {
            nasBadge.textContent = "Bereit (Nicht gemountet)";
            nasBadge.classList.add("warning");
        } else {
            nasBadge.textContent = "Offline";
            nasBadge.classList.add("offline");
        }
    }

    // Detailed NAS connection info & buttons on startpage (Approach A)
    const nasInfoContainer = document.getElementById("hero-nas-connection-info");
    const nasInfoMsg = document.getElementById("hero-nas-info-message");
    const heroConnectBtn = document.getElementById("btn-hero-connect-nas");
    const heroRefreshBtn = document.getElementById("btn-hero-refresh-nas");

    if (nasInfoContainer && nasInfoMsg) {
        const details = statusData.nas_details;
        if (details) {
            nasInfoContainer.style.display = "block";
            heroConnectBtn.style.display = "none";
            heroRefreshBtn.style.display = "none";

            const runtimeDocker = window.AppCapabilities && window.AppCapabilities.runtime === "docker";
            const mountAllowed = !runtimeDocker;

            if (!details.enabled) {
                nasInfoMsg.innerHTML = '<span style="display:inline-flex; align-items:center; gap:6px;"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-circle" style="height:14px; width:14px;"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>NAS-Verbindung in den Einstellungen deaktiviert.</span>';
                nasInfoMsg.style.color = "var(--text-muted)";
            } else if (!details.has_root) {
                nasInfoMsg.innerHTML = '<span style="display:inline-flex; align-items:center; gap:6px;"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-circle" style="height:14px; width:14px;"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="12" y2="16"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>Nicht konfiguriert (Einhängepfad fehlt).</span>';
                nasInfoMsg.style.color = "var(--text-muted)";
                heroConnectBtn.textContent = "Einrichten";
                heroConnectBtn.style.display = "inline-block";
            } else if (details.status === "connected_but_no_library_paths") {
                nasInfoMsg.innerHTML = '<span style="display:inline-flex; align-items:center; gap:6px;"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-circle" style="height:14px; width:14px;"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="12" y2="16"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>NAS verbunden, aber keine Bibliotheksordner gefunden.</span>';
                nasInfoMsg.style.color = "var(--warning)";
                if (details.error_message) {
                    const subSpan = document.createElement("span");
                    subSpan.style.opacity = "0.7";
                    subSpan.style.fontSize = "0.9em";
                    subSpan.style.display = "block";
                    subSpan.style.marginTop = "4px";
                    subSpan.textContent = details.error_message;
                    nasInfoMsg.appendChild(subSpan);
                }
            } else if (details.status === "connected") {
                nasInfoMsg.innerHTML = '<span style="display:inline-flex; align-items:center; gap:6px;"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle" style="height:14px; width:14px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>Netzlaufwerk ist eingehängt.</span>';
                nasInfoMsg.style.color = "var(--success)";
                if (details.reachable_ip) {
                    const subSpan = document.createElement("span");
                    subSpan.style.opacity = "0.7";
                    subSpan.style.fontSize = "0.9em";
                    subSpan.style.display = "block";
                    subSpan.style.marginTop = "4px";
                    subSpan.textContent = `Letzte erreichbare IP: ${details.reachable_ip}`;
                    nasInfoMsg.appendChild(subSpan);
                }
            } else if (details.status === "available_not_mounted") {
                let ipType = "IP-Adresse";
                if (details.ip_details) {
                    const reachedInfo = details.ip_details.find(info => info.address === details.reachable_ip);
                    if (reachedInfo && reachedInfo.role === "backup") {
                        ipType = "Backup-/Tailscale-IP";
                    }
                }

                nasInfoMsg.innerHTML = `<span style="display:inline-flex; align-items:center; gap:6px;"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-circle" style="height:14px; width:14px;"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="12" y2="16"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>NAS erreichbar via ${ipType} (${escapeHTML(details.reachable_ip || "unbekannt")}), aber nicht eingehängt.</span>`;
                nasInfoMsg.style.color = "var(--warning)";

                const subSpan = document.createElement("span");
                subSpan.style.opacity = "0.7";
                subSpan.style.fontSize = "0.9em";
                subSpan.style.display = "block";
                subSpan.style.marginTop = "4px";
                if (mountAllowed) {
                    heroConnectBtn.style.display = "inline-block";
                    subSpan.textContent = "Der automatische Mount-Vorgang kann Zugangsdaten erfordern.";
                } else {
                    subSpan.textContent = "Im Docker-Modus muss das Volume vom Host gemountet sein (Volume-Mapping in docker-compose.yml prüfen).";
                }
                nasInfoMsg.appendChild(subSpan);
            } else {
                // offline
                const checkedStr = details.checked_ips && details.checked_ips.length > 0 ? details.checked_ips.join(" / ") : "";
                if (runtimeDocker) {
                    nasInfoMsg.textContent = "❌ NAS offline (Volume nicht verfügbar).";
                } else if (checkedStr) {
                    nasInfoMsg.textContent = `❌ NAS offline (keine Verbindung zu: ${checkedStr}).`;
                } else {
                    nasInfoMsg.textContent = "❌ NAS offline (keine IP konfiguriert).";
                }
                nasInfoMsg.style.color = "var(--danger)";

                const errDetail = details.error_message;
                if (errDetail || runtimeDocker || (details.checked_ips && details.checked_ips.length > 1)) {
                    const subSpan = document.createElement("span");
                    subSpan.style.opacity = "0.7";
                    subSpan.style.fontSize = "0.9em";
                    subSpan.style.display = "block";
                    subSpan.style.marginTop = "4px";

                    let tipText = "";
                    if (errDetail) {
                        tipText += `Fehler: ${errDetail}`;
                    }
                    if (runtimeDocker) {
                        if (tipText) tipText += " • ";
                        tipText += "Tipp: Docker-Volume-Mapping in docker-compose.yml prüfen.";
                        if (details.checked_ips && details.checked_ips.length > 0) {
                            tipText += " (oder VPN/Tailscale auf dem Host prüfen)";
                        }
                    } else {
                        if (details.checked_ips && details.checked_ips.length > 1) {
                            if (tipText) tipText += " • ";
                            tipText += "Tipp: VPN-Verbindung oder Tailscale prüfen.";
                        }
                    }
                    subSpan.textContent = tipText;
                    nasInfoMsg.appendChild(subSpan);
                }
                heroRefreshBtn.style.display = "inline-block";
            }
        } else {
            nasInfoContainer.style.display = "none";
        }
    }

    // 3. StreamFab Badge
    const sfBadge = document.getElementById("hero-streamfab-badge");
    if (sfBadge) {
        if (statusData.streamfab_downloads && statusData.streamfab_downloads.length > 0) {
            sfBadge.textContent = `${statusData.streamfab_downloads.length} Datei(en)`;
            sfBadge.className = "status-badge warning";
        } else {
            sfBadge.textContent = "Leer";
            sfBadge.className = "status-badge neutral";
        }
    }



    // 4. Fetch Stats for NAS capacity and space savings
    try {
        const statsData = await fetchStats();
        if (statsData) {
            // NAS storage
            const nasInfo = statsData.nas;
            const progress = document.getElementById("hero-nas-progress");
            const usageText = document.getElementById("hero-nas-usage-text");
            const heroStorageLabel = document.getElementById("hero-storage-label");
            if (heroStorageLabel && nasInfo) heroStorageLabel.textContent = (nasInfo.name || "Speicher") + " Speicherbelegung:";
            if (statsData.metrics_loading) {
                if (progress) progress.style.width = "0%";
                if (usageText) {
                    usageText.textContent = "Speicherdaten werden im Hintergrund berechnet...";
                }
            } else if (nasInfo && nasInfo.available && nasInfo.usage_unreliable) {
                if (progress) progress.style.width = "0%";
                if (usageText) {
                    usageText.textContent = `${formatBytes(nasInfo.free)} frei (Belegung bei Netzlaufwerk nicht ermittelbar)`;
                }
            } else if (nasInfo && nasInfo.available) {
                const pct = nasInfo.used_percent || 0;
                if (progress) {
                    progress.style.width = `${pct}%`;
                    progress.className = "progress-bar";
                    if (pct >= 90) {
                        progress.style.background = "var(--danger, #ef4444)";
                    } else if (pct >= 75) {
                        progress.style.background = "var(--warning, #f59e0b)";
                    } else {
                        progress.style.background = "var(--accent, #3b82f6)";
                    }
                }
                if (usageText) {
                    usageText.textContent = `${formatBytes(nasInfo.used)} von ${formatBytes(nasInfo.total)} belegt (${formatBytes(nasInfo.free)} frei)`;
                }
            } else {
                if (progress) progress.style.width = "0%";
                if (usageText) {
                    usageText.textContent = nasInfo && nasInfo.error ? nasInfo.error : "NAS nicht verfügbar";
                }
            }

            // Savings
            const savedSpace = document.getElementById("hero-saved-space");
            const convertedText = document.getElementById("hero-converted-files-text");
            if (statsData.stats) {
                if (savedSpace) {
                    savedSpace.textContent = formatBytes(statsData.stats.saved_bytes);
                }
                if (convertedText) {
                    convertedText.textContent = `${statsData.stats.total_files} Konvertierung(en) abgeschlossen`;
                }
            }
        }
    } catch (e) {
        console.error("Error fetching stats for homepage:", e);
    }

    // 5. Fetch YouTube Subscriptions Count
    try {
        const subsData = await fetchYoutubeSubscriptions();
        if (subsData) {
            const subs = subsData.subscriptions || [];
            const abosText = document.getElementById("hero-abos-status-text");
            if (abosText) {
                const pendingCount = subs.reduce((acc, sub) => acc + (sub.pending_videos ? sub.pending_videos.length : 0), 0);
                if (pendingCount > 0) {
                    abosText.textContent = `${subs.length} Abo(s) aktiv • ${pendingCount} Video(s) bereit`;
                } else {
                    abosText.textContent = `${subs.length} Abo(s) aktiv • Alles aktuell`;
                }
            }
        }
    } catch (e) {
        console.error("Error fetching subscriptions for homepage:", e);
    }

    // 6. Fetch Smart Inbox Suggestions
    try {
        const analyzeData = await fetchSmartInboxSuggestions();
        const cardSmartInbox = document.getElementById("card-smart-inbox");
        const smartInboxList = document.getElementById("smart-inbox-list");
        if (analyzeData && cardSmartInbox && smartInboxList) {
            const suggestions = analyzeData.suggestions || [];
            cardSmartInbox.style.display = "block";
            if (suggestions.length > 0) {
                smartInboxList.innerHTML = "";
                suggestions.forEach(item => {
                    let typeBadge = "";
                    let badgeColor = "";
                    if (item.media_type === "movie") {
                        typeBadge = `<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-film" style="height:12px; width:12px;"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M17 3v18"/><path d="M3 7h4"/><path d="M3 17h4"/><path d="M17 17h4"/><path d="M17 7h4"/><path d="M7 12h10"/></svg>Film</span>`;
                        badgeColor = "background: rgba(59, 130, 246, 0.15); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.3);";
                    } else if (item.media_type === "tv") {
                        typeBadge = `<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-tv" style="height:12px; width:12px;"><rect width="20" height="15" x="2" y="7" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>Serie</span>`;
                        badgeColor = "background: rgba(139, 92, 246, 0.15); color: #8b5cf6; border: 1px solid rgba(139, 92, 246, 0.3);";
                    } else if (item.media_type === "doku") {
                        typeBadge = `<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-leaf" style="height:12px; width:12px;"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.3 5.45-6"/></svg>Doku</span>`;
                        badgeColor = "background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);";
                    } else if (item.media_type === "anime") {
                        typeBadge = `<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles" style="height:12px; width:12px;"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>Anime</span>`;
                        badgeColor = "background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3);";
                    }

                    const reasonsHtml = (item.reasons || []).map(r => `<span style="font-size: 0.8em; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.05); color: var(--text-muted);">${escapeHTML(r)}</span>`).join(" ");

                    const isProcessing = activeProjectsProcessing && activeProjectsProcessing.has(item.project);
                    const borderStyle = isProcessing ? "border: 1px solid rgba(0, 229, 255, 0.3);" : "border: 1px solid var(--border-light);";
                    const bgStyle = isProcessing ? "background: rgba(0, 229, 255, 0.03);" : "background: rgba(255,255,255,0.02);";

                    const itemDiv = document.createElement("div");
                    itemDiv.className = "smart-inbox-item";
                    itemDiv.setAttribute("data-project", item.project);
                    itemDiv.style.cssText = `${bgStyle} ${borderStyle} border-radius: 8px; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; gap: 16px; transition: all 0.2s ease;`;
                    itemDiv.innerHTML = `
                        <div style="display: flex; flex-direction: column; gap: 6px; flex-grow: 1;">
                            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                <strong style="font-size: 1rem; color: var(--text-main);">${escapeHTML(item.project)}</strong>
                                <span style="font-size: 0.75em; padding: 2px 8px; border-radius: 12px; font-weight: 500; ${badgeColor}">${typeBadge}</span>
                                <span style="font-size: 0.8em; color: var(--text-muted);">${item.video_count} Datei(en)</span>
                            </div>
                            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px;">
                                ${reasonsHtml}
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <button class="btn btn-danger btn-sm btn-delete-smart"
                                    title="In Quarantäne verschieben"
                                    ${isProcessing ? 'disabled style="padding: 6px 10px; font-size: 11px; white-space: nowrap; font-weight: 500; height: 32px; opacity: 0.5; cursor: not-allowed;"' : 'style="padding: 6px 10px; font-size: 11px; white-space: nowrap; font-weight: 500; height: 32px;"'}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2" style="display:inline-block; vertical-align:middle; margin-right: 4px;"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>Quarantäne
                            </button>
                            <button class="btn btn-select-smart"
                                    data-media-type="${escapeHTML(item.media_type || "")}"
                                    data-suggested-query="${escapeHTML(item.suggested_query || "")}"></button>
                        </div>
                    `;

                    const btn = itemDiv.querySelector(".btn-select-smart");
                    configureSmartInboxButton(btn, item.project, isProcessing);

                    if (!isProcessing) {
                        const deleteBtn = itemDiv.querySelector(".btn-delete-smart");
                        if (deleteBtn) {
                            deleteBtn.onclick = () => {
                                if (confirm(`Möchtest du das gesamte Inbox-Projekt "${item.project}" wirklich in die Quarantäne verschieben?`)) {
                                    deleteProject(item.project);
                                }
                            };
                        }
                    }

                    smartInboxList.appendChild(itemDiv);
                });
            } else {
                smartInboxList.innerHTML = `<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:20px; background: rgba(255,255,255,0.01); border: 1px dashed var(--border-light); border-radius: 8px;">Keine verarbeitbaren Film- oder Serienprojekte in der Inbox gefunden.</div>`;
            }
        }
    } catch (e) {
        console.error("Error fetching smart inbox suggestions:", e);
    }
}

function handleSmartInboxClick(projectName, mediaType, suggestionTitle) {
    selectProject(projectName);

    setTimeout(() => {
        currentProjectSuggestedQuery = suggestionTitle;
        currentProjectIsDoku = (mediaType === 'doku');

        if (mediaType === 'movie' || mediaType === 'doku') {
            const card = document.getElementById("mode-movie");
            if (card) card.click();
        } else {
            const card = document.getElementById("mode-series");
            if (card) {
                card.click();

                setTimeout(() => {
                    const animeCheck = document.getElementById("series-is-anime");
                    if (animeCheck) {
                        animeCheck.checked = (mediaType === 'anime');
                        animeCheck.dispatchEvent(new Event('change'));
                    }
                }, 50);
            }
        }
    }, 100);
}

function handleHeroYtDownload() {
    const heroInput = document.getElementById("hero-yt-url");
    if (!heroInput) return;
    const url = heroInput.value.trim();
    if (!url) {
        alert("Bitte eine gültige YouTube-/Mediathek-URL eingeben!");
        return;
    }

    // Copy to downloader input
    const ytInput = document.getElementById("yt-url");
    if (ytInput) {
        ytInput.value = url;
    }

    // Clear hero input
    heroInput.value = "";

    // Navigate to YouTube view
    document.querySelectorAll(".view-panel").forEach(p => {
        p.classList.add("hidden");
        p.classList.remove("active");
    });
    const ytView = document.getElementById("view-youtube");
    if (ytView) {
        ytView.classList.remove("hidden");
        ytView.classList.add("active");
    }
    // Remove active sidebar project selections
    document.querySelectorAll(".project-item").forEach(el => el.classList.remove("active"));

    scrollToDetailTop();

    // Call analyseYtLink()
    analyseYtLink();
}




async function populateLocalProfilesDropdown() {
    const select = document.getElementById("series-local-profile-select");
    if (!select) return;

    try {
        const res = await fetch("/api/profiles");
        const data = await res.json();

        allLocalProfiles = [];
        if (data.profiles && data.profiles.length > 0) {
            // Sort by show name
            data.profiles.sort((a, b) => {
                const nameA = a.data.show_name || a.filename;
                const nameB = b.data.show_name || b.filename;
                return nameA.localeCompare(nameB);
            });

            data.profiles.forEach(p => {
                const displayName = p.data.show_name || p.filename.replace(".json", "");
                p.data.show_name = displayName;
                p.data.filename = p.filename;
                allLocalProfiles.push(p.data);
            });
        }

        renderLocalProfilesDropdown(allLocalProfiles);
    } catch (e) {
        console.error("Fehler beim Laden lokaler Profile:", e);
    }
}

function renderLocalProfilesDropdown(profiles) {
    const select = document.getElementById("series-local-profile-select");
    if (!select) return;

    let html = "<option value=\"\">-- Lokales Profil wählen --</option>";
    profiles.forEach(p => {
        html += `<option value='${JSON.stringify(p).replace(/'/g, "&#39;")}' data-name="${p.show_name.toLowerCase()}">${p.show_name}</option>`;
    });
    select.innerHTML = html;
}

document.addEventListener("DOMContentLoaded", () => {
    populateLocalProfilesDropdown();

    const select = document.getElementById("series-local-profile-select");
    if (select) {
        select.addEventListener("change", (e) => {
            if (!e.target.value) return;
            try {
                const profileData = JSON.parse(e.target.value);
                const showObj = {
                    id: profileData.show_id,
                    provider: profileData.provider || "tmdb",
                    name: profileData.show_name || "",
                    year: "",
                    plot: profileData.plot || "",
                    poster: profileData.poster || ""
                };

                const resultsContainer = document.getElementById("series-search-results");
                if (resultsContainer) resultsContainer.innerHTML = "";

                selectShow(showObj);
            } catch(err) {
                console.error("Fehler beim Profil-Auswählen", err);
            }
        });
    }

    // Fuzzy-Suche für Profile
    const searchInput = document.getElementById("series-local-profile-search");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (!query) {
                renderLocalProfilesDropdown(allLocalProfiles);
                return;
            }

            // Fuzzy match helper: true if all query characters appear in string in relative order
            const fuzzyMatch = (str, q) => {
                str = str.toLowerCase();
                if (str.includes(q)) return true;
                let qIdx = 0;
                for (let i = 0; i < str.length; i++) {
                    if (str[i] === q[qIdx]) {
                        qIdx++;
                    }
                    if (qIdx === q.length) return true;
                }
                return false;
            };

            const filtered = allLocalProfiles.filter(p => {
                const displayName = p.show_name || "";
                return fuzzyMatch(displayName, query);
            });

            renderLocalProfilesDropdown(filtered);
        });
    }
});



// ==========================================================================
// Feature 3: NAS Bibliotheks-Check (Health Dashboard)
// ==========================================================================
let healthPollTimer = null;
window.healthGroupMode = "type";

const HEALTH_TYPE_LABELS = {
    missing_age_rating: "Fehlende Altersfreigabe",
    invalid_age_rating: "Ungültige Altersfreigabe",
    nested_duplicate: "Doppelte Ordnerstruktur",
    genre_container: "Sammelordner",
    bad_folder_name: "Ungültiger Ordnername",
    name_mismatch: "Namensabweichung (Ordner vs. Datei)",
    missing_nfo: "Fehlende Metadaten",
    unreadable_nfo: "NFO unlesbar",
    incomplete_nfo: "Metadaten unvollständig",
    episode_gap: "Episodenlücke in Staffel",
    empty_folder: "Leerer Ordner",
    no_video: "Keine Videodatei im Ordner",
    codec_inconsistency: "Uneinheitliche Codecs in Staffel",
    small_file: "Verdächtig kleine Videodatei",
    missing_season_poster: "Fehlendes Staffelposter",
    missing_poster: "Fehlendes Poster / Primärbild",
    missing_backdrop: "Fehlendes Hintergrundbild / Backdrop",
    missing_logo: "Fehlendes Logo / Clearlogo",
    missing_banner: "Fehlendes Banner",
    inconsistent_naming: "Uneinheitliche Benennung in Serie"
};

const HEALTH_RECOMMENDED_ACTIONS = {
    missing_age_rating: "Altersfreigabe (FSK-Stufe) über die NFO-Datei zuweisen.",
    invalid_age_rating: "Altersfreigabe (FSK-Stufe) über die NFO-Datei korrigieren.",
    nested_duplicate: "Doppelte Ordnerverschachtelung auflösen.",
    genre_container: "Sammelordner auflösen (Inhalte eine Ebene nach oben verschieben).",
    bad_folder_name: "Ordnername an das Standardformat (Name (Jahr)) angleichen.",
    name_mismatch: "Ordnername und Dateiname aneinander angleichen.",
    missing_nfo: "NFO Agent starten, um Metadaten automatisch zu generieren.",
    incomplete_nfo: "NFO Agent starten, um Metadaten über die Review-UI neu zu generieren.",
    episode_gap: "Fehlende Episoden überprüfen oder NFO/Video-Mapping korrigieren.",
    empty_folder: "Leeren Ordner löschen (über 'Ordner bereinigen').",
    no_video: "Videodatei hinzufügen oder Ordner bereinigen.",
    codec_inconsistency: "Videos in einheitliche Formate (H.265) transkodieren.",
    small_file: "Dateigröße prüfen (Gefahr eines unvollständigen Downloads).",
    missing_season_poster: "Staffelposter hinzufügen.",
    missing_poster: "Filmplakat / Primärbild hinzufügen.",
    missing_backdrop: "Hintergrundbild / Backdrop hinzufügen.",
    missing_logo: "Logo / Clearlogo hinzufügen.",
    missing_banner: "Banner hinzufügen.",
    inconsistent_naming: "Seriendateien einheitlich benennen (Renaming-Tool nutzen)."
};

const HEALTH_MEDIA_NFO_TYPES = new Set(["missing_nfo", "incomplete_nfo", "unreadable_nfo"]);
const HEALTH_MEDIA_ARTWORK_TYPES = new Set(["missing_season_poster", "missing_poster", "missing_backdrop", "missing_logo", "missing_banner"]);
const HEALTH_MEDIA_FSK_TYPES = new Set(["missing_age_rating", "invalid_age_rating"]);
const HEALTH_MEDIA_METADATA_TYPES = new Set([...HEALTH_MEDIA_NFO_TYPES, ...HEALTH_MEDIA_FSK_TYPES]);

function getIssuesForKeys(issueKeys, issuesByKey) {
    return [...new Set(issueKeys || [])].map((key) => issuesByKey[key]).filter(Boolean);
}

function renderMediaSummaryChip(label, tone = "neutral") {
    return `<span class="health-media-chip health-media-chip-${tone}">${escapeHTML(label)}</span>`;
}

function countHealthMediaIssues(issues, typeSet) {
    return issues.filter((issue) => typeSet.has(issue.type)).length;
}

function formatFskSummaryValue(value) {
    return String(value || "").trim().replace(/^FSK\s*/i, "");
}

function getSeriesFskSummary(series, totalEpisodes, affectedEpisodes, showFskActionable) {
    const episodeLabel = affectedEpisodes === 1 ? "Folge" : "Folgen";
    if (!series.has_nfo || ["nfo_missing", "unreadable"].includes(series.fsk_status)) {
        const episodeSuffix = affectedEpisodes > 0 ? ` + ${affectedEpisodes} ${episodeLabel}` : "";
        return { label: `FSK: Serien-NFO${episodeSuffix} prüfen`, tone: "danger" };
    }
    if (showFskActionable && affectedEpisodes > 0) {
        return { label: `FSK: Serie + ${affectedEpisodes} ${episodeLabel} prüfen`, tone: "warning" };
    }
    if (showFskActionable) {
        return { label: "FSK: Serie prüfen", tone: "warning" };
    }
    if (affectedEpisodes > 0) {
        const totalLabel = totalEpisodes > 0 ? ` von ${totalEpisodes}` : "";
        return { label: `FSK: ${affectedEpisodes}${totalLabel} ${episodeLabel} prüfen`, tone: "warning" };
    }

    const currentFsk = formatFskSummaryValue(series.current_fsk);
    return { label: currentFsk ? `FSK: ${currentFsk}` : "FSK: korrekt", tone: "success" };
}

function getMovieFskSummary(movie, hasNfoIssue) {
    if (hasNfoIssue || ["nfo_missing", "unreadable"].includes(movie.fsk_status)) {
        return { label: "FSK: nicht prüfbar", tone: "danger" };
    }
    if (movie.fsk_status === "missing_fsk") {
        return { label: "FSK: fehlt", tone: "warning" };
    }
    if (movie.fsk_status === "invalid_fsk") {
        const currentFsk = formatFskSummaryValue(movie.current_fsk);
        return { label: currentFsk ? `FSK: ${currentFsk} ungültig` : "FSK: ungültig", tone: "warning" };
    }

    const currentFsk = formatFskSummaryValue(movie.current_fsk);
    return { label: currentFsk ? `FSK: ${currentFsk}` : "FSK: korrekt", tone: "success" };
}

function getHealthIssueGroup(issue) {
    if (issue && issue.group) return issue.group;
    if (issue && HEALTH_MEDIA_METADATA_TYPES.has(issue.type)) return "metadata";
    if (issue && HEALTH_MEDIA_ARTWORK_TYPES.has(issue.type)) return "artwork";
    if (issue && ["small_file", "no_video", "empty_folder", "codec_inconsistency"].includes(issue.type)) return "files";
    if (issue && ["episode_gap", "nested_duplicate", "genre_container", "bad_folder_name", "name_mismatch", "inconsistent_naming"].includes(issue.type)) return "structure";
    return "other";
}

function hasMetadataProblem(issues, fskStatus = "") {
    return issues.some((issue) => getHealthIssueGroup(issue) === "metadata")
        || ["nfo_missing", "unreadable", "missing_fsk", "invalid_fsk"].includes(fskStatus);
}

function getMetadataProblemLabels(issues, fskStatus = "") {
    const labels = issues
        .filter((issue) => getHealthIssueGroup(issue) === "metadata")
        .map((issue) => issue.label || HEALTH_TYPE_LABELS[issue.type] || issue.type);
    const hasFskIssue = issues.some((issue) => HEALTH_MEDIA_FSK_TYPES.has(issue.type));
    if (!hasFskIssue && fskStatus === "missing_fsk") labels.push("FSK fehlt");
    if (!hasFskIssue && fskStatus === "invalid_fsk") labels.push("FSK ungültig");
    if (fskStatus === "nfo_missing" && !labels.length) labels.push("Fehlende Metadaten");
    if (fskStatus === "unreadable" && !labels.length) labels.push("Metadaten nicht lesbar");
    return [...new Set(labels)];
}

function renderHealthMetadataButton(path, editMode, episodeFile = "", label = "Metadaten bearbeiten") {
    const episodeData = episodeFile ? ` data-episode-file="${escapeHTML(episodeFile)}"` : "";
    return `<button class="btn btn-accent btn-sm health-nfo-agent" data-path="${escapeHTML(path)}" data-edit-mode="${escapeHTML(editMode)}"${episodeData}>${escapeHTML(label)}</button>`;
}

function renderHealthIgnoreButton(scopeKind, scopePath) {
    return `<button class="btn btn-secondary btn-sm health-ignore-scope" data-scope-kind="${escapeHTML(scopeKind)}" data-scope-path="${escapeHTML(scopePath)}">Hinweise ignorieren</button>`;
}

function renderHealthIssueRows(issues) {
    return issues.map((issue) => {
        const label = issue.label || HEALTH_TYPE_LABELS[issue.type] || issue.type;
        const missingFields = Array.isArray(issue.missing_fields) && issue.missing_fields.length
            ? `Fehlende Felder: ${issue.missing_fields.join(", ")}`
            : "";
        return `<div class="health-media-detail-row health-media-finding-row">
                    <span>${escapeHTML(label)}</span>
                    <span class="text-muted">${escapeHTML(missingFields || issue.message || "")}</span>
                </div>`;
    }).join("");
}

// Active tab of the media view; persists across status re-renders.
let healthMediaActiveTab = "series";

function renderHealthMediaView(data, openTypes) {
    const seriesList = data.media_structure ? data.media_structure.series || [] : [];
    const moviesList = data.media_structure ? data.media_structure.movies || [] : [];
    const issuesByKey = {};
    (data.issues || []).forEach((issue) => { issuesByKey[issue.key] = issue; });
    const issuesFor = (item) => getIssuesForKeys(item && item.issue_keys ? item.issue_keys : [], issuesByKey);
    const issueCountForGroup = (issues, group) => issues.filter((issue) => getHealthIssueGroup(issue) === group).length;
    let html = "";
    let renderedSeriesCount = 0;

    seriesList.forEach((series) => {
        const showIssues = issuesFor(series);
        const seasons = series.seasons || [];
        const allEpisodes = seasons.flatMap((season) => season.episodes || []);
        const episodeEntries = allEpisodes.map((episode) => ({ episode, issues: issuesFor(episode) }));
        const affectedEpisodes = episodeEntries.filter(({ episode, issues }) => issues.length || hasMetadataProblem(issues, episode.fsk_status));
        const metadataEpisodes = episodeEntries.filter(({ episode, issues }) => hasMetadataProblem(issues, episode.fsk_status));
        const allSeriesIssues = [...showIssues];
        seasons.forEach((season) => {
            allSeriesIssues.push(...issuesFor(season));
            (season.episodes || []).forEach((episode) => allSeriesIssues.push(...issuesFor(episode)));
        });
        const uniqueSeriesIssues = [...new Map(allSeriesIssues.map((issue) => [issue.key, issue])).values()];
        const showMetadataProblem = hasMetadataProblem(showIssues, series.fsk_status);
        if (!showMetadataProblem && affectedEpisodes.length === 0 && uniqueSeriesIssues.length === 0) return;

        renderedSeriesCount++;
        const summaryChips = [];
        if (showMetadataProblem) summaryChips.push(renderMediaSummaryChip("Serien-Metadaten: prüfen", "danger"));
        if (metadataEpisodes.length > 0) {
            summaryChips.push(renderMediaSummaryChip(
                `Metadaten: ${metadataEpisodes.length} von ${allEpisodes.length} ${metadataEpisodes.length === 1 ? "Folge" : "Folgen"} unvollständig`,
                "warning"
            ));
        }
        const artworkCount = issueCountForGroup(uniqueSeriesIssues, "artwork");
        const fileCount = issueCountForGroup(uniqueSeriesIssues, "files");
        const structureCount = issueCountForGroup(uniqueSeriesIssues, "structure");
        if (artworkCount) summaryChips.push(renderMediaSummaryChip(`Artwork: ${artworkCount} fehlen`, "warning"));
        if (fileCount) summaryChips.push(renderMediaSummaryChip(`Dateien: ${fileCount} prüfen`, "warning"));
        if (structureCount) summaryChips.push(renderMediaSummaryChip(`Struktur: ${structureCount} prüfen`, "warning"));

        const isShowOpen = openTypes.includes(`show:${series.path}`);
        html += `<details class="health-media-card" data-show-path="${escapeHTML(series.path)}" ${isShowOpen ? "open" : ""}>
                    <summary class="health-media-summary">
                        <div class="health-media-summary-main"><span>${escapeHTML(series.name)}</span></div>
                        <div class="health-media-summary-chips">${summaryChips.join("")}</div>
                        <span class="health-media-disclosure"><span class="health-media-disclosure-closed">Details anzeigen</span><span class="health-media-disclosure-open">Details schließen</span></span>
                    </summary>
                    <div class="health-media-details">
                        <div class="health-media-scope-action">
                            <span><strong>Gesamte Serie</strong><small>Serien-NFO, Staffeln und Folgen gemeinsam prüfen</small></span>
                            <div class="health-media-row-actions">
                                ${renderHealthIgnoreButton("series", series.path)}
                                ${renderHealthMetadataButton(series.path, "full", "", "Ganze Serie bearbeiten")}
                            </div>
                        </div>`;

        if (showMetadataProblem) {
            const showLabels = getMetadataProblemLabels(showIssues, series.fsk_status);
            const agentPath = showIssues.find((issue) => issue.agent_path)?.agent_path || series.path;
            html += `<div class="health-media-detail-row health-media-primary-row">
                        <span class="health-media-file">📄 tvshow.nfo</span>
                        <div class="health-media-row-actions">
                            <span class="text-danger">${escapeHTML(showLabels.join(" · ") || "Metadaten unvollständig")}</span>
                            ${renderHealthMetadataButton(agentPath, "series")}
                        </div>
                     </div>`;
        }
        html += renderHealthIssueRows(showIssues.filter((issue) => getHealthIssueGroup(issue) !== "metadata"));

        seasons.forEach((season) => {
            const seasonIssues = issuesFor(season);
            const episodeEntriesInSeason = (season.episodes || []).map((episode) => ({ episode, issues: issuesFor(episode) }));
            const affectedInSeason = episodeEntriesInSeason.filter(({ episode, issues }) => issues.length || hasMetadataProblem(issues, episode.fsk_status));
            const metadataInSeason = episodeEntriesInSeason.filter(({ episode, issues }) => hasMetadataProblem(issues, episode.fsk_status));
            if (!seasonIssues.length && !affectedInSeason.length) return;

            const seasonChips = [];
            if (metadataInSeason.length) {
                seasonChips.push(renderMediaSummaryChip(
                    `Metadaten: ${metadataInSeason.length} von ${episodeEntriesInSeason.length} ${metadataInSeason.length === 1 ? "Folge" : "Folgen"} unvollständig`,
                    "warning"
                ));
            }
            const seasonArtwork = issueCountForGroup(seasonIssues, "artwork");
            const seasonFiles = issueCountForGroup(seasonIssues, "files");
            const seasonStructure = issueCountForGroup(seasonIssues, "structure");
            if (seasonArtwork) seasonChips.push(renderMediaSummaryChip(`Artwork: ${seasonArtwork} fehlt`, "warning"));
            if (seasonFiles) seasonChips.push(renderMediaSummaryChip(`Dateien: ${seasonFiles} prüfen`, "warning"));
            if (seasonStructure) seasonChips.push(renderMediaSummaryChip(`Struktur: ${seasonStructure} prüfen`, "warning"));

            html += `<details class="health-media-season" data-season-path="${escapeHTML(season.path)}">
                        <summary class="health-media-nested-summary">
                            <span class="health-media-nested-title">📁 ${escapeHTML(season.name)}</span>
                            <span class="health-media-summary-chips">${seasonChips.join("")}</span>
                            <span class="health-media-nested-disclosure">Staffel anzeigen</span>
                        </summary>
                        <div class="health-media-nested-body">
                            <div class="health-media-scope-action">
                                <span><strong>${escapeHTML(season.name)}</strong><small>Optionale Staffel-NFO und betroffene Folgen prüfen</small></span>
                                <div class="health-media-row-actions">
                                    ${renderHealthIgnoreButton("season", season.path)}
                                    ${renderHealthMetadataButton(season.path, "season", "", "Staffel bearbeiten")}
                                </div>
                            </div>
                            ${renderHealthIssueRows(seasonIssues)}`;

            if (affectedInSeason.length) {
                html += `<div class="health-media-episode-heading">Folgen</div>`;
            }
            affectedInSeason.forEach(({ episode, issues }) => {
                const metadataProblem = hasMetadataProblem(issues, episode.fsk_status);
                const labels = getMetadataProblemLabels(issues, episode.fsk_status);
                const episodeLabel = labels.length ? labels.join(" · ") : `${issues.length} ${issues.length === 1 ? "Hinweis" : "Hinweise"}`;
                const agentPath = issues.find((issue) => issue.agent_path)?.agent_path || season.path;
                html += `<details class="health-media-episode" data-episode-path="${escapeHTML(episode.path || episode.nfo_path || episode.name)}">
                            <summary class="health-media-nested-summary health-media-episode-summary">
                                <span class="health-media-nested-title">📄 ${escapeHTML(episode.name)}</span>
                                <span class="health-media-chip ${metadataProblem ? "health-media-chip-warning" : ""}">${escapeHTML(episodeLabel)}</span>
                                <span class="health-media-nested-disclosure">Folge anzeigen</span>
                            </summary>
                            <div class="health-media-nested-body">
                                ${renderHealthIssueRows(issues)}
                                <div class="health-media-episode-action">
                                    ${renderHealthIgnoreButton("episode", episode.path || episode.nfo_path || episode.name)}
                                    ${metadataProblem ? renderHealthMetadataButton(agentPath, "episode", episode.name) : ""}
                                </div>
                            </div>
                         </details>`;
            });
            html += `</div></details>`;
        });
        html += `</div></details>`;
    });

    if (!renderedSeriesCount) html += `<p class="text-muted health-media-empty">Keine auffälligen Serien gefunden.</p>`;

    const seriesHtml = html;
    html = "";
    let renderedMoviesCount = 0;
    moviesList.forEach((movie) => {
        const movieIssues = issuesFor(movie);
        const metadataProblem = hasMetadataProblem(movieIssues, movie.fsk_status);
        if (!movieIssues.length && !metadataProblem) return;
        renderedMoviesCount++;
        const chips = [];
        if (metadataProblem) chips.push(renderMediaSummaryChip("Metadaten: prüfen", "danger"));
        const artworkCount = issueCountForGroup(movieIssues, "artwork");
        const fileCount = issueCountForGroup(movieIssues, "files");
        if (artworkCount) chips.push(renderMediaSummaryChip(`Artwork: ${artworkCount} fehlen`, "warning"));
        if (fileCount) chips.push(renderMediaSummaryChip(`Dateien: ${fileCount} prüfen`, "warning"));
        const isMovieOpen = openTypes.includes(`movie:${movie.path}`);
        html += `<details class="health-media-card" data-movie-path="${escapeHTML(movie.path)}" ${isMovieOpen ? "open" : ""}>
                    <summary class="health-media-summary">
                        <div class="health-media-summary-main"><span>${escapeHTML(movie.name)}</span></div>
                        <div class="health-media-summary-chips">${chips.join("")}</div>
                        <span class="health-media-disclosure"><span class="health-media-disclosure-closed">Details anzeigen</span><span class="health-media-disclosure-open">Details schließen</span></span>
                    </summary>
                    <div class="health-media-details">
                        <div class="health-media-episode-action">${renderHealthIgnoreButton("movie", movie.path)}</div>`;
        if (metadataProblem) {
            const labels = getMetadataProblemLabels(movieIssues, movie.fsk_status);
            const agentPath = movieIssues.find((issue) => issue.agent_path)?.agent_path || movie.path;
            html += `<div class="health-media-detail-row health-media-primary-row">
                        <span class="health-media-file">📄 ${escapeHTML(osBasename(movie.nfo_path || "movie.nfo"))}</span>
                        <div class="health-media-row-actions">
                            <span class="text-danger">${escapeHTML(labels.join(" · ") || "Metadaten unvollständig")}</span>
                            ${renderHealthMetadataButton(agentPath, "full")}
                        </div>
                     </div>`;
        }
        html += renderHealthIssueRows(movieIssues.filter((issue) => getHealthIssueGroup(issue) !== "metadata"));
        html += `</div></details>`;
    });
    if (!renderedMoviesCount) html += `<p class="text-muted health-media-empty">Keine auffälligen Filme gefunden.</p>`;
    const moviesHtml = html;

    const activeTab = healthMediaActiveTab === "movies" ? "movies" : "series";
    return `<div class="health-media-tabs" role="tablist">
                <button type="button" role="tab" class="health-media-tab ${activeTab === "series" ? "active" : ""}" data-media-tab="series" aria-selected="${activeTab === "series"}">Serien (${renderedSeriesCount})</button>
                <button type="button" role="tab" class="health-media-tab ${activeTab === "movies" ? "active" : ""}" data-media-tab="movies" aria-selected="${activeTab === "movies"}">Filme (${renderedMoviesCount})</button>
            </div>
            <div class="health-media-tab-panel ${activeTab === "series" ? "" : "hidden"}" data-media-panel="series">${seriesHtml}</div>
            <div class="health-media-tab-panel ${activeTab === "movies" ? "" : "hidden"}" data-media-panel="movies">${moviesHtml}</div>`;
}

function switchHealthMediaTab(tabName) {
    healthMediaActiveTab = tabName === "movies" ? "movies" : "series";
    document.querySelectorAll(".health-media-tab").forEach((button) => {
        const isActive = button.getAttribute("data-media-tab") === healthMediaActiveTab;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-selected", String(isActive));
    });
    document.querySelectorAll(".health-media-tab-panel").forEach((panel) => {
        panel.classList.toggle("hidden", panel.getAttribute("data-media-panel") !== healthMediaActiveTab);
    });
}

window.switchLibraryTab = function(tabId) {
    document.querySelectorAll(".library-tab-content").forEach(el => el.classList.add("hidden"));
    const tabEl = document.getElementById("library-tab-" + tabId);
    if (tabEl) tabEl.classList.remove("hidden");

    document.querySelectorAll("#view-library .btn-tab").forEach(btn => {
        btn.classList.remove("active");
        btn.style.borderBottomColor = "transparent";
        btn.style.color = "var(--text-muted)";
    });
    const activeBtn = document.getElementById("tab-btn-" + tabId);
    if (activeBtn) {
        activeBtn.classList.add("active");
        activeBtn.style.borderBottomColor = "var(--accent)";
        activeBtn.style.color = "var(--text-main)";
    }

    const subtabsContainer = document.getElementById("library-cleanup-subtabs");
    if (subtabsContainer) {
        if (tabId === "cleanup") {
            subtabsContainer.classList.remove("hidden");
        } else {
            subtabsContainer.classList.add("hidden");
        }
    }
};

window.switchLibrarySubTab = function(subTabId) {
    document.querySelectorAll(".library-subtab-content-panel").forEach(el => el.classList.add("hidden"));
    const subTabEl = document.getElementById("library-subtab-" + subTabId);
    if (subTabEl) subTabEl.classList.remove("hidden");

    document.querySelectorAll("#view-library .btn-subtab").forEach(btn => {
        btn.classList.remove("active");
        btn.style.background = "none";
        btn.style.color = "var(--text-muted)";
    });
    const activeBtn = document.getElementById("subtab-btn-" + subTabId);
    if (activeBtn) {
        activeBtn.classList.add("active");
        activeBtn.style.background = "var(--accent)";
        activeBtn.style.color = "white";
    }
};

function initHealthDashboard() {
    const btn = document.getElementById("btn-health-scan");
    if (btn) {
        btn.addEventListener("click", () => {
            // Starte echten Bibliothekscheck und Duplikate-Check parallel
            startHealthScan();
            startDuplicateScan();
        });
    }
    const cancelBtn = document.getElementById("btn-health-cancel");
    if (cancelBtn) {
        cancelBtn.addEventListener("click", cancelHealthScan);
    }

    const btnType = document.getElementById("btn-health-group-type");
    const btnMedia = document.getElementById("btn-health-group-media");
    if (btnType && btnMedia) {
        btnType.addEventListener("click", () => {
            if (window.healthGroupMode !== "type") {
                window.healthGroupMode = "type";
                btnType.classList.add("active");
                btnMedia.classList.remove("active");
                pollHealthStatus(false);
            }
        });
        btnMedia.addEventListener("click", () => {
            if (window.healthGroupMode !== "media") {
                window.healthGroupMode = "media";
                btnMedia.classList.add("active");
                btnType.classList.remove("active");
                pollHealthStatus(false);
            }
        });
    }

    // Top-Level Tabs Klick-Handler
    document.getElementById("tab-btn-overview")?.addEventListener("click", () => window.switchLibraryTab("overview"));
    document.getElementById("tab-btn-cleanup")?.addEventListener("click", () => window.switchLibraryTab("cleanup"));
    document.getElementById("tab-btn-tools")?.addEventListener("click", () => window.switchLibraryTab("tools"));

    // Sub-Tabs Klick-Handler
    document.getElementById("subtab-btn-structure")?.addEventListener("click", () => window.switchLibrarySubTab("structure"));
    document.getElementById("subtab-btn-media")?.addEventListener("click", () => window.switchLibrarySubTab("media"));
    document.getElementById("subtab-btn-duplicates")?.addEventListener("click", () => window.switchLibrarySubTab("duplicates"));

    // Manuelle Werkzeuge Ordner-Picker
    document.getElementById("btn-lib-tools-browse")?.addEventListener("click", () => {
        const input = document.getElementById("lib-tools-manual-path");
        const startPath = input ? input.value : "";
        window.openFolderPicker(startPath, "", null, "Ordner für Werkzeuge auswählen", (selectedPath) => {
            if (input) input.value = selectedPath;
        });
    });

    // Lade Kategorien dynamisch
    loadHealthCategories();
    // Vorhandenes (gecachtes) Ergebnis laden
    pollHealthStatus(false);
}

async function loadHealthCategories() {
    const container = document.getElementById("health-categories-container");
    if (!container) return;
    try {
        const res = await fetch("/api/settings");
        if (!res.ok) {
            container.innerHTML = `<span style="font-size:0.85em; color:#ef4444; font-style:italic;">Fehler beim Laden der Kategorien.</span>`;
            return;
        }
        const settings = await res.json();
        const categories = (settings.sync_categories || []).filter(cat => cat.nas_sub && cat.nas_sub.trim() !== "");
        const btn = document.getElementById("btn-health-scan");

        if (categories.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; display:flex; flex-direction:column; align-items:center; gap:8px; padding:20px; background:rgba(255,255,255,0.02); border:1px dashed var(--border-light); border-radius:6px; text-align:center; width:100%;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-open" style="color:var(--text-muted);"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>
                    <span style="font-size:0.9rem; color:var(--text-muted); font-weight:500;">Keine Sync-Kategorien konfiguriert</span>
                    <span style="font-size:0.8rem; color:var(--text-muted); max-width:320px;">Du hast noch keine Kategorien mit einem NAS-Pfad hinterlegt. Richte sie unter <a href="#" onclick="document.getElementById('nav-settings-dashboard')?.click(); setTimeout(() => { document.querySelector('[data-settings-tab=tab-sync]')?.click(); document.getElementById('settings-sync-categories-section')?.scrollIntoView({ behavior: 'smooth' }); }, 100); return false;" style="color:var(--color-primary); text-decoration:underline;">Einstellungen > Speicher & Sync</a> ein.</span>
                </div>
            `.trim();
            if (btn) {
                btn.disabled = true;
                btn.title = "Bitte konfiguriere zuerst mindestens eine Sync-Kategorie mit NAS-Pfad.";
            }
            return;
        }

        if (btn && btn.disabled && btn.title === "Bitte konfiguriere zuerst mindestens eine Sync-Kategorie mit NAS-Pfad." && !btn.innerHTML.includes("Scan läuft")) {
            btn.disabled = false;
            btn.title = "";
        }

        container.innerHTML = categories.map(cat => {
            const id = cat.id || "";
            const name = cat.name || "Unbenannt";
            return `
                <label class="checkbox-container" style="font-size:0.85em; color:var(--text-muted); margin:0;">
                    <input type="checkbox" class="health-category-checkbox" value="${escapeHTML(id)}" checked>
                    <span class="checkmark"></span> ${escapeHTML(name)}
                </label>
            `.trim();
        }).join("");
    } catch (e) {
        console.error("Kategorien für Health Scan konnten nicht geladen werden:", e);
        container.innerHTML = `<span style="font-size:0.85em; color:#ef4444; font-style:italic;">Fehler beim Laden der Kategorien.</span>`;
    }
}

async function startHealthScan() {
    const btn = document.getElementById("btn-health-scan");
    const deepCheck = document.getElementById("health-option-deep");
    const deep = deepCheck ? deepCheck.checked : false;

    // Ausgewählte Kategorien auslesen
    const checkboxes = document.querySelectorAll(".health-category-checkbox");
    if (checkboxes.length === 0) {
        setHealthStatusText("Keine Sync-Kategorien konfiguriert. Bitte richte diese unter Einstellungen > Speicher & Sync ein.");
        return;
    }

    const categoryIds = [];
    checkboxes.forEach(cb => {
        if (cb.checked) {
            categoryIds.push(cb.value);
        }
    });

    if (categoryIds.length === 0) {
        setHealthStatusText("Bitte mindestens eine Kategorie auswählen.");
        return;
    }

    const payload = { deep: deep };
    if (checkboxes.length > 0) {
        payload.category_ids = categoryIds;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = "Vorbereiten...";
    }
    setHealthStatusText("Scan wird vorbereitet. NAS wird geprüft, bitte warten...");

    try {
        const res = await fetch("/api/nas/health-scan", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
            setHealthStatusText(data.error || data.message || `Fehler ${res.status}: Scan konnte nicht gestartet werden.`);
            resetHealthScanButton();
            return;
        }
        if (data.started === false) {
            // Läuft bereits -> einfach weiterpollen
            setHealthStatusText(data.message || "Ein Scan läuft bereits.");
        }
        pollHealthStatus(true);
    } catch (e) {
        console.error("Health-Scan konnte nicht gestartet werden:", e);
        setHealthStatusText("Fehler: Scan konnte nicht gestartet werden.");
        resetHealthScanButton();
    }
}

function resetHealthScanButton() {
    const btn = document.getElementById("btn-health-scan");
    if (btn) {
        const checkboxes = document.querySelectorAll(".health-category-checkbox");
        if (checkboxes.length === 0) {
            btn.disabled = true;
            btn.title = "Bitte konfiguriere zuerst mindestens eine Sync-Kategorie mit NAS-Pfad.";
        } else {
            btn.disabled = false;
            btn.title = "";
        }
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search" style="display:inline-block; vertical-align:middle; margin-right: 8px;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg> Bibliothek prüfen`;
    }
}

async function cancelHealthScan() {
    const cancelBtn = document.getElementById("btn-health-cancel");
    if (cancelBtn) {
        cancelBtn.disabled = true;
        cancelBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square" style="display:inline-block; vertical-align:middle; margin-right: 8px;"><rect width="18" height="18" x="3" y="3" rx="2"/></svg> Abbruch...`;
    }
    try {
        const res = await fetch("/api/nas/health-cancel", { method: "POST" });
        const data = await res.json();
        if (data.stopped) {
            setHealthStatusText("Abbruch angefordert...");
        }
    } catch (e) {
        console.error("Health-Scan konnte nicht abgebrochen werden:", e);
    }
}

function setHealthStatusText(txt) {
    const el = document.getElementById("health-scan-status");
    if (el) el.textContent = txt;
}

async function pollHealthStatus(keepPolling) {
    try {
        const res = await fetch("/api/nas/health-status");
        if (!res.ok) return;
        const data = await res.json();
        renderHealthStatus(data);

        const running = data.status === "running";
        const btn = document.getElementById("btn-health-scan");
        const cancelBtn = document.getElementById("btn-health-cancel");
        if (btn) {
            if (running) {
                btn.disabled = true;
                btn.innerHTML = "Scan läuft...";
            } else {
                resetHealthScanButton();
            }
        }

        if (cancelBtn) {
            cancelBtn.style.display = running ? "inline-block" : "none";
            if (!running) {
                cancelBtn.disabled = false;
                cancelBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square" style="display:inline-block; vertical-align:middle; margin-right: 8px;"><rect width="18" height="18" x="3" y="3" rx="2"/></svg> Abbrechen`;
            }
        }

        if (running) {
            // Weiterpollen, solange der Scan läuft
            clearTimeout(healthPollTimer);
            healthPollTimer = setTimeout(() => pollHealthStatus(true), 2000);
        }
    } catch (e) {
        console.error("Health-Status konnte nicht geladen werden:", e);
    }
}

function runContextTool(toolType, path) {
    if (toolType === "tool_nfo_agent") {
        openNfoAgentModal(path);
    } else if (toolType === "tool_batch_convert") {
        openToolRunnerModal("tool_batch_convert", "H.265 Batch-Konvertierung", "Videos im gewählten Verzeichnis in das platzsparende H.265 (HEVC) Format konvertieren.", true, path);
    } else if (toolType === "tool_clean") {
        runToolClean(path);
    }
}

function renderHealthStatus(data) {
    window.currentHealthStatusData = data;
    const statusEl = document.getElementById("health-scan-status");
    const progWrap = document.getElementById("health-progress-wrap");
    const progBar = document.getElementById("health-progress-bar");
    const summaryEl = document.getElementById("health-summary");
    const issuesEl = document.getElementById("health-issues");
    const groupControls = document.getElementById("health-group-controls");
    if (!statusEl || !summaryEl || !issuesEl) return;

    if (data.status === "running") {
        statusEl.textContent = "Scan läuft...";
        if (progWrap) progWrap.style.display = "block";
        if (progBar) progBar.style.width = `${data.progress || 0}%`;
        if (groupControls) groupControls.style.display = "none";

        const structureBadge = document.getElementById("badge-count-structure");
        if (structureBadge) structureBadge.style.display = "none";
        const mediaBadge = document.getElementById("badge-count-media");
        if (mediaBadge) mediaBadge.style.display = "none";

        const overviewLastScan = document.getElementById("overview-last-scan");
        if (overviewLastScan) overviewLastScan.textContent = "Scan läuft...";
        const overviewHealthSummary = document.getElementById("overview-health-summary");
        if (overviewHealthSummary) overviewHealthSummary.textContent = "Scan läuft...";

        summaryEl.innerHTML = "";

        issuesEl.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 30px; font-size: 0.95em;">
                <div class="loading-spinner"></div>
                Health-Scan wird aktualisiert ...
            </div>
        `;
        const structureIssuesEl = document.getElementById("health-issues-structure");
        if (structureIssuesEl) {
            structureIssuesEl.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 30px; font-size: 0.95em;">
                    <div class="loading-spinner"></div>
                    Health-Scan wird aktualisiert ...
                </div>
            `;
        }
        return;
    }

    let bannerHtml = "";
    if (data.media_server_skipped === true) {
        bannerHtml = `
            <div class="alert alert-warning" style="margin-bottom:12px; background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25); color:#f59e0b; padding:10px; border-radius:var(--radius-sm); font-size:12px; display:flex; align-items:center; gap:8px; width:100%;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle" style="height:16px; width:16px; flex-shrink:0;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span><strong>Medienserver-Prüfung übersprungen</strong> (Poster, Fanart, Banner, ClearLogos und Staffel-Poster). Du kannst den Medienserver unter <a href="#" onclick="document.getElementById('nav-settings-dashboard')?.click(); setTimeout(() => { document.querySelector('[data-settings-tab=tab-sync]')?.click(); document.getElementById('settings-sync-categories-section')?.scrollIntoView({ behavior: 'smooth' }); }, 100); return false;" style="color:#f59e0b; text-decoration:underline; font-weight:600;">Einstellungen > Speicher & Sync</a> konfigurieren.</span>
            </div>
        `.trim();
    }

    // Synchronisiere Übersicht-Dashboard
    const overviewLastScan = document.getElementById("overview-last-scan");
    if (overviewLastScan) {
        overviewLastScan.textContent = data.finished_at ? new Date(data.finished_at * 1000).toLocaleString("de-DE") : (data.status === "running" ? "Scan läuft..." : "Nie");
    }
    const overviewHealthSummary = document.getElementById("overview-health-summary");
    if (overviewHealthSummary) {
        if (data.issues || data.summary) {
            const count = (data.issues || []).length;
            overviewHealthSummary.textContent = count > 0 ? `${count} Hinweise` : "Keine Auffälligkeiten";
        } else {
            overviewHealthSummary.textContent = "Keine Daten";
        }
    }



    if (data.status === "warning") {
        statusEl.textContent = `Warnung: ${data.message || "Warnung beim Scan"}`;
        if (progWrap) progWrap.style.display = "none";
        if (groupControls) groupControls.style.display = "none";

        const structureBadge = document.getElementById("badge-count-structure");
        if (structureBadge) structureBadge.style.display = "none";
        const mediaBadge = document.getElementById("badge-count-media");
        if (mediaBadge) mediaBadge.style.display = "none";
        const overviewStructureSummary = document.getElementById("overview-structure-summary");
        if (overviewStructureSummary) overviewStructureSummary.textContent = "Keine Daten";
        const overviewHealthSummary = document.getElementById("overview-health-summary");
        if (overviewHealthSummary) overviewHealthSummary.textContent = "Keine Daten";

        const targetStructureIssuesEl = document.getElementById("health-issues-structure");
        if (targetStructureIssuesEl) targetStructureIssuesEl.innerHTML = "";
        const structureContainer = document.getElementById("structure-health-issues-container");
        if (structureContainer) structureContainer.style.display = "none";

        let warningHtml = `<div class="alert alert-warning" style="margin:4px 0; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); color:#f59e0b; padding:10px; border-radius:var(--radius-sm); font-size:12px; display:flex; align-items:center; gap:8px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle" style="height:16px; width:16px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>Scan nicht aussagekräftig: keine Bibliotheksordner gefunden.</span>
        </div>`;
        issuesEl.innerHTML = warningHtml;
        summaryEl.innerHTML = "";
        return;
    }

    // Filter nested_duplicate and genre_container issues into the Cleanup-Structure tab
    const allIssues = data.issues || [];
    const structureIssues = allIssues.filter(it => it.type === "nested_duplicate" || it.type === "genre_container");
    const mediaIssues = allIssues.filter(it => it.type !== "nested_duplicate" && it.type !== "genre_container");

    const structureContainer = document.getElementById("structure-health-issues-container");
    const structureIssuesEl = document.getElementById("health-issues-structure");
    if (structureContainer && structureIssuesEl) {
        if (structureIssues.length > 0) {
            structureContainer.style.display = "block";
            let batchHeaderHtml = "";
            if (structureIssues.length > 1) {
                batchHeaderHtml = `<div style="padding: 10px; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.04); display: flex; justify-content: flex-end;">
                    <button class="btn btn-accent btn-sm" id="btn-structure-batch-check" style="display:inline-flex; align-items:center; gap:6px;"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layers" style="height:14px; width:14px;"><polygon points="12 2 2 7 12 12 22 7 12 2"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>Ordnerstrukturen vorbereiten</button>
                </div>`;
            }
            structureIssuesEl.innerHTML = batchHeaderHtml + structureIssues.map(it => {
                const previewBtn = `<button class="btn btn-secondary btn-sm health-structure-preview" data-path="${escapeHTML(it.path)}" title="Vorschau der Änderungen anzeigen" style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search" style="height:12px; width:12px;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>Vorschau</button>`;
                const applyBtn = `<button class="btn btn-primary btn-sm health-structure-apply" data-path="${escapeHTML(it.path)}" title="Ordnerstruktur auflösen" style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wrench" style="height:12px; width:12px;"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>Auflösen</button>`;
                return `<div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; font-size:0.9em; padding:8px 0; border-top:1px solid rgba(255,255,255,0.04);">
                            <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:0; color: var(--text-main); font-weight: 500;">
                                <span style="min-width:0; overflow-wrap:anywhere; word-break:break-word;">${escapeHTML(it.category)} · ${escapeHTML(it.message)}</span>
                            </div>
                            <span style="display:flex; gap:6px; flex-wrap:wrap; white-space:nowrap; flex-shrink:0;">
                                ${previewBtn}
                                ${applyBtn}
                                <button class="btn btn-secondary btn-sm health-open-folder" data-path="${escapeHTML(it.path)}" style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder" style="height:12px; width:12px;"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>Öffnen</button>
                                <button class="btn btn-secondary btn-sm finding-ignore" data-key="${escapeHTML(it.key || "")}" title="Diesen Befund dauerhaft ausblenden" style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-ban" style="height:12px; width:12px;"><circle cx="12" cy="12" r="10"/><line x1="4.93" x2="19.07" y1="4.93" y2="19.07"/></svg>Ignorieren</button>
                            </span>
                         </div>`;
            }).join("");
        } else {
            structureContainer.style.display = "none";
            structureIssuesEl.innerHTML = "";
        }
    }

    // Assign mediaIssues back to data.issues for subsequent rendering in #health-issues
    data.issues = mediaIssues;

    // Update Sub-Tab Badges & visibility
    const structureBadge = document.getElementById("badge-count-structure");
    if (structureBadge) {
        structureBadge.textContent = structureIssues.length;
        structureBadge.style.display = structureIssues.length > 0 ? "inline" : "none";
    }
    const mediaBadge = document.getElementById("badge-count-media");
    if (mediaBadge) {
        mediaBadge.textContent = mediaIssues.length;
        mediaBadge.style.display = mediaIssues.length > 0 ? "inline" : "none";
    }

    // Update Overview Tab Structure KPI
    const overviewStructureSummary = document.getElementById("overview-structure-summary");
    if (overviewStructureSummary) {
        overviewStructureSummary.textContent = structureIssues.length > 0 ? `${structureIssues.length} Hinweise` : "Keine Auffälligkeiten";
    }

    // 1. Zustand sichern (geöffnete Gruppen und Scrollposition)
    const openTypes = [];
    const hadDetails = issuesEl.querySelector("details") !== null;
    if (hadDetails) {
        issuesEl.querySelectorAll("details").forEach(d => {
            if (d.open) {
                const typ = d.getAttribute("data-type-id");
                if (typ) openTypes.push(typ);
                const showPath = d.getAttribute("data-show-path");
                if (showPath) openTypes.push(`show:${showPath}`);
                const moviePath = d.getAttribute("data-movie-path");
                if (moviePath) openTypes.push(`movie:${moviePath}`);
                const seasonPath = d.getAttribute("data-season-path");
                if (seasonPath) openTypes.push(`season:${seasonPath}`);
                const episodePath = d.getAttribute("data-episode-path");
                if (episodePath) openTypes.push(`episode:${episodePath}`);
            }
        });
    }
    const scrollTop = window.scrollY || document.documentElement.scrollTop;

    // Statuszeile + Fortschritt
    if (data.status === "running") {
        statusEl.textContent = data.message || "Scan läuft...";
        if (progWrap) progWrap.style.display = "block";
        if (progBar) progBar.style.width = `${data.progress || 0}%`;
    } else {
        if (progWrap) progWrap.style.display = "none";
        if (data.status === "error") {
            statusEl.textContent = `Fehler: ${data.message || data.error || "Unbekannt"}`;
        } else if (data.status === "cancelled") {
            const when = data.finished_at ? new Date(data.finished_at * 1000).toLocaleString("de-DE") : "";
            statusEl.textContent = `Abgebrochen: ${data.message || "Vom Benutzer abgebrochen."}` + (when ? ` (${when})` : "");
        } else if (data.status === "done" || (data.issues && data.issues.length >= 0 && data.finished_at)) {
            const when = data.finished_at ? new Date(data.finished_at * 1000).toLocaleString("de-DE") : "";
            statusEl.textContent = data.message + (when ? ` (zuletzt: ${when})` : "");
        } else {
            statusEl.textContent = "Noch kein Scan durchgeführt.";
        }
    }

    // Summary-Badges (Gesamtzahl + 4 Gruppen: Metadaten, Artwork, Dateien, Struktur)
    const hasResult = (allIssues && data.finished_at) || data.status === "done";
    if (hasResult) {
        const groupCounts = { metadata: 0, artwork: 0, files: 0, structure: 0 };
        allIssues.forEach(it => {
            const grp = getHealthIssueGroup(it);
            if (groupCounts[grp] !== undefined) {
                groupCounts[grp]++;
            }
        });
        const totalCount = allIssues.length;
        const groupsDef = [
            { key: "metadata", label: "Metadaten" },
            { key: "artwork", label: "Artwork" },
            { key: "files", label: "Dateien" },
            { key: "structure", label: "Struktur" }
        ];

        const chipsHtml = [
            `<span style="font-size:0.85em; padding:4px 10px; border-radius:12px; background:rgba(255,255,255,0.06); color:var(--text-main); border:1px solid var(--border-light); font-weight:500;">Gesamt: ${totalCount}</span>`,
            ...groupsDef.map(g => `<span style="font-size:0.85em; padding:4px 10px; border-radius:12px; background:rgba(255,255,255,0.035); color:var(--text-muted); border:1px solid var(--border-light);">${g.label}: ${groupCounts[g.key] || 0}</span>`)
        ].join("");

        summaryEl.innerHTML = `<div style="font-size:0.9em; font-weight:600; color:var(--text-muted); margin-bottom: 8px; width: 100%; text-align: center;">Ergebnis des Scans:</div>`
            + `<div style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap; width:100%;">`
            + chipsHtml
            + `</div>`;
    } else {
        summaryEl.innerHTML = "";
    }

    // Gruppierungs-Steuerung ein-/ausblenden
    if (groupControls) {
        groupControls.style.display = hasResult && data.issues && data.issues.length > 0 ? "flex" : "none";
    }

    // Issues gruppiert nach Fehlertyp oder Medien
    if ((data.issues && data.issues.length > 0) || structureIssues.length > 0) {
        let html = "";
        let totalRendered = 0;
        const DOM_LIMIT = 500;
        let limitReached = false;

        if (window.healthGroupMode === "type") {
            // Gruppierung nach Fehlertyp
            const grouped = {};
            data.issues.forEach(it => {
                if (!grouped[it.type]) {
                    grouped[it.type] = [];
                }
                grouped[it.type].push(it);
            });

            const typeKeys = Object.keys(grouped).sort((a, b) => {
                const labelA = HEALTH_TYPE_LABELS[a] || a;
                const labelB = HEALTH_TYPE_LABELS[b] || b;
                return labelA.localeCompare(labelB);
            });

            typeKeys.forEach(typeId => {
                const list = grouped[typeId];
                if (!list.length) return;
                const label = HEALTH_TYPE_LABELS[typeId] || typeId;
                const recommendedAction = HEALTH_RECOMMENDED_ACTIONS[typeId] || "";

                // Visuelle Vorbereitung für Batch-Aktionen
                let batchBtnHtml = "";
                if (typeId === "missing_age_rating" || typeId === "invalid_age_rating") {
                    batchBtnHtml = `
                        <div style="display:inline-flex; align-items:center; gap:6px;">
                            <select class="form-select form-select-xs health-batch-fsk-select" style="padding:2px 4px; font-size:11px; width:auto; height:24px; background:var(--bg-surface-3); border-color:var(--border-light); color:var(--text-main);">
                                <option value="">FSK...</option>
                                <option value="0">FSK 0</option>
                                <option value="6">FSK 6</option>
                                <option value="12">FSK 12</option>
                                <option value="16">FSK 16</option>
                                <option value="18">FSK 18</option>
                            </select>
                            <button class="btn btn-primary btn-xs health-batch-fsk-btn" style="padding:2px 8px; height:24px;" title="Ausgewählte FSK-Werte zuweisen">FSK Batch</button>
                        </div>
                    `;
                } else if (typeId === "nested_duplicate" || typeId === "genre_container") {
                    batchBtnHtml = `
                        <button class="btn btn-primary btn-xs health-batch-btn" data-type-id="${escapeHTML(typeId)}" data-action="flatten" style="padding:2px 8px; height:24px;" title="Alle ausgewählten Ordnerstrukturen auflösen">Auflösen</button>
                    `;
                } else if (typeId === "missing_nfo" || typeId === "incomplete_nfo") {
                    // NFO Agent is offered per finding (health-nfo-agent button on each issue),
                    // since every series needs its own metadata source/ID — no batch action here.
                    batchBtnHtml = "";
                } else if (typeId === "codec_inconsistency") {
                    batchBtnHtml = `
                        <button class="btn btn-accent btn-xs health-batch-tool-btn" data-type-id="${escapeHTML(typeId)}" data-tool="tool_batch_convert" style="padding:2px 8px; height:24px;" title="H.265 Konvertierung für erstes ausgewähltes Verzeichnis öffnen">H.265 Konverter (1.)</button>
                    `;
                } else if (typeId === "empty_folder") {
                    batchBtnHtml = `
                        <button class="btn btn-accent btn-xs health-batch-tool-btn" data-type-id="${escapeHTML(typeId)}" data-tool="tool_clean" style="padding:2px 8px; height:24px;" title="Ordner bereinigen für erstes ausgewähltes Verzeichnis ausführen">Ordner bereinigen (1.)</button>
                    `;
                } else {
                    batchBtnHtml = `
                        <button class="btn btn-secondary btn-xs health-batch-btn-placeholder" disabled style="padding:2px 8px; height:24px; opacity:0.6;">Aktion (Phase 2.5b)</button>
                    `;
                }

                const isOpen = openTypes.includes(typeId);

                html += `<details data-type-id="${typeId}" ${isOpen ? "open" : ""} style="border:1px solid var(--border-light); border-radius:8px; padding:8px 12px; margin-bottom:8px;">
                            <summary style="cursor:pointer; font-weight:500; display:flex; align-items:center; justify-content:space-between; gap:12px; list-style:none;">
                                <div style="display:flex; align-items:center; gap:8px; flex:1;">
                                    <input type="checkbox" class="health-group-select-all" data-type-id="${typeId}" style="margin:0; width:14px; height:14px; cursor:pointer;" onclick="event.stopPropagation();">
                                    <span style="color:var(--text-main);">${escapeHTML(label)} (${list.length})</span>
                                </div>
                                <div style="display:flex; align-items:center; gap:10px;" onclick="event.stopPropagation();">
                                    ${batchBtnHtml}
                                </div>
                            </summary>
                            <div style="margin-top:8px; display:flex; flex-direction:column; gap:6px; border-top:1px solid var(--border-light); padding-top:8px;">`;

                if (recommendedAction) {
                    html += `<div style="font-size:0.8em; color:var(--text-muted); padding:4px 8px; background:rgba(255,255,255,0.02); border-left:3px solid var(--accent); border-radius:0 4px 4px 0; margin-bottom:4px; font-style:italic; display:inline-flex; align-items:center; gap:6px;">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lightbulb" style="height:12px; width:12px; display:inline-block; vertical-align:middle; color:var(--accent);"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A5.5 5.5 0 0 0 7.5 8c0 1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg><strong>Empfehlung:</strong> ${escapeHTML(recommendedAction)}
                             </div>`;
                }

                for (let i = 0; i < list.length; i++) {
                    if (totalRendered >= DOM_LIMIT) {
                        if (!limitReached) {
                            html += `<div style="padding: 10px; text-align: center; color: var(--text-muted); font-style: italic; display:flex; align-items:center; justify-content:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-circle" style="height:12px; width:12px;"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>Anzeige-Limit erreicht. Es werden nur die ersten ${DOM_LIMIT} Befunde dargestellt.</div>`;
                            limitReached = true;
                        }
                        break;
                    }
                    const it = list[i];
                    totalRendered++;
                    let fixBtns = "";
                    let scopeData = "";
                    if (it.scope_kind) scopeData += ` data-scope-kind="${escapeHTML(it.scope_kind)}"`;
                    if (it.series_path) scopeData += ` data-series-path="${escapeHTML(it.series_path)}"`;
                    if (it.season_path) scopeData += ` data-season-path="${escapeHTML(it.season_path)}"`;

                    let mediaKind = it.media_kind || "unknown";
                    scopeData += ` data-media-kind="${mediaKind}"`;
                    const nfoEditMode = mediaKind === "series" ? "series" : (mediaKind === "episode" ? "episode" : "full");
                    const episodeFileData = it.episode_file ? ` data-episode-file="${escapeHTML(it.episode_file)}"` : "";


                    if (it.type === "nested_duplicate") {
                        fixBtns = `<button class="btn btn-secondary btn-sm health-structure-preview" data-path="${escapeHTML(it.path)}" title="Vorschau anzeigen" style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search" style="height:12px; width:12px;"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/></svg>Vorschau</button>
                                   <button class="btn btn-primary btn-sm health-structure-apply" data-path="${escapeHTML(it.path)}" title="Unterordner auflösen" style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wrench" style="height:12px; width:12px;"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>Auflösen</button>`;
                    } else if (it.type === "name_mismatch" || it.type === "bad_folder_name") {
                        fixBtns = `<button class="btn btn-secondary btn-sm health-fix-rename" data-path="${escapeHTML(it.path)}" data-type="${escapeHTML(it.type)}" title="Umbenennen" style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-edit-3" style="height:12px; width:12px;"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>Umbenennen</button>`;
                    } else if (it.type === "missing_age_rating" || it.type === "invalid_age_rating") {
                        fixBtns = `<button class="btn btn-accent btn-sm health-fix-fsk" data-path="${escapeHTML(it.path)}" ${scopeData} title="Metadaten bearbeiten" style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings" style="height:12px; width:12px;"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>Metadaten bearbeiten</button>`;
                    } else if (it.type === "missing_poster" || it.type === "missing_backdrop" || it.type === "missing_logo" || it.type === "missing_banner" || it.type === "missing_season_poster") {
                        fixBtns = `<button class="btn btn-secondary btn-sm health-artwork-search" data-path="${escapeHTML(it.path)}" data-type="${escapeHTML(it.type)}" title="Bild online suchen" style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image" style="height:12px; width:12px;"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>Bild suchen</button>`;
                    } else if (it.type === "missing_nfo" || it.type === "incomplete_nfo") {
                        fixBtns = `<button class="btn btn-accent btn-sm health-nfo-agent" data-path="${escapeHTML(it.agent_path || it.path)}" data-edit-mode="${nfoEditMode}"${episodeFileData} title="Metadaten bearbeiten" style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-text" style="height:12px; width:12px;"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>Metadaten bearbeiten</button>`;
                    }

                    html += `<div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; font-size:0.9em; padding:8px 0; border-top:1px solid rgba(255,255,255,0.04);">
                                <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:0; color:var(--text-main); font-weight:500;">
                                    <input type="checkbox" class="health-item-select" data-type-id="${typeId}" data-path="${escapeHTML(it.path)}" ${scopeData} style="margin:0; width:14px; height:14px; cursor:pointer; flex-shrink:0;">
                                    <span style="min-width:0; overflow-wrap:anywhere; word-break:break-word;">${escapeHTML(it.category)} · ${escapeHTML(it.message)}</span>
                                </div>
                                <span style="display:flex; gap:6px; flex-wrap:wrap; white-space:nowrap; flex-shrink:0;">
                                    ${fixBtns}
                                    <button class="btn btn-secondary btn-sm health-open-folder" data-path="${escapeHTML(it.path)}" style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder" style="height:12px; width:12px;"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>Öffnen</button>
                                    <button class="btn btn-secondary btn-sm finding-ignore" data-key="${escapeHTML(it.key || "")}" title="Diesen Befund dauerhaft ausblenden" style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-ban" style="height:12px; width:12px;"><circle cx="12" cy="12" r="10"/><line x1="4.93" x2="19.07" y1="4.93" y2="19.07"/></svg>Ignorieren</button>
                                </span>
                             </div>`;
                }
                html += `</div></details>`;
            });
        } else if (window.healthGroupMode === "media") {
            html += renderHealthMediaView(data, openTypes);
        }

        html += renderIgnoredFooter(data.ignored_count);
        issuesEl.innerHTML = bannerHtml + html;
        if ((!data.issues || data.issues.length === 0) && structureIssues.length > 0) {
            issuesEl.innerHTML = bannerHtml + `<p class="text-muted" style="margin:4px 0;">Keine Auffälligkeiten für einzelne Medien. Strukturprobleme findest du im Tab Struktur.</p>` + renderIgnoredFooter(data.ignored_count);
        }

        // 2. Zustand wiederherstellen
        if (hadDetails) {
            issuesEl.querySelectorAll("details").forEach(d => {
                if (window.healthGroupMode === "type") {
                    const typ = d.getAttribute("data-type-id");
                    d.open = openTypes.includes(typ);
                } else if (window.healthGroupMode === "media") {
                    const showPath = d.getAttribute("data-show-path");
                    const moviePath = d.getAttribute("data-movie-path");
                    const seasonPath = d.getAttribute("data-season-path");
                    const episodePath = d.getAttribute("data-episode-path");
                    d.open = (showPath && openTypes.includes(`show:${showPath}`))
                        || (moviePath && openTypes.includes(`movie:${moviePath}`))
                        || (seasonPath && openTypes.includes(`season:${seasonPath}`))
                        || (episodePath && openTypes.includes(`episode:${episodePath}`));
                }
            });
        }

        // Checkboxen-Logik & Batch-Steuerung (nur im Fehlertyp-Modus)
        if (window.healthGroupMode === "type") {
            issuesEl.querySelectorAll("details").forEach(detailsEl => {
                const selectAllCb = detailsEl.querySelector(".health-group-select-all");
                const itemCbs = detailsEl.querySelectorAll(".health-item-select");

                if (selectAllCb) {
                    selectAllCb.addEventListener("change", () => {
                        const checked = selectAllCb.checked;
                        itemCbs.forEach(cb => {
                            cb.checked = checked;
                        });
                    });
                }

                itemCbs.forEach(cb => {
                    cb.addEventListener("change", () => {
                        const allChecked = Array.from(itemCbs).every(c => c.checked);
                        const someChecked = Array.from(itemCbs).some(c => c.checked);
                        if (selectAllCb) {
                            selectAllCb.checked = allChecked;
                            selectAllCb.indeterminate = someChecked && !allChecked;
                        }
                    });
                });
            });

            // FSK Batch-Buttons
            issuesEl.querySelectorAll(".health-batch-fsk-btn").forEach(b => {
                b.addEventListener("click", () => {
                    const detailsEl = b.closest("details");
                    const checkedItems = Array.from(detailsEl.querySelectorAll(".health-item-select:checked")).map(cb => ({
                        path: cb.getAttribute("data-path"),
                        scope_kind: "single", // Allgemeine Checkbox-Batches sind strikt single
                        media_kind: cb.getAttribute("data-media-kind") || "unknown"
                    }));
                    const fskVal = detailsEl.querySelector(".health-batch-fsk-select")?.value;

                    if (checkedItems.length === 0) {
                        alert("Bitte wähle mindestens einen Befund aus.");
                        return;
                    }
                    if (!fskVal) {
                        alert("Bitte wähle eine FSK-Stufe aus.");
                        return;
                    }

                    const isMixed = new Set(checkedItems.map(i => i.media_kind)).size > 1;
                    const mediaKind = isMixed ? "mixed" : (checkedItems.length > 0 ? checkedItems[0].media_kind : "unknown");
                    openFskBatchModal(checkedItems, fskVal, "single", mediaKind);
                });
            });

            // Andere Batch-Buttons (Phase 2.5b/c)
            issuesEl.querySelectorAll(".health-batch-btn").forEach(b => {
                b.addEventListener("click", () => {
                    const action = b.getAttribute("data-action");
                    const detailsEl = b.closest("details");
                    const checkedPaths = Array.from(detailsEl.querySelectorAll(".health-item-select:checked")).map(cb => cb.getAttribute("data-path"));

                    if (checkedPaths.length === 0) {
                        alert("Bitte wähle mindestens einen Befund aus.");
                        return;
                    }

                    alert(`Batch-Aktion [${action}] für ${checkedPaths.length} ausgewählte(s) Element(e) vorgemerkt.\n\n(Diese Batch-Funktion wird in Phase 2.5b/c implementiert.)`);
                });
            });

            // Kontextuelle Verknüpfung der Medienpflege-Werkzeuge
            issuesEl.querySelectorAll(".health-batch-tool-btn").forEach(b => {
                b.addEventListener("click", () => {
                    const tool = b.getAttribute("data-tool");
                    const detailsEl = b.closest("details");
                    const checkedPaths = Array.from(detailsEl.querySelectorAll(".health-item-select:checked")).map(cb => cb.getAttribute("data-path"));

                    if (checkedPaths.length === 0) {
                        alert("Bitte wähle mindestens einen Befund aus.");
                        return;
                    }

                    if (tool === "tool_nfo_agent") {
                        if (confirm(`NFO Agent für das erste ausgewählte Verzeichnis starten (Review-Modus)?\n\nPfad: ${checkedPaths[0]}`)) {
                            runContextTool("tool_nfo_agent", checkedPaths[0]);
                        }
                    } else if (tool === "tool_batch_convert") {
                        if (confirm(`H.265 Batch-Konvertierung für das erste ausgewählte Verzeichnis öffnen?\n\nPfad: ${checkedPaths[0]}`)) {
                            runContextTool("tool_batch_convert", checkedPaths[0]);
                        }
                    } else if (tool === "tool_clean") {
                        if (confirm(`Ordner bereinigen für das erste ausgewählte Verzeichnis ausführen?\n\nPfad: ${checkedPaths[0]}`)) {
                            runContextTool("tool_clean", checkedPaths[0]);
                        }
                    }
                });
            });
        }



        // ==========================================================================
        // NEU: Doppelte Ordnerstruktur auflösen (Einzel & Batch)
        // ==========================================================================

        function renderTreeHtml(treeList) {
            return treeList.map(line => {
                const isDir = line.endsWith("/");
                const icon = isDir ?
                    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder" style="height:14px; width:14px; color:var(--accent); display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>` :
                    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file" style="height:14px; width:14px; color:var(--text-muted); display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`;
                const name = isDir ? line.slice(0, -1) : line;
                const parts = name.split("/");
                const indent = (parts.length - 1) * 16;
                const baseName = parts.pop();
                return `<div style="padding-left: ${indent}px; display: flex; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHTML(line)}">${icon}${escapeHTML(baseName)}${isDir ? '/' : ''}</div>`;
            }).join("");
        }

        async function openStructurePreview(path, options = {}) {
            const modal = document.getElementById("modal-structure-preview");
            const pathEl = document.getElementById("structure-preview-path");
            const treeCurrentEl = document.getElementById("structure-preview-tree-current");
            const treeTargetEl = document.getElementById("structure-preview-tree-target");
            const actionsEl = document.getElementById("structure-preview-actions-list");
            const conflictsWrap = document.getElementById("structure-preview-conflicts-wrap");
            const conflictsEl = document.getElementById("structure-preview-conflicts-list");
            const confirmBtn = document.getElementById("btn-structure-preview-confirm");

            if (pathEl) pathEl.textContent = path;
            if (treeCurrentEl) treeCurrentEl.innerHTML = `<div style="padding: 10px; color: var(--text-muted);">Vorschau wird geladen...</div>`;
            if (treeTargetEl) treeTargetEl.innerHTML = `<div style="padding: 10px; color: var(--text-muted);">Vorschau wird geladen...</div>`;
            if (actionsEl) actionsEl.innerHTML = `<li>Lade...</li>`;
            if (conflictsWrap) conflictsWrap.style.display = "none";
            if (confirmBtn) confirmBtn.disabled = true;

            if (modal) {
                modal.dataset.structurePreviewPath = path;
                modal.classList.remove("hidden");
                modal.classList.add("active");
            }

            try {
                const res = await fetch("/api/nas/structure-fix/preview", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path: path })
                });
                const data = await res.json();
                if (!data.ok) {
                    throw new Error(data.message || "Vorschau konnte nicht geladen werden.");
                }

                if (treeCurrentEl) treeCurrentEl.innerHTML = renderTreeHtml(data.current_tree);
                if (treeTargetEl) treeTargetEl.innerHTML = renderTreeHtml(data.target_tree);

                // Passe Titel und Buttons je nach Typ an
                const modalTitleEl = document.getElementById("structure-preview-modal-title");
                if (modalTitleEl) {
                    modalTitleEl.textContent = data.type_id === "genre_container" ? "Sammelordner auflösen: Vorschau" : "Ordnerstruktur auflösen: Vorschau";
                }
                if (confirmBtn) {
                    confirmBtn.textContent = data.type_id === "genre_container" ? "Sammelordner auflösen" : "Struktur auflösen";
                }

                const actionsHtml = [];
                const moveItems = data.items_to_move || data.files_to_move || [];
                moveItems.forEach(f => {
                    if (data.type_id === "genre_container") {
                        actionsHtml.push(`<li>Verschiebe Filmordner <strong>${escapeHTML(f.rel_src)}</strong> &rarr; <strong>${escapeHTML(f.rel_dst)}</strong></li>`);
                    } else {
                        actionsHtml.push(`<li>Verschiebe Datei/Ordner <strong>${escapeHTML(f.rel_src)}</strong> &rarr; <strong>${escapeHTML(f.rel_dst)}</strong></li>`);
                    }
                });
                data.folders_to_delete.forEach(f => {
                    if (data.type_id === "genre_container") {
                        actionsHtml.push(`<li>Leeren Sammelordner quarantänisieren: <strong>${escapeHTML(f.rel_path)}</strong></li>`);
                    } else {
                        actionsHtml.push(`<li>Leeren Unterordner quarantänisieren: <strong>${escapeHTML(f.rel_path)}</strong></li>`);
                    }
                });
                if (actionsEl) actionsEl.innerHTML = actionsHtml.join("");

                if (data.conflicts && data.conflicts.length > 0) {
                    if (conflictsWrap) conflictsWrap.style.display = "block";
                    if (conflictsEl) conflictsEl.innerHTML = data.conflicts.map(c => `<li>${escapeHTML(c)}</li>`).join("");
                    if (confirmBtn) confirmBtn.disabled = true;
                } else if (window.structureBatchBusy) {
                    if (confirmBtn) {
                        confirmBtn.disabled = true;
                        confirmBtn.textContent = "Prüfung läuft...";
                    }
                } else {
                    if (conflictsWrap) conflictsWrap.style.display = "none";
                    if (confirmBtn) confirmBtn.disabled = false;
                }

                if (options.onLoaded) {
                    options.onLoaded(data);
                }

            } catch (err) {
                if (treeCurrentEl) treeCurrentEl.innerHTML = `<div style="color: #ef4444; padding: 10px;">Fehler: ${escapeHTML(err.message)}</div>`;
                if (treeTargetEl) treeTargetEl.innerHTML = `<div style="color: #ef4444; padding: 10px;">Fehler: ${escapeHTML(err.message)}</div>`;
                if (actionsEl) actionsEl.innerHTML = `<li style="color: #ef4444;">Fehler: ${escapeHTML(err.message)}</li>`;
                if (confirmBtn) confirmBtn.disabled = true;
            }
        }

        async function applyStructureFix(path, confirmBtn) {
            if (confirmBtn) {
                confirmBtn.disabled = true;
                confirmBtn.textContent = "Wird ausgeführt...";
            }
            try {
                const res = await fetch("/api/nas/structure-fix/apply", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path: path })
                });
                const data = await res.json();
                if (data.ok) {
                    const modal = document.getElementById("modal-structure-preview");
                    if (modal) {
                        modal.classList.remove("active");
                        modal.classList.add("hidden");
                    }
                    pollHealthStatus(false);
                } else {
                    alert(data.message || "Fehler bei der Ausführung.");
                }
            } catch (err) {
                alert("Fehler bei der Ausführung: " + err);
            } finally {
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = "Struktur auflösen";
                }
            }
        }

        function confirmDirectStructureFix(path) {
            const skipKey = "skipStructureFixDirectConfirm";
            try {
                if (localStorage.getItem(skipKey) === "true") {
                    return Promise.resolve(true);
                }
            } catch (_) {
                // localStorage can be unavailable in restricted browser contexts.
            }

            const modal = document.getElementById("modal-structure-direct-confirm");
            const pathEl = document.getElementById("structure-direct-confirm-path");
            const skipCheckbox = document.getElementById("structure-direct-confirm-skip");
            const confirmBtn = document.getElementById("btn-structure-direct-confirm-apply");
            const cancelBtn = document.getElementById("btn-structure-direct-confirm-cancel");
            const closeBtn = document.getElementById("close-modal-structure-direct-confirm");

            if (!modal || !confirmBtn || !cancelBtn || !closeBtn) {
                return Promise.resolve(window.confirm("Ordnerstruktur ohne Vorschau auflösen? Dateien werden verschoben und leere Restordner werden in die Quarantäne verschoben."));
            }

            if (pathEl) pathEl.textContent = path;
            if (skipCheckbox) skipCheckbox.checked = false;
            modal.classList.remove("hidden");
            modal.classList.add("active");

            return new Promise(resolve => {
                const finish = (confirmed) => {
                    modal.classList.remove("active");
                    modal.classList.add("hidden");
                    confirmBtn.onclick = null;
                    cancelBtn.onclick = null;
                    closeBtn.onclick = null;

                    if (confirmed && skipCheckbox && skipCheckbox.checked) {
                        try {
                            localStorage.setItem(skipKey, "true");
                        } catch (_) {
                            // Ignore persistence failures; the current confirmation still proceeds.
                        }
                    }
                    resolve(confirmed);
                };

                confirmBtn.onclick = () => finish(true);
                cancelBtn.onclick = () => finish(false);
                closeBtn.onclick = () => finish(false);
            });
        }

        const closePreviewElements = ["close-modal-structure-preview", "btn-structure-preview-cancel"];
        closePreviewElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener("click", () => {
                    const modal = document.getElementById("modal-structure-preview");
                    if (modal) {
                        modal.classList.remove("active");
                        modal.classList.add("hidden");
                    }
                });
            }
        });

        const btnStructurePreviewConfirm = document.getElementById("btn-structure-preview-confirm");
        if (btnStructurePreviewConfirm) {
            const newConfirmBtn = btnStructurePreviewConfirm.cloneNode(true);
            btnStructurePreviewConfirm.replaceWith(newConfirmBtn);
            newConfirmBtn.addEventListener("click", () => {
                const modal = document.getElementById("modal-structure-preview");
                const activePath = modal && modal.dataset ? modal.dataset.structurePreviewPath : "";
                if (activePath) {
                    applyStructureFix(activePath, newConfirmBtn);
                }
            });
        }

        async function startStructureBatchCheck() {
            const paths = Array.from(document.querySelectorAll("#health-issues-structure .health-structure-preview")).map(b => b.getAttribute("data-path"));
            if (paths.length === 0) return;
            window.structureBatchBusy = true;

            const batchModal = document.getElementById("modal-structure-batch");
            const progressWrap = document.getElementById("structure-batch-progress-wrap");
            const progressBar = document.getElementById("structure-batch-progress-bar");
            const progressTitle = document.getElementById("structure-batch-progress-title");
            const progressNum = document.getElementById("structure-batch-progress-num");
            const tableBody = document.getElementById("structure-batch-list-body");
            const confirmBatchBtn = document.getElementById("btn-structure-batch-confirm");

            const findRowByPath = (path) => {
                if (!tableBody) return null;
                const rows = tableBody.querySelectorAll("tr");
                for (let r of rows) {
                    if (r.getAttribute("data-batch-path") === path) {
                        return r;
                    }
                }
                return null;
            };

            if (tableBody) {
                tableBody.innerHTML = paths.map(p => {
                    const name = p.split("/").pop();
                    return `<tr data-batch-path="${escapeHTML(p)}" style="border-bottom: 1px solid var(--border-light);">
                        <td style="padding: 10px 12px; font-weight: 500; color: var(--text-main); max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHTML(p)}">${escapeHTML(name)}</td>
                        <td class="batch-status-col" style="padding: 10px 12px; color: var(--text-muted);"><span style="color: var(--text-muted); opacity: 0.5;">Warte auf Prüfung...</span></td>
                        <td style="padding: 10px 12px; text-align: right;">
                            <button class="btn btn-secondary btn-xs batch-item-preview-btn" disabled data-path="${escapeHTML(p)}" style="padding: 2px 8px; font-size: 0.8em;">Vorschau</button>
                        </td>
                    </tr>`;
                }).join("");
            }

            if (progressWrap) progressWrap.style.display = "block";
            if (progressBar) progressBar.style.width = "0%";
            if (progressTitle) progressTitle.textContent = "Prüfe Befunde...";
            if (progressNum) progressNum.textContent = `0 / ${paths.length}`;
            if (confirmBatchBtn) {
                confirmBatchBtn.disabled = true;
                confirmBatchBtn.textContent = "Geprüfte Ordnerstrukturen auflösen";
            }

            if (batchModal) {
                batchModal.classList.remove("hidden");
                batchModal.classList.add("active");
            }

            let processedCount = 0;
            let safePaths = [];

            for (let i = 0; i < paths.length; i++) {
                const p = paths[i];
                const row = findRowByPath(p);
                if (!row) continue;

                const statusCol = row.querySelector(".batch-status-col");
                const previewBtn = row.querySelector(".batch-item-preview-btn");

                try {
                    const res = await fetch("/api/nas/structure-fix/preview", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ path: p })
                    });
                    const data = await res.json();
                    if (data.ok) {
                        if (data.safe) {
                            if (statusCol) statusCol.innerHTML = `<span style="color: #10b981; font-weight: 500;">✓ Kann automatisch aufgelöst werden</span>`;
                            safePaths.push(p);
                        } else {
                            if (statusCol) statusCol.innerHTML = `<span style="color: #ef4444; font-weight: 500;" title="${escapeHTML(data.conflicts.join(', '))}">⚠️ Manuelle Prüfung nötig</span>`;
                        }
                        if (previewBtn) {
                            previewBtn.dataset.previewReady = "true";
                            previewBtn.addEventListener("click", () => {
                                openStructurePreview(p);
                            });
                        }
                    } else {
                        if (statusCol) statusCol.innerHTML = `<span style="color: #ef4444;">Fehler</span>`;
                    }
                } catch (e) {
                    if (statusCol) statusCol.innerHTML = `<span style="color: #ef4444;">Fehler: ${escapeHTML(e.message)}</span>`;
                }

                processedCount++;
                const pct = Math.round((processedCount / paths.length) * 100);
                if (progressBar) progressBar.style.width = `${pct}%`;
                if (progressNum) progressNum.textContent = `${processedCount} / ${paths.length}`;
            }

            window.structureBatchBusy = false;
            if (tableBody) {
                tableBody.querySelectorAll(".batch-item-preview-btn").forEach(btn => {
                    if (btn.dataset && btn.dataset.previewReady === "true") {
                        btn.disabled = false;
                    }
                });
            }

            if (progressTitle) {
                if (safePaths.length === 0) {
                    progressTitle.innerHTML = `<span style="color: #ef4444; font-weight: 500;">Keine Ordnerstruktur automatisch auflösbar. Manuelle Prüfung bei allen Befunden nötig.</span>`;
                } else {
                    progressTitle.textContent = "Prüfung abgeschlossen.";
                }
            }
            if (confirmBatchBtn) {
                if (safePaths.length > 0) {
                    confirmBatchBtn.disabled = false;
                    confirmBatchBtn.textContent = `${safePaths.length} geprüfte Ordnerstrukturen auflösen`;
                } else {
                    confirmBatchBtn.disabled = true;
                    confirmBatchBtn.textContent = "Geprüfte Ordnerstrukturen auflösen";
                }

                confirmBatchBtn.replaceWith(confirmBatchBtn.cloneNode(true));
                const newConfirmBatchBtn = document.getElementById("btn-structure-batch-confirm");
                if (newConfirmBatchBtn) {
                    newConfirmBatchBtn.addEventListener("click", async () => {
                        window.structureBatchBusy = true;
                        newConfirmBatchBtn.disabled = true;
                        if (progressWrap) progressWrap.style.display = "block";
                        if (progressBar) progressBar.style.width = "0%";
                        if (progressTitle) progressTitle.textContent = "Löse Strukturen auf...";

                        let executedCount = 0;
                        for (let i = 0; i < safePaths.length; i++) {
                            const p = safePaths[i];
                            const row = tableBody ? findRowByPath(p) : null;
                            if (!row) continue;

                            const statusCol = row.querySelector(".batch-status-col");
                            if (statusCol) statusCol.innerHTML = `<span style="color: var(--accent);">Löse auf...</span>`;

                            try {
                                const res = await fetch("/api/nas/structure-fix/apply", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ path: p })
                                });
                                const data = await res.json();
                                if (data.ok) {
                                    if (statusCol) statusCol.innerHTML = `<span style="color: #10b981; font-weight: 600;">✓ Gelöst</span>`;
                                } else {
                                    if (statusCol) statusCol.innerHTML = `<span style="color: #ef4444;">Fehler: ${escapeHTML(data.message)}</span>`;
                                }
                            } catch (e) {
                                if (statusCol) statusCol.innerHTML = `<span style="color: #ef4444;">Fehler</span>`;
                            }

                            executedCount++;
                            const pct = Math.round((executedCount / safePaths.length) * 100);
                            if (progressBar) progressBar.style.width = `${pct}%`;
                            if (progressNum) progressNum.textContent = `${executedCount} / ${safePaths.length}`;
                        }

                        if (progressTitle) progressTitle.textContent = "Abarbeitung abgeschlossen.";
                        window.structureBatchBusy = false;
                        pollHealthStatus(false);

                        const doneBtn = newConfirmBatchBtn.cloneNode(true);
                        doneBtn.disabled = false;
                        doneBtn.textContent = "Fertig";
                        newConfirmBatchBtn.replaceWith(doneBtn);
                        doneBtn.addEventListener("click", () => {
                            const modal = document.getElementById("modal-structure-batch");
                            if (modal) {
                                modal.classList.remove("active");
                                modal.classList.add("hidden");
                            }
                        });
                    });
                }
            }
        }

        const libraryView = document.getElementById("view-library");
        if (libraryView && !libraryView.dataset) {
            libraryView.dataset = {};
        }
        if (libraryView && libraryView.dataset.structureFixDelegated !== "true") {
            libraryView.dataset.structureFixDelegated = "true";
            libraryView.addEventListener("click", (event) => {
                const previewBtn = event.target.closest(".health-structure-preview");
                if (previewBtn && libraryView.contains(previewBtn)) {
                    event.preventDefault();
                    openStructurePreview(previewBtn.getAttribute("data-path"));
                    return;
                }

                const applyBtn = event.target.closest(".health-structure-apply");
                if (applyBtn && libraryView.contains(applyBtn)) {
                    event.preventDefault();
                    if (window.structureBatchBusy) {
                        alert("Die Ordnerstruktur-Prüfung läuft noch. Bitte warte, bis sie abgeschlossen ist.");
                        return;
                    }
                    const path = applyBtn.getAttribute("data-path");
                    confirmDirectStructureFix(path).then(confirmed => {
                        if (confirmed) {
                            applyStructureFix(path, applyBtn);
                        }
                    });
                    return;
                }

                const batchBtn = event.target.closest("#btn-structure-batch-check");
                if (batchBtn && libraryView.contains(batchBtn)) {
                    event.preventDefault();
                    startStructureBatchCheck();
                }
            });
        }

        const closeBatchElements = ["close-modal-structure-batch", "btn-structure-batch-cancel"];
        closeBatchElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener("click", () => {
                    const modal = document.getElementById("modal-structure-batch");
                    if (modal) {
                        modal.classList.remove("active");
                        modal.classList.add("hidden");
                    }
                });
            }
        });

        document.querySelectorAll("#health-issues .health-fix-rename, #health-issues-structure .health-fix-rename").forEach(b => {
            b.addEventListener("click", async () => {
                const p = b.getAttribute("data-path");
                const issueType = b.getAttribute("data-type");
                const folderName = p.split("/").filter(Boolean).pop();

                const modal = document.getElementById("modal-health-rename");
                const pathEl = document.getElementById("health-rename-path");
                const mismatchOptions = document.getElementById("health-rename-mismatch-options");
                const customInput = document.getElementById("health-rename-custom-input");

                if (!modal || !pathEl) return;

                pathEl.textContent = p;
                customInput.value = folderName || "";

                // Mismatch-Optionen nur bei name_mismatch anzeigen
                if (issueType === "name_mismatch") {
                    mismatchOptions.style.display = "flex";

                    // Befülle die Details im Optionstext
                    // Suche die Videodatei im Pfad (Ordnername vs Videodatei)
                    const lblFolderTo = document.getElementById("lbl-rename-opt-folder-to-file");
                    const lblFileTo = document.getElementById("lbl-rename-opt-file-to-folder");
                    if (lblFolderTo) lblFolderTo.textContent = `Der Ordner wird an den Namen der Videodatei angepasst.`;
                    if (lblFileTo) lblFileTo.textContent = `Die Videodatei wird an den aktuellen Ordnernamen „${folderName}“ angepasst.`;
                } else {
                    mismatchOptions.style.display = "none";
                }

                modal.classList.remove("hidden");

                const cleanListeners = () => {
                    const cloneAndReplace = (id) => {
                        const el = document.getElementById(id);
                        if (!el) return null;
                        const clone = el.cloneNode(true);
                        el.parentNode.replaceChild(clone, el);
                        return clone;
                    };

                    return {
                        customBtn: cloneAndReplace("btn-rename-opt-custom"),
                        folderToBtn: cloneAndReplace("btn-rename-opt-folder-to-file"),
                        fileToBtn: cloneAndReplace("btn-rename-opt-file-to-folder"),
                        closeBtn: cloneAndReplace("btn-close-health-rename"),
                        cancelBtn: cloneAndReplace("btn-close-health-rename-cancel")
                    };
                };

                const btns = cleanListeners();

                const closeModal = () => {
                    modal.classList.add("hidden");
                };

                btns.closeBtn?.addEventListener("click", closeModal);
                btns.cancelBtn?.addEventListener("click", closeModal);

                const executeFix = async (body) => {
                    b.disabled = true;
                    closeModal();
                    try {
                        const res = await fetch("/api/nas/health-fix", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(body),
                        });
                        const data = await res.json();
                        if (data.ok) { pollHealthStatus(false); }
                        else { alert(data.message || "Fehler"); b.disabled = false; }
                    } catch (e) { alert("Fehler: " + e); b.disabled = false; }
                };

                if (issueType === "name_mismatch") {
                    btns.folderToBtn?.addEventListener("click", () => {
                        executeFix({ action: "rename_folder_to_file", path: p });
                    });
                    btns.fileToBtn?.addEventListener("click", () => {
                        executeFix({ action: "rename_file_to_folder", path: p });
                    });
                }

                btns.customBtn?.addEventListener("click", () => {
                    const customName = customInput.value.trim();
                    if (!customName) {
                        alert("Bitte einen Namen eingeben.");
                        return;
                    }
                    if (issueType === "name_mismatch") {
                        executeFix({ action: "rename_both", path: p, new_name: customName });
                    } else {
                        executeFix({ action: "rename_folder", path: p, new_name: customName });
                    }
                });
            });
        });

        document.querySelectorAll("#health-issues .health-artwork-search, #health-issues-structure .health-artwork-search").forEach(b => {
            b.addEventListener("click", () => {
                const p = b.getAttribute("data-path");
                const type = b.getAttribute("data-type");
                const typeLabel = HEALTH_TYPE_LABELS[type] || "Bild";
                alert(`Bildsuche (Phase 2.5c)\n\nDie automatische Online-Bildsuche mit Vorschau und Auswahl für „${typeLabel}“ wird in Phase 2.5c umgesetzt.\n\nDu kannst das Bild bis dahin manuell im Ordner ablegen:\n${p}`);
            });
        });

        document.querySelectorAll("#health-issues .health-fix-fsk, #health-issues-structure .health-fix-fsk").forEach(b => {
            b.addEventListener("click", () => {
                const scopeKind = b.getAttribute("data-scope-kind") || "single";
                const scope = (scopeKind === "series" || scopeKind === "season") ? scopeKind : "single";
                if (scope === "single") {
                    openNfoAgentModal(
                        b.getAttribute("data-agent-path") || b.getAttribute("data-season-path") || b.getAttribute("data-series-path") || b.getAttribute("data-path"),
                        scopeKind === "episode"
                            ? { mode: "episode", episodeFile: b.getAttribute("data-episode-file") || b.getAttribute("data-path") }
                            : { mode: "series" }
                    );
                    return;
                }
                const item = {
                    path: b.getAttribute("data-path"),
                    scope_kind: scopeKind,
                    series_path: b.getAttribute("data-series-path"),
                    season_path: b.getAttribute("data-season-path"),
                    media_kind: b.getAttribute("data-media-kind") || "unknown"
                };
                openFskBatchModal([item], "12", scope, item.media_kind);
            });
        });

        // Event-Listener für Serien-Gruppenaktion im Medienorientiert-Modus
        document.querySelectorAll("#health-issues .show-group-fsk-btn").forEach(b => {
            b.addEventListener("click", () => {
                const path = b.getAttribute("data-path");
                const selectEl = b.previousElementSibling;
                const fskVal = selectEl ? selectEl.value : "12";
                const item = {
                    series_path: path,
                    path: path,
                    media_kind: "series"
                };
                openFskBatchModal([item], fskVal, "series", "series");
            });
        });

        // Event-Listener für Staffel-Gruppenaktion im Medienorientiert-Modus
        document.querySelectorAll("#health-issues .season-group-fsk-btn").forEach(b => {
            b.addEventListener("click", () => {
                const path = b.getAttribute("data-path");
                const seriesPath = b.getAttribute("data-series-path");
                const selectEl = b.previousElementSibling;
                const fskVal = selectEl ? selectEl.value : "12";
                const item = {
                    season_path: path,
                    series_path: seriesPath,
                    path: path,
                    media_kind: "series" // Staffel gehört zu Serien
                };
                openFskBatchModal([item], fskVal, "season", "series");
            });
        });

        // Akkordeon-Zustand für Shows persistieren im Medienorientiert-Modus
        issuesEl.querySelectorAll("details[data-show-path]").forEach(detailsEl => {
            const path = detailsEl.getAttribute("data-show-path");
            detailsEl.addEventListener("toggle", () => {
                const key = `show:${path}`;
                if (detailsEl.open) {
                    if (!openTypes.includes(key)) openTypes.push(key);
                } else {
                    const idx = openTypes.indexOf(key);
                    if (idx !== -1) openTypes.splice(idx, 1);
                }
            });
        });
        issuesEl.querySelectorAll("details[data-movie-path]").forEach(detailsEl => {
            const path = detailsEl.getAttribute("data-movie-path");
            detailsEl.addEventListener("toggle", () => {
                const key = `movie:${path}`;
                if (detailsEl.open) {
                    if (!openTypes.includes(key)) openTypes.push(key);
                } else {
                    const idx = openTypes.indexOf(key);
                    if (idx !== -1) openTypes.splice(idx, 1);
                }
            });
        });

        wireIgnoreButtons(document.getElementById("view-library"), () => pollHealthStatus(false));
        wireRestoreAll(document.getElementById("view-library"));
    } else if (hasResult) {
        if (structureIssues && structureIssues.length > 0) {
            issuesEl.innerHTML = bannerHtml + `<p class="text-muted" style="margin:4px 0;">Keine Auffälligkeiten für einzelne Medien. Strukturprobleme findest du im Tab Struktur.</p>` + renderIgnoredFooter(data.ignored_count);
        } else {
            issuesEl.innerHTML = bannerHtml + `<p class="text-muted" style="margin:4px 0;">Keine Auffälligkeiten gefunden. 🎉</p>` + renderIgnoredFooter(data.ignored_count);
        }
        wireRestoreAll(issuesEl);
    } else if (bannerHtml) {
        issuesEl.innerHTML = bannerHtml;
    } else {
        issuesEl.innerHTML = "";
    }

    // 3. Scrollposition wiederherstellen
    if (hadDetails) {
        window.scrollTo(0, scrollTop);
    }
}

// Gemeinsame Helfer für die "Ignorieren"-Funktion (Health & Duplikate)
let currentHealthIgnoreScope = null;

function healthIssueBelongsToScope(issue, scopeKind, scopePath) {
    if (scopeKind === "series") {
        return issue.series_path === scopePath || (issue.scope_kind === "series" && issue.scope_path === scopePath);
    }
    if (scopeKind === "season") {
        return issue.season_path === scopePath || (issue.scope_kind === "season" && issue.scope_path === scopePath);
    }
    if (scopeKind === "episode") {
        return issue.episode_path === scopePath || (issue.scope_kind === "episode" && issue.scope_path === scopePath);
    }
    return issue.scope_kind === "movie" && issue.scope_path === scopePath;
}

function closeHealthIgnoreModal() {
    const modal = document.getElementById("modal-health-ignore");
    if (modal) {
        modal.classList.remove("active");
        modal.classList.add("hidden");
    }
    currentHealthIgnoreScope = null;
}

function updateHealthIgnoreSubmitState() {
    const groupList = document.getElementById("health-ignore-groups");
    const submit = document.getElementById("btn-health-ignore-submit");
    if (!groupList || !submit) return;
    const checked = groupList.querySelectorAll(".health-ignore-type:checked").length;
    submit.disabled = checked === 0;
}

// Sync group toggles (checked/indeterminate) and the select-all master with
// the individual issue-type checkboxes.
function syncHealthIgnoreToggleStates() {
    const groupList = document.getElementById("health-ignore-groups");
    if (!groupList) return;
    groupList.querySelectorAll(".health-ignore-group-toggle").forEach((toggle) => {
        const group = toggle.getAttribute("data-group");
        const types = Array.from(groupList.querySelectorAll(`.health-ignore-type[data-group="${group}"]`));
        toggle.checked = types.length > 0 && types.every((input) => input.checked);
        toggle.indeterminate = !toggle.checked && types.some((input) => input.checked);
    });
    const allTypes = Array.from(groupList.querySelectorAll(".health-ignore-type"));
    const selectAll = document.getElementById("health-ignore-select-all");
    if (selectAll) {
        selectAll.checked = allTypes.length > 0 && allTypes.every((input) => input.checked);
        selectAll.indeterminate = !selectAll.checked && allTypes.some((input) => input.checked);
    }
}

function openHealthIgnoreModal(scopeKind, scopePath) {
    const data = window.currentHealthStatusData || {};
    const issues = (data.issues || []).filter((issue) =>
        issue.ignoreable !== false && healthIssueBelongsToScope(issue, scopeKind, scopePath)
    );
    const catalogGroups = data.issue_catalog && data.issue_catalog.groups ? data.issue_catalog.groups : {};
    const catalogTypes = data.issue_catalog && data.issue_catalog.types ? data.issue_catalog.types : {};
    // One entry per issue type present in this scope, grouped by registry group.
    const typeEntries = {};
    issues.forEach((issue) => {
        const entry = typeEntries[issue.type] || {
            type: issue.type,
            group: getHealthIssueGroup(issue),
            label: catalogTypes[issue.type]?.label || issue.label || HEALTH_TYPE_LABELS[issue.type] || issue.type,
            count: 0,
        };
        entry.count += 1;
        typeEntries[issue.type] = entry;
    });
    const groupedTypes = {};
    Object.values(typeEntries).forEach((entry) => {
        (groupedTypes[entry.group] = groupedTypes[entry.group] || []).push(entry);
    });
    const groups = Object.keys(groupedTypes).sort((left, right) =>
        (catalogGroups[left]?.order || 999) - (catalogGroups[right]?.order || 999)
    );
    groups.forEach((group) => groupedTypes[group].sort((left, right) => left.label.localeCompare(right.label, "de")));
    currentHealthIgnoreScope = { scopeKind, scopePath };

    const scopeLabels = { series: "diese Serie", season: "diese Staffel", episode: "diese Folge", movie: "diesen Film" };
    const description = document.getElementById("health-ignore-description");
    const groupList = document.getElementById("health-ignore-groups");
    const error = document.getElementById("health-ignore-error");
    const selectAll = document.getElementById("health-ignore-select-all");
    if (description) description.textContent = `Wähle aus, welche Hinweise für ${scopeLabels[scopeKind] || "diesen Bereich"} künftig ausgeblendet werden sollen.`;
    if (error) {
        error.textContent = "";
        error.style.display = "none";
    }
    if (selectAll) {
        selectAll.checked = groups.length > 0;
        selectAll.indeterminate = false;
    }
    if (groupList) {
        groupList.innerHTML = groups.length
            ? groups.map((group) => {
                const groupLabel = catalogGroups[group]?.label || group;
                const typeRows = groupedTypes[group].map((entry) =>
                    `<label class="health-ignore-option"><input type="checkbox" class="health-ignore-type" value="${escapeHTML(entry.type)}" data-group="${escapeHTML(group)}" checked><span><strong>${escapeHTML(entry.label)}</strong><small>${entry.count} ${entry.count === 1 ? "Hinweis" : "Hinweise"}</small></span></label>`
                ).join("");
                return `<div class="health-ignore-group-block">
                            <label class="health-ignore-group-header"><input type="checkbox" class="health-ignore-group-toggle" data-group="${escapeHTML(group)}" checked><strong>${escapeHTML(groupLabel)}</strong></label>
                            <div class="health-ignore-group-types">${typeRows}</div>
                        </div>`;
            }).join("")
            : `<p class="text-muted">Für diesen Bereich sind keine ignorierbaren Hinweise vorhanden.</p>`;
    }
    updateHealthIgnoreSubmitState();
    const modal = document.getElementById("modal-health-ignore");
    if (modal) {
        modal.classList.remove("hidden");
        modal.classList.add("active");
    }
}

async function submitHealthIgnoreRule() {
    if (!currentHealthIgnoreScope) return;
    const groupList = document.getElementById("health-ignore-groups");
    const submit = document.getElementById("btn-health-ignore-submit");
    const error = document.getElementById("health-ignore-error");
    const issueTypes = Array.from(groupList?.querySelectorAll(".health-ignore-type:checked") || []).map((input) => input.value);
    if (!issueTypes.length) return;
    if (submit) submit.disabled = true;
    try {
        const response = await fetch("/api/findings/ignore-rules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                scope_kind: currentHealthIgnoreScope.scopeKind,
                scope_path: currentHealthIgnoreScope.scopePath,
                issue_types: issueTypes,
            }),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.message || "Die Hinweise konnten nicht ausgeblendet werden.");
        closeHealthIgnoreModal();
        await pollHealthStatus(false);
    } catch (err) {
        if (error) {
            error.textContent = err.message;
            error.style.display = "block";
        }
        if (submit) submit.disabled = false;
    }
}

function renderIgnoredFooter(count) {
    if (!count) return "";
    return `<p class="text-muted" style="margin:10px 0 0; font-size:0.82em;">
              ${count} Befund(e) ausgeblendet ·
              <a href="#" class="finding-restore-all" style="color:var(--accent);">↩︎ wieder einblenden</a>
            </p>`;
}

function wireIgnoreButtons(container, onDone) {
    container.querySelectorAll(".finding-ignore").forEach(b => {
        b.addEventListener("click", async () => {
            const key = b.getAttribute("data-key");
            if (!key) return;
            b.disabled = true;
            try {
                await fetch("/api/findings/ignore", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ key }),
                });
                if (onDone) onDone();
            } catch (e) { b.disabled = false; }
        });
    });
}

function wireRestoreAll(container) {
    const link = container.querySelector(".finding-restore-all");
    if (!link) return;
    link.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
            const res = await fetch("/api/findings/ignored", { method: "DELETE" });
            if (!res.ok) throw new Error("Ausgeblendete Hinweise konnten nicht wiederhergestellt werden.");
            pollHealthStatus(false);
            pollDuplicateStatus(false);
        } catch (err) {
            console.error(err);
        }
    });
}

// ==========================================================================
// Feature 4: NAS-weite Duplikat-Erkennung
// ==========================================================================
let duplicatePollTimer = null;

function fmtSize(bytes) {
    if (!bytes || bytes <= 0) return "0 MB";
    const gb = bytes / (1024 ** 3);
    if (gb >= 1) return gb.toFixed(2) + " GB";
    return (bytes / (1024 ** 2)).toFixed(0) + " MB";
}

// Beschriftet NAS-/Cloud-Schalter und Zielordner-Labels mit den tatsächlichen
// Speicherziel-Namen aus den Einstellungen (statt fix "NAS"/"pCloud").
// So heißt der Cloud-Schalter z.B. "Auch in Google Drive sichern", wenn das
// Cloud-Ziel entsprechend benannt ist.
async function applyStorageTargetLabels() {
    try {
        const res = await fetch("/api/settings");
        if (!res.ok) return;
        const settings = await res.json();
        const targets = settings.storage_targets || [];
        const nasT = targets.find(t => t.id === "nas") || targets.find(t => t.type === "nas");
        const cloudT = targets.find(t => t.id === "pcloud")
            || targets.find(t => (t.rclone_remote || "").trim() && t.id !== "nas");
        const nasName = (nasT && nasT.name) ? nasT.name : "NAS";
        const cloudName = (cloudT && cloudT.name) ? cloudT.name : "Cloud";
        document.querySelectorAll(".nas-target-name").forEach(el => { el.textContent = nasName; });
        document.querySelectorAll(".cloud-target-name").forEach(el => { el.textContent = cloudName; });
    } catch (e) {
        console.error("Speicherziel-Labels konnten nicht gesetzt werden:", e);
    }
}

function initDuplicateDashboard() {
    pollDuplicateStatus(false);
}

async function startDuplicateScan() {
    try {
        const res = await fetch("/api/nas/scan-duplicates", { method: "POST" });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            const statusEl = document.getElementById("duplicate-scan-status");
            if (statusEl) {
                statusEl.textContent = data.error || data.message || "Fehler beim Starten des Duplikat-Scans.";
            }
            return;
        }
        pollDuplicateStatus(true);
    } catch (e) {
        console.error("Duplikat-Scan konnte nicht gestartet werden:", e);
        const statusEl = document.getElementById("duplicate-scan-status");
        if (statusEl) {
            statusEl.textContent = "Fehler: Netzwerkfehler beim Starten des Duplikat-Scans.";
        }
    }
}

async function pollDuplicateStatus() {
    try {
        const res = await fetch("/api/nas/duplicates");
        if (!res.ok) return;
        const data = await res.json();
        renderDuplicateStatus(data);
        const running = data.status === "running";
        if (running) {
            clearTimeout(duplicatePollTimer);
            duplicatePollTimer = setTimeout(() => pollDuplicateStatus(true), 2000);
        }
    } catch (e) {
        console.error("Duplikat-Status konnte nicht geladen werden:", e);
    }
}

function renderDuplicateStatus(data) {
    const statusEl = document.getElementById("duplicate-scan-status");
    const progWrap = document.getElementById("duplicate-progress-wrap");
    const progBar = document.getElementById("duplicate-progress-bar");
    const summaryEl = document.getElementById("duplicate-summary");
    const groupsEl = document.getElementById("duplicate-groups");
    if (!statusEl || !summaryEl || !groupsEl) return;

    if (data.status === "warning") {
        statusEl.textContent = `Warnung: ${data.message || "Warnung beim Scan"}`;
        if (progWrap) progWrap.style.display = "none";

        const dupBadge = document.getElementById("badge-count-duplicates");
        if (dupBadge) dupBadge.style.display = "none";
        const overviewDuplicateSummary = document.getElementById("overview-duplicate-summary");
        if (overviewDuplicateSummary) overviewDuplicateSummary.textContent = "Keine Daten";

        let warningHtml = `<div class="alert alert-warning" style="margin:4px 0; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); color:#f59e0b; padding:10px; border-radius:var(--radius-sm); font-size:12px; display:flex; align-items:center; gap:8px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle" style="height:16px; width:16px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>Scan nicht aussagekräftig: keine Bibliotheksordner gefunden.</span>
        </div>`;
        groupsEl.innerHTML = warningHtml;
        summaryEl.innerHTML = "";
        return;
    }

    if (data.status === "running") {
        statusEl.textContent = data.message || "Scan läuft...";
        if (progWrap) progWrap.style.display = "block";
        if (progBar) progBar.style.width = `${data.progress || 0}%`;
        return;
    }
    if (progWrap) progWrap.style.display = "none";

    if (data.status === "error") {
        statusEl.textContent = `Fehler: ${data.message || data.error || "Unbekannt"}`;
        return;
    }

    const hasResult = data.finished_at || data.status === "done";
    if (!hasResult) {
        statusEl.textContent = "Noch kein Scan durchgeführt.";
        summaryEl.innerHTML = "";
        groupsEl.innerHTML = "";
        return;
    }

    const when = data.finished_at ? new Date(data.finished_at * 1000).toLocaleString("de-DE") : "";
    statusEl.textContent = data.message + (when ? ` (zuletzt: ${when})` : "");

    const groups = data.groups || [];

    const dupBadge = document.getElementById("badge-count-duplicates");
    if (dupBadge) {
        dupBadge.textContent = groups.length;
        dupBadge.style.display = groups.length > 0 ? "inline" : "none";
    }

    const overviewDuplicateSummary = document.getElementById("overview-duplicate-summary");
    if (overviewDuplicateSummary) {
        overviewDuplicateSummary.textContent = groups.length > 0 ? `${groups.length} doppelte Episode(n)` : "Keine Auffälligkeiten";
    }

    if (groups.length === 0) {
        summaryEl.innerHTML = "";
        statusEl.textContent = "";
        groupsEl.innerHTML = `<p class="text-muted" style="margin:4px 0; text-align: center;">Keine Duplikate gefunden.</p>`;
        return;
    }

    const sum = data.summary || { groups: 0, reclaimable_bytes: 0 };
    summaryEl.innerHTML = `<span style="font-size:0.9em;">
        <strong>${sum.groups || 0}</strong> auffällige Gruppe(n) · rückgewinnbar:
        <strong>${fmtSize(sum.reclaimable_bytes)}</strong></span>`;

    groupsEl.innerHTML = "";
    groups.forEach(g => {
        const card = document.createElement("div");
        card.style.cssText = "border:1px solid var(--border-light); border-radius:8px; padding:10px 12px;";
        const seLabel = `S${String(g.season).padStart(2, "0")}E${String(g.episode).padStart(2, "0")}`;
        const isCollision = g.kind === "collision";
        const headerColor = isCollision ? "#f59e0b" : "var(--text-main)";

        let html = `<div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px;">
                        <span style="font-weight:500; color:${headerColor};">${isCollision ? '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle" style="display:inline-block; vertical-align:middle; margin-right: 4px; color: #ffb300; height: 12px; width: 12px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>' : ""}${escapeHTML(g.category || "")} · ${escapeHTML(g.show)} ${seLabel}</span>
                        <button class="btn btn-secondary btn-sm finding-ignore" data-key="${escapeHTML(g.key || "")}" title="Diese Gruppe dauerhaft ausblenden" style="white-space:nowrap; display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-ban" style="height:12px; width:12px;"><circle cx="12" cy="12" r="10"/><line x1="4.93" x2="19.07" y1="4.93" y2="19.07"/></svg>Ignorieren</button>
                    </div>`;
        if (isCollision && g.note) {
            html += `<p class="text-muted" style="margin:0 0 8px; font-size:0.82em;">${escapeHTML(g.note)}</p>`;
        }
        html += `<div style="display:flex; flex-direction:column; gap:6px;">`;
        g.files.forEach(f => {
            const keep = f.recommended === "keep";
            let badge;
            if (isCollision) {
                badge = `<span style="color:#f59e0b; font-size:0.8em; white-space:nowrap;">prüfen</span>`;
            } else if (keep) {
                badge = `<span style="color:#10b981; font-size:0.8em; white-space:nowrap; display:inline-flex; align-items:center; gap:3px;"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check" style="height:11px; width:11px;"><path d="M20 6 9 17l-5-5"/></svg>behalten</span>`;
            } else {
                badge = `<span style="color:#f59e0b; font-size:0.8em; white-space:nowrap;">Duplikat</span>`;
            }
            const details = `${f.codec || "?"} · ${f.resolution || "?"} · ${fmtSize(f.size)}`;
            const openBtn = `<button class="btn btn-secondary btn-sm dup-open" data-path="${escapeHTML(f.path)}" style="white-space:nowrap; display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-open" style="height:12px; width:12px;"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>Öffnen</button>`;
            // Echtes Duplikat: nur die NICHT zu behaltende Datei löschbar.
            // Kollision: kein Auto-Vorschlag -> Löschen pro Datei manuell möglich.
            const showDelete = isCollision ? true : !keep;
            const delBtn = showDelete
                ? `<button class="btn btn-secondary btn-sm dup-delete" data-path="${escapeHTML(f.path)}" style="white-space:nowrap; color:#ef4444; display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2" style="height:12px; width:12px;"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>In Quarantäne</button>`
                : "";
            html += `<div class="dup-file-row" style="display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:0.88em; padding:4px 0; border-top:1px solid rgba(255,255,255,0.04);">
                        <span style="overflow:hidden; text-overflow:ellipsis;">${badge} &nbsp; ${escapeHTML(f.filename)}<br><span class="text-muted" style="font-size:0.85em;">${details}</span></span>
                        <span style="display:flex; gap:6px; white-space:nowrap;">${openBtn}${delBtn}</span>
                     </div>`;
        });
        html += `</div>`;
        card.innerHTML = html;

        // "Öffnen" öffnet den Ordner, in dem die Datei liegt
        card.querySelectorAll(".dup-open").forEach(b => {
            b.addEventListener("click", () => {
                const p = b.getAttribute("data-path");
                const folder = p.substring(0, p.lastIndexOf("/"));
                window.openFolder({ path: folder });
            });
        });
        card.querySelectorAll(".dup-delete").forEach(b => {
            b.addEventListener("click", () => resolveDuplicate(b.getAttribute("data-path"), b, card));
        });
        groupsEl.appendChild(card);
    });

    // Ignorieren-Footer + Verdrahtung (Gruppen ausblenden / wieder einblenden)
    const footer = document.createElement("div");
    footer.innerHTML = renderIgnoredFooter(data.ignored_count);
    groupsEl.appendChild(footer);
    wireIgnoreButtons(groupsEl, () => pollDuplicateStatus(false));
    wireRestoreAll(groupsEl);
}

async function resolveDuplicate(path, btn, card) {
    const name = path.split("/").pop();
    if (!confirm(`Diese Datei wirklich in Quarantäne verschieben?\n\n${name}\n\nBegleitdateien (NFO/Untertitel/Thumbnail) werden mitverschoben.`)) {
        return;
    }
    btn.disabled = true;
    btn.innerHTML = '<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-2" style="animation: spin 1s linear infinite; height: 12px; width: 12px;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Verschiebe...</span>';
    try {
        const res = await fetch("/api/nas/resolve-duplicate-global", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path }),
        });
        const data = await res.json();
        if (data.ok) {
            // Zeile entfernen; Gruppe entfernen, wenn nur noch eine Datei übrig ist
            const row = btn.closest(".dup-file-row");
            if (row) row.remove();
            const remaining = card.querySelectorAll(".dup-file-row").length;
            if (remaining <= 1) card.remove();
        } else {
            alert("Verschieben in Quarantäne fehlgeschlagen: " + (data.message || "Unbekannt"));
            btn.disabled = false;
            btn.innerHTML = '<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2" style="height:12px; width:12px;"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>In Quarantäne</span>';
        }
    } catch (e) {
        alert("Fehler beim Verschieben in Quarantäne: " + e);
        btn.disabled = false;
        btn.innerHTML = '<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2" style="height:12px; width:12px;"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>In Quarantäne</span>';
    }
}

// ==========================================================================
// Filme normalisieren (Genre-Ordner auflösen + lose Dateien einsammeln)
// ==========================================================================
let normalizePlan = [];

function initNormalizeTool() {
    const pv = document.getElementById("btn-normalize-preview");
    if (pv) pv.addEventListener("click", loadNormalizePreview);
    const ap = document.getElementById("btn-normalize-apply");
    if (ap) ap.addEventListener("click", applyNormalize);
}

async function loadNormalizePreview() {
    const statusEl = document.getElementById("normalize-status");
    const planEl = document.getElementById("normalize-plan");
    const applyWrap = document.getElementById("normalize-apply-wrap");
    if (statusEl) statusEl.textContent = "Analysiere…";
    if (planEl) planEl.innerHTML = "";
    if (applyWrap) applyWrap.style.display = "none";
    try {
        const res = await fetch("/api/nas/normalize-films/preview", { method: "POST" });
        const data = await res.json();
        if (!res.ok || data.error) {
            if (statusEl) {
                statusEl.innerHTML = `<span style="color:#f59e0b;">Warnung: ${escapeHTML(data.error || "Keine Bibliotheksordner gefunden.")}</span>`;
            }
            if (planEl) {
                planEl.innerHTML = `<div class="alert alert-warning" style="margin:4px 0; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); color:#f59e0b; padding:10px; border-radius:var(--radius-sm); font-size:12px;">Scan nicht aussagekräftig: keine Bibliotheksordner gefunden.</div>`;
            }
            if (applyWrap) applyWrap.style.display = "none";
            return;
        }
        normalizePlan = data.plan || [];
        renderNormalizePlan(normalizePlan);
    } catch (e) {
        if (statusEl) statusEl.textContent = "Fehler bei der Vorschau.";
    }
}

function renderNormalizePlan(plan) {
    const statusEl = document.getElementById("normalize-status");
    const planEl = document.getElementById("normalize-plan");
    const applyWrap = document.getElementById("normalize-apply-wrap");
    if (!planEl) return;
    if (!plan.length) {
        if (statusEl) statusEl.textContent = "Keine Auffälligkeiten gefunden.";
        planEl.innerHTML = "";
        if (applyWrap) applyWrap.style.display = "none";
        return;
    }
    const conflicts = plan.filter(p => p.conflict).length;
    if (statusEl) {
        const word = plan.length === 1 ? "Vorschlag" : "Vorschläge";
        statusEl.textContent = `${plan.length} ${word}` + (conflicts ? ` · ${conflicts} mit Konflikt (übersprungen)` : "");
    }
    planEl.innerHTML = plan.map((p, i) => {
        const attr = p.conflict ? "disabled" : "checked";
        const warn = p.conflict ? ` <span style="color:#ef4444;">(Ziel existiert bereits)</span>` : "";
        const kindBadge = p.kind === "genre" ? "Genre" : "lose";
        return `<label style="display:flex; gap:8px; align-items:flex-start; font-size:0.85em; padding:4px 0; border-top:1px solid rgba(255,255,255,0.04);">
                    <input type="checkbox" class="normalize-item" data-idx="${i}" ${attr} style="margin-top:3px;">
                    <span><span class="text-muted">${kindBadge}</span> ${escapeHTML(p.label)}${warn}</span>
                </label>`;
    }).join("");
    if (applyWrap) applyWrap.style.display = "block";
    planEl.querySelectorAll(".normalize-item").forEach(cb => cb.addEventListener("change", updateNormalizeApplyCount));
    updateNormalizeApplyCount();
}

function updateNormalizeApplyCount() {
    const n = document.querySelectorAll(".normalize-item:checked").length;
    const btn = document.getElementById("btn-normalize-apply");
    if (btn) { btn.textContent = `${n} Änderungen anwenden`; btn.disabled = n === 0; }
}

async function waitForQueueJob(taskId, { intervalMs = 2000, timeoutMs = 10 * 60 * 1000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let notFoundCount = 0;
    while (Date.now() < deadline) {
        try {
            const res = await fetch("/api/queue");
            if (res.ok) {
                const data = await res.json();
                const job = (data.jobs || []).find(j => j.id === taskId);
                if (job) {
                    notFoundCount = 0;
                    if (job.status !== "queued" && job.status !== "running") return job;
                } else if (++notFoundCount >= 3) {
                    // Job ist aus der Queue verschwunden (z. B. geleert) — nicht ewig warten
                    return null;
                }
            }
        } catch (e) {
            // Netzwerk-Aussetzer beim Polling ignorieren, nächster Versuch folgt
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    console.warn(`waitForQueueJob: Timeout beim Warten auf Job ${taskId}`);
    return null;
}

async function applyNormalize() {
    const idxs = Array.from(document.querySelectorAll(".normalize-item:checked"))
        .map(cb => parseInt(cb.getAttribute("data-idx")));
    const items = idxs.map(i => normalizePlan[i]).filter(Boolean);
    if (!items.length) return;
    if (!confirm(`${items.length} Verschiebung(en) jetzt ausführen?\n\nDateien werden auf dem NAS verschoben. Es wird nichts überschrieben.`)) return;
    const btn = document.getElementById("btn-normalize-apply");
    if (btn) { btn.disabled = true; btn.textContent = "Verschiebe…"; }
    try {
        const res = await fetch("/api/nas/normalize-films/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items }),
        });
        const data = await res.json();
        if (data.ok) {
            const statusEl = document.getElementById("normalize-status");
            if (statusEl) statusEl.textContent = "In die Warteschlange eingereiht – Fortschritt im Queue-Panel.";
            window.openQueue();
            pollQueue();
            // Vorschau erst neu laden, wenn der Verschiebe-Job wirklich fertig ist
            // (fester 3s-Timeout zeigte vorher den alten Stand, weil der Job länger läuft)
            if (data.task_id) {
                await waitForQueueJob(data.task_id);
            }
            loadNormalizePreview();
        } else {
            const statusEl = document.getElementById("normalize-status");
            if (statusEl) statusEl.textContent = data.message || "Fehler beim Anwenden.";
            if (btn) { btn.disabled = false; }
        }
    } catch (e) {
        const statusEl = document.getElementById("normalize-status");
        if (statusEl) statusEl.textContent = "Fehler beim Anwenden.";
        if (btn) { btn.disabled = false; }
    }
}

function openToolRunnerModal(toolType, title, desc, hasQualitySlider = false, presetPath = null) {
    window.currentActiveTool = toolType;

    const titleEl = document.getElementById("tool-modal-title");
    const descEl = document.getElementById("tool-modal-desc");
    const pathInput = document.getElementById("tool-modal-target-path");
    const extraOpt = document.getElementById("tool-modal-extra-options");
    const modal = document.getElementById("modal-tool-runner");

    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = desc;
    if (pathInput) {
        pathInput.value = presetPath || currentProject || (currentSettings ? currentSettings.inbox_dir : "");
    }

    if (extraOpt) {
        if (hasQualitySlider) {
            extraOpt.innerHTML = `
                <div class="quality-slider-container form-group" style="margin-top: 15px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <label for="tool-modal-quality-slider" style="font-weight: 500;">Konvertierungs-Qualität (Qualitätswert):</label>
                        <span id="tool-modal-quality-val" style="font-weight: bold; color: var(--accent);">60</span>
                    </div>
                    <input type="range" id="tool-modal-quality-slider" min="10" max="100" value="60" step="1" style="width: 100%; margin-top: 5px;">
                    <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted); margin-top: 4px;">
                        <span>Schneller / Kleinere Datei (10)</span>
                        <span>Sehr hohe Qualität / Große Datei (100)</span>
                    </div>
                </div>
            `;
            extraOpt.style.display = "block";
            const slider = document.getElementById("tool-modal-quality-slider");
            const valText = document.getElementById("tool-modal-quality-val");
            if (slider && valText) {
                // Initialen Wert setzen
                updateQualityIndicator(slider.value, "tool-modal-quality-val");
                slider.addEventListener("input", () => {
                    updateQualityIndicator(slider.value, "tool-modal-quality-val");
                });
            }
        } else if (toolType === "tool_manual_sync") {
            extraOpt.innerHTML = `
                <div class="form-group" style="margin-top: 15px;">
                    <label style="font-weight: 500;">Kategorie wählen:</label>
                    <select id="tool-modal-sync-category" class="form-select inline-style-40"></select>
                </div>
                <div class="form-group" style="margin-top: 15px;">
                    <label style="font-weight: 500;">Speicherziele aktivieren:</label>
                    <div id="tool-modal-sync-targets" style="display: flex; flex-direction: column; gap: 8px; margin-top: 5px;"></div>
                </div>
            `;
            extraOpt.style.display = "block";

            const catSelect = document.getElementById("tool-modal-sync-category");
            if (currentSettings && currentSettings.sync_categories) {
                currentSettings.sync_categories.forEach(c => {
                    const opt = document.createElement("option");
                    opt.value = c.id;
                    opt.textContent = c.name;
                    catSelect.appendChild(opt);
                });
            }

            const targetsDiv = document.getElementById("tool-modal-sync-targets");
            if (currentSettings && currentSettings.storage_targets) {
                currentSettings.storage_targets.forEach(t => {
                    if (t.enabled === false) return;

                    const label = document.createElement("label");
                    label.className = "checkbox-container";

                    const input = document.createElement("input");
                    input.type = "checkbox";
                    input.id = `tool-sync-target-${t.id}`;
                    input.value = t.id;
                    input.checked = true;

                    const span = document.createElement("span");
                    span.className = "checkmark";

                    label.appendChild(input);
                    label.appendChild(span);
                    label.appendChild(document.createTextNode(" " + (t.name || t.id)));

                    targetsDiv.appendChild(label);
                });
            }
        } else {
            extraOpt.innerHTML = "";
            extraOpt.style.display = "none";
        }
    }

    if (modal) modal.classList.add("active");
}

function openProfilesModal() {
    const modal = document.getElementById("modal-profiles");
    if (modal) {
        modal.classList.add("active");
        loadProfilesInModal();
    }
}

async function loadProfilesInModal() {
    const container = document.getElementById("profiles-list-container");
    if (!container) return;

    container.innerHTML = `<div style="color:var(--text-muted); font-size:13px; padding:10px; text-align:center;">Lade Profile...</div>`;

    try {
        const res = await fetch("/api/profiles");
        const data = await res.json();

        if (!data.profiles || data.profiles.length === 0) {
            container.innerHTML = `<div style="color:var(--text-muted); font-size:13px; padding:20px; text-align:center;">Keine gespeicherten Profile gefunden.</div>`;
            return;
        }

        // Sortieren
        data.profiles.sort((a, b) => {
            const nameA = a.data.show_name || a.filename;
            const nameB = b.data.show_name || b.filename;
            return nameA.localeCompare(nameB);
        });

        let html = "";
        data.profiles.forEach(p => {
            const displayName = p.data.show_name || p.filename.replace(".json", "");
            const info = `ID: ${p.data.show_id || 'N/A'} | Provider: ${p.data.provider || 'N/A'}`;
            html += `
                <div class="profile-card" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-glass); border-radius: 6px; gap: 10px;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; color: var(--text-main); font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${displayName}</div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${info}</div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary btn-sm" onclick="loadProfileFromModal('${p.filename.replace(/'/g, "\\'")}', '${displayName.replace(/'/g, "\\'")}', ${p.data.show_id || null}, '${p.data.provider || ''}')" title="Auf Startseite laden" style="padding: 4px 8px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-open" style="height:12px; width:12px;"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>Laden
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteProfileFromModal('${p.filename.replace(/'/g, "\\'")}', '${displayName.replace(/'/g, "\\'")}')" title="Profil löschen" style="padding: 4px 8px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2" style="height:12px; width:12px;"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                        </button>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch(err) {
        console.error("Fehler beim Laden der Profile im Modal:", err);
        container.innerHTML = `<div style="color:var(--danger); font-size:13px; padding:10px; text-align:center;">Fehler beim Laden der Profile.</div>`;
    }
}

async function deleteProfileFromModal(filename, displayName) {
    if (!confirm(`Möchtest du das Profil für "${displayName}" wirklich löschen?`)) return;

    try {
        const response = await fetch("/api/profiles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete", filename: filename })
        });
        const data = await response.json();
        if (data.status === "success") {
            loadProfilesInModal();
            // Haupt-Dropdown ebenfalls aktualisieren falls vorhanden
            if (typeof populateLocalProfilesDropdown === "function") {
                populateLocalProfilesDropdown();
            }
        } else {
            alert("Fehler beim Löschen des Profils.");
        }
    } catch (e) {
        console.error("Fehler beim Löschen des Profils:", e);
    }
}

function loadProfileFromModal(filename, displayName, showId, provider) {
    // Schließe Modal
    const modal = document.getElementById("modal-profiles");
    if (modal) modal.classList.remove("active");

    // Wechsle zur Startseite
    const homeBtn = document.getElementById("master-btn-home");
    if (homeBtn) homeBtn.click();

    // Lade Show mit selectShow
    const showObj = {
        id: showId || "",
        provider: provider || "tmdb",
        name: displayName || "",
        year: "",
        plot: "",
        poster: ""
    };
    selectShow(showObj);
}

// Global registrieren, damit Inline-onclicks funktionieren
window.loadProfileFromModal = loadProfileFromModal;
window.deleteProfileFromModal = deleteProfileFromModal;

// Sidebar Drag & Drop to merge folders
function initSidebarDragAndDrop() {
    const container = document.getElementById("project-list-container");
    if (!container) return;

    let draggedProject = null;

    // Use event delegation for all drag/drop events
    container.addEventListener("dragstart", (e) => {
        const item = e.target.closest(".project-item");
        if (item && item.getAttribute("draggable") === "true") {
            draggedProject = item.getAttribute("data-project");
            e.dataTransfer.setData("text/plain", draggedProject);
            e.dataTransfer.effectAllowed = "move";
            item.classList.add("dragging");
        }
    });

    container.addEventListener("dragend", (e) => {
        const item = e.target.closest(".project-item");
        if (item) {
            item.classList.remove("dragging");
        }
        container.querySelectorAll(".project-item").forEach(el => el.classList.remove("drag-hover"));
        draggedProject = null;
    });

    container.addEventListener("dragover", (e) => {
        const targetItem = e.target.closest(".project-item");
        if (targetItem && targetItem.getAttribute("draggable") === "true" && draggedProject) {
            const targetProject = targetItem.getAttribute("data-project");
            if (targetProject !== draggedProject) {
                e.preventDefault();
                targetItem.classList.add("drag-hover");
            }
        }
    });

    container.addEventListener("dragleave", (e) => {
        const targetItem = e.target.closest(".project-item");
        if (targetItem && !targetItem.contains(e.relatedTarget)) {
            targetItem.classList.remove("drag-hover");
        }
    });

    container.addEventListener("drop", async (e) => {
        e.preventDefault();
        const targetItem = e.target.closest(".project-item");
        if (targetItem) {
            targetItem.classList.remove("drag-hover");
            const targetProject = targetItem.getAttribute("data-project");
            const sourceProject = e.dataTransfer.getData("text/plain") || draggedProject;

            if (sourceProject && targetProject && sourceProject !== targetProject) {
                const skipConfirm = localStorage.getItem("skipMergeConfirm") === "true";
                let confirmed = skipConfirm;
                if (!confirmed) {
                    confirmed = await showMergeConfirmModal(sourceProject, targetProject);
                }

                if (confirmed) {
                    await mergeProjects(sourceProject, targetProject);
                }
            }
        }
    });
}

function showMergeConfirmModal(source, target) {
    return new Promise((resolve) => {
        const modal = document.getElementById("modal-confirm-merge");
        const textEl = document.getElementById("confirm-merge-text");
        const btnCancel = document.getElementById("btn-cancel-merge");
        const btnClose = document.getElementById("close-modal-confirm-merge");
        const btnConfirm = document.getElementById("btn-confirm-merge-execute");
        const skipCb = document.getElementById("confirm-merge-skip-cb");

        if (!modal || !textEl || !btnCancel || !btnConfirm) {
            resolve(confirm(`Möchtest du den Ordner "${source}" in den Ordner "${target}" verschieben und mit ihm zusammenführen?`));
            return;
        }

        textEl.textContent = `Möchtest du den Ordner "${source}" in den Ordner "${target}" verschieben und mit ihm zusammenführen?`;
        if (skipCb) skipCb.checked = false;

        modal.classList.add("active");

        const cleanup = (result) => {
            modal.classList.remove("active");
            btnCancel.removeEventListener("click", onCancel);
            if (btnClose) btnClose.removeEventListener("click", onCancel);
            btnConfirm.removeEventListener("click", onConfirm);

            if (result && skipCb && skipCb.checked) {
                localStorage.setItem("skipMergeConfirm", "true");
            }

            resolve(result);
        };

        function onCancel() {
            cleanup(false);
        }

        function onConfirm() {
            cleanup(true);
        }

        btnCancel.addEventListener("click", onCancel);
        if (btnClose) btnClose.addEventListener("click", onCancel);
        btnConfirm.addEventListener("click", onConfirm);
    });
}

async function mergeProjects(source, target) {
    appendConsoleLog(`[System]: Führe Ordner zusammen: "${source}" -> "${target}"...`);
    try {
        const response = await fetch("/api/merge-projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: source, target: target })
        });
        const data = await response.json();
        if (data.status === "success") {
            appendConsoleLog(`Ordner erfolgreich zusammengeführt.`);
            if (typeof loadStatus === "function") {
                await loadStatus();
            }
            if (currentProject === source) {
                selectProject(target);
            } else if (currentProject === target) {
                scanProject(target);
            }
        } else {
            appendConsoleLog(`❌ Fehler beim Zusammenführen: ${data.error || "Unbekannter Fehler"}`);
            alert(`Fehler beim Zusammenführen: ${data.error || "Unbekannter Fehler"}`);
        }
    } catch (e) {
        console.error("Error merging projects:", e);
        appendConsoleLog(`❌ Fehler: ${e.message}`);
        alert(`Fehler: ${e.message}`);
    }
}

// Initialize Drag & Drop and Reset Button
document.addEventListener("DOMContentLoaded", () => {
    initSidebarDragAndDrop();

    const btnResetMerge = document.getElementById("btn-reset-merge-confirm");
    if (btnResetMerge) {
        btnResetMerge.addEventListener("click", () => {
            localStorage.removeItem("skipMergeConfirm");
            alert("Bestätigungs-Dialog beim Zusammenführen von Ordnern wurde erfolgreich reaktiviert!");
        });
    }
});


window.clearSelectedShow = function() {
    window.selectedShow = null;
    const panel = document.getElementById("selected-show-panel");
    if (panel) panel.classList.add("hidden");

    const clearBtn = document.getElementById("btn-clear-profile-selection");
    if (clearBtn) clearBtn.classList.add("hidden");

    const localProfileSelect = document.getElementById("series-local-profile-select");
    if (localProfileSelect) localProfileSelect.value = "";

    const overrideInput = document.getElementById("series-nas-folder-override");
    if (overrideInput) {
        overrideInput.value = "";
        window.nasFolderSelected = "";
    }

    const matchingContainer = document.getElementById("matching-panel-container");
    if (matchingContainer) matchingContainer.innerHTML = "";

    const execPanel = document.getElementById("series-execution-panel");
    if (execPanel) execPanel.classList.add("hidden");

    const seriesNfoTitle = document.getElementById("series-nfo-title");
    const seriesNfoYear = document.getElementById("series-nfo-year");
    const seriesNfoPlot = document.getElementById("series-nfo-plot");
    if (seriesNfoTitle) seriesNfoTitle.value = "";
    if (seriesNfoYear) seriesNfoYear.value = "";
    if (seriesNfoPlot) seriesNfoPlot.value = "";

    fetchNasSeasons();
};

window.clearNasOverride = function() {
    const overrideInput = document.getElementById("series-nas-folder-override");
    if (overrideInput && selectedShow) {
        overrideInput.value = cleanSeriesName(selectedShow.name);
        window.nasFolderSelected = ""; // Clear polluted saved state
        window.disableNasFuzzyMatch = true; // Prevent backend from re-matching the wrong folder

        // Visual flash to indicate reset
        overrideInput.classList.remove("highlight-match-flash");
        void overrideInput.offsetWidth;
        overrideInput.classList.add("highlight-match-flash");
        setTimeout(() => {
            overrideInput.classList.remove("highlight-match-flash");
        }, 1500);

        // Re-fetch NAS info and reset duplicates
        fetchNasSeasons();

        // If we are currently showing episodes, we must re-trigger match to clear duplicate warnings
        const execPanel = document.getElementById("series-execution-panel");
        if (execPanel && !execPanel.classList.contains("hidden")) {
            const btn = document.getElementById("btn-fetch-episodes");
            if (btn) btn.click();
        }
    }
};

// ==========================================
// Docker Trash & Quarantine Management
// ==========================================

let trashCleanupInterval = null;
let trashCleanupStartedAt = null;

async function loadTrashStats() {
    const statsTextEl = document.getElementById("trash-stats-text");
    if (!statsTextEl) return;

    try {
        const response = await fetch("/api/system/trash/stats");
        if (response.ok) {
            const data = await response.json();
            if (data.error) {
                statsTextEl.innerHTML = `<span class="text-danger">Fehler: ${data.error}</span>`;
                return;
            }
            const sizeMB = (data.bytes / (1024 * 1024)).toFixed(2);
            statsTextEl.textContent = `${data.count} Dateien (${sizeMB} MB) in der Quarantäne.`;
        } else {
            statsTextEl.textContent = "Fehler beim Laden der Quarantäne-Statistiken.";
        }
    } catch (error) {
        console.error("Error loading trash stats:", error);
        statsTextEl.textContent = "Fehler beim Laden der Quarantäne-Statistiken.";
    }
}

async function probeTrash() {
    const btnProbe = document.getElementById("btn-trash-probe");
    const previewListEl = document.getElementById("trash-preview-list");
    const retentionInput = document.getElementById("settings-trash-retention-days");
    const modal = document.getElementById("modal-trash-preview");

    if (btnProbe) {
        btnProbe.disabled = true;
        btnProbe.innerHTML = '<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-2" style="animation: spin 1s linear infinite; height: 12px; width: 12px;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Prüfe...</span>';
    }

    const val = parseInt(retentionInput?.value, 10);
    const retentionDays = isNaN(val) ? 7 : val;

    try {
        const response = await fetch("/api/system/trash/cleanup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dry_run: true, retention_days: retentionDays })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.deleted && data.deleted.length > 0) {
                previewListEl.textContent = data.deleted.join("\n");
                document.getElementById("btn-trash-preview-confirm").disabled = false;
            } else {
                previewListEl.textContent = "Keine abgelaufenen Elemente gefunden.";
                document.getElementById("btn-trash-preview-confirm").disabled = true;
            }
            if (modal) modal.classList.add("active");
        } else {
            const data = await response.json();
            alert("Fehler bei der Papierkorb-Prüfung: " + (data.error || response.statusText));
        }
    } catch (error) {
        console.error("Error probing trash:", error);
        alert("Error probing trash: " + error.message);
    } finally {
        if (btnProbe) {
            btnProbe.disabled = false;
            btnProbe.innerHTML = '<span style="display:inline-flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search" style="height:12px; width:12px;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>Prüfen</span>';
        }
    }
}

async function triggerTrashCleanup() {
    const retentionInput = document.getElementById("settings-trash-retention-days");
    const val = parseInt(retentionInput?.value, 10);
    const retentionDays = isNaN(val) ? 7 : val;

    try {
        const response = await fetch("/api/system/trash/cleanup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dry_run: false, retention_days: retentionDays })
        });

        if (response.status === 409) {
            alert("Ein Bereinigungslauf ist bereits aktiv.");
            return;
        }

        if (response.ok) {
            // Start polling
            const progressDiv = document.getElementById("trash-cleanup-progress");
            if (progressDiv) progressDiv.classList.remove("hidden");

            const btnCleanup = document.getElementById("btn-trash-cleanup");
            if (btnCleanup) btnCleanup.disabled = true;

            document.getElementById("trash-cleanup-progress-bar").style.width = "0%";
            document.getElementById("trash-cleanup-status-info").textContent = "Löschvorgang gestartet...";

            trashCleanupStartedAt = Date.now();
            document.getElementById("trash-stuck-warning").classList.add("hidden");

            if (trashCleanupInterval) clearInterval(trashCleanupInterval);
            trashCleanupInterval = setInterval(pollTrashCleanupStatus, 2000);
        } else {
            const data = await response.json();
            alert("Fehler beim Starten der Bereinigung: " + (data.error || response.statusText));
        }
    } catch (error) {
        console.error("Error starting trash cleanup:", error);
        alert("Error starting trash cleanup: " + error.message);
    }
}

async function pollTrashCleanupStatus() {
    try {
        const response = await fetch("/api/system/trash/cleanup-status");
        if (response.ok) {
            const status = await response.json();

            // Stuck warning check (after 5 minutes = 300 seconds)
            if (status.running) {
                const elapsedSeconds = (Date.now() - trashCleanupStartedAt) / 1000;
                if (elapsedSeconds > 300) {
                    document.getElementById("trash-stuck-warning").classList.remove("hidden");
                } else {
                    document.getElementById("trash-stuck-warning").classList.add("hidden");
                }

                // Show simple progress indicator
                document.getElementById("trash-cleanup-progress-bar").style.width = "50%";
                document.getElementById("trash-cleanup-status-info").textContent = `${status.deleted_count || 0} Elemente gelöscht...`;
            } else {
                // Done
                clearInterval(trashCleanupInterval);
                trashCleanupInterval = null;

                document.getElementById("trash-cleanup-progress-bar").style.width = "100%";
                document.getElementById("trash-cleanup-status-info").textContent = `Fertig. ${status.deleted_count} gelöscht.`;

                if (status.last_error) {
                    alert("Bereinigung abgeschlossen mit Fehlern: " + status.last_error);
                }

                setTimeout(() => {
                    document.getElementById("trash-cleanup-progress").classList.add("hidden");
                    const btnCleanup = document.getElementById("btn-trash-cleanup");
                    if (btnCleanup) btnCleanup.disabled = false;
                }, 4000);

                loadTrashStats();
            }
        }
    } catch (error) {
        console.error("Error polling trash cleanup status:", error);
    }
}

// Bind Trash Events
document.addEventListener("DOMContentLoaded", () => {
    const btnProbe = document.getElementById("btn-trash-probe");
    const btnCleanup = document.getElementById("btn-trash-cleanup");
    const modal = document.getElementById("modal-trash-preview");

    if (btnProbe) btnProbe.addEventListener("click", probeTrash);
    if (btnCleanup) {
        btnCleanup.addEventListener("click", () => {
            if (confirm("Möchtest du alle abgelaufenen Elemente in der Quarantäne wirklich endgültig löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.")) {
                triggerTrashCleanup();
            }
        });
    }

    // Close Modal Bindings
    const closeModal = () => { if (modal) modal.classList.remove("active"); };
    document.getElementById("close-modal-trash-preview")?.addEventListener("click", closeModal);
    document.getElementById("btn-trash-preview-cancel")?.addEventListener("click", closeModal);
    document.getElementById("btn-trash-preview-confirm")?.addEventListener("click", () => {
        closeModal();
        triggerTrashCleanup();
    });
});

// Dashboard Widget Visibility Management
function applyDashboardWidgetsSichtbarkeit() {
    // Widgets sind jetzt fest in die jeweiligen Views integriert und nicht mehr ausblendbar.
}

async function saveDashboardWidgetSichtbarkeit(key, enabled) {
    // Sichtbarkeits-Einstellungen werden nicht mehr verwendet.
}

// Bind Dashboard Customize Events (No-Op, da Widgets fest integriert)
document.addEventListener("DOMContentLoaded", () => {
    // Events fuer Customization Panel entfallen
});


// --- NFO Agent Dedicated Modal Controller ---
let nfoAgentCurrentPath = null;
let nfoAgentScanData = null;
let nfoAgentLogInterval = null;

let nfoAgentProfileId = "";
let nfoAgentProfileProvider = "";
let nfoAgentFieldSources = {};
let nfoAgentEditContext = { originMode: "full", mode: "full", episodeFile: "", seasonName: "" };
let nfoAgentHasRenderedMainNfo = false;

const NFO_AGENT_SOURCE_LABELS = {
    existing_nfo: "aus vorhandener NFO",
    metadata_provider: "vom Metadatendienst",
    manual: "manuell",
    profile: "aus Serienprofil",
    missing: "Noch keine Angabe",
    metadata_provider_missing: "Metadatensuche liefert keine Angabe"
};

function setNfoAgentFieldSource(field, source) {
    nfoAgentFieldSources[field] = source || "missing";
    const label = document.getElementById(`nfo-agent-${field}-source`);
    if (label) label.textContent = NFO_AGENT_SOURCE_LABELS[nfoAgentFieldSources[field]] || "Noch keine Angabe";
}

function updateNfoAgentCompletenessWarning() {
    const mediaType = document.getElementById("nfo-agent-media-type")?.value;
    const mode = nfoAgentEditContext.mode;
    // Only fields the current mode actually shows and submits count as missing.
    const includeMainFields = mediaType !== "tvshow" || mode === "series" || mode === "full";
    const missing = [];

    if (includeMainFields) {
        [
            ["Titel", document.getElementById("nfo-agent-show-title")?.value],
            ["Jahr", document.getElementById("nfo-agent-show-year")?.value],
            ["Plot", document.getElementById("nfo-agent-show-plot")?.value],
            ["Genre", document.getElementById("nfo-agent-show-genres")?.value],
            ["FSK", document.getElementById("nfo-agent-show-fsk")?.value]
        ].forEach(([label, value]) => {
            if (!String(value || "").trim()) missing.push(label);
        });
    }

    if (mediaType === "tvshow" && mode !== "series") {
        document.querySelectorAll("#nfo-agent-episodes-list .nfo-episode-row").forEach((row) => {
            if (row.style.display === "none") return;
            const mappingSelect = row.querySelector(".nfo-agent-ep-mapping-select");
            if (mappingSelect && mappingSelect.value === "skip") return;
            const episodeValues = [
                row.querySelector(".nfo-agent-ep-override-title")?.value,
                row.querySelector(".nfo-agent-ep-override-plot")?.value,
                row.querySelector(".nfo-agent-ep-override-fsk")?.value
            ];
            if (!episodeValues.every((value) => String(value || "").trim())) {
                missing.push(row.getAttribute("data-file") || "Folge");
            }
        });
    }

    const submit = document.getElementById("btn-nfo-agent-submit");
    const status = document.getElementById("nfo-agent-main-nfo-current-status");
    if (!submit) return missing;

    if (missing.length === 0) {
        submit.textContent = "Metadaten übernehmen";
        if (includeMainFields && status && !["missing", "unreadable"].includes(status.dataset.nfoState || "")) {
            status.textContent = "Metadaten vollständig";
            status.className = "nfo-agent-status nfo-agent-status-success";
        }
    } else {
        submit.textContent = "Trotz unvollständiger Metadaten fortfahren";
        if (includeMainFields && status && !["missing", "unreadable"].includes(status.dataset.nfoState || "")) {
            status.textContent = "Metadaten unvollständig";
            status.className = "nfo-agent-status nfo-agent-status-warning";
        }
    }
    return missing;
}

function normalizeProvider(prov) {
    if (!prov) return "";
    let p = prov.toLowerCase();
    if (p === "tmdb") {
        const type = document.getElementById("nfo-agent-media-type").value;
        return type === "movie" ? "tmdb_movie" : "tmdb_tv";
    }
    if (p === "tmdb_tv_en") return "tmdb_tv";
    return p;
}

let wasFskModalOpenForNfoAgent = false;
let nfoAgentJobSuccess = false;
let nfoAgentJobErrorMsg = null;

function getEpisodeContextKey(file) {
    const basename = String(file || "").split(/[\\/]/).pop() || "";
    return basename.replace(/\.(?:nfo|mkv|mp4|avi|webm|mov)$/i, "").toLowerCase();
}

function episodeContextMatches(file, requestedFile) {
    return Boolean(requestedFile) && getEpisodeContextKey(file) === getEpisodeContextKey(requestedFile);
}

function getEpisodeEditTitle(file) {
    const basename = String(file || "").split(/[\\/]/).pop() || "";
    const match = basename.match(/S(\d+)E(\d+)/i);
    if (match) {
        return `Folge S${match[1].padStart(2, "0")}E${match[2].padStart(2, "0")} bearbeiten`;
    }
    return `Folge ${basename.replace(/\.[^.]+$/, "") || "bearbeiten"}`.trim();
}

function getSeasonEditTitle() {
    const seasonName = nfoAgentEditContext.seasonName || "Staffel";
    return `${seasonName} bearbeiten`;
}

function applyNfoAgentEditMode() {
    const mediaType = document.getElementById("nfo-agent-media-type")?.value;
    const modeBar = document.getElementById("nfo-agent-edit-mode-bar");
    const modeTitle = document.getElementById("nfo-agent-edit-mode-title");
    const wholeSeriesBtn = document.getElementById("btn-nfo-agent-edit-whole-series");
    const backBtn = document.getElementById("btn-nfo-agent-edit-back");
    const mainSection = document.getElementById("nfo-agent-main-nfo-section");
    const detailsSection = document.getElementById("nfo-agent-details-container");
    const episodesSection = document.getElementById("nfo-agent-episodes-section");

    if (mediaType !== "tvshow") {
        if (modeBar) modeBar.style.display = "none";
        return;
    }

    const mode = nfoAgentEditContext.mode;
    if (modeBar) modeBar.style.display = "flex";
    if (modeTitle) {
        modeTitle.textContent = mode === "series"
            ? "Serien-NFO bearbeiten"
            : (mode === "episode"
                ? getEpisodeEditTitle(nfoAgentEditContext.episodeFile)
                : (mode === "season" ? getSeasonEditTitle() : "Ganze Serie bearbeiten"));
    }
    if (wholeSeriesBtn) wholeSeriesBtn.style.display = mode === "full" ? "none" : "inline-flex";
    // Direct whole-series entry has no previous view to return to.
    const cameFromNarrowerView = nfoAgentEditContext.originMode !== "full";
    if (backBtn) backBtn.style.display = mode === "full" && cameFromNarrowerView ? "inline-flex" : "none";

    const showMainEditor = mode === "series" || mode === "full";
    const showEpisodes = mode !== "series";
    if (mainSection) mainSection.style.display = showMainEditor && nfoAgentHasRenderedMainNfo ? "block" : "none";
    if (detailsSection) detailsSection.style.display = showMainEditor ? "block" : "none";
    if (episodesSection) episodesSection.style.display = showEpisodes ? "block" : "none";

    const rows = document.querySelectorAll("#nfo-agent-episodes-list .nfo-episode-row");
    rows.forEach(row => {
        const isFocusedEpisode = episodeContextMatches(row.getAttribute("data-file"), nfoAgentEditContext.episodeFile);
        row.style.display = mode === "episode" && !isFocusedEpisode ? "none" : "flex";
        if (mode === "episode" && isFocusedEpisode) {
            const select = row.querySelector(".nfo-agent-ep-mapping-select");
            const overrideContainer = row.querySelector(".nfo-agent-ep-override-container");
            const defaultMapping = row.getAttribute("data-default-mapping");
            if (select && select.value === "skip" && defaultMapping && defaultMapping !== "skip") {
                select.value = defaultMapping;
            }
            if (overrideContainer) overrideContainer.style.display = "flex";
            if (typeof row.scrollIntoView === "function") {
                row.scrollIntoView({ block: "nearest" });
            }
        }
    });
    document.querySelectorAll("#nfo-agent-episodes-list .nfo-agent-season-nfo-row").forEach(row => {
        row.style.display = mode === "season" || mode === "full" ? "flex" : "none";
    });

    // After the row visibility is final: recompute the submit label for this mode.
    updateNfoAgentCompletenessWarning();
}

function setNfoAgentEditMode(mode) {
    nfoAgentEditContext.mode = mode;
    applyNfoAgentEditMode();
}

function openNfoAgentModal(path, options = {}) {
    if (!path) {
        alert("Bitte gib einen Pfad an.");
        return;
    }

    wasFskModalOpenForNfoAgent = false;
    nfoAgentJobSuccess = false;
    nfoAgentJobErrorMsg = null;
    const requestedMode = ["series", "season", "episode", "full"].includes(options.mode) ? options.mode : "full";
    const pathBasename = String(path).split(/[\\/]/).filter(Boolean).pop() || "";
    nfoAgentEditContext = {
        originMode: requestedMode,
        mode: requestedMode,
        episodeFile: options.episodeFile || "",
        seasonName: options.seasonName || pathBasename
    };

    const fskModal = document.getElementById("modal-fsk-batch-preview");
    if (fskModal && fskModal.classList.contains("active")) {
        wasFskModalOpenForNfoAgent = true;
        fskModal.classList.remove("active");
        fskModal.classList.add("hidden");
    }

    nfoAgentCurrentPath = path;
    const modal = document.getElementById("modal-nfo-agent");
    if (!modal) return;

    // Clear / reset UI
    nfoAgentHasRenderedMainNfo = false;
    modal.classList.add("active");
    modal.classList.remove("hidden");
    document.getElementById("nfo-agent-current-path").textContent = path;
    document.getElementById("nfo-agent-search-title").value = "";
    document.getElementById("nfo-agent-metadata-id").value = "";
    document.getElementById("nfo-agent-show-title").value = "";
    document.getElementById("nfo-agent-show-year").value = "";
    document.getElementById("nfo-agent-show-plot").value = "";
    const genresInput = document.getElementById("nfo-agent-show-genres");
    if (genresInput) genresInput.value = "";
    const fskSelect = document.getElementById("nfo-agent-show-fsk");
    if (fskSelect) fskSelect.value = "";
    nfoAgentFieldSources = {};
    ["title", "year", "plot", "genre", "fsk"].forEach(field => setNfoAgentFieldSource(field, "missing"));
    const overwriteInput = document.getElementById("nfo-agent-overwrite-nfo");
    if (overwriteInput) overwriteInput.checked = false;
    document.getElementById("nfo-agent-main-nfo-status").innerHTML = "";
    document.getElementById("nfo-agent-main-nfo-section").style.display = "none";
    document.getElementById("nfo-agent-edit-mode-bar").style.display = "none";
    document.getElementById("nfo-agent-episodes-list").innerHTML = "";
    document.getElementById("nfo-agent-log-container").style.display = "none";
    document.getElementById("nfo-agent-log-container").textContent = "";
    document.getElementById("btn-nfo-agent-submit").disabled = false;
    document.getElementById("btn-nfo-agent-submit").style.opacity = "1";
    document.getElementById("btn-nfo-agent-submit").style.display = "inline-flex";
    const doneBtnReset = document.getElementById("btn-nfo-agent-done");
    if (doneBtnReset) doneBtnReset.style.display = "none";

    // Stop any lingering job poll and reset the log stream from a previous run
    if (nfoAgentLogInterval) clearInterval(nfoAgentLogInterval);
    const logReset = document.getElementById("nfo-agent-log-container");
    if (logReset) { logReset.style.display = "none"; logReset.textContent = ""; }

    // Reset search results list container and advanced details block
    const resultsContainer = document.getElementById("nfo-agent-search-results");
    if (resultsContainer) {
        resultsContainer.innerHTML = "";
        resultsContainer.style.display = "none";
    }
    const advancedDetails = document.getElementById("nfo-agent-advanced-details");
    if (advancedDetails) {
        advancedDetails.removeAttribute("open");
    }

    nfoAgentProfileId = "";
    nfoAgentProfileProvider = "";

    // Call scan project to preload values
    const searchBtn = document.getElementById("btn-nfo-agent-search");
    if (searchBtn) {
        searchBtn.disabled = true;
        searchBtn.textContent = "Scanne...";
    }

    fetch(`/api/scan-project?project=${encodeURIComponent(path)}`)
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                alert(`Fehler beim Scannen: ${data.error}`);
                return;
            }
            nfoAgentScanData = data;

            // Set type
            const mediaTypeSelect = document.getElementById("nfo-agent-media-type");
            mediaTypeSelect.value = data.type === "movie" ? "movie" : "tvshow";
            triggerNfoAgentMediaTypeChange();

            // Derive the season number from the folder name (e.g. "Staffel 2" -> 2) so the
            // episode dropdown options match the files in a season subfolder.
            const seasonBase = (path || "").split("/").filter(Boolean).pop() || "";
            const seasonMatch = seasonBase.match(/^(?:staffel|season)\s*(\d+)$|^s(\d+)$/i);
            if (seasonMatch) {
                const seasonNum = seasonMatch[1] || seasonMatch[2];
                if (seasonNum) document.getElementById("nfo-agent-season").value = parseInt(seasonNum, 10);
            }

            // Set search input to the suggested search name
            const titleInput = document.getElementById("nfo-agent-search-title");
            titleInput.value = data.suggested_search_name || "";

            // Populate backend-resolved ID/provider/name (priority: NFO -> Profile)
            if (data.metadata_provider) {
                document.getElementById("nfo-agent-provider").value = data.metadata_provider;
            }
            if (data.metadata_id) {
                document.getElementById("nfo-agent-metadata-id").value = data.metadata_id;
            }
            if (data.metadata_name) {
                document.getElementById("nfo-agent-show-title").value = data.metadata_name;
                document.getElementById("nfo-agent-show-year").value = data.metadata_year || "";
                document.getElementById("nfo-agent-show-plot").value = data.metadata_plot || "";
            }
            if (genresInput) genresInput.value = (data.metadata_genres || []).join(", ");
            if (fskSelect) fskSelect.value = data.metadata_fsk || "";
            const initialSource = data.metadata_source === "nfo" ? "existing_nfo" : (data.metadata_source || "missing");
            setNfoAgentFieldSource("title", data.metadata_name ? initialSource : "missing");
            setNfoAgentFieldSource("year", data.metadata_year ? initialSource : "missing");
            setNfoAgentFieldSource("plot", data.metadata_plot ? initialSource : "missing");
            setNfoAgentFieldSource("genre", (data.metadata_genres || []).length ? initialSource : "missing");
            setNfoAgentFieldSource("fsk", data.metadata_fsk ? initialSource : "missing");
            updateNfoAgentCompletenessWarning();

            // Fetch series profile in background (only for badge comparison "Profil abweichend")
            const showNameQuery = data.metadata_name || data.project || "";
            if (data.type !== "movie" && showNameQuery) {
                fetch(`/api/profile?show_name=${encodeURIComponent(showNameQuery)}`)
                    .then(r => r.ok ? r.json() : null)
                    .then(prof => {
                        if (prof && !prof.error && prof.show_id) {
                            nfoAgentProfileId = prof.show_id;
                            nfoAgentProfileProvider = prof.provider || "";
                        }
                    })
                    .catch(err => {
                        console.error("Error fetching profile for verification:", err);
                    })
                    .finally(() => {
                        // Render files list
                        renderNfoAgentFiles(data);
                        // Trigger auto-search when project is scanned
                        if (titleInput.value) {
                            searchNfoAgentMetadata();
                        }
                    });
            } else {
                renderNfoAgentFiles(data);
                // Trigger auto-search when project is scanned
                if (titleInput.value) {
                    searchNfoAgentMetadata();
                }
            }
        })
        .catch(err => {
            console.error(err);
            alert("Fehler beim Scannen des Ordners.");
        })
        .finally(() => {
            if (searchBtn) {
                searchBtn.disabled = false;
                searchBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg> Suchen`;
            }
        });
}

function triggerNfoAgentMediaTypeChange() {
    const type = document.getElementById("nfo-agent-media-type").value;
    const providerSelect = document.getElementById("nfo-agent-provider");
    const seasonContainer = document.getElementById("nfo-agent-season-container");
    const epSection = document.getElementById("nfo-agent-episodes-section");
    const modalTitle = document.getElementById("nfo-agent-modal-title");
    const searchLabel = document.getElementById("nfo-agent-search-label");
    const titleLabel = document.getElementById("nfo-agent-title-label");
    const titleLabelText = document.getElementById("nfo-agent-title-label-text");
    const filesHeading = document.getElementById("nfo-agent-files-heading");
    const detailsHeading = document.getElementById("nfo-agent-details-heading");

    // Clear and build options based on type
    providerSelect.innerHTML = "";
    if (type === "tvshow") {
        providerSelect.innerHTML = `
            <option value="tvdb">TVDB</option>
            <option value="tmdb_tv">TMDb Serie</option>
            <option value="manual">Manuell</option>
        `;
        seasonContainer.style.display = "block";
        epSection.style.display = "block";
        if (modalTitle) modalTitle.textContent = "NFO Agent: Serien-Metadaten";
        if (searchLabel) searchLabel.textContent = "Name der Serie:";
        if (titleLabelText) titleLabelText.textContent = "Serientitel (tvshow.nfo):";
        else if (titleLabel) titleLabel.textContent = "Serientitel (tvshow.nfo):";
        if (detailsHeading) detailsHeading.textContent = "Serien-Metadaten";
        if (filesHeading) filesHeading.textContent = "Episoden-NFOs und Zuordnung";
    } else {
        providerSelect.innerHTML = `
            <option value="tmdb_movie">TMDb Film</option>
            <option value="ofdb">OFDb</option>
            <option value="manual">Manuell</option>
        `;
        seasonContainer.style.display = "none";
        epSection.style.display = "none";
        if (modalTitle) modalTitle.textContent = "NFO Agent: Film-Metadaten";
        if (searchLabel) searchLabel.textContent = "Name des Films:";
        if (titleLabelText) titleLabelText.textContent = "Filmtitel (movie.nfo):";
        else if (titleLabel) titleLabel.textContent = "Filmtitel (movie.nfo):";
        if (detailsHeading) detailsHeading.textContent = "Film-Metadaten";
    }

    if (nfoAgentScanData) renderNfoAgentFiles(nfoAgentScanData);
}

function searchNfoAgentMetadata() {
    const title = document.getElementById("nfo-agent-search-title").value.trim();
    const type = document.getElementById("nfo-agent-media-type").value;
    const season = document.getElementById("nfo-agent-season").value;

    if (!title) {
        alert("Bitte gib einen Suchbegriff ein.");
        return;
    }

    const searchBtn = document.getElementById("btn-nfo-agent-search");
    searchBtn.disabled = true;
    searchBtn.textContent = "Suche...";

    // 1. Search for ID using the unified search endpoint
    const queryType = type === 'tvshow' ? 'tv' : 'movie';
    fetch(`/api/search?type=${queryType}&q=${encodeURIComponent(title)}`)
        .then(res => res.json())
        .then(results => {
            const resultsContainer = document.getElementById("nfo-agent-search-results");
            resultsContainer.innerHTML = "";

            if (!results || results.length === 0) {
                resultsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 8px; font-size: 0.85em;">Keine Treffer gefunden. Bitte gib die ID manuell in den erweiterten Einstellungen ein.</div>`;
                resultsContainer.style.display = "block";

                const advDetails = document.getElementById("nfo-agent-advanced-details");
                if (advDetails) {
                    advDetails.open = true;
                }
                return;
            }

            resultsContainer.style.display = "block";

            results.forEach((item, index) => {
                const itemDiv = document.createElement("div");
                itemDiv.className = "search-result-item";
                itemDiv.style = "display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; border-bottom: 1px solid var(--border-light); cursor: pointer; font-size: 0.85em; transition: background 0.2s;";
                itemDiv.addEventListener("mouseenter", () => { itemDiv.style.background = "rgba(255,255,255,0.05)"; });
                itemDiv.addEventListener("mouseleave", () => { itemDiv.style.background = "transparent"; });

                // Determine badges
                let badgeHTML = "";
                const normItemProv = normalizeProvider(item.provider);
                const normScanProv = normalizeProvider(nfoAgentScanData ? nfoAgentScanData.metadata_provider : "");
                const scanId = nfoAgentScanData ? nfoAgentScanData.metadata_id : "";

                // 1. Check NFO / Profile match
                if (scanId && String(item.id) === String(scanId) && normItemProv === normScanProv) {
                    if (nfoAgentScanData && nfoAgentScanData.metadata_source === "nfo") {
                        badgeHTML += `<span style="background: var(--accent); color: white; font-size: 0.75em; padding: 2px 6px; border-radius: 10px; font-weight: 600; margin-left: 6px;">aus tvshow.nfo</span>`;
                    } else if (nfoAgentScanData && nfoAgentScanData.metadata_source === "profile") {
                        badgeHTML += `<span style="background: #3b82f6; color: white; font-size: 0.75em; padding: 2px 6px; border-radius: 10px; font-weight: 600; margin-left: 6px;">aus Serienprofil</span>`;
                    }
                }

                // 2. Check Profile discrepant match
                const normProfProv = normalizeProvider(nfoAgentProfileProvider);
                if (nfoAgentProfileId && String(item.id) === String(nfoAgentProfileId) && normItemProv === normProfProv) {
                    // Only show discrepant profile badge if NFO took priority and profile differs
                    if (nfoAgentScanData && nfoAgentScanData.metadata_source === "nfo" && String(scanId) !== String(nfoAgentProfileId)) {
                        badgeHTML += `<span style="background: #f59e0b; color: white; font-size: 0.75em; padding: 2px 6px; border-radius: 10px; font-weight: 600; margin-left: 6px;">Profil abweichend</span>`;
                    }
                }

                itemDiv.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px; color: var(--text-main); flex: 1;">
                        <strong style="color: var(--accent); font-size: 0.8em; text-transform: uppercase;">[${escapeHTML(item.provider || "Manual")}]</strong>
                        <span>${escapeHTML(item.name)}</span>
                        ${badgeHTML}
                    </div>
                `;

                itemDiv.addEventListener("click", () => {
                    // Highlight selected item by setting border-left
                    resultsContainer.querySelectorAll(".search-result-item").forEach(el => {
                        el.style.borderLeft = "none";
                        el.style.background = "transparent";
                    });
                    itemDiv.style.borderLeft = "4px solid var(--accent)";
                    itemDiv.style.background = "rgba(255,255,255,0.02)";

                    // The free-text Mediathek entry has no service to fetch from:
                    // switch to manual entry instead of forcing a TVDB lookup.
                    if (String(item.id).startsWith("url_mediathek:")) {
                        applyNfoAgentMediathekSelection(item);
                        return;
                    }

                    // Set inputs
                    let mappedProv = item.provider;
                    if (queryType === "movie" && mappedProv === "tmdb") {
                        mappedProv = "tmdb_movie";
                    }
                    if (queryType === "tv") {
                        if (mappedProv === "tmdb_tv_en") mappedProv = "tmdb_tv";
                        if (mappedProv !== "tvdb" && mappedProv !== "tmdb_tv" && mappedProv !== "manual") {
                            mappedProv = "tvdb";
                        }
                    }
                    document.getElementById("nfo-agent-provider").value = mappedProv;
                    document.getElementById("nfo-agent-metadata-id").value = item.id;

                    // Fetch full details
                    loadNfoAgentDetails(item.id, mappedProv, type, season);
                });

                resultsContainer.appendChild(itemDiv);

                // Auto-select/highlight the best matching item
                if (scanId && String(item.id) === String(scanId) && normItemProv === normScanProv) {
                    itemDiv.style.borderLeft = "4px solid var(--accent)";
                    itemDiv.style.background = "rgba(255,255,255,0.02)";
                }
            });
        })
        .catch(err => {
            console.error(err);
            const resultsContainer = document.getElementById("nfo-agent-search-results");
            resultsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 8px; font-size: 0.85em;">Metadatensuche fehlgeschlagen. Bitte gib die ID manuell in den erweiterten Einstellungen ein.</div>`;
            resultsContainer.style.display = "block";

            const advDetails = document.getElementById("nfo-agent-advanced-details");
            if (advDetails) {
                advDetails.open = true;
            }
        })
        .finally(() => {
            searchBtn.disabled = false;
            searchBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg> Suchen`;
        });
}

// The Mediathek search result is a free-text fallback without fetchable
// details: use it as a manual-entry shortcut that prefills the title.
function applyNfoAgentMediathekSelection(item) {
    const providerSelect = document.getElementById("nfo-agent-provider");
    if (providerSelect) providerSelect.value = "manual";
    const idInput = document.getElementById("nfo-agent-metadata-id");
    if (idInput) idInput.value = "";
    const titleInput = document.getElementById("nfo-agent-show-title");
    const queryText = String(item.id).split("url_mediathek:", 2)[1] || item.name || "";
    if (titleInput && !titleInput.value.trim() && queryText) {
        titleInput.value = queryText;
        setNfoAgentFieldSource("title", "manual");
    }
    updateNfoAgentCompletenessWarning();
}

// Remembered parameters of the last detail fetch so the inline
// "Erneut versuchen" button can repeat it after a transient failure.
let nfoAgentLastDetailsRequest = null;

function retryNfoAgentDetails() {
    if (!nfoAgentLastDetailsRequest) return;
    const { id, provider, type, season } = nfoAgentLastDetailsRequest;
    document.getElementById("nfo-agent-search-results")?.querySelectorAll(".nfo-agent-details-error").forEach((el) => el.remove());
    loadNfoAgentDetails(id, provider, type, season);
}

function showNfoAgentDetailsError(message) {
    const resultsContainer = document.getElementById("nfo-agent-search-results");
    if (!resultsContainer) {
        alert(`Fehler beim Laden der Details: ${message}`);
        return;
    }
    resultsContainer.querySelectorAll(".nfo-agent-details-error").forEach((el) => el.remove());
    const errorBox = document.createElement("div");
    errorBox.className = "nfo-agent-details-error";
    errorBox.style = "display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; margin-top: 6px; border: 1px solid rgba(239,68,68,0.35); border-radius: 4px; background: rgba(239,68,68,0.08); font-size: 0.85em; color: var(--text-main);";
    errorBox.innerHTML = `<span>${escapeHTML(`Details konnten nicht geladen werden: ${message}`)}</span>`
        + `<button type="button" class="btn btn-secondary btn-sm" onclick="retryNfoAgentDetails()" style="flex-shrink: 0;">Erneut versuchen</button>`;
    resultsContainer.appendChild(errorBox);
    resultsContainer.style.display = "block";
}

function loadNfoAgentDetails(id, provider, type, season) {
    nfoAgentLastDetailsRequest = { id, provider, type, season };
    let url = "";
    if (type === "tvshow") {
        url = `/api/metadata/fetch?media_type=tv&provider=${provider}&show_id=${id}`;
    } else {
        url = `/api/metadata/fetch?media_type=movie&provider=${provider}&movie_id=${id}`;
    }

    fetch(url)
        .then(res => res.json())
        .then(meta => {
            if (meta.error) throw new Error(meta.error);
            // Populate Show / Movie details
            const metadataTitle = meta.name || meta.title || "";
            document.getElementById("nfo-agent-show-title").value = metadataTitle;
            document.getElementById("nfo-agent-show-year").value = meta.year || "";
            document.getElementById("nfo-agent-show-plot").value = meta.plot || "";
            const genresInput = document.getElementById("nfo-agent-show-genres");
            if (genresInput) genresInput.value = (meta.genres || []).join(", ");
            const fskSelect = document.getElementById("nfo-agent-show-fsk");
            if (fskSelect) fskSelect.value = meta.fsk || "";
            setNfoAgentFieldSource("title", metadataTitle ? "metadata_provider" : "metadata_provider_missing");
            setNfoAgentFieldSource("year", meta.year ? "metadata_provider" : "metadata_provider_missing");
            setNfoAgentFieldSource("plot", meta.plot ? "metadata_provider" : "metadata_provider_missing");
            setNfoAgentFieldSource("genre", (meta.genres || []).length ? "metadata_provider" : "metadata_provider_missing");
            setNfoAgentFieldSource("fsk", meta.fsk ? "metadata_provider" : "metadata_provider_missing");
            updateNfoAgentCompletenessWarning();

            // If series, rebuild the files list with the loaded episode metadata
            if (type === "tvshow" && nfoAgentScanData) {
                renderNfoAgentFiles(nfoAgentScanData, meta.episodes || {});
            }
        })
        .catch(err => {
            console.error(err);
            showNfoAgentDetailsError(err.message || "Unbekannter Fehler");
        });
}

function renderNfoAgentFiles(scanData, loadedEpisodes = {}) {
    const listBody = document.getElementById("nfo-agent-episodes-list");
    const mainNfoBody = document.getElementById("nfo-agent-main-nfo-status");
    const mainNfoSection = document.getElementById("nfo-agent-main-nfo-section");
    listBody.innerHTML = "";
    mainNfoBody.innerHTML = "";

    const mediaType = document.getElementById("nfo-agent-media-type").value;

    // 1. Render the authoritative main NFO for the selected media type.
    const mainNfoStatus = scanData.main_nfo_status
        || (mediaType === "movie" ? scanData.movie_nfo_status : scanData.show_nfo_status);
    nfoAgentHasRenderedMainNfo = Boolean(mainNfoStatus);
    if (mainNfoStatus) {
        const showNfoRow = document.createElement("div");
        showNfoRow.className = "nfo-agent-main-nfo-card show-nfo-row";

        const nfoStatus = mainNfoStatus;
        const mainNfoFilename = nfoStatus.filename || (mediaType === "movie" ? "movie.nfo" : "tvshow.nfo");
        let statusLabel = "";
        let statusTone = "warning";
        let nfoState = "complete";
        let nfoActionOptions = "";

        if (!nfoStatus.exists) {
            statusLabel = "Fehlende Metadaten";
            statusTone = "danger";
            nfoState = "missing";
            nfoActionOptions = `
                <option value="process" selected>⚙️ Verarbeiten</option>
                <option value="skip">⏭️ Überspringen</option>
            `;
        } else if (!nfoStatus.parseable) {
            statusLabel = "Metadaten nicht lesbar";
            statusTone = "danger";
            nfoState = "unreadable";
            nfoActionOptions = `
                <option value="process" selected>⚙️ Verarbeiten</option>
                <option value="skip">⏭️ Überspringen</option>
            `;
        } else if (nfoStatus.needs_review || !nfoStatus.complete) {
            statusLabel = "Metadaten unvollständig";
            nfoState = "incomplete";
            nfoActionOptions = `
                <option value="process" selected>⚙️ Verarbeiten</option>
                <option value="skip">⏭️ Überspringen</option>
            `;
        } else {
            statusLabel = "Metadaten vollständig";
            statusTone = "success";
            nfoActionOptions = `
                <option value="process" selected>⚙️ Verarbeiten</option>
                <option value="skip">⏭️ Überspringen</option>
            `;
        }

        showNfoRow.innerHTML = `
            <div class="nfo-agent-main-nfo-content">
                <div class="nfo-agent-main-nfo-title">
                    <span class="nfo-agent-main-nfo-file">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-key"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><circle cx="10" cy="16" r="2"/><path d="m16 10-4.5 4.5"/></svg>
                        ${escapeHTML(mainNfoFilename)}
                    </span>
                    <span id="nfo-agent-main-nfo-current-status" class="nfo-agent-status nfo-agent-status-${statusTone}" data-nfo-state="${nfoState}" role="status">${escapeHTML(statusLabel)}</span>
                </div>
            </div>
            <label class="nfo-agent-main-nfo-action">
                <span>Aktion</span>
                <select id="nfo-agent-show-nfo-action">
                        ${nfoActionOptions}
                </select>
            </label>
        `;
        mainNfoBody.appendChild(showNfoRow);
        mainNfoSection.style.display = "block";
    } else {
        mainNfoSection.style.display = "none";
    }

    // A film has exactly one main metadata NFO and no episode mappings.
    if (mediaType === "movie") {
        applyNfoAgentEditMode();
        return;
    }

    const seasonNfoStatuses = scanData.season_nfo_statuses || [];
    seasonNfoStatuses.forEach(status => {
        const row = document.createElement("div");
        row.className = "nfo-agent-season-nfo-row";
        row.dataset.path = status.relative_path || status.filename || "season.nfo";
        const currentValue = String(status.raw_fsk || "").replace(/^FSK\s*/i, "");
        row.innerHTML = `
            <div>
                <strong>${escapeHTML(status.relative_path || "season.nfo")}</strong>
                <span class="nfo-agent-status nfo-agent-status-${status.needs_review ? "warning" : "success"}">
                    ${status.needs_review ? "Metadaten prüfen" : "Metadaten vollständig"}
                </span>
            </div>
            <label>
                <span>Altersfreigabe</span>
                <select class="nfo-agent-season-fsk">
                    <option value="" ${currentValue ? "" : "selected"}>Keine Angabe</option>
                    ${[0, 6, 12, 16, 18].map(value => `<option value="${value}" ${currentValue === String(value) ? "selected" : ""}>FSK ${value}</option>`).join("")}
                </select>
            </label>
        `;
        listBody.appendChild(row);
    });

    const nfoStatuses = scanData.file_nfo_statuses || {};
    const files = (scanData.files || []).filter(file => nfoStatuses[file]);

    if (files.length === 0) {
        const noFilesMsg = document.createElement("div");
        noFilesMsg.style = "text-align: center; color: var(--text-muted); padding: 12px;";
        noFilesMsg.textContent = "Keine Videodateien in diesem Verzeichnis gefunden.";
        listBody.appendChild(noFilesMsg);
        applyNfoAgentEditMode();
        return;
    }

    files.forEach(file => {
        const basename = file;
        const status = nfoStatuses[basename] || { exists: false, complete: false };
        const episodeFsk = status.fsk || "";

        // Auto-detect season and episode numbers from filename
        let match = basename.match(/S(\d+)E(\d+)/i) || basename.match(/E(\d+)/i);
        let epNum = "";
        if (match) {
            epNum = match[2] ? `S${parseInt(match[1])}E${parseInt(match[2])}` : `E${parseInt(match[1])}`;
        }

        // Get metadata title if loaded
        let metaTitle = "";
        let metaPlot = "";

        if (epNum) {
            let epKey = epNum;
            if (!epKey.startsWith("S")) {
                const curSeason = document.getElementById("nfo-agent-season").value;
                epKey = `S${parseInt(curSeason).toString().padStart(2, "0")}${epKey}`;
            }
            // Check if epKey is in format SxxExx and find it in loadedEpisodes
            const formatMatch = epKey.match(/S(\d+)E(\d+)/i);
            if (formatMatch) {
                const s = parseInt(formatMatch[1]);
                const e = parseInt(formatMatch[2]);
                const standardKey = `S${s}E${e}`;
                const altKey = `${s}x${e}`;
                // Search by standard or exact key
                const epObj = loadedEpisodes[standardKey] || loadedEpisodes[altKey] || loadedEpisodes[e] || {};
                if (typeof epObj === "object") {
                    metaTitle = epObj.title || "";
                    metaPlot = epObj.plot || "";
                } else {
                    metaTitle = String(epObj);
                }
            }
        }
        const displayedTitle = status.title || metaTitle;
        const displayedPlot = status.plot || metaPlot;

        const isFocusedEpisode = nfoAgentEditContext.mode === "episode"
            && episodeContextMatches(basename, nfoAgentEditContext.episodeFile);
        // A directly opened episode is always selected, even when title and plot are complete
        // but another field such as FSK still needs attention.
        const defaultSelectValue = isFocusedEpisode
            ? (epNum || "skip")
            : (status.needs_review ? (epNum || "skip") : "skip");

        const row = document.createElement("div");
        row.className = "nfo-episode-row";
        row.dataset.file = basename;
        row.dataset.defaultMapping = epNum || "skip";
        row.style = "display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--border-light); padding: 10px; border-radius: 6px; background: rgba(255,255,255,0.01); text-align: left;";
        row.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div style="font-weight: 500; font-size: 0.9em; word-break: break-all; color: var(--text-main); flex: 1;">
                    ${escapeHTML(basename)}
                    ${status.exists ?
                        (!status.needs_review && status.complete ?
                            '<span style="color:#10b981; font-size:0.8em; margin-left:6px; font-weight:600;">[Metadaten vollständig]</span>' :
                            '<span style="color:#f59e0b; font-size:0.8em; margin-left:6px; font-weight:600;">[Metadaten unvollständig]</span>') :
                        '<span style="color:#ef4444; font-size:0.8em; margin-left:6px; font-weight:600;">[Keine NFO]</span>'
                    }
                </div>
                <div style="width: 140px;">
                    <select class="nfo-agent-ep-mapping-select" data-file="${escapeHTML(basename)}" style="width: 100%; padding: 6px; font-size: 0.85em; border-radius: 4px; border: 1px solid var(--border-light); background: rgba(30,30,45,1); color: var(--text-main);">
                        <option value="skip" ${defaultSelectValue === "skip" ? "selected" : ""}>⏭️ Überspringen</option>
                        ${buildEpisodeOptionsHTML(scanData.files.length, defaultSelectValue)}
                    </select>
                </div>
            </div>
            <div class="nfo-agent-ep-override-container" style="display: ${defaultSelectValue === "skip" ? "none" : "flex"}; flex-direction: column; gap: 8px; border-top: 1px dashed var(--border-light); padding-top: 8px; margin-top: 4px;">
                <div style="display: flex; gap: 8px;">
                    <div style="flex: 1;">
                        <label style="display: block; font-size: 0.75em; margin-bottom: 2px; color: var(--text-muted);">Episodentitel:</label>
                        <input type="text" class="nfo-agent-ep-override-title" data-file="${escapeHTML(basename)}" value="${escapeHTML(displayedTitle)}" style="width: 100%; padding: 5px; font-size: 0.85em; border-radius: 4px; border: 1px solid var(--border-light); background: rgba(0,0,0,0.1); color: var(--text-main);">
                    </div>
                    <div style="width: 130px;">
                        <label style="display: block; font-size: 0.75em; margin-bottom: 2px; color: var(--text-muted);">Altersfreigabe:</label>
                        <select class="nfo-agent-ep-override-fsk" data-file="${escapeHTML(basename)}" style="width: 100%; padding: 5px; font-size: 0.85em; border-radius: 4px; border: 1px solid var(--border-light); background: rgba(30,30,45,1); color: var(--text-main);">
                            <option value="" ${episodeFsk ? "" : "selected"}>Keine Angabe</option>
                            ${[0, 6, 12, 16, 18].map(value => `<option value="${value}" ${String(episodeFsk) === String(value) ? "selected" : ""}>FSK ${value}</option>`).join("")}
                        </select>
                    </div>
                </div>
                <div>
                    <label style="display: block; font-size: 0.75em; margin-bottom: 2px; color: var(--text-muted);">Beschreibung (Episoden-Plot):</label>
                    <textarea class="nfo-agent-ep-override-plot" data-file="${escapeHTML(basename)}" rows="2" style="width: 100%; padding: 5px; font-size: 0.85em; border-radius: 4px; border: 1px solid var(--border-light); background: rgba(0,0,0,0.1); color: var(--text-main); font-family: inherit; resize: vertical;">${escapeHTML(displayedPlot)}</textarea>
                </div>
            </div>
        `;
        listBody.appendChild(row);

        const select = row.querySelector(".nfo-agent-ep-mapping-select");
        const container = row.querySelector(".nfo-agent-ep-override-container");

        // Dynamic episode metadata fetch helper
        const loadEpMetadata = async (val) => {
            if (val === "skip") return;
            const prov = document.getElementById("nfo-agent-provider").value;
            const shId = document.getElementById("nfo-agent-metadata-id").value.trim();
            if (prov === "manual" || !shId) return;

            const matchFormat = val.match(/S(\d+)E(\d+)/i);
            if (!matchFormat) return;
            const s = matchFormat[1];
            const e = matchFormat[2];

            const titleInput = row.querySelector(".nfo-agent-ep-override-title");
            const plotTextarea = row.querySelector(".nfo-agent-ep-override-plot");

            if (plotTextarea) plotTextarea.placeholder = "Lade Metadaten...";

            try {
                const response = await fetch(`/api/metadata/fetch?media_type=episode&provider=${encodeURIComponent(prov)}&show_id=${encodeURIComponent(shId)}&season=${encodeURIComponent(s)}&episode=${encodeURIComponent(e)}`);
                if (response.ok) {
                    const data = await response.json();
                    if (select.value === val) {
                        if (titleInput) titleInput.value = data.title || "";
                        if (plotTextarea) plotTextarea.value = data.plot || "";
                    }
                }
            } catch (err) {
                console.error("Error fetching episode metadata for NFO Agent:", err);
            } finally {
                if (plotTextarea) plotTextarea.placeholder = "";
            }
        };

        // If mapping is selected, and we don't have cached/preloaded details, fetch them now
        if (defaultSelectValue !== "skip" && !metaTitle) {
            loadEpMetadata(defaultSelectValue);
        }

        select.addEventListener("change", () => {
            if (select.value === "skip") {
                container.style.display = "none";
            } else {
                container.style.display = "flex";
                loadEpMetadata(select.value);
            }
        });
    });

    applyNfoAgentEditMode();
}

function buildEpisodeOptionsHTML(fileCount, selectedVal) {
    let html = "";
    const seasonVal = parseInt(document.getElementById("nfo-agent-season").value) || 1;
    // Render up to fileCount * 2 or at least 30 options
    const maxVal = Math.max(fileCount + 5, 30);
    for (let i = 1; i <= maxVal; i++) {
        const epStr = `S${seasonVal.toString().padStart(2, "0")}E${i.toString().padStart(2, "0")}`;
        const optionVal = `S${seasonVal}E${i}`;
        const isSelected = selectedVal === optionVal || selectedVal === `E${i}` || selectedVal === epStr;
        html += `<option value="${optionVal}" ${isSelected ? "selected" : ""}>${epStr}</option>`;
    }
    return html;
}

function submitNfoAgentJob() {
    if (!nfoAgentCurrentPath) return;

    let provider = document.getElementById("nfo-agent-provider").value;
    const mediaType = document.getElementById("nfo-agent-media-type").value;
    let showId = document.getElementById("nfo-agent-metadata-id").value.trim();
    const season = parseInt(document.getElementById("nfo-agent-season").value) || 1;
    const overwriteNfo = document.getElementById("nfo-agent-overwrite-nfo").checked;

    // A provider ID is optional: without one there is nothing to fetch, so the
    // entered form fields are written manually instead of blocking the user.
    if (provider !== "manual" && !showId) {
        provider = "manual";
    }

    // Build mappings & overrides
    const mappings = {};
    const episodesOverrides = {};
    const episodeFingerprints = {};

    const includeEpisodes = nfoAgentEditContext.mode !== "series";
    const mappingSelects = document.querySelectorAll(".nfo-agent-ep-mapping-select");
    mappingSelects.forEach(select => {
        const file = select.getAttribute("data-file");
        const val = select.value;
        const isSelectedContext = nfoAgentEditContext.mode !== "episode"
            || episodeContextMatches(file, nfoAgentEditContext.episodeFile);
        if (includeEpisodes && isSelectedContext && val !== "skip") {
            mappings[file] = val;
            episodeFingerprints[file] = nfoAgentScanData?.file_nfo_statuses?.[file]?.fingerprint ?? null;
        }
    });

    const epTitleInputs = document.querySelectorAll(".nfo-agent-ep-override-title");
    epTitleInputs.forEach(input => {
        const file = input.getAttribute("data-file");
        const title = input.value.trim();
        const plotTextarea = document.querySelector(`.nfo-agent-ep-override-plot[data-file="${CSS.escape(file)}"]`);
        const plot = plotTextarea ? plotTextarea.value.trim() : "";
        const fskSelect = document.querySelector(`.nfo-agent-ep-override-fsk[data-file="${CSS.escape(file)}"]`);
        const fsk = fskSelect ? fskSelect.value : "";

        const originalStatus = nfoAgentScanData?.file_nfo_statuses?.[file] || {};
        const episodeChanges = {};
        if (title && title !== (originalStatus.title || "")) episodeChanges.title = title;
        if (plot && plot !== (originalStatus.plot || "")) episodeChanges.plot = plot;
        if (fsk && fsk !== (originalStatus.fsk || "")) episodeChanges.fsk = fsk;
        const isSelectedContext = nfoAgentEditContext.mode !== "episode"
            || episodeContextMatches(file, nfoAgentEditContext.episodeFile);
        if (includeEpisodes && isSelectedContext && Object.keys(episodeChanges).length) {
            episodesOverrides[file] = episodeChanges;
        }
    });

    const showTitle = document.getElementById("nfo-agent-show-title").value.trim();
    const showYear = document.getElementById("nfo-agent-show-year").value.trim();
    const showPlot = document.getElementById("nfo-agent-show-plot").value.trim();
    const showGenres = (document.getElementById("nfo-agent-show-genres")?.value || "")
        .split(/[,;]/)
        .map(value => value.trim())
        .filter(Boolean);
    const showFsk = document.getElementById("nfo-agent-show-fsk")?.value || "";

    if (provider === "manual" && !showId) {
        showId = JSON.stringify({ title: showTitle, year: showYear, plot: showPlot, genres: showGenres, fsk: showFsk });
    }
    const movieId = showId;

    const showOverrides = {};
    const movieOverrides = {};
    const existingMainNfo = Boolean(nfoAgentScanData?.main_nfo_status?.exists);
    const originalGenres = nfoAgentScanData?.metadata_genres || [];
    const includeMainField = (value, original) => !existingMainNfo || JSON.stringify(value) !== JSON.stringify(original);

    if (showTitle && includeMainField(showTitle, nfoAgentScanData?.metadata_name || "")) { showOverrides.title = showTitle; movieOverrides.title = showTitle; }
    if (showYear && includeMainField(showYear, String(nfoAgentScanData?.metadata_year || ""))) { showOverrides.year = showYear; movieOverrides.year = showYear; }
    if (showPlot && includeMainField(showPlot, nfoAgentScanData?.metadata_plot || "")) { showOverrides.plot = showPlot; movieOverrides.plot = showPlot; }
    if (showGenres.length && includeMainField(showGenres, originalGenres)) { showOverrides.genres = showGenres; movieOverrides.genres = showGenres; }
    if (showFsk && includeMainField(showFsk, nfoAgentScanData?.metadata_fsk || "")) { showOverrides.fsk = showFsk; movieOverrides.fsk = showFsk; }

    const includeMainNfo = nfoAgentEditContext.mode === "series" || nfoAgentEditContext.mode === "full";
    const nfoOverrides = {
        show: includeMainNfo ? showOverrides : {},
        movie: includeMainNfo ? movieOverrides : {},
        episodes: episodesOverrides
    };

    const seasonNfoOverrides = {};
    document.querySelectorAll(".nfo-agent-season-nfo-row").forEach(row => {
        const fskValue = row.querySelector(".nfo-agent-season-fsk")?.value || "";
        const relativePath = row.getAttribute("data-path");
        const original = (nfoAgentScanData?.season_nfo_statuses || [])
            .find(status => status.relative_path === relativePath);
        const originalValue = String(original?.raw_fsk || "").replace(/^FSK\s*/i, "");
        if (relativePath && fskValue && fskValue !== originalValue) {
            seasonNfoOverrides[relativePath] = {
                fields: { fsk: fskValue },
                fingerprint: original?.fingerprint ?? null
            };
        }
    });

    const showNfoActionSelect = document.getElementById("nfo-agent-show-nfo-action");
    const writeShowNfo = includeMainNfo
        && (showNfoActionSelect ? (showNfoActionSelect.value !== "skip") : true);
    const mainNfoStatus = nfoAgentScanData?.main_nfo_status || null;
    const nfoWriteMode = mainNfoStatus?.exists ? (overwriteNfo ? "replace" : "patch") : "create";

    const payload = {
        project_name: nfoAgentCurrentPath,
        media_type: "tool_nfo_agent",
        nfo_type: mediaType,
        provider: provider,
        show_id: showId,
        movie_id: movieId,
        season: season,
        overwrite_nfo: overwriteNfo,
        nfo_write_mode: nfoWriteMode,
        main_nfo_fingerprint: mainNfoStatus?.fingerprint ?? null,
        write_show_nfo: writeShowNfo,
        mappings: mappings,
        episode_fingerprints: episodeFingerprints,
        nfo_overrides: nfoOverrides,
        season_nfo_overrides: seasonNfoOverrides
    };

    const submitBtn = document.getElementById("btn-nfo-agent-submit");
    submitBtn.disabled = true;
    submitBtn.style.opacity = "0.5";

    const logContainer = document.getElementById("nfo-agent-log-container");
    logContainer.style.display = "block";
    logContainer.textContent = "Starte NFO Agent Job...\n";

    fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
        .then(res => res.json())
        .then(data => {
            if (data.status === "started" && data.task_id) {
                logContainer.textContent += `Job erfolgreich gestartet (Task ID: ${data.task_id}). Warte auf Logs...\n`;
                startNfoAgentLogStreaming(data.task_id);
            } else {
                alert(`Fehler beim Starten des Jobs: ${data.error || "Unbekannter Fehler"}`);
                submitBtn.disabled = false;
                submitBtn.style.opacity = "1";
            }
        })
        .catch(err => {
            console.error(err);
            alert("Netzwerkfehler beim Starten des NFO Agenten.");
            submitBtn.disabled = false;
            submitBtn.style.opacity = "1";
        });
}

function showNfoAgentDone() {
    // Do NOT auto-close: reveal the "Fertig" button so the user returns to the health check on click.
    const submitBtn = document.getElementById("btn-nfo-agent-submit");
    if (submitBtn) submitBtn.style.display = "none";
    const doneBtn = document.getElementById("btn-nfo-agent-done");
    if (doneBtn) doneBtn.style.display = "inline-flex";
}

function startNfoAgentLogStreaming(taskId) {
    if (nfoAgentLogInterval) clearInterval(nfoAgentLogInterval);
    const logContainer = document.getElementById("nfo-agent-log-container");

    nfoAgentLogInterval = setInterval(() => {
        // /api/queue returns { jobs: [{ id, status, progress, message, pipeline, ... }] }
        fetch("/api/queue")
            .then(res => res.json())
            .then(queueData => {
                const jobs = queueData.jobs || [];
                const job = jobs.find(j => j.id === taskId);

                if (!job) {
                    // Job vanished from the queue -> treat as finished.
                    clearInterval(nfoAgentLogInterval);
                    logContainer.textContent += "\n=== Job nicht mehr verfügbar ===\n";
                    logContainer.scrollTop = logContainer.scrollHeight;
                    nfoAgentJobErrorMsg = "Das Ergebnis des NFO-Agenten ist nicht mehr abrufbar.";
                    showNfoAgentDone();
                    return;
                }

                const meta = (job.pipeline && job.pipeline.metadata) ? job.pipeline.metadata : null;
                const prog = meta && typeof meta.progress === "number" ? meta.progress : (job.progress || 0);
                logContainer.textContent = `NFO Agent läuft… ${prog}%` + (job.message ? `\n${job.message}` : "");
                logContainer.scrollTop = logContainer.scrollHeight;

                if (job.status === "done") {
                    nfoAgentJobSuccess = true;
                    clearInterval(nfoAgentLogInterval);
                    logContainer.textContent += "\n=== ✅ NFO Agent abgeschlossen ===\n";
                    logContainer.scrollTop = logContainer.scrollHeight;
                    showNfoAgentDone();
                } else if (job.status === "error") {
                    clearInterval(nfoAgentLogInterval);
                    logContainer.textContent += `\n=== ❌ Fehler: ${job.message || "unbekannt"} ===\n`;
                    logContainer.scrollTop = logContainer.scrollHeight;
                    nfoAgentJobErrorMsg = `Fehler beim NFO-Agent: ${job.message || "unbekannt"}`;
                    showNfoAgentDone();
                } else if (job.status === "cancelled") {
                    clearInterval(nfoAgentLogInterval);
                    logContainer.textContent += `\n=== 🛑 Abgebrochen ===\n`;
                    logContainer.scrollTop = logContainer.scrollHeight;
                    nfoAgentJobErrorMsg = "NFO-Agent wurde abgebrochen.";
                    showNfoAgentDone();
                }
            })
            .catch(err => console.error("Error polling queue for NFO Agent job", err));
    }, 1000);
}

function closeNfoAgentModal() {
    if (nfoAgentLogInterval) clearInterval(nfoAgentLogInterval);
    const modal = document.getElementById("modal-nfo-agent");
    if (modal) {
        modal.classList.remove("active");
        modal.classList.add("hidden");
    }

    if (wasFskModalOpenForNfoAgent) {
        const fskModal = document.getElementById("modal-fsk-batch-preview");
        if (fskModal) {
            fskModal.classList.remove("hidden");
            fskModal.classList.add("active");
        }
        if (nfoAgentJobSuccess) {
            loadFskBatchPreview(true);
            if (typeof pollHealthStatus === "function") pollHealthStatus(true);
        } else if (nfoAgentJobErrorMsg) {
            showFskBatchError(nfoAgentJobErrorMsg);
        }
        wasFskModalOpenForNfoAgent = false;
        nfoAgentJobSuccess = false;
        nfoAgentJobErrorMsg = null;
    }
}

let nfoAgentEventsBound = false;

window.bindNfoAgentEvents = function() {
    if (nfoAgentEventsBound) return;
    nfoAgentEventsBound = true;

    document.getElementById("close-modal-nfo-agent")?.addEventListener("click", closeNfoAgentModal);
    document.getElementById("btn-nfo-agent-cancel")?.addEventListener("click", closeNfoAgentModal);
    document.getElementById("btn-nfo-agent-done")?.addEventListener("click", () => {
        const wasFskOpen = wasFskModalOpenForNfoAgent;
        closeNfoAgentModal();
        if (!wasFskOpen && typeof pollHealthStatus === "function") pollHealthStatus(true);
    });
    document.getElementById("btn-nfo-agent-submit")?.addEventListener("click", submitNfoAgentJob);
    document.getElementById("btn-nfo-agent-search")?.addEventListener("click", searchNfoAgentMetadata);
    document.getElementById("nfo-agent-media-type")?.addEventListener("change", triggerNfoAgentMediaTypeChange);
    document.getElementById("btn-nfo-agent-edit-whole-series")?.addEventListener("click", () => {
        setNfoAgentEditMode("full");
    });
    document.getElementById("btn-nfo-agent-edit-back")?.addEventListener("click", () => {
        setNfoAgentEditMode(nfoAgentEditContext.originMode);
    });
    [
        ["nfo-agent-show-title", "title"],
        ["nfo-agent-show-year", "year"],
        ["nfo-agent-show-plot", "plot"],
        ["nfo-agent-show-genres", "genre"],
        ["nfo-agent-show-fsk", "fsk"]
    ].forEach(([elementId, field]) => {
        document.getElementById(elementId)?.addEventListener("input", () => {
            setNfoAgentFieldSource(field, "manual");
            updateNfoAgentCompletenessWarning();
        });
        document.getElementById(elementId)?.addEventListener("change", () => {
            setNfoAgentFieldSource(field, "manual");
            updateNfoAgentCompletenessWarning();
        });
    });
    // Episode fields are rendered dynamically: one delegated listener keeps
    // the submit label in sync while the user types.
    ["input", "change"].forEach((eventName) => {
        document.getElementById("nfo-agent-episodes-list")?.addEventListener(eventName, () => {
            updateNfoAgentCompletenessWarning();
        });
    });

    // Bind Enter key inside search box
    document.getElementById("nfo-agent-search-title")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            searchNfoAgentMetadata();
        }
    });
};

let healthActionEventsBound = false;

window.bindHealthActionEvents = function() {
    if (healthActionEventsBound) return;
    healthActionEventsBound = true;

    document.getElementById("close-modal-health-ignore")?.addEventListener("click", closeHealthIgnoreModal);
    document.getElementById("btn-health-ignore-cancel")?.addEventListener("click", closeHealthIgnoreModal);
    document.getElementById("btn-health-ignore-submit")?.addEventListener("click", submitHealthIgnoreRule);
    document.getElementById("health-ignore-select-all")?.addEventListener("change", (event) => {
        document.getElementById("health-ignore-groups")?.querySelectorAll(".health-ignore-type, .health-ignore-group-toggle").forEach((input) => {
            input.checked = event.target.checked;
            input.indeterminate = false;
        });
        event.target.indeterminate = false;
        updateHealthIgnoreSubmitState();
    });
    document.getElementById("health-ignore-groups")?.addEventListener("change", (event) => {
        const groupToggle = event.target.closest?.(".health-ignore-group-toggle");
        if (groupToggle) {
            const group = groupToggle.getAttribute("data-group");
            document.getElementById("health-ignore-groups")?.querySelectorAll(`.health-ignore-type[data-group="${group}"]`).forEach((input) => {
                input.checked = groupToggle.checked;
            });
        }
        syncHealthIgnoreToggleStates();
        updateHealthIgnoreSubmitState();
    });

    document.addEventListener("click", (e) => {
        const mediaTabBtn = e.target.closest(".health-media-tab");
        if (mediaTabBtn) {
            switchHealthMediaTab(mediaTabBtn.getAttribute("data-media-tab"));
            return;
        }

        const ignoreScopeBtn = e.target.closest(".health-ignore-scope");
        if (ignoreScopeBtn) {
            openHealthIgnoreModal(
                ignoreScopeBtn.getAttribute("data-scope-kind"),
                ignoreScopeBtn.getAttribute("data-scope-path")
            );
            return;
        }

        const nfoBtn = e.target.closest(".health-nfo-agent");
        if (nfoBtn) {
            const path = nfoBtn.getAttribute("data-path");
            if (path) {
                openNfoAgentModal(path, {
                    mode: nfoBtn.getAttribute("data-edit-mode") || "full",
                    episodeFile: nfoBtn.getAttribute("data-episode-file") || ""
                });
            }
            return;
        }

        const openFolderBtn = e.target.closest(".health-open-folder");
        if (openFolderBtn) {
            const path = openFolderBtn.getAttribute("data-path");
            if (path) window.openFolder({ path });
        }
    });
};

// Bind DOM Events for NFO Agent Modal
document.addEventListener("DOMContentLoaded", () => {
    if (typeof window.bindNfoAgentEvents === "function") {
        window.bindNfoAgentEvents();
    }
    if (typeof window.bindHealthActionEvents === "function") {
        window.bindHealthActionEvents();
    }

    // FSK-Batch Event-Listener verdrahten
    document.getElementById("close-modal-fsk-batch-preview")?.addEventListener("click", closeFskBatchModal);
    document.getElementById("btn-fsk-batch-cancel")?.addEventListener("click", closeFskBatchModal);
    document.getElementById("btn-fsk-batch-refresh")?.addEventListener("click", () => loadFskBatchPreview());
    document.getElementById("fsk-batch-scope-select")?.addEventListener("change", (e) => {
        currentFskBatchScope = e.target.value;
        loadFskBatchPreview();
    });
    document.getElementById("fsk-batch-target-select")?.addEventListener("change", (e) => {
        currentFskBatchTarget = e.target.value;
        loadFskBatchPreview();
    });
});


// ==========================================================================
// FSK-Batch Logik & UI-Controller (Phase 2.5c-1)
// ==========================================================================
let currentFskBatchItems = [];
let currentFskBatchTarget = "";
let currentFskBatchScope = "single";
let currentFskBatchPlan = null;
let currentPreviewRequestId = 0;
let isFskBatchApplying = false;

let currentFskBatchMediaKind = "unknown";

function openFskBatchModal(items, fskVal, scope = "single", mediaKind = "unknown") {
    currentFskBatchItems = items;
    currentFskBatchTarget = fskVal;
    currentFskBatchScope = scope;
    currentFskBatchPlan = null;
    currentFskBatchMediaKind = mediaKind;
    isFskBatchApplying = false;
    const isSingleMovie = mediaKind === "movie" && items.length === 1;

    const modalTitle = document.getElementById("fsk-batch-modal-title");
    if (modalTitle) modalTitle.textContent = isSingleMovie ? "FSK-Altersfreigabe setzen" : "FSK-Altersfreigabe: Stapeländerung";

    const scopeField = document.getElementById("fsk-batch-scope-field");
    if (scopeField) scopeField.style.display = isSingleMovie ? "none" : "block";

    const cancelBtn = document.getElementById("btn-fsk-batch-cancel");
    if (cancelBtn) {
        cancelBtn.textContent = "Schließen";
        cancelBtn.disabled = false;
        cancelBtn.onclick = closeFskBatchModal;
    }

    const confirmBtn = document.getElementById("btn-fsk-batch-confirm");
    if (confirmBtn) {
        confirmBtn.style.display = "";
    }

    const refreshBtn = document.getElementById("btn-fsk-batch-refresh");
    if (refreshBtn) {
        refreshBtn.style.display = "inline-flex";
        refreshBtn.disabled = false;
    }

    const modalX = document.querySelector("#modal-fsk-batch-preview .modal-close");
    if (modalX) {
        modalX.onclick = closeFskBatchModal;
    }

    const modal = document.getElementById("modal-fsk-batch-preview");
    if (modal) {
        modal.classList.remove("hidden");
        modal.classList.add("active");
    }

    const targetSelect = document.getElementById("fsk-batch-target-select");
    if (targetSelect) {
        targetSelect.disabled = false;
        targetSelect.value = fskVal;
    }

    const scopeSelect = document.getElementById("fsk-batch-scope-select");
    if (scopeSelect) {
        scopeSelect.querySelectorAll("option").forEach(opt => {
            if (opt.value === "season" || opt.value === "series") {
                if (mediaKind !== "series") {
                    opt.style.display = "none";
                    if (scope === opt.value) scope = "single";
                } else {
                    opt.style.display = "";
                }
            }
        });
        currentFskBatchScope = scope;
        scopeSelect.disabled = false;
        scopeSelect.value = scope;
    }

    const errorEl = document.getElementById("fsk-batch-error-inline");
    if (errorEl) {
        errorEl.style.display = "none";
        errorEl.textContent = "";
    }

    loadFskBatchPreview();
}

function resolveSendPaths(items, scope) {
    if (!items) return [];
    let sendPaths = [];
    for (let it of items) {
        if (!it) continue;
        if (scope === "series") {
            if (it.series_path) sendPaths.push(it.series_path);
        } else if (scope === "season") {
            if (it.season_path) sendPaths.push(it.season_path);
        } else {
            if (it.path) sendPaths.push(it.path);
        }
    }
    // Eindeutige Werte
    return [...new Set(sendPaths)];
}
// Export für Node.js Tests
if (typeof globalThis !== 'undefined') {
    globalThis.resolveSendPaths = resolveSendPaths;
}

async function loadFskBatchPreview(keepError = false) {
    const loader = document.getElementById("fsk-batch-loader");
    const container = document.getElementById("fsk-batch-tree-container");
    const summaryEl = document.getElementById("fsk-batch-summary");
    const confirmBtn = document.getElementById("btn-fsk-batch-confirm");
    const errorEl = document.getElementById("fsk-batch-error-inline");

    if (loader) loader.style.display = "flex";
    if (container) container.innerHTML = "";
    if (summaryEl) summaryEl.innerHTML = "Wird berechnet...";
    if (errorEl && !keepError) {
        errorEl.style.display = "none";
        errorEl.textContent = "";
    }
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.onclick = applyFskBatch; // Standardaktion
        confirmBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wrench" style="height: 12px; width: 12px;"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            <span>Änderungen anwenden</span>
        `;
    }

    const requestId = ++currentPreviewRequestId;

    try {
        const sendPaths = resolveSendPaths(currentFskBatchItems, currentFskBatchScope);

        if (sendPaths.length === 0) {
            if (requestId !== currentPreviewRequestId) return;
            if (container) container.innerHTML = `<div class="text-danger" style="padding:10px;">Fehler: Keine gültigen Zielpfade für den gewählten Scope gefunden.</div>`;
            if (summaryEl) summaryEl.innerHTML = "Aktion nicht möglich.";
            if (loader) loader.style.display = "none";
            return;
        }

        const res = await fetch("/api/nas/fsk-batch/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                paths: sendPaths,
                scope: currentFskBatchScope,
                new_fsk: currentFskBatchTarget
            })
        });

        if (requestId !== currentPreviewRequestId) return;

        if (!res.ok) {
            const errData = await res.json();
            const errMsg = errData.message || "Vorschau fehlgeschlagen.";
            if (container) container.innerHTML = `<div class="text-danger" style="padding:10px;">Fehler: ${escapeHTML(errMsg)}</div>`;
            if (summaryEl) summaryEl.innerHTML = "Fehler bei der Berechnung.";
            if (loader) loader.style.display = "none";
            showFskBatchError(`Fehler bei der Vorschau: ${errMsg}`);
            return;
        }

        const data = await res.json();
        if (requestId !== currentPreviewRequestId) return;
        currentFskBatchPlan = data;

        if (loader) loader.style.display = "none";

        // Hierarchischen Baum rendern
        if (container) renderFskBatchTree(data.files, container);

        // Summary anzeigen
        const sum = data.summary;
        if (summaryEl) {
            summaryEl.innerHTML = `
                <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                    <span>Gesamtanzahl NFOs: <strong>${sum.total}</strong></span>
                    <span class="text-success">Bereit zur Änderung: <strong>${sum.ready}</strong></span>
                    <span class="text-muted">Bereits korrekt: <strong>${sum.unchanged}</strong></span>
                    <span class="text-warning">NFO fehlt (übersprungen): <strong>${sum.skipped_missing}</strong></span>
                    <span class="text-danger">Problematic: <strong>${sum.skipped_problematic}</strong></span>
                </div>
            `;
        }

        // Button nur freigeben, wenn mindestens ein File "ready" ist, und Text anpassen
        // Phase-Logik (preview -> terminal if ready===0)
        if (confirmBtn) {
            if (sum.ready === 0) {
                confirmBtn.disabled = false;
                confirmBtn.onclick = () => {
                    closeFskBatchModal();
                    if (typeof pollHealthStatus === "function") pollHealthStatus(false);
                };
                confirmBtn.innerHTML = `<span>Fertig</span>`;
            } else {
                confirmBtn.disabled = false;
                confirmBtn.onclick = applyFskBatch; // Direktbindung, globaler Eventlistener ignoriert isFskBatchApplying
                confirmBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wrench" style="height: 12px; width: 12px;"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                    <span>${sum.ready} ${sum.ready === 1 ? "NFO" : "NFOs"} auf FSK ${currentFskBatchTarget} ändern</span>
                `;
            }
        }

    } catch (err) {
        if (requestId !== currentPreviewRequestId) return;
        if (container) container.innerHTML = `<div class="text-danger" style="padding:10px;">Netzwerkfehler: ${escapeHTML(err.message)}</div>`;
        if (summaryEl) summaryEl.innerHTML = "Netzwerkfehler.";
        if (loader) loader.style.display = "none";
        showFskBatchError(`Netzwerkfehler bei der Vorschau: ${err.message}`);
    }
}

function showFskBatchError(msg) {
    const errorEl = document.getElementById("fsk-batch-error-inline");
    if (errorEl) {
        errorEl.textContent = msg;
        errorEl.style.display = "block";
    }
}

function renderFskBatchTree(files, container) {
    if (!files || files.length === 0) {
        container.innerHTML = '<div class="text-muted" style="font-style:italic; text-align:center; padding:20px 0;">Keine betroffenen Dateien gefunden.</div>';
        return;
    }

    // Gruppieren nach Serie -> Staffel
    const tree = {};
    const movies = [];

    files.forEach(f => {
        const h = f.hierarchy;
        if (f.media_kind === "movie") {
            movies.push(f);
        } else {
            const showKey = h.show || "Unbekannte Serie";
            if (!tree[showKey]) {
                tree[showKey] = {};
            }
            const seasonKey = h.season || "Hauptverzeichnis / tvshow.nfo";
            if (!tree[showKey][seasonKey]) {
                tree[showKey][seasonKey] = [];
            }
            tree[showKey][seasonKey].push(f);
        }
    });

    let html = "";

    // Filme rendern
    if (movies.length > 0) {
        html += `<div style="font-weight:600; color:var(--text-main); margin-bottom:4px;">🎬 Filme</div>`;
        movies.forEach(m => {
            html += renderFskFileRow(m, 1);
        });
    }

    // Serien rendern
    const shows = Object.keys(tree).sort();
    shows.forEach(show => {
        html += `<div style="font-weight:600; color:var(--text-main); margin-top:8px; margin-bottom:4px;">📺 Serie: ${escapeHTML(show)}</div>`;
        const seasons = Object.keys(tree[show]).sort();
        seasons.forEach(season => {
            const isSeasonMain = season.includes("tvshow.nfo") || season.includes("Hauptverzeichnis");
            const indent = isSeasonMain ? 1 : 2;
            if (!isSeasonMain) {
                html += `<div style="padding-left:16px; font-weight:500; color:var(--text-muted); margin-bottom:2px;">📁 ${escapeHTML(season)}</div>`;
            }
            tree[show][season].forEach(f => {
                html += renderFskFileRow(f, indent);
            });
        });
    });

    container.innerHTML = html;
}

function renderFskFileRow(f, indent) {
    const padding = indent * 16;
    let statusBadge = "";
    let color = "var(--text-muted)";
    let rowStyle = "";

    if (f.status === "ready") {
        const fromFsk = f.current_fsk ? f.current_fsk : "Keine";
        statusBadge = `<span class="badge" style="background:rgba(16,185,129,0.1); color:#10b981; font-size:10px;">FSK ändern (${fromFsk} → FSK ${currentFskBatchTarget})</span>`;
        color = "var(--text-main)";
    } else if (f.status === "unchanged") {
        statusBadge = `<span class="badge" style="background:rgba(255,255,255,0.05); color:var(--text-muted); font-size:10px;">Bereits FSK ${currentFskBatchTarget} (übersprungen)</span>`;
    } else if (f.status === "skipped_missing") {
        let btn = "";
        if (f.agent_path) {
             btn = `<button type="button" class="btn btn-sm btn-outline-primary health-nfo-agent" style="padding:1px 6px; font-size:9px;" data-path="${escapeHTML(f.agent_path)}">Metadaten bearbeiten</button>`;
        }
        statusBadge = `${btn} <span class="badge" style="background:rgba(245,158,11,0.1); color:#f59e0b; font-size:10px;">Übersprungen: NFO fehlt</span>`;
        rowStyle = "opacity:0.6;";
    } else if (f.status === "skipped_problematic") {
        statusBadge = `<span class="badge" style="background:rgba(239,68,68,0.1); color:#ef4444; font-size:10px;">Fehler: ${escapeHTML(f.error)}</span>`;
        rowStyle = "color:#ef4444;";
    }

    const name = f.media_kind === "movie"
        ? (f.hierarchy.show || osBasename(f.path))
        : (f.hierarchy.episode ? f.hierarchy.episode : osBasename(f.path));

    return `
        <div style="padding-left:${padding}px; display:flex; justify-content:space-between; gap:10px; margin-bottom:2px; font-size:0.9em; ${rowStyle}">
            <span class="fsk-path-monospace" style="color:${color}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHTML(f.path)}">📄 ${escapeHTML(name)}</span>
            ${statusBadge}
        </div>
    `;
}

async function applyFskBatch() {
    if (!currentFskBatchPlan || isFskBatchApplying) return;

    isFskBatchApplying = true;

    const confirmBtn = document.getElementById("btn-fsk-batch-confirm");
    const cancelBtn = document.getElementById("btn-fsk-batch-cancel");
    const refreshBtn = document.getElementById("btn-fsk-batch-refresh");
    const scopeSelect = document.getElementById("fsk-batch-scope-select");
    const targetSelect = document.getElementById("fsk-batch-target-select");
    const summaryEl = document.getElementById("fsk-batch-summary");
    const errorEl = document.getElementById("fsk-batch-error-inline");

    if (errorEl) {
        errorEl.style.display = "none";
        errorEl.textContent = "";
    }
    if (confirmBtn) confirmBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    if (refreshBtn) refreshBtn.disabled = true;
    if (scopeSelect) scopeSelect.disabled = true;
    if (targetSelect) targetSelect.disabled = true;
    if (summaryEl) summaryEl.innerHTML = "Änderungen werden angewendet. Bitte warten...";

    try {
        const payloadFiles = currentFskBatchPlan.files.map(f => ({
            path: f.path,
            status: f.status,
            fingerprint: f.fingerprint
        }));

        const sendPaths = resolveSendPaths(currentFskBatchItems, currentFskBatchScope);
        if (sendPaths.length === 0) {
            showFskBatchError("Fehler: Keine gültigen Zielpfade gefunden.");
            isFskBatchApplying = false;
            if (cancelBtn) cancelBtn.disabled = false;
            if (refreshBtn) refreshBtn.disabled = false;
            if (scopeSelect) scopeSelect.disabled = false;
            if (targetSelect) targetSelect.disabled = false;
            return;
        }

        const res = await fetch("/api/nas/fsk-batch/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                root_paths: sendPaths,
                scope: currentFskBatchScope,
                new_fsk: currentFskBatchTarget,
                files: payloadFiles
            })
        });

        if (res.status === 409) {
            const errData = await res.json();
            showFskBatchError(`Konflikt/Race-Condition erkannt: ${errData.message || "Eine oder mehrere NFO-Dateien wurden extern modifiziert. Die Aktion wurde komplett abgebrochen."}`);
            isFskBatchApplying = false;
            loadFskBatchPreview(true);
            if (cancelBtn) {
                cancelBtn.disabled = false;
                cancelBtn.textContent = "Schließen";
            }
            if (refreshBtn) refreshBtn.disabled = false;
            if (scopeSelect) scopeSelect.disabled = false;
            if (targetSelect) targetSelect.disabled = false;
            return;
        }

        if (!res.ok) {
            const errData = await res.json();
            showFskBatchError("Fehler bei der Ausführung: " + (errData.message || "Unbekannter Fehler"));
            isFskBatchApplying = false;
            loadFskBatchPreview(true);
            if (cancelBtn) {
                cancelBtn.disabled = false;
                cancelBtn.textContent = "Schließen";
            }
            if (refreshBtn) refreshBtn.disabled = false;
            if (scopeSelect) scopeSelect.disabled = false;
            if (targetSelect) targetSelect.disabled = false;
            return;
        }

        const data = await res.json();
        const applySum = data.summary;
        const failedItems = data.results ? data.results.filter(r => r.status === "failed") : [];

        // 4-Phasen-Modell: completed, partial, failed
        let phase = "completed";
        if (applySum.failed > 0 && applySum.success > 0) phase = "partial";
        if (applySum.failed > 0 && applySum.success === 0) phase = "failed";

        let resultHtml = `<div style="font-weight:600; margin-bottom:4px;">Zusammenfassung der Ausführung:</div>`;
        if (phase === "failed") {
            resultHtml += `<div style="color:var(--danger); margin-bottom:8px;">Kompletter Fehlschlag. Bitte Fehler prüfen.</div>`;
        } else if (phase === "partial") {
            resultHtml += `<div style="color:var(--warning); margin-bottom:8px;">Teilweise erfolgreich abgeschlossen.</div>`;
        } else {
            resultHtml += `<div style="color:var(--success); margin-bottom:8px;">Erfolgreich abgeschlossen.</div>`;
        }

        resultHtml += `
            <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                <span class="text-success">Erfolgreich geändert: <strong>${applySum.success}</strong></span>
                <span class="text-danger">Fehlgeschlagen: <strong>${applySum.failed}</strong></span>
                <span class="text-muted">Unverändert: <strong>${applySum.unchanged}</strong></span>
            </div>
        `;

        if (failedItems.length > 0) {
            resultHtml += `<div style="color:#ef4444; font-size:0.85em; margin-top:8px; max-height:100px; overflow-y:auto;">`;
            failedItems.forEach(fi => {
                resultHtml += `⚠️ ${escapeHTML(osBasename(fi.path))}: ${escapeHTML(fi.message)}<br>`;
            });
            resultHtml += `</div>`;
        }

        if (summaryEl) summaryEl.innerHTML = resultHtml;

        if (phase === "failed") {
            // Fehlgeschlagen: Retry anbieten (Vorschau neu laden)
            isFskBatchApplying = false;
            if (cancelBtn) {
                cancelBtn.textContent = "Schließen";
                cancelBtn.disabled = false;
            }
            if (refreshBtn) refreshBtn.disabled = false;
            if (scopeSelect) scopeSelect.disabled = false;
            if (targetSelect) targetSelect.disabled = false;
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = `<span>Erneut versuchen</span>`;
                confirmBtn.onclick = applyFskBatch;
            }
        } else {
            // Completed oder Partial: Terminal-Zustand "Fertig"
            if (typeof pollHealthStatus === "function") await pollHealthStatus(false);
            if (cancelBtn) {
                cancelBtn.textContent = "Fertig";
                cancelBtn.disabled = false;
                cancelBtn.onclick = () => {
                    isFskBatchApplying = false;
                    closeFskBatchModal();
                };
            }
            if (confirmBtn) confirmBtn.style.display = "none";
            if (refreshBtn) refreshBtn.style.display = "none";

            const modalX = document.querySelector("#modal-fsk-batch-preview .modal-close");
            if (modalX) {
                modalX.onclick = () => {
                    isFskBatchApplying = false;
                    closeFskBatchModal();
                };
            }
        }

    } catch (err) {
        showFskBatchError("Netzwerkfehler: " + err.message);
        isFskBatchApplying = false;
        loadFskBatchPreview(true);
        if (cancelBtn) {
            cancelBtn.disabled = false;
            cancelBtn.textContent = "Schließen";
        }
        if (refreshBtn) refreshBtn.disabled = false;
        if (scopeSelect) scopeSelect.disabled = false;
        if (targetSelect) targetSelect.disabled = false;
    } finally {
        isFskBatchApplying = false;
    }
}

function closeFskBatchModal() {
    if (isFskBatchApplying) return;
    currentPreviewRequestId++; // Laufende Vorschau entwerten!
    const modal = document.getElementById("modal-fsk-batch-preview");
    if (modal) {
        modal.classList.remove("active");
        modal.classList.add("hidden");
    }

    // Standard-Handler zurücksetzen
    const cancelBtn = document.getElementById("btn-fsk-batch-cancel");
    if (cancelBtn) {
        cancelBtn.textContent = "Schließen";
        cancelBtn.onclick = closeFskBatchModal;
    }
    const confirmBtn = document.getElementById("btn-fsk-batch-confirm");
    if (confirmBtn) {
        confirmBtn.style.display = "";
        confirmBtn.onclick = null;
    }
    const refreshBtn = document.getElementById("btn-fsk-batch-refresh");
    if (refreshBtn) refreshBtn.style.display = "inline-flex";
}
