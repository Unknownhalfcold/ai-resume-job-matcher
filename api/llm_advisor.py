from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any, Literal, Mapping

from pydantic import BaseModel, ConfigDict, Field, ValidationError


DEFAULT_LLM_MODEL = "gpt-5.5"
DEFAULT_MAX_OUTPUT_TOKENS = 2200

APIStyle = Literal["responses", "chat_completions"]


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


class JobFocusItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    reason: str
    related_keywords: list[str]


class EvidenceReviewItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    level: Literal["strong", "medium", "weak", "missing"]
    resume_evidence: str
    gap: str
    why_it_matters: str


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
    job_focus: list[JobFocusItem] = Field(min_length=3, max_length=5)
    evidence_review: list[EvidenceReviewItem] = Field(min_length=3, max_length=6)
    top_actions: list[TopActionItem] = Field(min_length=3, max_length=5)
    rewrite_examples: list[RewriteExampleItem] = Field(min_length=1, max_length=3)


ADVICE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "summary",
        "job_focus",
        "evidence_review",
        "top_actions",
        "rewrite_examples",
    ],
    "properties": {
        "summary": {
            "type": "string",
            "description": "One concise Chinese summary of the resume-job fit.",
        },
        "job_focus": {
            "type": "array",
            "minItems": 3,
            "maxItems": 5,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["title", "reason", "related_keywords"],
                "properties": {
                    "title": {"type": "string"},
                    "reason": {"type": "string"},
                    "related_keywords": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
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
                    "level",
                    "resume_evidence",
                    "gap",
                    "why_it_matters",
                ],
                "properties": {
                    "title": {"type": "string"},
                    "level": {
                        "type": "string",
                        "enum": ["strong", "medium", "weak", "missing"],
                    },
                    "resume_evidence": {"type": "string"},
                    "gap": {"type": "string"},
                    "why_it_matters": {"type": "string"},
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


SYSTEM_INSTRUCTIONS = """
你是一个面向中文求职者的 AI 简历优化顾问。

你的任务：
1. 基于输入的岗位 JD、简历文本和规则匹配结果，生成个性化建议。
2. 不要修改、重算或质疑 rule_score，最终匹配分数由规则层负责。
3. 不要编造用户没有提供的经历、公司、数字或结果。
4. 如果简历缺少证据，请明确指出“需要补充”，不要替用户虚构。
5. 输出必须是符合 schema 的中文 JSON。

评分稳定性原则：
- 规则匹配层负责稳定分数。
- 你只负责解释岗位重点、证据强弱、修改优先级和 STAR 风格改写示例。
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
            "请基于以下信息生成 AI 建议层结果。",
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


def create_openai_client(config: LLMConfig) -> Any:
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise LLMConfigurationError("The openai package is not installed.") from exc

    if config.base_url:
        return OpenAI(api_key=config.api_key, base_url=config.base_url)
    return OpenAI(api_key=config.api_key)


def parse_json_object(raw_text: str) -> dict[str, Any]:
    text = raw_text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match:
            raise LLMResponseError("Model did not return a JSON object.")
        return json.loads(match.group(0))


def validate_advice(raw_advice: dict[str, Any]) -> dict[str, Any]:
    try:
        return AdvicePayload.model_validate(raw_advice).model_dump()
    except ValidationError as exc:
        raise LLMResponseError(f"Model returned invalid advice JSON: {exc}") from exc


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

    return validate_advice(parse_json_object(content))


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
