# API MVP

## 目标

API MVP 用于跑通前后端通信链路。

当前后端先复用已有的规则匹配逻辑，不接入外部大模型。后续接入 LLM 时，会在这个后端服务中完成 API Key 管理、模型调用和结果整合。

## 架构

```text
前端网页
  ↓
FastAPI 后端
  ↓
规则匹配逻辑
  ↓
返回 JSON 分析结果
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

## 前端调用方式

本地打开前端：

```powershell
py -m http.server 8000
```

如果后端 `http://localhost:8001` 正在运行，前端会自动使用 API 模式；如果后端未运行，前端会继续使用浏览器本地规则分析。

线上 GitHub Pages 当前仍默认使用浏览器本地分析。
