# Book Todo 使用与部署说明

Book Todo 是一个书本风格的共享任务书架。访客先用书房密码进入受保护的书架，再用每本任务书自己的密码解锁；书内继续提供按日期组织的待办、时间线、总结、目标和备注。

## 主要功能

- 书房密码与书本密码双层解锁
- 创建任意数量的独立任务书
- 书架每页显示 12 本书
- 按日期保存独立工作区
- 左滑查看昨天，右滑查看明天
- 支持日期按钮和键盘方向键切换
- 待办新增、编辑、完成和删除
- 自定义时间选择器与时间线
- 每日总结、目标和备注自动保存
- PostgreSQL 持久化存储
- 桌面端和移动端响应式书本界面

## 双层密码与使用流程

Book Todo 不创建用户账户。访问边界直接落在书房和任务书上：

1. 输入 `.env` 中的 `APP_ACCESS_KEY` 进入私人书房。
2. 在书架创建任务书时设置名称和至少 8 个字符的独立密码。
3. 点击任意任务书并重新输入该书密码后，才会加载它的待办和日记。
4. `返回书架` 会先保存当前日记，只清除书本会话；再次打开任何书都要重新输入书本密码。
5. `退出书房` 会同时清除书房密码和书本会话。

书架 API 默认每页 12 本，单次最多 24 本。任务书名称去除首尾空白后按大小写不敏感规则保持唯一。当前版本不提供改名、删除、修改或找回书本密码的界面。

## 技术栈

| 模块 | 技术 |
|---|---|
| 前端 | React 19、TypeScript、Vite、Framer Motion |
| 后端 | Node.js、Fastify、TypeScript、Zod |
| 数据库 | PostgreSQL 16 |
| 数据访问 | `pg`，不使用 ORM |

## 运行要求

- Node.js 20 LTS 或更高版本
- npm 10 或更高版本
- PostgreSQL 14 或更高版本，推荐 PostgreSQL 16

安装依赖：

```bash
npm ci
```

首次安装且没有 `package-lock.json` 时，可使用 `npm install`。

## 环境变量

复制环境变量示例：

```bash
cp .env.example .env
```

开发环境示例：

```env
PORT=3000
DATABASE_URL=postgres://postgres:123456@127.0.0.1:55432/todo
APP_ACCESS_KEY=change-me-to-a-strong-secret
NODE_ENV=development
WEB_ORIGIN=http://localhost:5173
```

生产环境示例：

```env
PORT=3000
DATABASE_URL=postgres://book_todo:strong-database-password@127.0.0.1:5432/book_todo
APP_ACCESS_KEY=replace-with-a-long-random-secret
NODE_ENV=production
WEB_ORIGIN=https://todo.example.com
```

| 变量 | 必填 | 说明 |
|---|---|---|
| `PORT` | 否 | 服务端口，默认 `3000` |
| `DATABASE_URL` | 是 | PostgreSQL 连接地址 |
| `APP_ACCESS_KEY` | 是 | 外层书房密码，也是迁移后的默认书本初始密码；请使用强随机值 |
| `NODE_ENV` | 否 | `development`、`test` 或 `production` |
| `WEB_ORIGIN` | 否 | 开发环境前端地址，默认 `http://localhost:5173` |

不要将生产 `.env`、数据库密码或访问密钥提交到 Git 仓库。

## 数据库准备

### 使用已有 PostgreSQL

应用可以创建表，但不能自动创建 PostgreSQL 数据库和用户。请先以管理员身份执行：

```sql
CREATE USER book_todo WITH PASSWORD 'replace-with-a-strong-password';
CREATE DATABASE book_todo
  WITH OWNER = book_todo
       ENCODING = 'UTF8';
```

如果数据库已经存在，可授权应用用户连接：

```sql
GRANT CONNECT ON DATABASE book_todo TO book_todo;
\c book_todo
GRANT USAGE, CREATE ON SCHEMA public TO book_todo;
```

然后配置连接地址：

```env
DATABASE_URL=postgres://book_todo:replace-with-a-strong-password@127.0.0.1:5432/book_todo
```

密码含有 `@`、`:`、`/`、`#` 等字符时，需要进行 URL 编码。

### 使用项目 Docker PostgreSQL

根目录提供了 `docker-compose.yml`：

```bash
docker compose up -d todo-postgres
```

默认配置：

| 配置 | 值 |
|---|---|
| 容器名 | `todo-postgres` |
| 主机端口 | `55432` |
| 数据库 | `todo` |
| 用户 | `postgres` |
| 本地默认密码 | `123456` |

默认密码只适合本地开发。生产环境必须通过 `TODO_POSTGRES_PASSWORD` 设置强密码。

## 初始化数据库表

推荐执行：

```bash
npm run db:init
```

也可以直接执行 SQL：

```bash
psql "$DATABASE_URL" -f apps/server/src/sql/001_init.sql
```

SQL 文件位于：

```text
apps/server/src/sql/001_init.sql
```

脚本可以重复执行，不会删除已有业务数据。它负责创建或补齐以下表：

### `books`

保存任务书目录、大小写不敏感的唯一名称、`scrypt` 密码哈希和创建时间。接口不会返回 `password_hash`。

### `todos`

保存按日期归属的待办和时间线项目，主要字段包括：

- `id`：UUID 主键
- `book_id`：所属任务书，删除任务书时级联清理
- `title`：待办标题
- `date_key`：工作区日期
- `is_done`：完成状态
- `scheduled_start`、`scheduled_end`：时间线起止时间
- `sort_order`：排序值
- `created_at`、`updated_at`、`completed_at`：时间记录

### `daily_notes`

保存每天的书写内容：`summary`、`goals`、`notes` 和更新时间，以 `(book_id, date_key)` 为联合主键。

### `user_prefs`

保存每本任务书的界面偏好，以 `(book_id, id)` 为联合主键，并在每本书内保留 `id = 1` 的约定。

### 旧数据迁移

首次运行新版 `npm run db:init` 时，旧的单书数据会被分配到固定 ID `00000000-0000-4000-8000-000000000001`、名称为 `我的待办书` 的默认书。它的初始书本密码等于迁移当时的 `APP_ACCESS_KEY`，数据库只保存同样的 `scrypt` 哈希，不保存明文。初始化可重复运行，不会重置已有默认书密码。

应用启动时也会执行安全的增量建表逻辑，但生产部署仍建议显式执行 `npm run db:init`，让数据库错误在重启服务前暴露。

## 本地开发

1. 启动 PostgreSQL。
2. 配置 `.env`。
3. 初始化数据库表。
4. 启动开发服务。

```bash
npm run db:init
npm run dev
```

访问地址：

- 前端：`http://localhost:5173`
- API 健康检查：`http://localhost:3000/api/health`

先使用 `.env` 中的 `APP_ACCESS_KEY` 进入书房。首次迁移后，`我的待办书` 也使用同一个值作为初始书本密码。

Windows + WSL Docker 环境也可以运行：

```powershell
npm run local
```

## 生产构建与启动

```bash
npm ci
npm run build
npm run db:init
npm run start
```

构建输出：

- 前端：`apps/web/dist`
- 后端：`apps/server/dist`

生产模式下 Fastify 同时提供 API 和前端静态文件，默认地址为 `http://服务器地址:3000`。

建议使用 Nginx 提供 HTTPS，不要将 PostgreSQL 端口暴露到公网。

## Jenkins 部署顺序

Jenkins 服务器需要安装 Node.js，并能够连接 PostgreSQL。推荐 Pipeline：

```text
Checkout
  -> npm ci
  -> npm run build
  -> npm run db:init
  -> 重启 Book Todo 服务
  -> 检查 /api/health
```

通过 Jenkins Credentials 管理 `DATABASE_URL` 和 `APP_ACCESS_KEY`，不要把生产密钥写入 Jenkinsfile。数据库初始化失败时必须终止部署。

本机源码部署完成后检查：

```bash
curl http://127.0.0.1:3000/api/health
```

正常响应：

```json
{
  "ok": true,
  "db": true,
  "env": "production"
}
```

建议使用 systemd、PM2 或 Docker 管理 Node.js 进程，避免 Jenkins 任务结束后应用进程退出。

### 当前生产服务器配置

本仓库提供以下生产部署文件：

- `Dockerfile`：构建前端和后端运行镜像
- `docker-compose.prod.yml`：只部署 Book Todo，不重复创建 PostgreSQL
- `Jenkinsfile`：创建数据库、执行迁移、部署和健康检查

Book Todo 不加入 `renti-agent` 的 Docker 网络，也不复用其 Nginx。容器使用 Linux host 网络，仅通过宿主机回环地址访问已有 PostgreSQL：

```text
PostgreSQL container: renti-postgres
Book Todo database: book_todo
Book Todo container: book-todo
Book Todo port: 28889
Database endpoint used by Book Todo: 127.0.0.1:5432
```

这种方式不会修改 `renti-nginx`、`renti_renti-network`、`renti-agent` 的容器或镜像。两套应用只共享 PostgreSQL 服务进程，并使用不同的逻辑数据库。

部署前确认端口未占用，并确认 PostgreSQL 容器健康：

```bash
sudo ss -lntp | grep ':28889 ' || echo '28889 available'
docker inspect --format '{{.State.Health.Status}}' renti-postgres
```

在 Jenkins 中创建两个 Secret text Credential：

| Credential ID | 值 |
|---|---|
| `book-todo-database-url` | `postgres://postgres:<数据库密码>@127.0.0.1:5432/book_todo` |
| `book-todo-access-key` | Book Todo 页面使用的强随机解锁密钥 |

新建 Jenkins Pipeline 时选择：

```text
Definition: Pipeline script from SCM
SCM: Git
Repository: https://github.com/QiaoSeFenNv/bookTodo.git
Branch: */master
Script Path: Jenkinsfile
```

首次构建时，Pipeline 会按需创建 `book_todo` 数据库。随后每次构建都会执行可重复的表结构迁移，再替换应用容器。

部署完成后访问：

```text
http://<服务器公网 IP>:28889
```

应用按来源 IP 对书房密码验证和书本解锁分别限制为每分钟 5 次，超限返回 HTTP `429`；普通待办和日记请求不共享密码尝试计数器。错误密码不会停止共享服务。服务器安全组或防火墙只需放行 TCP `28889`，不要开放 PostgreSQL 的 `5432` 端口。

密码通过请求体传输。公网部署必须使用 HTTPS，否则书房密码和书本密码都可能在传输途中泄露；不要修改当前服务 `renti-agent` 使用的 Nginx 配置来完成本次部署。

## 数据备份

部署或升级前，尤其是首次执行多书迁移前，必须先备份：

```bash
pg_dump "$DATABASE_URL" > book_todo_backup.sql
```

恢复：

```bash
psql "$DATABASE_URL" < book_todo_backup.sql
```

一旦第二本书写入数据，不要再运行旧版单书应用。旧版查询没有 `book_id` 条件，会混合不同书的数据；完整回滚必须先停止应用，再恢复迁移前的数据库备份。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 启动前端和后端开发服务 |
| `npm run build` | 构建前端和后端 |
| `npm run db:init` | 创建或升级数据库表结构 |
| `npm run start` | 启动生产服务 |
| `npm run check:multi-book` | 验证多书 API、数据隔离和迁移一致性 |
| `npm run check:ui` | 执行浏览器与 API 验收检查 |

## 常见问题

### 提示 `DATABASE_URL is required`

确认根目录存在 `.env`，并且 Jenkins 或运行用户能够读取环境变量。

### 数据库连接被拒绝

检查 PostgreSQL 服务、主机、端口、防火墙和用户权限：

```bash
pg_isready -d "$DATABASE_URL"
```

### 页面可以打开但无法保存

检查：

1. 书房页面输入的值是否与 `APP_ACCESS_KEY` 一致。
2. 是否为当前选中的任务书输入了正确的书本密码。
3. `/api/health` 是否返回 `db: true`。
4. PostgreSQL 用户是否有表的读写权限。
5. 日志中是否存在 `unauthorized`、`book_unauthorized` 或数据库错误。

## 项目目录

```text
apps/
  web/                         React 前端
  server/                      Fastify 后端
    src/sql/001_init.sql       PostgreSQL 初始化脚本
scripts/                       本地启动和验收脚本
docker-compose.yml             本地 PostgreSQL 配置
.env.example                   环境变量示例
```
