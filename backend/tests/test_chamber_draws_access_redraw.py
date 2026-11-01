"""Chamber-supervised draws: officer access control, assignment, 30-day documented redraw, legacy endpoints removed."""
import os
import asyncio
from datetime import datetime, timezone, timedelta

import pytest
import requests
from bson import ObjectId
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv('/app/backend/.env')
load_dotenv('/app/frontend/.env')
BASE_URL = os.environ['EXPO_PUBLIC_BACKEND_URL'].rstrip('/')
API = f"{BASE_URL}/api"


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if False else asyncio.run(coro)


async def _db_call(fn):
    cli = AsyncIOMotorClient(os.environ['MONGO_URL'])
    try:
        return await fn(cli[os.environ['DB_NAME']])
    finally:
        cli.close()


def db_do(fn):
    return asyncio.run(_db_call(fn))


def login(phone, pw):
    r = requests.post(f"{API}/auth/login", json={'phone': phone, 'password': pw}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"login failed {phone}: {r.status_code}")
    j = r.json()
    return {'Authorization': f"Bearer {j['token']}"}, j.get('user', {})


@pytest.fixture(scope='module')
def ctx():
    M, _ = login('0509999999', 'merchant2025')
    CH, chu = login('0550000000', 'chamber2025')
    CU, cuu = login('0500000000', 'test1234')
    me = requests.get(f"{API}/auth/me", headers=CH, timeout=20).json()
    officer_id = chu.get('id') or me.get('user', me).get('id')
    cust = requests.get(f"{API}/auth/me", headers=CU, timeout=20).json()

    async def seed(db):
        a = await db.competitions.insert_one({'title': 'TEST_DRAW_A assigned', 'prize': 'TEST prize', 'prize_count': 5,
                                              'status': 'open', 'chamber_supervised': True, 'permit_number': 'CC-TEST-A',
                                              'assigned_chamber_employee_id': officer_id, 'created_at': '2026-01-01'})
        b = await db.competitions.insert_one({'title': 'TEST_DRAW_B unassigned', 'prize': 'TEST prize', 'prize_count': 1,
                                              'status': 'open', 'created_at': '2026-01-01'})
        for cid in (str(a.inserted_id), str(b.inserted_id)):
            for i in range(10):
                await db.competition_entries.insert_one({'competition_id': cid, 'user_id': f'TEST_u{i}', 'user_name': f'TEST مشارك {i}',
                                                         'user_phone': f'05000002{i:02d}', 'created_at': f'2026-01-01T00:00:{i:02d}'})
        return str(a.inserted_id), str(b.inserted_id)

    cid_a, cid_b = db_do(seed)
    yield {'M': M, 'CH': CH, 'CU': CU, 'officer_id': officer_id, 'customer_id': cuu.get('id') or cust.get('user', cust).get('id'), 'a': cid_a, 'b': cid_b}

    async def clean(db):
        for cid in (cid_a, cid_b):
            await db.competitions.delete_one({'_id': ObjectId(cid)})
            await db.competition_entries.delete_many({'competition_id': cid})
            await db.draw_sessions.delete_many({'competition_id': cid})
        await db.notifications.delete_many({'user_id': {'$regex': '^TEST_u'}})
    db_do(clean)


# ── Officer access control ──
class TestOfficerAccess:
    def test_officer_studio_unassigned_403(self, ctx):
        r = requests.get(f"{API}/draws/{ctx['b']}/studio", headers=ctx['CH'])
        assert r.status_code == 403, r.text

    def test_officer_sessions_unassigned_403(self, ctx):
        r = requests.post(f"{API}/draws/{ctx['b']}/sessions", headers=ctx['CH'], json={'kind': 'initial'})
        assert r.status_code == 403, r.text

    def test_officer_studio_assigned_200(self, ctx):
        r = requests.get(f"{API}/draws/{ctx['a']}/studio", headers=ctx['CH'])
        assert r.status_code == 200
        j = r.json()
        assert j['participants'] == 10 and j['competition']['permit_number'] == 'CC-TEST-A'

    def test_officer_competitions_only_assigned(self, ctx):
        r = requests.get(f"{API}/draws/competitions", headers=ctx['CH'])
        assert r.status_code == 200
        ids = [c['id'] for c in r.json()]
        assert ctx['a'] in ids and ctx['b'] not in ids
        assert all(c['officer_id'] == ctx['officer_id'] for c in r.json())

    def test_merchant_competitions_sees_all(self, ctx):
        ids = [c['id'] for c in requests.get(f"{API}/draws/competitions", headers=ctx['M']).json()]
        assert ctx['a'] in ids and ctx['b'] in ids

    def test_customer_competitions_403(self, ctx):
        assert requests.get(f"{API}/draws/competitions", headers=ctx['CU']).status_code == 403

    def test_legacy_chamber_full_unassigned_forbidden(self, ctx):
        # legacy endpoint used by /chamber modal — must not leak unassigned competition participants (full phones)
        r = requests.get(f"{API}/chamber/competitions/{ctx['b']}/full", headers=ctx['CH'])
        assert r.status_code in (403, 404), f"LEAK: {r.status_code}"


# ── Merchant assigns officer ──
class TestAssign:
    def test_assign_invalid_officer_404(self, ctx):
        r = requests.post(f"{API}/draws/{ctx['b']}/assign", headers=ctx['M'], json={'officer_id': str(ObjectId()), 'permit_number': 'X'})
        assert r.status_code == 404

    def test_assign_non_chamber_user_404(self, ctx):
        r = requests.post(f"{API}/draws/{ctx['b']}/assign", headers=ctx['M'], json={'officer_id': ctx['customer_id'], 'permit_number': 'X'})
        assert r.status_code == 404

    def test_assign_by_customer_403(self, ctx):
        r = requests.post(f"{API}/draws/{ctx['b']}/assign", headers=ctx['CU'], json={'officer_id': ctx['officer_id']})
        assert r.status_code == 403

    def test_assign_valid_then_unassign(self, ctx):
        r = requests.post(f"{API}/draws/{ctx['b']}/assign", headers=ctx['M'], json={'officer_id': ctx['officer_id'], 'permit_number': 'CC-TEST-B'})
        assert r.status_code == 200
        st = requests.get(f"{API}/draws/{ctx['b']}/studio", headers=ctx['CH'])
        assert st.status_code == 200 and st.json()['competition']['permit_number'] == 'CC-TEST-B'
        r = requests.post(f"{API}/draws/{ctx['b']}/assign", headers=ctx['M'], json={'officer_id': ''})
        assert r.status_code == 200
        assert requests.get(f"{API}/draws/{ctx['b']}/studio", headers=ctx['CH']).status_code == 403


# ── 30-day documented redraw ──
class TestRedraw:
    def test_full_redraw_flow(self, ctx):
        M, cid = ctx['M'], ctx['a']
        s = requests.post(f"{API}/draws/{cid}/sessions", headers=M, json={'kind': 'initial'}).json()
        assert s['slots'] == 5 and s['seed'] is None
        p = requests.post(f"{API}/draws/sessions/{s['id']}/pick", headers=M, json={'count': 4}).json()
        assert len(p['winners']) == 4
        p2 = requests.post(f"{API}/draws/sessions/{s['id']}/pick", headers=M, json={'count': 1}).json()
        assert p2['remaining'] == 0
        fin = requests.post(f"{API}/draws/sessions/{s['id']}/finish", headers=M).json()
        assert fin['status'] == 'finished' and fin['seed']
        st = requests.get(f"{API}/draws/{cid}/studio", headers=M).json()
        winners = [w['user_id'] for w in st['winners']]
        assert len(winners) == 5 and st['redraw_open'] is False

        old_date = (datetime.now(timezone.utc) - timedelta(days=31)).isoformat()

        async def age(db):
            await db.competitions.update_one({'_id': ObjectId(cid)}, {'$set': {'winners_finalized_at': old_date,
                                                                              **{f'winners.{i}.won_at': old_date for i in range(5)},
                                                                              'winners.1.prize_status': 'claimed',
                                                                              'winners.2.prize_status': 'delivered'}})
        db_do(age)
        assert requests.get(f"{API}/draws/{cid}/studio", headers=M).json()['winners'][0]['redraw_open'] is True

        # claimed / delivered refused
        for i in (1, 2):
            r = requests.post(f"{API}/draws/{cid}/sessions", headers=M, json={'kind': 'redraw', 'replace_user_id': winners[i], 'reason': 'لم يرد خلال شهر'})
            assert r.status_code == 400, r.text
        # short reason refused
        r = requests.post(f"{API}/draws/{cid}/sessions", headers=M, json={'kind': 'redraw', 'replace_user_id': winners[0], 'reason': 'abc'})
        assert r.status_code == 400
        # unknown winner
        r = requests.post(f"{API}/draws/{cid}/sessions", headers=M, json={'kind': 'redraw', 'replace_user_id': 'nope', 'reason': 'لم يرد خلال شهر'})
        assert r.status_code == 404

        # valid redraw (by the assigned officer)
        CH = ctx['CH']
        rs = requests.post(f"{API}/draws/{cid}/sessions", headers=CH, json={'kind': 'redraw', 'replace_user_id': winners[0], 'reason': 'لم يرد خلال شهر'})
        assert rs.status_code == 200, rs.text
        rs = rs.json()
        assert rs['kind'] == 'redraw' and rs['slots'] == 1 and rs['participants_count'] == 5
        assert rs['replaced']['user_id'] == winners[0]
        pk = requests.post(f"{API}/draws/sessions/{rs['id']}/pick", headers=CH, json={'count': 4}).json()
        assert len(pk['winners']) == 1 and pk['winners'][0]['user_id'] not in winners
        new_uid = pk['winners'][0]['user_id']
        f2 = requests.post(f"{API}/draws/sessions/{rs['id']}/finish", headers=CH)
        assert f2.status_code == 200 and f2.json()['seed']

        async def read(db):
            return await db.competitions.find_one({'_id': ObjectId(cid)})
        comp = db_do(read)
        after = [w['user_id'] for w in comp['winners']]
        assert after[0] == new_uid and after[1:] == winners[1:]
        assert winners[0] in comp['forfeited_user_ids']
        assert len(comp['draw_history']) == 2 and comp['draw_history'][1]['kind'] == 'redraw'
        ver = requests.get(f"{API}/draws/sessions/{rs['id']}/verify").json()
        assert ver['verified'] is True
        pub = requests.get(f"{API}/draws/public/{cid}").json()
        assert [x['kind'] for x in pub] == ['initial', 'redraw']
        assert all('****' in pk['phone'] for x in pub for pk in x['picks'])


# ── Legacy draw endpoints removed ──
class TestLegacyRemoved:
    def test_legacy_competition_draw(self, ctx):
        r = requests.post(f"{API}/competitions/{ctx['b']}/draw", headers=ctx['M'], json={})
        assert r.status_code in (404, 405)

    def test_legacy_chamber_draw(self, ctx):
        r = requests.post(f"{API}/chamber/competitions/{ctx['b']}/draw", headers=ctx['CH'], json={})
        assert r.status_code in (404, 405)
