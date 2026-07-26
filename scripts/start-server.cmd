@echo off
cd /d %~dp0..
set PORT=3000
set DATABASE_URL=postgres://postgres:123456@127.0.0.1:55432/todo
set APP_ACCESS_KEY=book-todo-dev-key
set NODE_ENV=development
set WEB_ORIGIN=http://localhost:5173
"C:\Program Files\nodejs\node.exe" .\node_modules\tsx\dist\cli.mjs apps\server\src\index.ts

