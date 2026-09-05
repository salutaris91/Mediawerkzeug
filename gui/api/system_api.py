from gui.core.helpers import get_folder_size_bytes
import os, sys, json, time, shutil, subprocess, urllib, threading
from flask import Blueprint, request, jsonify, Response, send_from_directory
from gui.core.utils import load_settings, save_settings, clean_show_name, load_show_profile, save_show_profile, load_konv_history, get_runtime_capabilities, MW_APP_VERSION
from gui.core.helpers import *
from gui.core.helpers import log_queue
from gui.core.transfers import *
from gui.workers.processor import *
from gui.workers.youtube_worker import *
import gui.core.media as media
import gui.mw_metadata as mw_metadata

system_api = Blueprint('system_api', __name__)
NAS_CONNECT_COOLDOWN_SECONDS = 5
failed_attempts = {}
failed_attempts_lock = threading.Lock()

# Global variables imported from processor
from gui.workers.processor import SYSTEM_STATUS



@system_api.route('/system/quality-info', methods=['GET'])
def handle_api_quality_info():
    """Liefert die Zuordnung von Qualitätswert zu Encoder-Parameter."""
    quality = request.args.get("quality", "60")
    try:
        from gui.core.media import get_quality_mapping_info
        info = get_quality_mapping_info(quality)
        return jsonify(info)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@system_api.route('/system/capabilities', methods=['GET'])
def handle_api_capabilities():
    caps = get_runtime_capabilities()

    import glob
    import os
    import time
    import subprocess

    # Cache hardware diagnostics for 60 seconds
    if not hasattr(handle_api_capabilities, "last_hw_diag") or time.time() - getattr(handle_api_capabilities, "last_hw_check", 0) > 60:
        devices = glob.glob('/dev/dri/renderD*')
        dri_exists = len(devices) > 0
        device_path = None
        dri_writable = False
        vaapi_probe_success = False

        for dev in sorted(devices):
            if os.access(dev, os.R_OK | os.W_OK):
                dri_writable = True
                device_path = dev
                break

        if dri_writable and device_path:
            # Short FFmpeg probe (software decode of black frame -> VAAPI encode)
            try:
                cmd = ["ffmpeg", "-nostdin", "-vaapi_device", device_path, "-f", "lavfi", "-i", "color=c=black:s=128x128:r=1:d=0.1", "-vf", "format=nv12,hwupload", "-c:v", "hevc_vaapi", "-f", "null", "-"]
                res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
                vaapi_probe_success = (res.returncode == 0)
            except Exception as e:
                log_message(f"⚠️ VAAPI-Probe-Encoding fehlgeschlagen ({device_path}): {e}")

        handle_api_capabilities.last_hw_diag = {
            "dri_exists": dri_exists,
            "dri_writable": dri_writable,
            "device_path": device_path,
            "vaapi_probe_success": vaapi_probe_success
        }
        handle_api_capabilities.last_hw_check = time.time()

    caps["hardware_encoding_diagnostics"] = handle_api_capabilities.last_hw_diag
    return jsonify(caps)

@system_api.route('/healthz', methods=['GET'])
def handle_api_healthz():
    return jsonify({"ok": True})

@system_api.route('/settings', methods=['GET', 'POST'])
def handle_api_settings():
    from gui.core.persistence import update_settings, save_env_keys, load_env_keys, mask_credential, is_masked
    import gui.mw_metadata as mw_metadata

    if request.method == 'POST':
        try:
            params = request.get_json() or {}
        except Exception:
            params = {}

        # Validate key fields: reject masked values and whitespace-only values
        key_fields = ["tmdb_api_key", "tvdb_api_key", "telegram_token", "telegram_chat_id", "whatsapp_apikey", "whatsapp_phone"]
        field_feedback = {}
        for k in key_fields:
            if k in params:
                val = params[k]
                if isinstance(val, str):
                    if val != "" and val.strip() == "":
                        return jsonify({"error": f"Ungültiger Wert für '{k}': Enthält nur Leerzeichen.", "field": k}), 400
                    if is_masked(val) or "****" in val:
                        return jsonify({"error": f"Maskierter Wert für '{k}' erkannt. Bitte das Feld vollständig leeren und den Key neu eingeben.", "field": k}), 400
                    params[k] = val.strip()
                field_feedback[k] = {"status": "saved"}

        # Extract env variables from params
        env_updates = {}
        if "tmdb_api_key" in params:
            val = params.pop("tmdb_api_key")
            env_updates["TMDB_API_KEY"] = val
        if "tvdb_api_key" in params:
            val = params.pop("tvdb_api_key")
            env_updates["TVDB_API_KEY"] = val

        # Save env variables if changed
        if "TMDB_API_KEY" in env_updates or "TVDB_API_KEY" in env_updates:
            save_env_keys(env_updates)
            mw_metadata.reload_metadata_keys()

        def mutate(data):
            for k, v in params.items():
                data[k] = v

        if update_settings(mutate):
            return jsonify({"status": "success", "fields": field_feedback})
        else:
            return jsonify({"error": "Failed to save settings"}), 500
    else:
        settings = load_settings()

        # Mask credentials instead of popping them blindly
        settings["telegram_token"] = mask_credential(settings.get("telegram_token", ""))
        settings["telegram_chat_id"] = mask_credential(settings.get("telegram_chat_id", ""))
        settings["whatsapp_apikey"] = mask_credential(settings.get("whatsapp_apikey", ""))
        settings["whatsapp_phone"] = mask_credential(settings.get("whatsapp_phone", ""))

        # Also append masked env keys
        env_keys = load_env_keys()
        settings["tmdb_api_key"] = mask_credential(env_keys.get("TMDB_API_KEY", ""))
        settings["tvdb_api_key"] = mask_credential(env_keys.get("TVDB_API_KEY", ""))

        return jsonify(settings)



@system_api.route('/check-dependencies', methods=['GET', 'POST'])
def handle_api_check_dependencies():
    try:
        params = request.get_json() or {}
    except Exception:
        params = {}
    query = request.args
    force = query.get("force", "false").lower() == "true"
    results = check_dependency_status(force_updates=force)
    return jsonify(results)



@system_api.route('/update-status', methods=['GET'])
def handle_api_update_status():
    from gui.core.persistence import load_env_keys
    env_keys = load_env_keys()
    repo = os.environ.get("MW_UPDATE_REPO") or env_keys.get("MW_UPDATE_REPO", "")

    if not repo:
        return jsonify({
            "update_check_available": False,
            "current_version": MW_APP_VERSION,
            "latest_version": None,
            "update_available": False,
            "runtime": get_runtime_capabilities().get("runtime", "desktop")
        })

    latest_version = fetch_latest_github_version(repo)
    if not latest_version:
        return jsonify({
            "update_check_available": True,
            "current_version": MW_APP_VERSION,
            "latest_version": None,
            "update_available": False,
            "error": "Fehler beim Abrufen der neuesten Version von GitHub",
            "runtime": get_runtime_capabilities().get("runtime", "desktop")
        })

    update_available = False
    try:
        from packaging import version
        update_available = version.parse(latest_version) > version.parse(MW_APP_VERSION)
    except Exception:
        try:
            import re
            l_parts = [int(x) for x in re.findall(r"\d+", MW_APP_VERSION)]
            r_parts = [int(x) for x in re.findall(r"\d+", latest_version)]
            update_available = r_parts > l_parts
        except Exception:
            update_available = (latest_version.strip() != MW_APP_VERSION.strip())

    runtime = get_runtime_capabilities().get("runtime", "desktop")
    recommended_command = ""
    if runtime == "docker":
        recommended_command = "docker compose pull && docker compose up -d"

    return jsonify({
        "update_check_available": True,
        "current_version": MW_APP_VERSION,
        "latest_version": latest_version,
        "update_available": update_available,
        "runtime": runtime,
        "recommended_command": recommended_command
    })





def _get_profile_logic():
    show_name = request.args.get("show_name", "").strip()
    if not show_name:
        try:
            params = request.get_json() or {}
        except Exception:
            params = {}
        show_name = params.get("show_name", "").strip()
    if not show_name:
        return jsonify({"error": "show_name parameter is missing"}), 400
    profile = load_show_profile(show_name)
    return jsonify(profile)

def _post_profile_logic():
    try:
        params = request.get_json() or {}
    except Exception:
        params = {}
    show_name = params.get("show_name")
    profile_data = params.get("profile")
    if not show_name or not profile_data:
        return jsonify({"error": "show_name or profile parameter is missing"}), 400
    success = save_show_profile(show_name, profile_data)
    return jsonify({"success": success})

@system_api.route('/profile', methods=['GET', 'POST'])
def handle_api_profile():
    if request.method == 'GET' or (request.method == 'POST' and not request.is_json):
        return _get_profile_logic()
    else:
        return _post_profile_logic()

@system_api.route('/get-profile', methods=['GET'])
def handle_api_get_profile():
    return _get_profile_logic()

@system_api.route('/post-profile', methods=['POST'])
def handle_api_post_profile():
    return _post_profile_logic()



@system_api.route('/system-restart', methods=['POST'])
@system_api.route('/system/restart', methods=['POST'])
def handle_api_system_restart():
    try:
        params = request.get_json() or {}
    except Exception:
        params = {}
    query = request.args
    active_count = 0
    from gui.core.jobs import get_all_jobs
    for job in get_all_jobs():
        if job.get("status") not in ("done", "error"):
            active_count += 1

    if active_count > 0:
        return jsonify({
            "status": "busy",
            "message": "Der Server kann nicht neu gestartet werden, da aktuell noch Konvertierungen oder Dateiübertragungen laufen!"
        })

    # Run after sending the response. Docker owns the process lifecycle and
    # restarts the container; only the desktop runtime may spawn its successor.
    threading.Thread(target=_restart_server_process, daemon=True).start()
    return jsonify({"status": "restarting"})


def _restart_server_process():
    time.sleep(1.0)
    runtime = get_runtime_capabilities().get("runtime", "desktop")

    if runtime == "docker":
        print("Requesting container restart via Docker supervisor...", flush=True)
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(0)
        return

    print("Restarting desktop server process via subprocess...", flush=True)
    main_py = os.path.abspath(os.path.join(os.path.dirname(os.path.dirname(__file__)), "main.py"))
    env = os.environ.copy()
    project_root = os.path.abspath(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".."))

    existing_pythonpath = env.get("PYTHONPATH", "")
    pythonpath_parts = [project_root]
    if existing_pythonpath:
        pythonpath_parts.append(existing_pythonpath)
    env["PYTHONPATH"] = os.pathsep.join(pythonpath_parts)

    args = [sys.executable, main_py, "--restarted"]
    try:
        subprocess.Popen(args, env=env, close_fds=True, start_new_session=True)
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(0)
    except Exception as exc:
        print(f"Error spawning restart process: {exc}", file=sys.stderr, flush=True)



@system_api.route('/status', methods=['GET', 'POST'])
def handle_api_status():
    try:
        params = request.get_json() or {}
    except Exception:
        params = {}
    query = request.args
    settings = load_settings()
    inbox = settings.get("inbox_dir")
    if not inbox:
        inbox = os.path.expanduser("~/Downloads/Medien Input")
    outbox = settings.get("outbox_dir")
    if not outbox:
        outbox = os.path.expanduser("~/Downloads/Medien Output")

    os.makedirs(inbox, exist_ok=True)
    os.makedirs(outbox, exist_ok=True)

    projects = []
    project_types = {}
    video_exts = ('.mp4', '.mkv', '.avi', '.webm', '.mov', '.ts', '.m2ts', '.flv', '.3gp', '.wmv')
    for d in os.listdir(inbox):
        if d.startswith("."):
            continue
        full_path = os.path.join(inbox, d)
        if os.path.isdir(full_path):
            projects.append(d)
            project_types[d] = True
        elif os.path.isfile(full_path) and os.path.splitext(d)[1].lower() in video_exts:
            projects.append(d)
            project_types[d] = False

    import time
    # Cache NAS status and details for 30 seconds to avoid P5 pinging constantly
    force_check = request.args.get("force_nas_check", "false").lower() == "true"
    if not hasattr(handle_api_status, "last_nas_details") or force_check or time.time() - getattr(handle_api_status, "last_nas_check", 0) > 30:
        handle_api_status.last_nas_details = check_nas_connection_details()
        handle_api_status.last_nas_status = handle_api_status.last_nas_details["status"]
        handle_api_status.last_nas_check = time.time()

    from gui.workers.processor import SYSTEM_METRICS, METRICS_LOCK
    with METRICS_LOCK:
        inbox_size_gb = SYSTEM_METRICS.get('inbox_size_gb')
        outbox_size_gb = SYSTEM_METRICS.get('outbox_size_gb')
        inbox_bytes = SYSTEM_METRICS.get('inbox_bytes')
        outbox_bytes = SYSTEM_METRICS.get('outbox_bytes')
        metrics_loading = (SYSTEM_METRICS.get('last_updated', 0) == 0)

    # Use 0.0 as fallback for UI if None
    inbox_val = inbox_size_gb if inbox_size_gb is not None else 0.0
    outbox_val = outbox_size_gb if outbox_size_gb is not None else 0.0

    status = {
        "nas_status": handle_api_status.last_nas_status,
        "nas_details": handle_api_status.last_nas_details,
        "inbox_path": inbox,
        "outbox_path": outbox,
        "streamfab_downloads": check_streamfab(),
        "projects": sorted(projects),
        "project_types": project_types,
        "inbox_size_gb": inbox_val,
        "outbox_size_gb": outbox_val,
        "inbox_bytes": inbox_bytes if inbox_bytes is not None else 0,
        "outbox_bytes": outbox_bytes if outbox_bytes is not None else 0,
        "metrics_loading": metrics_loading
    }

    return jsonify(status)


@system_api.route('/nas/test', methods=['POST'])
def handle_api_nas_test():
    """Prüft die NAS-Verbindung live anhand der gesendeten (ungespeicherten) Konfigurationsdaten."""
    try:
        data = request.json or {}
        nas_ip = data.get("nas_ip", "").strip()
        nas_ip_backup = data.get("nas_ip_backup", "").strip()
        nas_share = data.get("nas_share", "").strip()
        root_path = data.get("root_path", "").strip()

        # Test 3: Lokaler Pfad vorhanden und lesbar (getrennt ermittelt)
        local_path_exists = os.path.isdir(root_path) if root_path else False
        local_path_readable = False
        if local_path_exists:
            try:
                local_path_readable = os.access(root_path, os.R_OK)
            except Exception:
                pass

        # Test 1: Server erreichbar (Port 445 auf Primary oder Backup IP)
        server_reachable = False
        reachable_ip = None
        is_docker = get_runtime_capabilities()["runtime"] == "docker"
        if is_docker and local_path_exists and local_path_readable:
            server_reachable = True
            reachable_ip = "Container-Pfad erreichbar"
        elif not nas_ip and not nas_ip_backup and local_path_exists and local_path_readable:
            server_reachable = True
            reachable_ip = "Lokal gemountet (keine IP erforderlich)"
        else:
            for ip in [nas_ip, nas_ip_backup]:
                if not ip:
                    continue
                try:
                    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    s.settimeout(0.3)
                    s.connect((ip, 445))
                    s.close()
                    server_reachable = True
                    reachable_ip = ip
                    break
                except Exception:
                    pass

        # Test 2: Freigabe angegeben (unter Docker oder bei rein lokal gemountetem Pfad nicht erforderlich)
        is_docker = get_runtime_capabilities()["runtime"] == "docker"
        local_or_docker = (not nas_ip and not nas_ip_backup and local_path_exists and local_path_readable) or (is_docker and local_path_exists and local_path_readable)

        if local_or_docker:
            share_specified = True
        else:
            share_specified = bool(nas_share)

        # Test 4: Bibliotheksordner vorhanden & fehlende Kategorien ermitteln
        categories_found = False
        missing_categories = []

        settings = load_settings()
        sync_cats = settings.get("sync_categories", [])

        if local_path_exists and local_path_readable and root_path and sync_cats:
            valid_cats = 0
            for cat in sync_cats:
                nas_sub = cat.get("nas_sub")
                if not nas_sub:
                    continue
                cat_path = os.path.join(root_path, nas_sub.lstrip("/"))
                if os.path.isdir(cat_path) and os.access(cat_path, os.R_OK):
                    valid_cats += 1
                else:
                    missing_categories.append(nas_sub)
            if valid_cats > 0:
                categories_found = True

        # Prüfen, ob Medienordner vorhanden sind
        media_folders_found = False
        if categories_found:
            # Wir patchen temporär das nas_root in den settings für den walk_nas_categories
            temp_settings = dict(settings)
            temp_settings["nas_root"] = root_path
            # Finde nas-Ziel und update root_path
            for target in temp_settings.get("storage_targets", []):
                if target.get("id") == "nas":
                    target["root_path"] = root_path
                    target["nas_ip"] = nas_ip
                    target["nas_ip_backup"] = nas_ip_backup
                    target["nas_share"] = nas_share
            from gui.core.transfers import walk_nas_categories
            shows_gen = walk_nas_categories(temp_settings)
            try:
                next(shows_gen)
                media_folders_found = True
            except StopIteration:
                media_folders_found = False

        return jsonify({
            "server_reachable": server_reachable,
            "reachable_ip": reachable_ip,
            "share_specified": share_specified,
            "share_required": not local_or_docker,
            "local_path_exists": local_path_exists,
            "local_path_readable": local_path_readable,
            "categories_found": categories_found,
            "missing_categories": missing_categories,
            "media_folders_found": media_folders_found
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@system_api.route('/nas/connect', methods=['POST'])
def handle_api_nas_connect():
    """Try to mount the configured NAS immediately and refresh the cached status."""
    caps = get_runtime_capabilities()
    if not caps["capabilities"]["mount_nas"]:
        nas_details = check_nas_connection_details()
        return jsonify({
            "ok": False,
            "nas_status": nas_details["status"],
            "nas_details": nas_details,
            "message": "NAS muss im Docker-Betrieb als externes Volume gemountet sein."
        }), 403

    now = time.time()
    last_attempt = getattr(handle_api_nas_connect, "last_attempt", 0)
    if now - last_attempt < NAS_CONNECT_COOLDOWN_SECONDS:
        cached_details = getattr(handle_api_status, "last_nas_details", None)
        if not cached_details:
            cached_details = check_nas_connection_details()
        return jsonify({
            "ok": False,
            "nas_status": cached_details["status"],
            "nas_details": cached_details,
            "message": "Bitte warte kurz, bevor du erneut eine NAS-Verbindung startest."
        }), 429
    handle_api_nas_connect.last_attempt = now

    try:
        ensure_nas_mounted(allow_finder_fallback=True)
        nas_details = check_nas_connection_details()
        nas_status = nas_details["status"]
        handle_api_status.last_nas_details = nas_details
        handle_api_status.last_nas_status = nas_status
        handle_api_status.last_nas_check = now

        if nas_status == "connected":
            return jsonify({
                "ok": True,
                "nas_status": nas_status,
                "nas_details": nas_details,
                "message": "NAS wurde erfolgreich verbunden."
            })

        if nas_status == "connected_but_no_library_paths":
            return jsonify({
                "ok": True,
                "warning": True,
                "nas_status": nas_status,
                "nas_details": nas_details,
                "message": nas_details.get("error_message") or "NAS ist verbunden, aber es wurden keine Kategoriepfade gefunden."
            })

        if nas_status == "available_not_mounted":
            message = nas_details.get("error_message") or (
                "NAS ist erreichbar, konnte aber nicht eingebunden werden. "
                "Bitte prüfe die SMB-Zugangsdaten im macOS-Schlüsselbund."
            )
        else:
            message = nas_details.get("error_message") or (
                "NAS konnte nicht erreicht werden. Bitte prüfe Netzwerk, "
                "Tailscale und die SMB-Einstellungen."
            )

        return jsonify({"ok": False, "nas_status": nas_status, "nas_details": nas_details, "message": message}), 503
    except Exception as e:
        log_message(f"❌ Manueller NAS-Verbindungsversuch fehlgeschlagen: {e}")
        nas_details = check_nas_connection_details()
        if nas_details.get("error_message") is None:
            nas_details["error_message"] = f"Fehler beim Verbinden: {e}"
        handle_api_status.last_nas_details = nas_details
        handle_api_status.last_nas_status = nas_details["status"]
        handle_api_status.last_nas_check = now
        return jsonify({
            "ok": False,
            "nas_status": nas_details["status"],
            "nas_details": nas_details,
            "message": f"NAS-Verbindung fehlgeschlagen: {e}"
        }), 500



def resolve_folder_request_path(params):
    path = params.get("path")
    category_id = params.get("category_id")

    folder_path = None

    if path:
        if path and os.path.exists(path) and os.path.isfile(path):
            folder_path = os.path.dirname(path)
        else:
            folder_path = path
    elif category_id:
        folder_name = params.get("folder_name") or ""

        settings = load_settings()
        nas_root = ""
        for target in settings.get("storage_targets", []):
            if target.get("id") == "nas" and target.get("enabled", True):
                nas_root = target.get("root_path", "")
                break
        if not nas_root:
            nas_root = settings.get("nas_root", "")

        if not nas_root:
            return None, "NAS-Root ist nicht konfiguriert."
        sync_categories = settings.get("sync_categories", [])

        category = None
        for cat in sync_categories:
            if str(cat.get("id")) == str(category_id):
                category = cat
                break

        if not category:
            return None, f"Kategorie mit ID {category_id} nicht gefunden."

        nas_sub = category.get("nas_sub", "").lstrip("/")
        cat_path = os.path.join(nas_root, nas_sub)

        if folder_name:
            specific_path = os.path.join(cat_path, folder_name)
            if os.path.exists(specific_path):
                folder_path = specific_path
            else:
                folder_path = cat_path
        else:
            folder_path = cat_path

    if not folder_path:
        return None, "Pfad oder Kategorie-Parameter fehlt."

    folder_path = os.path.realpath(folder_path)
    if not is_path_allowed(folder_path):
        return None, "Access Denied"

    if not os.path.exists(folder_path):
        return None, f"Pfad existiert nicht: {folder_path}. Ist das NAS gemountet?"

    if not os.path.isdir(folder_path):
        return None, f"Pfad ist kein Ordner: {folder_path}"

    return folder_path, None

@system_api.route('/system-open-folder', methods=['POST'])
def handle_api_system_open_folder():
    caps = get_runtime_capabilities()
    if not caps["capabilities"]["open_local_folder"]:
        return jsonify({"error": "Diese Funktion ist im Docker-Betrieb nicht verfügbar."}), 403

    try:
        params = request.get_json() or {}
    except Exception:
        params = {}

    folder_path, error = resolve_folder_request_path(params)
    if error:
        return jsonify({"error": error})

    try:
        open_folder_in_finder(folder_path)
        return jsonify({"success": True, "msg": f"Ordner {folder_path} im Finder geöffnet."})
    except Exception as e:
        return jsonify({"error": f"Fehler beim Öffnen des Ordners: {str(e)}"})

@system_api.route('/system-folder-contents', methods=['POST'])
def handle_api_system_folder_contents():
    try:
        params = request.get_json() or {}
    except Exception:
        params = {}

    folder_path, error = resolve_folder_request_path(params)
    if error:
        status_code = 403 if "Access Denied" in error else 400
        return jsonify({"error": error}), status_code

    try:
        entries = []
        with os.scandir(folder_path) as it:
            for entry in it:
                if entry.name.startswith('.'):
                    continue
                try:
                    stat = entry.stat()
                    is_dir = entry.is_dir()
                    entries.append({
                        "name": entry.name,
                        "is_dir": is_dir,
                        "size_bytes": stat.st_size if not is_dir else None,
                        "modified_time": stat.st_mtime,
                        "is_error": False
                    })
                except OSError as e:
                    entries.append({
                        "name": entry.name,
                        "is_dir": False,
                        "size_bytes": None,
                        "modified_time": None,
                        "is_error": True,
                        "error": str(e)
                    })
                if len(entries) >= 1000:
                    break

        entries.sort(key=lambda x: (not x.get("is_dir", False), x.get("name", "").lower()))

        return jsonify({
            "success": True,
            "path": folder_path,
            "folder_name": os.path.basename(folder_path),
            "files": entries
        })
    except Exception as e:
        return jsonify({"error": f"Fehler beim Lesen des Ordners: {str(e)}"}), 500






@system_api.route('/stats', methods=['GET', 'POST'])
def handle_api_stats():
    try:
        params = request.get_json() or {}
    except Exception:
        params = {}
    query = request.args
    try:
        settings = load_settings()

        from gui.workers.processor import SYSTEM_METRICS, METRICS_LOCK
        with METRICS_LOCK:
            nas_info = SYSTEM_METRICS.get('nas_info')
            metrics_loading = (SYSTEM_METRICS.get('last_updated', 0) == 0)

        if nas_info is None:
            targets = [t for t in settings.get("storage_targets", []) if t.get("enabled", True)]
            nas_info = {
                "name": targets[0]["name"] if targets else "",
                "type": targets[0].get("type", "") if targets else "",
                "available": False,
                "total": None, "used": None, "free": None, "used_percent": None,
                "path": targets[0].get("root_path", "") if targets else "",
                "error": "Lade Speicherdaten...",
            }

        # Conversion savings calculations
        history = load_konv_history()

        total_files = len(history)
        size_in_total = 0
        size_out_total = 0
        ratios = []
        cleaned_history = []

        # Nur Einträge mit ECHTEN Größendaten fließen in die Ersparnis-/Ratio-Statistik
        # ein. Alt-Einträge ohne Größe würden sonst geschätzt werden müssen, was die
        # Zahlen verfälscht (frühere Schätzung erzeugte negative Ersparnis).
        for entry in history:
            size_in = entry.get("size_in")
            size_out = entry.get("size_out")
            ratio = entry.get("ratio")

            has_real_sizes = (
                isinstance(size_in, (int, float)) and isinstance(size_out, (int, float))
                and size_in > 1000
            )
            if not has_real_sizes:
                continue

            size_in_total += size_in
            size_out_total += size_out
            if isinstance(ratio, (int, float)) and ratio > 0:
                ratios.append(ratio)

            cleaned_history.append({
                "quality": entry.get("quality", "Unbekannt"),
                "codec": entry.get("codec", "hevc"),
                "ratio": ratio if isinstance(ratio, (int, float)) else (size_out / size_in),
                "size_in": size_in,
                "size_out": size_out,
                "timestamp": entry.get("timestamp", 0)
            })

        saved_bytes = max(0, size_in_total - size_out_total)
        # Durchschnittliche Rate über die tatsächlichen Gesamtgrößen (robust & konsistent
        # zur angezeigten Ersparnis).
        avg_ratio = (size_out_total / size_in_total) if size_in_total > 0 else 0.0

        # Sort history by timestamp descending
        cleaned_history.sort(key=lambda x: x["timestamp"], reverse=True)

        response = {
            "nas": nas_info,
            "stats": {
                "total_files": total_files,
                "size_in_total": size_in_total,
                "size_out_total": size_out_total,
                "saved_bytes": saved_bytes,
                "average_ratio": round(avg_ratio, 4),
                "ratio_percent": round((1 - avg_ratio) * 100, 2) if avg_ratio <= 1 else 0.0
            },
            "history": cleaned_history[:50]
        }
        return jsonify(response)
    except Exception as e:
        return jsonify({"error": f"Error generating stats: {e}"}), 500



@system_api.route('/logs', methods=['GET', 'POST'])
def handle_api_logs():
    def generate():
        yield "data: Konsole verbunden. Log-Streaming aktiv...\n\n"
        while True:
            try:
                line = log_queue.get(timeout=2.0)
                yield f"data: {line.strip()}\n\n"
            except queue.Empty:
                yield ": keep-alive\n\n"

    return Response(generate(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    })


@system_api.route('/conversion/recommendations', methods=['GET'])
def api_conversion_recommendations():
    import gui.core.media as media
    return jsonify(media.get_conversion_recommendations())

@system_api.route('/profiles', methods=['GET', 'POST'])
def api_profiles():
    import os
    import json
    from flask import request, jsonify
    from gui.core.utils import load_settings
    from gui.core.persistence import get_data_dir_path

    settings = load_settings()
    default_profiles_dir = os.path.join(get_data_dir_path(), 'profiles')
    profiles_dir = settings.get("profiles_path", default_profiles_dir)

    # If the configured path doesn't exist, we fallback to default to avoid errors
    if not os.path.exists(profiles_dir):
        try:
            os.makedirs(profiles_dir, exist_ok=True)
        except OSError as e:
            log_message(f"⚠️ Profilordner '{profiles_dir}' nicht erstellbar ({e}), nutze Standardpfad '{default_profiles_dir}'.")
            profiles_dir = default_profiles_dir
            os.makedirs(profiles_dir, exist_ok=True)


    if request.method == 'GET':
        profiles = []
        for f in os.listdir(profiles_dir):
            if f.endswith('.json'):
                try:
                    with open(os.path.join(profiles_dir, f), 'r') as file:
                        data = json.load(file)
                        profiles.append({"filename": f, "data": data})
                except Exception as e:
                    log_message(f"⚠️ Profil-Datei konnte nicht geladen werden: {f} ({e})")
        return jsonify({"profiles": profiles})

    elif request.method == 'POST':
        action = request.json.get("action")
        filename = request.json.get("filename")
        if not filename or not filename.endswith('.json'):
            return jsonify({"status": "error", "message": "Ungültiger Dateiname."}), 400

        filepath = os.path.join(profiles_dir, filename)

        if action == "delete":
            if os.path.exists(filepath):
                os.remove(filepath)
            return jsonify({"status": "success"})

        elif action == "save":
            data = request.json.get("data")
            if not data:
                return jsonify({"status": "error", "message": "Keine Daten übergeben."}), 400
            with open(filepath, 'w') as file:
                json.dump(data, file, indent=2)
            return jsonify({"status": "success"})

        return jsonify({"status": "error", "message": "Unbekannte Aktion."}), 400

@system_api.route('/auth/login', methods=['POST'])
def handle_api_auth_login():
    from flask import request, jsonify, session, make_response
    import secrets
    import hashlib
    import time
    from gui.core.persistence import check_password, load_settings

    # Get client IP strictly from remote_addr to prevent spoofing
    client_ip = request.remote_addr or '127.0.0.1'
    now = time.time()

    # Check rate limit lockout (5 failed attempts in last 60s)
    with failed_attempts_lock:
        if client_ip in failed_attempts:
            attempts, lockout_time = failed_attempts[client_ip]
            if attempts >= 5 and now - lockout_time < 60:
                return jsonify({"status": "error", "message": "Zu viele Fehlversuche. Bitte warte eine Minute."}), 429

    try:
        params = request.get_json() or {}
    except Exception:
        params = {}

    password = params.get("password", "")

    if check_password(password):
        # Reset counter on successful login
        with failed_attempts_lock:
            failed_attempts.pop(client_ip, None)

        session['authenticated'] = True

        # Generate auth_version based on password hash to support session invalidation on rotation
        settings = load_settings()
        pw_hash = settings.get("password_hash", "")
        session['auth_version'] = hashlib.sha256(pw_hash.encode('utf-8')).hexdigest()

        # Generate CSRF token
        csrf_token = secrets.token_hex(32)
        session['csrf_hash'] = hashlib.sha256(csrf_token.encode('utf-8')).hexdigest()

        resp = make_response(jsonify({"status": "success"}))
        resp.set_cookie('mw_csrf_token', csrf_token, samesite='Lax', secure=False)
        return resp
    else:
        with failed_attempts_lock:
            attempts, lockout_time = failed_attempts.get(client_ip, (0, 0))
            attempts += 1
            lockout_time = now if attempts >= 5 else 0
            failed_attempts[client_ip] = (attempts, lockout_time)

        # Progressive delay capped strictly at 2.0s
        delay = min(2.0, 0.5 * (2 ** (attempts - 1)))
        time.sleep(delay)

        return jsonify({"status": "error", "message": "Ungültiges Passwort."}), 401

@system_api.route('/auth/logout', methods=['POST'])
def handle_api_auth_logout():
    from flask import session, make_response, jsonify
    session.clear()
    resp = make_response(jsonify({"status": "success"}))
    resp.delete_cookie('mw_csrf_token')
    return resp

@system_api.route('/auth/status', methods=['GET'])
def handle_api_auth_status():
    from flask import jsonify, session
    from gui.core.persistence import load_settings
    import hashlib
    settings = load_settings()
    password_hash = settings.get("password_hash", "")
    has_password = bool(password_hash)

    authenticated = False
    if not has_password:
        authenticated = True
    else:
        if session.get('authenticated', False):
            current_version = hashlib.sha256(password_hash.encode('utf-8')).hexdigest()
            if session.get('auth_version') == current_version:
                authenticated = True
            else:
                session.clear()

    return jsonify({
        "auth_required": has_password,
        "authenticated": authenticated
    })

@system_api.route('/settings/password', methods=['POST'])
def handle_api_settings_password():
    from flask import request, jsonify
    from gui.core.persistence import load_settings, set_password, clear_password, check_password

    settings = load_settings()
    has_password = bool(settings.get("password_hash", ""))

    try:
        params = request.get_json() or {}
    except Exception:
        params = {}

    current_password = params.get("current_password", "")
    new_password = params.get("new_password", "")

    # If password configured, old confirmation required
    if has_password:
        if not check_password(current_password):
            return jsonify({"status": "error", "message": "Aktuelles Passwort ist ungültig."}), 403

    if new_password:
        set_password(new_password)
        # Update current session auth_version so the current user remains logged in
        from flask import session
        import hashlib
        settings = load_settings()
        pw_hash = settings.get("password_hash", "")
        session['auth_version'] = hashlib.sha256(pw_hash.encode('utf-8')).hexdigest()
        return jsonify({"status": "success", "message": "Passwort erfolgreich aktualisiert."})
    else:
        clear_password()
        from flask import session
        session.pop('auth_version', None)
        return jsonify({"status": "success", "message": "Passwort erfolgreich entfernt."})

@system_api.route('/system/trash/stats', methods=['GET'])
def handle_api_trash_stats():
    from flask import request
    from gui.core.trash import get_trash_stats, TrashError
    force = request.args.get("force_refresh", "false").lower() == "true"
    try:
        stats = get_trash_stats(force_refresh=force)
        return jsonify(stats)
    except TrashError as e:
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        return jsonify({"error": f"Unerwarteter Fehler beim Abrufen der Quarantäne-Statistik: {e}"}), 500

@system_api.route('/system/trash/cleanup-status', methods=['GET'])
def handle_api_trash_cleanup_status():
    from gui.core.trash import TRASH_CLEANUP_STATUS
    return jsonify(TRASH_CLEANUP_STATUS)

@system_api.route('/system/trash/cleanup', methods=['POST'])
def handle_api_trash_cleanup():
    from flask import request
    from gui.core.trash import empty_trash_async, TRASH_CLEANUP_STATUS, TrashError

    # Concurrency check
    if TRASH_CLEANUP_STATUS["running"]:
        return jsonify({"status": "already_running", "message": "Ein Bereinigungslauf ist bereits aktiv."}), 409

    try:
        params = request.get_json() or {}
    except Exception:
        params = {}

    dry_run = params.get("dry_run", False)
    retention = params.get("retention_days")
    if retention is not None:
        try:
            retention = int(retention)
        except ValueError:
            return jsonify({"error": "retention_days muss ein Integer sein"}), 400

    try:
        result = empty_trash_async(retention_days=retention, dry_run=dry_run)
        return jsonify(result)
    except TrashError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Fehler bei der Bereinigung: {e}"}), 500
