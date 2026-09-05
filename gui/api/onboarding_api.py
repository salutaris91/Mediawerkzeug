import os
import sys
import time
import secrets
import hashlib
import subprocess
from flask import Blueprint, request, jsonify, session
from gui.core.persistence import (
    load_settings, save_settings, update_settings,
    set_password, load_env_keys, save_env_keys, mask_credential
)
from gui.core.utils import get_runtime_capabilities

onboarding_api = Blueprint('onboarding_api', __name__)

@onboarding_api.route('/onboarding/status', methods=['GET'])
def handle_onboarding_status():
    settings = load_settings()
    return jsonify({
        "onboarded": settings.get("onboarded", False),
        "onboarding_skipped_at": settings.get("onboarding_skipped_at"),
        "onboarding_completed_at": settings.get("onboarding_completed_at"),
        "telemetry_enabled": settings.get("telemetry_enabled", False),
        "newsletter_registration_status": settings.get("newsletter_registration_status", "none")
    })

@onboarding_api.route('/onboarding/setup-settings', methods=['POST'])
def handle_onboarding_setup_settings():
    settings = load_settings()
    if settings.get("onboarded", False):
        return jsonify({"error": "Setup bereits abgeschlossen"}), 403

    try:
        params = request.get_json() or {}
    except Exception:
        params = {}

    # Save the allowed setup configurations
    for k in ["inbox_dir", "outbox_dir", "media_server", "storage_targets"]:
        if k in params:
            settings[k] = params[k]

    # Re-sync legacy directory configs based on storage_targets
    for target in settings.get("storage_targets", []):
        if target.get("id") == "nas":
            settings["nas_root"] = target.get("root_path", "")
        elif target.get("id") == "pcloud":
            settings["pcloud_dir"] = target.get("root_path", "")

    if save_settings(settings):
        return jsonify({"status": "success"})
    else:
        return jsonify({"error": "Fehler beim Speichern der Einstellungen"}), 500

@onboarding_api.route('/onboarding/test-nas-connection', methods=['POST'])
def handle_onboarding_test_nas_connection():
    settings = load_settings()
    if settings.get("onboarded", False):
        return jsonify({"error": "Setup bereits abgeschlossen"}), 403

    try:
        params = request.get_json() or {}
    except Exception:
        params = {}

    nas_ip = params.get("nas_ip", "").strip()
    nas_share = params.get("nas_share", "").strip()
    nas_root = params.get("root_path", "").strip()
    nas_hostname = params.get("nas_hostname", "").strip()

    if not nas_ip or not nas_share or not nas_root:
        # In Docker mode we actually don't need ip/share from frontend, so we only need to check nas_root
        caps = get_runtime_capabilities()
        if caps.get("runtime") == "docker" and nas_root:
            pass # proceed
        else:
            return jsonify({"ok": False, "message": "Unvollständige NAS-Daten."}), 400

    caps = get_runtime_capabilities()
    if caps.get("runtime") == "docker":
        if os.path.exists(nas_root):
            if os.access(nas_root, os.W_OK):
                return jsonify({"ok": True, "message": "Verbindung erfolgreich! Medien-Root ist erreichbar und beschreibbar."})
            else:
                return jsonify({
                    "ok": False,
                    "message": f"Der Medien-Root Pfad '{nas_root}' existiert, aber es fehlen die Schreibrechte. Bitte prüfe die PUID/PGID im Docker Compose."
                })
        else:
            return jsonify({
                "ok": False,
                "message": f"Der Medien-Root Pfad '{nas_root}' existiert nicht im Container. Bitte prüfe die Docker-Volumes."
            })

    # 1. Test ping (port 445)
    import socket
    pingable = False
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1.0)
        s.connect((nas_ip, 445))
        s.close()
        pingable = True
    except Exception:
        pass

    if not pingable:
        return jsonify({
            "ok": False,
            "message": f"NAS-IP {nas_ip} ist offline oder auf Port 445 nicht erreichbar."
        })

    # 2. Try mounting if on macOS and capability allows
    caps = get_runtime_capabilities()
    if sys.platform == "darwin" and caps["capabilities"]["mount_nas"]:
        try:
            cmd = ["osascript", "-e", f'mount volume "smb://{nas_ip}/{nas_share}"']
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if result.returncode != 0:
                # Try Finder fallback
                from urllib.parse import quote
                finder_url = f"smb://{nas_hostname or nas_ip}/{quote(nas_share)}"
                subprocess.run(["open", finder_url], capture_output=True, timeout=5)
                # Wait up to 5 seconds
                for _ in range(5):
                    if os.path.exists(nas_root):
                        break
                    time.sleep(1)
            else:
                for _ in range(5):
                    if os.path.exists(nas_root):
                        break
                    time.sleep(1)
        except Exception as e:
            return jsonify({"ok": False, "message": f"Fehler beim Mount-Versuch: {e}"})

    # 3. Check if path exists
    if os.path.exists(nas_root):
        return jsonify({"ok": True, "message": "Verbindung erfolgreich! NAS-Ordner ist erreichbar."})
    else:
        return jsonify({
            "ok": False,
            "message": f"NAS ist erreichbar, aber der lokale Pfad '{nas_root}' existiert nicht oder ist nicht eingehängt."
        })

@onboarding_api.route('/onboarding/set-password', methods=['POST'])
def handle_onboarding_set_password():
    settings = load_settings()
    if settings.get("onboarded", False):
        return jsonify({"error": "Setup bereits abgeschlossen"}), 403

    try:
        params = request.get_json() or {}
    except Exception:
        params = {}

    password = params.get("password")
    if not password:
        return jsonify({"error": "Kein Passwort übergeben"}), 400

    # Set password
    if not set_password(password):
        return jsonify({"error": "Passwort konnte nicht gesetzt werden"}), 500

    # Load mutated settings to compute current hash version for session
    settings = load_settings()
    pw_hash = settings.get("password_hash", "")

    # Establish authenticated session directly
    session['authenticated'] = True
    session['auth_version'] = hashlib.sha256(pw_hash.encode('utf-8')).hexdigest()

    # Generate CSRF token for subsequent POST requests
    csrf_token = secrets.token_hex(32)
    session['csrf_hash'] = hashlib.sha256(csrf_token.encode('utf-8')).hexdigest()

    from gui.core.helpers import log_message
    log_message("🔒 [Onboarding] PIN/Passwort erfolgreich eingerichtet.")

    return jsonify({
        "status": "success",
        "csrf_token": csrf_token
    })

@onboarding_api.route('/onboarding/complete', methods=['POST'])
def handle_onboarding_complete():
    settings = load_settings()
    if settings.get("onboarded", False):
        return jsonify({"error": "Setup bereits abgeschlossen"}), 403

    try:
        params = request.get_json() or {}
    except Exception:
        params = {}

    # Validate minimal requirements
    inbox = settings.get("inbox_dir", "").strip()
    outbox = settings.get("outbox_dir", "").strip()
    media_server = settings.get("media_server", "").strip()

    if not inbox or not outbox or not media_server:
        return jsonify({"error": "Bitte richte Inbox, Outbox und Medienserver ein."}), 400

    # Set onboarding markers
    settings["onboarded"] = True
    settings["onboarding_completed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    settings["telemetry_enabled"] = bool(params.get("telemetry_enabled", False))

    if save_settings(settings):
        # Trigger async onboarding complete telemetry event
        if settings["telemetry_enabled"]:
            try:
                from gui.core.telemetry import track_event_async
                track_event_async("app_onboarding_complete")
            except Exception:
                pass
        return jsonify({"status": "success"})
    else:
        return jsonify({"error": "Fehler beim Speichern der Einstellungen"}), 500

@onboarding_api.route('/onboarding/skip', methods=['POST'])
def handle_onboarding_skip():
    settings = load_settings()
    if settings.get("onboarded", False):
        return jsonify({"error": "Setup bereits abgeschlossen"}), 403

    settings["onboarded"] = True
    settings["onboarding_skipped_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    settings["onboarding_completed_at"] = None

    if save_settings(settings):
        return jsonify({"status": "success"})
    else:
        return jsonify({"error": "Fehler beim Speichern der Einstellungen"}), 500

@onboarding_api.route('/keys', methods=['GET', 'POST'])
def handle_onboarding_keys():
    settings = load_settings()
    onboarded = settings.get("onboarded", False)

    if onboarded:
        # Require authentication when onboarded
        authenticated = session.get('authenticated', False)
        if settings.get("password_hash") and not authenticated:
            return jsonify({"error": "Nicht authentifiziert"}), 401

    if request.method == 'POST':
        try:
            params = request.get_json() or {}
        except Exception:
            params = {}

        updates = {}
        field_feedback = {}
        for k in ["TMDB_API_KEY", "TVDB_API_KEY", "tmdb_api_key", "tvdb_api_key"]:
            if k in params:
                val = params[k]
                if isinstance(val, str):
                    if val != "" and val.strip() == "":
                        return jsonify({"error": f"Ungültiger Wert für '{k}': Enthält nur Leerzeichen.", "field": k}), 400
                    from gui.core.persistence import is_masked
                    if is_masked(val) or "****" in val:
                        return jsonify({"error": f"Maskierter Wert für '{k}' erkannt. Bitte das Feld vollständig leeren und den Key neu eingeben.", "field": k}), 400
                    val = val.strip()
                env_key = "TMDB_API_KEY" if "tmdb" in k.lower() else "TVDB_API_KEY"
                updates[env_key] = val
                field_feedback[k] = {"status": "saved"}

        if updates:
            save_env_keys(updates)
            # Reload keys in metadata runtime module
            try:
                from gui.mw_metadata import reload_metadata_keys
                reload_metadata_keys()
            except Exception as e:
                print(f"Error reloading metadata keys: {e}", file=sys.stderr)
        return jsonify({"status": "success", "fields": field_feedback})
    else:
        from gui.core.persistence import load_env_keys, mask_credential
        keys = load_env_keys()
        masked_keys = {}
        for k in ["TMDB_API_KEY", "TVDB_API_KEY"]:
            masked_keys[k] = mask_credential(keys.get(k, ""))
        return jsonify(masked_keys)

@onboarding_api.route('/onboarding/register-email', methods=['POST'])
def handle_onboarding_register_email():
    settings = load_settings()
    if settings.get("onboarded", False):
        return jsonify({"error": "Setup bereits abgeschlossen"}), 403

    try:
        params = request.get_json() or {}
    except Exception:
        params = {}

    email = params.get("email", "").strip()
    if not email:
        return jsonify({"error": "Keine E-Mail angegeben"}), 400

    # Set newsletter status to pending
    def mutate_pending(data):
        data["newsletter_registration_status"] = "pending"
    update_settings(mutate_pending)

    from gui.core.telemetry import send_newsletter_registration
    success = send_newsletter_registration(email)

    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    def mutate_result(data):
        data["newsletter_registration_status"] = "registered" if success else "failed"
        if success:
            data["newsletter_registered_at"] = timestamp
    update_settings(mutate_result)

    if success:
        return jsonify({"status": "success", "message": "Erfolgreich für den Newsletter registriert."})
    else:
        return jsonify({"error": "Registrierung fehlgeschlagen. Der Registrierungs-Dienst ist zurzeit nicht erreichbar."}), 502
