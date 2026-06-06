const state = {
  keywords: [],
  lastResult: null,
  apiBaseUrl: "",
  apiAvailable: false,
  llmConfigured: false,
  authToken: "",
  currentUser: null,
  historyRecords: [],
};

const BACKEND_TIMEOUT_MS = 12000;
const API_HEALTH_TIMEOUT_MS = 25000;
const AUTH_TOKEN_STORAGE_KEY = "airjm_auth_token";
const CLOUD_API_BASE_URL = window.APP_CONFIG?.apiBaseUrl || "https://ai-resume-job-matcher-api.onrender.com";
const PAGE_NAMES = ["start", "analyze", "result", "history", "privacy"];

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
  authOpen: document.querySelector("#auth-open"),
  authLogout: document.querySelector("#auth-logout"),
  userChip: document.querySelector("#user-chip"),
  authModal: document.querySelector("#auth-modal"),
  authForm: document.querySelector("#auth-form"),
  authClose: document.querySelector("#auth-close"),
  authEmail: document.querySelector("#auth-email"),
  authPassword: document.querySelector("#auth-password"),
  authStatus: document.querySelector("#auth-status"),
  authRegister: document.querySelector("#auth-register"),
  authLogin: document.querySelector("#auth-login"),
  historyRefresh: document.querySelector("#history-refresh"),
  historyStatus: document.querySelector("#history-status"),
  historyList: document.querySelector("#history-list"),
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

  if (CLOUD_API_BASE_URL) {
    return CLOUD_API_BASE_URL.replace(/\/$/, "");
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
  return state.llmConfigured ? "Cloud API + DeepSeek" : "Cloud API";
}

function getReadinessNote() {
  if (!state.keywords.length) {
    return "基础规则加载中";
  }
  if (state.apiAvailable && state.llmConfigured) {
    return "基础规则已加载 · 云端 API 和 DeepSeek 已连接";
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

function isResumeFile(file) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".pdf") ||
    name.endsWith(".docx") ||
    name.endsWith(".doc") ||
    file.type === "application/pdf" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

function getResumeFileValidationError(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".doc")) {
    return "当前暂不支持旧版 .doc，请先在 Word 中另存为 .docx，或导出为可复制文本的 PDF。";
  }
  if (!name.endsWith(".docx") && !name.endsWith(".pdf") && !isResumeFile(file)) {
    return "当前只支持 .docx 和可复制文本的 .pdf 简历。";
  }
  return "";
}

function isImageFile(file) {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name);
}

function isJdDocumentFile(file) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".docx")
    || name.endsWith(".pdf")
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
  const questionCount = normalized.technical_questions?.length || 0;
  const roleText = normalized.role_title ? `${normalized.role_title} · ` : "";
  const detail = `${roleText}置信度 ${normalized.confidence}/100${questionCount ? ` · 技术问题 ${questionCount} 个` : ""}`;
  setInputStatus("jd", `${sourceLabel}已智能提取`, detail);
  elements.runNote.textContent = "已用 LLM 从 OCR 文本中提取 JD";
}

async function handleResumeFile(file, source = "上传") {
  showLoading("正在读取简历文件");
  updateProgress(18, "上传简历", "正在提取 Word/PDF 中的文本");

  try {
    const validationError = getResumeFileValidationError(file);
    if (validationError) {
      throw new Error(validationError);
    }
    const result = await extractResumeFile(file);
    elements.resumeInput.value = result.text;
    updateProgress(100, "简历已提取", `${result.filename || file.name || "文件"}：${result.character_count} 字符`);
    setInputStatus("resume", "简历文件已导入", result.filename || normalizeFileName(file, "剪贴板简历文件"));
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
  const files = [...inputFiles].filter(isJdFile).slice(0, 6);
  if (!files.length) return;

  showLoading("正在读取多个 JD 文件");
  updateProgress(8, "准备 JD", `准备处理 ${files.length} 个文件`);

  try {
    const extractedParts = [];
    const warnings = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const baseProgress = 10 + Math.round((index / files.length) * 68);
      updateProgress(baseProgress, `读取 JD ${index + 1}/${files.length}`, file.name || "剪贴板文件");

      if (isImageFile(file)) {
        const text = await extractTextFromJdImage(file);
        if (!text) {
          warnings.push(`${file.name || `截图 ${index + 1}`} 未识别到文字`);
          continue;
        }
        extractedParts.push(`【来源：${file.name || `JD 截图 ${index + 1}`}】\n${text}`);
      } else {
        const result = await extractJobDocument(file);
        extractedParts.push(`【来源：${result.filename || file.name}】\n${result.text}`);
        if (result.warnings?.length) warnings.push(...result.warnings);
      }
    }

    if (!extractedParts.length) {
      throw new Error("没有从上传的 JD 文件中提取到文字。");
    }

    const existingText = elements.jobInput.value.trim();
    const combinedText = [existingText, ...extractedParts].filter(Boolean).join("\n\n").slice(0, 20000);
    const sourceLabel = `${source}${files.length} 个 JD 文件`;

    if (state.apiAvailable && state.llmConfigured) {
      try {
        updateProgress(88, "LLM 合并 JD", "正在合并职责、岗位要求、加分项和技术问题");
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
    setInputStatus("jd", `${files.length} 个 JD 文件已合并`, `${files.map((file) => file.name || "剪贴板图片").join("、")}${warningText}`);
    updateProgress(100, "JD 已合并", `已处理 ${files.length} 个文件`);
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

  elements.runNote.textContent = "正在连接云端 API，Render 免费实例可能需要唤醒";
  await detectBackend();
  return state.apiAvailable;
}

function loadStoredAuthToken() {
  try {
    state.authToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || "";
  } catch (error) {
    state.authToken = "";
  }
}

function setAuthToken(token) {
  state.authToken = token || "";
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

function openAuthModal() {
  if (!state.apiAvailable) {
    return;
  }
  elements.authModal.hidden = false;
  setAuthStatus("密码至少 8 位。");
  elements.authEmail.focus();
}

function closeAuthModal() {
  elements.authModal.hidden = true;
  elements.authForm.reset();
  setAuthStatus("密码至少 8 位。");
}

async function submitAuth(mode) {
  const email = elements.authEmail.value.trim();
  const password = elements.authPassword.value;
  const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";

  if (!state.apiAvailable) {
    setAuthStatus("后端 API 暂未连接，无法使用账户功能。", "error");
    return;
  }

  if (!email || password.length < 8) {
    setAuthStatus("请输入邮箱，并确保密码至少 8 位。", "error");
    return;
  }

  setAuthBusy(true);
  setAuthStatus(mode === "register" ? "正在创建账户..." : "正在登录...");

  try {
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

function buildHistoryPayload(resumeText, jobText, result) {
  return {
    resume_text: resumeText,
    job_description: jobText,
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
        body: JSON.stringify(buildHistoryPayload(resumeText, jobText, result)),
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

function truncateText(text, maxLength = 180) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= maxLength) return value || "暂无内容";
  return `${value.slice(0, maxLength)}...`;
}

function createHistorySnippet(label, text) {
  const paragraph = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}：`;
  paragraph.append(strong, document.createTextNode(truncateText(text)));
  return paragraph;
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

    const snippets = document.createElement("div");
    snippets.className = "history-snippet";
    snippets.append(
      createHistorySnippet("简历", record.resume_text),
      createHistorySnippet("JD", record.job_description),
    );

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

    card.append(top, snippets, actions);
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

async function extractResumeFile(file) {
  const apiReady = await ensureApiAvailable();
  if (!apiReady) {
    throw new Error("云端 API 暂时未连接，请等待 Render 唤醒后重试。");
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
    45000,
  );
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

function getAiAdvicePlaceholderMessage() {
  if (canGenerateAiAdvice()) {
    return "基础分析已完成，可以生成 AI 建议";
  }

  if (getAiMode() === "byok") {
    return "请填写自己的 API Key 和模型名";
  }

  if (!state.apiAvailable) {
    return "云端 API 连接中，连接后可使用站点默认 LLM";
  }

  return "站点默认 LLM 暂未配置，可切换到自带 API Key";
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

function getStoredAiAdvice(mode = getAiMode()) {
  if (!state.lastResult) return null;
  const storedByMode = state.lastResult.ai_advice_by_mode;
  if (storedByMode) {
    return storedByMode[mode] || null;
  }

  return mode === "default" ? state.lastResult.ai_advice || null : null;
}

function hasAnyStoredAiAdvice() {
  if (!state.lastResult) return false;
  return Boolean(
    state.lastResult.ai_advice
    || state.lastResult.ai_advice_by_mode?.default
    || state.lastResult.ai_advice_by_mode?.byok,
  );
}

function syncAiModeUi() {
  const byokMode = getAiMode() === "byok";
  document.querySelector(".ai-settings").hidden = !byokMode;
  updateAiAdviceAvailability();
  if (state.lastResult) {
    const storedAdvice = getStoredAiAdvice();
    if (storedAdvice) {
      renderAiAdvice(storedAdvice);
    } else if (hasAnyStoredAiAdvice()) {
      elements.aiAdviceStatus.textContent = byokMode
        ? "已保留站点默认 LLM 的建议；填写自己的 API Key 后可生成另一份结果"
        : "已保留自带 Key 生成的建议；可重新生成站点默认 LLM 结果";
    } else {
      renderAiAdvicePlaceholder(getAiAdvicePlaceholderMessage());
    }
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
      updateRuntimeStatus();
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
  const companyRoleContext = advice.company_role_context || {
    company_name: "",
    company_scale: "unknown",
    role_title: advice.normalized_job?.role_title || "",
    hiring_context_summary: "当前模型版本未返回公司语境。",
    historical_hiring_evidence: "用户材料未提供，无法核验",
  };
  const applicationFormGuidance = advice.application_form_guidance || {
    keep_in_resume: [],
    usually_form_only: [],
    avoid_duplicate_items: [],
  };
  const hrPerspectiveData = advice.hr_perspective || {
    screening_decision: "borderline",
    first_screen_strengths: [],
    first_screen_concerns: [],
    likely_interview_questions: [],
  };
  elements.aiAdviceContent.replaceChildren();
  const providerLabel = response.provider ? `${response.provider} / ${response.model}` : response.model;
  const hybridScore = response.hybrid_score?.score;
  elements.aiAdviceStatus.textContent = hybridScore === undefined
    ? `AI 建议已生成 · ${providerLabel} · 规则分数保持 ${response.rule_score}/100`
    : `AI 建议已生成 · ${providerLabel} · 稳定规则分 ${response.rule_score}/100 · 增强参考分 ${hybridScore}/100`;

  const summary = createAdviceCard("整体判断", [advice.summary]);

  const hybrid = response.hybrid_score
    ? createAdviceCard("增强参考分", [
        `${response.hybrid_score.score}/100（仅作辅助，不替代稳定规则分）`,
        `规则贡献 ${response.hybrid_score.rule_component} + 语义证据贡献 ${response.hybrid_score.semantic_component} + 证书/获奖加成 ${response.hybrid_score.credential_bonus}`,
      ])
    : null;

  const normalizedJob = createAdviceCard(
    "JD 规范化",
    [
      `岗位：${advice.normalized_job.role_title}`,
      advice.normalized_job.jd_summary,
      `核心职责：${advice.normalized_job.core_responsibilities.join("；")}`,
      advice.normalized_job.technical_questions?.length
        ? `技术问题：${advice.normalized_job.technical_questions.map((item) => `${item.question}（${item.skill_area}）`).join("；")}`
        : "技术问题：未识别到单独技术问答",
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

  const credentials = createAdviceCard(
    "证书与获奖判断",
    advice.credential_review?.length
      ? advice.credential_review.map(
          (item) =>
            `${item.credential_type === "award" ? "奖项" : "证书"}｜${item.name}｜相关性 ${item.relevance_score}/100｜${credibilityText(item.credibility)}｜加成 ${item.score_bonus}：${item.rationale}`,
        )
      : ["简历中未识别到可评估的证书或奖项。"],
  );

  const companyContext = createAdviceCard("公司与岗位语境", [
    `公司：${companyRoleContext.company_name || "未提供"}｜${companyScaleText(companyRoleContext.company_scale)}`,
    `岗位：${companyRoleContext.role_title || advice.normalized_job.role_title}`,
    companyRoleContext.hiring_context_summary,
    `历史招聘依据：${companyRoleContext.historical_hiring_evidence}`,
  ]);

  const applicationGuidance = createAdviceCard("网申表单与简历边界", [
    `建议保留在简历：${applicationFormGuidance.keep_in_resume.join("；") || "无额外建议"}`,
    `通常由网申表单填写：${applicationFormGuidance.usually_form_only.join("；") || "无"}`,
    `避免重复堆入简历：${applicationFormGuidance.avoid_duplicate_items.join("；") || "无"}`,
  ]);

  const hrPerspective = createAdviceCard("目标公司 HR 初筛视角", [
    `初筛判断：${screeningDecisionText(hrPerspectiveData.screening_decision)}`,
    `优点：${hrPerspectiveData.first_screen_strengths.join("；") || "暂无明确证据"}`,
    `顾虑：${hrPerspectiveData.first_screen_concerns.join("；") || "暂无"}`,
    `可能追问：${hrPerspectiveData.likely_interview_questions.join("；") || "暂无"}`,
  ]);

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
    ...(hybrid ? [hybrid] : []),
    normalizedJob,
    requirements,
    rubric,
    evidence,
    quantifiedGaps,
    credentials,
    companyContext,
    applicationGuidance,
    hrPerspective,
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
  renderAiAdvicePlaceholder(getAiAdvicePlaceholderMessage());
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
            : getAiMode() === "byok"
              ? "后端在线，请填写自己的 API Key 启用 AI 建议"
              : getAiAdvicePlaceholderMessage(),
        );
      }
    }
  } catch (error) {
    state.apiBaseUrl = "";
    state.apiAvailable = false;
    state.llmConfigured = false;
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
      applyCleanedJobText(pastedText, "JD 文本");
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
      await saveAnalysisHistory(resumeText, jobText, result);
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
    elements.runNote.textContent = `${getReadinessNote()}；示例已载入`;
  });

  elements.clearButton.addEventListener("click", () => {
    elements.resumeInput.value = "";
    elements.jobInput.value = "";
    state.lastResult = null;
    renderEmptyResult();
    clearInputStatus("resume");
    clearInputStatus("jd");
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
      showAiAdviceMessage("云端 API 暂未连接，已保留现有建议；请等待 Render 唤醒后重试。");
      return;
    }

    if (!state.llmConfigured && !hasCompleteUserLlmConfig()) {
      showAiAdviceMessage(getAiAdvicePlaceholderMessage());
      return;
    }

    if (!state.lastResult || !resumeText || !jobText) {
      showAiAdviceMessage("请先完成基础分析");
      return;
    }

    elements.aiAdviceButton.disabled = true;
    elements.aiAdviceStatus.textContent = "AI 建议生成中";

    try {
      const response = await generateAiAdvice(resumeText, jobText, state.lastResult);
      const adviceMode = getAiMode();
      state.lastResult.ai_advice_by_mode = {
        ...(state.lastResult.ai_advice_by_mode || {}),
        [adviceMode]: response,
      };
      state.lastResult.ai_advice = response;
      renderAiAdvice(response);
      elements.runNote.textContent = "AI 建议已生成";
    } catch (error) {
      showAiAdviceMessage(`AI 建议生成失败，已保留现有结果：${error.message}`);
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
      if (state.lastResult && canGenerateAiAdvice() && !hasAnyStoredAiAdvice()) {
        renderAiAdvicePlaceholder(getAiAdvicePlaceholderMessage());
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
loadStoredAuthToken();
applyProviderPreset(elements.llmProvider.value);
bindEvents();
showPage(getPageFromHash(), { push: false });
syncAiModeUi();
updateAuthUi();
detectBackend();
loadKeywords();
