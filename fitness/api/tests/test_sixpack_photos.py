import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
from firebase_admin import auth
from fitness.api.routers import sixpack_photos as photos


class PhotoTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        env = patch.dict(os.environ, {'FITNESS_SIXPACK_PHOTOS_DIR': self.temp.name})
        env.start(); self.addCleanup(env.stop)
        def verify(token):
            if token not in ['alice-token', 'bob-token']:
                raise auth.InvalidIdTokenError('bad token')
            return {'uid': token.split('-')[0]}
        verifier = patch.object(photos, 'verify_photo_token', side_effect=verify)
        verifier.start(); self.addCleanup(verifier.stop)
        app = FastAPI()
        app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])
        app.include_router(photos.router)
        self.client = TestClient(app)
        self.headers = {'Authorization': 'Bearer alice-token', 'Content-Type': 'image/png'}
        self.params = {'filename': 'photo.png', 'id': '12345678-1234-1234-1234-123456789abc', 'date': '2026-10-13T12:00:00.000Z'}

    def upload(self):
        return self.client.post('/sixpack/photos', params=self.params, headers=self.headers, content=b'image bytes')

    def test_auth_and_isolation(self):
        self.assertEqual(self.client.get('/sixpack/photos').status_code, 401)
        self.assertEqual(self.client.post('/sixpack/photos', content=b'image').status_code, 401)
        self.assertEqual(self.client.get('/sixpack/photos', headers={'Authorization': 'Bearer forged'}).status_code, 401)
        self.assertEqual(self.client.get('/sixpack/photos?uid=bob', headers=self.headers).status_code, 403)
        self.assertEqual(self.client.get('/sixpack/photos', headers={**self.headers, 'x-fitness-uid': 'bob'}).status_code, 403)
        saved = self.upload()
        self.assertEqual(saved.status_code, 200, saved.text)
        name = saved.json()['filename']
        url = f'/sixpack-photos/alice/{name}'
        self.assertEqual(self.client.get(url).status_code, 401)
        self.assertEqual(self.client.get(url, headers={'Authorization': 'Bearer bob-token'}).status_code, 403)
        image = self.client.get(url, headers=self.headers)
        self.assertEqual(image.content, b'image bytes')
        self.assertIn('no-store', image.headers['cache-control'])
        self.assertEqual(self.client.get('/sixpack/photos', headers={'Authorization': 'Bearer bob-token'}).json()['photos'], [])
        self.upload()
        listed = self.client.get('/sixpack/photos', headers=self.headers).json()
        self.assertEqual(listed['uid'], 'alice')
        self.assertEqual(len(listed['photos']), 1)
        self.assertEqual(listed['photos'][0]['date'], self.params['date'])

    def test_api_aliases(self):
        saved = self.upload().json()
        listed = self.client.get('/api/sixpack/photos', headers=self.headers)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()['photos']), 1)
        path = f"/api/sixpack-photos/alice/{saved['filename']}"
        self.assertEqual(self.client.get(path).status_code, 401)
        self.assertEqual(self.client.get(path, headers={'Authorization': 'Bearer bob-token'}).status_code, 403)
        self.assertEqual(self.client.get(path, headers=self.headers).content, b'image bytes')

    def test_validation_and_cleanup(self):
        with patch.object(photos, 'MAX_SIZE', 5):
            self.assertEqual(self.upload().status_code, 413)
        self.assertEqual(list(Path(self.temp.name).rglob('*.tmp')), [])
        self.assertEqual(list(Path(self.temp.name).rglob('*.png')), [])
        self.params['filename'] = 'photo.html'
        self.assertEqual(self.upload().status_code, 415)
        self.params['filename'] = 'photo.png'
        self.params['id'] = '../escape'
        self.assertEqual(self.upload().status_code, 400)

    def test_auth_unavailable_and_preflight(self):
        with patch.object(photos, 'verify_photo_token', side_effect=RuntimeError('credentials unavailable')):
            self.assertEqual(self.client.get('/sixpack/photos', headers=self.headers).status_code, 503)
        response = self.client.options('/sixpack/photos', headers={
            'Origin': 'https://vos-6pack.web.app', 'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization,content-type',
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn('authorization', response.headers['access-control-allow-headers'])


class NoUidBypassTests(unittest.TestCase):
    def test_header_is_never_authentication(self):
        app = FastAPI()
        app.include_router(photos.router)
        client = TestClient(app)
        with patch.dict(os.environ, {'FITNESS_SIXPACK_DEV_UID_AUTH': '1'}):
            for route in ('/api/sixpack/photos', '/sixpack/photos'):
                self.assertEqual(client.get(route, headers={'x-fitness-uid': 'alice'}).status_code, 401)

if __name__ == '__main__':
    unittest.main()
