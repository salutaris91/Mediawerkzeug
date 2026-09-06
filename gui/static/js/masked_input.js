/**
 * masked_input.js — API Key Masking UX (Roadmap Item #24)
 *
 * Provides Clear-on-Edit, Blur-Restore, decoupled key presence indicator,
 * dirty tracking, and frontend validation gate for masked secret fields.
 */

/**
 * Checks if a given value contains masking pattern (e.g. starts with or contains ****).
 * @param {string} val
 * @returns {boolean}
 */
export function isMaskedValue(val) {
    if (!val || typeof val !== "string") return false;
    return val.startsWith("****") || val.includes("****");
}

/**
 * Updates the visual badge, border, and error state for a masked input element.
 * @param {HTMLInputElement} inputEl
 */
export function updateMaskedInputState(inputEl) {
    if (!inputEl) return;

    const val = inputEl.value;
    const orig = inputEl.dataset.original || "";
    const hasKey = inputEl.dataset.hasKey === "true";
    const isPristine = (val === orig);

    // Find wrapper, badge, and error elements
    const fieldId = inputEl.id;
    const wrapper = inputEl.closest ? inputEl.closest(".masked-key-field") : null;
    const badge = (typeof document !== "undefined" && document.getElementById(`${fieldId}-badge`)) ||
                  (wrapper && wrapper.querySelector ? wrapper.querySelector(".masked-key-badge") : null);
    const errorEl = (typeof document !== "undefined" && document.getElementById(`${fieldId}-error`)) ||
                    (wrapper && wrapper.querySelector ? wrapper.querySelector(".masked-key-error") : null);

    if (wrapper) {
        wrapper.dataset.hasKey = hasKey ? "true" : "false";
    }

    if (isPristine) {
        if (inputEl.classList) inputEl.classList.remove("is-invalid");
        if (inputEl.setAttribute) inputEl.setAttribute("aria-invalid", "false");
        if (errorEl) errorEl.textContent = "";

        if (badge) {
            if (hasKey) {
                badge.textContent = "✓";
                badge.className = "masked-key-badge badge-configured";
                if (badge.setAttribute) badge.setAttribute("title", "Hinterlegt");
            } else {
                badge.textContent = "○";
                badge.className = "masked-key-badge badge-unconfigured";
                if (badge.setAttribute) badge.setAttribute("title", "Nicht konfiguriert");
            }
        }
    } else {
        // User edited the field
        if (isMaskedValue(val)) {
            if (inputEl.classList) inputEl.classList.add("is-invalid");
            if (inputEl.setAttribute) inputEl.setAttribute("aria-invalid", "true");
            if (badge) {
                badge.textContent = "⚠";
                badge.className = "masked-key-badge badge-invalid";
                if (badge.setAttribute) badge.setAttribute("title", "Ungültiger maskierter Wert");
            }
        } else if (val !== "" && val.trim() === "") {
            // Whitespace only: invalid
            if (inputEl.classList) inputEl.classList.add("is-invalid");
            if (inputEl.setAttribute) inputEl.setAttribute("aria-invalid", "true");
            if (badge) {
                badge.textContent = "⚠";
                badge.className = "masked-key-badge badge-invalid";
                if (badge.setAttribute) badge.setAttribute("title", "Ungültige Eingabe (nur Leerzeichen)");
            }
        } else if (val.trim().length > 0) {
            if (inputEl.classList) inputEl.classList.remove("is-invalid");
            if (inputEl.setAttribute) inputEl.setAttribute("aria-invalid", "false");
            if (errorEl) errorEl.textContent = "";
            if (badge) {
                badge.textContent = "✓";
                badge.className = "masked-key-badge badge-valid";
                if (badge.setAttribute) badge.setAttribute("title", "Wird neu gespeichert");
            }
        } else {
            // Field emptied during edit (val === "").
            // Note: Deleting/clearing an API key via the UI is currently not supported
            // because empty inputs restore the original value on blur / are treated as
            // unchanged by the W1 fix. Explicit key deletion via the UI is tracked in
            // Roadmap Item #59. We show the unconfigured badge with a neutral title.
            if (inputEl.classList) inputEl.classList.remove("is-invalid");
            if (inputEl.setAttribute) inputEl.setAttribute("aria-invalid", "false");
            if (errorEl) errorEl.textContent = "";
            if (badge) {
                badge.textContent = "○";
                badge.className = "masked-key-badge badge-unconfigured";
                if (badge.setAttribute) badge.setAttribute("title", hasKey ? "Unverändert (Löschen nicht unterstützt)" : "Nicht konfiguriert");
            }
        }
    }
}

/**
 * Sets a masked input element's value and updates original/presence state.
 * @param {HTMLInputElement} inputEl
 * @param {string} value
 * @param {Object} [placeholderConfig]
 */
export function setMaskedInputValue(inputEl, value, placeholderConfig = {}) {
    if (!inputEl) return;

    const valStr = value !== undefined && value !== null ? String(value) : "";
    const hasKey = Boolean(valStr && valStr.length > 0);
    const isMasked = Boolean(valStr && isMaskedValue(valStr));

    inputEl.dataset.original = valStr;
    inputEl.dataset.hasKey = hasKey ? "true" : "false";
    inputEl.dataset.masked = isMasked ? "true" : "false";
    inputEl.dataset.editing = "false";
    inputEl.value = valStr;

    if (hasKey) {
        inputEl.placeholder = placeholderConfig.configured || "Hinterlegt";
    } else {
        inputEl.placeholder = placeholderConfig.unconfigured || "Nicht konfiguriert";
    }

    updateMaskedInputState(inputEl);
}

/**
 * Initializes Clear-on-Edit and Blur-Restore event listeners for a masked input.
 * @param {HTMLInputElement} inputEl
 */
export function setupMaskedInput(inputEl) {
    if (!inputEl || inputEl._maskedInputInitialized) return;
    inputEl._maskedInputInitialized = true;

    // Keys that should NOT trigger clear-on-edit
    const ignoredKeys = new Set([
        "Tab", "Shift", "Control", "Alt", "Meta",
        "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
        "CapsLock", "Home", "End", "PageUp", "PageDown",
        "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
        "ContextMenu", "Enter"
    ]);

    inputEl.addEventListener("focus", () => {
        // Pristine focus: do not clear value, keep masked string visible
        if (inputEl.dataset.masked === "true" && inputEl.dataset.editing !== "true") {
            // Keep value intact
        }
    });

    inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            // Escape restores original value
            inputEl.value = inputEl.dataset.original || "";
            inputEl.dataset.editing = "false";
            inputEl.dataset.masked = isMaskedValue(inputEl.dataset.original) ? "true" : "false";
            updateMaskedInputState(inputEl);
            inputEl.blur();
            e.preventDefault();
            return;
        }

        // If field is still displaying the original masked string and hasn't been edited
        if (inputEl.dataset.masked === "true" && inputEl.dataset.editing !== "true") {
            if (ignoredKeys.has(e.key) || e.ctrlKey || e.metaKey || e.altKey) {
                return;
            }

            // Clear-on-Edit: First keypress clears the masked value
            inputEl.value = "";
            inputEl.dataset.masked = "false";
            inputEl.dataset.editing = "true";

            if (e.key === "Backspace" || e.key === "Delete") {
                // Whole mask is already cleared, prevent deleting from newly emptied input
                e.preventDefault();
                updateMaskedInputState(inputEl);
            }
        }
    });

    inputEl.addEventListener("paste", () => {
        if (inputEl.dataset.masked === "true") {
            inputEl.value = "";
            inputEl.dataset.masked = "false";
            inputEl.dataset.editing = "true";
        }
    });

    inputEl.addEventListener("input", () => {
        if (inputEl.dataset.masked === "true" && inputEl.value !== inputEl.dataset.original) {
            inputEl.dataset.masked = "false";
            inputEl.dataset.editing = "true";
        }
        updateMaskedInputState(inputEl);
    });

    inputEl.addEventListener("blur", () => {
        // Blur-Restore: If user left empty after clear-on-edit without real new value, or focused without editing, restore original value
        if (inputEl.dataset.editing !== "true" || inputEl.dataset.masked === "true" || inputEl.value === "" || inputEl.value.trim() === "") {
            inputEl.value = inputEl.dataset.original || "";
            inputEl.dataset.editing = "false";
            inputEl.dataset.masked = isMaskedValue(inputEl.dataset.original) ? "true" : "false";
        } else if (inputEl.value === inputEl.dataset.original) {
            inputEl.dataset.editing = "false";
            inputEl.dataset.masked = isMaskedValue(inputEl.dataset.original) ? "true" : "false";
        }
        updateMaskedInputState(inputEl);
    });
}

/**
 * Validates a single masked input element.
 * @param {HTMLInputElement} inputEl
 * @returns {{ valid: boolean, changed: boolean, error?: string, value?: string, fieldId: string }}
 */
export function validateMaskedInput(inputEl) {
    if (!inputEl) {
        return { valid: true, changed: false, fieldId: "" };
    }

    const fieldId = inputEl.id;
    const val = inputEl.value;
    const orig = inputEl.dataset.original || "";
    const wrapper = inputEl.closest ? inputEl.closest(".masked-key-field") : null;
    const errorEl = (typeof document !== "undefined" && document.getElementById(`${fieldId}-error`)) ||
                    (wrapper && wrapper.querySelector ? wrapper.querySelector(".masked-key-error") : null);

    if (val === orig) {
        if (errorEl) errorEl.textContent = "";
        if (inputEl.classList) inputEl.classList.remove("is-invalid");
        if (inputEl.setAttribute) inputEl.setAttribute("aria-invalid", "false");
        return { valid: true, changed: false, value: val, fieldId };
    }

    // Changed: check if contains masking remnants
    if (isMaskedValue(val)) {
        const errMsg = "Der Wert enthält Maskierungszeichen (****) und wurde nicht gespeichert. Bitte das Feld vollständig leeren und den Key neu eingeben.";
        if (errorEl) errorEl.textContent = errMsg;
        if (inputEl.classList) inputEl.classList.add("is-invalid");
        if (inputEl.setAttribute) inputEl.setAttribute("aria-invalid", "true");
        updateMaskedInputState(inputEl);
        return { valid: false, changed: true, error: errMsg, fieldId };
    }

    // Changed: check for whitespace-only
    if (val !== "" && val.trim() === "") {
        const errMsg = "Ungültiger Wert: Enthält nur Leerzeichen.";
        if (errorEl) errorEl.textContent = errMsg;
        if (inputEl.classList) inputEl.classList.add("is-invalid");
        if (inputEl.setAttribute) inputEl.setAttribute("aria-invalid", "true");
        updateMaskedInputState(inputEl);
        return { valid: false, changed: true, error: errMsg, fieldId };
    }

    // Empty after Clear-on-Edit without new value: treat as unchanged (preserve original)
    if (val.trim() === "") {
        if (errorEl) errorEl.textContent = "";
        if (inputEl.classList) inputEl.classList.remove("is-invalid");
        if (inputEl.setAttribute) inputEl.setAttribute("aria-invalid", "false");
        updateMaskedInputState(inputEl);
        return { valid: true, changed: false, value: orig, fieldId };
    }

    // Valid change
    if (errorEl) errorEl.textContent = "";
    if (inputEl.classList) inputEl.classList.remove("is-invalid");
    if (inputEl.setAttribute) inputEl.setAttribute("aria-invalid", "false");
    updateMaskedInputState(inputEl);
    return { valid: true, changed: true, value: val.trim(), fieldId };
}

/**
 * Validates an array of input element IDs.
 * @param {string[]} fieldIds
 * @returns {{ valid: boolean, errors: Array<{ fieldId: string, error: string }>, changedFields: Object.<string, string> }}
 */
export function validateAllMaskedFields(fieldIds) {
    const errors = [];
    const changedFields = {};

    for (const id of fieldIds) {
        const el = typeof document !== "undefined" ? document.getElementById(id) : null;
        if (!el) continue;

        const res = validateMaskedInput(el);
        if (!res.valid) {
            errors.push({ fieldId: id, error: res.error || "Ungültiger Wert" });
        } else if (res.changed) {
            changedFields[id] = res.value;
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        changedFields
    };
}
