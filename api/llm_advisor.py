from __future__ import annotations

import json
import os
from typing import Any


DEFAULT_LLM_MODEL = "gpt-5.5"


class LLMConfigurationError(RuntimeError):
    """Raised when the optional LLM layer is not configured."""


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


def llm_is_configured() -> bool:
    return bool(os.getenv("OPENAI_API_KEY"))


def get_llm_model() -> str:
    return os.getenv("OPENAI_MODEL", DEFAULT_LLM_MODEL)


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


def generate_advice(resume_text: str, job_text: str, analysis: dict[str, Any]) -> dict[str, Any]:
    if not llm_is_configured():
        raise LLMConfigurationError("OPENAI_API_KEY is not configured.")

    try:
        from openai import OpenAI
    except ImportError as exc:
        raise LLMConfigurationError("The openai package is not installed.") from exc

    client = OpenAI()
    response = client.responses.create(
        model=get_llm_model(),
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
        max_output_tokens=2200,
    )

    return json.loads(response.output_text)
