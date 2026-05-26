# 第 2 阶段：Python Demo

## 这一阶段做什么

这一阶段先做一个最小版分析程序：

1. 读取简历文本
2. 读取岗位 JD 文本
3. 从岗位 JD 里识别关键词
4. 判断简历是否覆盖这些关键词
5. 输出匹配度分数和修改建议

这一步暂时不接入 AI，因为初学项目要先证明基础逻辑能跑通。

## 如何运行

在项目根目录打开终端，运行：

```powershell
py -X utf8 scripts/analyze_match.py
```

`py` 是 Windows 上常见的 Python 启动器。

`-X utf8` 的作用是让 Python 用 UTF-8 处理中文，避免中文乱码。

## 使用自己的文件

你可以新建两个文本文件：

- `my_resume.txt`
- `my_job.txt`

然后运行：

```powershell
py -X utf8 scripts/analyze_match.py --resume my_resume.txt --job my_job.txt
```

## 输出 JSON

如果后面要做网页，建议输出 JSON：

```powershell
py -X utf8 scripts/analyze_match.py --format json
```

JSON 是一种结构化数据格式。人话版：它像一张整理好的结果清单，程序很容易读取。

## 当前评分逻辑

这一版使用关键词匹配：

- 先看岗位 JD 里出现了哪些关键词
- 再看简历里是否也出现这些关键词
- 匹配越多，分数越高
- 更重要的关键词权重更高

权重可以理解为“重要程度”。例如 AI 产品岗位里，“需求分析”和“数据分析”通常比“Excel”更核心，所以权重更高。

## 这一版的局限

关键词匹配很适合做第一版，但它还不够聪明：

- 它不能真正理解一句话的含义
- 它可能漏掉同义表达
- 它不能判断经历质量
- 它不能判断简历表达是否有说服力

所以第 3 阶段会接入 LLM，让 AI 给出更自然、更像职业顾问的建议。

