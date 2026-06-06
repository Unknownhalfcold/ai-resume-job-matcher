# API MVP

## 目标

API MVP 用于跑通前后端通信链路。

当前后端先复用已有的规则匹配逻辑，不接入外部大模型。后续接入 LLM 时，会在这个后端服务中完成 API Key 管理、模型调用和结果整合。

当前版本已经预留并实现可选 LLM 建议接口。未配置 `LLM_API_KEY` 或 `OPENAI_API_KEY` 时，规则分析接口照常可用，LLM 建议接口会提示未配置。

## 架构

```text
前端网页
  ↓
FastAPI 后端
  ↓
规则匹配逻辑
  ↓
返回 JSON 分析结果

可选：

规则匹配结果
  ↓
LLM 建议层
  ↓
返回岗位重点、证据强度、修改动作和改写示例
```

## 安装依赖

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## 启动后端

```powershell
.\.venv\Scripts\python.exe -m uvicorn api.server:app --reload --port 8001
```

后端地址：

```text
http://localhost:8001
```

## 健康检查

```powershell
Invoke-RestMethod http://localhost:8001/health
```

返回示例：

```json
{
  "status": "ok",
  "engine": "rule_based",
  "keyword_count": 16,
  "database_type": "sqlite"
}
```

## 账户接口

当前账户系统用于打通数据库和后续用户历史记录。密码不会明文保存，后端只保存密码哈希。

注册：

```text
POST /api/auth/register
```

登录：

```text
POST /api/auth/login
```

请求示例：

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

返回示例：

```json
{
  "access_token": "...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "email": "user@example.com"
  }
}
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

## 分析接口

接口：

```text
POST /api/analyze
```

请求示例：

```json
{
  "resume": "简历文本",
  "job": "岗位 JD 文本"
}
```

返回内容包括：

- `score`
- `score_details`
- `matched_keywords`
- `missing_keywords`
- `category_summary`
- `priority_gaps`
- `suggestion_items`

## 简历文件提取接口

接口：

```text
POST /api/extract/resume
```

支持：

- `.docx`
- 普通可复制文本的 `.pdf`

当前不直接支持扫描版 PDF OCR。扫描版 PDF 需要后续加入 OCR 流程。

返回内容包括：

- `filename`
- `text`
- `character_count`
- `warnings`

## LLM 建议接口

接口：

```text
POST /api/ai-suggestions
```

启用前需要设置：

```powershell
$env:LLM_API_KEY="你的 API Key"
$env:LLM_MODEL="gpt-5.5"
```

如果使用第三方 OpenAI-compatible API，再设置：

```powershell
$env:LLM_PROVIDER="deepseek"
$env:LLM_API_STYLE="chat_completions"
$env:LLM_BASE_URL="https://api.deepseek.com"
$env:LLM_MODEL="deepseek-v4-flash"
```

请求示例：

```json
{
  "resume": "简历文本",
  "job": "岗位 JD 文本",
  "analysis": {
    "score": 43
  },
  "llm_config": {
    "provider": "deepseek",
    "api_style": "chat_completions",
    "base_url": "https://api.deepseek.com",
    "api_key": "用户自己的 API Key",
    "model": "deepseek-v4-flash"
  }
}
```

`llm_config` 是可选字段。传入时优先使用用户本次请求的配置；不传入时使用后端环境变量。

返回内容包括：

- `rule_score`
- `rule_score_source`
- `advice.summary`
- `advice.normalized_job`
- `advice.scoring_rubric`
- `advice.evidence_review`
- `advice.quantified_gaps`
- `advice.top_actions`
- `advice.rewrite_examples`

## LLM JD 清洗接口

接口：

```text
POST /api/normalize/job
```

用途：

- 接收 OCR 或网页复制得到的混杂文本
- 删除按钮、导航、公司介绍、福利待遇等无关内容
- 保留岗位职责、岗位要求 / 任职要求、技能要求、加分项
- 单独提取 JD 中的技术问题
- 后端会先用规则关键词提取 JD 候选文本，再交给 LLM 做结构化清洗

请求示例：

```json
{
  "raw_text": "首页 登录 岗位职责：负责 AI 产品需求分析 任职要求：熟悉 RAG 技术问题：你如何理解 RAG？ 公司介绍..."
}
```

返回内容包括：

- `normalized_job.cleaned_job_text`
- `normalized_job.role_title`
- `normalized_job.core_requirements`
- `normalized_job.technical_questions`
- `normalized_job.confidence`

## JD 文档提取接口

接口：

```text
POST /api/extract/job
```

用途：

- 提取 DOCX 或可复制文本 PDF 中的岗位描述
- 前端可以将多个文档和截图文本合并后，再调用 `/api/normalize/job`

## 前端调用方式

本地打开前端：

```powershell
py -m http.server 8000
```

如果后端 `http://localhost:8001` 正在运行，前端会自动使用 API 模式；如果后端未运行，前端会继续使用浏览器本地规则分析。

线上 GitHub Pages 当前仍默认使用浏览器本地分析。
