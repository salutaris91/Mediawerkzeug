import os
import unittest
import json
import tempfile
from unittest.mock import patch
from flask import Flask

# Import the blueprints
from gui.api.system_api import system_api
from gui.api.onboarding_api import onboarding_api
from gui.core.persistence import load_env_keys, save_env_keys, is_masked, mask_credential

class TestEnvHandling(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.TemporaryDirectory()
        self.env_path = os.path.join(self.test_dir.name, ".env")
        self.settings_path = os.path.join(self.test_dir.name, "settings.json")
        os.environ["MW_ENV_FILE"] = self.env_path
        os.environ["MW_SETTINGS_FILE"] = self.settings_path

        os.environ.pop("TMDB_API_KEY", None)
        os.environ.pop("TVDB_API_KEY", None)

        self.app = Flask(__name__)
        self.app.secret_key = "test_secret_key"
        self.app.register_blueprint(system_api, url_prefix='/api')
        self.app.register_blueprint(onboarding_api, url_prefix='/api')
        self.client = self.app.test_client()

    def tearDown(self):
        self.test_dir.cleanup()
        os.environ.pop("MW_ENV_FILE", None)
        os.environ.pop("MW_SETTINGS_FILE", None)
        os.environ.pop("TMDB_API_KEY", None)
        os.environ.pop("TVDB_API_KEY", None)
        from gui.core.persistence import _cached_settings
        import gui.core.persistence as p
        p._cached_settings = None

    def test_env_parsing_and_saving(self):
        save_env_keys({"TMDB_API_KEY": "test1234", "FOO": "bar"})
        keys = load_env_keys()
        self.assertEqual(keys.get("TMDB_API_KEY"), "test1234")
        self.assertEqual(os.environ.get("TMDB_API_KEY"), "test1234")

        save_env_keys({"TMDB_API_KEY": ""})
        self.assertNotIn("TMDB_API_KEY", load_env_keys())
        self.assertNotIn("TMDB_API_KEY", os.environ)

        # Test manual deletion from .env
        save_env_keys({"TMDB_API_KEY": "manual123"})
        import gui.mw_metadata as mw
        mw.reload_metadata_keys()
        self.assertEqual(os.environ.get("TMDB_API_KEY"), "manual123")
        # Manually overwrite the file to delete the key
        with open(self.env_path, "w") as f:
            f.write("OTHER_KEY=123\n")
        mw.reload_metadata_keys()
        self.assertNotIn("TMDB_API_KEY", os.environ)

        save_env_keys({"TVDB_API_KEY": "new_tvdb"})
        import gui.mw_metadata as mw
        mw.reload_metadata_keys()
        self.assertEqual(mw.TVDB_API_KEY, "new_tvdb")
        self.assertIsNone(mw.tvdb_token)
        self.assertEqual(mw.tvdb_token_time, 0)

    def test_legacy_endpoint_removed(self):
        # /post-settings-legacy should return 404
        response = self.client.post('/api/post-settings-legacy', json={"some": "data"})
        self.assertEqual(response.status_code, 404)

    def test_env_example_generation(self):
        # Write an existing .env.example with just one key and an extra one
        example_path = os.path.join(self.test_dir.name, ".env.example")
        with open(example_path, "w") as f:
            f.write('TMDB_API_KEY="old_val"\n')
            f.write('OTHER_KEY="val"\n')

        # Temporarily mock APP_ROOT in persistence to use test dir
        import gui.core.persistence as p
        orig_app_root = p.APP_ROOT
        try:
            p.APP_ROOT = self.test_dir.name

            # Re-write the mock example to the new mocked location (Root)
            example_path = os.path.join(self.test_dir.name, ".env.example")
            with open(example_path, "w") as f:
                f.write('TMDB_API_KEY="old_val"\n')
                f.write('OTHER_KEY="val"\n')

            p.ensure_env_example()

            with open(example_path, "r") as f:
                content = f.read()

            self.assertIn('TMDB_API_KEY="old_val"', content)
            self.assertIn('OTHER_KEY="val"', content)
            self.assertIn('TVDB_API_KEY=""', content) # TVDB was missing and should be added
        finally:
            p.APP_ROOT = orig_app_root

    def test_masking_mechanisms(self):
        self.assertEqual(mask_credential("1234567890"), "****7890")
        self.assertTrue(is_masked("****7890"))
        self.assertFalse(is_masked("12345678"))
        self.assertEqual(mask_credential(""), "")
        self.assertFalse(is_masked(""))

    def test_api_protection(self):
        # 1. Post real keys (AC10, AC14)
        response = self.client.post('/api/settings', json={
            "tmdb_api_key": "my_real_tmdb_key",
            "telegram_token": "my_real_tg_token",
            "telegram_chat_id": "my_real_tg_chat_id",
            "whatsapp_apikey": "my_real_wa_key",
            "whatsapp_phone": "my_real_wa_phone",
            "dummy_setting": False
        })
        self.assertEqual(response.status_code, 200)
        res_data = response.json
        self.assertEqual(res_data.get("status"), "success")
        self.assertIn("fields", res_data)
        self.assertEqual(res_data["fields"].get("tmdb_api_key", {}).get("status"), "saved")
        self.assertEqual(res_data["fields"].get("telegram_token", {}).get("status"), "saved")

        # Verify it's loaded in env
        self.assertEqual(os.environ.get("TMDB_API_KEY"), "my_real_tmdb_key")

        # 2. Get settings, they should be masked without plaintext leak (AC13)
        response = self.client.get('/api/settings')
        self.assertEqual(response.status_code, 200)
        data = response.json
        self.assertTrue(data["tmdb_api_key"].startswith("****"))
        self.assertTrue(data["telegram_token"].startswith("****"))
        self.assertTrue(data["telegram_chat_id"].startswith("****"))
        self.assertTrue(data["whatsapp_apikey"].startswith("****"))
        self.assertTrue(data["whatsapp_phone"].startswith("****"))
        self.assertNotIn("my_real_tmdb_key", str(data))
        self.assertNotIn("my_real_tg_token", str(data))

        # 3. Post back masked keys to /api/settings must return HTTP 400 (AC8)
        response = self.client.post('/api/settings', json={
            "telegram_token": data["telegram_token"]
        })
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json.get("field"), "telegram_token")
        self.assertIn("Maskierter Wert", response.json.get("error", ""))

        response = self.client.post('/api/settings', json={
            "tmdb_api_key": data["tmdb_api_key"]
        })
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json.get("field"), "tmdb_api_key")

        # 4. Post masked key to /api/keys must return HTTP 400 (AC9)
        response = self.client.post('/api/keys', json={
            "TMDB_API_KEY": "****1234"
        })
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json.get("field"), "TMDB_API_KEY")
        self.assertIn("Maskierter Wert", response.json.get("error", ""))

        # 5. Whitespace-only input must return HTTP 400 and not overwrite (AC12)
        response = self.client.post('/api/settings', json={
            "telegram_token": "   "
        })
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json.get("field"), "telegram_token")
        self.assertIn("Leerzeichen", response.json.get("error", ""))

        response = self.client.post('/api/keys', json={
            "TMDB_API_KEY": "   "
        })
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json.get("field"), "TMDB_API_KEY")

        # 6. Unchanged fields omitted from POST leave existing keys intact (AC11)
        response = self.client.post('/api/settings', json={
            "dummy_setting": True
        })
        self.assertEqual(response.status_code, 200)

        self.assertEqual(os.environ.get("TMDB_API_KEY"), "my_real_tmdb_key")
        from gui.core.persistence import load_settings
        settings = load_settings()
        self.assertEqual(settings["telegram_token"], "my_real_tg_token")
        self.assertEqual(settings["telegram_chat_id"], "my_real_tg_chat_id")
        self.assertEqual(settings["whatsapp_apikey"], "my_real_wa_key")
        self.assertEqual(settings["whatsapp_phone"], "my_real_wa_phone")
        self.assertEqual(settings["dummy_setting"], True)

        # 7. GET /api/keys does not leak plaintext (AC13)
        response = self.client.get('/api/keys')
        self.assertEqual(response.status_code, 200)
        keys_data = response.json
        self.assertTrue(keys_data.get("TMDB_API_KEY", "").startswith("****"))
        self.assertNotIn("my_real_tmdb_key", str(keys_data))

        # 8. Legitimate new keys are stored and reported (AC10, AC14)
        response = self.client.post('/api/keys', json={
            "TMDB_API_KEY": "  brand_new_tmdb_key  "
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json.get("fields", {}).get("TMDB_API_KEY", {}).get("status"), "saved")
        self.assertEqual(os.environ.get("TMDB_API_KEY"), "brand_new_tmdb_key")

    def test_metadata_reload(self):
        import gui.mw_metadata as mw
        # Initial is empty
        mw.reload_metadata_keys()
        self.assertEqual(mw.TMDB_API_KEY, "")

        # Save a key
        save_env_keys({"TMDB_API_KEY": "reloaded_key"})
        mw.reload_metadata_keys()
        self.assertEqual(mw.TMDB_API_KEY, "reloaded_key")

if __name__ == "__main__":
    unittest.main()
