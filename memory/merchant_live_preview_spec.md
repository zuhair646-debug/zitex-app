# Live Preview — Full Spec (v1.11.0 target)

## User Requirements (verbatim, recorded 2026-09-13)

### 1. Products / Sales Analytics
- Inside Live Preview products tab: merchant must see WHERE sales are happening most (which products are top-sellers)
- Tapping "Analytics" must show REAL data (not zeros)
- Seed at least ~100 real orders/invoices across POS + online channels so charts have real movement
- Merchant gains actionable insight: best products, best channels, best branches

### 2. Services Analytics (same treatment)
- Every service must have an Analytics button on its card
- Analytics: booking count, avg rating, revenue, best-day-of-week, most popular service type
- Full merchant decision-support view

### 3. Competitions — bigger & richer
- Seed MORE competitions (variety of types: general, quiz, UGC video, referral)
- Better card design + statistics
- Analytics per competition:
  - Total participants
  - **Source tracking**: how many joined via referral link vs. organic browse vs. push
  - Followers gained from THIS competition
  - Which competition type attracts more people (comparison bar)
  - Conversion rate (viewed → joined)

### 4. Social Media (MOST IMPORTANT) — customer-parity + super-powers
- Must look **identical** to the customer's social feed
- Merchant has EXTRA capabilities on top:
  - Tap into any post → see full detail
  - See ALL comments + comment tree with replies-to-replies
  - Reply to any comment (as store)
  - Like posts (as merchant persona)
  - **Viewers list**: WHO viewed the post — by name, city, full details
  - **Likers list**: WHO liked — by name, city
  - **Poll analytics**: full vote breakdown + WHO voted for each option
  - Every detail per post accessible from one screen

## Non-negotiable rules
- Real data everywhere; no placeholders
- Live Preview must never crash (test text-node crashes)
- No release to App Store/Play Store until every screen is verified
- Save this file and never lose these requirements

## Delivery plan
- Phase A: Seed 100+ orders + 20+ competitions + rich social interactions
- Phase B: Backend endpoints (deep analytics for products/services/competitions/posts)
- Phase C: Frontend — enhance Live Preview analytics sheets + new PostDetail modal
- Phase D: Test everything → build → release (auto EAS)
