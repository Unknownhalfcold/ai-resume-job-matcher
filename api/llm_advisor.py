from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any, Literal, Mapping

from pydantic import BaseModel, ConfigDict, Field, ValidationError


DEFAULT_LLM_MODEL = "gpt-5.5"
DEFAULT_MAX_OUTPUT_TOKENS = 3800
MAX_JOB_OCR_CANDIDATE_CHARS = 6000

APIStyle = Literal["responses", "chat_completions"]

LLM_ANALYSIS_CONTRACT: dict[str, Any] = {
    "final_score_policy": "rule_score is the only final match score; LLM output must not replace it.",
    "importance_scale": {
        "must_have": "Hard requirement. Weight usually 4-5.",
        "important": "Important job requirement. Weight usually 3-4.",
        "nice_to_have": "Preferred or bonus requirement. Weight usually 1-3.",
    },
    "evidence_score_scale": "0-100. Higher means stronger resume evidence for the requirement.",
    "gap_score_scale": "0-100. Higher means a larger gap between resume evidence and JD expectation.",
    "privacy_boundary": "Only user-provided resume and JD text are analyzed. No scraping or third-party site access.",
    "soft_requirement_policy": (
        "Generic soft skills such as communication, teamwork, responsibility, stress tolerance, fast learning, "
        "and collaboration are usually not hard scoring dimensions. Unless the JD asks for concrete evidence "
        "such as cross-functional delivery, stakeholder management, or project ownership, classify them as "
        "nice_to_have with weight 1-2, do not mark them as high-impact gaps, and do not let them affect rule_score."
    ),
}


class LLMConfigurationError(RuntimeError):
    """Raised when the optional LLM layer is not configured."""


class LLMResponseError(RuntimeError):
    """Raised when a model returns invalid or unusable content."""


@dataclass(frozen=True)
class LLMConfig:
    provider: str
    api_key: str
    model: str
    api_style: APIStyle
    base_url: str | None
    max_output_tokens: int
    temperature: float


class JobRequirementItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    category: str
    importance: Literal["must_have", "important", "nice_to_have"]
    weight: int = Field(ge=1, le=5)
    reason: str
    evidence_expected: str


class TechnicalQuestionItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: str
    skill_area: str
    expected_evidence: str


class NormalizedJobPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role_title: str
    jd_summary: str
    core_responsibilities: list[str] = Field(min_length=2, max_length=6)
    requirements: list[JobRequirementItem] = Field(min_length=3, max_length=8)
    technical_questions: list[TechnicalQuestionItem] = Field(max_length=6)


class ScoringRubricItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dimension: str
    weight: int = Field(ge=1, le=5)
    what_good_looks_like: str


class EvidenceReviewItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    importance: Literal["must_have", "important", "nice_to_have"]
    level: Literal["strong", "medium", "weak", "missing"]
    evidence_score: int = Field(ge=0, le=100)
    confidence: int = Field(ge=0, le=100)
    resume_evidence: str
    gap: str
    why_it_matters: str


class QuantifiedGapItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requirement: str
    importance: Literal["must_have", "important", "nice_to_have"]
    gap_score: int = Field(ge=0, le=100)
    current_evidence: str
    missing_evidence: str
    impact_on_match: Literal["high", "medium", "low"]
    recommended_fix: str


class TopActionItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    priority: Literal["high", "medium", "low"]
    action: str
    target_section: str
    example: str


class RewriteExampleItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    before: str
    after: str
    why_better: str


class AdvicePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str
    normalized_job: NormalizedJobPayload
    scoring_rubric: list[ScoringRubricItem] = Field(min_length=3, max_length=6)
    evidence_review: list[EvidenceReviewItem] = Field(min_length=3, max_length=6)
    quantified_gaps: list[QuantifiedGapItem] = Field(min_length=2, max_length=6)
    top_actions: list[TopActionItem] = Field(min_length=3, max_length=5)
    rewrite_examples: list[RewriteExampleItem] = Field(min_length=1, max_length=3)


class JobNormalizationPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cleaned_job_text: str
    role_title: str
    core_requirements: list[str] = Field(max_length=8)
    technical_questions: list[TechnicalQuestionItem] = Field(max_length=6)
    removed_noise_summary: str
    confidence: int = Field(ge=0, le=100)


JD_SECTION_PATTERN = re.compile(
    r"(岗位职责|职位职责|职位描述|工作职责|工作内容|岗位描述|主要职责|你将负责|工作任务|"
    r"岗位要求|职位要求|任职要求|任职资格|任职条件|招聘要求|能力要求|技能要求|专业要求|学历要求|"
    r"加分项|优先|优先考虑|技术问题|技术问答|面试题|问答题|开放问题|bonus|preferred|nice to have|responsibilities|requirements|qualifications|"
    r"job description|what you will do|what you'll do|who you are|what we look for)",
    re.IGNORECASE,
)
JD_REQUIREMENT_PATTERN = re.compile(
    r"(要求|任职|资格|条件|具备|熟悉|掌握|了解|经验|学历|专业|能力|技能|优先|加分|"
    r"Python|SQL|Excel|JavaScript|React|HTML|CSS|JSON|API|RAG|LLM|AI|大模型|机器学习|数据分析|"
    r"requirements|qualifications|skills|experience|preferred|bonus)",
    re.IGNORECASE,
)
JD_RESPONSIBILITY_PATTERN = re.compile(
    r"(负责|参与|推进|协作|设计|分析|整理|输出|撰写|跟进|落地|优化|建设|维护|支持|"
    r"responsible|work with|design|analy[sz]e|build|manage|deliver|support)",
    re.IGNORECASE,
)
JD_QUESTION_PATTERN = re.compile(
    r"(技术问题|技术问答|面试题|问答题|开放问题|如何|怎么|为什么|请.*(说明|描述|解释|谈谈)|你.*理解|question|explain|describe|how would|what is|why)",
    re.IGNORECASE,
)
JD_NOISE_LINE_PATTERN = re.compile(
    r"^(首页|登录|注册|消息|搜索|筛选|推荐|广告|打开APP|下载APP|扫码|微信|微博|分享|收藏|举报|反馈|"
    r"上一页|下一页|更多|展开|收起|立即申请|申请职位|投递简历|在线沟通|查看地图|公司主页|职位详情|"
    r"公司详情|热招职位|全部职位|相似职位|推荐职位)$",
    re.IGNORECASE,
)
JD_STOP_SECTION_PATTERN = re.compile(
    r"(公司介绍|关于我们|企业介绍|工商信息|公司地址|工作地址|职位福利|薪资福利|福利待遇|职位亮点|"
    r"企业信息|团队介绍|举报|分享|收藏|立即沟通|立即申请|投递简历|申请职位|查看更多|展开全部|"
    r"similar jobs|recommended jobs|company profile|benefits)",
    re.IGNORECASE,
)


ADVICE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "summary",
        "normalized_job",
        "scoring_rubric",
        "evidence_review",
        "quantified_gaps",
        "top_actions",
        "rewrite_examples",
    ],
    "properties": {
        "summary": {
            "type": "string",
            "description": "One concise Chinese summary of the resume-job fit. It must not change the rule score.",
        },
        "normalized_job": {
            "type": "object",
            "additionalProperties": False,
            "required": ["role_title", "jd_summary", "core_responsibilities", "requirements", "technical_questions"],
            "properties": {
                "role_title": {"type": "string"},
                "jd_summary": {"type": "string"},
                "core_responsibilities": {
                    "type": "array",
                    "minItems": 2,
                    "maxItems": 6,
                    "items": {"type": "string"},
                },
                "requirements": {
                    "type": "array",
                    "minItems": 3,
                    "maxItems": 8,
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": [
                            "title",
                            "category",
                            "importance",
                            "weight",
                            "reason",
                            "evidence_expected",
                        ],
                        "properties": {
                            "title": {"type": "string"},
                            "category": {"type": "string"},
                            "importance": {
                                "type": "string",
                                "enum": ["must_have", "important", "nice_to_have"],
                            },
                            "weight": {
                                "type": "integer",
                                "minimum": 1,
                                "maximum": 5,
                            },
                            "reason": {"type": "string"},
                            "evidence_expected": {"type": "string"},
                        },
                    },
                },
                "technical_questions": {
                    "type": "array",
                    "maxItems": 6,
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["question", "skill_area", "expected_evidence"],
                        "properties": {
                            "question": {"type": "string"},
                            "skill_area": {"type": "string"},
                            "expected_evidence": {"type": "string"},
                        },
                    },
                },
            },
        },
        "scoring_rubric": {
            "type": "array",
            "minItems": 3,
            "maxItems": 6,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["dimension", "weight", "what_good_looks_like"],
                "properties": {
                    "dimension": {"type": "string"},
                    "weight": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 5,
                    },
                    "what_good_looks_like": {"type": "string"},
                },
            },
        },
        "evidence_review": {
            "type": "array",
            "minItems": 3,
            "maxItems": 6,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "title",
                    "importance",
                    "level",
                    "evidence_score",
                    "confidence",
                    "resume_evidence",
                    "gap",
                    "why_it_matters",
                ],
                "properties": {
                    "title": {"type": "string"},
                    "importance": {
                        "type": "string",
                        "enum": ["must_have", "important", "nice_to_have"],
                    },
                    "level": {
                        "type": "string",
                        "enum": ["strong", "medium", "weak", "missing"],
                    },
                    "evidence_score": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 100,
                    },
                    "confidence": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 100,
                    },
                    "resume_evidence": {"type": "string"},
                    "gap": {"type": "string"},
                    "why_it_matters": {"type": "string"},
                },
            },
        },
        "quantified_gaps": {
            "type": "array",
            "minItems": 2,
            "maxItems": 6,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "requirement",
                    "importance",
                    "gap_score",
                    "current_evidence",
                    "missing_evidence",
                    "impact_on_match",
                    "recommended_fix",
                ],
                "properties": {
                    "requirement": {"type": "string"},
                    "importance": {
                        "type": "string",
                        "enum": ["must_have", "important", "nice_to_have"],
                    },
                    "gap_score": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 100,
                    },
                    "current_evidence": {"type": "string"},
                    "missing_evidence": {"type": "string"},
                    "impact_on_match": {
                        "type": "string",
                        "enum": ["high", "medium", "low"],
                    },
                    "recommended_fix": {"type": "string"},
                },
            },
        },
        "top_actions": {
            "type": "array",
            "minItems": 3,
            "maxItems": 5,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["priority", "action", "target_section", "example"],
                "properties": {
                    "priority": {
                        "type": "string",
                        "enum": ["high", "medium", "low"],
                    },
                    "action": {"type": "string"},
                    "target_section": {"type": "string"},
                    "example": {"type": "string"},
                },
            },
        },
        "rewrite_examples": {
            "type": "array",
            "minItems": 1,
            "maxItems": 3,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["before", "after", "why_better"],
                "properties": {
                    "before": {"type": "string"},
                    "after": {"type": "string"},
                    "why_better": {"type": "string"},
                },
            },
        },
    },
}

JOB_NORMALIZATION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "cleaned_job_text",
        "role_title",
        "core_requirements",
        "technical_questions",
        "removed_noise_summary",
        "confidence",
    ],
    "properties": {
        "cleaned_job_text": {
            "type": "string",
            "description": "Only useful JD content. Remove navigation, buttons, company intro, benefits, ads, recommendations and unrelated page text.",
        },
        "role_title": {
            "type": "string",
            "description": "Inferred role title. Empty string if unknown.",
        },
        "core_requirements": {
            "type": "array",
            "maxItems": 8,
            "items": {"type": "string"},
        },
        "technical_questions": {
            "type": "array",
            "maxItems": 6,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["question", "skill_area", "expected_evidence"],
                "properties": {
                    "question": {"type": "string"},
                    "skill_area": {"type": "string"},
                    "expected_evidence": {"type": "string"},
                },
            },
        },
        "removed_noise_summary": {"type": "string"},
        "confidence": {
            "type": "integer",
            "minimum": 0,
            "maximum": 100,
        },
    },
}


SYSTEM_INSTRUCTIONS = """
你是一个面向中文求职者的 AI 简历优化顾问。

你的任务：
1. 基于输入的岗位 JD、简历文本和规则匹配结果，生成结构化分析。
2. 将 JD 规范化为岗位标题、职责、要求、重要程度和 1-5 权重。
3. 如果 JD 中包含技术性问题或问答题，将它们单独放入 technical_questions，并说明考察能力和期望简历证据。
4. 对简历证据进行量化：evidence_score 为 0-100，confidence 为 0-100。
5. 对 gap evidence 进行量化：gap_score 为 0-100，分数越高表示缺口越严重。
6. 不要修改、重算或质疑 rule_score，最终匹配分数由规则层负责。
7. 不要编造用户没有提供的经历、公司、数字、证书或结果。
8. 如果简历缺少证据，请明确指出“需要补充”，不要替用户虚构。
9. 对“沟通能力、团队协作、责任心、抗压能力、学习能力、执行力”等软性要求要降权处理。
10. 输出必须是符合 schema 的中文 JSON。

评分稳定性原则：
- 规则匹配层负责稳定分数。
- LLM 层负责语义理解、JD 规范化、证据强弱、gap evidence 和修改建议。
- 不允许输出新的最终匹配分数，不允许用 LLM 分数覆盖 rule_score。

重要程度口径：
- must_have：JD 中明确要求、反复出现或直接影响岗位胜任的能力，权重通常 4-5。
- important：对岗位有明显帮助但不是唯一准入条件的能力，权重通常 3-4。
- nice_to_have：加分项、优先项或补充经验，权重通常 1-3。

软性要求保护规则：
- 通用软性要求通常不能作为高权重硬缺口，例如“沟通能力强”“团队协作好”“责任心强”“抗压能力强”“学习能力强”。
- 如果 JD 只是泛泛写软性要求，将 importance 设为 nice_to_have，weight 设为 1-2。
- 只有当 JD 明确要求可验证的协作成果，例如“跨部门推动项目落地”“管理 stakeholder”“组织项目排期和复盘”，才可以把它归为 important。
- 不要因为简历没有直写“沟通能力强/团队协作好”就给高 gap_score；应检查简历是否有项目推进、协作交付、沟通对齐等间接证据。
- 软性要求不得改变、覆盖或重算 rule_score。

合规与隐私边界：
- 只分析用户提供的简历和 JD 文本，不访问、不抓取、不推断第三方网站内容。
- 不输出与岗位无关的个人敏感评价，例如年龄、性别、民族、婚育、健康状况。
- 不建议用户伪造经历，只能建议补充真实经历、量化真实结果或改写表达。
""".strip()

JOB_NORMALIZATION_INSTRUCTIONS = """
你是一个中文招聘 JD 文本清洗助手。

任务：
1. 输入可能来自截图 OCR，里面可能混有网页导航、按钮、公司介绍、福利、推荐职位和广告。
2. 只保留和目标岗位直接相关的内容：岗位名称、岗位职责/工作内容、岗位要求/任职要求/任职资格、技能要求、加分项、技术问题。
3. 岗位职责和岗位要求都必须考虑；不要因为截图里出现“要求”“任职资格”就把它误删。
4. 如果 JD 中出现技术问答题，例如“你如何理解 RAG”，不要删除，要放入 technical_questions，同时也要在 cleaned_job_text 的“技术问题”部分保留。
5. 不要补写原文没有的信息，不要编造公司、薪资、学历或技能要求。
6. 对“沟通能力、团队协作、责任心、抗压能力、学习能力、执行力”等软性要求要保留但标记为低优先级语义，不要把它们当作核心硬技能。
7. 输出必须是符合 schema 的中文 JSON。

清洗边界：
- 删除：登录、注册、分享、收藏、立即申请、投递简历、公司介绍、福利待遇、地址、推荐职位等无关内容。
- 保留：职责、要求、技能、经验、学历、专业、工具、项目要求、加分项、技术问题。

cleaned_job_text 格式：
- 尽量整理为“岗位名称 / 岗位职责 / 岗位要求 / 加分项 / 技术问题”几段。
- 岗位职责来自“岗位职责、职位描述、工作内容、你将负责、Responsibilities、What you will do”等部分。
- 岗位要求来自“岗位要求、任职要求、任职资格、招聘要求、Requirements、Qualifications、Who you are”等部分。
- 加分项来自“优先、加分、Bonus、Preferred、Nice to have”等部分。
- 软性要求可以保留在“岗位要求”里，但不要把泛泛的沟通、协作、责任心、抗压能力写成核心技能要求。
- 如果原文只有职责或只有要求，可以只输出存在的部分，但不要把要求合并成网页噪音。
""".strip()


def get_env_value(*names: str) -> str | None:
    for name in names:
        value = os.getenv(name)
        if value:
            return value
    return None


def get_override_value(config_override: Mapping[str, Any] | None, name: str) -> str | None:
    if not config_override:
        return None
    value = config_override.get(name)
    if isinstance(value, str):
        value = value.strip()
        return value or None
    if value is None:
        return None
    return str(value)


def get_llm_api_key(config_override: Mapping[str, Any] | None = None) -> str:
    return get_override_value(config_override, "api_key") or get_env_value("LLM_API_KEY", "OPENAI_API_KEY") or ""


def get_llm_model(config_override: Mapping[str, Any] | None = None) -> str:
    return get_override_value(config_override, "model") or get_env_value("LLM_MODEL", "OPENAI_MODEL") or DEFAULT_LLM_MODEL


def get_llm_base_url(config_override: Mapping[str, Any] | None = None) -> str | None:
    return get_override_value(config_override, "base_url") or get_env_value("LLM_BASE_URL", "OPENAI_BASE_URL")


def get_llm_api_style(config_override: Mapping[str, Any] | None = None) -> APIStyle:
    raw_style = (get_override_value(config_override, "api_style") or os.getenv("LLM_API_STYLE") or "").strip().lower()
    if raw_style in {"responses", "chat_completions"}:
        return raw_style  # type: ignore[return-value]
    if get_llm_base_url(config_override):
        return "chat_completions"
    return "responses"


def get_int_config_value(
    config_override: Mapping[str, Any] | None,
    name: str,
    env_name: str,
    default_value: int,
) -> int:
    raw_value = get_override_value(config_override, name) or os.getenv(env_name)
    if raw_value is None:
        return default_value
    return int(raw_value)


def get_float_config_value(
    config_override: Mapping[str, Any] | None,
    name: str,
    env_name: str,
    default_value: float,
) -> float:
    raw_value = get_override_value(config_override, name) or os.getenv(env_name)
    if raw_value is None:
        return default_value
    return float(raw_value)


def get_llm_config(config_override: Mapping[str, Any] | None = None) -> LLMConfig:
    return LLMConfig(
        provider=get_override_value(config_override, "provider") or os.getenv("LLM_PROVIDER", "openai"),
        api_key=get_llm_api_key(config_override),
        model=get_llm_model(config_override),
        api_style=get_llm_api_style(config_override),
        base_url=get_llm_base_url(config_override),
        max_output_tokens=get_int_config_value(
            config_override,
            "max_output_tokens",
            "LLM_MAX_OUTPUT_TOKENS",
            DEFAULT_MAX_OUTPUT_TOKENS,
        ),
        temperature=get_float_config_value(config_override, "temperature", "LLM_TEMPERATURE", 0.2),
    )


def llm_is_configured() -> bool:
    return bool(get_llm_api_key())


def get_llm_metadata() -> dict[str, Any]:
    config = get_llm_config()
    return {
        "llm_configured": bool(config.api_key),
        "llm_provider": config.provider,
        "llm_model": config.model,
        "llm_api_style": config.api_style,
        "llm_base_url": config.base_url,
    }


def get_llm_analysis_contract() -> dict[str, Any]:
    return LLM_ANALYSIS_CONTRACT


def normalize_ocr_line(line: str) -> str:
    return re.sub(r"\s+", " ", line.replace("\u3000", " ")).strip()


def is_job_candidate_line(line: str, inside_job_block: bool) -> bool:
    if not line or len(line) > 320:
        return False
    if re.match(r"^https?://", line, re.IGNORECASE):
        return False
    if JD_NOISE_LINE_PATTERN.fullmatch(line):
        return False

    bullet_like = bool(re.match(r"^([-*•·]|\d+[.、)]|[一二三四五六七八九十]+[、.])", line))
    has_section = bool(JD_SECTION_PATTERN.search(line))
    has_requirement = bool(JD_REQUIREMENT_PATTERN.search(line))
    has_responsibility = bool(JD_RESPONSIBILITY_PATTERN.search(line))
    has_question = bool(JD_QUESTION_PATTERN.search(line)) and ("?" in line or "？" in line or len(line) >= 12)
    return inside_job_block or bullet_like or has_section or has_requirement or has_responsibility or has_question


def build_job_ocr_candidate(raw_text: str) -> str:
    lines = [normalize_ocr_line(line) for line in raw_text.replace("\r", "\n").split("\n")]
    lines = [line for line in lines if line]

    kept: list[str] = []
    seen: set[str] = set()
    inside_job_block = False

    for line in lines:
        compact = re.sub(r"^[^\w\u4e00-\u9fa5]+", "", line).strip()
        if not compact or compact in seen:
            continue

        if JD_SECTION_PATTERN.search(compact):
            inside_job_block = True
        elif inside_job_block and JD_STOP_SECTION_PATTERN.search(compact) and len(kept) >= 3:
            break

        if not is_job_candidate_line(compact, inside_job_block):
            continue

        seen.add(compact)
        kept.append(compact)

        if sum(len(item) for item in kept) >= MAX_JOB_OCR_CANDIDATE_CHARS:
            break

    return "\n".join(kept)


def build_advice_input(resume_text: str, job_text: str, analysis: dict[str, Any]) -> str:
    compact_analysis = {
        "rule_score": analysis.get("score"),
        "score_details": analysis.get("score_details"),
        "matched_keywords": analysis.get("matched_keywords"),
        "missing_keywords": analysis.get("missing_keywords"),
        "category_summary": analysis.get("category_summary"),
        "priority_gaps": analysis.get("priority_gaps"),
    }

    return "\n\n".join(
        [
            "请基于以下信息生成结构化 LLM 分析结果。",
            "固定规则：rule_score 是唯一最终匹配分数，不要重算、覆盖或新增最终分数。",
            "请对 JD 要求进行规范化，并给出重要程度 must_have / important / nice_to_have 与 1-5 权重。",
            "请对简历证据给出 0-100 evidence_score，对缺口给出 0-100 gap_score。",
            "【固定分析口径】",
            json.dumps(LLM_ANALYSIS_CONTRACT, ensure_ascii=False, indent=2),
            "【岗位 JD】",
            job_text,
            "【简历文本】",
            resume_text,
            "【规则匹配结果】",
            json.dumps(compact_analysis, ensure_ascii=False, indent=2),
        ]
    )


def build_chat_prompt(resume_text: str, job_text: str, analysis: dict[str, Any]) -> str:
    return "\n\n".join(
        [
            build_advice_input(resume_text, job_text, analysis),
            "请只返回 JSON 对象，不要使用 Markdown，不要包裹 ```json 代码块。",
            "JSON 必须符合以下 schema：",
            json.dumps(ADVICE_SCHEMA, ensure_ascii=False, indent=2),
        ]
    )


def build_job_normalization_input(raw_text: str) -> str:
    candidate_text = build_job_ocr_candidate(raw_text)
    return "\n\n".join(
        [
            "请从以下 OCR 或网页复制文本中提取真正的岗位 JD。",
            "必须同时考虑两类核心内容：岗位职责/工作内容，以及岗位要求/任职要求/任职资格。",
            "还要保留加分项/优先项、技能工具、学历专业、经验年限、项目要求和 JD 中出现的技术问题。",
            "如果文本里出现通用软性要求，如沟通、团队协作、责任心、抗压能力、学习能力，只能作为低优先级要求保留，不要当成硬技能。",
            "删除网页噪音、按钮、导航、福利、公司介绍、推荐职位、广告、地址和投递入口。",
            "cleaned_job_text 请整理成清晰中文文本，优先使用这些小标题：岗位名称、岗位职责、岗位要求、加分项、技术问题。",
            "如果某类内容原文不存在，不要编造；如果没有足够 JD 信息，cleaned_job_text 返回尽可能少的可靠内容，并降低 confidence。",
            "【规则候选文本】",
            candidate_text or "未提取到可靠候选行，请直接根据原始文本判断。",
            "【原始文本】",
            raw_text,
        ]
    )


def build_job_normalization_chat_prompt(raw_text: str) -> str:
    return "\n\n".join(
        [
            build_job_normalization_input(raw_text),
            "请只返回 JSON 对象，不要使用 Markdown，不要包裹 ```json 代码块。",
            "JSON 必须符合以下 schema：",
            json.dumps(JOB_NORMALIZATION_SCHEMA, ensure_ascii=False, indent=2),
        ]
    )


def create_openai_client(config: LLMConfig) -> Any:
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise LLMConfigurationError("The openai package is not installed.") from exc

    if config.base_url:
        return OpenAI(api_key=config.api_key, base_url=config.base_url)
    return OpenAI(api_key=config.api_key)


def extract_balanced_json_object(text: str) -> str | None:
    start = text.find("{")
    if start < 0:
        return None

    depth = 0
    in_string = False
    escaped = False

    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]

    return None


def try_repair_json(text: str) -> dict[str, Any] | None:
    try:
        from json_repair import repair_json
    except ImportError:
        return None

    try:
        repaired = repair_json(text, return_objects=True)
    except Exception:
        return None

    return repaired if isinstance(repaired, dict) else None


def parse_json_object(raw_text: str) -> dict[str, Any]:
    text = raw_text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        balanced_text = extract_balanced_json_object(text)
        if balanced_text:
            try:
                return json.loads(balanced_text)
            except json.JSONDecodeError:
                repaired = try_repair_json(balanced_text)
                if repaired is not None:
                    return repaired

        repaired = try_repair_json(text)
        if repaired is not None:
            return repaired

        raise LLMResponseError(f"Model did not return valid JSON: {exc}") from exc


def validate_advice(raw_advice: dict[str, Any]) -> dict[str, Any]:
    try:
        return AdvicePayload.model_validate(raw_advice).model_dump()
    except ValidationError as exc:
        raise LLMResponseError(f"Model returned invalid advice JSON: {exc}") from exc


def validate_job_normalization(raw_payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return JobNormalizationPayload.model_validate(raw_payload).model_dump()
    except ValidationError as exc:
        raise LLMResponseError(f"Model returned invalid JD normalization JSON: {exc}") from exc


def generate_with_responses_api(
    client: Any,
    config: LLMConfig,
    resume_text: str,
    job_text: str,
    analysis: dict[str, Any],
) -> dict[str, Any]:
    response = client.responses.create(
        model=config.model,
        instructions=SYSTEM_INSTRUCTIONS,
        input=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": build_advice_input(resume_text, job_text, analysis),
                    }
                ],
            }
        ],
        text={
            "format": {
                "type": "json_schema",
                "name": "resume_job_advice",
                "schema": ADVICE_SCHEMA,
                "strict": True,
            }
        },
        max_output_tokens=config.max_output_tokens,
    )

    return validate_advice(json.loads(response.output_text))


def generate_with_chat_completions(
    client: Any,
    config: LLMConfig,
    resume_text: str,
    job_text: str,
    analysis: dict[str, Any],
) -> dict[str, Any]:
    response = client.chat.completions.create(
        model=config.model,
        messages=[
            {"role": "system", "content": SYSTEM_INSTRUCTIONS},
            {"role": "user", "content": build_chat_prompt(resume_text, job_text, analysis)},
        ],
        response_format={"type": "json_object"},
        temperature=config.temperature,
        max_tokens=config.max_output_tokens,
    )

    content = response.choices[0].message.content
    if not isinstance(content, str) or not content.strip():
        raise LLMResponseError("Model returned empty advice content.")

    try:
        return validate_advice(parse_json_object(content))
    except LLMResponseError as first_error:
        retry_response = client.chat.completions.create(
            model=config.model,
            messages=[
                {"role": "system", "content": SYSTEM_INSTRUCTIONS},
                {
                    "role": "user",
                    "content": "\n\n".join(
                        [
                            "上一次输出没有通过 JSON schema 校验，请重新生成完整 JSON。",
                            f"校验错误：{first_error}",
                            "必须包含所有 required 字段，尤其是 normalized_job、scoring_rubric、evidence_review、quantified_gaps、top_actions、rewrite_examples。",
                            "每个字符串尽量控制在 80 个中文字符以内，避免输出被截断。",
                            build_chat_prompt(resume_text, job_text, analysis),
                        ]
                    ),
                },
            ],
            response_format={"type": "json_object"},
            temperature=0,
            max_tokens=config.max_output_tokens,
        )

        retry_content = retry_response.choices[0].message.content
        if not isinstance(retry_content, str) or not retry_content.strip():
            raise first_error
        return validate_advice(parse_json_object(retry_content))


def normalize_job_with_responses_api(
    client: Any,
    config: LLMConfig,
    raw_text: str,
) -> dict[str, Any]:
    response = client.responses.create(
        model=config.model,
        instructions=JOB_NORMALIZATION_INSTRUCTIONS,
        input=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": build_job_normalization_input(raw_text),
                    }
                ],
            }
        ],
        text={
            "format": {
                "type": "json_schema",
                "name": "job_normalization",
                "schema": JOB_NORMALIZATION_SCHEMA,
                "strict": True,
            }
        },
        max_output_tokens=min(config.max_output_tokens, 2200),
    )

    return validate_job_normalization(json.loads(response.output_text))


def normalize_job_with_chat_completions(
    client: Any,
    config: LLMConfig,
    raw_text: str,
) -> dict[str, Any]:
    response = client.chat.completions.create(
        model=config.model,
        messages=[
            {"role": "system", "content": JOB_NORMALIZATION_INSTRUCTIONS},
            {"role": "user", "content": build_job_normalization_chat_prompt(raw_text)},
        ],
        response_format={"type": "json_object"},
        temperature=0,
        max_tokens=min(config.max_output_tokens, 2200),
    )

    content = response.choices[0].message.content
    if not isinstance(content, str) or not content.strip():
        raise LLMResponseError("Model returned empty JD normalization content.")

    return validate_job_normalization(parse_json_object(content))


def generate_advice(
    resume_text: str,
    job_text: str,
    analysis: dict[str, Any],
    config_override: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    config = get_llm_config(config_override)
    if not config.api_key:
        raise LLMConfigurationError("LLM_API_KEY or OPENAI_API_KEY is not configured.")

    client = create_openai_client(config)

    if config.api_style == "chat_completions":
        return generate_with_chat_completions(client, config, resume_text, job_text, analysis)

    return generate_with_responses_api(client, config, resume_text, job_text, analysis)


def normalize_job_text(
    raw_text: str,
    config_override: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    config = get_llm_config(config_override)
    if not config.api_key:
        raise LLMConfigurationError("LLM_API_KEY or OPENAI_API_KEY is not configured.")

    client = create_openai_client(config)

    if config.api_style == "chat_completions":
        return normalize_job_with_chat_completions(client, config, raw_text)

    return normalize_job_with_responses_api(client, config, raw_text)
