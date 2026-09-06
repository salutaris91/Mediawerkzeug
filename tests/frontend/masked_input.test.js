import test from "node:test";
import assert from "node:assert";
import {
    isMaskedValue,
    updateMaskedInputState,
    setMaskedInputValue,
    setupMaskedInput,
    validateMaskedInput,
    validateAllMaskedFields
} from "../../gui/static/js/masked_input.js";

function createMockInput(id = "settings-tmdb-key") {
    const listeners = {};
    const classSet = new Set();
    const attributes = {};

    const element = {
        id,
        value: "",
        placeholder: "",
        dataset: {},
        classList: {
            add(cls) { classSet.add(cls); },
            remove(cls) { classSet.delete(cls); },
            contains(cls) { return classSet.has(cls); }
        },
        setAttribute(name, val) { attributes[name] = String(val); },
        getAttribute(name) { return attributes[name]; },
        removeAttribute(name) { delete attributes[name]; },
        addEventListener(event, handler) {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(handler);
        },
        dispatch(event, eventObj = {}) {
            let prevented = false;
            const e = {
                type: event,
                preventDefault: () => { prevented = true; },
                defaultPrevented: () => prevented,
                ...eventObj
            };
            if (listeners[event]) {
                for (const handler of listeners[event]) {
                    handler(e);
                }
            }
            return e;
        },
        blur() {
            this.dispatch("blur");
        },
        focus() {
            this.dispatch("focus");
        }
    };
    return element;
}

function createMockDOM(fieldIds) {
    const elements = {};
    for (const id of fieldIds) {
        const input = createMockInput(id);
        const badge = {
            id: `${id}-badge`,
            textContent: "",
            className: "",
            attributes: {},
            setAttribute(name, val) { this.attributes[name] = String(val); }
        };
        const errorEl = {
            id: `${id}-error`,
            textContent: ""
        };
        elements[id] = input;
        elements[`${id}-badge`] = badge;
        elements[`${id}-error`] = errorEl;
    }

    const previousDoc = globalThis.document;
    globalThis.document = {
        getElementById(id) {
            return elements[id] || null;
        }
    };

    return {
        elements,
        restore() {
            if (previousDoc) {
                globalThis.document = previousDoc;
            } else {
                delete globalThis.document;
            }
        }
    };
}

test("isMaskedValue detects masked strings correctly", () => {
    assert.strictEqual(isMaskedValue("****1234"), true);
    assert.strictEqual(isMaskedValue("****"), true);
    assert.strictEqual(isMaskedValue("abc****def"), true);
    assert.strictEqual(isMaskedValue("my_real_key"), false);
    assert.strictEqual(isMaskedValue(""), false);
    assert.strictEqual(isMaskedValue(null), false);
});

test("AC1: Clear-on-Edit clears masked field on first keypress, not on focus", () => {
    const dom = createMockDOM(["settings-tmdb-key"]);
    try {
        const input = dom.elements["settings-tmdb-key"];
        setupMaskedInput(input);
        setMaskedInputValue(input, "****1234", { configured: "Hinterlegt" });

        // Pure focus: value remains unchanged (****1234)
        input.focus();
        assert.strictEqual(input.value, "****1234");
        assert.strictEqual(input.dataset.masked, "true");

        // First keypress (character "a"): clears the mask
        const keyEvent = input.dispatch("keydown", { key: "a" });
        assert.strictEqual(input.value, "");
        assert.strictEqual(input.dataset.masked, "false");
        assert.strictEqual(input.dataset.editing, "true");
    } finally {
        dom.restore();
    }
});

test("AC1: Clear-on-Edit with Backspace / Delete clears entire mask cleanly", () => {
    const dom = createMockDOM(["settings-tmdb-key"]);
    try {
        const input = dom.elements["settings-tmdb-key"];
        setupMaskedInput(input);
        setMaskedInputValue(input, "****1234", { configured: "Hinterlegt" });

        input.focus();
        assert.strictEqual(input.value, "****1234");

        // Backspace keypress
        const ev = input.dispatch("keydown", { key: "Backspace" });
        assert.strictEqual(input.value, "");
        assert.strictEqual(input.dataset.masked, "false");
        assert.strictEqual(input.dataset.editing, "true");
        assert.strictEqual(ev.defaultPrevented(), true);
    } finally {
        dom.restore();
    }
});

test("AC2: Blur-Restore restores masked value when focused and left without edit", () => {
    const dom = createMockDOM(["settings-telegram-token"]);
    try {
        const input = dom.elements["settings-telegram-token"];
        setupMaskedInput(input);
        setMaskedInputValue(input, "****5678", { configured: "Hinterlegt" });

        // Focus then blur without editing
        input.focus();
        input.blur();

        assert.strictEqual(input.value, "****5678");
        assert.strictEqual(input.dataset.editing, "false");
    } finally {
        dom.restore();
    }
});

test("AC2: Escape key restores original masked value", () => {
    const dom = createMockDOM(["settings-whatsapp-apikey"]);
    try {
        const input = dom.elements["settings-whatsapp-apikey"];
        setupMaskedInput(input);
        setMaskedInputValue(input, "****9999", { configured: "Hinterlegt" });

        input.focus();
        input.dispatch("keydown", { key: "x" });
        input.value = "partial_new";

        // Press Escape
        input.dispatch("keydown", { key: "Escape" });
        assert.strictEqual(input.value, "****9999");
        assert.strictEqual(input.dataset.editing, "false");
    } finally {
        dom.restore();
    }
});

test("AC3: Validation Gate marks field with **** as invalid and blocks submit", () => {
    const dom = createMockDOM(["settings-tmdb-key"]);
    try {
        const input = dom.elements["settings-tmdb-key"];
        const errorEl = dom.elements["settings-tmdb-key-error"];
        setupMaskedInput(input);
        setMaskedInputValue(input, "****1234");

        // Simulate user partially modifying to ****1235
        input.value = "****1235";

        const result = validateMaskedInput(input);
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.changed, true);
        assert.ok(result.error && result.error.includes("Maskierungszeichen"));
        assert.strictEqual(input.classList.contains("is-invalid"), true);
        assert.strictEqual(input.getAttribute("aria-invalid"), "true");
        assert.ok(errorEl.textContent.includes("Maskierungszeichen"));
    } finally {
        dom.restore();
    }
});

test("AC4: Dirty-Tracking includes only modified fields across all 6 fields", () => {
    const fieldIds = [
        "settings-tmdb-key",
        "settings-tvdb-key",
        "settings-telegram-token",
        "settings-telegram-chat-id",
        "settings-whatsapp-apikey",
        "settings-whatsapp-phone"
    ];
    const dom = createMockDOM(fieldIds);
    try {
        // Setup all 6 with pristine values
        setMaskedInputValue(dom.elements["settings-tmdb-key"], "****tmdb");
        setMaskedInputValue(dom.elements["settings-tvdb-key"], "****tvdb");
        setMaskedInputValue(dom.elements["settings-telegram-token"], "****tgtoken");
        setMaskedInputValue(dom.elements["settings-telegram-chat-id"], "****chatid");
        setMaskedInputValue(dom.elements["settings-whatsapp-apikey"], "****waapi");
        setMaskedInputValue(dom.elements["settings-whatsapp-phone"], "****waphone");

        // Only modify telegram-token and tmdb-key
        dom.elements["settings-telegram-token"].value = "new_tg_token_123";
        dom.elements["settings-tmdb-key"].value = "new_tmdb_key_456";

        const validation = validateAllMaskedFields(fieldIds);
        assert.strictEqual(validation.valid, true);
        assert.strictEqual(validation.errors.length, 0);

        const changed = validation.changedFields;
        assert.strictEqual(Object.keys(changed).length, 2);
        assert.strictEqual(changed["settings-telegram-token"], "new_tg_token_123");
        assert.strictEqual(changed["settings-tmdb-key"], "new_tmdb_key_456");
        assert.strictEqual("settings-tvdb-key" in changed, false);
        assert.strictEqual("settings-telegram-chat-id" in changed, false);
        assert.strictEqual("settings-whatsapp-apikey" in changed, false);
        assert.strictEqual("settings-whatsapp-phone" in changed, false);
    } finally {
        dom.restore();
    }
});

test("AC5: Trimming removes leading and trailing whitespace from input values", () => {
    const dom = createMockDOM(["settings-telegram-token"]);
    try {
        const input = dom.elements["settings-telegram-token"];
        setMaskedInputValue(input, "****old");
        input.value = "   my_trimmed_token   ";

        const res = validateMaskedInput(input);
        assert.strictEqual(res.valid, true);
        assert.strictEqual(res.value, "my_trimmed_token");
    } finally {
        dom.restore();
    }
});

test("AC6: Decoupled Key Presence indicator works for short keys (****) and empty keys", () => {
    const dom = createMockDOM(["settings-tvdb-key", "settings-whatsapp-phone"]);
    try {
        const shortKeyInput = dom.elements["settings-tvdb-key"];
        const shortKeyBadge = dom.elements["settings-tvdb-key-badge"];

        // Short key (<= 8 chars) masked to plain "****"
        setMaskedInputValue(shortKeyInput, "****", { configured: "Hinterlegt", unconfigured: "Nicht konfiguriert" });
        assert.strictEqual(shortKeyInput.dataset.hasKey, "true");
        assert.strictEqual(shortKeyBadge.textContent, "✓");
        assert.strictEqual(shortKeyBadge.className, "masked-key-badge badge-configured");

        // Unconfigured empty key
        const emptyInput = dom.elements["settings-whatsapp-phone"];
        const emptyBadge = dom.elements["settings-whatsapp-phone-badge"];
        setMaskedInputValue(emptyInput, "", { configured: "Hinterlegt", unconfigured: "Nicht konfiguriert" });
        assert.strictEqual(emptyInput.dataset.hasKey, "false");
        assert.strictEqual(emptyBadge.textContent, "○");
        assert.strictEqual(emptyBadge.className, "masked-key-badge badge-unconfigured");
    } finally {
        dom.restore();
    }
});

test("AC12: Whitespace-only input is rejected and marked as invalid", () => {
    const dom = createMockDOM(["settings-telegram-token"]);
    try {
        const input = dom.elements["settings-telegram-token"];
        setMaskedInputValue(input, "****token");
        input.value = "    ";

        const res = validateMaskedInput(input);
        assert.strictEqual(res.valid, false);
        assert.strictEqual(input.classList.contains("is-invalid"), true);
        assert.ok(res.error && res.error.includes("Leerzeichen"));
    } finally {
        dom.restore();
    }
});

test("W1: Blur-Restore restores masked value when user triggers Clear-on-Edit but blurs with empty input", () => {
    const dom = createMockDOM(["settings-telegram-token"]);
    try {
        const input = dom.elements["settings-telegram-token"];
        const badge = dom.elements["settings-telegram-token-badge"];
        setupMaskedInput(input);
        setMaskedInputValue(input, "****5678", { configured: "Hinterlegt" });

        input.focus();
        // Clear-on-Edit triggered by backspace or keypress
        input.dispatch("keydown", { key: "Backspace" });
        assert.strictEqual(input.value, "");
        assert.strictEqual(input.dataset.editing, "true");

        // User blurs without entering any new key
        input.blur();

        // Must restore original masked value and editing state
        assert.strictEqual(input.value, "****5678");
        assert.strictEqual(input.dataset.editing, "false");
        assert.strictEqual(input.dataset.masked, "true");
        assert.strictEqual(badge.textContent, "✓");
        assert.strictEqual(badge.className, "masked-key-badge badge-configured");

        // Validation must not mark as changed
        const res = validateMaskedInput(input);
        assert.strictEqual(res.valid, true);
        assert.strictEqual(res.changed, false);
    } finally {
        dom.restore();
    }
});

test("W1: Blur-Restore restores masked value when user enters whitespace and blurs", () => {
    const dom = createMockDOM(["settings-telegram-token"]);
    try {
        const input = dom.elements["settings-telegram-token"];
        setupMaskedInput(input);
        setMaskedInputValue(input, "****5678", { configured: "Hinterlegt" });

        input.focus();
        input.dispatch("keydown", { key: " " });
        input.value = "   ";

        // User blurs
        input.blur();

        assert.strictEqual(input.value, "****5678");
        assert.strictEqual(input.dataset.editing, "false");
        assert.strictEqual(input.dataset.masked, "true");
    } finally {
        dom.restore();
    }
});

test("W1: Validation treats field cleared via Clear-on-Edit without new value as unchanged (changed=false)", () => {
    const dom = createMockDOM(["settings-telegram-token"]);
    try {
        const input = dom.elements["settings-telegram-token"];
        setupMaskedInput(input);
        setMaskedInputValue(input, "****5678", { configured: "Hinterlegt" });

        input.focus();
        input.dispatch("keydown", { key: "Backspace" });
        assert.strictEqual(input.value, "");

        // Direct validation before blur
        const res = validateMaskedInput(input);
        assert.strictEqual(res.valid, true);
        assert.strictEqual(res.changed, false);
        assert.strictEqual(res.value, "****5678");
    } finally {
        dom.restore();
    }
});

test("W1: User clears field, types a new valid key, blurs -> new key is preserved and validation reports changed=true", () => {
    const dom = createMockDOM(["settings-telegram-token"]);
    try {
        const input = dom.elements["settings-telegram-token"];
        const badge = dom.elements["settings-telegram-token-badge"];
        setupMaskedInput(input);
        setMaskedInputValue(input, "****5678", { configured: "Hinterlegt" });

        input.focus();
        input.dispatch("keydown", { key: "x" });
        input.value = "new_real_secret_token";
        input.dispatch("input");

        // User blurs
        input.blur();

        // Real new value is kept
        assert.strictEqual(input.value, "new_real_secret_token");
        assert.strictEqual(input.dataset.editing, "true");
        assert.strictEqual(badge.textContent, "✓");
        assert.strictEqual(badge.className, "masked-key-badge badge-valid");

        const res = validateMaskedInput(input);
        assert.strictEqual(res.valid, true);
        assert.strictEqual(res.changed, true);
        assert.strictEqual(res.value, "new_real_secret_token");
    } finally {
        dom.restore();
    }
});
