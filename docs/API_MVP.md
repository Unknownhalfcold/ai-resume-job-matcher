# API MVP

## 目标

API MVP 用于跑通前后端通信链路。

当前后端先复用已有的规则匹配逻辑，不接入外部大模型。后续接入 LLM 时，会在这个后端服务中完成 API Key 管理、模型调用和结果整合。

当前版本已经预留并实现可选 LLM 建议接口。未配置 `OPENAI_API_KEY` 时，规则分析接口照常可用，LLM 建议接口会提示未配置。

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
  "keyword_count": 16
}
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

## LLM 建议接口

接口：

```text
POST /api/ai-suggestions
```

启用前需要设置：

```powershell
$env:OPENAI_API_KEY="你的 OpenAI API Key"
$env:OPENAI_MODEL="gpt-5.5"
```

请求示例：

```json
{
  "resume": "简历文本",
  "job": "岗位 JD 文本",
  "analysis": {
    "score": 43
  }
}
```

返回内容包括：

- `rule_score`
- `rule_score_source`
- `advice.summary`
- `advice.job_focus`
- `advice.evidence_review`
- `advice.top_actions`
- `advice.rewrite_examples`

## 前端调用方式

本地打开前端：

```powershell
py -m http.server 8000
```

如果后端 `http://localhost:8001` 正在运行，前端会自动使用 API 模式；如果后端未运行，前端会继续使用浏览器本地规则分析。

线上 GitHub Pages 当前仍默认使用浏览器本地分析。
