# 文档与截图输入

## 当前能力

当前网站支持三种输入方式：

- 直接粘贴简历文本和岗位 JD
- 上传 `.docx` 或普通 `.pdf` 简历并提取文本
- 上传 JD 截图并在浏览器端 OCR 识别文字；如果后端默认 LLM 已配置，会继续用 LLM 提取有用 JD

## 简历文件提取

后端接口：

```text
POST /api/extract/resume
```

实现方式：

- `.docx`：使用 `python-docx` 读取段落和表格文本
- `.pdf`：使用 `PyMuPDF` 提取可复制文本

旧版 `.doc` 暂不支持直接解析。建议先用 Word 另存为 `.docx`，或导出为可复制文本的 PDF。

如果 PDF 是扫描版图片，当前接口可能无法提取文本，会返回提示。后续可以加入 OCR 处理扫描版 PDF。

## JD 截图 OCR 与 LLM 清洗

JD 截图识别在浏览器端完成，使用 Tesseract.js。

这样做的原因：

- 不需要用户先提供 API Key
- 适合作为低成本 MVP 输入方式

如果后端已经配置默认 LLM，流程会继续调用：

```text
POST /api/normalize/job
```

这个接口会从 OCR 的混杂文本里提取：

- 岗位名称
- 岗位职责
- 岗位要求 / 任职要求 / 任职资格
- 技能要求
- 加分项 / 优先项
- JD 中出现的技术问题

为了让 LLM 不被网页噪音带偏，后端会先用规则提取一份“JD 候选文本”，再把候选文本和原始 OCR 文本一起交给 LLM。规则会优先保留这些信号：

- 职责类标题：岗位职责、职位描述、工作内容、Responsibilities、What you will do
- 要求类标题：岗位要求、任职要求、任职资格、Requirements、Qualifications、Who you are
- 加分项标题：优先、加分项、Preferred、Bonus、Nice to have
- 技能和工具：Python、SQL、Excel、API、RAG、LLM、数据分析等
- 技术问答：如何理解、怎么设计、为什么、Explain、How would 等

如果 LLM 清洗失败，前端会自动退回规则清洗，用户仍然可以手动确认文本。

限制：

- OCR 质量依赖截图清晰度
- 首次加载 OCR 组件需要网络
- 识别结果需要用户确认和必要修改
- 直接让 LLM 读图片需要视觉模型；当前 DeepSeek 文本接口更适合处理 OCR 后的文本

## 为什么不直接让 LLM 识别所有文件

LLM 适合做语义清洗和结构化，但不适合作为第一层文件解析。

当前流程是：

```text
文件 / 截图
  ↓
文档解析或 OCR
  ↓
可选 LLM 清洗 JD
  ↓
用户确认文本
  ↓
规则评分
  ↓
可选 LLM 建议
```

这个流程成本更低，也更容易避免模型编造内容。
