# Book Todo

一本属于你自己的待办书：React 书本翻页 UI + Node API + PostgreSQL，带访问密钥保护。

## 功能

- 访问密钥门禁，校验后自动播放开书动画
- 有厚度的书本 UI（厚度随已完成任务增加）
- 封面 / 今日 / 清单 / 日程等多页；左右边缘点击或滑动翻页（也支持方向键）
- 模板 A 简洁列表 · B 自由时间块 · C 大纲 + 日程（偏好服务端持久化）
- 每日一句激励语
- 待办新增、编辑、完成、删除、筛选、时间安排
- 数据持久化到独立 PostgreSQL（不复用其他业务库）

## 技术栈

- apps/web: Vite + React + TypeScript + framer-motion
- apps/server: Fastify + pg + Zod
- PostgreSQL 16（独立 Docker 容器 todo-postgres）

## 本地数据库（WSL Docker）

本项目使用独立容器，不复用 renti-pg：

```bash
# 在 WSL 中
docker compose up -d
# 或
docker start todo-postgres
```

默认连接：

```text
host: 127.0.0.1
port: 55432
database: todo
user: postgres
password: 123456
```

端口使用 55432，避免和已有 renti-pg:5432 冲突。

## 环境变量

```bash
cp .env.example .env
```

```env
PORT=3000
DATABASE_URL=postgres://postgres:123456@127.0.0.1:55432/todo
APP_ACCESS_KEY=book-todo-dev-key
NODE_ENV=development
WEB_ORIGIN=http://localhost:5173
```

## 安装与启动

```bash
npm install
npm run dev:server
npm run dev:web
```

- Web: http://localhost:5173
- API: http://localhost:3000/api/health
- 开发访问密钥：book-todo-dev-key

开发态下 Vite 会把 /api 代理到 3000 端口。服务启动时会自动创建 TABLE IF NOT EXISTS todos。

## 生产构建

```bash
npm run build
npm run start
```

构建后由 Node 同时托管 API 和前端静态资源：http://服务器IP:3000

## 腾讯云部署提示

1. 单独部署 todo-postgres（或独立 Postgres 实例/库），不要复用其他业务容器数据
2. 配置服务器 .env（使用强 APP_ACCESS_KEY）
3. npm run build && npm run start
4. 安全组放行 3000，或前面加 Nginx
5. 无域名阶段直接用公网 IP 访问
6. 建议再加来源 IP 限制，不只依赖访问密钥

## API

- GET /api/health
- POST /api/auth/verify
- GET /api/todos
- POST /api/todos — body: `{ title, page_key?, scheduled_start?, scheduled_end?, notes? }`
- PATCH /api/todos/:id — body: `{ title?, is_done?, page_key?, sort_order?, scheduled_start?, scheduled_end?, notes? }`（时间字段可 null 清空）
- DELETE /api/todos/:id
- GET /api/prefs — `{ templateMode, lastSpreadId, updatedAt }`
- PATCH /api/prefs — `{ template_mode?, last_spread_id? }`

受保护接口需要请求头：X-Access-Key: <your-key>

时间字段格式为 `HH:mm`（如 `09:00`），起止需成对且结束晚于开始。
