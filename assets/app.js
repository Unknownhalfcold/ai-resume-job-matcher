const state = {
  keywords: [],
  lastResult: null,
  apiBaseUrl: "",
  apiAvailable: false,
  llmConfigured: false,
  llmProvider: "",
  llmModel: "",
  authToken: "",
  authProvider: "legacy",
  supabaseClient: null,
  authRecoveryMode: false,
  currentUser: null,
  historyRecords: [],
  resumeSource: null,
  jdSources: [],
  jdTextEditedByUser: false,
  jdOcrWorkerPromise: null,
  jdOcrProgressHandler: null,
  capabilityDiscovery: null,
  capabilityAssessments: [],
  pendingAnalysis: null,
  thinkingEnabled: true,
};

const BACKEND_TIMEOUT_MS = 12000;
const API_HEALTH_TIMEOUT_MS = 25000;
const LLM_REQUEST_TIMEOUT_MS = 100000;
const MAX_RESUME_CHARS = 8000;
const MAX_JOB_CHARS = 8000;
const MAX_TOTAL_INPUT_CHARS = 16000;
const AUTH_TOKEN_STORAGE_KEY = "airjm_auth_token";
const THINKING_MODE_STORAGE_KEY = "airjm_thinking_enabled";
const API_BASE_URL = window.API_BASE_URL || window.APP_CONFIG?.API_BASE_URL || "https://api.jobmatcher.top";
const SUPABASE_URL = window.APP_CONFIG?.supabaseUrl || "";
const SUPABASE_PUBLISHABLE_KEY = window.APP_CONFIG?.supabasePublishableKey || "";
const PAGE_NAMES = ["start", "analyze", "capabilities", "result", "history", "privacy"];
const clipboardFileKeys = new WeakMap();
let clipboardFileSequence = 0;

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
  clearResumeButton: document.querySelector("#clear-resume"),
  clearJdButton: document.querySelector("#clear-jd"),
  clearButton: document.querySelector("#clear-all"),
  analyzeAnotherJobButton: document.querySelector("#analyze-another-job"),
  copyJsonButton: document.querySelector("#copy-json"),
  resumeFile: document.querySelector("#resume-file"),
  jdImageFile: document.querySelector("#jd-image-file"),
  aiAdviceButton: document.querySelector("#ai-advice-button"),
  runNote: document.querySelector("#run-note"),
  scoreRing: document.querySelector("#score-ring"),
  scoreValue: document.querySelector("#score-value"),
  scoreLabel: document.querySelector("#score-label"),
  scoreDetail: document.querySelector("#score-detail"),
  scoreBreakdownTrigger: document.querySelector("#score-breakdown-trigger"),
  scoreBreakdownModal: document.querySelector("#score-breakdown-modal"),
  scoreBreakdownClose: document.querySelector("#score-breakdown-close"),
  scoreBreakdownNote: document.querySelector("#score-breakdown-note"),
  scoreBreakdownSteps: document.querySelector("#score-breakdown-steps"),
  scoringSteps: document.querySelector("#scoring-steps"),
  matchedWeight: document.querySelector("#matched-weight"),
  totalWeight: document.querySelector("#total-weight"),
  matchedList: document.querySelector("#matched-list"),
  missingList: document.querySelector("#missing-list"),
  categorySummary: document.querySelector("#category-summary"),
  priorityList: document.querySelector("#priority-list"),
  suggestionList: document.querySelector("#suggestion-list"),
  starCardGrid: document.querySelector("#star-card-grid"),
  starDetailPanel: document.querySelector("#star-detail-panel"),
  aiAdviceStatus: document.querySelector("#ai-advice-status"),
  aiAdviceContent: document.querySelector("#ai-advice-content"),
  runtimeStatus: document.querySelector("#runtime-status"),
  analysisStatus: document.querySelector("#analysis-status"),
  loadingPanel: document.querySelector("#loading"),
  progressBar: document.querySelector("#progress-bar"),
  progressValue: document.querySelector("#progress-value"),
  progressStep: document.querySelector("#progress-step"),
  loadingMessage: document.querySelector("#loading-message"),
  capabilityRows: document.querySelector("#capability-rows"),
  capabilityRole: document.querySelector("#capability-role"),
  capabilityCount: document.querySelector("#capability-count"),
  capabilityEngine: document.querySelector("#capability-engine"),
  capabilityNote: document.querySelector("#capability-note"),
  skipCapabilitiesButton: document.querySelector("#skip-capabilities"),
  confirmCapabilitiesButton: document.querySelector("#confirm-capabilities"),
  thinkingMode: document.querySelector("#thinking-mode"),
  thinkingHint: document.querySelector("#thinking-hint"),
  resumeFileStatus: document.querySelector("#resume-file-status"),
  jdFileStatus: document.querySelector("#jd-file-status"),
  resumeFilePreview: document.querySelector("#resume-file-preview"),
  jdFilePreview: document.querySelector("#jd-file-preview"),
  resultPanel: document.querySelector("#result"),
  authOpen: document.querySelector("#auth-open"),
  authLogout: document.querySelector("#auth-logout"),
  userChip: document.querySelector("#user-chip"),
  authModal: document.querySelector("#auth-modal"),
  authForm: document.querySelector("#auth-form"),
  authTitle: document.querySelector("#auth-title"),
  authCopy: document.querySelector("#auth-copy"),
  authEmailFeature: document.querySelector("#auth-email-feature"),
  authClose: document.querySelector("#auth-close"),
  authEmailField: document.querySelector("#auth-email-field"),
  authEmail: document.querySelector("#auth-email"),
  authPasswordLabel: document.querySelector("#auth-password-label"),
  authPassword: document.querySelector("#auth-password"),
  authStatus: document.querySelector("#auth-status"),
  authRegister: document.querySelector("#auth-register"),
  authLogin: document.querySelector("#auth-login"),
  authGuest: document.querySelector("#auth-guest"),
  authReset: document.querySelector("#auth-reset"),
  historyRefresh: document.querySelector("#history-refresh"),
  historyStatus: document.querySelector("#history-status"),
  historyList: document.querySelector("#history-list"),
};

function getApiBaseUrlCandidate() {
  return API_BASE_URL.replace(/\/$/, "");
}

function getPageFromHash() {
  const pageName = window.location.hash.replace("#", "");
  return PAGE_NAMES.includes(pageName) ? pageName : "start";
}

function showPage(pageName, { push = true } = {}) {
  const nextPage = PAGE_NAMES.includes(pageName) ? pageName : "start";

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

  if (nextPage === "history") {
    window.setTimeout(loadHistoryRecords, 0);
  }
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

function getRuntimeLabel() {
  if (!state.apiAvailable) return "Browser fallback";
  if (!state.llmConfigured) return "Cloud API";
  const modelLabel = state.llmProvider || state.llmModel || "LLM";
  return `Cloud API + ${modelLabel}`;
}

function getReadinessNote() {
  if (!state.keywords.length) {
    return "基础规则加载中";
  }
  if (state.apiAvailable && state.llmConfigured) {
    const modelLabel = state.llmProvider || state.llmModel || "LLM";
    return `基础规则已加载 · 云端 API 和 ${modelLabel} 已连接`;
  }
  if (state.apiAvailable) {
    return "基础规则已加载 · 云端 API 已连接";
  }
  return "基础规则已加载 · 云端 API 连接中或暂不可用";
}

function updateRuntimeStatus() {
  elements.runtimeStatus.textContent = getRuntimeLabel();
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

function getInputLengthError(resumeText, jobText) {
  if (resumeText.length > MAX_RESUME_CHARS) {
    return `简历最多支持 ${MAX_RESUME_CHARS.toLocaleString()} 个字符，当前为 ${resumeText.length.toLocaleString()} 个字符。`;
  }
  if (jobText.length > MAX_JOB_CHARS) {
    return `岗位 JD 最多支持 ${MAX_JOB_CHARS.toLocaleString()} 个字符，当前为 ${jobText.length.toLocaleString()} 个字符。`;
  }
  if (resumeText.length + jobText.length > MAX_TOTAL_INPUT_CHARS) {
    return `简历与 JD 合计最多支持 ${MAX_TOTAL_INPUT_CHARS.toLocaleString()} 个字符。`;
  }
  return "";
}

function clearCurrentJob({ returnToAnalyzer = false } = {}) {
  elements.jobInput.value = "";
  elements.jdImageFile.value = "";
  state.jdSources = [];
  state.jdTextEditedByUser = false;
  renderFilePreviews("jd");
  state.lastResult = null;
  state.capabilityDiscovery = null;
  state.capabilityAssessments = [];
  state.pendingAnalysis = null;
  renderEmptyResult();
  clearInputStatus("jd");
  hideLoading();
  elements.runNote.textContent = elements.resumeInput.value.trim()
    ? "简历已保留，请输入或上传新的岗位 JD"
    : getReadinessNote();

  if (returnToAnalyzer) {
    showPage("analyze");
    window.setTimeout(() => elements.jobInput.focus(), 0);
  }
}

function clearCurrentResume() {
  elements.resumeInput.value = "";
  elements.resumeFile.value = "";
  state.resumeSource = null;
  state.lastResult = null;
  state.capabilityDiscovery = null;
  state.capabilityAssessments = [];
  state.pendingAnalysis = null;
  renderEmptyResult();
  clearInputStatus("resume");
  renderFilePreviews("resume");
  hideLoading();
  elements.runNote.textContent = elements.jobInput.value.trim()
    ? "岗位 JD 已保留，请输入或上传新的简历"
    : getReadinessNote();
  elements.resumeInput.focus();
}

function isResumeFile(file) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".txt") ||
    name.endsWith(".pdf") ||
    name.endsWith(".docx") ||
    name.endsWith(".doc") ||
    file.type === "text/plain" ||
    file.type === "application/pdf" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

function getResumeFileValidationError(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".doc")) {
    return "当前暂不支持旧版 .doc，请先另存为 .docx、.pdf 或 .txt 后上传。";
  }
  if (!name.endsWith(".docx") && !name.endsWith(".pdf") && !name.endsWith(".txt") && !isResumeFile(file)) {
    return "当前支持 .txt、.docx 和可复制文本的 .pdf 简历。";
  }
  return "";
}

function isImageFile(file) {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name);
}

function isTextFile(file) {
  return file.type === "text/plain" || /\.txt$/i.test(file.name);
}

function isJdDocumentFile(file) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".txt")
    || name.endsWith(".docx")
    || name.endsWith(".pdf")
    || file.type === "text/plain"
    || file.type === "application/pdf"
    || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

function isJdFile(file) {
  return isImageFile(file) || isJdDocumentFile(file);
}

function findClipboardFile(event, matcher) {
  const files = [...(event.clipboardData?.files || [])];
  const file = files.find(matcher);
  if (file) return file;

  const items = [...(event.clipboardData?.items || [])];
  for (const item of items) {
    if (item.kind !== "file") continue;
    const itemFile = item.getAsFile();
    if (itemFile && matcher(itemFile)) {
      return itemFile;
    }
  }

  return null;
}

function findClipboardFiles(event, matcher) {
  const files = [...(event.clipboardData?.files || [])].filter(matcher);
  if (files.length) return files;

  return [...(event.clipboardData?.items || [])]
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file) => file && matcher(file));
}

function findDroppedFile(event, matcher) {
  const files = [...(event.dataTransfer?.files || [])];
  return files.find(matcher) || null;
}

function findDroppedFiles(event, matcher) {
  return [...(event.dataTransfer?.files || [])].filter(matcher);
}

function normalizeFileName(file, fallback) {
  return file?.name && file.name !== "image.png" ? file.name : fallback;
}

function getFileExtension(name = "") {
  const match = String(name).match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toUpperCase() : "FILE";
}

function formatFileSize(size = 0) {
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function createFileCard(source, target, index = 0) {
  const card = document.createElement("article");
  card.className = "file-preview-card";
  card.dataset.target = target;
  if (source.key) card.dataset.sourceKey = source.key;

  const icon = document.createElement("div");
  icon.className = "file-preview-icon";
  icon.dataset.ext = getFileExtension(source.name);
  icon.textContent = getFileExtension(source.name);

  const body = document.createElement("div");
  body.className = "file-preview-body";

  const title = document.createElement("strong");
  title.textContent = source.name || (target === "resume" ? "简历文件" : `JD 来源 ${index + 1}`);

  const meta = document.createElement("span");
  meta.textContent = [
    getFileExtension(source.name),
    source.sizeText,
    source.kindLabel,
  ].filter(Boolean).join(" · ");

  const actions = document.createElement("div");
  actions.className = "file-preview-actions";

  if (target === "resume") {
    const replaceButton = document.createElement("button");
    replaceButton.type = "button";
    replaceButton.dataset.fileAction = "replace-resume";
    replaceButton.textContent = "重新上传";
    actions.append(replaceButton);
  }

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.dataset.fileAction = target === "resume" ? "remove-resume" : "remove-jd";
  removeButton.textContent = "删除";
  actions.append(removeButton);

  body.append(title, meta, actions);
  card.append(icon, body);
  return card;
}

function renderFilePreviews(target) {
  const container = target === "resume" ? elements.resumeFilePreview : elements.jdFilePreview;
  const field = container?.closest(".document-field");
  if (!container) return;
  container.replaceChildren();

  if (target === "resume") {
    if (state.resumeSource) {
      container.append(createFileCard(state.resumeSource, "resume"));
    }
    field?.classList.toggle("file-backed", Boolean(state.resumeSource));
    return;
  }

  state.jdSources.forEach((source, index) => {
    container.append(createFileCard(source, "jd", index));
  });
  field?.classList.toggle("file-backed", state.jdSources.length > 0);
}

function cleanJobDescriptionText(rawText) {
  const original = rawText.replace(/\r/g, "").trim();
  if (!original) return "";

  const startPattern =
    /(岗位职责|职位职责|职位描述|工作职责|工作内容|岗位描述|主要职责|你将负责|工作任务|职位要求|岗位要求|任职要求|任职资格|任职条件|招聘要求|工作要求|任职标准|能力要求|技能要求|专业要求|学历要求|加分项|优先|技术问题|技术问答|面试题|问答题|开放问题|Responsibilities|Requirements|Qualifications|Job Description|What you will do|What you'll do|Who you are|Preferred|Bonus|Nice to have)/i;
  const stopPattern =
    /(公司介绍|关于我们|企业介绍|工商信息|公司地址|工作地址|相似职位|推荐职位|职位福利|薪资福利|福利待遇|职位亮点|企业信息|团队介绍|举报|分享|收藏|立即沟通|立即申请|投递简历|申请职位|查看更多|展开全部)/i;
  const noisePattern =
    /^(首页|登录|注册|消息|搜索|筛选|推荐|广告|打开APP|下载APP|扫码|微信|微博|分享|收藏|举报|反馈|上一页|下一页|更多|展开|收起|立即申请|申请职位|投递简历|在线沟通|查看地图|公司主页|职位详情|公司详情|热招职位|全部职位)$/i;
  const weakNoisePattern =
    /(浏览量|回复率|活跃|在线|刚刚|分钟前|小时前|天前|发布于|浏览|收藏|分享|举报|APP|扫码|微信|电话|邮箱|地图|地址|薪资|月薪|年薪|五险一金|双休|大小周|弹性|团建|带薪|补贴|餐补|房补|交通补助|股票期权|融资|天使轮|A轮|B轮|C轮|上市|不需要融资|公司规模|少于\d+人|\d+-\d+人)/i;
  const valuePattern =
    /(岗位|职位|职责|工作内容|要求|任职|资格|条件|经验|能力|熟悉|掌握|了解|负责|参与|协作|沟通|数据|产品|用户|项目|分析|设计|开发|运营|模型|大模型|机器学习|AI|LLM|RAG|Prompt|API|SQL|Python|JavaScript|React|HTML|CSS|JSON|Excel|本科|学历|专业|优先|加分|技术问题|技术问答|面试题|问答题|开放问题|如何|怎么|为什么|experience|skill|requirement|responsibilit|qualif|preferred|bonus|question)/i;

  const lines = original
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const kept = [];
  const seen = new Set();
  let insideJobBlock = false;
  let stopHit = false;

  for (const line of lines) {
    if (stopHit) break;
    const compact = line
      .replace(/^[^\w\u4e00-\u9fa5]+/, "")
      .replace(/[：:]\s*$/, "")
      .trim();
    if (!compact || compact.length > 260) continue;
    if (/^https?:\/\//i.test(compact)) continue;
    if (noisePattern.test(compact)) continue;

    if (startPattern.test(compact)) {
      insideJobBlock = true;
    } else if (insideJobBlock && stopPattern.test(compact) && kept.length >= 3) {
      stopHit = true;
      continue;
    }

    const bulletLike = /^([-*•·]|\d+[.、)]|[一二三四五六七八九十]+[、.])/.test(compact);
    const keywordHit = valuePattern.test(compact);
    const questionLike = /(技术问题|技术问答|面试题|问答题|开放问题|如何|怎么|为什么|请.*(说明|描述|解释|谈谈)|你.*理解|question|explain|describe|how would|what is|why)/i.test(compact)
      && (compact.includes("?") || compact.includes("？") || compact.length >= 12);
    const useful = insideJobBlock || bulletLike || keywordHit || questionLike;

    if (!useful) continue;
    if (!insideJobBlock && weakNoisePattern.test(compact) && !startPattern.test(compact)) continue;
    if (seen.has(compact)) continue;
    seen.add(compact);
    kept.push(compact);
  }

  const cleaned = kept.join("\n");
  const hasClearJobSignal = kept.some((line) => startPattern.test(line)) || kept.filter((line) => valuePattern.test(line)).length >= 3;
  if (cleaned && (hasClearJobSignal || cleaned.length >= Math.min(120, original.length * 0.25))) {
    return cleaned;
  }
  return original;
}

function applyCleanedJobText(rawText, sourceLabel = "JD 文本") {
  const cleaned = cleanJobDescriptionText(rawText);
  elements.jobInput.value = cleaned;
  state.jdTextEditedByUser = false;
  const removed = rawText.trim().length - cleaned.trim().length;
  if (removed > 30) {
    setInputStatus("jd", `${sourceLabel}已导入`, `已自动清理约 ${removed} 个无关字符`);
    elements.runNote.textContent = "已用规则层清理 JD 噪音";
  } else {
    setInputStatus("jd", `${sourceLabel}已导入`, "内容已准备分析");
  }
}

function applyNormalizedJobText(response, sourceLabel = "JD 文本") {
  const normalized = response.normalized_job;
  const cleaned = normalized?.cleaned_job_text?.trim();
  if (!cleaned) {
    throw new Error("LLM 没有提取到可靠 JD 内容。");
  }

  elements.jobInput.value = cleaned;
  state.jdTextEditedByUser = false;
  const questionCount = normalized.technical_questions?.length || 0;
  const roleText = normalized.role_title ? `${normalized.role_title} · ` : "";
  const detail = `${roleText}置信度 ${normalized.confidence}/100${questionCount ? ` · 技术问题 ${questionCount} 个` : ""}`;
  setInputStatus("jd", `${sourceLabel}已智能提取`, detail);
  elements.runNote.textContent = "已用 LLM 从 OCR 文本中提取 JD";
}

function getJdSourceKey(file) {
  const stableName = file.name && file.name !== "image.png" ? file.name : "";
  if (stableName || file.lastModified) {
    return [stableName || "clipboard-image", file.size || 0, file.lastModified || 0].join(":");
  }
  if (!clipboardFileKeys.has(file)) {
    clipboardFileSequence += 1;
    clipboardFileKeys.set(file, `clipboard-image:${Date.now()}:${clipboardFileSequence}:${file.size || 0}`);
  }
  return clipboardFileKeys.get(file);
}

function addJdSources(newSources) {
  const existingKeys = new Set(state.jdSources.map((source) => source.key));
  for (const source of newSources) {
    if (existingKeys.has(source.key)) continue;
    state.jdSources.push(source);
    existingKeys.add(source.key);
  }
  state.jdSources = state.jdSources.slice(0, 6);
}

function buildCombinedJdSourceText() {
  const sources = [...state.jdSources];
  if (state.jdTextEditedByUser && elements.jobInput.value.trim()) {
    sources.unshift({
      name: "用户补充或编辑的 JD 文本",
      rawText: elements.jobInput.value.trim(),
    });
  }

  if (!sources.length) return "";
  const markerBudget = sources.length * 48;
  const sourceBudget = Math.max(200, Math.floor((MAX_JOB_CHARS - markerBudget) / sources.length));
  return sources
    .map((source, index) => {
      const marker = `【来源 ${index + 1}/${sources.length}：${source.name}】`;
      return `${marker}\n${String(source.rawText || "").slice(0, sourceBudget)}`;
    })
    .join("\n\n")
    .slice(0, MAX_JOB_CHARS);
}

async function refreshJobTextFromSources() {
  const combinedText = buildCombinedJdSourceText();
  if (!combinedText) {
    elements.jobInput.value = "";
    clearInputStatus("jd");
    renderFilePreviews("jd");
    return;
  }

  try {
    if (state.apiAvailable && state.llmConfigured) {
      const normalized = await normalizeJobTextViaApi(combinedText);
      applyNormalizedJobText(normalized, `${state.jdSources.length} 个 JD 来源`);
    } else {
      applyCleanedJobText(combinedText, "JD 来源");
    }
  } catch (error) {
    applyCleanedJobText(combinedText, "JD 来源");
    elements.runNote.textContent = `JD 已删除并重新合并；LLM 整理暂未完成：${error.message}`;
  }
  setInputStatus("jd", `${state.jdSources.length} 个 JD 来源已保留`, state.jdSources.map((item) => item.name).join("、"));
  renderFilePreviews("jd");
}

async function removeJdSource(sourceKey) {
  state.jdSources = state.jdSources.filter((source) => source.key !== sourceKey);
  state.jdTextEditedByUser = false;
  await refreshJobTextFromSources();
}

async function handleResumeFile(file, source = "上传") {
  showLoading("正在读取简历文件");
  updateProgress(18, "上传简历", "正在为分析提取文件文本");

  try {
    const validationError = getResumeFileValidationError(file);
    if (validationError) {
      throw new Error(validationError);
    }
    const result = await extractResumeFile(file);
    elements.resumeInput.value = result.text;
    state.resumeSource = {
      key: `resume:${normalizeFileName(file, result.filename || "resume")}:${file.size || 0}:${file.lastModified || Date.now()}`,
      name: result.filename || normalizeFileName(file, "简历文件"),
      sizeText: formatFileSize(file.size),
      kindLabel: `${source}文件 · 已用于分析`,
    };
    renderFilePreviews("resume");
    updateProgress(100, "简历已提取", `${result.filename || file.name || "文件"}：${result.character_count} 字符`);
    setInputStatus("resume", "简历文件已导入", "已在后台提取文本用于匹配分析");
    elements.runNote.textContent = result.warnings?.length ? result.warnings.join("；") : `${source}简历文本已提取`;
  } catch (error) {
    elements.runNote.textContent = error.message;
    setInputStatus("resume", "简历上传失败", error.message);
    updateProgress(100, "提取失败", error.message);
  } finally {
    window.setTimeout(hideLoading, 700);
    elements.resumeFile.value = "";
    showPage("analyze");
  }
}

async function handleJdFiles(inputFiles, source = "上传") {
  const availableSlots = Math.max(0, 6 - state.jdSources.length);
  const existingKeys = new Set(state.jdSources.map((item) => item.key));
  const files = [...inputFiles]
    .filter(isJdFile)
    .filter((file) => !existingKeys.has(getJdSourceKey(file)))
    .slice(0, availableSlots);
  if (!files.length) {
    const title = availableSlots ? "这些 JD 文件已经添加" : "已达到 6 个 JD 来源上限";
    const detail = availableSlots ? "请选择其他截图或文件" : "如需分析另一份岗位，请先点击“清空”";
    setInputStatus("jd", title, detail);
    return;
  }

  showLoading("正在读取多个 JD 文件");
  updateProgress(8, "准备 JD", `准备处理 ${files.length} 个文件`);

  try {
    const extractedSources = [];
    const warnings = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const baseProgress = 10 + Math.round((index / files.length) * 68);
      updateProgress(baseProgress, `读取 JD ${index + 1}/${files.length}`, file.name || "剪贴板文件");

      if (isImageFile(file)) {
        const text = await extractTextFromJdImage(file, index, files.length);
        if (!text) {
          warnings.push(`${file.name || `截图 ${index + 1}`} 未识别到文字`);
          continue;
        }
        extractedSources.push({
          key: getJdSourceKey(file),
          name: normalizeFileName(file, `剪贴板 JD 截图 ${state.jdSources.length + index + 1}`),
          rawText: text,
          sizeText: formatFileSize(file.size),
          kindLabel: "图片 OCR",
        });
      } else {
        const result = await extractJobDocument(file);
        extractedSources.push({
          key: getJdSourceKey(file),
          name: result.filename || file.name,
          rawText: result.text,
          sizeText: formatFileSize(file.size),
          kindLabel: isTextFile(file) ? "TXT 文本" : "文档解析",
        });
        if (result.warnings?.length) warnings.push(...result.warnings);
      }
    }

    if (!extractedSources.length) {
      throw new Error("没有从上传的 JD 文件中提取到文字。");
    }

    addJdSources(extractedSources);
    renderFilePreviews("jd");
    const combinedText = buildCombinedJdSourceText();
    const sourceLabel = `${source}${state.jdSources.length} 个 JD 文件`;

    if (state.apiAvailable && state.llmConfigured) {
      try {
        updateProgress(88, "LLM 智能整理 JD", "正在逐一核对全部截图并重新排版");
        const normalized = await normalizeJobTextViaApi(combinedText);
        applyNormalizedJobText(normalized, sourceLabel);
      } catch (normalizationError) {
        applyCleanedJobText(combinedText, sourceLabel);
        elements.runNote.textContent = `LLM 合并失败，已使用规则清洗：${normalizationError.message}`;
      }
    } else {
      applyCleanedJobText(combinedText, sourceLabel);
    }

    const warningText = warnings.length ? `；${warnings.join("；")}` : "";
    setInputStatus(
      "jd",
      `${state.jdSources.length} 个 JD 来源已保留`,
      `${state.jdSources.map((item) => item.name).join("、")}${warningText}；继续上传会追加`,
    );
    updateProgress(100, "JD 已智能整理", `已合并 ${state.jdSources.length} 个来源`);
  } catch (error) {
    elements.runNote.textContent = error.message;
    updateProgress(100, "JD 读取失败", error.message);
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

async function ensureApiAvailable() {
  if (state.apiAvailable) {
    return true;
  }

  elements.runNote.textContent = "正在连接云端 API";
  await detectBackend();
  return state.apiAvailable;
}

function loadStoredAuthToken() {
  if (state.authProvider === "supabase") return;
  try {
    state.authToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || "";
  } catch (error) {
    state.authToken = "";
  }
}

function setAuthToken(token) {
  state.authToken = token || "";
  if (state.authProvider === "supabase") return;
  try {
    if (state.authToken) {
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, state.authToken);
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
  } catch (error) {
    // localStorage can be unavailable in some privacy modes; auth still works for the current page.
  }
}

function getAuthHeaders() {
  return state.authToken ? { Authorization: `Bearer ${state.authToken}` } : {};
}

function setAuthStatus(message, stateName = "") {
  elements.authStatus.textContent = message;
  if (stateName) {
    elements.authStatus.dataset.state = stateName;
  } else {
    elements.authStatus.removeAttribute("data-state");
  }
}

function setAuthBusy(isBusy) {
  elements.authLogin.disabled = isBusy;
  elements.authRegister.disabled = isBusy;
  elements.authClose.disabled = isBusy;
  elements.authGuest.disabled = isBusy;
  elements.authReset.disabled = isBusy;
}

function updateAuthUi() {
  const isSignedIn = Boolean(state.currentUser);
  elements.authOpen.hidden = isSignedIn;
  elements.userChip.hidden = !isSignedIn;
  elements.authLogout.hidden = !isSignedIn;
  elements.authOpen.disabled = !state.apiAvailable;

  if (isSignedIn) {
    elements.userChip.textContent = state.currentUser.email;
  } else {
    elements.userChip.textContent = "";
    elements.authOpen.textContent = state.apiAvailable ? "登录 / 注册" : "云端连接中";
  }
}

function setAuthMode(mode = "default") {
  const isRecovery = mode === "recovery";
  state.authRecoveryMode = isRecovery;
  elements.authTitle.textContent = isRecovery ? "设置新密码" : "登录或创建账户";
  elements.authCopy.textContent = isRecovery
    ? "请输入至少 8 位的新密码。完成后即可继续使用当前账户。"
    : state.supabaseClient
      ? "使用邮箱保存分析历史。注册后需要完成邮箱验证；也可以直接以游客模式使用分析工具。"
      : "使用邮箱保存分析历史，也可以直接以游客模式使用分析工具。";
  elements.authEmailFeature.textContent = state.supabaseClient ? "邮箱验证" : "邮箱登录";
  elements.authEmailField.hidden = isRecovery;
  elements.authEmail.required = !isRecovery;
  elements.authPasswordLabel.textContent = isRecovery ? "New password" : "Password";
  elements.authPassword.autocomplete = isRecovery ? "new-password" : "current-password";
  elements.authRegister.hidden = isRecovery;
  elements.authReset.hidden = isRecovery || !state.supabaseClient;
  elements.authGuest.hidden = isRecovery;
  elements.authLogin.textContent = isRecovery ? "更新密码" : "登录";
}

function openAuthModal() {
  if (!state.apiAvailable) {
    return;
  }
  if (!state.authRecoveryMode) {
    setAuthMode();
  }
  elements.authModal.hidden = false;
  setAuthStatus(
    state.supabaseClient
      ? "注册后请前往邮箱完成验证。"
      : "Supabase 尚未配置，当前使用兼容登录模式。",
  );
  elements.authEmail.focus();
}

function closeAuthModal() {
  elements.authModal.hidden = true;
  elements.authForm.reset();
  setAuthMode();
  setAuthStatus("注册后请前往邮箱完成验证。");
}

async function submitAuth(mode) {
  const email = elements.authEmail.value.trim();
  const password = elements.authPassword.value;

  if (!state.apiAvailable) {
    setAuthStatus("后端 API 暂未连接，无法使用账户功能。", "error");
    return;
  }

  if (state.authRecoveryMode) {
    if (!state.supabaseClient || password.length < 8) {
      setAuthStatus("新密码至少需要 8 位。", "error");
      return;
    }
    setAuthBusy(true);
    setAuthStatus("正在更新密码...");
    try {
      const { error: updateError } = await state.supabaseClient.auth.updateUser({ password });
      if (updateError) throw updateError;
      setAuthStatus("密码已更新。", "success");
      setAuthMode();
      await fetchCurrentUser();
      window.setTimeout(closeAuthModal, 520);
    } catch (error) {
      setAuthStatus(error.message, "error");
    } finally {
      setAuthBusy(false);
    }
    return;
  }

  if (!email || password.length < 8) {
    setAuthStatus("请输入邮箱，并确保密码至少 8 位。", "error");
    return;
  }

  setAuthBusy(true);
  setAuthStatus(mode === "register" ? "正在创建账户..." : "正在登录...");

  try {
    if (state.supabaseClient) {
      const result = mode === "register"
        ? await state.supabaseClient.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}${window.location.pathname}#analyze`,
            },
          })
        : await state.supabaseClient.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (!result.data.session) {
        setAuthStatus("注册成功，请打开验证邮件完成确认后再登录。", "success");
        return;
      }
      setAuthToken(result.data.session.access_token);
      await fetchCurrentUser();
      setAuthStatus("登录成功。", "success");
      if (document.body.dataset.page === "history") loadHistoryRecords();
      window.setTimeout(closeAuthModal, 420);
      return;
    }

    const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
    const response = await fetchJsonWithTimeout(
      `${state.apiBaseUrl}${endpoint}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      },
      8000,
    );
    setAuthToken(response.access_token);
    state.currentUser = response.user;
    setAuthStatus("登录成功。", "success");
    updateAuthUi();
    if (document.body.dataset.page === "history") {
      loadHistoryRecords();
    }
    window.setTimeout(closeAuthModal, 420);
  } catch (error) {
    setAuthStatus(error.message, "error");
  } finally {
    setAuthBusy(false);
  }
}

async function fetchCurrentUser() {
  if (!state.apiAvailable || !state.authToken) {
    state.currentUser = null;
    updateAuthUi();
    return;
  }

  try {
    const response = await fetchJsonWithTimeout(
      `${state.apiBaseUrl}/api/auth/me`,
      {
        headers: getAuthHeaders(),
      },
      8000,
    );
    state.currentUser = response.user;
  } catch (error) {
    state.currentUser = null;
    setAuthToken("");
  } finally {
    updateAuthUi();
  }
}

async function logoutCurrentUser() {
  const token = state.authToken;
  if (state.supabaseClient) {
    await state.supabaseClient.auth.signOut();
  }
  state.currentUser = null;
  state.historyRecords = [];
  setAuthToken("");
  updateAuthUi();
  if (document.body.dataset.page === "history") {
    renderHistorySignedOut();
  }

  if (!state.apiAvailable || !token) {
    return;
  }

  try {
    await fetchJsonWithTimeout(
      `${state.apiBaseUrl}/api/auth/logout`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      8000,
    );
  } catch (error) {
    console.warn(error);
  }
}

function normalizeHistoryItems(items, limit = 12) {
  return [...new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean))].slice(0, limit);
}

function buildHistoryPayload(result) {
  return {
    match_score: Number(result.score) || 0,
    strengths: normalizeHistoryItems((result.matched_keywords || []).map((keyword) => keyword.name)),
    weaknesses: normalizeHistoryItems((result.missing_keywords || []).map((keyword) => keyword.name)),
    suggestions: normalizeHistoryItems(result.suggestions || []),
  };
}

async function saveAnalysisHistory(resumeText, jobText, result) {
  if (!state.apiAvailable || !state.currentUser) {
    elements.runNote.textContent = "分析完成；游客模式不会保存历史，登录后可自动保存";
    return;
  }

  try {
    const response = await fetchJsonWithTimeout(
      `${state.apiBaseUrl}/api/history`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(buildHistoryPayload(result)),
      },
      12000,
    );
    state.historyRecords = [response.record, ...state.historyRecords.filter((record) => record.id !== response.record.id)];
    elements.runNote.textContent = "分析完成；结果已保存到 History";
  } catch (error) {
    elements.runNote.textContent = "分析完成；历史保存失败，可稍后重试";
    console.warn(error);
  }
}

function renderHistorySignedOut() {
  state.historyRecords = [];
  elements.historyStatus.textContent = state.apiAvailable
    ? "请先登录或注册账户，再查看自己的分析历史。游客模式可以分析，但不会保存记录。"
    : "云端 API 暂未连接，暂时无法读取分析历史。";
  elements.historyList.replaceChildren();
}

function formatHistoryDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createHistoryTags(label, items) {
  const wrapper = document.createElement("div");
  wrapper.className = "history-tags";

  const title = document.createElement("span");
  title.textContent = label;
  wrapper.append(title);

  const visibleItems = normalizeHistoryItems(items, 8);
  if (!visibleItems.length) {
    const empty = document.createElement("span");
    empty.textContent = "暂无";
    wrapper.append(empty);
    return wrapper;
  }

  visibleItems.forEach((item) => {
    const tag = document.createElement("span");
    tag.textContent = item;
    wrapper.append(tag);
  });
  return wrapper;
}

function renderHistoryRecords(records) {
  elements.historyList.replaceChildren();
  if (!records.length) {
    elements.historyStatus.textContent = "还没有分析历史。完成一次分析后，这里会显示保存的记录。";
    return;
  }

  elements.historyStatus.textContent = `共 ${records.length} 条分析记录。`;
  records.forEach((record) => {
    const card = document.createElement("article");
    card.className = "history-card";

    const top = document.createElement("div");
    top.className = "history-card-top";

    const score = document.createElement("div");
    score.className = "history-score";
    const scoreValue = document.createElement("strong");
    scoreValue.textContent = String(record.match_score);
    score.append(scoreValue, document.createTextNode("/100"));

    const date = document.createElement("span");
    date.className = "history-date";
    date.textContent = formatHistoryDate(record.created_at);
    top.append(score, date);

    const actions = document.createElement("div");
    actions.className = "history-actions";
    const tags = document.createElement("div");
    tags.className = "history-list";
    tags.append(
      createHistoryTags("优势", record.strengths),
      createHistoryTags("缺口", record.weaknesses),
      createHistoryTags("建议", record.suggestions),
    );

    const deleteButton = document.createElement("button");
    deleteButton.className = "button ghost";
    deleteButton.type = "button";
    deleteButton.dataset.historyDelete = String(record.id);
    deleteButton.textContent = "Delete";
    actions.append(tags, deleteButton);

    card.append(top, actions);
    elements.historyList.append(card);
  });
}

async function loadHistoryRecords() {
  if (!state.apiAvailable || !state.currentUser) {
    renderHistorySignedOut();
    return;
  }

  elements.historyStatus.textContent = "正在读取分析历史...";
  try {
    const response = await fetchJsonWithTimeout(
      `${state.apiBaseUrl}/api/history`,
      {
        headers: getAuthHeaders(),
      },
      12000,
    );
    state.historyRecords = response.records || [];
    renderHistoryRecords(state.historyRecords);
  } catch (error) {
    elements.historyStatus.textContent = `历史记录读取失败：${error.message}`;
    elements.historyList.replaceChildren();
  }
}

async function deleteHistoryRecord(recordId) {
  if (!state.apiAvailable || !state.currentUser) {
    renderHistorySignedOut();
    return;
  }

  const confirmed = window.confirm("确定删除这条分析记录吗？删除后无法在 History 页面恢复。");
  if (!confirmed) return;

  elements.historyStatus.textContent = "正在删除记录...";
  try {
    await fetchJsonWithTimeout(
      `${state.apiBaseUrl}/api/history/${recordId}`,
      {
        method: "DELETE",
        headers: getAuthHeaders(),
      },
      12000,
    );
    await loadHistoryRecords();
  } catch (error) {
    elements.historyStatus.textContent = `删除失败：${error.message}`;
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

async function extractPlainTextFile(file) {
  const text = (await file.text()).trim();
  if (!text) {
    throw new Error("文件中没有读取到文本内容。");
  }
  return {
    filename: file.name,
    text,
    character_count: text.length,
    warnings: [],
  };
}

async function extractResumeFile(file) {
  if (isTextFile(file)) {
    return extractPlainTextFile(file);
  }

  const apiReady = await ensureApiAvailable();
  if (!apiReady) {
    throw new Error("云端 API 暂时未连接，请确认后端服务是否可访问。");
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

async function extractJobDocument(file) {
  if (isTextFile(file)) {
    return extractPlainTextFile(file);
  }

  const apiReady = await ensureApiAvailable();
  if (!apiReady) {
    throw new Error("云端 API 暂时未连接，DOCX/PDF 岗位文件无法解析。");
  }

  const formData = new FormData();
  formData.append("file", file);

  return fetchJsonWithTimeout(
    `${state.apiBaseUrl}/api/extract/job`,
    {
      method: "POST",
      body: formData,
    },
    30000,
  );
}

async function prepareImageForOcr(file) {
  if (!window.createImageBitmap) {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const targetWidth = Math.min(2600, Math.max(bitmap.width, 1800));
  const scale = Math.min(2, targetWidth / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  let luminanceTotal = 0;
  const sampleStep = Math.max(4, Math.floor(pixels.length / 40000 / 4) * 4);

  for (let index = 0; index < pixels.length; index += sampleStep) {
    luminanceTotal += pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
  }

  const sampleCount = Math.ceil(pixels.length / sampleStep);
  const shouldInvert = luminanceTotal / sampleCount < 105;

  for (let index = 0; index < pixels.length; index += 4) {
    let gray = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
    if (shouldInvert) gray = 255 - gray;
    gray = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
    pixels[index] = gray;
    pixels[index + 1] = gray;
    pixels[index + 2] = gray;
  }

  context.putImageData(imageData, 0, 0);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob || file), "image/png");
  });
}

async function getJdOcrWorker() {
  if (!window.Tesseract) {
    throw new Error("OCR 组件加载失败，请检查网络后重试，或直接粘贴 JD 文本。");
  }

  if (!state.jdOcrWorkerPromise) {
    state.jdOcrWorkerPromise = Tesseract.createWorker(["chi_sim", "eng"], 1, {
      logger: (message) => state.jdOcrProgressHandler?.(message),
    }).catch((error) => {
      state.jdOcrWorkerPromise = null;
      throw error;
    });
  }

  return state.jdOcrWorkerPromise;
}

async function extractTextFromJdImage(file, fileIndex = 0, fileCount = 1) {
  if (!window.Tesseract) {
    throw new Error("OCR 组件加载失败，请检查网络后重试，或直接粘贴 JD 文本。");
  }

  const image = await prepareImageForOcr(file);
  const worker = await getJdOcrWorker();
  state.jdOcrProgressHandler = (message) => {
    if (message.status !== "recognizing text") return;
    const completedShare = fileIndex / fileCount;
    const currentShare = message.progress / fileCount;
    const value = Math.round(10 + (completedShare + currentShare) * 72);
    updateProgress(value, `识别 JD 截图 ${fileIndex + 1}/${fileCount}`, file.name || "正在提取文字");
  };

  try {
    const result = await worker.recognize(image);
    return result.data.text.trim();
  } finally {
    state.jdOcrProgressHandler = null;
  }
}

async function requestPasswordReset() {
  const email = elements.authEmail.value.trim();
  if (!state.supabaseClient) {
    setAuthStatus("请先配置 Supabase，才能使用邮箱找回密码。", "error");
    return;
  }
  if (!email) {
    setAuthStatus("请先填写需要重置密码的邮箱。", "error");
    elements.authEmail.focus();
    return;
  }

  setAuthBusy(true);
  setAuthStatus("正在发送重置邮件...");
  try {
    const { error: resetError } = await state.supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    });
    if (resetError) throw resetError;
    setAuthStatus("重置邮件已发送，请检查邮箱。", "success");
  } catch (error) {
    setAuthStatus(error.message, "error");
  } finally {
    setAuthBusy(false);
  }
}

async function initializeSupabaseAuth() {
  if (!window.supabase?.createClient) {
    state.authProvider = "legacy";
    return;
  }

  let supabaseUrl = SUPABASE_URL;
  let supabasePublishableKey = SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabasePublishableKey) {
    try {
      const apiBaseUrl = getApiBaseUrlCandidate();
      const authConfig = await fetchJsonWithTimeout(
        `${apiBaseUrl}/api/auth/config`,
        {},
        API_HEALTH_TIMEOUT_MS,
      );
      if (authConfig.supabase_configured) {
        supabaseUrl = authConfig.supabase_url;
        supabasePublishableKey = authConfig.supabase_publishable_key;
      }
    } catch (error) {
      console.warn("Supabase auth configuration is unavailable.", error);
    }
  }

  if (!supabaseUrl || !supabasePublishableKey) {
    state.authProvider = "legacy";
    return;
  }

  state.authProvider = "supabase";
  state.supabaseClient = window.supabase.createClient(
    supabaseUrl,
    supabasePublishableKey,
  );
  const { data } = await state.supabaseClient.auth.getSession();
  setAuthToken(data.session?.access_token || "");
  state.supabaseClient.auth.onAuthStateChange((event, session) => {
    window.setTimeout(async () => {
      setAuthToken(session?.access_token || "");
      if (event === "PASSWORD_RECOVERY") {
        setAuthMode("recovery");
        elements.authModal.hidden = false;
        setAuthStatus("身份已验证，请设置新密码。", "success");
        elements.authPassword.focus();
      }
      if (state.apiAvailable) await fetchCurrentUser();
    }, 0);
  });
}

async function handlePastedJobText(rawText) {
  const text = rawText.trim();
  if (!text) return;

  if (state.jdSources.length >= 6) {
    setInputStatus("jd", "已达到 6 个 JD 来源上限", "如需分析另一份岗位，请先点击“清空”");
    return;
  }

  addJdSources([
    {
      key: `pasted-text:${Date.now()}:${text.length}`,
      name: `粘贴文本 ${state.jdSources.length + 1}`,
      rawText: text,
      sizeText: `${text.length} 字符`,
      kindLabel: "手动粘贴",
    },
  ]);
  renderFilePreviews("jd");

  const combinedText = buildCombinedJdSourceText();
  showLoading("正在智能整理岗位 JD");
  updateProgress(28, "读取粘贴内容", "正在识别岗位职责、要求和加分项");

  try {
    if (state.apiAvailable && state.llmConfigured) {
      updateProgress(66, "LLM 智能整理 JD", "正在去除网页噪音并统一排版");
      const normalized = await normalizeJobTextViaApi(combinedText);
      applyNormalizedJobText(normalized, `${state.jdSources.length} 个 JD 来源`);
    } else {
      applyCleanedJobText(combinedText, "JD 文本");
      elements.runNote.textContent = "默认 LLM 暂不可用，已使用本地规则整理";
    }
    setInputStatus("jd", `${state.jdSources.length} 个 JD 来源已保留`, "继续粘贴或上传会自动追加并重新整理");
    updateProgress(100, "JD 已智能整理", `已合并 ${state.jdSources.length} 个来源`);
  } catch (error) {
    applyCleanedJobText(combinedText, "JD 文本");
    elements.runNote.textContent = `LLM 整理失败，已保留提取文本：${error.message}`;
    updateProgress(100, "已保留原始内容", "可以直接编辑后继续分析");
  } finally {
    window.setTimeout(hideLoading, 700);
  }
}

async function normalizeJobTextViaApi(rawText) {
  return fetchJsonWithTimeout(
    `${state.apiBaseUrl}/api/normalize/job`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw_text: rawText,
      }),
    },
    LLM_REQUEST_TIMEOUT_MS,
  );
}

function canGenerateAiAdvice() {
  return state.apiAvailable && state.llmConfigured;
}

function getAiAdvicePlaceholderMessage() {
  if (canGenerateAiAdvice()) {
    return "基础分析已完成，可以生成 AI 建议";
  }

  if (!state.apiAvailable) {
    return "云端 API 连接中，连接后可使用站点默认 LLM";
  }

  return "站点默认 LLM 暂未配置，请稍后再试";
}

function updateAiAdviceAvailability() {
  if (!state.lastResult) {
    elements.aiAdviceButton.disabled = true;
    return;
  }

  elements.aiAdviceButton.disabled = !canGenerateAiAdvice();
}

function getStoredAiAdvice() {
  if (!state.lastResult) return null;
  return state.lastResult.ai_advice || null;
}

function hasAnyStoredAiAdvice() {
  if (!state.lastResult) return false;
  return Boolean(
    state.lastResult.ai_advice,
  );
}

async function generateAiAdvice(resumeText, jobText) {
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
        capability_assessments: state.capabilityAssessments,
        thinking: state.thinkingEnabled,
      }),
    },
    LLM_REQUEST_TIMEOUT_MS,
  );
}

async function discoverCapabilitiesViaApi(resumeText, jobText) {
  return fetchJsonWithTimeout(
    `${state.apiBaseUrl}/api/capabilities`,
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
    LLM_REQUEST_TIMEOUT_MS,
  );
}

function buildCapabilityFallback(resumeText, jobText) {
  let jobKeywords = state.keywords
    .filter((keyword) => containsAny(jobText, keyword.aliases))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8);
  if (!jobKeywords.length) {
    jobKeywords = [
      { name: "岗位核心任务", category: "岗位能力", weight: 4, aliases: [], suggestion: "补充与岗位职责直接相关的真实任务。" },
      { name: "专业方法与工具", category: "专业能力", weight: 3, aliases: [], suggestion: "说明使用过的方法、工具和熟练程度。" },
      { name: "成果证据质量", category: "成果表达", weight: 3, aliases: [], suggestion: "补充可核验的交付物、影响或量化结果。" },
    ];
  }

  return {
    role_title: "当前目标岗位",
    engine: "rule_fallback",
    note: "云端能力识别暂不可用，已根据 JD 关键词生成基础能力表。",
    capabilities: jobKeywords.map((keyword) => {
      const matched = keyword.aliases.length ? containsAny(resumeText, keyword.aliases) : false;
      return {
        title: keyword.name,
        category: "professional",
        source: "explicit",
        importance: keyword.weight >= 5 ? "must_have" : keyword.weight >= 3 ? "important" : "nice_to_have",
        weight: keyword.weight,
        jd_evidence: `JD 中出现与“${keyword.name}”相关的要求`,
        resume_evidence: matched ? "简历中识别到相关关键词" : "",
        inferred_proficiency: matched ? "basic" : "unknown",
        confidence: matched ? 60 : 40,
        assessment_prompt: keyword.suggestion,
      };
    }),
  };
}

function capabilityCategoryLabel(category) {
  return {
    tool: "工具技能",
    professional: "专业方法",
    domain: "领域知识",
    language: "语言能力",
    soft: "软性能力",
  }[category] || "岗位能力";
}

function capabilitySourceLabel(source) {
  return source === "inferred" ? "职责隐含" : "JD 明确";
}

function createCapabilitySelect(selectedValue) {
  const select = document.createElement("select");
  select.className = "capability-proficiency";
  select.setAttribute("aria-label", "选择真实熟练度");
  [
    ["unknown", "暂不确定"],
    ["none", "尚未具备"],
    ["basic", "基础了解"],
    ["intermediate", "熟练使用"],
    ["advanced", "高级应用"],
    ["expert", "专家水平"],
  ].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = value === selectedValue;
    select.append(option);
  });
  return select;
}

function renderCapabilityReview(discovery) {
  state.capabilityDiscovery = discovery;
  const capabilities = discovery.capabilities || [];
  elements.capabilityRows.replaceChildren();
  elements.capabilityRole.textContent = discovery.role_title || "当前目标岗位";
  elements.capabilityCount.textContent = String(capabilities.length);
  elements.capabilityEngine.textContent = discovery.engine === "rule_fallback"
    ? "规则回退"
    : `${discovery.provider || state.llmProvider || "LLM"} + JD`;
  elements.capabilityNote.textContent = discovery.note
    || "职责隐含条件只在能够从 JD 任务直接推导时展示；请按真实情况确认。";

  capabilities.forEach((capability, index) => {
    const row = document.createElement("div");
    row.className = "capability-row";
    row.dataset.capabilityIndex = String(index);
    row.setAttribute("role", "row");

    const name = document.createElement("div");
    name.className = "capability-name";
    const title = document.createElement("strong");
    title.textContent = capability.title;
    const tags = document.createElement("div");
    tags.className = "capability-tags";
    [
      capabilityCategoryLabel(capability.category),
      capabilitySourceLabel(capability.source),
      importanceText(capability.importance),
    ].forEach((label) => {
      const tag = document.createElement("span");
      tag.textContent = label;
      tags.append(tag);
    });
    name.append(title, tags);

    const jdEvidence = document.createElement("p");
    jdEvidence.className = "capability-evidence";
    jdEvidence.textContent = capability.jd_evidence || "未返回具体依据";

    const resumeEvidence = document.createElement("p");
    resumeEvidence.className = "capability-evidence";
    resumeEvidence.textContent = capability.resume_evidence || "简历中暂未识别到直接证据";

    const select = createCapabilitySelect(capability.inferred_proficiency || "unknown");

    const evidenceInput = document.createElement("input");
    evidenceInput.className = "capability-user-evidence";
    evidenceInput.type = "text";
    evidenceInput.maxLength = 500;
    evidenceInput.placeholder = capability.assessment_prompt || "补充真实项目、任务或成果";
    evidenceInput.setAttribute("aria-label", `${capability.title}的补充证据`);

    row.append(name, jdEvidence, resumeEvidence, select, evidenceInput);
    elements.capabilityRows.append(row);
  });
}

function collectCapabilityAssessments() {
  const capabilities = state.capabilityDiscovery?.capabilities || [];
  return [...elements.capabilityRows.querySelectorAll(".capability-row")]
    .map((row) => {
      const capability = capabilities[Number(row.dataset.capabilityIndex)];
      if (!capability) return null;
      return {
        title: capability.title,
        category: capability.category,
        importance: capability.importance,
        weight: capability.weight,
        proficiency: row.querySelector(".capability-proficiency")?.value || "unknown",
        evidence: row.querySelector(".capability-user-evidence")?.value.trim() || "",
      };
    })
    .filter((item) => item && item.proficiency !== "unknown");
}

async function prepareCapabilityReview(resumeText, jobText) {
  showLoading("正在识别岗位显性与隐性能力");
  updateProgress(34, "能力识别", "正在分析工具、专业方法、领域知识和软性条件");

  let discovery;
  if (state.apiAvailable && state.llmConfigured) {
    try {
      discovery = await discoverCapabilitiesViaApi(resumeText, jobText);
    } catch (error) {
      discovery = buildCapabilityFallback(resumeText, jobText);
      discovery.note = `AI 能力识别暂未完成，已使用规则生成基础表：${error.message}`;
    }
  } else {
    discovery = buildCapabilityFallback(resumeText, jobText);
  }

  state.pendingAnalysis = { resumeText, jobText };
  state.capabilityAssessments = [];
  renderCapabilityReview(discovery);
  updateProgress(100, "能力表已生成", "请确认真实熟练度后继续");
  hideLoading();
  showPage("capabilities");
}

async function completeAnalysis(resumeText, jobText, capabilityAssessments = []) {
  state.capabilityAssessments = capabilityAssessments;
  showLoading("正在计算综合匹配度");
  try {
    updateProgress(28, "规则分析", "正在识别岗位关键词和简历证据");
    const result = await runAnalysis(resumeText, jobText);
    if (state.apiAvailable && state.llmConfigured) {
      updateProgress(
        58,
        "AI 综合分析",
        state.thinkingEnabled
          ? "深度思考已开启，正在融合语义、经历、简历质量与能力自评"
          : "快速模式已开启，正在融合语义、经历、简历质量与能力自评",
      );
      try {
        const response = await generateAiAdvice(resumeText, jobText);
        applyAiScoringToResult(result, response);
      } catch (aiError) {
        result.ai_error = aiError.message;
        elements.runNote.textContent = "AI 分析超时或失败，已保留关键词初步结果";
      }
    }
    updateProgress(90, "生成结果", "正在整理评分、缺口和建议");
    renderResultPage(result);
    await saveAnalysisHistory(resumeText, jobText, result);
  } catch (error) {
    updateProgress(100, "分析失败", error.message);
    elements.runNote.textContent = error.message;
    window.setTimeout(hideLoading, 900);
  }
}

async function runAnalysis(resumeText, jobText) {
  if (state.apiAvailable) {
    try {
      elements.runNote.textContent = "后端 API 分析中";
      return await analyzeViaApi(resumeText, jobText);
    } catch (error) {
      state.apiAvailable = false;
      state.apiBaseUrl = "";
      updateRuntimeStatus();
      elements.runNote.textContent = "后端不可用，已切换本地分析";
      console.warn(error);
    }
  }

  return analyze(resumeText, jobText);
}

function scoreLabel(score) {
  if (score >= 80) return "综合匹配度较强";
  if (score >= 60) return "匹配度中等";
  if (score >= 40) return "具备部分相关性";
  return "核心要求匹配较弱";
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

function proficiencyText(proficiency) {
  const labels = {
    unknown: "暂不确定",
    none: "尚未具备",
    basic: "基础了解",
    intermediate: "熟练使用",
    advanced: "高级应用",
    expert: "专家水平",
  };
  return labels[proficiency] || proficiency;
}

function impactText(impact) {
  const labels = {
    high: "高影响",
    medium: "中影响",
    low: "低影响",
  };
  return labels[impact] || impact;
}

function credibilityText(value) {
  const labels = {
    high: "可信度高",
    medium: "可信度中等",
    low: "可信度较低",
    unverified: "无法核验",
  };
  return labels[value] || value;
}

function companyScaleText(value) {
  const labels = {
    large: "大型企业",
    medium: "中型企业",
    small: "小型企业",
    startup: "初创企业",
    unknown: "规模未知",
  };
  return labels[value] || value;
}

function screeningDecisionText(value) {
  const labels = {
    strong_pass: "较强通过倾向",
    borderline: "边界候选",
    weak_pass: "谨慎进入下一轮",
    reject: "当前证据不足",
  };
  return labels[value] || value;
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

const STAR_DIMENSIONS = [
  {
    key: "situation",
    label: "S",
    title: "岗位场景",
    question: "这个岗位真正需要你进入什么业务或团队语境？",
  },
  {
    key: "task",
    label: "T",
    title: "核心任务",
    question: "JD 希望你具体承担哪些任务？",
  },
  {
    key: "action",
    label: "A",
    title: "行动证据",
    question: "你的简历是否证明你做过相似动作？",
  },
  {
    key: "result",
    label: "R",
    title: "结果证明",
    question: "你的经历是否有可验证的产出和影响？",
  },
];

function compactText(value, fallback = "暂无明确证据") {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join("；") || fallback;
  }
  return String(value || "").trim() || fallback;
}

function takeItems(items, limit = 3) {
  return (items || []).filter(Boolean).slice(0, limit);
}

function getFallbackStarInsights(result = {}) {
  const topGap = result.priority_gaps?.[0];
  const matchedNames = takeItems(result.matched_keywords?.map((item) => item.name), 4);
  const missingNames = takeItems(result.missing_keywords?.map((item) => item.name), 4);
  const topSuggestion = result.suggestion_items?.[0];

  return [
    {
      key: "situation",
      status: result.score >= 60 ? "已部分对齐" : "需要补充",
      score: result.score,
      jd: matchedNames.length ? `JD 中已识别到：${matchedNames.join("、")}` : "已根据 JD 建立基础岗位画像。",
      resume: "当前为规则层初步判断，AI 语义判断完成后会更细。",
      gap: topGap ? topGap.suggestion : "建议补充更贴近岗位业务场景的项目描述。",
      action: "把最相关的项目放到简历靠前位置，并写清楚它服务的业务、用户或团队目标。",
    },
    {
      key: "task",
      status: missingNames.length ? "存在缺口" : "覆盖较好",
      score: result.score,
      jd: missingNames.length ? `优先关注：${missingNames.join("、")}` : "主要任务关键词已覆盖。",
      resume: matchedNames.length ? `已体现：${matchedNames.join("、")}` : "简历暂未体现明显任务证据。",
      gap: topGap ? `${topGap.name}：${topGap.suggestion}` : "继续强化岗位核心任务的直接证据。",
      action: topSuggestion?.suggestion || "为每个核心任务补一句你做了什么、用什么方法、产出是什么。",
    },
    {
      key: "action",
      status: "需要证据",
      score: result.score,
      jd: "JD 不只看技能名，也看你是否真的执行过类似动作。",
      resume: "规则层只能看到关键词，无法完全判断行动深度。",
      gap: "如果简历只写“参与/了解”，说服力会偏弱。",
      action: "用动词开头改写经历，例如“拆解需求、设计流程、分析数据、推动上线”。",
    },
    {
      key: "result",
      status: "建议量化",
      score: result.score,
      jd: "更强的候选人通常会证明结果，而不只是列职责。",
      resume: "当前结果证据需要进一步检查。",
      gap: "缺少可验证结果会影响最终说服力。",
      action: "补充数字、交付物、上线状态、用户反馈或复盘结论。",
    },
  ];
}

function getAiStarInsights(result = {}, response = null) {
  const advice = response?.advice;
  if (!advice) return getFallbackStarInsights(result);

  const normalizedJob = advice.normalized_job || {};
  const context = advice.company_role_context || {};
  const evidenceReview = advice.evidence_review || [];
  const quantifiedGaps = advice.quantified_gaps || [];
  const topActions = advice.top_actions || [];
  const rewrites = advice.rewrite_examples || [];
  const hr = advice.hr_perspective || {};

  const responsibilityText = compactText(normalizedJob.core_responsibilities, "JD 中未返回明确职责，请查看原始岗位描述。");
  const requirementText = compactText(
    takeItems((normalizedJob.requirements || []).map((item) => `${importanceText(item.importance)}：${item.title}`), 4),
    "未返回结构化岗位要求。",
  );
  const evidenceText = compactText(
    takeItems(evidenceReview.map((item) => `${item.title}：${levelLabel(item.level)}，${item.resume_evidence || item.gap}`), 3),
    "简历证据需要进一步补充。",
  );
  const gapText = compactText(
    takeItems(quantifiedGaps.map((item) => `${item.requirement}：${item.recommended_fix}`), 3),
    "暂无量化缺口。",
  );
  const actionText = compactText(
    takeItems(topActions.map((item) => `${priorityText(item.priority)}｜${item.target_section}：${item.action}`), 3),
    "建议补充与岗位要求直接相关的 STAR 经历。",
  );
  const rewriteText = compactText(
    takeItems(rewrites.map((item) => item.after), 2),
    "生成 AI 建议后会展示更具体的改写示例。",
  );
  const finalScore = response.final_scoring?.score ?? result.score;
  const evidenceScore = Math.round(
    evidenceReview.reduce((sum, item) => sum + (Number(item.evidence_score) || 0), 0) / Math.max(1, evidenceReview.length),
  );

  return [
    {
      key: "situation",
      status: context.company_name ? `${context.company_name} 语境` : "岗位语境",
      score: finalScore,
      jd: `${normalizedJob.role_title || "目标岗位"}：${normalizedJob.jd_summary || responsibilityText}`,
      resume: compactText(hr.first_screen_strengths, "简历中暂未形成特别清晰的初筛亮点。"),
      gap: compactText(hr.first_screen_concerns, "需要让 HR 更快理解你为什么适合这个岗位。"),
      action: context.hiring_context_summary || "把经历放进具体业务场景，而不是只罗列技能。",
    },
    {
      key: "task",
      status: "任务匹配",
      score: response.final_scoring?.semantic_match_score ?? finalScore,
      jd: responsibilityText,
      resume: requirementText,
      gap: gapText,
      action: actionText,
    },
    {
      key: "action",
      status: "证据强度",
      score: Number.isFinite(evidenceScore) ? evidenceScore : finalScore,
      jd: "岗位要求需要被项目动作证明，而不只是出现关键词。",
      resume: evidenceText,
      gap: gapText,
      action: actionText,
    },
    {
      key: "result",
      status: "结果表达",
      score: response.final_scoring?.resume_quality_score ?? finalScore,
      jd: "最终筛选会看可验证产出：指标、交付物、影响或复盘。",
      resume: rewriteText,
      gap: compactText((advice.credential_review || []).map((item) => `${item.name}：${item.rationale}`), "证书、奖项或成果需要与岗位相关性连接起来。"),
      action: "把经历改成 STAR：场景一句话，任务一句话，动作两句话，结果用数字或交付物收尾。",
    },
  ];
}

function getStarInsights(result = state.lastResult) {
  return getAiStarInsights(result, result?.ai_advice);
}

function createStarCard(insight, index, activeKey) {
  const config = STAR_DIMENSIONS.find((item) => item.key === insight.key) || STAR_DIMENSIONS[index];
  const card = document.createElement("button");
  card.className = "star-card";
  card.type = "button";
  card.dataset.starKey = insight.key;
  card.setAttribute("aria-expanded", String(insight.key === activeKey));

  const badge = document.createElement("span");
  badge.className = "star-badge";
  badge.textContent = config.label;

  const body = document.createElement("span");
  body.className = "star-card-body";

  const title = document.createElement("strong");
  title.textContent = config.title;

  const question = document.createElement("span");
  question.textContent = config.question;

  const footer = document.createElement("span");
  footer.className = "star-card-footer";
  footer.textContent = `${insight.status || "待分析"} · ${Math.max(0, Math.min(100, Math.round(insight.score || 0)))}/100`;

  body.append(title, question, footer);
  card.append(badge, body);
  return card;
}

function renderStarDetail(insight) {
  const config = STAR_DIMENSIONS.find((item) => item.key === insight?.key) || STAR_DIMENSIONS[0];
  elements.starDetailPanel.replaceChildren();

  const heading = document.createElement("div");
  heading.className = "star-detail-heading";
  const badge = document.createElement("span");
  badge.className = "star-badge";
  badge.textContent = config.label;
  const titleGroup = document.createElement("div");
  const title = document.createElement("h4");
  title.textContent = config.title;
  const subtitle = document.createElement("p");
  subtitle.textContent = config.question;
  titleGroup.append(title, subtitle);
  heading.append(badge, titleGroup);

  const detailGrid = document.createElement("div");
  detailGrid.className = "star-detail-grid";

  [
    ["JD 要求", insight.jd],
    ["简历证据", insight.resume],
    ["当前差距", insight.gap],
    ["下一步动作", insight.action],
  ].forEach(([label, text]) => {
    const item = document.createElement("section");
    const itemTitle = document.createElement("strong");
    itemTitle.textContent = label;
    const paragraph = document.createElement("p");
    paragraph.textContent = compactText(text);
    item.append(itemTitle, paragraph);
    detailGrid.append(item);
  });

  elements.starDetailPanel.append(heading, detailGrid);
}

function renderStarInsights(result = state.lastResult, activeKey = null) {
  if (!elements.starCardGrid || !elements.starDetailPanel) return;
  const insights = result ? getStarInsights(result) : getFallbackStarInsights({ score: 0 });
  const nextActiveKey = activeKey || insights[0]?.key || "situation";
  elements.starCardGrid.replaceChildren();
  insights.forEach((insight, index) => {
    elements.starCardGrid.append(createStarCard(insight, index, nextActiveKey));
  });
  renderStarDetail(insights.find((item) => item.key === nextActiveKey) || insights[0]);
}

function getScoringSteps(finalScoring = null, keywordScore = 0) {
  return finalScoring?.steps || [
    { step: 1, title: "关键词匹配", value: keywordScore },
    { step: 2, title: "语义匹配", value: "待 AI" },
    { step: 3, title: "经历匹配", value: "待 AI" },
    { step: 4, title: "简历质量", value: "待 AI" },
    { step: 5, title: "能力对齐", value: "待 AI" },
    { step: 6, title: "加分项", value: "待 AI" },
    { step: 7, title: "加权基础分", value: "待 AI" },
    { step: 8, title: "核心技能惩罚", value: "待 AI" },
    { step: 9, title: "分数上限", value: "待 AI" },
    { step: 10, title: "最终分数", value: "待 AI" },
  ];
}

function renderScoringSteps(container, steps) {
  container.replaceChildren();
  steps.forEach((step) => {
    const item = document.createElement("div");
    item.className = "scoring-step";
    const number = document.createElement("span");
    number.textContent = String(step.step);
    const label = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = step.title;
    const value = document.createElement("small");
    value.textContent = typeof step.value === "number" && step.step <= 4
      ? `${step.value}/100`
      : String(step.value);
    label.append(title, value);
    item.append(number, label);
    container.append(item);
  });
}

function renderScoringProcess(finalScoring = null, keywordScore = 0) {
  const steps = getScoringSteps(finalScoring, keywordScore);
  renderScoringSteps(elements.scoringSteps, steps);
  if (elements.scoreBreakdownSteps) {
    renderScoringSteps(elements.scoreBreakdownSteps, steps);
  }
  if (elements.scoreBreakdownNote) {
    elements.scoreBreakdownNote.textContent = finalScoring?.formula
      || `关键词初步公式：${state.lastResult?.score_details?.formula || "等待分析结果"}`;
  }
}

function animateScore(score) {
  const target = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  const start = Number(elements.scoreValue.textContent) || 0;
  const duration = 900;
  const startedAt = performance.now();

  function tick(now) {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(start + (target - start) * eased);
    elements.scoreRing.style.setProperty("--score", value);
    elements.scoreValue.textContent = value;
    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }

  requestAnimationFrame(tick);
}

function renderAiAdvicePlaceholder(message) {
  elements.aiAdviceContent.replaceChildren();
  elements.aiAdviceStatus.textContent = message;
}

function showAiAdviceMessage(message) {
  if (hasAnyStoredAiAdvice()) {
    elements.aiAdviceStatus.textContent = message;
    return;
  }
  renderAiAdvicePlaceholder(message);
}

function renderAiAdvice(response) {
  const advice = response.advice;
  elements.aiAdviceContent.replaceChildren();
  const providerLabel = response.provider ? `${response.provider} / ${response.model}` : response.model;
  const finalScore = response.final_scoring?.score;
  const timingLabel = response.timing?.total_ms ? ` · ${(response.timing.total_ms / 1000).toFixed(1)}s` : "";
  const thinkingLabel = response.thinking_mode === "enabled"
    ? " · 深度思考开启"
    : response.thinking_mode === "disabled"
      ? " · 深度思考关闭"
      : "";
  elements.aiAdviceStatus.textContent = finalScore === undefined
    ? `AI 建议已生成 · ${providerLabel} · 规则分数保持 ${response.rule_score}/100`
    : `AI 综合分析已生成 · ${providerLabel}${thinkingLabel}${timingLabel} · 最终分 ${finalScore}/100`;

  const summaryCard = createAdviceCard("已整理进 STAR 卡片", [
    advice.summary || "AI 建议已生成，请点击上方四张卡片查看证据、缺口和修改动作。",
    "页面已隐藏冗长的 JD 规范化、评分口径和基础 Gap Evidence，只保留会影响修改决策的内容。",
  ]);
  elements.aiAdviceContent.append(summaryCard);
  renderStarInsights(state.lastResult);
}

function applyAiScoringToResult(result, response) {
  if (!response?.final_scoring) return result;
  result.base_rule_score = result.base_rule_score ?? result.score;
  result.final_scoring = response.final_scoring;
  result.score = response.final_scoring.score;
  result.ai_advice = response;
  return result;
}

function renderResultPage(result) {
  renderResult(result);
  hideLoading();
  updateProgress(100, "完成", "分析完成");
  showPage("result");
}

function renderResult(result) {
  state.lastResult = result;

  animateScore(result.score);
  elements.scoreLabel.textContent = result.final_scoring ? scoreLabel(result.score) : "关键词初步匹配";
  elements.scoreDetail.textContent = result.final_scoring
    ? "点击综合分数查看完整评分过程"
    : "点击综合分数查看关键词初步评分过程";
  elements.matchedWeight.textContent = result.score_details.matched_weight;
  elements.totalWeight.textContent = result.score_details.total_job_weight;
  renderScoringProcess(result.final_scoring, result.base_rule_score ?? result.score);
  elements.copyJsonButton.disabled = false;
  updateAiAdviceAvailability();

  renderKeywordList(elements.matchedList, result.matched_keywords, "matched");
  renderKeywordList(elements.missingList, result.missing_keywords, "missing");
  renderCategorySummary(result.category_summary);
  renderPriorityGaps(result.priority_gaps);
  renderSuggestions(result.suggestion_items);
  renderStarInsights(result);
  if (result.ai_advice) {
    renderAiAdvice(result.ai_advice);
  } else {
    renderAiAdvicePlaceholder(getAiAdvicePlaceholderMessage());
  }
}

function renderEmptyResult() {
  elements.scoreRing.style.setProperty("--score", 0);
  elements.scoreValue.textContent = "--";
  elements.scoreLabel.textContent = "等待分析";
  elements.scoreDetail.textContent = "输入简历和岗位 JD 后生成结果";
  elements.matchedWeight.textContent = "0";
  elements.totalWeight.textContent = "0";
  renderScoringProcess();
  elements.copyJsonButton.disabled = true;
  elements.aiAdviceButton.disabled = true;
  renderKeywordList(elements.matchedList, [], "matched");
  renderKeywordList(elements.missingList, [], "missing");
  renderCategorySummary([]);
  renderPriorityGaps([]);
  renderSuggestions([], false);
  renderStarInsights(null);
  renderAiAdvicePlaceholder("完成基础分析后可生成");
}

async function loadKeywords() {
  try {
    const response = await fetch("data/keywords.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.keywords = await response.json();
    elements.analyzeButton.disabled = false;
    elements.loadSampleButton.disabled = false;
    elements.runNote.textContent = getReadinessNote();
  } catch (error) {
    elements.analyzeButton.disabled = true;
    elements.loadSampleButton.disabled = true;
    elements.runNote.textContent = "基础规则加载失败";
    console.error(error);
  }
}

async function detectBackend() {
  const apiBaseUrl = getApiBaseUrlCandidate();

  if (!apiBaseUrl) {
    state.llmConfigured = false;
    updateRuntimeStatus();
    updateAuthUi();
    return;
  }

  elements.runtimeStatus.textContent = "Connecting API";
  try {
    const health = await fetchJsonWithTimeout(`${apiBaseUrl}/health`, {}, API_HEALTH_TIMEOUT_MS);
    state.apiBaseUrl = apiBaseUrl;
    state.apiAvailable = health.status === "ok";
    state.llmConfigured = Boolean(health.llm_configured);
    state.llmProvider = health.llm_provider || "";
    state.llmModel = health.llm_model || "";
    state.authProvider = health.auth_provider || state.authProvider;
    updateRuntimeStatus();
    elements.runNote.textContent = getReadinessNote();
    await fetchCurrentUser();
    if (document.body.dataset.page === "history") {
      loadHistoryRecords();
    }
    if (state.lastResult) {
      updateAiAdviceAvailability();
      const storedAdvice = getStoredAiAdvice();
      if (storedAdvice) {
        renderAiAdvice(storedAdvice);
      } else if (!hasAnyStoredAiAdvice()) {
        renderAiAdvicePlaceholder(
          canGenerateAiAdvice()
            ? "基础分析已完成，可以生成 AI 建议"
            : getAiAdvicePlaceholderMessage(),
        );
      }
    }
  } catch (error) {
    state.apiBaseUrl = "";
    state.apiAvailable = false;
    state.llmConfigured = false;
    state.llmProvider = "";
    state.llmModel = "";
    state.currentUser = null;
    updateRuntimeStatus();
    elements.runNote.textContent = getReadinessNote();
    updateAuthUi();
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

  elements.thinkingMode.addEventListener("change", () => {
    state.thinkingEnabled = elements.thinkingMode.checked;
    localStorage.setItem(THINKING_MODE_STORAGE_KEY, String(state.thinkingEnabled));
    elements.thinkingHint.textContent = state.thinkingEnabled
      ? "已开启，复杂分析可能需要更长时间"
      : "已关闭，分析通常更快，但推理深度可能降低";
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

  elements.scoreBreakdownTrigger.addEventListener("click", () => {
    elements.scoreBreakdownModal.hidden = false;
    elements.scoreBreakdownClose.focus();
  });

  elements.scoreBreakdownClose.addEventListener("click", () => {
    elements.scoreBreakdownModal.hidden = true;
    elements.scoreBreakdownTrigger.focus();
  });

  elements.scoreBreakdownModal.addEventListener("click", (event) => {
    if (event.target === elements.scoreBreakdownModal) {
      elements.scoreBreakdownModal.hidden = true;
    }
  });

  elements.starCardGrid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-star-key]");
    if (!card) return;
    renderStarInsights(state.lastResult, card.dataset.starKey);
  });

  elements.useExampleButton.addEventListener("click", () => {
    state.resumeSource = null;
    state.jdSources = [];
    state.jdTextEditedByUser = false;
    elements.resumeInput.value = SAMPLE_RESUME;
    elements.jobInput.value = SAMPLE_JOB;
    renderFilePreviews("resume");
    renderFilePreviews("jd");
    setInputStatus("resume", "示例简历已载入", "可直接开始分析");
    setInputStatus("jd", "示例 JD 已载入", "可直接开始分析");
    elements.exampleModal.hidden = true;
    hideLoading();
    showPage("analyze");
    elements.runNote.textContent = `${getReadinessNote()}；示例已载入`;
  });

  elements.resumeFile.addEventListener("change", async () => {
    const file = elements.resumeFile.files?.[0];
    if (!file) return;
    await handleResumeFile(file);
  });

  elements.jdImageFile.addEventListener("change", async () => {
    const files = [...(elements.jdImageFile.files || [])];
    if (!files.length) return;
    await handleJdFiles(files);
  });

  elements.resumeFilePreview.addEventListener("click", (event) => {
    const action = event.target.closest("[data-file-action]")?.dataset.fileAction;
    if (!action) return;
    if (action === "replace-resume") {
      elements.resumeFile.click();
      return;
    }
    if (action === "remove-resume") {
      clearCurrentResume();
    }
  });

  elements.jdFilePreview.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-file-action]")?.dataset.fileAction;
    if (action !== "remove-jd") return;
    const card = event.target.closest(".file-preview-card");
    const sourceKey = card?.dataset.sourceKey;
    if (!sourceKey) return;
    await removeJdSource(sourceKey);
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
    const jdFiles = findClipboardFiles(event, isJdFile);
    if (jdFiles.length) {
      event.preventDefault();
      await handleJdFiles(jdFiles, "粘贴");
      return;
    }

    const pastedText = event.clipboardData?.getData("text/plain");
    if (pastedText?.trim()) {
      event.preventDefault();
      await handlePastedJobText(pastedText);
    }
  });

  [
    [elements.resumeInput, "resume", isResumeFile, handleResumeFile, false],
    [elements.jobInput, "jd", isJdFile, handleJdFiles, true],
  ].forEach(([input, target, matcher, handler, acceptsMultiple]) => {
    input.addEventListener("dragover", (event) => {
      event.preventDefault();
      input.classList.add("is-dragging");
    });

    input.addEventListener("dragleave", () => {
      input.classList.remove("is-dragging");
    });

    input.addEventListener("drop", async (event) => {
      const files = findDroppedFiles(event, matcher);
      if (!files.length) return;
      event.preventDefault();
      input.classList.remove("is-dragging");
      await handler(acceptsMultiple ? files : files[0], "拖入");
    });
  });

  elements.resumeInput.addEventListener("input", () => {
    if (!elements.resumeInput.value.trim()) {
      state.resumeSource = null;
      clearInputStatus("resume");
      renderFilePreviews("resume");
    }
  });

  elements.jobInput.addEventListener("input", () => {
    if (!elements.jobInput.value.trim()) {
      state.jdSources = [];
      state.jdTextEditedByUser = false;
      clearInputStatus("jd");
      renderFilePreviews("jd");
    } else {
      state.jdTextEditedByUser = true;
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
      if (!elements.scoreBreakdownModal.hidden) {
        elements.scoreBreakdownModal.hidden = true;
      }
      if (!elements.authModal.hidden) {
        closeAuthModal();
      }
    }
  });

  elements.authOpen.addEventListener("click", openAuthModal);
  elements.authClose.addEventListener("click", closeAuthModal);
  elements.authLogout.addEventListener("click", logoutCurrentUser);
  elements.authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAuth("login");
  });
  elements.authRegister.addEventListener("click", () => {
    submitAuth("register");
  });
  elements.authGuest.addEventListener("click", () => {
    closeAuthModal();
    showPage("analyze");
    elements.runNote.textContent = "游客模式不会保存分析历史";
  });
  elements.authReset.addEventListener("click", requestPasswordReset);

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

    const lengthError = getInputLengthError(resumeText, jobText);
    if (lengthError) {
      const target = resumeText.length > MAX_RESUME_CHARS ? elements.resumeInput : elements.jobInput;
      showInputAlert(lengthError, target);
      elements.runNote.textContent = "输入内容超过长度限制";
      return;
    }

    await prepareCapabilityReview(resumeText, jobText);
  });

  elements.confirmCapabilitiesButton.addEventListener("click", async () => {
    if (!state.pendingAnalysis) {
      showPage("analyze");
      return;
    }
    const assessments = collectCapabilityAssessments();
    await completeAnalysis(
      state.pendingAnalysis.resumeText,
      state.pendingAnalysis.jobText,
      assessments,
    );
  });

  elements.skipCapabilitiesButton.addEventListener("click", async () => {
    if (!state.pendingAnalysis) {
      showPage("analyze");
      return;
    }
    await completeAnalysis(
      state.pendingAnalysis.resumeText,
      state.pendingAnalysis.jobText,
      [],
    );
  });

  elements.loadSampleButton.addEventListener("click", () => {
    state.resumeSource = null;
    state.jdSources = [];
    state.jdTextEditedByUser = false;
    elements.resumeInput.value = SAMPLE_RESUME;
    elements.jobInput.value = SAMPLE_JOB;
    renderFilePreviews("resume");
    renderFilePreviews("jd");
    setInputStatus("resume", "示例简历已载入", "可直接开始分析");
    setInputStatus("jd", "示例 JD 已载入", "可直接开始分析");
    hideLoading();
    showPage("analyze");
    elements.runNote.textContent = `${getReadinessNote()}；示例已载入`;
  });

  elements.clearJdButton.addEventListener("click", () => {
    clearCurrentJob();
  });

  elements.clearResumeButton.addEventListener("click", clearCurrentResume);

  elements.analyzeAnotherJobButton.addEventListener("click", () => {
    clearCurrentJob({ returnToAnalyzer: true });
  });

  elements.clearButton.addEventListener("click", () => {
    elements.resumeInput.value = "";
    elements.jobInput.value = "";
    state.lastResult = null;
    state.resumeSource = null;
    state.jdSources = [];
    state.jdTextEditedByUser = false;
    state.capabilityDiscovery = null;
    state.capabilityAssessments = [];
    state.pendingAnalysis = null;
    renderEmptyResult();
    clearInputStatus("resume");
    clearInputStatus("jd");
    renderFilePreviews("resume");
    renderFilePreviews("jd");
    hideLoading();
    elements.runNote.textContent = getReadinessNote();
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

  elements.historyRefresh.addEventListener("click", () => {
    loadHistoryRecords();
  });

  elements.historyList.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-history-delete]");
    if (!deleteButton) return;
    deleteHistoryRecord(deleteButton.dataset.historyDelete);
  });

  elements.aiAdviceButton.addEventListener("click", async () => {
    const resumeText = elements.resumeInput.value.trim();
    const jobText = elements.jobInput.value.trim();

    if (!state.apiAvailable) {
      showAiAdviceMessage("云端 API 暂未连接，已保留现有建议；请确认后端服务是否可访问。");
      return;
    }

    if (!state.llmConfigured) {
      showAiAdviceMessage(getAiAdvicePlaceholderMessage());
      return;
    }

    if (!state.lastResult || !resumeText || !jobText) {
      showAiAdviceMessage("请先完成基础分析");
      return;
    }

    const lengthError = getInputLengthError(resumeText, jobText);
    if (lengthError) {
      showAiAdviceMessage(lengthError);
      return;
    }

    elements.aiAdviceButton.disabled = true;
    elements.aiAdviceStatus.textContent = "AI 建议生成中";

    try {
      const response = await generateAiAdvice(resumeText, jobText);
      applyAiScoringToResult(state.lastResult, response);
      animateScore(state.lastResult.score);
      elements.scoreLabel.textContent = scoreLabel(state.lastResult.score);
      elements.scoreDetail.textContent = "点击综合分数查看完整评分过程";
      renderScoringProcess(response.final_scoring, state.lastResult.base_rule_score);
      renderAiAdvice(response);
      elements.runNote.textContent = "AI 综合分析已生成";
    } catch (error) {
      showAiAdviceMessage(`AI 建议生成失败，已保留现有结果：${error.message}`);
      elements.runNote.textContent = "AI 建议生成失败";
      console.error(error);
    } finally {
      updateAiAdviceAvailability();
    }
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
state.thinkingEnabled = localStorage.getItem(THINKING_MODE_STORAGE_KEY) !== "false";
elements.thinkingMode.checked = state.thinkingEnabled;
elements.thinkingHint.textContent = state.thinkingEnabled
  ? "已开启，复杂分析可能需要更长时间"
  : "已关闭，分析通常更快，但推理深度可能降低";
loadStoredAuthToken();
bindEvents();
showPage(getPageFromHash(), { push: false });
updateAuthUi();
Promise.allSettled([initializeSupabaseAuth(), detectBackend()]).then(async () => {
  if (state.apiAvailable && state.authToken) {
    await fetchCurrentUser();
  }
});
loadKeywords();
