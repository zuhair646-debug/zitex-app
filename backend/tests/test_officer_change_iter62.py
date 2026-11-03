"""Iter62: controlled officer change — reason, pending request, accept/reject by the new officer, cancel, draw lock, log."""
import bcrypt
import pytest, requests
from bson import ObjectId
from test_chamber_flags_iter60 import BASE, db, login, mk, entry, CREATED, cleanup  # noqa: F401  (cleanup fixture autouse)

PHONE2, PW2 = '0550009998', 'officer2pw'


@pytest.fixture(scope='module')
def auth():
    db.users.update_one({'phone': PHONE2}, {'$set': {'name': 'TEST Officer 2', 'role': 'chamber', 'phone': PHONE2,
                        'password_hash': bcrypt.hashpw(PW2.encode(), bcrypt.gensalt()).decode()}}, upsert=True)
    a = {'merch': login('0509999999', 'merchant2025'), 'chamber': login('0550000000', 'chamber2025'), 'off2': login(PHONE2, PW2)}
    yield a
    db.users.delete_one({'phone': PHONE2})


def test_request_accept_flow(auth):
    cid = mk(auth); entry(cid)
    M, O2 = auth['merch'][0], auth['off2'][0]
    r = requests.post(f'{BASE}/draws/{cid}/assign', headers=M, json={'officer_id': auth['off2'][1], 'permit_number': 'P-9', 'reason': 'officer on leave'})
    assert r.status_code == 200 and r.json().get('pending') is True
    c = db.competitions.find_one({'_id': ObjectId(cid)})
    assert c['assigned_chamber_employee_id'] == auth['chamber'][1]  # unchanged until accepted
    reqs = requests.get(f'{BASE}/draws/officer-requests', headers=O2).json()
    assert any(x['competition_id'] == cid and x['reason'] == 'officer on leave' for x in reqs)
    # the current officer can't accept a request addressed to someone else
    assert requests.post(f'{BASE}/draws/{cid}/officer-request/accept', headers=auth['chamber'][0]).status_code == 404
    assert requests.post(f'{BASE}/draws/{cid}/officer-request/accept', headers=O2).status_code == 200
    c = db.competitions.find_one({'_id': ObjectId(cid)})
    assert c['assigned_chamber_employee_id'] == auth['off2'][1] and c['permit_number'] == 'P-9' and 'officer_request' not in c
    assert [g['action'] for g in c['officer_log']][-2:] == ['request', 'accepted']
    assert requests.post(f'{BASE}/draws/{cid}/officer-request/accept', headers=O2).status_code == 404


def test_reject_and_cancel(auth):
    cid = mk(auth); entry(cid)
    M, O2 = auth['merch'][0], auth['off2'][0]
    body = {'officer_id': auth['off2'][1], 'reason': 'switch officer'}
    assert requests.post(f'{BASE}/draws/{cid}/assign', headers=M, json=body).json()['pending']
    assert requests.post(f'{BASE}/draws/{cid}/officer-request/reject', headers=O2).status_code == 200
    c = db.competitions.find_one({'_id': ObjectId(cid)})
    assert c['assigned_chamber_employee_id'] == auth['chamber'][1] and c['officer_log'][-1]['action'] == 'rejected'
    assert requests.post(f'{BASE}/draws/{cid}/assign', headers=M, json=body).json()['pending']
    assert requests.post(f'{BASE}/draws/{cid}/officer-request/cancel', headers=M).status_code == 200
    assert 'officer_request' not in db.competitions.find_one({'_id': ObjectId(cid)})


def test_blocked_during_draw_and_customer_forbidden(auth):
    cid = mk(auth, open_draw_session='x'); entry(cid)
    r = requests.post(f'{BASE}/draws/{cid}/assign', headers=auth['merch'][0], json={'officer_id': auth['off2'][1], 'reason': 'during draw'})
    assert r.status_code == 409
    cust = login('0500000000', 'test1234')[0]
    assert requests.post(f'{BASE}/draws/{cid}/assign', headers=cust, json={'officer_id': ''}).status_code == 403
    assert requests.get(f'{BASE}/draws/officer-requests', headers=cust).status_code == 403


def test_free_before_entries(auth):
    cid = mk(auth)
    r = requests.post(f'{BASE}/draws/{cid}/assign', headers=auth['merch'][0], json={'officer_id': auth['off2'][1], 'permit_number': 'P-0'})
    assert r.status_code == 200 and not r.json().get('pending')
    assert db.competitions.find_one({'_id': ObjectId(cid)})['assigned_chamber_employee_id'] == auth['off2'][1]
