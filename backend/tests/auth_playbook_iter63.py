"""Iter63 auth playbook checks: bcrypt format, login cookies, CORS credentials, brute-force lockout (on a TEST phone)."""
import requests
from test_chamber_flags_iter60 import BASE, db

u = db.users.find_one({'phone': '0550000000'})
print('bcrypt $2b$:', str(u.get('password_hash', '')).startswith('$2b$'))
r = requests.post(f'{BASE}/auth/login', json={'phone': '0550000000', 'password': 'chamber2025'})
print('login', r.status_code, 'set-cookie:', r.headers.get('set-cookie', '')[:120])
o = requests.options(f'{BASE}/auth/login', headers={'Origin': 'https://example.com', 'Access-Control-Request-Method': 'POST'})
print('CORS allow-origin:', o.headers.get('access-control-allow-origin'), 'credentials:', o.headers.get('access-control-allow-credentials'))
codes = [requests.post(f'{BASE}/auth/login', json={'phone': '0559990001', 'password': 'wrong'}).status_code for _ in range(7)]
print('brute force codes (nonexistent TEST phone):', codes)
