# AI Resume Job Matcher

AI Resume Job Matcher 是一个简历与岗位匹配度分析工具。

<img width="2880" height="1800" alt="unknownhalfcold github io_ai-resume-job-matcher_ (4)" src="https://github.com/user-attachments/assets/b5bdeaf7-14b3-4fcd-a1a6-f350485cd259" />




项目当前处于可测试的 Web MVP 阶段：用户提供简历文本和目标岗位 JD，系统输出匹配度分数、已匹配关键词、缺失关键词和简历优化建议。

## Live Demo

[https://unknownhalfcold.github.io/ai-resume-job-matcher/](https://unknownhalfcold.github.io/ai-resume-job-matcher/)

## 核心能力

- 对比简历文本与岗位 JD
- 从岗位 JD 中识别关键能力要求
- 基于权重计算匹配度分数
- 输出已匹配关键词与缺失关键词
- 按能力维度展示覆盖情况
- 标记高优先级缺口
- 生成结构化简历优化建议
- 支持上传 DOCX/PDF 简历并自动提取文本
- 支持上传 JD 截图并在浏览器端 OCR 识别
- 在配置 API Key 后生成 LLM 个性化建议
- LLM 建议层采用固定 schema，输出 JD 规范化、要求重要程度、量化证据和 gap evidence
- 支持用户自带 API Key 的 BYOK 模式
- 提供基础用户注册、登录和 session token
- 支持本地 SQLite 与云端 Postgres 数据库
- 提供网页交互界面
- 提供 FastAPI 后端接口
- 支持文本报告与 JSON 输出

## 当前版本范围

当前 Web 版本支持直接粘贴简历和岗位 JD 进行分析；Python 版本支持本地文本文件输入。后端已经加入基础账户系统，未设置 `DATABASE_URL` 时使用本地 SQLite，云端部署时建议连接 Postgres。LLM 建议层为可选能力，只有配置后端环境变量 `LLM_API_KEY` 或 `OPENAI_API_KEY` 后才会调用外部 AI API。

已完成：

- 静态 Web MVP
- 本地 Python 分析脚本
- 示例简历与示例岗位 JD
- 关键词权重评分逻辑
- 共享关键词配置
- 网页结果展示与 JSON 复制
- 开始页产品入口
- 能力维度和优先级结果展示
- FastAPI API MVP
- DOCX/PDF 简历文本提取
- JD 截图 OCR 输入
- 三段式页面流程和加载进度
- 可选 LLM 建议层接口
- 基础用户注册、登录、退出和当前用户接口
- 数据库连接层和 Render 部署配置
- 产品需求、评分逻辑和路线图文档

暂未包含：

- 邮箱验证码和找回密码
- 分析历史保存
- 扫描版 PDF OCR
- 已完成的云端服务实例

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

当前版本采用关键词权重匹配：

```text
匹配度 = 已匹配关键词权重 / 岗位关键词总权重 * 100
```

示例：

```text
已匹配关键词权重 = 23
岗位关键词总权重 = 53
匹配度 = 23 / 53 * 100 = 43
```

详细说明见 `docs/SCORING.md`。

## 项目结构

- `index.html`：Web MVP 页面
- `assets/styles.css`：网页样式
- `assets/app.js`：浏览器端匹配逻辑
- `data/keywords.json`：共享关键词配置
- `api/server.py`：FastAPI 后端接口
- `api/database.py`：数据库连接和用户/session 表
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

1. 将 FastAPI 后端部署到 Render
2. 将云端后端连接到 Neon Postgres
3. 把 GitHub Pages 前端默认 API 地址指向云端后端
4. 增加分析历史保存和用户额度控制
5. 扩展关键词库和 LLM 建议质量
