"""Iter63 (T1): extra coverage — reason 422, remove-supervision 409, permit-only immediate, stale pending request vs
permit edit, change after draw (winners_finalized), chamber endpoints latency (15k comp), past/current phase split."""
import time
import bcrypt
import pytest, requests
from bson import ObjectId
from test_chamber_flags_iter60 import BASE, db, login, mk, entry, CREATED, cleanup, BIG, NOW  # noqa: F401

PHONE2, PW2 = '0550009997', 'officer3pw'


@pytest.fixture(scope='module')
def auth():
    db.users.update_one({'phone': PHONE2}, {'$set': {'name': 'TEST Officer 3', 'role': 'chamber', 'phone': PHONE2,
                        'password_hash': bcrypt.hashpw(PW2.encode(), bcrypt.gensalt()).decode()}}, upsert=True)
    a = {'merch': login('0509999999', 'merchant2025'), 'chamber': login('0550000000', 'chamber2025'), 'off2': login(PHONE2, PW2)}
    yield a
    db.users.delete_one({'phone': PHONE2})


# reason rules after entries
def test_reason_required_and_short_reason(auth):
    cid = mk(auth); entry(cid)
    M = auth['merch'][0]
    r = requests.post(f'{BASE}/draws/{cid}/assign', headers=M, json={'officer_id': auth['off2'][1]})
    assert r.status_code == 422, r.text
    r = requests.post(f'{BASE}/draws/{cid}/assign', headers=M, json={'officer_id': auth['off2'][1], 'reason': 'abcd'})
    assert r.status_code == 422
    r = requests.post(f'{BASE}/draws/{cid}/assign', headers=M, json={'officer_id': auth['chamber'][1], 'permit_number': 'P-NEW'})
    assert r.status_code == 422  # permit change also needs reason


# cannot remove chamber supervision after entries
def test_remove_supervision_after_entries_409(auth):
    cid = mk(auth); entry(cid)
    r = requests.post(f'{BASE}/draws/{cid}/assign', headers=auth['merch'][0], json={'officer_id': '', 'reason': 'remove it please'})
    assert r.status_code == 409
    c = db.competitions.find_one({'_id': ObjectId(cid)})
    assert c['assigned_chamber_employee_id'] == auth['chamber'][1]


# permit-only change applies immediately + log
def test_permit_only_immediate(auth):
    cid = mk(auth); entry(cid)
    r = requests.post(f'{BASE}/draws/{cid}/assign', headers=auth['merch'][0],
                      json={'officer_id': auth['chamber'][1], 'permit_number': 'P-777', 'reason': 'typo in permit'})
    assert r.status_code == 200 and r.json().get('changed') is True and not r.json().get('pending')
    c = db.competitions.find_one({'_id': ObjectId(cid)})
    assert c['permit_number'] == 'P-777' and c['officer_log'][-1]['action'] == 'permit_change'
    full = requests.get(f'{BASE}/chamber/competitions/{cid}/full', headers=auth['chamber'][0]).json()
    assert full['permit_number'] == 'P-777' and full['officer_log'][-1]['reason'] == 'typo in permit'


# officer change after the draw (winners finalized) still needs acceptance
def test_change_after_draw_pending(auth):
    cid = mk(auth, status='completed', winners_finalized_at=NOW.isoformat(),
             winners=[{'user_id': 'tu1', 'user_name': 'X', 'won_at': NOW.isoformat()}]); entry(cid)
    r = requests.post(f'{BASE}/draws/{cid}/assign', headers=auth['merch'][0], json={'officer_id': auth['off2'][1], 'reason': 'after draw change'})
    assert r.status_code == 200 and r.json().get('pending') is True
    assert requests.post(f'{BASE}/draws/{cid}/officer-request/accept', headers=auth['off2'][0]).status_code == 200
    lst = requests.get(f'{BASE}/chamber/competitions', headers=auth['off2'][0]).json()
    me = [x for x in lst if x['id'] == cid]
    assert me and me[0]['phase'] == 'drawn'


# edge: pending request (permit P-9) then merchant corrects permit only → accept should not silently revert permit
def test_stale_request_permit(auth):
    cid = mk(auth); entry(cid)
    M = auth['merch'][0]
    assert requests.post(f'{BASE}/draws/{cid}/assign', headers=M, json={'officer_id': auth['off2'][1], 'permit_number': 'P-9', 'reason': 'switch officer'}).json()['pending']
    r = requests.post(f'{BASE}/draws/{cid}/assign', headers=M, json={'officer_id': auth['chamber'][1], 'permit_number': 'P-10', 'reason': 'permit fix later'})
    assert r.status_code == 200
    requests.post(f'{BASE}/draws/{cid}/officer-request/accept', headers=auth['off2'][0])
    c = db.competitions.find_one({'_id': ObjectId(cid)})
    assert c['permit_number'] == 'P-10', f"permit reverted to {c['permit_number']} by stale pending request"


# merchant hub exposes pending request; officer-requests lists it for target only
def test_hub_shows_pending(auth):
    cid = mk(auth); entry(cid)
    requests.post(f'{BASE}/draws/{cid}/assign', headers=auth['merch'][0], json={'officer_id': auth['off2'][1], 'reason': 'hub pending'})
    hub = requests.get(f'{BASE}/draws/hub', headers=auth['merch'][0]).json()
    me = [c for c in hub['competitions'] if c['id'] == cid]
    assert me and me[0]['officer_request']['to_officer_id'] == auth['off2'][1]
    assert not any(x['competition_id'] == cid for x in requests.get(f'{BASE}/draws/officer-requests', headers=auth['chamber'][0]).json())
    assert requests.post(f'{BASE}/draws/{cid}/officer-request/cancel', headers=auth['merch'][0]).status_code == 200
    assert requests.post(f'{BASE}/draws/{cid}/officer-request/cancel', headers=auth['merch'][0]).status_code == 404


# latency of chamber list + 15k detail
def test_chamber_latency(auth):
    H = auth['chamber'][0]
    t = time.time(); r = requests.get(f'{BASE}/chamber/competitions', headers=H); tl = time.time() - t
    assert r.status_code == 200
    t = time.time(); r = requests.get(f'{BASE}/chamber/competitions/{BIG}/full', headers=H); tf = time.time() - t
    assert r.status_code == 200
    j = r.json()
    print(f'list {tl:.2f}s, full15k {tf:.2f}s, participants {len(j["participants"])}/{j["participants_count"]}, bytes {len(r.content)}')
    assert len(j['participants']) == 200 and j['participants_count'] == 15000
    assert tf < 3.0 and tl < 5.0
