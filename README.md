# AI Resume Job Matcher

AI Resume Job Matcher 是一个简历与岗位匹配度分析工具。

项目当前处于可测试的 Python MVP 阶段：用户提供简历文本和目标岗位 JD，系统输出匹配度分数、已匹配关键词、缺失关键词和简历优化建议。

## 核心能力

- 对比简历文本与岗位 JD
- 从岗位 JD 中识别关键能力要求
- 基于权重计算匹配度分数
- 输出已匹配关键词与缺失关键词
- 生成结构化简历优化建议
- 支持文本报告与 JSON 两种输出格式

## 当前版本范围

当前版本使用本地文本文件作为输入，不依赖数据库，也不调用外部 AI API。

已完成：

- 本地 Python 分析脚本
- 示例简历与示例岗位 JD
- 关键词权重评分逻辑
- 文本与 JSON 输出
- 产品需求、评分逻辑和路线图文档

暂未包含：

- Web 界面
- 用户账号
- 数据库存储
- PDF/DOCX 简历解析
- LLM 个性化改写建议

## 快速运行

运行示例分析：

```powershell
py -X utf8 scripts/analyze_match.py
```

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

- `scripts/analyze_match.py`：简历岗位匹配分析脚本
- `examples/resume_sample.txt`：示例简历
- `examples/job_sample.txt`：示例岗位 JD
- `docs/PRD.md`：产品需求文档
- `docs/SCORING.md`：评分逻辑说明
- `docs/PYTHON_DEMO.md`：Python MVP 运行说明
- `docs/ROADMAP.md`：产品路线图

## 后续路线

1. 扩展关键词库和评分可解释性
2. 建立可交互 Web 页面
3. 接入 LLM 生成更个性化的简历优化建议
4. 增加 PDF/DOCX 简历解析能力
5. 在需要保存历史记录时引入数据库
