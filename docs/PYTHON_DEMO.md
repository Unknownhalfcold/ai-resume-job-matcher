# Python MVP

## 目标

Python MVP 用于验证简历与岗位 JD 的核心匹配流程，为后续 Web 界面和 LLM 建议层提供基础逻辑。

输入：

- 简历文本文件
- 岗位 JD 文本文件

输出：

- 匹配度分数
- 岗位关键词
- 已匹配关键词
- 缺失关键词
- 优化建议

## 运行示例分析

```powershell
py -X utf8 scripts/analyze_match.py
```

## 使用自定义文件

创建本地输入文件：

```powershell
mkdir local_inputs
notepad local_inputs\my_resume.txt
notepad local_inputs\my_job.txt
```

运行分析：

```powershell
py -X utf8 scripts/analyze_match.py --resume local_inputs/my_resume.txt --job local_inputs/my_job.txt
```

`local_inputs/` 目录已加入 `.gitignore`。

## 输出 JSON

```powershell
py -X utf8 scripts/analyze_match.py --format json
```

JSON 输出用于后续 Web 页面或服务接口集成。

## 查看评分明细

```powershell
py -X utf8 scripts/analyze_match.py --debug
```

Debug 输出包含已匹配关键词权重、岗位关键词总权重和最终分数计算公式。

## 当前算法

当前 MVP 使用关键词权重匹配：

1. 识别岗位 JD 中出现的预设关键词
2. 检查简历中是否覆盖这些岗位关键词
3. 汇总已匹配关键词权重
4. 汇总岗位关键词总权重
5. 转换为 0-100 的匹配度分数

## 当前边界

- 不能深度理解句子语义
- 可能遗漏关键词库之外的同义表达
- 不能判断经历质量和真实性
- 尚未解析 PDF/DOCX 文件
- 尚未保存历史分析结果
