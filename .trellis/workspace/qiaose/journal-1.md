# Journal - qiaose (Part 1)

> AI development session journal
> Started: 2026-07-26

---

## 2026-07-26 — Book Todo MVP verification complete

### What was verified
- Local stack: independent `todo-postgres` on `127.0.0.1:55432`, Node API on `:3000`, Vite web on `:5173` (IPv6 localhost).
- Auth gate: missing/wrong `X-Access-Key` → 401; valid key unlocks CRUD.
- Todo CRUD against PostgreSQL: create / rename / toggle complete / delete all work.
- Book UI: cover → today dual page → inbox list + filters; keyboard/button flip; Playwright `npm run check:ui` passed (no horizontal overflow desktop/mobile). Screenshots in `artifacts/ui-check/`.
- Production packaging: `npm run build` then `npm run start` serves static SPA + API from one Node process; SPA fallback returns `index.html`.

### Bug fixed during verify
- Frontend `api.ts` always set `Content-Type: application/json`, which made DELETE (empty body) fail Fastify with `FST_ERR_CTP_EMPTY_JSON_BODY`.
- Fix: only set Content-Type when a body is present. Rebuild web dist after fix.

### Acceptance criteria
All PRD acceptance items checked off in `.trellis/tasks/07-26-book-todo-mvp/prd.md`. Task status → completed.

### Notes
- Local system HTTP proxy can intercept `localhost` curl; use `curl --noproxy '*'` or Node fetch to `127.0.0.1`.
- Vite is now pinned to `127.0.0.1:5173` (strictPort) in vite.config.ts so IPv4 tooling works.
- Secrets stay in `.env` (gitignored); `.tmp-*` also gitignored.

---

## 2026-07-26 — 书本体验与模板升级 (afternoon)

### Shipped
1. **后端**: todos 表新增 `scheduled_start/scheduled_end TIME`、`notes`；新表 `user_prefs`（单行，template_mode A/B/C + last_spread_id）；`GET/PATCH /api/prefs`；todos create/patch 支持时间字段（成对校验、end>start、null 清空）。TIME 列以 `::text` 读出并格式化为 `HH:mm`。
2. **书本体验**: 书房渐变场景背景；书侧厚度条随已完成数增厚（8–56px clamp）；密钥校验后合书→自动打开动画（framer-motion rotateY，会话内只播一次，respects reduced-motion）；顶栏移除，翻页只靠左右边缘点击/滑动/方向键；底部状态栏含模板切换 chips、刷新、锁定。
3. **每日一句**: `lib/quotes.ts` 36 条静态中文语录按日期 seed，QuoteBar 显示在书上方。
4. **模板**: A=今日/清单双页列表；B=自由时间块（TimeBlockForm + SchedulePanel，按开始时间排序）；C=大纲页↔日程页串联（大纲项「安排到日程」写入时间，时间徽章可跳日程页）。偏好持久化到 Postgres，刷新/换机不丢。

### Bugs fixed during verify
- prefs UPDATE 用了 `$1` 传常量 id 导致 `42P18 could not determine data type` — 改为字面量 `WHERE id = 1`。
- Vite 默认绑 IPv6 `[::1]`，Playwright/curl 走 127.0.0.1 连不上 — vite.config.ts 固定 host 127.0.0.1。
- check-ui.mjs 适配新 UX（无「打开书本」按钮，自动开书后落在今日页；清理时不再发 Content-Type 的空体 DELETE）。

### Verification
- API: prefs GET/PATCH、时间块 CRUD、非法时段 400、null 清空、旧 title-only 创建 — 全部通过。
- 浏览器 (Playwright + Edge headless): 模板 A 增删改完成、B 添加 09:00–11:00 时间块、C 大纲添加→安排到日程→日程页可见→边缘翻页返回 — 全部通过；桌面/移动无横向溢出。
- `npm run build` (web tsc+vite / server tsc) 通过。截图在 `artifacts/ui-check/`。


## Session 1: Book unlock and daily journal redesign

**Date**: 2026-07-26
**Task**: Book unlock and daily journal redesign

### Summary

Rebuilt the access gate as an animated locked book, completed the responsive daily journal workspace and persistence contract, and added full browser validation.

### Main Changes

- Added ordered locked-to-unlocking-to-open motion with accessible errors and reduced-motion behavior.
- Completed the 30/70 daily workspace, 3/7 left column, Todo timeline workflows, and persistent summary/goals/notes.
- Documented the cross-layer daily_notes schema and API contract in the backend database spec.

### Git Commits

(No commits - planning session)

### Testing

- [OK] npm run build passed for web and server.
- [OK] npm run db:init passed on the first attempt.
- [OK] npm run check:ui passed at 1440x1000 and 390x844, including auth, CRUD, persistence, ratios, overflow, and negative API cases.

### Status

[OK] **Completed**

### Next Steps

- Initialize or attach a Git repository before the next commit workflow.


## Session 2: V2 daily navigation and book workspace

**Date**: 2026-07-26
**Task**: V2 daily navigation and book workspace
**Branch**: `V2`

### Summary

Added date-scoped Todos and journal navigation, indexed empty-day loading, accessible time picker, opened-book workspace styling, browser coverage, and executable specs.

### Git Commits

| Hash | Message |
|------|---------|
| `8238bb1` | (see git log) |

### Status

[OK] **Completed**
