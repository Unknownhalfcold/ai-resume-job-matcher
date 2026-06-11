from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any, Literal, Mapping

from pydantic import BaseModel, ConfigDict, Field, ValidationError


DEFAULT_LLM_MODEL = "gpt-5.5"
DEFAULT_MAX_OUTPUT_TOKENS = 2000
MAX_LLM_TIMEOUT_SECONDS = 28
MAX_JOB_OCR_CANDIDATE_CHARS = 16000

APIStyle = Literal["responses", "chat_completions"]

LLM_ANALYSIS_CONTRACT: dict[str, Any] = {
    "final_score_policy": (
        "The LLM supplies bounded component scores. The backend applies the fixed formula, penalties, "
        "and score caps to produce the final score."
    ),
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
    "final_score_formula": (
        "The backend calculates 25% keyword match, 30% semantic match, 30% experience match, "
        "15% resume quality, up to 5 bonus points, core-skill penalties, and deterministic score caps."
    ),
    "company_context_policy": (
        "Company name, company scale, and historical hiring context may only be used when explicitly present in "
        "the user-provided JD or resume. Never invent prior hiring cases or claim external verification."
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


class ScoreAssessment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    semantic_match_score: int = Field(ge=0, le=100)
    experience_match_score: int = Field(ge=0, le=100)
    resume_quality_score: int = Field(ge=0, le=100)
    semantic_reason: str
    experience_reason: str
    quality_reason: str


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


class CredentialReviewItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    credential_type: Literal["certificate", "award"]
    relevance_score: int = Field(ge=0, le=100)
    credibility: Literal["high", "medium", "low", "unverified"]
    score_bonus: int = Field(ge=0, le=5)
    rationale: str


class CompanyRoleContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    company_name: str
    company_scale: Literal["large", "medium", "small", "startup", "unknown"]
    role_title: str
    context_source: Literal["job_description", "user_provided", "unknown"]
    hiring_context_summary: str
    historical_hiring_evidence: str
    confidence: int = Field(ge=0, le=100)


class ApplicationFormGuidance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    keep_in_resume: list[str] = Field(max_length=8)
    usually_form_only: list[str] = Field(max_length=10)
    avoid_duplicate_items: list[str] = Field(max_length=8)


class HRPerspective(BaseModel):
    model_config = ConfigDict(extra="forbid")

    screening_decision: Literal["strong_pass", "borderline", "weak_pass", "reject"]
    first_screen_strengths: list[str] = Field(max_length=6)
    first_screen_concerns: list[str] = Field(max_length=6)
    likely_interview_questions: list[str] = Field(max_length=6)


class FastRequirementItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str
    category: str
    importance: Literal["must_have", "important", "nice_to_have"]
    weight: int = Field(ge=1, le=5)
    evidence_expected: str


class FastEvidenceItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str
    importance: Literal["must_have", "important", "nice_to_have"]
    level: Literal["strong", "medium", "weak", "missing"]
    evidence_score: int = Field(ge=0, le=100)
    confidence: int = Field(ge=0, le=100)
    resume_evidence: str
    gap: str


class FastAdvicePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    summary: str = ""
    role_title: str = ""
    jd_summary: str = ""
    core_responsibilities: list[str] = Field(default_factory=list, max_length=4)
    requirements: list[FastRequirementItem] = Field(default_factory=list, max_length=6)
    technical_questions: list[TechnicalQuestionItem] = Field(default_factory=list, max_length=3)
    score_assessment: ScoreAssessment | None = None
    evidence_review: list[FastEvidenceItem] = Field(default_factory=list, max_length=5)
    top_actions: list[TopActionItem] = Field(default_factory=list, max_length=4)
    credential_review: list[CredentialReviewItem] = Field(default_factory=list, max_length=5)
    company_name: str = ""
    company_scale: Literal["large", "medium", "small", "startup", "unknown"] = "unknown"
    hiring_context_summary: str = ""
    screening_decision: Literal["strong_pass", "borderline", "weak_pass", "reject"] = "borderline"
    first_screen_strengths: list[str] = Field(default_factory=list, max_length=4)
    first_screen_concerns: list[str] = Field(default_factory=list, max_length=4)
    likely_interview_questions: list[str] = Field(default_factory=list, max_length=4)


class BenchmarkComparison(BaseModel):
    model_config = ConfigDict(extra="forbid")

    benchmark_available: bool
    basis: Literal["verified_aggregate", "jd_only"]
    source_notice: str
    typical_education_background: list[str] = Field(max_length=5)
    common_awards_or_credentials: list[str] = Field(max_length=5)
    common_research_directions: list[str] = Field(max_length=5)
    common_internship_experience: list[str] = Field(max_length=5)
    candidate_comparison: str


class AdvicePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str
    normalized_job: NormalizedJobPayload
    score_assessment: ScoreAssessment
    scoring_rubric: list[ScoringRubricItem] = Field(min_length=3, max_length=6)
    evidence_review: list[EvidenceReviewItem] = Field(min_length=3, max_length=6)
    quantified_gaps: list[QuantifiedGapItem] = Field(min_length=2, max_length=6)
    top_actions: list[TopActionItem] = Field(min_length=3, max_length=5)
    rewrite_examples: list[RewriteExampleItem] = Field(min_length=1, max_length=3)
    credential_review: list[CredentialReviewItem] = Field(max_length=8)
    company_role_context: CompanyRoleContext
    application_form_guidance: ApplicationFormGuidance
    hr_perspective: HRPerspective
    benchmark_comparison: BenchmarkComparison


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
APPLICATION_ONLY_REQUIREMENT_PATTERN = re.compile(
    r"(到岗|每周.{0,4}天|实习天数|实习时长|连续实习|可实习|入职时间|"
    r"工作地点|地点偏好|期望薪资|薪资要求|身份证|政治面貌|网申来源|接受调剂|"
    r"available|availability|days?\s+per\s+week|start\s+date|salary|"
    r"work\s+location|relocat|visa|work\s+authorization)",
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
        "score_assessment",
        "scoring_rubric",
        "evidence_review",
        "quantified_gaps",
        "top_actions",
        "rewrite_examples",
        "credential_review",
        "company_role_context",
        "application_form_guidance",
        "hr_perspective",
        "benchmark_comparison",
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
        "score_assessment": {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "semantic_match_score",
                "experience_match_score",
                "resume_quality_score",
                "semantic_reason",
                "experience_reason",
                "quality_reason",
            ],
            "properties": {
                "semantic_match_score": {"type": "integer", "minimum": 0, "maximum": 100},
                "experience_match_score": {"type": "integer", "minimum": 0, "maximum": 100},
                "resume_quality_score": {"type": "integer", "minimum": 0, "maximum": 100},
                "semantic_reason": {"type": "string"},
                "experience_reason": {"type": "string"},
                "quality_reason": {"type": "string"},
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
        "credential_review": {
            "type": "array",
            "maxItems": 8,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "name",
                    "credential_type",
                    "relevance_score",
                    "credibility",
                    "score_bonus",
                    "rationale",
                ],
                "properties": {
                    "name": {"type": "string"},
                    "credential_type": {"type": "string", "enum": ["certificate", "award"]},
                    "relevance_score": {"type": "integer", "minimum": 0, "maximum": 100},
                    "credibility": {
                        "type": "string",
                        "enum": ["high", "medium", "low", "unverified"],
                    },
                    "score_bonus": {"type": "integer", "minimum": 0, "maximum": 5},
                    "rationale": {"type": "string"},
                },
            },
        },
        "company_role_context": {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "company_name",
                "company_scale",
                "role_title",
                "context_source",
                "hiring_context_summary",
                "historical_hiring_evidence",
                "confidence",
            ],
            "properties": {
                "company_name": {"type": "string"},
                "company_scale": {
                    "type": "string",
                    "enum": ["large", "medium", "small", "startup", "unknown"],
                },
                "role_title": {"type": "string"},
                "context_source": {
                    "type": "string",
                    "enum": ["job_description", "user_provided", "unknown"],
                },
                "hiring_context_summary": {"type": "string"},
                "historical_hiring_evidence": {"type": "string"},
                "confidence": {"type": "integer", "minimum": 0, "maximum": 100},
            },
        },
        "application_form_guidance": {
            "type": "object",
            "additionalProperties": False,
            "required": ["keep_in_resume", "usually_form_only", "avoid_duplicate_items"],
            "properties": {
                "keep_in_resume": {
                    "type": "array",
                    "maxItems": 8,
                    "items": {"type": "string"},
                },
                "usually_form_only": {
                    "type": "array",
                    "maxItems": 10,
                    "items": {"type": "string"},
                },
                "avoid_duplicate_items": {
                    "type": "array",
                    "maxItems": 8,
                    "items": {"type": "string"},
                },
            },
        },
        "hr_perspective": {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "screening_decision",
                "first_screen_strengths",
                "first_screen_concerns",
                "likely_interview_questions",
            ],
            "properties": {
                "screening_decision": {
                    "type": "string",
                    "enum": ["strong_pass", "borderline", "weak_pass", "reject"],
                },
                "first_screen_strengths": {
                    "type": "array",
                    "maxItems": 6,
                    "items": {"type": "string"},
                },
                "first_screen_concerns": {
                    "type": "array",
                    "maxItems": 6,
                    "items": {"type": "string"},
                },
                "likely_interview_questions": {
                    "type": "array",
                    "maxItems": 6,
                    "items": {"type": "string"},
                },
            },
        },
        "benchmark_comparison": {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "benchmark_available",
                "basis",
                "source_notice",
                "typical_education_background",
                "common_awards_or_credentials",
                "common_research_directions",
                "common_internship_experience",
                "candidate_comparison",
            ],
            "properties": {
                "benchmark_available": {"type": "boolean"},
                "basis": {"type": "string", "enum": ["verified_aggregate", "jd_only"]},
                "source_notice": {"type": "string"},
                "typical_education_background": {
                    "type": "array",
                    "maxItems": 5,
                    "items": {"type": "string"},
                },
                "common_awards_or_credentials": {
                    "type": "array",
                    "maxItems": 5,
                    "items": {"type": "string"},
                },
                "common_research_directions": {
                    "type": "array",
                    "maxItems": 5,
                    "items": {"type": "string"},
                },
                "common_internship_experience": {
                    "type": "array",
                    "maxItems": 5,
                    "items": {"type": "string"},
                },
                "candidate_comparison": {"type": "string"},
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
6. 输出 semantic_match_score、experience_match_score、resume_quality_score 三个 0-100 分项；不要直接输出最终总分。
7. 不要编造用户没有提供的经历、公司、数字、证书或结果。
8. 如果简历缺少证据，请明确指出“需要补充”，不要替用户虚构。
9. 对“沟通能力、团队协作、责任心、抗压能力、学习能力、执行力”等软性要求要降权处理。
10. 识别简历中明确出现的证书和获奖情况，判断与岗位的相关性、可信度和有限加分；无法核验时标记 unverified 且 score_bonus 必须为 0。
11. 以该 JD 对应公司的招聘 HR 初筛视角审阅简历，但只能使用用户提供的公司名称、岗位名称、公司规模和招聘上下文。
12. 不得编造公司的历史招聘案例。如果用户材料中没有先前招聘案例，historical_hiring_evidence 必须明确写“用户材料未提供，无法核验”。
13. 区分“应写在简历里的证明材料”和“通常由招聘网站表单单独收集的信息”。
14. 输出必须是符合 schema 的中文 JSON。
15. 不限定 AI、互联网或产品岗位。根据当前 JD 自主识别工程、理学、医学、商科、法律、教育、设计、人文社科等专业要求。
16. 如果提供了有来源的匿名录用背景基准，只能概括其教育层次、奖项证书、研究方向和实习类型；没有基准时必须使用 jd_only，四类背景列表保持为空。
17. 建议要具体、直接、尖锐但不羞辱用户。指出可能导致 HR 淘汰的真实问题，并给出可执行的修正动作。
18. 不要因用户专业名称与岗位名称不同就直接判定不匹配；应寻找课程、项目、研究、实习和成果中的可迁移证据。
19. 所有原因、建议和示例保持精炼，每项优先使用一句话完成，不重复解释同一个结论。

评分稳定性原则：
- 关键词层负责可复现的显性覆盖分。
- LLM 只输出语义、经历和简历质量三个受限分项，并解释依据。
- 后端统一执行加权公式、加分、核心技能惩罚和分数上限，LLM 不得自行给最终总分。
- 语义分看“能力是否等价”，经历分看“经历深度、职责相似度和成果证据”，质量分看“结构、清晰度、量化程度和可信表达”。
- 经历分重点检查任务相似度、复杂度、责任范围、成果证据和岗位阶段；未提供时长或数字时不得猜测。
- 学历和院校层次只有在 JD 明确要求，或后端提供了有来源的匿名聚合基准时才能影响分析；不得把学校标签当作能力本身。

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

证书与获奖规则：
- 只分析简历明确出现的证书或奖项，不得补全用户未提供的等级、主办方、名次或获奖比例。
- 相关性优先于知名度。与岗位无关的证书或奖项 score_bonus 为 0。
- 只有名称、颁发机构、级别或获奖结果足够明确时才允许 credibility 为 high / medium / low。
- 无法从用户文本核验含金量时 credibility 必须为 unverified，score_bonus 必须为 0。
- 全部证书和奖项合计最多只能为最终综合分贡献 5 分。

公司与具体岗位规则：
- company_name、role_title 和 company_scale 只能来自用户提供的 JD 或简历；不确定时输出 unknown 或空字符串。
- 不能假装访问过该公司的官网、招聘网站、往年面经或内部招聘数据。
- 如果用户材料明确包含公司规模、岗位名称或历史招聘案例，可以用于分析；否则只按当前 JD 判断。
- HR 视角是模拟初筛，不代表该公司的真实录用结论。
- 如果没有公司名称，只按 JD 的岗位要求分析，不推测雇主偏好。
- 只有后端明确提供 benchmark_context 时，才能谈“已录用背景”；不得用常识或模型记忆伪造员工画像。
- benchmark_context 必须是匿名、聚合且带来源说明的数据，不输出个人姓名、联系方式或可识别个人的信息。

招聘表单与简历边界：
- 简历应保留能证明能力的教育、项目、实习、技能、证书、奖项和量化成果。
- 通常由招聘网站单独收集的字段，不要建议用户重复塞进简历正文：可到岗日期、每周实习天数、可实习月份、期望薪资、工作地点偏好、身份证号、政治面貌、网申来源、是否接受调剂。
- 姓名、常用邮箱和联系电话仍可以保留在简历页眉，不能一概删除。
- 如果 JD 明确要求在简历注明某项安排，则以 JD 为准。

合规与隐私边界：
- 只分析用户提供的简历和 JD 文本，不访问、不抓取、不推断第三方网站内容。
- 不输出与岗位无关的个人敏感评价，例如年龄、性别、民族、婚育、健康状况。
- 不建议用户伪造经历，只能建议补充真实经历、量化真实结果或改写表达。
""".strip()

JOB_NORMALIZATION_INSTRUCTIONS = """
你是一个中文招聘 JD 文本清洗助手。

任务：
1. 输入可能由多张截图 OCR 合并而成，每个“【来源 n/N：文件名】”都代表一张独立截图或文件，必须逐一检查，不能只处理第一个来源。
2. 只保留和目标岗位直接相关的内容：岗位名称、岗位职责/工作内容、岗位要求/任职要求/任职资格、技能要求、加分项、技术问题。
3. 岗位职责和岗位要求都必须考虑；不要因为截图里出现“要求”“任职资格”就把它误删。
4. 如果 JD 中出现技术问答题，例如“你如何理解 RAG”，不要删除，要放入 technical_questions，同时也要在 cleaned_job_text 的“技术问题”部分保留。
5. 不要补写原文没有的信息，不要编造公司、薪资、学历或技能要求。
6. 对“沟通能力、团队协作、责任心、抗压能力、学习能力、执行力”等软性要求要保留但标记为低优先级语义，不要把它们当作核心硬技能。
7. 修复 OCR 造成的汉字间多余空格、错误断行、重复编号和重复句子；语义不确定的字符不要擅自猜测。
8. 多张截图可能是同一 JD 的连续页面。请按语义而不是截图顺序合并，去除跨截图重复内容，但保留后续截图新增的要求。
9. 输出必须是符合 schema 的中文 JSON。

清洗边界：
- 删除：登录、注册、分享、收藏、立即申请、投递简历、公司介绍、福利待遇、地址、推荐职位等无关内容。
- 保留：职责、要求、技能、经验、学历、专业、工具、项目要求、加分项、技术问题。

cleaned_job_text 格式：
- 使用纯文本，按“岗位名称 / 岗位职责 / 岗位要求 / 加分项 / 技术问题”分段。
- 岗位职责、岗位要求、加分项和技术问题中的每条内容使用“- ”开头，一条一行。
- 不要输出来源文件名、网页按钮、清洗过程、JSON 标记或 Markdown 标题符号。
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


def get_llm_api_key() -> str:
    return get_env_value("LLM_API_KEY", "OPENAI_API_KEY") or ""


def get_llm_model() -> str:
    return get_env_value("LLM_MODEL", "OPENAI_MODEL") or DEFAULT_LLM_MODEL


def get_llm_base_url() -> str | None:
    return get_env_value("LLM_BASE_URL", "OPENAI_BASE_URL")


def get_llm_api_style() -> APIStyle:
    raw_style = (os.getenv("LLM_API_STYLE") or "").strip().lower()
    if raw_style in {"responses", "chat_completions"}:
        return raw_style  # type: ignore[return-value]
    if get_llm_base_url():
        return "chat_completions"
    return "responses"


def get_int_config_value(env_name: str, default_value: int) -> int:
    raw_value = os.getenv(env_name)
    if raw_value is None:
        return default_value
    return int(raw_value)


def get_float_config_value(env_name: str, default_value: float) -> float:
    raw_value = os.getenv(env_name)
    if raw_value is None:
        return default_value
    return float(raw_value)


def get_llm_request_timeout_seconds() -> float:
    configured_timeout = get_float_config_value(
        "LLM_REQUEST_TIMEOUT_SECONDS",
        MAX_LLM_TIMEOUT_SECONDS,
    )
    return max(1, min(configured_timeout, MAX_LLM_TIMEOUT_SECONDS))


def get_llm_config() -> LLMConfig:
    return LLMConfig(
        provider=os.getenv("LLM_PROVIDER", "openai"),
        api_key=get_llm_api_key(),
        model=get_llm_model(),
        api_style=get_llm_api_style(),
        base_url=get_llm_base_url(),
        max_output_tokens=get_int_config_value("LLM_MAX_OUTPUT_TOKENS", DEFAULT_MAX_OUTPUT_TOKENS),
        temperature=get_float_config_value("LLM_TEMPERATURE", 0.2),
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
        "llm_timeout_seconds": get_llm_request_timeout_seconds(),
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
    source_stopped = False

    for line in lines:
        if re.match(r"^【(?:来源\s*\d+/\d+|用户补充或编辑的 JD 文本)", line):
            marker = line.strip("【】 ")
            inside_job_block = False
            source_stopped = False
            kept.append(f"【{marker}】")
            continue

        compact = re.sub(r"^[^\w\u4e00-\u9fa5]+", "", line).strip()
        if not compact or compact in seen:
            continue

        if JD_SECTION_PATTERN.search(compact):
            inside_job_block = True
            source_stopped = False
        elif inside_job_block and JD_STOP_SECTION_PATTERN.search(compact) and len(kept) >= 3:
            source_stopped = True
            inside_job_block = False
            continue

        if source_stopped:
            continue

        if not is_job_candidate_line(compact, inside_job_block):
            continue

        seen.add(compact)
        kept.append(compact)

        if sum(len(item) for item in kept) >= MAX_JOB_OCR_CANDIDATE_CHARS:
            break

    return "\n".join(kept)


def build_advice_input(resume_text: str, job_text: str, analysis: dict[str, Any]) -> str:
    benchmark_context = analysis.get("benchmark_context")
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
            "不要输出最终总分。请分别给出语义匹配分、经历匹配分和简历质量分，最终公式由后端执行。",
            "请对 JD 要求进行规范化，并给出重要程度 must_have / important / nice_to_have 与 1-5 权重。",
            "请对简历证据给出 0-100 evidence_score，对缺口给出 0-100 gap_score。",
            "岗位可以来自任何学科和行业，不要套用 AI 产品岗位模板。",
            "请识别简历中明确出现的证书和奖项；无法核验含金量时必须标记 unverified 且不得加分。",
            "若 JD 提供公司名称，请模拟该公司该岗位的专业 HR 初筛视角；未提供公司名称时只依据 JD。",
            "只有 benchmark_context 非空时才可展示匿名录用背景；否则 benchmark_comparison 必须使用 jd_only 且背景列表为空。",
            "请区分简历应保留的能力证据与通常由招聘网站表单单独收集的到岗安排等信息。",
            "【固定分析口径】",
            json.dumps(LLM_ANALYSIS_CONTRACT, ensure_ascii=False, indent=2),
            "【岗位 JD】",
            job_text,
            "【简历文本】",
            resume_text,
            "【规则匹配结果】",
            json.dumps(compact_analysis, ensure_ascii=False, indent=2),
            "【有来源的匿名录用背景基准】",
            json.dumps(benchmark_context, ensure_ascii=False, indent=2)
            if benchmark_context
            else "未提供可靠录用样本，只能依据当前 JD 分析。",
        ]
    )


def build_chat_prompt(resume_text: str, job_text: str, analysis: dict[str, Any]) -> str:
    return "\n\n".join(
        [
            build_advice_input(resume_text, job_text, analysis),
            "请只返回 JSON 对象，不要使用 Markdown，不要包裹 ```json 代码块。",
            (
                "为了降低延迟，只返回这些顶层字段：summary、role_title、jd_summary、"
                "core_responsibilities、requirements、technical_questions、score_assessment、"
                "evidence_review、top_actions、credential_review、company_name、company_scale、"
                "hiring_context_summary、screening_decision、first_screen_strengths、"
                "first_screen_concerns、likely_interview_questions。"
            ),
            (
                "字段名称和枚举值严格遵守系统指令。输出要精炼：职责 2-4 项、要求 3-6 项、"
                "证据 3-5 项、行动 3-4 项。"
            ),
            (
                "嵌套字段：requirements[{title,category,importance,weight,evidence_expected}]; "
                "technical_questions[{question,skill_area,expected_evidence}]; "
                "score_assessment={semantic_match_score,experience_match_score,resume_quality_score,"
                "semantic_reason,experience_reason,quality_reason}; "
                "evidence_review[{title,importance,level,evidence_score,confidence,resume_evidence,gap}]; "
                "top_actions[{priority,action,target_section,example}]; "
                "credential_review[{name,credential_type,relevance_score,credibility,score_bonus,rationale}]。"
            ),
        ]
    )


def build_job_normalization_input(raw_text: str) -> str:
    candidate_text = build_job_ocr_candidate(raw_text)
    return "\n\n".join(
        [
            "请从以下 OCR 或网页复制文本中提取真正的岗位 JD。",
            "输入可能包含多个【来源 n/N】。逐个来源检查并合并，任何一个来源都不能被默认忽略。",
            "规则候选文本只是辅助线索，可能遗漏内容；原始文本才是完整依据。",
            "必须同时考虑两类核心内容：岗位职责/工作内容，以及岗位要求/任职要求/任职资格。",
            "还要保留加分项/优先项、技能工具、学历专业、经验年限、项目要求和 JD 中出现的技术问题。",
            "如果文本里出现通用软性要求，如沟通、团队协作、责任心、抗压能力、学习能力，只能作为低优先级要求保留，不要当成硬技能。",
            "删除网页噪音、按钮、导航、福利、公司介绍、推荐职位、广告、地址和投递入口。",
            "修复 OCR 空格、断行和重复内容。cleaned_job_text 必须使用岗位名称、岗位职责、岗位要求、加分项、技术问题五类小标题；每个条目单独一行并以“- ”开头。",
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

    client_options = {
        "api_key": config.api_key,
        "timeout": get_llm_request_timeout_seconds(),
        "max_retries": 0,
    }
    if config.base_url:
        client_options["base_url"] = config.base_url
    return OpenAI(**client_options)


def get_chat_completion_options(config: LLMConfig) -> dict[str, Any]:
    provider = config.provider.strip().lower()
    base_url = (config.base_url or "").lower()
    if provider == "deepseek" or "deepseek.com" in base_url:
        return {
            "extra_body": {
                "thinking": {
                    "type": "disabled",
                }
            }
        }
    return {}


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
        advice = AdvicePayload.model_validate(raw_advice).model_dump()
    except ValidationError as exc:
        raise LLMResponseError(f"Model returned invalid advice JSON: {exc}") from exc

    remaining_credential_bonus = 5
    for item in advice["credential_review"]:
        if item["credibility"] == "unverified" or item["relevance_score"] < 60:
            item["score_bonus"] = 0
            continue
        item["score_bonus"] = min(item["score_bonus"], remaining_credential_bonus)
        remaining_credential_bonus -= item["score_bonus"]

    return advice


def expand_fast_advice(
    raw_advice: dict[str, Any],
    analysis: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    analysis = analysis or {}
    raw = dict(raw_advice)

    normalized_job = raw.get("normalized_job")
    if isinstance(normalized_job, Mapping):
        raw.setdefault("role_title", normalized_job.get("role_title"))
        raw.setdefault("jd_summary", normalized_job.get("jd_summary"))
        raw.setdefault("core_responsibilities", normalized_job.get("core_responsibilities"))
        raw.setdefault("requirements", normalized_job.get("requirements"))
        raw.setdefault("technical_questions", normalized_job.get("technical_questions"))
    company_context = raw.get("company_role_context")
    if isinstance(company_context, Mapping):
        raw.setdefault("company_name", company_context.get("company_name"))
        raw.setdefault("company_scale", company_context.get("company_scale"))
        raw.setdefault("hiring_context_summary", company_context.get("hiring_context_summary"))
    hr_perspective = raw.get("hr_perspective")
    if isinstance(hr_perspective, Mapping):
        raw.setdefault("screening_decision", hr_perspective.get("screening_decision"))
        raw.setdefault("first_screen_strengths", hr_perspective.get("first_screen_strengths"))
        raw.setdefault("first_screen_concerns", hr_perspective.get("first_screen_concerns"))
        raw.setdefault("likely_interview_questions", hr_perspective.get("likely_interview_questions"))

    def validated_items(model: Any, items: Any, limit: int) -> list[dict[str, Any]]:
        validated: list[dict[str, Any]] = []
        if not isinstance(items, list):
            return validated
        for item in items:
            try:
                validated.append(model.model_validate(item).model_dump())
            except (ValidationError, TypeError):
                continue
            if len(validated) >= limit:
                break
        return validated

    requirements = validated_items(FastRequirementItem, raw.get("requirements"), 6)
    for requirement in requirements:
        if is_application_only_requirement(
            requirement.get("title"),
            requirement.get("category"),
        ):
            requirement.update(
                {
                    "category": "网申/安排信息",
                    "importance": "nice_to_have",
                    "weight": 1,
                    "evidence_expected": "在网申表单或与招聘方沟通时确认，不要求写入简历正文。",
                }
            )
    fallback_keywords = [
        *(analysis.get("priority_gaps") or []),
        *(analysis.get("matched_keywords") or []),
    ]
    seen_requirements = {item["title"].strip().lower() for item in requirements}
    for keyword in fallback_keywords:
        if not isinstance(keyword, Mapping):
            continue
        title = str(keyword.get("name") or "").strip()
        if not title or title.lower() in seen_requirements:
            continue
        weight = max(1, min(5, int(keyword.get("weight") or 3)))
        requirements.append(
            {
                "title": title,
                "category": str(keyword.get("category") or "专业能力"),
                "importance": "must_have" if weight >= 5 else "important" if weight >= 3 else "nice_to_have",
                "weight": weight,
                "evidence_expected": str(keyword.get("suggestion") or f"与 {title} 相关的真实经历和成果"),
            }
        )
        seen_requirements.add(title.lower())
        if len(requirements) >= 6:
            break
    for title in ("岗位核心职责", "专业方法与工具", "成果证据质量"):
        if len(requirements) >= 3:
            break
        requirements.append(
            {
                "title": title,
                "category": "岗位通用要求",
                "importance": "important",
                "weight": 3,
                "evidence_expected": f"能够证明{title}的真实项目、实习或研究经历",
            }
        )

    evidence_items = [
        item
        for item in validated_items(FastEvidenceItem, raw.get("evidence_review"), 5)
        if not is_application_only_requirement(item.get("title"))
    ]
    evidence_titles = {item["title"].strip().lower() for item in evidence_items}
    matched_titles = {
        str(item.get("name") or "").strip().lower()
        for item in analysis.get("matched_keywords") or []
        if isinstance(item, Mapping)
    }
    for requirement in requirements:
        title = requirement["title"]
        if title.lower() in evidence_titles:
            continue
        if is_application_only_requirement(title, requirement.get("category")):
            continue
        matched = any(requirement_title_matches_keyword(title, keyword) for keyword in matched_titles)
        evidence_items.append(
            {
                "title": title,
                "importance": requirement["importance"],
                "level": "medium" if matched else "missing",
                "evidence_score": 65 if matched else 15,
                "confidence": 60,
                "resume_evidence": "规则层识别到相关关键词" if matched else "简历中未识别到直接证据",
                "gap": "需要补充真实任务、方法和成果证据",
            }
        )
        if len(evidence_items) >= 5:
            break

    actions = [
        item
        for item in validated_items(TopActionItem, raw.get("top_actions"), 4)
        if not is_application_only_requirement(
            item.get("action"),
            item.get("target_section"),
        )
    ]
    for requirement in requirements:
        if len(actions) >= 3:
            break
        if is_application_only_requirement(requirement.get("title"), requirement.get("category")):
            continue
        actions.append(
            {
                "priority": "high" if requirement["importance"] == "must_have" else "medium",
                "action": f"补充 {requirement['title']} 的真实证据",
                "target_section": "项目或实习经历",
                "example": f"写明你如何使用 {requirement['title']} 完成任务，并补充可核验结果。",
            }
        )

    try:
        assessment = ScoreAssessment.model_validate(raw.get("score_assessment")).model_dump()
    except (ValidationError, TypeError):
        keyword_score = max(0, min(100, int(analysis.get("score") or 0)))
        assessment = {
            "semantic_match_score": keyword_score,
            "experience_match_score": max(0, keyword_score - 10),
            "resume_quality_score": 60,
            "semantic_reason": "模型未返回完整分项，采用关键词证据的保守回退值。",
            "experience_reason": "模型未返回完整经历分，采用保守回退值。",
            "quality_reason": "模型未返回完整质量分，使用中性基准值。",
        }

    responsibilities = [
        str(item).strip()
        for item in raw.get("core_responsibilities") or []
        if str(item).strip()
    ][:4]
    for fallback in ("完成当前 JD 所列的核心任务", "交付与岗位目标相关的可验证成果"):
        if len(responsibilities) >= 2:
            break
        responsibilities.append(fallback)

    evidence_review = [
        {
            **item,
            "why_it_matters": (
                "这是岗位核心准入证据。"
                if item["importance"] == "must_have"
                else "这是影响初筛判断的重要岗位证据。"
                if item["importance"] == "important"
                else "这是能提高竞争力的补充证据。"
            ),
        }
        for item in evidence_items
    ]
    gap_candidates = sorted(
        evidence_review,
        key=lambda item: (
            item["level"] not in {"missing", "weak"},
            item["evidence_score"],
        ),
    )[:4]
    quantified_gaps = []
    for index, item in enumerate(gap_candidates):
        action = actions[min(index, len(actions) - 1)]
        quantified_gaps.append(
            {
                "requirement": item["title"],
                "importance": item["importance"],
                "gap_score": 100 - item["evidence_score"],
                "current_evidence": item["resume_evidence"],
                "missing_evidence": item["gap"],
                "impact_on_match": (
                    "high"
                    if item["importance"] == "must_have"
                    else "medium"
                    if item["importance"] == "important"
                    else "low"
                ),
                "recommended_fix": action["action"],
            }
        )

    credentials = validated_items(CredentialReviewItem, raw.get("credential_review"), 5)
    company_scale = str(raw.get("company_scale") or "unknown")
    if company_scale not in {"large", "medium", "small", "startup", "unknown"}:
        company_scale = "unknown"
    screening_decision = str(raw.get("screening_decision") or "borderline")
    if screening_decision not in {"strong_pass", "borderline", "weak_pass", "reject"}:
        screening_decision = "borderline"
    company_name = str(raw.get("company_name") or "").strip()
    role_title = str(raw.get("role_title") or "").strip() or "目标岗位"

    full_advice = {
        "summary": str(raw.get("summary") or "已根据当前简历与 JD 完成综合分析。"),
        "normalized_job": {
            "role_title": role_title,
            "jd_summary": str(raw.get("jd_summary") or "依据用户提供的当前 JD 进行分析。"),
            "core_responsibilities": responsibilities,
            "requirements": [
                {
                    **item,
                    "reason": f"该要求在当前 JD 中被归为 {item['importance']}。",
                }
                for item in requirements
            ],
            "technical_questions": validated_items(
                TechnicalQuestionItem,
                raw.get("technical_questions"),
                3,
            ),
        },
        "score_assessment": assessment,
        "scoring_rubric": [
            {"dimension": "语义匹配", "weight": 5, "what_good_looks_like": assessment["semantic_reason"]},
            {"dimension": "经历匹配", "weight": 5, "what_good_looks_like": assessment["experience_reason"]},
            {"dimension": "简历质量", "weight": 3, "what_good_looks_like": assessment["quality_reason"]},
        ],
        "evidence_review": evidence_review,
        "quantified_gaps": quantified_gaps,
        "top_actions": actions,
        "rewrite_examples": [
            {
                "before": "原简历中对应经历的现有表述",
                "after": action["example"],
                "why_better": action["action"],
            }
            for action in actions[:2]
        ],
        "credential_review": credentials,
        "company_role_context": {
            "company_name": company_name,
            "company_scale": company_scale,
            "role_title": role_title,
            "context_source": "job_description" if company_name else "unknown",
            "hiring_context_summary": str(
                raw.get("hiring_context_summary")
                or ("按用户提供的公司和岗位模拟 HR 初筛。" if company_name else "未提供公司名称，仅依据 JD。")
            ),
            "historical_hiring_evidence": "用户材料未提供，无法核验",
            "confidence": 80 if company_name else 50,
        },
        "application_form_guidance": {
            "keep_in_resume": ["教育背景", "相关实习或项目", "技能与量化成果"],
            "usually_form_only": ["可到岗日期", "每周实习天数", "期望薪资", "工作地点偏好"],
            "avoid_duplicate_items": ["身份证号", "网申来源", "是否接受调剂"],
        },
        "hr_perspective": {
            "screening_decision": screening_decision,
            "first_screen_strengths": [
                str(item) for item in raw.get("first_screen_strengths") or []
            ][:4],
            "first_screen_concerns": [
                str(item) for item in raw.get("first_screen_concerns") or []
            ][:4],
            "likely_interview_questions": [
                str(item) for item in raw.get("likely_interview_questions") or []
            ][:4],
        },
        "benchmark_comparison": {
            "benchmark_available": False,
            "basis": "jd_only",
            "source_notice": "未提供可核验、匿名化的录用背景数据，本次仅依据当前 JD 分析。",
            "typical_education_background": [],
            "common_awards_or_credentials": [],
            "common_research_directions": [],
            "common_internship_experience": [],
            "candidate_comparison": "没有可靠录用样本，不能把模型常识当作真实录用画像。",
        },
    }
    return validate_advice(full_advice)


def tidy_cleaned_job_text(raw_text: str) -> str:
    text = raw_text.replace("\r", "\n").strip()
    text = re.sub(r"(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])", "", text)
    text = re.sub(
        r"(?<!\n)(岗位名称|岗位职责|岗位要求|任职要求|任职资格|加分项|技术问题)\s*[：:]",
        r"\n\1：",
        text,
    )

    section_aliases = {
        "岗位名称": "岗位名称",
        "岗位职责": "岗位职责",
        "岗位要求": "岗位要求",
        "任职要求": "岗位要求",
        "任职资格": "岗位要求",
        "加分项": "加分项",
        "技术问题": "技术问题",
    }
    section_pattern = re.compile(
        r"^(岗位名称|岗位职责|岗位要求|任职要求|任职资格|加分项|技术问题)\s*[：:]?\s*(.*)$"
    )
    output: list[str] = []
    seen_items: set[tuple[str, str]] = set()
    current_section = ""

    for raw_line in text.splitlines():
        line = re.sub(r"^#{1,6}\s*", "", raw_line).strip()
        if not line:
            continue

        section_match = section_pattern.match(line)
        if section_match:
            current_section = section_aliases[section_match.group(1)]
            content = section_match.group(2).strip()
            if output:
                output.append("")
            if current_section == "岗位名称":
                output.append(f"岗位名称：{content}" if content else "岗位名称：")
            else:
                output.append(f"{current_section}：")
                if content:
                    item = re.sub(r"^([-*•·]|\d+[.、)])\s*", "", content).strip()
                    if item:
                        seen_items.add((current_section, item))
                        output.append(f"- {item}")
            continue

        item = re.sub(r"^([-*•·]|\d+[.、)])\s*", "", line).strip()
        if not item:
            continue
        if current_section and current_section != "岗位名称":
            item_key = (current_section, item)
            if item_key in seen_items:
                continue
            seen_items.add(item_key)
            output.append(f"- {item}")
        else:
            output.append(item)

    return re.sub(r"\n{3,}", "\n\n", "\n".join(output)).strip()


def validate_job_normalization(raw_payload: dict[str, Any]) -> dict[str, Any]:
    try:
        normalized = JobNormalizationPayload.model_validate(raw_payload).model_dump()
    except ValidationError as exc:
        raise LLMResponseError(f"Model returned invalid JD normalization JSON: {exc}") from exc
    normalized["cleaned_job_text"] = tidy_cleaned_job_text(normalized["cleaned_job_text"])
    return normalized


def clamp_score(value: Any) -> int:
    try:
        return max(0, min(100, int(round(float(value)))))
    except (TypeError, ValueError):
        return 0


def normalize_requirement_match_text(value: Any) -> str:
    return re.sub(r"[\s/_\-（）()]+", "", str(value or "").strip().lower())


def requirement_title_matches_keyword(title: Any, keyword: Any) -> bool:
    normalized_title = normalize_requirement_match_text(title)
    normalized_keyword = normalize_requirement_match_text(keyword)
    if len(normalized_title) < 2 or len(normalized_keyword) < 2:
        return False
    return normalized_keyword in normalized_title or normalized_title in normalized_keyword


def is_application_only_requirement(title: Any, category: Any = "") -> bool:
    text = f"{title or ''} {category or ''}"
    return bool(APPLICATION_ONLY_REQUIREMENT_PATTERN.search(text))


def calculate_final_score(keyword_score: int | float | None, advice: Mapping[str, Any]) -> dict[str, Any]:
    keyword_match_score = clamp_score(keyword_score)
    assessment = advice.get("score_assessment")
    if not isinstance(assessment, Mapping):
        assessment = {}
    semantic_match_score = clamp_score(assessment.get("semantic_match_score"))
    experience_match_score = clamp_score(assessment.get("experience_match_score"))
    resume_quality_score = clamp_score(assessment.get("resume_quality_score"))

    credential_bonus = 0
    credential_items = advice.get("credential_review")
    if isinstance(credential_items, list):
        for item in credential_items:
            if not isinstance(item, Mapping):
                continue
            credibility = str(item.get("credibility") or "unverified")
            relevance_score = int(item.get("relevance_score") or 0)
            if credibility == "unverified" or relevance_score < 60:
                continue
            credential_bonus += max(0, min(5, int(item.get("score_bonus") or 0)))
    credential_bonus = min(5, credential_bonus)

    weighted_base = (
        keyword_match_score * 0.25
        + semantic_match_score * 0.30
        + experience_match_score * 0.30
        + resume_quality_score * 0.15
    )
    evidence_by_title: dict[str, Mapping[str, Any]] = {}
    for item in advice.get("evidence_review") or []:
        if isinstance(item, Mapping):
            evidence_by_title[str(item.get("title") or "").strip().lower()] = item

    missing_core_requirements: list[str] = []
    core_penalty = 0
    normalized_job = advice.get("normalized_job")
    requirements = normalized_job.get("requirements") if isinstance(normalized_job, Mapping) else []
    for requirement in requirements or []:
        if not isinstance(requirement, Mapping) or requirement.get("importance") != "must_have":
            continue
        title = str(requirement.get("title") or "").strip()
        if is_application_only_requirement(title, requirement.get("category")):
            continue
        evidence = evidence_by_title.get(title.lower(), {})
        evidence_score = clamp_score(evidence.get("evidence_score"))
        level = str(evidence.get("level") or "missing")
        if level == "missing" or evidence_score < 40:
            missing_core_requirements.append(title or "未命名核心要求")
            requirement_weight = max(1, min(5, int(requirement.get("weight") or 5)))
            core_penalty += requirement_weight * 2
    core_penalty = min(25, core_penalty)

    score_cap = 100
    cap_reasons: list[str] = []
    if len(missing_core_requirements) >= 2:
        score_cap = min(score_cap, 59)
        cap_reasons.append("缺少两项及以上核心要求")
    elif len(missing_core_requirements) == 1:
        score_cap = min(score_cap, 69)
        cap_reasons.append("缺少一项核心要求")
    if semantic_match_score < 30:
        score_cap = min(score_cap, 49)
        cap_reasons.append("语义匹配低于 30")
    if experience_match_score < 35:
        score_cap = min(score_cap, 64)
        cap_reasons.append("经历匹配低于 35")

    before_cap = max(0, min(100, int(round(weighted_base + credential_bonus - core_penalty))))
    final_score = min(before_cap, score_cap)

    return {
        "score": final_score,
        "keyword_match_score": keyword_match_score,
        "semantic_match_score": semantic_match_score,
        "experience_match_score": experience_match_score,
        "resume_quality_score": resume_quality_score,
        "weighted_base": round(weighted_base, 1),
        "credential_bonus": credential_bonus,
        "core_skill_penalty": core_penalty,
        "missing_core_requirements": missing_core_requirements,
        "score_before_cap": before_cap,
        "score_cap": score_cap,
        "cap_reasons": cap_reasons,
        "formula": (
            "关键词 25% + 语义 30% + 经历 30% + 简历质量 15% "
            "+ 加分项 - 核心技能惩罚，再应用分数上限"
        ),
        "steps": [
            {"step": 1, "title": "关键词匹配", "value": keyword_match_score},
            {"step": 2, "title": "语义匹配", "value": semantic_match_score},
            {"step": 3, "title": "经历匹配", "value": experience_match_score},
            {"step": 4, "title": "简历质量", "value": resume_quality_score},
            {"step": 5, "title": "加分项", "value": credential_bonus},
            {"step": 6, "title": "加权基础分", "value": round(weighted_base, 1)},
            {"step": 7, "title": "核心技能惩罚", "value": -core_penalty},
            {"step": 8, "title": "分数上限", "value": score_cap},
            {"step": 9, "title": "最终分数", "value": final_score},
        ],
    }


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
        max_tokens=min(config.max_output_tokens, 1400),
        **get_chat_completion_options(config),
    )

    content = response.choices[0].message.content
    if not isinstance(content, str) or not content.strip():
        raise LLMResponseError("Model returned empty advice content.")

    try:
        return expand_fast_advice(parse_json_object(content), analysis)
    except LLMResponseError as first_error:
        if os.getenv("LLM_RETRY_ON_SCHEMA_ERROR", "false").lower() not in {"1", "true", "yes"}:
            raise first_error
        retry_response = client.chat.completions.create(
            model=config.model,
            messages=[
                {"role": "system", "content": SYSTEM_INSTRUCTIONS},
                {
                    "role": "user",
                    "content": "\n\n".join(
                        [
                            "上一次快速分析输出没有通过 JSON 校验，请按快速字段重新生成。",
                            f"校验错误：{first_error}",
                            "必须包含 build_chat_prompt 列出的全部快速字段，不要返回完整建议层字段。",
                            "每个字符串尽量控制在 80 个中文字符以内，避免输出被截断。",
                            build_chat_prompt(resume_text, job_text, analysis),
                        ]
                    ),
                },
            ],
            response_format={"type": "json_object"},
            temperature=0,
            max_tokens=min(config.max_output_tokens, 1400),
            **get_chat_completion_options(config),
        )

        retry_content = retry_response.choices[0].message.content
        if not isinstance(retry_content, str) or not retry_content.strip():
            raise first_error
        return expand_fast_advice(parse_json_object(retry_content), analysis)


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
        max_output_tokens=min(config.max_output_tokens, 1800),
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
        max_tokens=min(config.max_output_tokens, 1800),
        **get_chat_completion_options(config),
    )

    content = response.choices[0].message.content
    if not isinstance(content, str) or not content.strip():
        raise LLMResponseError("Model returned empty JD normalization content.")

    return validate_job_normalization(parse_json_object(content))


def generate_advice(
    resume_text: str,
    job_text: str,
    analysis: dict[str, Any],
) -> dict[str, Any]:
    config = get_llm_config()
    if not config.api_key:
        raise LLMConfigurationError("LLM_API_KEY or OPENAI_API_KEY is not configured.")

    client = create_openai_client(config)

    if config.api_style == "chat_completions":
        advice = generate_with_chat_completions(client, config, resume_text, job_text, analysis)
    else:
        advice = generate_with_responses_api(client, config, resume_text, job_text, analysis)

    if not analysis.get("benchmark_context"):
        advice["benchmark_comparison"] = {
            "benchmark_available": False,
            "basis": "jd_only",
            "source_notice": "未提供可核验、匿名化的录用背景数据，本次仅依据当前 JD 分析。",
            "typical_education_background": [],
            "common_awards_or_credentials": [],
            "common_research_directions": [],
            "common_internship_experience": [],
            "candidate_comparison": "没有可靠录用样本，不能把模型常识当作该公司的真实录用画像。",
        }
    return advice


def normalize_job_text(
    raw_text: str,
) -> dict[str, Any]:
    config = get_llm_config()
    if not config.api_key:
        raise LLMConfigurationError("LLM_API_KEY or OPENAI_API_KEY is not configured.")

    client = create_openai_client(config)

    if config.api_style == "chat_completions":
        return normalize_job_with_chat_completions(client, config, raw_text)

    return normalize_job_with_responses_api(client, config, raw_text)
