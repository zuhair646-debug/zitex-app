"""Iter61: legacy-comp edit after entries (guard_update normalisation), phase field, inclusive end_date
(Saudi day), draw_date same-day, create-with-past-end 422, read-only GET /competitions, login speed, UGC draw_ready."""
import os, time
from datetime import datetime, timezone, timedelta
import pytest, requests
from bson import ObjectId
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
load_dotenv('/app/frontend/.env')
BASE = (os.environ.get('EXPO_BACKEND_URL') or os.environ.get('EXPO_PUBLIC_BACKEND_URL')).rstrip('/') + '/api'
db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
KSA = timezone(timedelta(hours=3))
NOW = datetime.now(timezone.utc)
TODAY = NOW.astimezone(KSA).date()
D = lambda n: (TODAY + timedelta(days=n)).isoformat()   # Saudi calendar day offset
CREATED = []
LEGACY_SEED = '6ab6206a71b6ad54069c12bc'  # seeded open comp w/o tickets_mode/competition_type, has entries


def login(phone, pw):
    r = requests.post(f'{BASE}/auth/login', json={'phone': phone, 'password': pw}, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    return {'Authorization': f"Bearer {j['token']}"}, j['user']['id']


@pytest.fixture(scope='module')
def auth():
    return {'cust': login('0500000000', 'test1234'), 'merch': login('0509999999', 'merchant2025'),
            'chamber': login('0550000000', 'chamber2025')}


@pytest.fixture(scope='module', autouse=True)
def cleanup():
    yield
    for cid in CREATED:
        db.competitions.delete_one({'_id': ObjectId(cid)})
        for col in ('competition_entries', 'draw_sessions', 'competition_videos'):
            db[col].delete_many({'competition_id': cid})
    db.competitions.delete_many({'title': {'$regex': '^TEST_ITER61'}})


def mk(auth, legacy=False, **kw):
    doc = {'title': 'TEST_ITER61', 'prize': 'TEST', 'prize_count': 1, 'competition_type': 'general', 'status': 'open',
           'chamber_supervised': True, 'assigned_chamber_employee_id': auth['chamber'][1], 'permit_number': 'P-61',
           'created_by_merchant': auth['merch'][1], 'start_date': D(-5), 'end_date': D(5), 'draw_date': '',
           'winners': [], 'created_at': NOW.isoformat(), 'description': 'old'}
    if legacy:
        doc.pop('competition_type')
    doc.update(kw)
    cid = str(db.competitions.insert_one(doc).inserted_id)
    CREATED.append(cid)
    return cid


def entry(cid, uid='tu61'):
    db.competition_entries.insert_one({'competition_id': cid, 'user_id': uid, 'user_name': 'X',
                                       'user_phone': '0500000999', 'created_at': NOW.isoformat()})


def form_payload(cid, **kw):
    """What the merchant edit form sends: stored values + pydantic defaults for missing fields."""
    c = db.competitions.find_one({'_id': ObjectId(cid)})
    p = {k: c.get(k) for k in ('title', 'description', 'prize', 'start_date', 'end_date', 'draw_date',
                               'permit_number', 'assigned_chamber_employee_id', 'chamber_supervised') if c.get(k) is not None}
    p.update({'prize_count': int(float(c.get('prize_count') or 1)), 'competition_type': c.get('competition_type') or 'general',
              'tickets_mode': c.get('tickets_mode') or 'one', 'max_tickets_per_user': int(float(c.get('max_tickets_per_user') or 1)),
              'purchase_mode': c.get('purchase_mode') or 'single'})
    p.update(kw)
    return p


# FIX 1 — legacy comps editable after entries; real locked changes still 409
class TestLegacyEdit:
    def test_legacy_missing_fields_description_edit_ok(self, auth):
        cid = mk(auth, legacy=True); entry(cid)
        r = requests.put(f'{BASE}/merchant/competitions/{cid}', json=form_payload(cid, description='new desc'), headers=auth['merch'][0])
        assert r.status_code == 200, r.text
        assert db.competitions.find_one({'_id': ObjectId(cid)})['description'] == 'new desc'

    def test_numeric_string_fields_ok(self, auth):
        cid = mk(auth, prize_count='2', max_tickets_per_user='1'); entry(cid)
        r = requests.put(f'{BASE}/merchant/competitions/{cid}', json=form_payload(cid, description='x2'), headers=auth['merch'][0])
        assert r.status_code == 200, r.text

    @pytest.mark.parametrize('field,val', [('prize_count', 3), ('tickets_mode', 'per_order'), ('competition_type', 'purchase'),
                                           ('max_tickets_per_user', 5), ('purchase_mode', 'accumulated'), ('end_date', D(9)),
                                           ('permit_number', 'P-OTHER')])
    def test_locked_change_409(self, auth, field, val):
        cid = mk(auth, legacy=True); entry(cid)
        r = requests.put(f'{BASE}/merchant/competitions/{cid}', json=form_payload(cid, **{field: val}), headers=auth['merch'][0])
        assert r.status_code == 409, f'{field}: {r.status_code} {r.text}'
        assert field in r.json()['detail'] or (field == 'permit_number' and 'التصريح' in r.json()['detail'])

    def test_real_seeded_legacy_comp_edit(self, auth):
        orig = db.competitions.find_one({'_id': ObjectId(LEGACY_SEED)})
        if not orig or not db.competition_entries.count_documents({'competition_id': LEGACY_SEED}):
            pytest.skip('seed comp missing')
        try:
            r = requests.put(f'{BASE}/merchant/competitions/{LEGACY_SEED}', json=form_payload(LEGACY_SEED, description=(orig.get('description') or '') + ' '),
                             headers=auth['merch'][0])
            assert r.status_code == 200, r.text
        finally:
            db.competitions.replace_one({'_id': orig['_id']}, orig)


# FIX 2 — phase field everywhere; GET /competitions is read-only
class TestPhase:
    def _phases(self, auth, cid):
        p1 = requests.get(f'{BASE}/competitions/{cid}', headers=auth['cust'][0]).json()['phase']
        lst = requests.get(f'{BASE}/chamber/competitions', headers=auth['chamber'][0]).json()
        p2 = next(c for c in lst if c['id'] == cid)['phase']
        p3 = requests.get(f'{BASE}/chamber/competitions/{cid}/full', headers=auth['chamber'][0]).json()['phase']
        return p1, p2, p3

    @pytest.mark.parametrize('kw,expected', [
        ({}, 'open'),
        ({'start_date': D(2), 'end_date': D(6)}, 'soon'),
        ({'end_date': D(-1), 'draw_date': D(2)}, 'waiting'),
        ({'end_date': D(-1)}, 'ready'),
        ({'end_date': D(-1), 'draw_date': D(0)}, 'ready'),
        ({'end_date': D(-1), 'winners_finalized_at': NOW.isoformat()}, 'drawn'),
        ({'end_date': D(-1), 'status': 'ended', 'draw_date': D(3)}, 'waiting'),
    ])
    def test_phase_all_endpoints(self, auth, kw, expected):
        cid = mk(auth, **kw)
        assert self._phases(auth, cid) == (expected,) * 3

    def test_get_competitions_read_only(self, auth):
        cid = mk(auth, end_date=(NOW - timedelta(hours=2)).isoformat())
        lst = requests.get(f'{BASE}/competitions').json()
        assert cid not in [c.get('id') for c in lst]
        assert db.competitions.find_one({'_id': ObjectId(cid)})['status'] == 'open'
        assert all('phase' in c for c in lst)


# FIX 3 — inclusive Saudi end day, draw_date start of day, create validation
class TestDates:
    def test_end_today_still_open(self, auth):
        cid = mk(auth, end_date=D(0))
        c = requests.get(f'{BASE}/competitions/{cid}').json()
        assert c['entry_open'] is True and c['phase'] == 'open'
        assert datetime.fromisoformat(c['draw_opens_at']) == datetime.fromisoformat(D(1) + 'T00:00:00+03:00')
        assert c['draw_opens_at'].endswith('+03:00')
        assert cid in [x.get('id') for x in requests.get(f'{BASE}/competitions').json()]

    def test_join_on_last_day(self, auth):
        cid = mk(auth, end_date=D(0))
        r = requests.post(f'{BASE}/competitions/{cid}/join', headers=auth['cust'][0])
        assert r.status_code == 200, r.text

    def test_end_yesterday_closed(self, auth):
        cid = mk(auth, end_date=D(-1))
        c = requests.get(f'{BASE}/competitions/{cid}').json()
        assert c['entry_open'] is False and c['draw_ready'] is True
        assert requests.post(f'{BASE}/competitions/{cid}/join', headers=auth['cust'][0]).status_code == 400

    def test_draw_date_tomorrow_opens_at(self, auth):
        cid = mk(auth, end_date=D(-1), draw_date=D(1))
        c = requests.get(f'{BASE}/competitions/{cid}').json()
        assert c['draw_ready'] is False
        assert datetime.fromisoformat(c['draw_opens_at']) == datetime.fromisoformat(D(1) + 'T00:00:00+03:00')

    def _create(self, auth, **kw):
        p = {'title': 'TEST_ITER61_create', 'prize': 'x', 'competition_type': 'general', 'start_date': D(0), 'end_date': D(3)}
        p.update(kw)
        r = requests.post(f'{BASE}/merchant/competitions', json=p, headers=auth['merch'][0])
        if r.status_code == 200:
            CREATED.append(r.json()['id'])
        return r

    @pytest.mark.parametrize('kw,code', [
        ({'end_date': D(-1), 'start_date': D(-3)}, 422),
        ({'end_date': D(0)}, 200),
        ({'end_date': D(3), 'draw_date': D(3)}, 200),
        ({'end_date': D(3), 'draw_date': D(2)}, 422),
        ({'end_date': '03/11/2026'}, 422),
        ({'end_date': ''}, 422),
        ({'start_date': D(4), 'end_date': D(3)}, 422),
    ])
    def test_create_validation(self, auth, kw, code):
        r = self._create(auth, **kw)
        assert r.status_code == code, f'{kw}: {r.status_code} {r.text}'


# FIX 6 — UGC never draw_ready
class TestUgc:
    def test_ugc_after_end_not_ready(self, auth):
        cid = mk(auth, competition_type='ugc_video', end_date=D(-2))
        c = requests.get(f'{BASE}/competitions/{cid}').json()
        assert c['draw_ready'] is False
        r = requests.post(f'{BASE}/draws/{cid}/sessions', json={'kind': 'initial'}, headers=auth['chamber'][0])
        assert r.status_code in (400, 404), r.text


# FIX 4 — login fast; auth playbook basics
class TestLogin:
    def test_login_latency(self):
        times = []
        for _ in range(3):
            t = time.time(); login('0509999999', 'merchant2025'); times.append(time.time() - t)
        assert min(times) < 1.5, times

    def test_bcrypt_hash_format(self):
        u = db.users.find_one({'phone': '0550000000'})
        assert u['password_hash'].startswith('$2')

    def test_lockout_after_5(self):
        ph = '0599' + str(int(time.time()))[-6:]
        codes = [requests.post(f'{BASE}/auth/login', json={'phone': ph, 'password': 'bad'}).status_code for _ in range(6)]
        assert codes[:5] == [401] * 5 and codes[5] == 429, codes
