"""Iter60: public competition flags (entry_open/draw_ready/draw_opens_at), chamber dashboard APIs,
officer/permit lock after first entry (assign + merchant PUT), UGC auto-finalize one-shot, live-summary ends_at."""
import os
from datetime import datetime, timezone, timedelta
import pytest, requests
from bson import ObjectId
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
load_dotenv('/app/frontend/.env')
BASE = (os.environ.get('EXPO_BACKEND_URL') or os.environ.get('EXPO_PUBLIC_BACKEND_URL')).rstrip('/') + '/api'
db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
NOW = datetime.now(timezone.utc)
PAST = (NOW - timedelta(hours=1)).isoformat()
PAST2 = (NOW - timedelta(days=3)).isoformat()
FUTURE = (NOW + timedelta(days=5)).isoformat()
FUTURE2 = (NOW + timedelta(days=7)).isoformat()
BIG = '6ae9a4a5b4ef244d1d1c4c5e'
CREATED = []


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


def mk(auth, **kw):
    doc = {'title': 'TEST_ITER60', 'prize': 'TEST', 'prize_count': 1, 'competition_type': 'general', 'status': 'open',
           'chamber_supervised': True, 'assigned_chamber_employee_id': auth['chamber'][1], 'permit_number': 'P-1',
           'created_by_merchant': auth['merch'][1], 'start_date': PAST2, 'end_date': FUTURE, 'draw_date': '',
           'winners': [], 'created_at': NOW.isoformat()}
    doc.update(kw)
    cid = str(db.competitions.insert_one(doc).inserted_id)
    CREATED.append(cid)
    return cid


def entry(cid, uid='tu1'):
    db.competition_entries.insert_one({'competition_id': cid, 'user_id': uid, 'user_name': 'X', 'user_phone': '0500000999',
                                       'created_at': NOW.isoformat()})


def get(cid):
    return requests.get(f'{BASE}/competitions/{cid}').json()


# ─── public flags ───
class TestPublicFlags:
    def test_open_comp(self, auth):
        j = get(mk(auth))
        assert j['entry_open'] is True and j['draw_ready'] is False and datetime.fromisoformat(j['draw_opens_at']) == datetime.fromisoformat(FUTURE)

    def test_after_end(self, auth):
        j = get(mk(auth, end_date=PAST))
        assert j['entry_open'] is False and j['draw_ready'] is True

    def test_after_end_before_draw_date(self, auth):
        j = get(mk(auth, end_date=PAST, draw_date=FUTURE))
        assert j['entry_open'] is False and j['draw_ready'] is False and datetime.fromisoformat(j['draw_opens_at']) == datetime.fromisoformat(FUTURE)

    def test_closed_status(self, auth):
        assert get(mk(auth, status='closed'))['entry_open'] is False

    def test_open_draw_session(self, auth):
        assert get(mk(auth, open_draw_session='abc'))['entry_open'] is False

    def test_finalized(self, auth):
        j = get(mk(auth, end_date=PAST, winners_finalized_at=NOW.isoformat()))
        assert j['entry_open'] is False and j['draw_ready'] is False

    def test_correct_answer_hidden(self, auth):
        assert 'correct_answer' not in get(mk(auth, competition_type='qa', correct_answer='A', options=['A', 'B'], question='q'))


# ─── chamber dashboard ───
class TestChamber:
    def test_list_only_assigned_with_flags(self, auth):
        mine = mk(auth, end_date=PAST)
        entry(mine)
        other = mk(auth, assigned_chamber_employee_id='000000000000000000000000')
        r = requests.get(f'{BASE}/chamber/competitions', headers=auth['chamber'][0])
        assert r.status_code == 200
        ids = {c['id']: c for c in r.json()}
        assert mine in ids and other not in ids
        assert all(c['assigned_chamber_employee_id'] == auth['chamber'][1] for c in r.json())
        c = ids[mine]
        assert c['entry_open'] is False and c['draw_ready'] is True and c['draws'] == 0 and c['total_participants'] == 1

    def test_list_forbidden_for_customer(self, auth):
        assert requests.get(f'{BASE}/chamber/competitions', headers=auth['cust'][0]).status_code == 403

    def test_full_15k_capped(self, auth):
        r = requests.get(f'{BASE}/chamber/competitions/{BIG}/full', headers=auth['chamber'][0], timeout=60)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j['participants_count'] == 15000 and len(j['participants']) == 200
        assert all('_id' not in p for p in j['participants'])
        assert {'entry_open', 'draw_ready', 'draw_opens_at', 'draws'} <= set(j)

    def test_full_not_assigned_404(self, auth):
        other = mk(auth, assigned_chamber_employee_id='000000000000000000000000')
        assert requests.get(f'{BASE}/chamber/competitions/{other}/full', headers=auth['chamber'][0]).status_code == 404


# ─── officer / permit lock ───
class TestAssignLock:
    def test_change_officer_after_entry_needs_reason(self, auth):
        cid = mk(auth)
        entry(cid)
        H = auth['merch'][0]
        assert requests.post(f'{BASE}/draws/{cid}/assign', headers=H, json={'officer_id': auth['chamber'][1], 'permit_number': 'P-2'}).status_code == 422
        assert requests.post(f'{BASE}/draws/{cid}/assign', headers=H, json={'officer_id': '', 'reason': 'remove it now'}).status_code == 409
        r = requests.post(f'{BASE}/draws/{cid}/assign', headers=H, json={'officer_id': auth['chamber'][1], 'permit_number': 'P-2', 'reason': 'typo in permit'})
        assert r.status_code == 200, r.text
        c = db.competitions.find_one({'_id': ObjectId(cid)})
        assert c['assigned_chamber_employee_id'] == auth['chamber'][1] and c['permit_number'] == 'P-2'
        assert c['officer_log'][-1]['action'] == 'permit_change' and c['officer_log'][-1]['reason'] == 'typo in permit'

    def test_same_officer_ok(self, auth):
        cid = mk(auth)
        entry(cid)
        r = requests.post(f'{BASE}/draws/{cid}/assign', headers=auth['merch'][0], json={'officer_id': auth['chamber'][1], 'permit_number': 'P-1'})
        assert r.status_code == 200, r.text

    def test_assign_when_empty_ok(self, auth):
        cid = mk(auth, chamber_supervised=False, assigned_chamber_employee_id='', permit_number='')
        entry(cid)
        r = requests.post(f'{BASE}/draws/{cid}/assign', headers=auth['merch'][0], json={'officer_id': auth['chamber'][1], 'permit_number': 'NEW-9'})
        assert r.status_code == 200, r.text
        c = db.competitions.find_one({'_id': ObjectId(cid)})
        assert c['assigned_chamber_employee_id'] == auth['chamber'][1] and c['permit_number'] == 'NEW-9' and c['chamber_supervised'] is True

    def test_change_before_entries_ok(self, auth):
        cid = mk(auth)
        r = requests.post(f'{BASE}/draws/{cid}/assign', headers=auth['merch'][0], json={'officer_id': '', 'permit_number': ''})
        assert r.status_code == 200, r.text


class TestMerchantPutLock:
    def body(self, auth, **kw):
        b = {'title': 'TEST_ITER60', 'prize': 'TEST', 'prize_count': 1, 'competition_type': 'general', 'start_date': PAST2,
             'end_date': FUTURE, 'draw_date': '', 'chamber_supervised': True, 'permit_number': 'P-1',
             'assigned_chamber_employee_id': auth['chamber'][1]}
        b.update(kw)
        return b

    DEF = dict(purchase_mode='single', tickets_mode='one', max_tickets_per_user=1, spend_requirement=0, options=[], question='',
               correct_answer='', required_product_id='')

    def test_legacy_comp_edit_not_blocked(self, auth):
        # seeded/legacy docs lack tickets_mode etc. → pydantic defaults must not count as a 'change'
        cid = mk(auth)
        entry(cid)
        r = requests.put(f'{BASE}/merchant/competitions/{cid}', headers=auth['merch'][0], json=self.body(auth, description='legacy edit'))
        assert r.status_code == 200, r.text

    def test_put_locked_after_entry(self, auth):
        cid = mk(auth, **self.DEF)
        entry(cid)
        H = auth['merch'][0]
        assert requests.put(f'{BASE}/merchant/competitions/{cid}', headers=H, json=self.body(auth, permit_number='P-2')).status_code == 409
        assert requests.put(f'{BASE}/merchant/competitions/{cid}', headers=H, json=self.body(auth, assigned_chamber_employee_id='')).status_code == 409
        r = requests.put(f'{BASE}/merchant/competitions/{cid}', headers=H, json=self.body(auth, description='edit ok'))
        assert r.status_code == 200, r.text

    def test_put_set_once_when_empty(self, auth):
        cid = mk(auth, chamber_supervised=False, assigned_chamber_employee_id='', permit_number='', **self.DEF)
        entry(cid)
        r = requests.put(f'{BASE}/merchant/competitions/{cid}', headers=auth['merch'][0], json=self.body(auth))
        assert r.status_code == 200, r.text
        assert db.competitions.find_one({'_id': ObjectId(cid)})['permit_number'] == 'P-1'


# ─── UGC auto-finalize one-shot ───
class TestUgcFinalize:
    def test_finalize_sets_timestamp_and_second_409(self, auth):
        cid = mk(auth, competition_type='ugc_video', end_date=PAST)
        db.competition_videos.insert_one({'competition_id': cid, 'user_id': 'tu1', 'user_name': 'V', 'likes': 5})
        H = auth['chamber'][0]
        r = requests.post(f'{BASE}/competitions/{cid}/auto-finalize', headers=H)
        assert r.status_code == 200, r.text
        assert r.json()['winners'][0]['user_id'] == 'tu1'
        assert db.competitions.find_one({'_id': ObjectId(cid)}).get('winners_finalized_at')
        assert requests.post(f'{BASE}/competitions/{cid}/auto-finalize', headers=H).status_code == 409


# ─── live summary ───
class TestLiveSummary:
    def test_ends_at_from_end_date(self, auth):
        cid = mk(auth, end_date=FUTURE2)
        j = requests.get(f'{BASE}/competitions/live-summary').json()
        c = next(x for x in j['competitions'] if x['id'] == cid)
        assert c['ends_at'] == FUTURE2 and c['remaining_ms'] > 0 and c['status'] == 'open'
