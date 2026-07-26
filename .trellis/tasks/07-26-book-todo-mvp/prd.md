# Book-style personal Todo MVP

## Goal

为个人打造一个可部署到腾讯云的 Todo 网站：视觉上像一本可左右翻页的书，功能先做基础待办，数据持久化到 PostgreSQL，多台 PC 通过服务器 IP 访问同一份数据，并用访问密钥保护。

## Background

- 仓库目前几乎为空，仅有 Trellis 脚手架。
- 用户自有腾讯云服务器，无域名。
- 服务器已有 PostGIS/Postgres Docker（`renti-postgres`）。
- 本地开发 Postgres 可用：
  - host: `127.0.0.1:5432`
  - database: `postgres`（开发期可新建 `todo` 库）
  - username: `postgres`
  - password: `123456`
- 用户明确偏好：
  - 前端 React
  - 后端 Node（不用 Python/Java）
  - 美观优先，书本翻页交互
  - 功能先基础
  - 增加访问密钥

## Requirements

### Product

- 网站整体呈现“书本”隐喻，支持左滑/右滑或左右翻页。
- 整体简洁，阅读感强，不是后台表格风格。
- 基础 Todo：
  - 新增
  - 编辑标题
  - 标记完成 / 取消完成
  - 删除
  - 列表展示
  - 基础筛选：全部 / 未完成 / 已完成
- 多 PC 访问同一服务器后看到同一份数据。
- 无域名阶段通过 `http://服务器IP:端口` 访问。
- 需要访问密钥（access key）保护，避免公网裸奔。

### Technical

- 前端：React + TypeScript + Vite
- 动效：framer-motion 或同等轻量方案，实现克制的书页翻页
- 后端：Node.js + Fastify（或 Express，默认 Fastify）
- 数据库：PostgreSQL
- 本地连接默认使用用户提供的本机 Postgres
- 生产可复用服务器现有 Postgres，建议独立库 `todo`
- 后端同时提供 API 与前端静态资源托管，降低部署复杂度
- 配置通过环境变量注入，不把真实密码提交进仓库

### Auth

- MVP 不做完整注册登录体系
- 使用单一访问密钥：
  - 首次打开站点输入密钥
  - 前端本地记住会话（如 sessionStorage / localStorage）
  - 所有 API 请求携带密钥
  - 后端校验 `APP_ACCESS_KEY`
- 错误密钥返回 401

## Out of Scope (MVP)

- 多用户账号体系
- OAuth / 邮箱注册
- 标签、优先级、截止日期复杂系统
- 日历视图
- 附件上传
- 协作分享
- 域名 / HTTPS 自动证书
- 超真实 3D 实体书引擎
- 移动端专项优化可作为加分，但不是第一优先

## UX Outline

### Pages / Spreads

1. **封面**
   - 书名（默认：我的待办）
   - 日期
   - 打开按钮
   - 若未授权，先进入密钥输入

2. **今日页（双页）**
   - 左页：未完成
   - 右页：已完成或快速记录

3. **清单页**
   - 全部待办 + 筛选

### Interaction

- 左右箭头翻页
- 键盘左右方向键
- 鼠标/触控左右滑动
- 完成项使用淡淡划线，而不是刺眼删除线堆叠

### Visual

- 纸色背景、墨色文字、克制书签色点缀
- 大留白、低信息密度
- 动效流畅但不花哨

## Data Model

```sql
CREATE TABLE todos (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT FALSE,
  page_key TEXT NOT NULL DEFAULT 'inbox',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL
);
```

## API

- `GET /api/health`
- `POST /api/auth/verify` — 校验访问密钥
- `GET /api/todos`
- `POST /api/todos`
- `PATCH /api/todos/:id`
- `DELETE /api/todos/:id`

所有 Todo API 需要访问密钥。

## Local Dev Defaults

```env
PORT=3000
DATABASE_URL=postgres://postgres:123456@127.0.0.1:5432/todo
APP_ACCESS_KEY=<user-chosen-secret>
```

说明：本地密码仅用于开发环境配置示例，正式仓库使用 `.env.example`，真实值放 `.env`（gitignore）。

## Acceptance Criteria

- [x] 本地可启动前端书本 UI 与 Node API
- [x] 可连接本地 PostgreSQL 完成 Todo CRUD
- [x] 未提供正确访问密钥时无法读写 Todo
- [x] 提供正确密钥后可新增/编辑/完成/删除
- [x] 支持左右翻页浏览封面与内容页
- [x] 构建后可由 Node 单进程托管静态资源 + API
- [x] README 说明本地启动、环境变量、部署到腾讯云的基本步骤
- [x] 不将数据库密码或访问密钥提交到 git

## Open Decisions

无阻塞性开放决策。以下为已确认默认：

- 存储：PostgreSQL，不用 JSON/SQLite
- 后端：Node
- 鉴权：单访问密钥
- UI：书本翻页，美观优先
- 功能：基础 Todo
- 访问：无域名，IP + 端口

## Notes

- 服务器现有库名为 `renti`，MVP 建议新建 `todo` 库，避免耦合。
- 若创建新库不便，可退化为在现有库中建 `todos` 表，但优先独立库。
- 本任务为复杂全栈任务，需 `design.md` + `implement.md`。
