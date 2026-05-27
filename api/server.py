from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from scripts.analyze_match import analyze, load_keywords


DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "https://unknownhalfcold.github.io",
)


class AnalyzeRequest(BaseModel):
    resume: str = Field(..., min_length=1)
    job: str = Field(..., min_length=1)


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
