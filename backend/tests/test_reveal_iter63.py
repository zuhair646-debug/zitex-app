"""Iter63: scheduled reveal (hidden results), two-copy publishing (social posts), void before reveal (two-party / store)."""
from datetime import timedelta
import requests
from bson import ObjectId
from test_draw_hardening_iter59 import BASE, db, NOW, PAST, CREATED, login, auth, cleanup, mk_comp, add_entries  # noqa: F401

FUT = (NOW + timedelta(hours=4)).isoformat()


def run_draw(H, cid, slots):
    s = requests.post(f'{BASE}/draws/{cid}/sessions', headers=H, json={'kind': 'initial'})
    assert s.status_code == 200, s.text
    sid = s.json()['id']
    assert requests.post(f'{BASE}/draws/sessions/{sid}/start', headers=H, json={'officer_code': '246810'}, timeout=60).status_code == 200
    requests.post(f'{BASE}/draws/sessions/{sid}/pick', headers=H, json={'count': slots})
    assert requests.post(f'{BASE}/draws/sessions/{sid}/finish', headers=H).status_code == 200
    return sid


class TestReveal:
    def test_hidden_until_reveal_then_published(self, auth):
        H = auth['chamber'][0]
        cid = mk_comp(auth, prize_count=1, reveal_at=FUT)
        add_entries(cid, [f'rv{i}' for i in range(5)])
        sid = run_draw(H, cid, 1)
        pub = requests.get(f'{BASE}/competitions/{cid}').json()
        assert pub['winners'] == [] and pub['result_hidden'] and pub['phase'] == 'hidden'
        assert requests.get(f'{BASE}/draws/public/{cid}').status_code == 404
        assert requests.get(f'{BASE}/draws/sessions/{sid}/verify').status_code == 404
        assert requests.get(f'{BASE}/draws/public/{cid}', headers=auth['merch'][0]).status_code == 200  # staff sees it
        assert requests.get(f'{BASE}/draws/public/{cid}', headers=auth['cust'][0]).status_code == 404
        assert cid not in [c['id'] for c in requests.get(f'{BASE}/competitions-past').json()]
        assert cid in [c['id'] for c in requests.get(f'{BASE}/competitions-revealing').json()]
        live = [c for c in requests.get(f'{BASE}/competitions/live-summary').json()['competitions'] if c['id'] == cid][0]
        assert live['winners'] == []
        assert not db.social_posts.find_one({'linked_competition_id': cid, 'type': 'competition_result'})
        # time passes → reveal loop publishes
        db.competitions.update_one({'_id': ObjectId(cid)}, {'$set': {'reveal_at': PAST}})
        import time
        for _ in range(15):
            time.sleep(2)
            if db.competitions.find_one({'_id': ObjectId(cid)}).get('revealed_at'):
                break
        c = db.competitions.find_one({'_id': ObjectId(cid)})
        assert c.get('revealed_at') and c.get('results_post_id')
        assert len(requests.get(f'{BASE}/competitions/{cid}').json()['winners']) == 1
        assert cid in [x['id'] for x in requests.get(f'{BASE}/competitions-past').json()]
        assert requests.get(f'{BASE}/draws/sessions/{sid}/verify').json()['verified'] is True
        # after reveal: no void
        assert requests.post(f'{BASE}/draws/{cid}/void', headers=auth['merch'][0], json={'reason': 'too late now'}).status_code == 409
        db.social_posts.delete_many({'linked_competition_id': cid})

    def test_immediate_reveal_without_reveal_at(self, auth):
        cid = mk_comp(auth, prize_count=1)
        add_entries(cid, [f'im{i}' for i in range(3)])
        run_draw(auth['chamber'][0], cid, 1)
        c = db.competitions.find_one({'_id': ObjectId(cid)})
        assert c.get('revealed_at') and db.social_posts.find_one({'linked_competition_id': cid, 'type': 'competition_result'})
        db.social_posts.delete_many({'linked_competition_id': cid})

    def test_two_party_void_then_redo(self, auth):
        CH, M = auth['chamber'][0], auth['merch'][0]
        cid = mk_comp(auth, prize_count=1, reveal_at=FUT)
        add_entries(cid, [f'vd{i}' for i in range(4)])
        run_draw(CH, cid, 1)
        assert requests.post(f'{BASE}/draws/{cid}/void', headers=CH, json={'reason': 'x'}).status_code == 422
        assert requests.post(f'{BASE}/draws/{cid}/void', headers=auth['cust'][0], json={'reason': 'hacker try'}).status_code == 403
        r = requests.post(f'{BASE}/draws/{cid}/void', headers=CH, json={'reason': 'خطأ في التصوير'}).json()
        assert r.get('pending')
        assert requests.post(f'{BASE}/draws/{cid}/void/approve', headers=CH).status_code == 403  # same party
        assert requests.post(f'{BASE}/draws/{cid}/void/approve', headers=M).json().get('voided')
        c = db.competitions.find_one({'_id': ObjectId(cid)})
        assert not c.get('winners_finalized_at') and c['winners'] == [] and c['draw_history'][-1]['kind'] == 'void'
        assert db.draw_sessions.find_one({'competition_id': cid})['voided'] is True
        run_draw(CH, cid, 1)  # redo works
        assert db.competitions.find_one({'_id': ObjectId(cid)}).get('winners_finalized_at')

    def test_store_mode_void_by_owner(self, auth):
        M = auth['merch'][0]
        cid = mk_comp(auth, prize_count=1, reveal_at=FUT, chamber_supervised=False, assigned_chamber_employee_id='')
        add_entries(cid, [f'sv{i}' for i in range(4)])
        run_draw(M, cid, 1)
        assert requests.post(f'{BASE}/draws/{cid}/void', headers=auth['emp'][0], json={'reason': 'employee tries'}).status_code == 403
        assert requests.post(f'{BASE}/draws/{cid}/void', headers=M, json={'reason': 'إعادة التصوير'}).json().get('voided')

    def test_create_makes_social_post_and_reveal_validation(self, auth):
        M = auth['merch'][0]
        end = (NOW + timedelta(days=2)).strftime('%Y-%m-%d')
        body = {'title': 'TEST_ITER63_POST', 'prize': 'P', 'competition_type': 'general', 'end_date': end, 'draw_date': end}
        bad = requests.post(f'{BASE}/merchant/competitions', headers=M, json={**body, 'reveal_at': (NOW + timedelta(hours=1)).isoformat()})
        assert bad.status_code == 422
        r = requests.post(f'{BASE}/merchant/competitions', headers=M, json={**body, 'reveal_at': (NOW + timedelta(days=4)).isoformat()})
        assert r.status_code == 200, r.text
        cid = r.json()['id']
        CREATED.append(cid)
        post = db.social_posts.find_one({'linked_competition_id': cid, 'type': 'competition'})
        assert post and db.competitions.find_one({'_id': ObjectId(cid)})['social_post_id'] == str(post['_id'])
        db.social_posts.delete_many({'linked_competition_id': cid})
