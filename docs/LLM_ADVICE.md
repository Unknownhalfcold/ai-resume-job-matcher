# LLM 建议层

## 目标

LLM 建议层用于增强分析解释，而不是替代规则评分。

当前项目采用：

```text
规则层负责稳定分数
LLM 层负责个性化建议
```

这样可以避免同一份简历在不同时间被模型打出不同分数。

## 为什么不让 LLM 直接打分

LLM 适合理解语义、总结原因和生成表达建议，但它的输出可能受到提示词、模型版本和上下文细节影响。

为了让匹配度分数稳定，当前最终分数仍来自固定公式：

```text
匹配度 = 已匹配关键词权重 / 岗位关键词总权重 * 100
```

LLM 只接收规则分析结果，并输出：

- 岗位核心要求
- 简历证据强度
- 优先修改动作
- STAR 改写示例

## 后端接口

```text
POST /api/ai-suggestions
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

返回示例结构：

```json
{
  "engine": "llm_advice",
  "provider": "openai",
  "model": "gpt-5.5",
  "api_style": "responses",
  "rule_score": 43,
  "rule_score_source": "keyword_weight_formula",
  "advice": {
    "summary": "...",
    "job_focus": [],
    "evidence_review": [],
    "top_actions": [],
    "rewrite_examples": []
  }
}
```

## 本地配置

先安装依赖：

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

在当前 PowerShell 窗口设置 API Key：

```powershell
$env:LLM_API_KEY="你的 API Key"
```

可选：指定供应商、模型和调用方式。

```powershell
$env:LLM_PROVIDER="openai"
$env:LLM_API_STYLE="responses"
$env:LLM_MODEL="gpt-5.5"
```

启动后端：

```powershell
.\.venv\Scripts\python.exe -m uvicorn api.server:app --reload --port 8001
```

打开接口文档：

```text
http://localhost:8001/docs
```

## 第三方低成本 API

很多第三方平台提供 OpenAI-compatible API。此时通常只需要更换环境变量，不需要改前端。

### DeepSeek 示例

```powershell
$env:LLM_PROVIDER="deepseek"
$env:LLM_API_STYLE="chat_completions"
$env:LLM_BASE_URL="https://api.deepseek.com"
$env:LLM_API_KEY="你的 DeepSeek API Key"
$env:LLM_MODEL="deepseek-v4-flash"
.\.venv\Scripts\python.exe -m uvicorn api.server:app --reload --port 8001
```

### 阿里云 DashScope / 通义千问示例

```powershell
$env:LLM_PROVIDER="dashscope"
$env:LLM_API_STYLE="chat_completions"
$env:LLM_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
$env:LLM_API_KEY="你的 DashScope API Key"
$env:LLM_MODEL="qwen-turbo"
.\.venv\Scripts\python.exe -m uvicorn api.server:app --reload --port 8001
```

### Moonshot / Kimi 示例

```powershell
$env:LLM_PROVIDER="moonshot"
$env:LLM_API_STYLE="chat_completions"
$env:LLM_BASE_URL="https://api.moonshot.cn/v1"
$env:LLM_API_KEY="你的 Moonshot API Key"
$env:LLM_MODEL="控制台中可用的 Kimi 模型名"
.\.venv\Scripts\python.exe -m uvicorn api.server:app --reload --port 8001
```

### SiliconFlow 示例

```powershell
$env:LLM_PROVIDER="siliconflow"
$env:LLM_API_STYLE="chat_completions"
$env:LLM_BASE_URL="https://api.siliconflow.cn/v1"
$env:LLM_API_KEY="你的 SiliconFlow API Key"
$env:LLM_MODEL="控制台中可用的模型名"
.\.venv\Scripts\python.exe -m uvicorn api.server:app --reload --port 8001
```

## 环境变量说明

- `LLM_PROVIDER`：供应商名称，只用于健康检查和结果展示。
- `LLM_API_KEY`：第三方或 OpenAI API Key。
- `LLM_BASE_URL`：第三方兼容接口地址。为空时默认使用 OpenAI 官方接口。
- `LLM_MODEL`：模型名称。
- `LLM_API_STYLE`：`responses` 或 `chat_completions`。
- `LLM_MAX_OUTPUT_TOKENS`：限制建议层输出长度，默认 `2200`。
- `LLM_TEMPERATURE`：控制输出随机性，默认 `0.2`。

如果设置了 `LLM_BASE_URL`，系统会默认使用 `chat_completions`，因为大多数第三方兼容 API 优先支持 Chat Completions。

## 前端使用

1. 启动前端 `http://localhost:8000`
2. 启动后端 `http://localhost:8001`
3. 配置 `LLM_API_KEY` 或 `OPENAI_API_KEY`
4. 输入简历和岗位 JD
5. 点击“开始分析”
6. 点击“生成 AI 建议”

如果没有配置 `LLM_API_KEY` 或 `OPENAI_API_KEY`，基础匹配分析仍然可用，但 AI 建议按钮会保持不可用。

## 安全注意

不要把 API Key 写进前端代码、README、截图或 GitHub 仓库。

API Key 只应该放在本地环境变量或未来的云端后端环境变量里。
