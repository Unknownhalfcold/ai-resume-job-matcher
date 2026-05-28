from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from api.llm_advisor import (
    LLMConfigurationError,
    generate_advice,
    get_llm_config,
    get_llm_metadata,
)
from scripts.analyze_match import analyze, load_keywords


DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "https://unknownhalfcold.github.io",
)


class AnalyzeRequest(BaseModel):
    resume: str = Field(..., min_length=1)
    job: str = Field(..., min_length=1)


class LLMRequestConfig(BaseModel):
    provider: str | None = Field(default=None, max_length=64)
    api_key: str | None = Field(default=None, max_length=4096)
    model: str | None = Field(default=None, max_length=128)
    api_style: str | None = Field(default=None, max_length=32)
    base_url: str | None = Field(default=None, max_length=512)
    max_output_tokens: int | None = Field(default=None, ge=300, le=6000)
    temperature: float | None = Field(default=None, ge=0, le=1)


class AISuggestionsRequest(AnalyzeRequest):
    analysis: dict[str, Any] | None = None
    llm_config: LLMRequestConfig | None = None


class UTF8JSONResponse(JSONResponse):
    media_type = "application/json; charset=utf-8"


def get_allowed_origins() -> list[str]:
    raw_value = os.getenv("ALLOWED_ORIGINS")
    if not raw_value:
        return list(DEFAULT_ALLOWED_ORIGINS)
    return [origin.strip() for origin in raw_value.split(",") if origin.strip()]


app = FastAPI(
    title="AI Resume Job Matcher API",
    version="0.1.0",
    description="Rule-based backend API for resume-job matching analysis.",
    default_response_class=UTF8JSONResponse,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

KEYWORDS = load_keywords()


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "engine": "rule_based",
        "keyword_count": len(KEYWORDS),
        **get_llm_metadata(),
    }


@app.get("/api/keywords")
def keywords() -> dict[str, Any]:
    return {
        "keywords": [
            {
                "name": keyword.name,
                "category": keyword.category,
                "weight": keyword.weight,
                "aliases": list(keyword.aliases),
                "suggestion": keyword.suggestion,
            }
            for keyword in KEYWORDS
        ]
    }


@app.post("/api/analyze")
def analyze_resume_job(payload: AnalyzeRequest) -> dict[str, Any]:
    result = analyze(payload.resume, payload.job, keywords=KEYWORDS)
    return {
        "engine": "rule_based",
        **result,
    }


@app.post("/api/ai-suggestions")
def ai_suggestions(payload: AISuggestionsRequest) -> dict[str, Any]:
    analysis = payload.analysis or analyze(payload.resume, payload.job, keywords=KEYWORDS)
    config_override = payload.llm_config.model_dump(exclude_none=True) if payload.llm_config else None
    llm_config = get_llm_config(config_override)

    try:
        advice = generate_advice(payload.resume, payload.job, analysis, config_override=config_override)
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM request failed: {exc}") from exc

    return {
        "engine": "llm_advice",
        "provider": llm_config.provider,
        "model": llm_config.model,
        "api_style": llm_config.api_style,
        "rule_score": analysis.get("score"),
        "rule_score_source": "keyword_weight_formula",
        "advice": advice,
    }
