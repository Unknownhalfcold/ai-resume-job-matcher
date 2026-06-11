# LLM 建议层

## 目标

LLM 建议层用于理解语义、经历深度和简历质量；后端函数统一计算最终分。

当前项目采用：

```text
规则层负责关键词覆盖
LLM 层负责语义、经历、质量和个性化建议
后端负责加权、惩罚和分数上限
```

这样可以避免同一份简历在不同时间被模型打出不同分数。

## 结构化分析口径

当前 LLM 层采用固定 schema 输出，目的是让模型结果更像“分析表格”，而不是自由聊天。

对兼容 Chat Completions 的第三方模型，模型先返回精简的评分证据、岗位要求和优先动作，后端再确定性地补齐 Gap、评分口径、网申边界和结果页结构。这样可以减少延迟和 JSON 截断，同时不把最终分数交给模型。

当服务端使用 DeepSeek 时，后端会显式关闭 thinking mode。评分接口需要稳定、快速地返回结构化 JSON，不需要额外的长链路推理；最终分数仍由后端的确定性公式、惩罚函数和分数上限规则计算。

到岗天数、实习时长、期望薪资、工作地点和身份类网申字段会保留为申请提醒，但不会进入核心技能惩罚或分数上限计算。规则层还会使用包含关系连接关键词和 LLM 要求，例如已匹配 `Excel` 时，可视为“高级 Excel 技能”已有基础证据。

固定边界：

- `rule_score` 是可复现的关键词分，不是最终总分。
- LLM 只输出 `semantic_match_score`、`experience_match_score` 和 `resume_quality_score` 三个 0-100 分项。
- 最终分由后端固定函数计算，LLM 不得自行输出或覆盖。
- `importance` 只允许 `must_have`、`important`、`nice_to_have`。
- `weight` 使用 1-5，表示岗位要求的重要程度。
- `evidence_score` 使用 0-100，越高表示简历证据越充分。
- `gap_score` 使用 0-100，越高表示缺口越严重。
- LLM 只能分析用户提供的简历和 JD，不访问或抓取第三方网站。
- 通用软性要求采用保护规则：沟通、团队协作、责任心、抗压、学习能力等通常只作为低优先级要求，不能覆盖最终规则分数。
- 证书或奖项无法核验、与岗位相关性不足时，不允许进入最终综合分。
- 公司名称、规模和招聘历史只能使用用户材料中明确提供的信息，不允许模型编造外部招聘案例。

输出会包含：

- `normalized_job`：规范化后的岗位标题、职责、岗位要求和重要程度。
- `score_assessment`：语义、经历和简历质量三个受限分项及理由。
- `normalized_job.technical_questions`：JD 中出现的技术性问题及其考察能力。
- `scoring_rubric`：LLM 对岗位能力维度的解释口径。
- `evidence_review`：简历对每个要求的证据强度。
- `quantified_gaps`：量化后的 gap evidence。
- `top_actions`：优先修改动作。
- `rewrite_examples`：基于真实简历内容的改写示例。
- `credential_review`：证书与获奖的岗位相关性、可信度和有限加成。
- `company_role_context`：当前 JD 提供的公司与岗位语境。
- `application_form_guidance`：简历内容和网申表单字段的边界。
- `hr_perspective`：模拟目标岗位 HR 的初筛关注点。
- `benchmark_comparison`：仅在后端提供有来源的匿名聚合数据时展示录用背景基准。

## 为什么不让 LLM 直接决定最终分

LLM 适合理解语义、总结原因和生成表达建议，但它的输出可能受到提示词、模型版本和上下文细节影响。

为了让匹配度分数稳定，当前使用固定九步流程：

```text
关键词 → 语义 → 经历 → 简历质量 → 加分项
→ 加权基础分 → 核心技能惩罚 → 分数上限 → 最终分
```

加权基础分：

```text
关键词 25% + 语义 30% + 经历 30% + 简历质量 15%
```

## 软性要求保护规则

有些 JD 会写“沟通能力强”“团队协作好”“责任心强”“抗压能力强”。这类要求很重要，但它们往往不能从简历文本中被直接、稳定地证明。

当前处理方式：

- 如果 JD 只是泛泛描述软性要求，LLM 将其标为 `nice_to_have`，权重通常为 1-2。
- LLM 不会因为简历没有直写“沟通能力强”就给高缺口分。
- LLM 会优先寻找间接证据，例如跨部门推进项目、对齐研发设计、组织排期、复盘结果。
- 只有当 JD 明确要求“跨部门推动项目落地”“stakeholder 管理”“项目排期与复盘”等可验证成果时，协作类要求才会被提升为 `important`。
- 泛化软性要求不能被当作缺失核心技能，也不能触发高额惩罚。

## 最终综合分

AI 建议层返回受限分项，后端再执行：

```text
最终分 = 加权基础分 + 证书/奖项加分 - 核心技能惩罚
最终分 = min(最终分, 分数上限)
```

约束：

- 证书和获奖总加成最多 5 分。
- 与岗位相关性低于 60，或者可信度为 `unverified` 时，加成为 0。
- 缺少一项核心要求时最高 69 分；缺少两项及以上时最高 59 分。
- 语义分低于 30 时最高 49 分；经历分低于 35 时最高 64 分。
- 结果页会展示九个步骤，便于用户理解分数来源。

## 公司和招聘案例边界

当前模型只能根据用户上传的 JD 和简历判断公司名称、岗位名称和公司规模。它不会实时抓取招聘网站，也不能声称知道该公司往年的真实录用案例。

如果后续需要根据具体公司的历史招聘案例判断，需要新增：

- 有来源的公司与岗位招聘案例数据集
- 定期更新的数据采集或人工维护流程
- RAG 检索层，用于把与当前公司和岗位相关的历史案例传给 LLM
- 来源日期、链接和可信度标记

## 网申表单边界

AI 不会默认建议把这些通常由网申表单单独收集的字段重复写进简历正文：

- 可到岗日期
- 每周实习天数
- 可实习月份
- 期望薪资
- 工作地点偏好
- 身份证号
- 网申来源
- 是否接受调剂

如果 JD 明确要求在简历中注明，则以 JD 为准。姓名、常用邮箱和联系电话仍可保留在简历页眉。

## 后端接口

```text
POST /api/ai-suggestions
```

请求示例：

```json
{
  "resume": "简历文本",
  "job": "岗位 JD 文本"
}
```

接口拒绝额外字段。用户不能传入 `api_key`、`base_url`、模型名或前端计算的分析结果；后端会自行运行规则层并从服务器环境变量读取 LLM 配置。

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

## 服务端安全调用

当前版本不支持浏览器 BYOK。统一调用链为：

```text
GitHub Pages -> Render Web Service -> Render Environment Variables -> LLM
```

安全边界：

- 前端只发送简历和 JD。
- `LLM_API_KEY`、`LLM_BASE_URL`、模型名只在 Render 环境变量中配置。
- 请求模型禁止 `api_key`、`base_url`、`llm_config` 等额外字段。
- API Key 不写入 GitHub、浏览器或数据库。
- 日志只记录输入字符数、状态和耗时。
- Neon 只保存分析摘要和限流记录，默认不保存完整简历或 JD。

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
- `LLM_MAX_OUTPUT_TOKENS`：限制建议层输出长度，默认 `5200`。
- `LLM_TEMPERATURE`：控制输出随机性，默认 `0.2`。
- `LLM_REQUEST_TIMEOUT_SECONDS`：单次模型调用超时，生产环境默认 `60`。
- `MAX_LLM_CONCURRENCY`：同时执行的模型请求数，默认 `10`。
- `RATE_LIMIT_SALT`：哈希客户端 IP 的随机盐，生产环境必须设置。

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

不要把真实 API Key 写进前端代码、README、截图或 GitHub 仓库。生产 Key 只放在 Render Environment Variables；本地调试 Key 只放在当前终端环境变量或未提交的 `.env` 中。
