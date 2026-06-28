# Cloud Deployment

本阶段目标：让 GitHub Pages 前端连接云端 FastAPI 后端，并用数据库保存基础账户数据。

## 当前架构

```text
GitHub Pages 前端
  ↓
阿里云 ECS FastAPI 后端
  ↓
Neon Postgres 数据库
  ↓
可选：第三方 LLM API
```

## 新增概念

- `数据库`：网站的长期记忆。启用 Supabase 后，Supabase 管理邮箱和登录 session，Neon 只保存业务用户映射、分析摘要和限流记录。
- `密码哈希`：不是保存真实密码，而是保存不可逆的密码指纹。
- `Postgres`：真实网站常用的关系型数据库。
- `DATABASE_URL`：后端连接数据库用的地址，属于密钥，不要写进 GitHub。
- `CORS`：浏览器安全规则。它决定 GitHub Pages 前端是否能请求你的云端 API。

## 本地运行

如果没有设置 `DATABASE_URL`，后端会自动使用本地 SQLite 文件 `local_app.db`。

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn api.server:app --reload --port 8001
```

测试健康检查：

```powershell
Invoke-RestMethod http://localhost:8001/health
```

你应该能看到：

```json
{
  "status": "ok",
  "database_type": "sqlite"
}
```

## 账户接口

注册：

```text
POST /api/auth/register
```

登录：

```text
POST /api/auth/login
```

查看当前用户：

```text
GET /api/auth/me
Authorization: Bearer <access_token>
```

退出：

```text
POST /api/auth/logout
Authorization: Bearer <access_token>
```

## 部署步骤

### 1. 创建 Neon Postgres

1. 打开 Neon Dashboard。
2. 创建一个 Postgres project。
3. 点击 `Connect`。
4. 复制连接字符串，形状类似：

```text
postgresql://user:password@host/dbname?sslmode=require
```

这串地址后面会放进云端后端的 `DATABASE_URL` 环境变量。

### 2. 部署云端 Web Service

当前生产后端使用阿里云 ECS。早期版本也保留了 `render.yaml`，如果后续继续使用 Render 或其他平台，可以复用同一套启动命令。

方式 A：使用已有 `render.yaml`

1. 把本仓库推送到 GitHub。
2. 打开云平台控制台。
3. New → Blueprint。
4. 选择这个 GitHub repository。
5. 云平台读取或参考根目录的 `render.yaml`。
6. 填入 `DATABASE_URL` 等 `sync: false` 的密钥。

方式 B：手动创建 Web Service

1. New → Web Service。
2. 选择 GitHub 仓库。
3. Build Command：

```text
pip install -r requirements.txt
```

4. Start Command：

```text
uvicorn api.server:app --host 0.0.0.0 --port $PORT
```

### 3. 配置云端后端环境变量

必填：

```text
DATABASE_URL=<Neon connection string>
ALLOWED_ORIGINS=https://www.jobmatcher.top,https://jobmatcher.top,https://www.jobmatcher.win,https://jobmatcher.win,https://unknownhalfcold.github.io,http://localhost:8000,http://127.0.0.1:8000
AUTH_TOKEN_TTL_DAYS=14
```

后端代码会把 `DEFAULT_ALLOWED_ORIGINS` 和 `ALLOWED_ORIGINS` 合并。即使 ECS 上的环境变量暂时漏掉 `jobmatcher.top`，默认白名单也会保留新旧前端域名；但生产环境仍建议把 ECS 的 `ALLOWED_ORIGINS` 显式更新为上面的完整列表。

可选，启用默认 LLM：

```text
LLM_PROVIDER=deepseek
LLM_API_STYLE=chat_completions
LLM_BASE_URL=https://api.deepseek.com
LLM_API_KEY=<your api key>
LLM_MODEL=deepseek-v4-flash
LLM_ANALYSIS_TIMEOUT_SECONDS=90
LLM_THINKING_MODE=enabled
LLM_MAX_OUTPUT_TOKENS=2000
LLM_RETRY_ON_SCHEMA_ERROR=false
MAX_LLM_CONCURRENCY=10
RATE_LIMIT_SALT=<long random string>
```

`LLM_THINKING_MODE` 是用户未明确选择时的默认值。前端开关只会为单次 `/api/ai-suggestions` 请求覆盖这个默认值，不会改变云端环境变量。

启用 Supabase 邮箱登录：

```text
SUPABASE_URL=https://你的-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable key>
SUPABASE_REQUIRE_EMAIL_CONFIRMATION=true
```

`SUPABASE_PUBLISHABLE_KEY` 可以提供给浏览器；`service_role` 和 secret key 不可以。前端通过后端 `/api/auth/config` 获取公开配置，所以只需在云端后端保存一次。

Supabase Dashboard 还需要设置：

1. Authentication → Providers → Email：启用 Email 和 Confirm email。
2. Authentication → URL Configuration：Site URL 使用 `https://www.jobmatcher.top`。
3. Redirect URLs 添加 `https://www.jobmatcher.top/**`、`https://jobmatcher.top/**`、`https://www.jobmatcher.win/**` 与 `https://jobmatcher.win/**`。
4. 正式开放注册前配置 Custom SMTP。

### 4. 测试云端后端

部署完成后，打开：

```text
https://api.jobmatcher.top/health
```

如果成功，会看到：

```json
{
  "status": "ok",
  "database_type": "postgres",
  "auth_provider": "supabase",
  "supabase_configured": true
}
```

### 5. 让 GitHub Pages 连接云端 API

临时测试可以这样打开：

```text
https://unknownhalfcold.github.io/ai-resume-job-matcher/?api=https://api.jobmatcher.top
```

确认可用后，再把 `assets/config.js` 里的 `API_BASE_URL` 设置为你的云端后端地址，这样用户不需要手动加 `?api=`。当前正式 API 地址为 `https://api.jobmatcher.top`。

## 重要限制

- Supabase Auth 已支持邮箱验证和找回密码；生产邮件必须配置 Custom SMTP。
- 登录用户完成分析后只保存分数、优势、缺口、建议和创建时间；默认不保存完整简历或岗位 JD，游客模式不会保存历史。
- API Key 和 LLM Base URL 只配置在云端后端环境变量，不能写入前端或由用户请求传入。
- LLM 日志只记录输入长度、状态和耗时，不记录简历或 JD 正文。
- 生产环境建议把前端 token 改成后端 `HttpOnly Cookie`。
- 正式上线必须使用 HTTPS API 域名，避免浏览器拦截 HTTPS 页面调用 HTTP API。
