# Implement: Book-style personal Todo MVP

## Milestone Plan

### M0 — Repo & tooling
- 初始化 monorepo/轻量双包结构：`apps/web`、`apps/server`
- 加 `.gitignore`、`.env.example`、根 README
- 约定 Node 18+/20，TypeScript

### M1 — Database & server skeleton
- 配置 `DATABASE_URL` / `APP_ACCESS_KEY` / `PORT`
- 连接本地 Postgres
- 启动时确保 `todos` 表存在
- 实现 health、auth verify、todos CRUD
- 加 access-key middleware

### M2 — Web skeleton + auth gate
- Vite React TS 应用
- Access key 输入与本地会话保存
- API client 封装
- 基础纸感全局样式

### M3 — Book UI + Todo UX
- BookShell / 翻页交互
- 封面页
- 今日/清单双页
- Todo 增删改查与筛选接入真实 API

### M4 — Production packaging
- web build 产物由 server 静态托管
- 一次启动可访问完整站点
- README 写清本地与腾讯云部署步骤

### M5 — Verify
- 本地手动验收 acceptance criteria
- 修正明显 UX/API 问题
- 不提交密钥与密码

## Implementation Order

1. server config + db bootstrap
2. auth + todos routes
3. web auth gate + api client
4. book layout without perfect animation
5. wire todos
6. polish flip animation and paper style
7. static hosting integration
8. docs

## Commands (target)

```bash
# server
cd apps/server
npm install
npm run dev

# web
cd apps/web
npm install
npm run dev

# production-ish
npm run build
node apps/server/dist/index.js
```

## Environment

```env
PORT=3000
DATABASE_URL=postgres://postgres:123456@127.0.0.1:5432/todo
APP_ACCESS_KEY=replace-me
NODE_ENV=development
```

## Definition of Done

- PRD acceptance criteria 全部勾选
- 本地用访问密钥可完整走通
- 刷新后数据仍在 Postgres
- 书本翻页可用
- 文档足够让未来的自己部署到服务器
