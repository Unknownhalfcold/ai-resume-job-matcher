# AI Resume-Job Match Analyzer

这是一个面向 GitHub 主页展示的 AI 简历与岗位匹配度分析工具项目。

目标不是一开始就做一个复杂网站，而是按阶段做出一个能讲清楚、能演示、能逐步升级的作品：

1. 先写清楚产品想解决什么问题。
2. 再做一个可以本地运行的 Python Demo。
3. 然后接入大模型，让它给出更像真实职业顾问的修改建议。
4. 最后整理成 GitHub README、项目页面和简历项目经历。

## 这个工具做什么

用户输入两段内容：

- 简历内容
- 岗位描述，也叫 JD

工具输出：

- 匹配度分数
- 已经匹配的关键词
- 简历缺失但岗位高频要求的关键词
- 简历修改建议
- 可以放进简历里的项目描述优化示例

## 当前阶段

现在处于第 2 阶段：Python Demo。

Python Demo 可以理解为“能在本地跑起来的小版本”。它先不用复杂 AI，而是用关键词匹配验证核心流程。

## 快速运行

在项目根目录运行：

```powershell
py -X utf8 scripts/analyze_match.py
```

如果想输出 JSON 格式：

```powershell
py -X utf8 scripts/analyze_match.py --format json
```

JSON 可以理解为“方便程序读取的标准结果格式”。后面做网页时，前端页面就可以读取 JSON，再把分数、关键词和建议展示出来。

如果你想分析自己的简历和岗位，可以先把内容保存成两个文本文件，然后运行：

```powershell
py -X utf8 scripts/analyze_match.py --resume my_resume.txt --job my_job.txt
```

## 项目文件

- `docs/PRD.md`：产品需求文档
- `docs/ROADMAP.md`：分阶段执行路线
- `docs/GLOSSARY.md`：初学者术语表
- `docs/PYTHON_DEMO.md`：Python Demo 说明
- `scripts/analyze_match.py`：关键词匹配分析脚本
- `examples/resume_sample.txt`：测试用简历样例
- `examples/job_sample.txt`：测试用岗位样例

## 初学者重要提醒

如果未来要把这个工具放到 GitHub Pages 上，不要把 AI API Key 写进前端网页代码。

API Key 可以理解为“你调用 AI 服务的钥匙”。如果直接放到公开网页里，别人可以看到并使用它，可能产生费用。真实上线时，需要后端服务来保护它。
