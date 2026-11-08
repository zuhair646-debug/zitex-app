"""Iter64: reveal loop with naive (Saudi local, as typed in merchant form) reveal_at + void edge cases + form validation."""
import time
from datetime import datetime, timedelta, timezone
import requests
from bson import ObjectId
from test_draw_hardening_iter59 import BASE, db, NOW, PAST, CREATED, login, auth, cleanup, mk_comp, add_entries  # noqa: F401
from test_reveal_iter63 import run_draw

KSA = timezone(timedelta(hours=3))


def ksa_naive(delta_min):
    return (datetime.now(KSA) + timedelta(minutes=delta_min)).strftime('%Y-%m-%dT%H:%M')


class TestRevealTZ:
    # Reveal loop: merchant form sends "YYYY-MM-DDTHH:MM" (KSA local). Must reveal once that local time passes.
    def test_loop_reveals_naive_ksa_time(self, auth):
        cid = mk_comp(auth, prize_count=1, reveal_at=ksa_naive(120))
        add_entries(cid, [f'tz{i}' for i in range(4)])
        run_draw(auth['chamber'][0], cid, 1)
        assert not db.competitions.find_one({'_id': ObjectId(cid)}).get('revealed_at')
        db.competitions.update_one({'_id': ObjectId(cid)}, {'$set': {'reveal_at': ksa_naive(-5)}})
        ok = False
        for _ in range(16):
            time.sleep(2)
            if db.competitions.find_one({'_id': ObjectId(cid)}).get('revealed_at'):
                ok = True
                break
        db.social_posts.delete_many({'linked_competition_id': cid})
        assert ok, 'reveal loop did not reveal a naive KSA reveal_at that passed 5 min ago (string compare +03:00 vs UTC)'

    # Void reject/cancel role checks
    def test_void_reject_by_requester(self, auth):
        cid = mk_comp(auth, prize_count=1, reveal_at=ksa_naive(240))
        add_entries(cid, [f'vr{i}' for i in range(4)])
        run_draw(auth['chamber'][0], cid, 1)
        r = requests.post(f'{BASE}/draws/{cid}/void', headers=auth['chamber'][0], json={'reason': 'TEST wrong pool'})
        assert r.status_code == 200 and r.json().get('pending')
        # customer cannot void
        assert requests.post(f'{BASE}/draws/{cid}/void', headers=auth['cust'][0], json={'reason': 'hack attempt'}).status_code == 403
        # requester approving their own request → 403
        assert requests.post(f'{BASE}/draws/{cid}/void/approve', headers=auth['chamber'][0]).status_code == 403
        # short reason
        assert requests.post(f'{BASE}/draws/{cid}/void', headers=auth['merch'][0], json={'reason': 'x'}).status_code == 422
        # reject by the other party
        rr = requests.post(f'{BASE}/draws/{cid}/void/reject', headers=auth['merch'][0])
        assert rr.status_code == 200
        c = db.competitions.find_one({'_id': ObjectId(cid)})
        assert not c.get('void_request') and c.get('winners_finalized_at')

    # Merchant form validation: reveal before end → 422, valid → creates social post
    def test_form_reveal_validation_and_post(self, auth):
        H = auth['merch'][0]
        end = (datetime.now(KSA) + timedelta(days=2)).strftime('%Y-%m-%d')
        base = {'title': 'TEST_ITER64_FORM', 'prize': 'TEST', 'prize_count': 1, 'competition_type': 'general',
                'start_date': datetime.now(KSA).strftime('%Y-%m-%d'), 'end_date': end, 'draw_date': end}
        bad = requests.post(f'{BASE}/merchant/competitions', headers=H, json={**base, 'reveal_at': ksa_naive(60)})
        assert bad.status_code == 422, bad.text
        assert 'وقت إعلان' in bad.text
        bad2 = requests.post(f'{BASE}/merchant/competitions', headers=H, json={**base, 'reveal_at': 'not-a-date'})
        assert bad2.status_code == 422
        good = requests.post(f'{BASE}/merchant/competitions', headers=H, json={**base, 'reveal_at': ksa_naive(60 * 24 * 4), 'presenter_name': 'TEST_presenter'})
        assert good.status_code in (200, 201), good.text
        cid = good.json().get('id') or good.json().get('_id') or (good.json().get('competition') or {}).get('id')
        assert cid
        CREATED.append(cid)
        c = db.competitions.find_one({'_id': ObjectId(cid)})
        assert c.get('presenter_name') == 'TEST_presenter' and c.get('social_post_id')
        post = db.social_posts.find_one({'_id': ObjectId(c['social_post_id'])})
        assert post and post.get('linked_competition_id') == cid and 'TEST_presenter' in post.get('badge', '')
        db.social_posts.delete_one({'_id': post['_id']})
