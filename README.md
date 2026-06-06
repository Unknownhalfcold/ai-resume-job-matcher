# AI Resume Job Matcher

AI Resume Job Matcher 是一个面向求职者的简历与岗位匹配分析工具。用户可以上传简历和一份或多份岗位 JD，获得可解释的稳定规则分、LLM 增强参考分、能力缺口证据和简历优化建议。

<img width="2880" height="1800" alt="unknownhalfcold github io_ai-resume-job-matcher_ (4)" src="https://github.com/user-attachments/assets/b5bdeaf7-14b3-4fcd-a1a6-f350485cd259" />




项目当前处于可公开测试的全栈 Web MVP 阶段，已经包含云端 API、默认 LLM、基础账户系统、Postgres 数据库和用户分析历史。

## Live Demo

- GitHub Pages：[https://unknownhalfcold.github.io/ai-resume-job-matcher/](https://unknownhalfcold.github.io/ai-resume-job-matcher/)
- 自定义域名：[https://www.jobmatcher.win](https://www.jobmatcher.win)（HTTPS 证书配置中）
- 云端 API：[https://ai-resume-job-matcher-api.onrender.com](https://ai-resume-job-matcher-api.onrender.com)

Render 免费实例休眠后，第一次请求可能需要等待服务唤醒。

## 使用流程

1. 进入 Analyzer，粘贴简历文本或上传 DOCX/PDF 简历。
2. 粘贴岗位描述，或一次上传最多 6 个 JD 截图、DOCX/PDF 文件。
3. 系统合并并清洗 JD，识别岗位职责、任职要求、加分项和技术问题。
4. 基础规则层生成稳定匹配分、能力维度和 Gap Evidence。
5. 用户可以继续调用站点默认 LLM，或使用自己的 API Key 生成增强建议。

登录用户的分析结果会保存到自己的 History 页面；游客可以直接分析，但不会保存历史。

## 核心能力

### 输入与文本提取

- 支持直接粘贴简历和岗位 JD。
- 支持 DOCX/PDF 简历文本提取。
- 支持一次上传最多 6 个 JD 截图、DOCX 或 PDF，并合并为一份岗位上下文。
- 浏览器 OCR 与后端 LLM 清洗共同过滤导航、广告、公司介绍等网页噪音。
- 同时保留岗位职责、任职要求、加分项和招聘方提出的技术问题。

### 分析与建议

- 输出稳定规则分、关键词覆盖、能力维度和高优先级缺口。
- 使用固定 JSON schema 约束 LLM 输出，减少分析格式和口径漂移。
- 判断证书与奖项的岗位相关性和可信度；无法核验时不加分。
- 从用户提供的材料中识别公司、岗位和规模，并模拟目标岗位 HR 初筛视角。
- 区分应写在简历中的能力证据与通常由招聘网站表单单独填写的信息。
- 默认 LLM 与用户自带 API Key 的建议分别保存，切换模式不会清空已有结果。

### 账户与数据

- 支持邮箱注册、登录、退出和游客使用。
- 支持本地 SQLite 与云端 Postgres。
- 登录用户可以保存、查看和删除自己的分析历史。
- 后端通过用户身份校验隔离历史数据，用户不能访问或删除其他用户的记录。
- 提供隐私说明，并提醒用户不要上传身份证、护照、银行卡等敏感信息。

## 当前版本范围

当前线上版本采用 GitHub Pages 前端、Render FastAPI 后端、Postgres 数据库和 DeepSeek 默认 LLM。未设置 `DATABASE_URL` 的本地开发环境会自动使用 SQLite。

LLM 只负责结构化语义分析和优化建议，不直接覆盖稳定规则分。用户材料未提供的公司信息、历史招聘案例、证书等级或经历不得由模型补写。

已完成：

- 三段式响应式 Web 界面与分析进度。
- 本地 Python 分析脚本与 FastAPI API。
- 简历文档解析、多 JD 输入、截图 OCR 和 LLM JD 清洗。
- 稳定规则分、增强参考分和结构化 AI 建议。
- 站点默认 LLM 与 BYOK 双模式。
- 基础账户、Postgres 数据库、用户级历史记录和删除功能。
- GitHub Pages 与 Render 云端部署。

暂未包含：

- 邮箱验证、找回密码和第三方登录。
- 扫描版 PDF 的整页 OCR。
- 用户每日免费次数、Token 配额和完整成本控制。
- 经过人工标注数据校准的评分模型。
- 有可靠来源的公司历史招聘案例库和 RAG 检索。
- 会员、支付和简历版本管理。

## 账户、历史和隐私

当前项目已经接入基础数据库。数据库包含三类核心数据：

- `users`：保存用户邮箱、密码哈希和登录时间
- `auth_sessions`：保存登录 session token 的哈希，用于识别当前用户
- `analysis_history`：保存登录用户的分析历史

登录用户完成一次分析后，前端会把结果保存到后端数据库。保存字段包括：

```text
user_id, resume_text, job_description, match_score, strengths, weaknesses, suggestions, created_at
```

用户只能读取自己的历史记录，也只能删除自己的记录。游客模式不会保存分析历史。

隐私边界：

- 我们会保存你的账号信息和分析历史
- 我们不会公开你的简历内容
- 你可以在 History 页面删除自己的分析记录
- 请不要上传身份证、护照、银行卡、验证码等敏感信息

## 快速运行

启动网页：

```powershell
py -m http.server 8000
```

打开：

```text
http://localhost:8000
```

运行命令行示例分析：


```powershell
py -X utf8 scripts/analyze_match.py
```

启动后端 API：

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn api.server:app --reload --port 8001
```

本地前端会自动检测 `http://localhost:8001`。后端在线时使用 API 模式；后端未运行时使用浏览器本地分析。

启用 LLM 建议层：

```powershell
$env:OPENAI_API_KEY="你的 OpenAI API Key"
$env:OPENAI_MODEL="gpt-5.5"
.\.venv\Scripts\python.exe -m uvicorn api.server:app --reload --port 8001
```

使用第三方 OpenAI-compatible API：

```powershell
$env:LLM_PROVIDER="deepseek"
$env:LLM_API_STYLE="chat_completions"
$env:LLM_BASE_URL="https://api.deepseek.com"
$env:LLM_API_KEY="你的第三方 API Key"
$env:LLM_MODEL="deepseek-v4-flash"
.\.venv\Scripts\python.exe -m uvicorn api.server:app --reload --port 8001
```

也可以在网页里的 AI 建议层填写用户自己的 API Key。该 Key 只随本次请求发送到后端，不会写入 GitHub、数据库或浏览器本地存储。

输出 JSON：

```powershell
py -X utf8 scripts/analyze_match.py --format json
```

查看评分明细：

```powershell
py -X utf8 scripts/analyze_match.py --debug
```

分析自定义文件：

```powershell
py -X utf8 scripts/analyze_match.py --resume local_inputs/my_resume.txt --job local_inputs/my_job.txt
```

`local_inputs/` 已加入 `.gitignore`，用于存放个人简历和岗位文本，避免误提交隐私内容。

## 评分逻辑

系统同时展示两个分数。

### 稳定规则分

稳定规则分采用关键词权重匹配：

```text
匹配度 = 已匹配关键词权重 / 岗位关键词总权重 * 100
```

示例：

```text
已匹配关键词权重 = 23
岗位关键词总权重 = 53
匹配度 = 23 / 53 * 100 = 43
```

相同输入会得到稳定、可复现的结果。

### 增强参考分

用户生成 AI 建议后，系统会计算一个包含语义证据的辅助分数：

```text
增强参考分 = 稳定规则分 × 65% + LLM 语义证据分 × 30% + 证书/获奖加成
```

- 语义证据根据岗位要求的重要程度加权。
- 证书与获奖总加成最多 5 分。
- 无法核验或与岗位无关的证书、奖项不会加分。
- 公司规模和没有可靠来源的历史招聘案例不直接进入分数。
- 增强参考分不是录用概率，也不会替代稳定规则分。

详细说明见 [`docs/SCORING.md`](docs/SCORING.md)。

## 技术架构

```text
GitHub Pages 前端
        │
        ├── 浏览器本地规则分析与图片 OCR
        │
        └── HTTPS API 请求
                │
                ▼
        Render FastAPI 后端
          ├── 文档文本提取
          ├── 用户认证与历史记录
          ├── 稳定评分与结果整合
          └── DeepSeek / 用户自带 LLM
                │
                ▼
          Postgres 数据库
```

## 项目结构

- `index.html`：Web MVP 页面
- `assets/styles.css`：网页样式
- `assets/app.js`：浏览器端匹配逻辑
- `data/keywords.json`：共享关键词配置
- `api/server.py`：FastAPI 后端接口
- `api/database.py`：数据库连接、用户/session 表和分析历史表
- `api/auth_service.py`：注册、登录、密码哈希和 token 管理
- `api/document_parser.py`：DOCX/PDF 文本提取
- `api/llm_advisor.py`：LLM 建议层
- `.env.example`：本地和云端环境变量示例
- `render.yaml`：Render 云端部署配置
- `requirements.txt`：后端依赖
- `scripts/analyze_match.py`：简历岗位匹配分析脚本
- `examples/resume_sample.txt`：示例简历
- `examples/job_sample.txt`：示例岗位 JD
- `docs/PRD.md`：产品需求文档
- `docs/SCORING.md`：评分逻辑说明
- `docs/PYTHON_DEMO.md`：Python MVP 运行说明
- `docs/WEB_MVP.md`：Web MVP 运行说明
- `docs/API_MVP.md`：API MVP 运行说明
- `docs/DEPLOYMENT.md`：云端部署说明
- `docs/INPUT_EXTRACTION.md`：文档与截图输入说明
- `docs/LLM_ADVICE.md`：LLM 建议层说明
- `docs/ROADMAP.md`：产品路线图

## 后续路线

1. 完成自定义域名 HTTPS 与生产环境 CORS 配置。
2. 增加邮箱验证、找回密码和更完整的账号安全策略。
3. 增加用户每日免费次数、文本长度与 LLM Token 限制。
4. 使用人工标注的简历/JD 样本校准评分权重。
5. 建立有来源的公司招聘案例数据集与 RAG 检索层。
6. 优化扫描版 PDF OCR、AI 建议质量和分析历史详情页。
7. 再评估会员、支付和简历版本管理。
