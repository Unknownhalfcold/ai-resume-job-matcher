const state = {
  keywords: [],
  lastResult: null,
  apiBaseUrl: "",
  apiAvailable: false,
  llmConfigured: false,
};

const BACKEND_TIMEOUT_MS = 900;

const SAMPLE_RESUME = `姓名：示例用户

教育背景：
某大学，信息管理与信息系统，本科

项目经历：
AI 简历与岗位匹配度分析工具
- 设计简历与岗位 JD 的匹配分析流程
- 使用 Python 对岗位关键词进行提取和统计
- 输出匹配分数、缺失关键词和简历修改建议

技能：
Python、Excel、SQL、数据分析、用户研究、竞品分析`;

const SAMPLE_JOB = `岗位名称：AI 产品经理实习生

岗位职责：
- 参与 AI 产品需求分析和功能设计
- 分析用户反馈，整理产品优化建议
- 与研发、设计团队协作推进功能落地
- 关注大语言模型在简历、招聘、教育等场景中的应用

任职要求：
- 熟悉 AI 产品基本概念
- 具备良好的逻辑分析和文档表达能力
- 有 Python、SQL 或数据分析经验优先
- 有用户研究、竞品分析或产品原型设计经验优先`;

const elements = {
  pages: document.querySelectorAll(".page-view"),
  pageLinks: document.querySelectorAll("[data-page-link]"),
  resumeInput: document.querySelector("#resume-input"),
  jobInput: document.querySelector("#job-input"),
  analyzeButton: document.querySelector("#analyze-button"),
  startAnalysisButton: document.querySelector("#start-analysis"),
  editInputsButton: document.querySelector("#edit-inputs"),
  showExampleButton: document.querySelector("#show-example"),
  closeExampleButton: document.querySelector("#close-example"),
  useExampleButton: document.querySelector("#use-example"),
  exampleModal: document.querySelector("#example-modal"),
  inputAlert: document.querySelector("#input-alert"),
  inputAlertMessage: document.querySelector("#input-alert-message"),
  closeInputAlertButton: document.querySelector("#close-input-alert"),
  loadSampleButton: document.querySelector("#load-sample"),
  clearButton: document.querySelector("#clear-all"),
  copyJsonButton: document.querySelector("#copy-json"),
  resumeFile: document.querySelector("#resume-file"),
  jdImageFile: document.querySelector("#jd-image-file"),
  aiAdviceButton: document.querySelector("#ai-advice-button"),
  aiModeInputs: document.querySelectorAll("input[name='ai-mode']"),
  llmProvider: document.querySelector("#llm-provider"),
  llmBaseUrl: document.querySelector("#llm-base-url"),
  llmModel: document.querySelector("#llm-model"),
  llmApiKey: document.querySelector("#llm-api-key"),
  llmApiStyle: document.querySelector("#llm-api-style"),
  runNote: document.querySelector("#run-note"),
  scoreRing: document.querySelector("#score-ring"),
  scoreValue: document.querySelector("#score-value"),
  scoreLabel: document.querySelector("#score-label"),
  scoreDetail: document.querySelector("#score-detail"),
  matchedWeight: document.querySelector("#matched-weight"),
  totalWeight: document.querySelector("#total-weight"),
  matchedList: document.querySelector("#matched-list"),
  missingList: document.querySelector("#missing-list"),
  categorySummary: document.querySelector("#category-summary"),
  priorityList: document.querySelector("#priority-list"),
  suggestionList: document.querySelector("#suggestion-list"),
  aiAdviceStatus: document.querySelector("#ai-advice-status"),
  aiAdviceContent: document.querySelector("#ai-advice-content"),
  runtimeStatus: document.querySelector("#runtime-status"),
  analysisStatus: document.querySelector("#analysis-status"),
  loadingPanel: document.querySelector("#loading"),
  progressBar: document.querySelector("#progress-bar"),
  progressValue: document.querySelector("#progress-value"),
  progressStep: document.querySelector("#progress-step"),
  loadingMessage: document.querySelector("#loading-message"),
  resumeFileStatus: document.querySelector("#resume-file-status"),
  jdFileStatus: document.querySelector("#jd-file-status"),
  resultPanel: document.querySelector("#result"),
};

const LLM_PROVIDER_PRESETS = {
  deepseek: {
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    apiStyle: "chat_completions",
  },
  dashscope: {
    provider: "dashscope",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-turbo",
    apiStyle: "chat_completions",
  },
  moonshot: {
    provider: "moonshot",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "",
    apiStyle: "chat_completions",
  },
  siliconflow: {
    provider: "siliconflow",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "",
    apiStyle: "chat_completions",
  },
  openai: {
    provider: "openai",
    baseUrl: "",
    model: "gpt-5.5",
    apiStyle: "responses",
  },
  custom: {
    provider: "custom",
    baseUrl: "",
    model: "",
    apiStyle: "chat_completions",
  },
};

function getApiBaseUrlCandidate() {
  const params = new URLSearchParams(window.location.search);
  const explicitApiUrl = params.get("api");

  if (explicitApiUrl) {
    return explicitApiUrl.replace(/\/$/, "");
  }

  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return "http://localhost:8001";
  }

  return "";
}

function getAiMode() {
  const checked = [...elements.aiModeInputs].find((input) => input.checked);
  return checked ? checked.value : "default";
}

function getPageFromHash() {
  const pageName = window.location.hash.replace("#", "");
  return ["start", "analyze", "result"].includes(pageName) ? pageName : "start";
}

function showPage(pageName, { push = true } = {}) {
  const nextPage = ["start", "analyze", "result"].includes(pageName) ? pageName : "start";

  elements.pages.forEach((page) => {
    page.hidden = page.dataset.view !== nextPage;
  });

  document.body.dataset.page = nextPage;
  elements.pageLinks.forEach((link) => {
    const active = link.dataset.pageLink === nextPage;
    link.toggleAttribute("aria-current", active);
  });

  const nextHash = `#${nextPage}`;
  if (push && window.location.hash !== nextHash) {
    window.history.pushState({ page: nextPage }, "", nextHash);
  } else if (!window.location.hash) {
    window.history.replaceState({ page: nextPage }, "", nextHash);
  }

  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function showLoading(message = "准备分析任务") {
  showPage("analyze");
  elements.loadingPanel.hidden = false;
  updateProgress(8, "准备", message);
}

function hideLoading() {
  elements.loadingPanel.hidden = true;
}

function updateProgress(value, step, message) {
  const nextValue = Math.max(0, Math.min(100, value));
  elements.progressBar.style.width = `${nextValue}%`;
  elements.progressValue.textContent = `${nextValue}%`;
  elements.progressStep.textContent = step;
  elements.loadingMessage.textContent = message;
  if (elements.analysisStatus) {
    elements.analysisStatus.textContent = step;
  }
}

function showInputAlert(message, focusTarget = null) {
  elements.inputAlertMessage.textContent = message;
  elements.inputAlert.hidden = false;
  elements.closeInputAlertButton.focus();
  elements.closeInputAlertButton.onclick = () => {
    elements.inputAlert.hidden = true;
    focusTarget?.focus();
  };
}

function setInputStatus(target, title, detail = "") {
  const statusElement = target === "resume" ? elements.resumeFileStatus : elements.jdFileStatus;
  statusElement.innerHTML = `<strong>${title}</strong>${detail ? `<small>${detail}</small>` : ""}`;
  statusElement.hidden = false;
}

function clearInputStatus(target) {
  const statusElement = target === "resume" ? elements.resumeFileStatus : elements.jdFileStatus;
  statusElement.replaceChildren();
  statusElement.hidden = true;
}

function isResumeFile(file) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".pdf") ||
    name.endsWith(".docx") ||
    file.type === "application/pdf" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

function isImageFile(file) {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name);
}

function findClipboardFile(event, matcher) {
  const files = [...(event.clipboardData?.files || [])];
  return files.find(matcher) || null;
}

function findDroppedFile(event, matcher) {
  const files = [...(event.dataTransfer?.files || [])];
  return files.find(matcher) || null;
}

function normalizeFileName(file, fallback) {
  return file?.name && file.name !== "image.png" ? file.name : fallback;
}

function cleanJobDescriptionText(rawText) {
  const original = rawText.replace(/\r/g, "").trim();
  if (!original) return "";

  const startPattern =
    /(岗位职责|职位描述|工作职责|工作内容|岗位描述|职位要求|岗位要求|任职要求|任职资格|任职条件|Responsibilities|Requirements|Qualifications|Job Description)/i;
  const stopPattern =
    /(公司介绍|关于我们|企业介绍|工商信息|公司地址|工作地址|相似职位|推荐职位|职位福利|薪资福利|举报|分享|收藏|立即沟通|立即申请|投递简历|申请职位|查看更多|展开全部)/i;
  const noisePattern =
    /^(首页|登录|注册|消息|搜索|筛选|推荐|广告|打开APP|下载APP|扫码|微信|微博|分享|收藏|举报|反馈|上一页|下一页|更多|展开|收起|立即申请|申请职位|投递简历|在线沟通|查看地图|公司主页)$/i;
  const valuePattern =
    /(岗位|职位|职责|要求|任职|资格|经验|能力|熟悉|负责|参与|协作|沟通|数据|产品|用户|项目|分析|设计|开发|运营|模型|AI|LLM|SQL|Python|Excel|本科|学历|专业|优先|experience|skill|requirement|responsibilit|qualif)/i;

  const lines = original
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const kept = [];
  const seen = new Set();
  let insideJobBlock = false;

  lines.forEach((line) => {
    const compact = line.replace(/[：:]\s*$/, "");
    if (!compact || compact.length > 260) return;
    if (/^https?:\/\//i.test(compact)) return;
    if (noisePattern.test(compact)) return;

    if (startPattern.test(compact)) {
      insideJobBlock = true;
    } else if (insideJobBlock && stopPattern.test(compact) && kept.length >= 3) {
      insideJobBlock = false;
      return;
    }

    const bulletLike = /^([-*•·]|\d+[.、)]|[一二三四五六七八九十]+[、.])/.test(compact);
    const keywordHit = valuePattern.test(compact);
    const useful = insideJobBlock || bulletLike || keywordHit;

    if (!useful) return;
    if (seen.has(compact)) return;
    seen.add(compact);
    kept.push(compact);
  });

  const cleaned = kept.join("\n");
  return cleaned.length >= Math.min(120, original.length * 0.35) ? cleaned : original;
}

function applyCleanedJobText(rawText, sourceLabel = "JD 文本") {
  const cleaned = cleanJobDescriptionText(rawText);
  elements.jobInput.value = cleaned;
  const removed = rawText.trim().length - cleaned.trim().length;
  if (removed > 30) {
    setInputStatus("jd", `${sourceLabel}已导入`, `已自动清理约 ${removed} 个无关字符`);
    elements.runNote.textContent = "已用规则层清理 JD 噪音";
  } else {
    setInputStatus("jd", `${sourceLabel}已导入`, "内容已准备分析");
  }
}

async function handleResumeFile(file, source = "上传") {
  showLoading("正在读取简历文件");
  updateProgress(18, "上传简历", "正在提取 Word/PDF 中的文本");

  try {
    const result = await extractResumeFile(file);
    elements.resumeInput.value = result.text;
    updateProgress(100, "简历已提取", `${result.filename || file.name || "文件"}：${result.character_count} 字符`);
    setInputStatus("resume", "简历文件已导入", result.filename || normalizeFileName(file, "剪贴板简历文件"));
    elements.runNote.textContent = result.warnings?.length ? result.warnings.join("；") : `${source}简历文本已提取`;
  } catch (error) {
    elements.runNote.textContent = error.message;
    updateProgress(100, "提取失败", error.message);
  } finally {
    window.setTimeout(hideLoading, 700);
    elements.resumeFile.value = "";
    showPage("analyze");
  }
}

async function handleJdImage(file, source = "上传") {
  showLoading("正在识别 JD 截图");
  updateProgress(10, "加载 OCR", "正在准备浏览器端 OCR");

  try {
    const text = await extractTextFromJdImage(file);
    if (!text) {
      throw new Error("截图中没有识别到文字，请换一张更清晰的截图，或直接粘贴 JD 文本。");
    }
    applyCleanedJobText(text, source === "粘贴" ? "粘贴截图" : "JD 截图");
    updateProgress(100, "JD 已识别", `已提取 ${text.length} 个字符`);
    setInputStatus("jd", "JD 截图已导入", normalizeFileName(file, source === "粘贴" ? "剪贴板截图" : "截图文件"));
  } catch (error) {
    elements.runNote.textContent = error.message;
    updateProgress(100, "OCR 失败", error.message);
  } finally {
    window.setTimeout(hideLoading, 900);
    elements.jdImageFile.value = "";
    showPage("analyze");
  }
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = BACKEND_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const errorPayload = await response.json();
        message = errorPayload.detail || JSON.stringify(errorPayload);
      } catch (error) {
        // Keep the HTTP status when the server does not return JSON.
      }
      throw new Error(message);
    }

    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

function normalize(text) {
  return text.toLowerCase().replaceAll("／", "/").replaceAll("，", ",");
}

function containsAny(text, aliases) {
  const normalized = normalize(text);
  return aliases.some((alias) => normalized.includes(alias.toLowerCase()));
}

function serializeKeywords(keywords) {
  return keywords.map(({ name, category, weight }) => ({ name, category, weight }));
}

function priorityLabel(weight) {
  if (weight >= 5) return "高优先级";
  if (weight >= 3) return "中优先级";
  return "低优先级";
}

function buildCategorySummary(jobKeywords, matchedKeywords) {
  const matchedSet = new Set(matchedKeywords);
  const groups = new Map();

  jobKeywords.forEach((keyword) => {
    if (!groups.has(keyword.category)) {
      groups.set(keyword.category, {
        category: keyword.category,
        matched_weight: 0,
        total_weight: 0,
        score: 0,
        matched_keywords: [],
        missing_keywords: [],
      });
    }

    const group = groups.get(keyword.category);
    group.total_weight += keyword.weight;

    if (matchedSet.has(keyword)) {
      group.matched_weight += keyword.weight;
      group.matched_keywords.push(keyword);
    } else {
      group.missing_keywords.push(keyword);
    }
  });

  return [...groups.values()].map((group) => ({
    ...group,
    score: group.total_weight ? Math.round((group.matched_weight / group.total_weight) * 100) : 0,
    matched_keywords: serializeKeywords(group.matched_keywords),
    missing_keywords: serializeKeywords(group.missing_keywords),
  }));
}

function analyze(resumeText, jobText) {
  const jobKeywords = state.keywords.filter((keyword) => containsAny(jobText, keyword.aliases));
  const matchedKeywords = jobKeywords.filter((keyword) => containsAny(resumeText, keyword.aliases));
  const missingKeywords = jobKeywords.filter((keyword) => !matchedKeywords.includes(keyword));
  const totalWeight = jobKeywords.reduce((sum, keyword) => sum + keyword.weight, 0);
  const matchedWeight = matchedKeywords.reduce((sum, keyword) => sum + keyword.weight, 0);
  const score = totalWeight ? Math.round((matchedWeight / totalWeight) * 100) : 0;
  const sortedMissingKeywords = [...missingKeywords].sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
  const suggestionItems = sortedMissingKeywords.map((keyword) => ({
    name: keyword.name,
    category: keyword.category,
    weight: keyword.weight,
    priority: priorityLabel(keyword.weight),
    suggestion: keyword.suggestion,
  }));

  return {
    score,
    score_details: {
      matched_weight: matchedWeight,
      total_job_weight: totalWeight,
      formula: totalWeight ? `${matchedWeight} / ${totalWeight} * 100` : "0",
    },
    job_keywords: serializeKeywords(jobKeywords),
    matched_keywords: serializeKeywords(matchedKeywords),
    missing_keywords: serializeKeywords(missingKeywords),
    category_summary: buildCategorySummary(jobKeywords, matchedKeywords),
    priority_gaps: suggestionItems.slice(0, 5),
    suggestion_items: suggestionItems,
    suggestions: suggestionItems.map((item) => item.suggestion),
  };
}

async function analyzeViaApi(resumeText, jobText) {
  return fetchJsonWithTimeout(
    `${state.apiBaseUrl}/api/analyze`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        resume: resumeText,
        job: jobText,
      }),
    },
    8000,
  );
}

async function extractResumeFile(file) {
  if (!state.apiAvailable) {
    throw new Error("请先启动后端 API，再上传 Word/PDF 简历。");
  }

  const formData = new FormData();
  formData.append("file", file);

  return fetchJsonWithTimeout(
    `${state.apiBaseUrl}/api/extract/resume`,
    {
      method: "POST",
      body: formData,
    },
    30000,
  );
}

async function extractTextFromJdImage(file) {
  if (!window.Tesseract) {
    throw new Error("OCR 组件加载失败，请检查网络后重试，或直接粘贴 JD 文本。");
  }

  const result = await Tesseract.recognize(file, "chi_sim+eng", {
    logger: (message) => {
      if (message.status === "recognizing text") {
        const value = Math.round(10 + message.progress * 80);
        updateProgress(value, "识别 JD 截图", "正在从截图中提取文字");
      }
    },
  });

  return result.data.text.trim();
}

function hasUserLlmKey() {
  return Boolean(elements.llmApiKey.value.trim());
}

function hasCompleteUserLlmConfig() {
  return hasUserLlmKey() && Boolean(elements.llmModel.value.trim());
}

function canGenerateAiAdvice() {
  if (!state.apiAvailable) {
    return false;
  }
  if (getAiMode() === "byok") {
    return hasCompleteUserLlmConfig();
  }
  return state.llmConfigured;
}

function collectUserLlmConfig() {
  if (getAiMode() !== "byok") {
    return null;
  }

  const apiKey = elements.llmApiKey.value.trim();

  if (!apiKey) {
    return null;
  }

  return {
    provider: elements.llmProvider.value,
    api_key: apiKey,
    base_url: elements.llmBaseUrl.value.trim() || null,
    model: elements.llmModel.value.trim() || null,
    api_style: elements.llmApiStyle.value,
  };
}

function updateAiAdviceAvailability() {
  if (!state.lastResult) {
    elements.aiAdviceButton.disabled = true;
    return;
  }

  elements.aiAdviceButton.disabled = !canGenerateAiAdvice();
}

function syncAiModeUi() {
  const byokMode = getAiMode() === "byok";
  document.querySelector(".ai-settings").hidden = !byokMode;
  updateAiAdviceAvailability();
  if (state.lastResult) {
    renderAiAdvicePlaceholder(
      canGenerateAiAdvice()
        ? "基础分析已完成，可以生成 AI 建议"
        : byokMode
          ? "请填写自己的 API Key 和模型名"
          : "默认 LLM 暂未配置，可切换到自带 API Key",
    );
  }
}

function applyProviderPreset(providerName) {
  const preset = LLM_PROVIDER_PRESETS[providerName];
  elements.llmBaseUrl.value = preset.baseUrl;
  elements.llmModel.value = preset.model;
  elements.llmApiStyle.value = preset.apiStyle;
}

async function generateAiAdvice(resumeText, jobText, analysis) {
  const userLlmConfig = collectUserLlmConfig();

  return fetchJsonWithTimeout(
    `${state.apiBaseUrl}/api/ai-suggestions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        resume: resumeText,
        job: jobText,
        analysis,
        llm_config: userLlmConfig,
      }),
    },
    45000,
  );
}

async function runAnalysis(resumeText, jobText) {
  if (state.apiAvailable) {
    try {
      elements.runNote.textContent = "后端 API 分析中";
      return await analyzeViaApi(resumeText, jobText);
    } catch (error) {
      state.apiAvailable = false;
      state.apiBaseUrl = "";
      elements.runtimeStatus.textContent = "Browser mode";
      elements.runNote.textContent = "后端不可用，已切换本地分析";
      console.warn(error);
    }
  }

  return analyze(resumeText, jobText);
}

function scoreLabel(score) {
  if (score >= 80) return "关键词覆盖较强";
  if (score >= 60) return "匹配度中等";
  if (score >= 40) return "具备部分相关性";
  return "显性要求覆盖较弱";
}

function createPill(keyword, type) {
  const pill = document.createElement("span");
  pill.className = "pill";
  pill.dataset.type = type;
  pill.innerHTML = `<span>${keyword.name}</span><small>${keyword.category} · ${keyword.weight}</small>`;
  return pill;
}

function renderKeywordList(container, keywords, type) {
  container.replaceChildren();

  if (!keywords.length) {
    const empty = document.createElement("span");
    empty.className = "empty-state";
    empty.textContent = "暂无";
    container.append(empty);
    return;
  }

  keywords.forEach((keyword) => container.append(createPill(keyword, type)));
}

function renderCategorySummary(summaries) {
  elements.categorySummary.replaceChildren();

  if (!summaries.length) {
    const empty = document.createElement("span");
    empty.className = "empty-state";
    empty.textContent = "暂无";
    elements.categorySummary.append(empty);
    return;
  }

  summaries.forEach((summary) => {
    const card = document.createElement("article");
    card.className = "category-card";

    const header = document.createElement("div");
    header.className = "category-card-header";

    const title = document.createElement("strong");
    title.textContent = summary.category;

    const score = document.createElement("span");
    score.textContent = `${summary.score}/100`;

    header.append(title, score);

    const bar = document.createElement("div");
    bar.className = "category-bar";
    bar.style.setProperty("--value", summary.score);

    const meta = document.createElement("p");
    meta.textContent = `${summary.matched_weight}/${summary.total_weight} 权重已覆盖`;

    const missing = document.createElement("div");
    missing.className = "category-missing";

    if (summary.missing_keywords.length) {
      summary.missing_keywords.forEach((keyword) => missing.append(createPill(keyword, "missing")));
    } else {
      const done = document.createElement("span");
      done.className = "empty-state";
      done.textContent = "主要关键词已覆盖";
      missing.append(done);
    }

    card.append(header, bar, meta, missing);
    elements.categorySummary.append(card);
  });
}

function renderPriorityGaps(gaps) {
  elements.priorityList.replaceChildren();

  if (!gaps.length) {
    const empty = document.createElement("span");
    empty.className = "empty-state";
    empty.textContent = "暂无";
    elements.priorityList.append(empty);
    return;
  }

  gaps.forEach((gap) => {
    const card = document.createElement("article");
    card.className = "priority-card";

    const top = document.createElement("div");
    top.className = "priority-card-top";

    const title = document.createElement("strong");
    title.textContent = gap.name;

    const priority = document.createElement("span");
    priority.textContent = gap.priority;

    top.append(title, priority);

    const meta = document.createElement("p");
    meta.textContent = `${gap.category} · 权重 ${gap.weight}`;

    const suggestion = document.createElement("p");
    suggestion.textContent = gap.suggestion;

    card.append(top, meta, suggestion);
    elements.priorityList.append(card);
  });
}

function renderSuggestions(suggestions, hasResult = true) {
  elements.suggestionList.replaceChildren();

  if (!suggestions.length) {
    const item = document.createElement("li");
    item.textContent = hasResult
      ? "当前简历已覆盖岗位中的主要关键词，可以继续优化表达质量和结果数据。"
      : "暂无";
    elements.suggestionList.append(item);
    return;
  }

  suggestions.forEach((suggestionItem) => {
    const listItem = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = `${suggestionItem.name}：`;
    const text = document.createElement("span");
    text.textContent = suggestionItem.suggestion;
    listItem.append(title, text);
    elements.suggestionList.append(listItem);
  });
}

function levelLabel(level) {
  const labels = {
    strong: "证据较强",
    medium: "证据中等",
    weak: "证据较弱",
    missing: "缺少证据",
  };
  return labels[level] || level;
}

function priorityText(priority) {
  const labels = {
    high: "高优先级",
    medium: "中优先级",
    low: "低优先级",
  };
  return labels[priority] || priority;
}

function importanceText(importance) {
  const labels = {
    must_have: "硬性要求",
    important: "重要要求",
    nice_to_have: "加分项",
  };
  return labels[importance] || importance;
}

function impactText(impact) {
  const labels = {
    high: "高影响",
    medium: "中影响",
    low: "低影响",
  };
  return labels[impact] || impact;
}

function createAdviceCard(title, bodyItems) {
  const card = document.createElement("article");
  card.className = "ai-card";

  const heading = document.createElement("h4");
  heading.textContent = title;
  card.append(heading);

  bodyItems.forEach((item) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = item;
    card.append(paragraph);
  });

  return card;
}

function renderAiAdvicePlaceholder(message) {
  elements.aiAdviceContent.replaceChildren();
  elements.aiAdviceStatus.textContent = message;
}

function renderAiAdvice(response) {
  const advice = response.advice;
  elements.aiAdviceContent.replaceChildren();
  const providerLabel = response.provider ? `${response.provider} / ${response.model}` : response.model;
  elements.aiAdviceStatus.textContent = `AI 建议已生成 · ${providerLabel} · 规则分数保持 ${response.rule_score}/100`;

  const summary = createAdviceCard("整体判断", [advice.summary]);

  const normalizedJob = createAdviceCard(
    "JD 规范化",
    [
      `岗位：${advice.normalized_job.role_title}`,
      advice.normalized_job.jd_summary,
      `核心职责：${advice.normalized_job.core_responsibilities.join("；")}`,
    ],
  );

  const requirements = createAdviceCard(
    "岗位要求重要程度",
    advice.normalized_job.requirements.map(
      (item) =>
        `${importanceText(item.importance)}｜权重 ${item.weight}｜${item.title}：${item.reason}。期望证据：${item.evidence_expected}`,
    ),
  );

  const rubric = createAdviceCard(
    "LLM 评分口径",
    advice.scoring_rubric.map((item) => `权重 ${item.weight}｜${item.dimension}：${item.what_good_looks_like}`),
  );

  const evidence = createAdviceCard(
    "简历证据强度量化",
    advice.evidence_review.map(
      (item) =>
        `${item.title}｜${importanceText(item.importance)}｜${levelLabel(item.level)}｜证据 ${item.evidence_score}/100｜置信度 ${item.confidence}/100：${item.resume_evidence}；缺口：${item.gap}；原因：${item.why_it_matters}`,
    ),
  );

  const quantifiedGaps = createAdviceCard(
    "Gap Evidence 量化",
    advice.quantified_gaps.map(
      (item) =>
        `${item.requirement}｜${importanceText(item.importance)}｜缺口 ${item.gap_score}/100｜${impactText(item.impact_on_match)}：当前证据：${item.current_evidence}；缺失证据：${item.missing_evidence}；建议：${item.recommended_fix}`,
    ),
  );

  const actions = createAdviceCard(
    "优先修改动作",
    advice.top_actions.map(
      (item) => `${priorityText(item.priority)}｜${item.target_section}：${item.action}。示例：${item.example}`,
    ),
  );

  const rewrites = createAdviceCard(
    "STAR 改写示例",
    advice.rewrite_examples.map((item) => `Before：${item.before}\nAfter：${item.after}\n为什么更好：${item.why_better}`),
  );

  const contract = response.analysis_contract
    ? createAdviceCard("分析边界", [
        response.analysis_contract.final_score_policy,
        `Evidence：${response.analysis_contract.evidence_score_scale}`,
        `Gap：${response.analysis_contract.gap_score_scale}`,
        response.analysis_contract.privacy_boundary,
      ])
    : null;

  elements.aiAdviceContent.append(
    summary,
    normalizedJob,
    requirements,
    rubric,
    evidence,
    quantifiedGaps,
    actions,
    rewrites,
    ...(contract ? [contract] : []),
  );
}

function renderResultPage(result) {
  renderResult(result);
  hideLoading();
  updateProgress(100, "完成", "分析完成");
  showPage("result");
}

function renderResult(result) {
  state.lastResult = result;

  elements.scoreRing.style.setProperty("--score", result.score);
  elements.scoreValue.textContent = result.score;
  elements.scoreLabel.textContent = scoreLabel(result.score);
  elements.scoreDetail.textContent = `计算公式：${result.score_details.formula}`;
  elements.matchedWeight.textContent = result.score_details.matched_weight;
  elements.totalWeight.textContent = result.score_details.total_job_weight;
  elements.copyJsonButton.disabled = false;
  updateAiAdviceAvailability();

  renderKeywordList(elements.matchedList, result.matched_keywords, "matched");
  renderKeywordList(elements.missingList, result.missing_keywords, "missing");
  renderCategorySummary(result.category_summary);
  renderPriorityGaps(result.priority_gaps);
  renderSuggestions(result.suggestion_items);
  renderAiAdvicePlaceholder(
    canGenerateAiAdvice()
      ? "基础分析已完成，可以生成 AI 建议"
      : getAiMode() === "byok"
        ? "请填写自己的 API Key 和模型名"
        : "默认 LLM 暂未配置，可切换到自带 API Key",
  );
}

function renderEmptyResult() {
  elements.scoreRing.style.setProperty("--score", 0);
  elements.scoreValue.textContent = "--";
  elements.scoreLabel.textContent = "等待分析";
  elements.scoreDetail.textContent = "输入简历和岗位 JD 后生成结果";
  elements.matchedWeight.textContent = "0";
  elements.totalWeight.textContent = "0";
  elements.copyJsonButton.disabled = true;
  elements.aiAdviceButton.disabled = true;
  renderKeywordList(elements.matchedList, [], "matched");
  renderKeywordList(elements.missingList, [], "missing");
  renderCategorySummary([]);
  renderPriorityGaps([]);
  renderSuggestions([], false);
  renderAiAdvicePlaceholder("完成基础分析后可生成");
}

async function loadKeywords() {
  try {
    const response = await fetch("data/keywords.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.keywords = await response.json();
    elements.analyzeButton.disabled = false;
    elements.loadSampleButton.disabled = false;
    elements.runNote.textContent = `关键词库：${state.keywords.length} 项`;
  } catch (error) {
    elements.analyzeButton.disabled = true;
    elements.loadSampleButton.disabled = true;
    elements.runNote.textContent = "关键词库加载失败";
    console.error(error);
  }
}

async function detectBackend() {
  const apiBaseUrl = getApiBaseUrlCandidate();

  if (!apiBaseUrl) {
    state.llmConfigured = false;
    elements.runtimeStatus.textContent = "Browser mode";
    return;
  }

  try {
    const health = await fetchJsonWithTimeout(`${apiBaseUrl}/health`);
    state.apiBaseUrl = apiBaseUrl;
    state.apiAvailable = health.status === "ok";
    state.llmConfigured = Boolean(health.llm_configured);
    elements.runtimeStatus.textContent = state.apiAvailable ? "API mode" : "Browser mode";
    if (state.lastResult) {
      updateAiAdviceAvailability();
      renderAiAdvicePlaceholder(
        canGenerateAiAdvice()
          ? "基础分析已完成，可以生成 AI 建议"
          : getAiMode() === "byok"
            ? "后端在线，请填写自己的 API Key 启用 AI 建议"
            : "默认 LLM 暂未配置，可切换到自带 API Key",
      );
    }
  } catch (error) {
    state.apiBaseUrl = "";
    state.apiAvailable = false;
    state.llmConfigured = false;
    elements.runtimeStatus.textContent = "Browser mode";
  }
}

function bindEvents() {
  elements.pageLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const targetPage = link.dataset.pageLink;
      if (!targetPage) return;
      event.preventDefault();
      showPage(targetPage);
    });
  });

  elements.startAnalysisButton.addEventListener("click", () => {
    showPage("analyze");
  });

  elements.editInputsButton.addEventListener("click", () => {
    showPage("analyze");
  });

  elements.showExampleButton.addEventListener("click", () => {
    elements.exampleModal.hidden = false;
  });

  elements.closeExampleButton.addEventListener("click", () => {
    elements.exampleModal.hidden = true;
  });

  elements.exampleModal.addEventListener("click", (event) => {
    if (event.target === elements.exampleModal) {
      elements.exampleModal.hidden = true;
    }
  });

  elements.inputAlert.addEventListener("click", (event) => {
    if (event.target === elements.inputAlert) {
      elements.inputAlert.hidden = true;
    }
  });

  elements.useExampleButton.addEventListener("click", () => {
    elements.resumeInput.value = SAMPLE_RESUME;
    elements.jobInput.value = SAMPLE_JOB;
    setInputStatus("resume", "示例简历已载入", "可直接开始分析");
    setInputStatus("jd", "示例 JD 已载入", "可直接开始分析");
    elements.exampleModal.hidden = true;
    hideLoading();
    showPage("analyze");
    elements.runNote.textContent = `关键词库：${state.keywords.length} 项；示例已载入`;
  });

  elements.resumeFile.addEventListener("change", async () => {
    const file = elements.resumeFile.files?.[0];
    if (!file) return;
    await handleResumeFile(file);
  });

  elements.jdImageFile.addEventListener("change", async () => {
    const file = elements.jdImageFile.files?.[0];
    if (!file) return;
    await handleJdImage(file);
  });

  elements.resumeInput.addEventListener("paste", async (event) => {
    const file = findClipboardFile(event, isResumeFile);
    if (!file) {
      window.setTimeout(() => {
        if (elements.resumeInput.value.trim()) {
          setInputStatus("resume", "简历文本已粘贴", "浏览器未提供源文件名");
        }
      }, 0);
      return;
    }

    event.preventDefault();
    await handleResumeFile(file, "粘贴");
  });

  elements.jobInput.addEventListener("paste", async (event) => {
    const imageFile = findClipboardFile(event, isImageFile);
    if (imageFile) {
      event.preventDefault();
      await handleJdImage(imageFile, "粘贴");
      return;
    }

    const pastedText = event.clipboardData?.getData("text/plain");
    if (pastedText?.trim()) {
      event.preventDefault();
      applyCleanedJobText(pastedText, "JD 文本");
    }
  });

  [
    [elements.resumeInput, "resume", isResumeFile, handleResumeFile],
    [elements.jobInput, "jd", isImageFile, handleJdImage],
  ].forEach(([input, target, matcher, handler]) => {
    input.addEventListener("dragover", (event) => {
      event.preventDefault();
      input.classList.add("is-dragging");
    });

    input.addEventListener("dragleave", () => {
      input.classList.remove("is-dragging");
    });

    input.addEventListener("drop", async (event) => {
      const file = findDroppedFile(event, matcher);
      if (!file) return;
      event.preventDefault();
      input.classList.remove("is-dragging");
      await handler(file, "拖入");
    });
  });

  elements.resumeInput.addEventListener("input", () => {
    if (!elements.resumeInput.value.trim()) {
      clearInputStatus("resume");
    }
  });

  elements.jobInput.addEventListener("input", () => {
    if (!elements.jobInput.value.trim()) {
      clearInputStatus("jd");
    } else {
      window.clearTimeout(elements.jobInput.cleanTimer);
      elements.jobInput.cleanTimer = window.setTimeout(() => {
        const current = elements.jobInput.value;
        const cleaned = cleanJobDescriptionText(current);
        if (cleaned !== current && current.length - cleaned.length > 80) {
          elements.jobInput.value = cleaned;
          setInputStatus("jd", "JD 文本已清理", "已自动排除明显网页噪音");
        }
      }, 700);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!elements.exampleModal.hidden) {
        elements.exampleModal.hidden = true;
      }
      if (!elements.inputAlert.hidden) {
        elements.inputAlert.hidden = true;
      }
    }
  });

  elements.analyzeButton.addEventListener("click", async () => {
    const resumeText = elements.resumeInput.value.trim();
    const jobText = elements.jobInput.value.trim();

    if (!resumeText || !jobText) {
      const message = !resumeText && !jobText
        ? "请先补全简历和岗位 JD，再开始分析。"
        : !resumeText
          ? "请先输入或上传简历内容。"
          : "请先输入、粘贴或上传岗位 JD。";
      showInputAlert(message, !resumeText ? elements.resumeInput : elements.jobInput);
      elements.runNote.textContent = "请补全简历和岗位 JD";
      return;
    }

    showLoading("正在计算关键词匹配度");
    try {
      updateProgress(24, "读取输入", "正在准备简历和岗位 JD");
      await new Promise((resolve) => window.setTimeout(resolve, 320));
      updateProgress(48, "规则分析", "正在识别岗位关键词和简历证据");
      const result = await runAnalysis(resumeText, jobText);
      updateProgress(78, "生成结果", "正在整理分数、缺口和建议");
      await new Promise((resolve) => window.setTimeout(resolve, 520));
      renderResultPage(result);
      elements.runNote.textContent = `关键词库：${state.keywords.length} 项`;
    } catch (error) {
      updateProgress(100, "分析失败", error.message);
      elements.runNote.textContent = error.message;
      window.setTimeout(hideLoading, 900);
    }
  });

  elements.loadSampleButton.addEventListener("click", () => {
    elements.resumeInput.value = SAMPLE_RESUME;
    elements.jobInput.value = SAMPLE_JOB;
    setInputStatus("resume", "示例简历已载入", "可直接开始分析");
    setInputStatus("jd", "示例 JD 已载入", "可直接开始分析");
    hideLoading();
    showPage("analyze");
    elements.runNote.textContent = `关键词库：${state.keywords.length} 项；示例已载入`;
  });

  elements.clearButton.addEventListener("click", () => {
    elements.resumeInput.value = "";
    elements.jobInput.value = "";
    state.lastResult = null;
    renderEmptyResult();
    clearInputStatus("resume");
    clearInputStatus("jd");
    hideLoading();
    elements.runNote.textContent = `关键词库：${state.keywords.length} 项`;
  });

  elements.copyJsonButton.addEventListener("click", async () => {
    if (!state.lastResult) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(state.lastResult, null, 2));
      elements.runNote.textContent = "JSON 已复制";
    } catch (error) {
      elements.runNote.textContent = "复制失败";
      console.error(error);
    }
  });

  elements.aiAdviceButton.addEventListener("click", async () => {
    const resumeText = elements.resumeInput.value.trim();
    const jobText = elements.jobInput.value.trim();

    if (!state.apiAvailable) {
      renderAiAdvicePlaceholder("请先启动后端 API，再生成 AI 建议");
      return;
    }

    if (!state.llmConfigured && !hasCompleteUserLlmConfig()) {
      renderAiAdvicePlaceholder("请先填写自己的 API Key 和模型名，或在后端配置 LLM_API_KEY");
      return;
    }

    if (!state.lastResult || !resumeText || !jobText) {
      renderAiAdvicePlaceholder("请先完成基础分析");
      return;
    }

    elements.aiAdviceButton.disabled = true;
    elements.aiAdviceStatus.textContent = "AI 建议生成中";

    try {
      const response = await generateAiAdvice(resumeText, jobText, state.lastResult);
      state.lastResult.ai_advice = response;
      renderAiAdvice(response);
      elements.runNote.textContent = "AI 建议已生成";
    } catch (error) {
      renderAiAdvicePlaceholder(`AI 建议生成失败：${error.message}`);
      elements.runNote.textContent = "AI 建议生成失败";
      console.error(error);
    } finally {
      updateAiAdviceAvailability();
    }
  });

  elements.aiModeInputs.forEach((input) => {
    input.addEventListener("change", syncAiModeUi);
  });

  elements.llmProvider.addEventListener("change", () => {
    applyProviderPreset(elements.llmProvider.value);
    updateAiAdviceAvailability();
  });

  [elements.llmApiKey, elements.llmBaseUrl, elements.llmModel, elements.llmApiStyle].forEach((input) => {
    input.addEventListener("input", () => {
      updateAiAdviceAvailability();
      if (state.lastResult && canGenerateAiAdvice()) {
        renderAiAdvicePlaceholder("基础分析已完成，可以生成 AI 建议");
      }
    });
    input.addEventListener("change", () => {
      updateAiAdviceAvailability();
    });
  });

  window.addEventListener("popstate", () => {
    showPage(getPageFromHash(), { push: false });
  });

  window.addEventListener("hashchange", () => {
    showPage(getPageFromHash(), { push: false });
  });
}

renderEmptyResult();
elements.loadingPanel.hidden = true;
elements.analyzeButton.disabled = true;
elements.loadSampleButton.disabled = true;
applyProviderPreset(elements.llmProvider.value);
bindEvents();
showPage(getPageFromHash(), { push: false });
syncAiModeUi();
detectBackend();
loadKeywords();
