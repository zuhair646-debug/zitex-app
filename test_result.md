#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "Zitex — comprehensive native mobile app for a Tech Store (iOS/Android). Includes e-commerce checkout, social feed, competition draws, delivery system, Chamber of Commerce portal, and a Merchant Multi-Tenant SaaS ERP (branches, roles, inventory, POS, HR). Current phase: integrate POS + Invoices UI into merchant navigation, fix driver login and social.tsx text warnings."

backend:
  - task: "POS Invoice Create / List / Get endpoints"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "POST /api/pos/invoice, GET /api/pos/invoices, GET /api/pos/invoice/{iid}. Verifies items subtotal, VAT (15%), decrements branch_inventory. Needs backend testing with merchant token (0509999999/merchant2025)."
  - task: "Auth Login trim whitespace fix"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Added .strip() to phone and password to handle whitespace. Test with driver (0540001111/driver1234), merchant (0509999999/merchant2025), chamber (0550000000/chamber2025). Also verify with trailing/leading whitespace."

frontend:
  - task: "POS screen + Invoices screen registered and reachable"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/merchant/_layout.tsx, /app/frontend/app/merchant/more.tsx, /app/frontend/app/merchant/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Added hidden routes for pos+invoices in Tabs layout, quick-actions on merchant dashboard, and 'المبيعات والفواتير' section in More. Manual screenshot verified POS screen loads with product search + branch chips. Please test full flow: open POS → search product → add to cart → checkout → verify invoice appears in /merchant/invoices."
  - task: "social.tsx text-string warning fix"
    implemented: true
    working: true
    file: "/app/frontend/app/(tabs)/social.tsx"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Wrapped storeInfo conditional with !!() to prevent empty-string leak in JSX. Verify no 'Text strings must be rendered' warning appears when opening the Social tab."
        - working: false
          agent: "testing"
          comment: "Outer conditional fixed but 8 inner {storeInfo.X && ...} conditionals still leak empty strings. 15 warnings still fire."
        - working: true
          agent: "main"
          comment: "Wrapped all 8 inner conditionals (whatsapp/phone/email/instagram/tiktok/snapchat/twitter/telegram) with !!()."

  - task: "POS invoice ownership check (security)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: false
          agent: "testing"
          comment: "GET /api/pos/invoice/{iid} had no ownership check — any merchant could read another merchant's invoice by ObjectId."
        - working: true
          agent: "main"
          comment: "Added merchant_id ownership check + role check + employee permission check (all / invoices_view_all)."

metadata:
  created_by: "main_agent"
  version: "1.3.0"
  test_sequence: 1
  run_ui: true

test_plan:
  current_focus:
    - "Backend Performance — comprehensive indexes + TTL cache (v1.16.0)"
    - "Global i18n auto-wrap verification (60+ files, 704 strings)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

backend:
  - task: "Backend Perf — MongoDB indexes + in-process TTL cache"
    implemented: true
    working: "NA"
    file: "/app/backend/perf.py, /app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Added /app/backend/perf.py with (a) ensure_indexes() bootstrap that creates 80+ compound/single indexes across 30 collections (users, products, orders, social_*, competitions, services, service_bookings, service_reviews, affiliates, notifications, etc.), (b) async-safe TTLCache + cached_json() helper (no Redis needed for single-node VPS), (c) safe_limit() clamp helper. Wired ensure_indexes into startup event. Wrapped /api/categories, /api/brands, /api/banners, /api/store/support, /api/products/featured with TTL cache (60-120s). Made /api/orders and /api/social/posts accept ?limit and ?skip params (backward compatible — still returns plain array). Startup log confirms: 80 indexes created, 0 failed. Curl tests: categories 5.8ms → 1.3ms on cache hit; social/posts 8ms; products 4.4ms. Contract preserved. Please retest merchant flow, customer home load, and login for all 6 role credentials (see test_credentials.md)."

frontend:
  - task: "Global i18n auto-wrap — 704 strings across 60+ files via useAutoT/TX"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/useAutoT.tsx, /app/scripts/global_i18n_wrap.py, /app/frontend/app/**"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "60+ files rewritten by /app/scripts/global_i18n_wrap.py to replace <Text>Arabic</Text> with <TX>Arabic</TX> plus wrap known props (label/title/placeholder). Verified via ESLint: 0 parse errors, only 5 pre-existing react/no-unescaped-entities warnings (unrelated). Screenshot on 390×844: Login screen renders correctly (Arabic default); after customer login, Home tab loads with English translations working (Categories, Loyalty Points, Hot products, Best deals). Merchant login renders Arabic dashboard correctly. No crashes on tab navigation. Please run testing_agent when user requests it to sweep all 60+ screens for any residual truncation or missing translations."

agent_communication:
    - agent: "main"
      message: "Phase C (POS + Invoices) navigation is now fully wired. Also fixed auth login whitespace bug (likely cause of driver login failing in production). social.tsx warning also fixed. Please verify: (1) POS end-to-end invoice creation, (2) login works for all three roles including with padded whitespace, (3) no text warnings on Social tab. Credentials: Merchant 0509999999/merchant2025, Driver 0540001111/driver1234, Chamber 0550000000/chamber2025."
    - agent: "main"
      message: "v1.3.3 — Redesigned Marketing panel with unified campaign type picker (Regular Ad vs Affiliate Campaign). Added Affiliate Dashboard for customers (/my-affiliate). Added Store↔Affiliate toggle on home tab (only if user has ≥1 affiliate account). Please verify end-to-end: (a) merchant creates affiliate campaign with commission %, (b) customer sees campaign card in social feed with 'قدّم الآن' button, (c) tapping opens /affiliate-apply with auto-filled fields, (d) submit application, (e) merchant approves, (f) customer sees 🏆 pill on home tab, (g) opens /my-affiliate dashboard with referral link, analytics, and wallet. Also test the regular ad flow with targeting. Merchant: 0509999999/merchant2025 · Customer: 0500000000/test1234 · Driver: 0540001111/driver1234."
    - agent: "main"
      message: "v1.13.14 — Deep Analytics extended to Services, Competitions, and Social Posts (matching the approved Product Analytics design). Backend: /app/backend/deep_analytics.py rewrite fixes data-mapping bugs (services now use total_fee for revenue, competitions use competition_entries collection + joined_at timestamp, posts handle likes/shares as int totals). Frontend: /app/frontend/app/merchant/product-analytics.tsx now kind-aware — KPI labels, funnel stages, hero pills, and comparison headers all adapt per kind (product/service/competition/post). Screens: service-analytics.tsx, competition-analytics.tsx, post-analytics.tsx are thin wrappers reusing the same UI. Please test end-to-end with merchant 0509999999/merchant2025: open Live Preview → tap Services tab → tap any service card → verify Deep Analytics screen loads with 5 KPI rows (Views, Bookings, Cancelled, Completed, Revenue, Shares, Fill Rate) + Overview/Visitors/Bookings/Shares/Reviews/Compare tabs, all correctly labeled 'حجوزات' not 'سلة'. Repeat for Competitions tab (expects 'مشاركون', 'أماكن شاغرة', capacity %) and Social tab (expects 'الوصول', 'المعجبون', 'تعليقات', 'مشاركات', 'نقاط التفاعل')."
    - agent: "main"
      message: "v1.16.0 — Phase 2 Backend Performance. Introduced /app/backend/perf.py providing: (1) ensure_indexes(db) which idempotently creates 80+ compound/single MongoDB indexes across 30 collections on startup (users, products, orders, social_posts, social_likes, social_bookmarks, social_comments, competitions, competition_entries, services, service_bookings, service_reviews, service_updates, favorites, cart_items, addresses, notifications, wallet_transactions, points_history, loyalty_transactions, time_logs, activity_log, affiliates, affiliate_conversions, ads, support_tickets, warranties, roles, branches, branch_inventory, employees, drivers, banners, categories, brands, reviews, settings). (2) TTLCache — async-safe in-process cache (no Redis dep for single-node Hetzner VPS; can be swapped later). (3) cached_json() helper wraps loader functions with a TTL. (4) safe_limit() clamps user-supplied ?limit params. Wired into server.py startup event; startup log confirms '80 created/verified, 0 failed'. Cached endpoints: /api/categories (120s), /api/brands (120s), /api/banners (90s), /api/store/support (60s, invalidated on PUT), /api/products/featured (60s). Added optional ?limit and ?skip params to /api/orders and /api/social/posts (backward compatible — still returns a plain array). Frontend contract unchanged. Please retest: (a) all 6 roles can log in, (b) merchant home KPIs load, (c) customer home tabs cycle without crashes, (d) products list still paginates and search still works, (e) cache invalidation happens after PUT /api/merchant/store/support."

agent_communication_end: true

  - task: "Deep Analytics for Services/Competitions/Posts (v1.13.14)"
    implemented: true
    working: "NA"
    file: "/app/backend/deep_analytics.py, /app/frontend/app/merchant/product-analytics.tsx, /app/frontend/app/merchant/service-analytics.tsx, /app/frontend/app/merchant/competition-analytics.tsx, /app/frontend/app/merchant/post-analytics.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Extended the approved Product Analytics design (v1.13.12) to services, competitions, and posts. Fixed field mismatches: service_bookings.total_fee (revenue), competition_entries (participants collection) + joined_at, social_posts.likes/shares as int totals with liked_by/shared_by as drill-down lists. Kind-aware KPI labels: services show 'الحجوزات', competitions show 'مشاركون'/'أماكن شاغرة'/'نسبة الامتلاء', posts show 'الوصول'/'المعجبون'/'تعليقات'/'نقاط التفاعل'. Backend curl tests all 200 OK with realistic numbers. Please test the 4 kinds end-to-end via Live Preview."