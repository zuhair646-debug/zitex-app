"""Iter59: chamber draw hardening — sessions (prepare/start/pick/finish/verify), draw window, redraw rules,
competition_rules (entry window, staff exclusion, locked fields, delete guard, UGC finalize), purchase tickets, 15k perf."""
import os, time, subprocess
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
FUTURE = (NOW + timedelta(days=5)).isoformat()
CREATED = []


def login(phone, pw):
    r = requests.post(f'{BASE}/auth/login', json={'phone': phone, 'password': pw}, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    return {'Authorization': f"Bearer {j['token']}"}, j['user']['id']


@pytest.fixture(scope='module')
def auth():
    return {'cust': login('0500000000', 'test1234'), 'merch': login('0509999999', 'merchant2025'),
            'chamber': login('0550000000', 'chamber2025'), 'driver': login('0540001111', 'driver1234'),
            'emp': login('0530000001', 'emp1234')}


@pytest.fixture(scope='module', autouse=True)
def cleanup():
    yield
    for cid in CREATED:
        db.competitions.delete_one({'_id': ObjectId(cid)})
        db.competition_entries.delete_many({'competition_id': cid})
        db.draw_sessions.delete_many({'competition_id': cid})
        db.competition_answers.delete_many({'competition_id': cid})
        db.competition_videos.delete_many({'competition_id': cid})
    db.orders.delete_many({'notes': 'TEST_ITER59'})


def mk_comp(auth, **kw):
    doc = {'title': 'TEST_ITER59', 'prize': 'TEST', 'prize_count': 2, 'competition_type': 'general', 'status': 'open',
           'chamber_supervised': True, 'assigned_chamber_employee_id': auth['chamber'][1], 'created_by_merchant': auth['merch'][1],
           'end_date': PAST, 'winners': [], 'draw_history': [], 'created_at': NOW.isoformat()}
    doc.update(kw)
    cid = str(db.competitions.insert_one(doc).inserted_id)
    CREATED.append(cid)
    return cid


def add_entries(cid, uids, **kw):
    db.competition_entries.insert_many([{'competition_id': cid, 'user_id': u, 'user_name': f'P{i}', 'user_phone': f'0500000{i:03d}',
                                         'created_at': (NOW - timedelta(days=1, seconds=-i)).isoformat(), **kw} for i, u in enumerate(uids)])


# ─── draw session lifecycle ───
class TestDrawSession:
    def test_full_lifecycle_and_verify(self, auth):
        H = auth['chamber'][0]
        staff = [auth['merch'][1], auth['chamber'][1], auth['driver'][1], auth['emp'][1]]
        cid = mk_comp(auth, prize_count=3)
        add_entries(cid, [f'tu{i}' for i in range(6)] + staff)
        s = requests.post(f'{BASE}/draws/{cid}/sessions', headers=H, json={'kind': 'initial'}).json()
        sid = s['id']
        assert s['tickets'] == 6 and s['participants_count'] == 6, s
        assert s['seed'] is None and s['officer_code'] is None and len(s['seed_hash']) == 64
        assert s['beacon_commit_round'], 'drand commit round missing'
        # entries closed while session open
        assert requests.post(f'{BASE}/competitions/{cid}/join', headers=auth['cust'][0]).status_code == 400
        assert requests.post(f'{BASE}/draws/sessions/{sid}/pick', headers=H, json={'count': 1}).status_code == 400
        assert requests.post(f'{BASE}/draws/sessions/{sid}/start', headers=H, json={'officer_code': '12345'}).status_code == 422
        assert requests.post(f'{BASE}/draws/sessions/{sid}/start', headers=H, json={'officer_code': '12a456'}).status_code == 422
        st = requests.post(f'{BASE}/draws/sessions/{sid}/start', headers=H, json={'officer_code': '482913'}, timeout=60)
        assert st.status_code == 200 and st.json()['started'] is True
        # second start must not change the seed
        requests.post(f'{BASE}/draws/sessions/{sid}/start', headers=H, json={'officer_code': '000000'}, timeout=60)
        p1 = requests.post(f'{BASE}/draws/sessions/{sid}/pick', headers=H, json={'count': 1}).json()
        assert p1['remaining'] == 2
        assert requests.post(f'{BASE}/draws/sessions/{sid}/finish', headers=H).status_code == 400
        p2 = requests.post(f'{BASE}/draws/sessions/{sid}/pick', headers=H, json={'count': 4}).json()
        assert p2['remaining'] == 0 and len(p2['winners']) == 2
        uids = [w['user_id'] for w in p1['winners'] + p2['winners']]
        assert len(set(uids)) == 3 and not set(uids) & set(staff)
        assert requests.post(f'{BASE}/draws/sessions/{sid}/pick', headers=H, json={'count': 1}).status_code == 409
        fin = requests.post(f'{BASE}/draws/sessions/{sid}/finish', headers=H).json()
        assert fin['status'] == 'finished' and fin['seed'] and fin['officer_code'] == '482913'
        v = requests.get(f'{BASE}/draws/sessions/{sid}/verify').json()
        assert v['verified'] is True and all(v['checks'].values()), v['checks']
        assert set(v['checks']) == {'participants_hash', 'seed_hash', 'public_beacon', 'winners_replay', 'audit_chain'}
        assert [a['ev'] for a in v['audit']] == ['prepare', 'start', 'pick', 'pick', 'finish']
        comp = db.competitions.find_one({'_id': ObjectId(cid)})
        assert comp['status'] == 'ended' and len(comp['winners']) == 3 and not comp.get('open_draw_session')
        # no second initial draw
        assert requests.post(f'{BASE}/draws/{cid}/sessions', headers=H, json={'kind': 'initial'}).status_code == 409
        # tamper detection: edit an audit entry → audit_chain false
        db.draw_sessions.update_one({'_id': ObjectId(sid)}, {'$set': {'audit.1.data.by': 'hacker'}})
        assert requests.get(f'{BASE}/draws/sessions/{sid}/verify').json()['checks']['audit_chain'] is False
        TestDrawSession.cid, TestDrawSession.sid, TestDrawSession.winners = cid, sid, uids

    def test_redraw_rules(self, auth):
        cid, H, M = TestDrawSession.cid, auth['chamber'][0], auth['merch'][0]
        w0 = TestDrawSession.winners[0]
        body = {'kind': 'redraw', 'replace_user_id': w0, 'reason': 'لم يرد خلال شهر كامل'}
        assert requests.post(f'{BASE}/draws/{cid}/sessions', headers=H, json=body).status_code == 400  # too early
        old = (NOW - timedelta(days=31)).isoformat()
        db.competitions.update_one({'_id': ObjectId(cid)}, {'$set': {'winners.$[].won_at': old}})
        # late joiner must NOT enter the redraw pool
        add_entries(cid, ['late_joiner'])
        assert requests.post(f'{BASE}/draws/{cid}/sessions', headers=M, json=body).status_code == 403
        r = requests.post(f'{BASE}/draws/{cid}/sessions', headers=H, json=body)
        assert r.status_code == 200, r.text
        s = r.json()
        assert s['slots'] == 1 and s['tickets'] == 3 and 'late_joiner' not in str(s['names']), s  # 6 - 3 winners
        requests.post(f'{BASE}/draws/sessions/{s["id"]}/start', headers=H, json={'officer_code': '111222'}, timeout=60)
        pk = requests.post(f'{BASE}/draws/sessions/{s["id"]}/pick', headers=H, json={'count': 1}).json()
        assert pk['winners'][0]['user_id'] not in TestDrawSession.winners
        requests.post(f'{BASE}/draws/sessions/{s["id"]}/finish', headers=H)
        comp = db.competitions.find_one({'_id': ObjectId(cid)})
        assert w0 in comp['forfeited_user_ids'] and len(comp['winners']) == 3
        new_w = next(w for w in comp['winners'] if w['user_id'] == pk['winners'][0]['user_id'])
        assert new_w['redraws'] == 1
        db.competitions.update_one({'_id': ObjectId(cid), 'winners.user_id': new_w['user_id']},
                                   {'$set': {'winners.$.redraws': 2, 'winners.$.won_at': old}})
        b2 = {**body, 'replace_user_id': new_w['user_id']}
        r2 = requests.post(f'{BASE}/draws/{cid}/sessions', headers=H, json=b2)
        assert r2.status_code == 400 and '2' in r2.text

    def test_per_order_tickets_and_cancelled(self, auth):
        H = auth['chamber'][0]
        cid = mk_comp(auth, competition_type='purchase', tickets_mode='per_order', max_tickets_per_user=5, prize_count=3)
        o_ok = [str(db.orders.insert_one({'status': 'delivered', 'notes': 'TEST_ITER59'}).inserted_id) for _ in range(4)]
        o_bad = str(db.orders.insert_one({'status': 'cancelled', 'notes': 'TEST_ITER59'}).inserted_id)
        rows = [('A', o_ok[0]), ('A', o_ok[1]), ('A', o_ok[2]), ('B', o_ok[3]), ('C', o_bad)]
        db.competition_entries.insert_many([{'competition_id': cid, 'user_id': u, 'user_name': u, 'user_phone': '0500000999', 'order_id': o,
                                             'created_at': NOW.isoformat()} for u, o in rows])
        s = requests.post(f'{BASE}/draws/{cid}/sessions', headers=H, json={'kind': 'initial'}).json()
        assert s['tickets'] == 4 and s['participants_count'] == 2 and s['slots'] == 2, s
        requests.post(f'{BASE}/draws/sessions/{s["id"]}/start', headers=H, json={'officer_code': '999111'}, timeout=60)
        p = requests.post(f'{BASE}/draws/sessions/{s["id"]}/pick', headers=H, json={'count': 2}).json()
        assert sorted(w['user_id'] for w in p['winners']) == ['A', 'B']

    def test_draw_window_and_ugc(self, auth):
        H = auth['chamber'][0]
        cid = mk_comp(auth, end_date=FUTURE)
        add_entries(cid, ['x1', 'x2'])
        assert requests.post(f'{BASE}/draws/{cid}/sessions', headers=H, json={'kind': 'initial'}).status_code == 400
        cid2 = mk_comp(auth, draw_date=FUTURE)
        add_entries(cid2, ['x1', 'x2'])
        assert requests.post(f'{BASE}/draws/{cid2}/sessions', headers=H, json={'kind': 'initial'}).status_code == 400
        cid3 = mk_comp(auth, competition_type='ugc_video')
        add_entries(cid3, ['x1'])
        assert requests.post(f'{BASE}/draws/{cid3}/sessions', headers=H, json={'kind': 'initial'}).status_code == 400

    def test_access(self, auth):
        cid = mk_comp(auth, assigned_chamber_employee_id='000000000000000000000000')
        assert requests.get(f'{BASE}/draws/{cid}/studio', headers=auth['chamber'][0]).status_code == 403
        assert requests.get(f'{BASE}/draws/{cid}/studio', headers=auth['cust'][0]).status_code == 403
        assert requests.get(f'{BASE}/draws/{cid}/studio', headers=auth['driver'][0]).status_code == 403


# ─── competition_rules ───
class TestRules:
    def test_join_blocked(self, auth):
        C = auth['cust'][0]
        assert requests.post(f'{BASE}/competitions/{mk_comp(auth)}/join', headers=C).status_code == 400  # ended
        assert requests.post(f'{BASE}/competitions/{mk_comp(auth, end_date=FUTURE, status="closed")}/join', headers=C).status_code == 400
        open_c = mk_comp(auth, end_date=FUTURE)
        for role in ('merch', 'chamber', 'driver', 'emp'):
            assert requests.post(f'{BASE}/competitions/{open_c}/join', headers=auth[role][0]).status_code == 403, role
        assert requests.post(f'{BASE}/competitions/{open_c}/join', headers=C).status_code == 200

    def test_answer_blocked(self, auth):
        q = dict(competition_type='qa', question='?', options=['a', 'b'], correct_answer='a')
        assert requests.post(f'{BASE}/competitions/{mk_comp(auth, **q)}/answer', headers=auth['cust'][0], json={'answer': 'a'}).status_code == 400
        oc = mk_comp(auth, end_date=FUTURE, **q)
        assert requests.post(f'{BASE}/competitions/{oc}/answer', headers=auth['merch'][0], json={'answer': 'a'}).status_code == 403
        r = requests.post(f'{BASE}/competitions/{oc}/answer', headers=auth['cust'][0], json={'answer': 'a'})
        assert r.status_code == 200 and r.json()['entered'] is True

    def test_locked_fields_and_delete(self, auth):
        M = auth['merch'][0]
        body = {'title': 'TEST_ITER59 lock', 'prize': 'X', 'prize_count': 2, 'competition_type': 'general', 'end_date': FUTURE}
        cid = requests.post(f'{BASE}/merchant/competitions', headers=M, json=body).json()['id']
        CREATED.append(cid)
        assert requests.put(f'{BASE}/merchant/competitions/{cid}', headers=M, json={**body, 'prize_count': 3}).status_code == 200
        body['prize_count'] = 3
        assert requests.post(f'{BASE}/competitions/{cid}/join', headers=auth['cust'][0]).status_code == 200
        for chg in ({'prize_count': 5}, {'end_date': (NOW + timedelta(days=9)).isoformat()}):
            assert requests.put(f'{BASE}/merchant/competitions/{cid}', headers=M, json={**body, **chg}).status_code == 409, chg
        assert requests.put(f'{BASE}/merchant/competitions/{cid}', headers=M, json={**body, 'description': 'ok'}).status_code == 200
        assert requests.delete(f'{BASE}/merchant/competitions/{cid}', headers=M).status_code == 409
        empty = requests.post(f'{BASE}/merchant/competitions', headers=M, json=body).json()['id']
        assert requests.delete(f'{BASE}/merchant/competitions/{empty}', headers=M).status_code == 200
        t = mk_comp(auth, is_test=True)
        add_entries(t, ['z1'])
        assert requests.delete(f'{BASE}/merchant/competitions/{t}', headers=M).status_code == 200
        assert db.competition_entries.count_documents({'competition_id': t}) == 0

    def test_qa_correct_answer_locked(self, auth):
        M = auth['merch'][0]
        body = {'title': 'TEST_ITER59 qa', 'prize': 'X', 'competition_type': 'qa', 'question': '?', 'options': ['a', 'b'],
                'correct_answer': 'a', 'end_date': FUTURE}
        cid = requests.post(f'{BASE}/merchant/competitions', headers=M, json=body).json()['id']
        CREATED.append(cid)
        requests.post(f'{BASE}/competitions/{cid}/answer', headers=auth['cust'][0], json={'answer': 'a'})
        assert requests.put(f'{BASE}/merchant/competitions/{cid}', headers=M, json={**body, 'correct_answer': 'b'}).status_code == 409

    def test_ugc_finalize(self, auth):
        M = auth['merch'][0]
        fut = mk_comp(auth, competition_type='ugc_video', end_date=FUTURE)
        assert requests.post(f'{BASE}/competitions/{fut}/auto-finalize', headers=M).status_code == 400
        cid = mk_comp(auth, competition_type='ugc_video', prize_count=1)
        db.competition_videos.insert_many([{'competition_id': cid, 'user_id': 'v1', 'user_name': 'v1', 'likes': 3},
                                           {'competition_id': cid, 'user_id': 'v2', 'user_name': 'v2', 'likes': 9}])
        r = requests.post(f'{BASE}/competitions/{cid}/auto-finalize', headers=M)
        assert r.status_code == 200 and r.json()['winners'][0]['user_id'] == 'v2'
        assert requests.post(f'{BASE}/competitions/{cid}/auto-finalize', headers=M).status_code == 409

    def test_ugc_submit_after_end_blocked(self, auth):
        cid = mk_comp(auth, competition_type='ugc_video')
        r = requests.post(f'{BASE}/competitions/{cid}/videos', headers=auth['cust'][0], json={'video': 'x/y.mp4'})
        assert r.status_code in (400, 403), f'UGC video accepted after end_date: {r.status_code}'


# ─── purchase tickets via POST /api/orders ───
class TestPurchaseTickets:
    def _order(self, auth, prod):
        C = auth['cust'][0]
        requests.delete(f'{BASE}/cart', headers=C)
        for ci in db.cart_items.find({'user_id': auth['cust'][1]}):
            db.cart_items.delete_one({'_id': ci['_id']})
        assert requests.post(f'{BASE}/cart', headers=C, json={'product_id': prod, 'quantity': 1}).status_code == 200
        r = requests.post(f'{BASE}/orders', headers=C, json={'address': 'TEST', 'phone': '0500000000', 'notes': 'TEST_ITER59'})
        assert r.status_code == 200, r.text

    def test_per_order_cap_and_one(self, auth):
        p = db.products.find_one({'stock': {'$gte': 10}}) or db.products.find_one({})
        prod = str(p['_id'])
        start = (NOW - timedelta(minutes=1)).isoformat()
        per = mk_comp(auth, competition_type='purchase', tickets_mode='per_order', max_tickets_per_user=2, spend_requirement=0,
                      start_date=start, end_date=FUTURE)
        one = mk_comp(auth, competition_type='purchase', tickets_mode='one', spend_requirement=0, start_date=start, end_date=FUTURE)
        big = mk_comp(auth, competition_type='purchase', tickets_mode='one', spend_requirement=10 ** 9, start_date=start, end_date=FUTURE)
        for _ in range(3):
            self._order(auth, prod)
        uid = auth['cust'][1]
        assert db.competition_entries.count_documents({'competition_id': per, 'user_id': uid}) == 2
        assert db.competition_entries.count_documents({'competition_id': one, 'user_id': uid}) == 1
        assert db.competition_entries.count_documents({'competition_id': big, 'user_id': uid}) == 0
        db.products.update_one({'_id': p['_id']}, {'$inc': {'stock': 3}}) if p.get('stock') is not None else None


# ─── 15k performance (own seeded copy, deleted afterwards) ───
class TestPerf15k:
    def test_prepare_verify_15k(self, auth):
        out = subprocess.run(['python3', 'seed_test_competition.py', '15000'], cwd='/app/backend', capture_output=True, text=True, timeout=120)
        cid = out.stdout.split()[0]
        CREATED.append(cid)
        H = auth['chamber'][0]
        t = time.time()
        s = requests.post(f'{BASE}/draws/{cid}/sessions', headers=H, json={'kind': 'initial'}, timeout=60).json()
        dt = time.time() - t
        print(f'prepare 15k: {dt:.2f}s tickets={s["tickets"]} names={len(s["names"])}')
        assert s['tickets'] == 15000 and dt < 2.5
        requests.post(f'{BASE}/draws/sessions/{s["id"]}/start', headers=H, json={'officer_code': '135790'}, timeout=60)
        t = time.time()
        requests.post(f'{BASE}/draws/sessions/{s["id"]}/pick', headers=H, json={'count': 3})
        print(f'pick3 15k: {time.time() - t:.2f}s')
        requests.post(f'{BASE}/draws/sessions/{s["id"]}/finish', headers=H)
        t = time.time()
        v = requests.get(f'{BASE}/draws/sessions/{s["id"]}/verify', timeout=60)
        print(f'verify 15k: {time.time() - t:.2f}s size={len(v.content) / 1e6:.2f}MB')
        assert v.json()['verified'] and all(v.json()['checks'].values())
        assert requests.delete(f'{BASE}/merchant/competitions/{cid}', headers=auth['merch'][0]).status_code == 200


class TestAccumulated:
    def test_accumulated_sums_orders(self, auth):
        p = db.products.find_one({'stock': {'$gte': 10}}) or db.products.find_one({})
        prod, uid = str(p['_id']), auth['cust'][1]
        start = (NOW - timedelta(seconds=1)).isoformat()
        TestPurchaseTickets()._order(auth, prod)
        last = db.orders.find_one({'user_id': uid, 'notes': 'TEST_ITER59'}, sort=[('created_at', -1)])
        tot = float(last['total'])
        cid = mk_comp(auth, competition_type='purchase', purchase_mode='accumulated', tickets_mode='one', spend_requirement=tot * 1.5,
                      start_date=datetime.now(timezone.utc).isoformat(), end_date=FUTURE)
        TestPurchaseTickets()._order(auth, prod)
        assert db.competition_entries.count_documents({'competition_id': cid, 'user_id': uid}) == 0
        TestPurchaseTickets()._order(auth, prod)
        assert db.competition_entries.count_documents({'competition_id': cid, 'user_id': uid}) == 1


class TestEndDateDeadlock:
    def test_comp_without_end_date_can_still_be_drawn(self, auth):
        """Comp published without end_date (form allows it) → after first entry end_date is locked and prepare needs end_date."""
        M = auth['merch'][0]
        body = {'title': 'TEST_ITER59 noend', 'prize': 'X', 'competition_type': 'general', 'chamber_supervised': False}
        r = requests.post(f'{BASE}/merchant/competitions', headers=M, json=body)
        assert r.status_code == 422  # end_date is now mandatory at creation → no deadlock possible
        return
        put = requests.put(f'{BASE}/merchant/competitions/{cid}', headers=M, json={**body, 'end_date': PAST})
        prep = requests.post(f'{BASE}/draws/{cid}/sessions', headers=M, json={'kind': 'initial'})
        print('PUT end_date:', put.status_code, put.text[:120], '| prepare:', prep.status_code, prep.text[:120])
        assert put.status_code == 200 or prep.status_code == 200, 'deadlock: cannot set end_date and cannot draw'

    def test_bad_date_format_rejected(self, auth):
        M = auth['merch'][0]
        r = requests.post(f'{BASE}/merchant/competitions', headers=M, json={'title': 'TEST_ITER59 baddate', 'prize': 'X', 'end_date': '30/08/2026'})
        if r.status_code == 200:
            CREATED.append(r.json()['id'])
        assert r.status_code in (400, 422), 'invalid end_date accepted → entries never close & draw impossible'
