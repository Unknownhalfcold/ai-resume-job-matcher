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
  resumeInput: document.querySelector("#resume-input"),
  jobInput: document.querySelector("#job-input"),
  analyzeButton: document.querySelector("#analyze-button"),
  loadSampleButton: document.querySelector("#load-sample"),
  clearButton: document.querySelector("#clear-all"),
  copyJsonButton: document.querySelector("#copy-json"),
  aiAdviceButton: document.querySelector("#ai-advice-button"),
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

async function generateAiAdvice(resumeText, jobText, analysis) {
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

  const focus = createAdviceCard(
    "岗位核心要求",
    advice.job_focus.map((item) => `${item.title}：${item.reason}（相关词：${item.related_keywords.join("、")}）`),
  );

  const evidence = createAdviceCard(
    "简历证据强度",
    advice.evidence_review.map(
      (item) =>
        `${item.title}｜${levelLabel(item.level)}：${item.resume_evidence}；缺口：${item.gap}；原因：${item.why_it_matters}`,
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

  elements.aiAdviceContent.append(summary, focus, evidence, actions, rewrites);
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
  elements.aiAdviceButton.disabled = !(state.apiAvailable && state.llmConfigured);

  renderKeywordList(elements.matchedList, result.matched_keywords, "matched");
  renderKeywordList(elements.missingList, result.missing_keywords, "missing");
  renderCategorySummary(result.category_summary);
  renderPriorityGaps(result.priority_gaps);
  renderSuggestions(result.suggestion_items);
  renderAiAdvicePlaceholder(
    state.apiAvailable && state.llmConfigured
      ? "基础分析已完成，可以生成 AI 建议"
      : "AI 建议需要后端 API 和 LLM_API_KEY",
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
      elements.aiAdviceButton.disabled = !(state.apiAvailable && state.llmConfigured);
      renderAiAdvicePlaceholder(
        state.llmConfigured
          ? "基础分析已完成，可以生成 AI 建议"
          : "后端在线，但需要配置 LLM_API_KEY",
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
  elements.analyzeButton.addEventListener("click", async () => {
    const resumeText = elements.resumeInput.value.trim();
    const jobText = elements.jobInput.value.trim();

    if (!resumeText || !jobText) {
      elements.runNote.textContent = "请补全简历和岗位 JD";
      return;
    }

    renderResult(await runAnalysis(resumeText, jobText));
    elements.runNote.textContent = `关键词库：${state.keywords.length} 项`;
  });

  elements.loadSampleButton.addEventListener("click", async () => {
    elements.resumeInput.value = SAMPLE_RESUME;
    elements.jobInput.value = SAMPLE_JOB;
    renderResult(await runAnalysis(SAMPLE_RESUME, SAMPLE_JOB));
    elements.runNote.textContent = `关键词库：${state.keywords.length} 项`;
  });

  elements.clearButton.addEventListener("click", () => {
    elements.resumeInput.value = "";
    elements.jobInput.value = "";
    state.lastResult = null;
    renderEmptyResult();
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

    if (!state.llmConfigured) {
      renderAiAdvicePlaceholder("请先在后端配置 LLM_API_KEY，再生成 AI 建议");
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
      elements.aiAdviceButton.disabled = !(state.apiAvailable && state.llmConfigured);
    }
  });
}

renderEmptyResult();
elements.analyzeButton.disabled = true;
elements.loadSampleButton.disabled = true;
bindEvents();
detectBackend();
loadKeywords();
