# LLM 建议层

## 目标

LLM 建议层用于增强分析解释，而不是替代规则评分。

当前项目采用：

```text
规则层负责稳定分数
LLM 层负责个性化建议
```

这样可以避免同一份简历在不同时间被模型打出不同分数。

## 结构化分析口径

当前 LLM 层采用固定 schema 输出，目的是让模型结果更像“分析表格”，而不是自由聊天。

固定边界：

- `rule_score` 是唯一最终匹配分数，LLM 不重算、不覆盖。
- `importance` 只允许 `must_have`、`important`、`nice_to_have`。
- `weight` 使用 1-5，表示岗位要求的重要程度。
- `evidence_score` 使用 0-100，越高表示简历证据越充分。
- `gap_score` 使用 0-100，越高表示缺口越严重。
- LLM 只能分析用户提供的简历和 JD，不访问或抓取第三方网站。
- 通用软性要求采用保护规则：沟通、团队协作、责任心、抗压、学习能力等通常只作为低优先级要求，不能覆盖最终规则分数。

输出会包含：

- `normalized_job`：规范化后的岗位标题、职责、岗位要求和重要程度。
- `normalized_job.technical_questions`：JD 中出现的技术性问题及其考察能力。
- `scoring_rubric`：LLM 对岗位能力维度的解释口径。
- `evidence_review`：简历对每个要求的证据强度。
- `quantified_gaps`：量化后的 gap evidence。
- `top_actions`：优先修改动作。
- `rewrite_examples`：基于真实简历内容的改写示例。

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

## 软性要求保护规则

有些 JD 会写“沟通能力强”“团队协作好”“责任心强”“抗压能力强”。这类要求很重要，但它们往往不能从简历文本中被直接、稳定地证明。

当前处理方式：

- 如果 JD 只是泛泛描述软性要求，LLM 将其标为 `nice_to_have`，权重通常为 1-2。
- LLM 不会因为简历没有直写“沟通能力强”就给高缺口分。
- LLM 会优先寻找间接证据，例如跨部门推进项目、对齐研发设计、组织排期、复盘结果。
- 只有当 JD 明确要求“跨部门推动项目落地”“stakeholder 管理”“项目排期与复盘”等可验证成果时，协作类要求才会被提升为 `important`。
- 软性要求不能改变 `rule_score`，最终匹配分数仍由规则层输出。

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

## JD OCR 清洗接口

```text
POST /api/normalize/job
```

这个接口用于处理截图 OCR 或网页复制产生的混杂文本。它不会直接读取图片，而是接收 OCR 后的文字，并输出结构化 JD：

- `cleaned_job_text`：清洗后的岗位 JD
- `role_title`：岗位名称
- `core_requirements`：核心要求
- `technical_questions`：技术性问题
- `removed_noise_summary`：删除了哪些噪音
- `confidence`：清洗置信度

返回示例结构：

```json
{
  "engine": "llm_advice",
  "provider": "openai",
  "model": "gpt-5.5",
  "api_style": "responses",
  "rule_score": 43,
  "rule_score_source": "keyword_weight_formula",
  "analysis_contract": {
    "final_score_policy": "rule_score is the only final match score; LLM output must not replace it."
  },
  "advice": {
    "summary": "...",
    "normalized_job": {},
    "scoring_rubric": [],
    "evidence_review": [],
    "quantified_gaps": [],
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

## BYOK 模式

BYOK 是 Bring Your Own Key，意思是用户使用自己的 API Key。

当前项目支持两种 LLM Key 来源：

```text
1. 后端环境变量
2. 用户本次请求传入的 llm_config
```

当用户在网页中填写自己的 API Key 时，前端会把它放入本次 `/api/ai-suggestions` 请求：

```json
{
  "llm_config": {
    "provider": "deepseek",
    "api_style": "chat_completions",
    "base_url": "https://api.deepseek.com",
    "api_key": "用户自己的 API Key",
    "model": "deepseek-v4-flash"
  }
}
```

安全边界：

- API Key 不写入 GitHub。
- API Key 不写入数据库。
- API Key 不写入浏览器 localStorage。
- API Key 只用于当前这次后端请求。
- 页面刷新后，前端输入框会清空。

后端收到 `llm_config` 后，会优先使用用户本次请求的配置；如果没有传入，则回退到服务器环境变量。

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
- `LLM_MAX_OUTPUT_TOKENS`：限制建议层输出长度，默认 `3800`。
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
