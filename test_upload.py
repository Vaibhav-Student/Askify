import os
import io
import time
import json
import unittest
import hashlib
from unittest.mock import patch
from app_api import app, UPLOAD_SESSIONS, CHUNK_DIR, GLOBAL_STATE, RATE_LIMIT_STORE

class TestUploadAPI(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()
        # Reset state between tests
        UPLOAD_SESSIONS.clear()
        RATE_LIMIT_STORE.clear()
        GLOBAL_STATE["documents"] = []
        GLOBAL_STATE["vector_store"] = None
        if os.path.exists(CHUNK_DIR):
            for entry in os.listdir(CHUNK_DIR):
                path = os.path.join(CHUNK_DIR, entry)
                if os.path.isdir(path):
                    import shutil
                    shutil.rmtree(path)
        
        # Start patch for heavy rebuild_vector_store
        self.patcher = patch("app_api.rebuild_vector_store")
        self.mock_rebuild = self.patcher.start()

    def tearDown(self):
        self.patcher.stop()

    def test_init_upload(self):
        response = self.client.post("/api/upload/init", json={
            "filename": "test.txt",
            "total_size": 100,
            "total_chunks": 1,
            "content_type": "text/plain"
        })
        
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIn("upload_id", data)
        self.assertEqual(data["filename"], "test.txt")
        self.assertIn(data["upload_id"], UPLOAD_SESSIONS)

    def test_upload_chunk_valid(self):
        # Setup session
        init_res = self.client.post("/api/upload/init", json={
            "filename": "test.txt",
            "total_size": 13,
            "total_chunks": 1
        })
        upload_id = init_res.get_json()["upload_id"]
        
        # Upload chunk
        chunk_data = b"Hello, World!"
        chunk_hash = hashlib.sha256(chunk_data).hexdigest()
        
        data = {
            "upload_id": upload_id,
            "chunk_index": "0",
            "chunk_hash": chunk_hash,
            "chunk": (io.BytesIO(chunk_data), "chunk_0")
        }
        
        response = self.client.post("/api/upload/chunk", data=data, content_type='multipart/form-data')
        self.assertEqual(response.status_code, 200)
        res_data = response.get_json()
        self.assertTrue(res_data["verified"])
        self.assertEqual(res_data["received"], 0)

    def test_upload_chunk_invalid_hash(self):
        # Setup session
        init_res = self.client.post("/api/upload/init", json={
            "filename": "test.txt",
            "total_size": 13,
            "total_chunks": 1
        })
        upload_id = init_res.get_json()["upload_id"]
        
        chunk_data = b"Hello, World!"
        bad_hash = "1234567890abcdef"
        
        data = {
            "upload_id": upload_id,
            "chunk_index": "0",
            "chunk_hash": bad_hash,
            "chunk": (io.BytesIO(chunk_data), "chunk_0")
        }
        
        response = self.client.post("/api/upload/chunk", data=data, content_type='multipart/form-data')
        self.assertEqual(response.status_code, 400)
        self.assertIn("integrity check failed", response.get_json()["error"])

    def test_finalize_upload(self):
        # Setup
        init_res = self.client.post("/api/upload/init", json={
            "filename": "test.txt",
            "total_size": 13,
            "total_chunks": 1
        })
        upload_id = init_res.get_json()["upload_id"]
        
        chunk_data = b"Hello, World!"
        data = {
            "upload_id": upload_id,
            "chunk_index": "0",
            "chunk_hash": hashlib.sha256(chunk_data).hexdigest(),
            "chunk": (io.BytesIO(chunk_data), "chunk_0")
        }
        self.client.post("/api/upload/chunk", data=data, content_type='multipart/form-data')
        
        # Finalize
        response = self.client.post("/api/upload/finalize", json={"upload_id": upload_id})
        self.assertEqual(response.status_code, 200)
        res_data = response.get_json()
        self.assertIn("Successfully processed", res_data["message"])
        
        # Check GLOBAL_STATE
        self.assertEqual(len(GLOBAL_STATE["documents"]), 1)
        self.assertEqual(GLOBAL_STATE["documents"][0]["name"], "test.txt")
        self.assertEqual(GLOBAL_STATE["documents"][0]["text"], "Hello, World!")

    def test_cancel_upload(self):
        init_res = self.client.post("/api/upload/init", json={
            "filename": "test.txt",
            "total_size": 13,
            "total_chunks": 1
        })
        upload_id = init_res.get_json()["upload_id"]
        
        response = self.client.delete(f"/api/upload/{upload_id}")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(upload_id, UPLOAD_SESSIONS)
        
        # Verify directory is gone
        session_dir = os.path.join(CHUNK_DIR, upload_id)
        self.assertFalse(os.path.exists(session_dir))

    def test_file_type_validation(self):
        response = self.client.post("/api/upload/init", json={
            "filename": "virus.exe",
            "total_size": 100,
            "total_chunks": 1
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("File type not allowed", response.get_json()["error"])

    def test_rate_limit(self):
        # This might fail if the host machine is too slow, but it's a good sanity check
        from app_api import RATE_LIMIT_MAX
        
        # We exceed the limit
        for _ in range(RATE_LIMIT_MAX + 1):
            res = self.client.post("/api/upload/chunk", data={})
        
        # The last one should be 429
        self.assertEqual(res.status_code, 429)
        self.assertIn("Rate limit exceeded", res.get_json()["error"])

if __name__ == '__main__':
    unittest.main()
