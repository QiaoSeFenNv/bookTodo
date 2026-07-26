# Design: Book-style personal Todo MVP

## 1. Architecture

```text
Browser (React SPA)
  |- Book UI / page flip
  |- Access key gate
  |- Todo interactions
        |
        | JSON over HTTP
        v
Node server (Fastify)
  |- static hosting for web build
  |- /api/auth/verify
  |- /api/todos CRUD
  |- access-key middleware
        |
        v
PostgreSQL
  |- database: todo (preferred)
  |- table: todos
```

### Why this shape

- 多 PC 同步要求服务端持久化
- 已有 Postgres，避免再引入 SQLite/JSON 文件存储
- Node 与 React 同语言，部署可用单进程
- 无域名阶段最简单：`IP:PORT` 直接访问

## 2. Repository Layout

```text
todo/
  apps/
    web/                 # Vite React TS
      src/
        app/
        components/
          book/
          todo/
          auth/
        lib/
        styles/
    server/              # Fastify API
      src/
        index.ts
        config.ts
        db.ts
        routes/
        middleware/
        sql/
  .env.example
  package.json           # optional workspace root
  README.md
```

若 workspace 配置成本高，可退化为顶层 `client/` + `server/`。优先 `apps/web` + `apps/server`。

## 3. Auth Design

### Model

- 环境变量 `APP_ACCESS_KEY`
- 前端首次进入显示密钥门禁
- 校验成功后把密钥保存在 `sessionStorage`（更安全于长期 localStorage；若用户希望“记住更久”可后续改）
- 请求头：`X-Access-Key: <key>`
- 后端 middleware 比对 timing-safe equals
- `/api/health` 可不鉴权，便于探活
- `/api/auth/verify` 用于显式校验

### Threat model (MVP)

- 目标：挡住随手扫描和路人访问
- 非目标：防专业攻击、多租户隔离、密钥轮换系统
- 部署建议：安全组限制来源 IP + 强密钥

## 4. Data Design

### Table `todos`

| Column | Type | Notes |
|---|---|---|
| id | UUID | 服务端生成 |
| title | TEXT | trim 后非空，长度上限 200 |
| is_done | BOOLEAN | 默认 false |
| page_key | TEXT | 默认 `inbox`，预留书页分区 |
| sort_order | INT | 默认 0，后续可拖拽排序 |
| created_at | TIMESTAMPTZ | 默认 now |
| updated_at | TIMESTAMPTZ | 每次更新刷新 |
| completed_at | TIMESTAMPTZ | 完成时写入，取消完成清空 |

### Query patterns

- list: `ORDER BY is_done ASC, sort_order ASC, created_at DESC`
- create: insert title
- patch: title and/or is_done
- delete: by id

### Migration strategy

- MVP 用启动时 `CREATE TABLE IF NOT EXISTS`
- 不引入重型 ORM/migration 框架
-  enticing future: node-pg-migrate / Drizzle

## 5. API Design

### `POST /api/auth/verify`

```json
{ "accessKey": "..." }
```

- 200: `{ "ok": true }`
- 401: `{ "error": "unauthorized" }`

### `GET /api/todos`

- header required
- optional query: `status=all|active|done`
- response: `{ "items": Todo[] }`

### `POST /api/todos`

```json
{ "title": "买菜" }
```

### `PATCH /api/todos/:id`

```json
{ "title": "..." } | { "is_done": true }
```

### `DELETE /api/todos/:id`

- 204 / `{ ok: true }`

### Error shape

```json
{ "error": "message" }
```

## 6. Frontend Design

### Route / view model

不强调 URL 路由深度，MVP 可用内部 page index：

0. Auth gate（必要时）
1. Cover
2. Today spread
3. Inbox/list spread

### Book interaction

- 容器固定书本比例（如 4:3 或 3:2）
- 当前页与下一页叠放
- 翻页时使用 rotateY + shadow
- 支持：
  - 按钮
  - 键盘
  - pointer drag threshold

### Components

- `AccessGate`
- `BookShell`
- `BookSpread`
- `CoverPage`
- `TodoListPage`
- `TodoItem`
- `TodoComposer`
- `FilterTabs`

### State

- `accessKey`
- `authorized`
- `todos`
- `filter`
- `currentPage`
- `loading/error`

数据获取用简单 fetch wrapper，不必上 Redux。

## 7. Visual System

- Paper: `#F7F1E8`
- Ink: `#2B2118`
- Accent bookmark: muted green or burgundy
- Soft page shadow, stitched gutter illusion optional
- Typography: readable serif/sans mix; Chinese-first readability
- Completed item: opacity down + restrained line-through

## 8. Deployment Design

### Local

1. 创建 db `todo`（或使用现有 postgres 库并建表）
2. 配置 `.env`
3. `apps/server` 连库并 serve API
4. `apps/web` dev server 代理到 API，或直接由 server 在 prod 模式托管

### Production (Tencent Cloud)

1. 复用现有 Postgres 容器，新建库 `todo`
2. 构建 web -> 输出到 server 可服务目录
3. Node 进程监听 `0.0.0.0:3000`
4. 安全组放行 3000（或后续 Nginx 80）
5. 无域名：`http://<public-ip>:3000`

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| 公网暴露无鉴权 | 访问密钥 + 建议 IP 限制 |
| 翻页动画过度复杂拖慢 MVP | 先做轻量 2.5D 翻页，不做重型 book engine |
| 本地/生产 DB 配置混乱 | `.env.example` + README 明确两套配置 |
| 密码写入仓库 | gitignore `.env`，文档只放占位符 |
| 无 Python 导致 Trellis 脚本受限 | 本任务文件可手工维护，不影响产品实现 |

## 10. Test Strategy

- Server unit/integration:
  - auth reject/accept
  - todo CRUD
- Manual UI:
  - gate flow
  - flip pages
  - create/complete/delete
  - refresh persistence
