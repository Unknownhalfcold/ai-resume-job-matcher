from __future__ import annotations

import os
import json
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.auth_service import (
    authenticate_user,
    create_access_token,
    create_user,
    get_auth_client_config,
    get_auth_metadata,
    get_bearer_token,
    require_current_user,
    revoke_access_token,
    supabase_is_configured,
)
from api.database import AnalysisHistory, User, get_database_metadata, get_database_session, initialize_database
from api.document_parser import DocumentParseError, extract_document_text, extract_resume_text
from api.llm_advisor import (
    LLMConfigurationError,
    calculate_final_score,
    discover_job_capabilities,
    generate_advice,
    get_llm_analysis_contract,
    get_llm_config,
    get_llm_metadata,
    get_llm_request_timeout_seconds,
    normalize_job_text,
    resolve_thinking_mode,
)
from api.request_controls import (
    complete_usage_event,
    enforce_rate_limit,
    get_request_control_metadata,
    llm_request_slot,
)
from scripts.analyze_match import analyze, contains_any, extract_job_keywords, load_keywords


DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "https://unknownhalfcold.github.io",
    "https://jobmatcher.top",
    "https://www.jobmatcher.top",
    "https://jobmatcher.win",
    "https://www.jobmatcher.win",
)


MAX_RESUME_CHARS = 8000
MAX_JOB_CHARS = 8000
MAX_TOTAL_INPUT_CHARS = 16000


class StrictRequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AnalyzeRequest(StrictRequestModel):
    resume: str = Field(..., min_length=1, max_length=MAX_RESUME_CHARS)
    job: str = Field(..., min_length=1, max_length=MAX_JOB_CHARS)

    @model_validator(mode="after")
    def validate_total_input_length(self) -> "AnalyzeRequest":
        if len(self.resume) + len(self.job) > MAX_TOTAL_INPUT_CHARS:
            raise ValueError(f"Total input must not exceed {MAX_TOTAL_INPUT_CHARS} characters.")
        return self


class CapabilityAssessmentRequest(StrictRequestModel):
    title: str = Field(..., min_length=1, max_length=80)
    category: str = Field(..., pattern=r"^(tool|professional|domain|language|soft)$")
    importance: str = Field(..., pattern=r"^(must_have|important|nice_to_have)$")
    weight: int = Field(..., ge=1, le=5)
    proficiency: str = Field(..., pattern=r"^(unknown|none|basic|intermediate|advanced|expert)$")
    evidence: str = Field(default="", max_length=500)


class AISuggestionsRequest(AnalyzeRequest):
    capability_assessments: list[CapabilityAssessmentRequest] = Field(default_factory=list, max_length=12)
    thinking: StrictBool | None = None

    @model_validator(mode="after")
    def validate_capability_evidence_length(self) -> "AISuggestionsRequest":
        evidence_length = sum(len(item.evidence) for item in self.capability_assessments)
        if evidence_length > 3000:
            raise ValueError("Capability evidence must not exceed 3000 characters in total.")
        return self


class CapabilityDiscoveryRequest(AnalyzeRequest):
    pass


class JobNormalizationRequest(StrictRequestModel):
    raw_text: str = Field(..., min_length=1, max_length=MAX_JOB_CHARS)


class AuthRequest(StrictRequestModel):
    email: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=8, max_length=128)


class HistoryCreateRequest(StrictRequestModel):
    match_score: int = Field(..., ge=0, le=100)
    strengths: list[str] = Field(default_factory=list, max_length=30)
    weaknesses: list[str] = Field(default_factory=list, max_length=30)
    suggestions: list[str] = Field(default_factory=list, max_length=30)


class UTF8JSONResponse(JSONResponse):
    media_type = "application/json; charset=utf-8"


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    yield


def get_allowed_origins() -> list[str]:
    origins = list(DEFAULT_ALLOWED_ORIGINS)
    raw_value = os.getenv("ALLOWED_ORIGINS")
    if raw_value:
        origins.extend(origin.strip() for origin in raw_value.split(",") if origin.strip())
    return list(dict.fromkeys(origins))


app = FastAPI(
    title="AI Resume Job Matcher API",
    version="0.1.0",
    description="Rule-based backend API for resume-job matching analysis.",
    default_response_class=UTF8JSONResponse,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> UTF8JSONResponse:
    del request
    safe_errors = [
        {
            "type": error.get("type"),
            "loc": error.get("loc"),
            "msg": error.get("msg"),
        }
        for error in exc.errors()
    ]
    return UTF8JSONResponse(status_code=422, content={"detail": safe_errors})

KEYWORDS = load_keywords()
MAX_UPLOAD_BYTES = 8 * 1024 * 1024
BENCHMARKS_PATH = Path(__file__).resolve().parent.parent / "data" / "hiring_benchmarks.json"


def load_hiring_benchmarks() -> dict[str, Any]:
    try:
        return json.loads(BENCHMARKS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"companies": {}}


HIRING_BENCHMARKS = load_hiring_benchmarks()
LLM_EXECUTOR = ThreadPoolExecutor(max_workers=10, thread_name_prefix="resume-llm")


@lru_cache(maxsize=1)
def get_build_metadata() -> dict[str, str]:
    commit = (
        os.getenv("APP_VERSION")
        or os.getenv("GIT_COMMIT")
        or os.getenv("RENDER_GIT_COMMIT")
        or ""
    ).strip()
    if not commit:
        try:
            commit = subprocess.check_output(
                ["git", "rev-parse", "--short", "HEAD"],
                cwd=Path(__file__).resolve().parent.parent,
                stderr=subprocess.DEVNULL,
                text=True,
                timeout=2,
            ).strip()
        except Exception:
            commit = "unknown"

    return {
        "app_version": commit,
        "deployed_at": os.getenv("DEPLOYED_AT", "unknown"),
    }


def run_llm_task(function: Any, *args: Any) -> Any:
    future = LLM_EXECUTOR.submit(function, *args)
    try:
        return future.result(timeout=get_llm_request_timeout_seconds())
    except FutureTimeoutError as exc:
        future.cancel()
        raise TimeoutError("LLM request exceeded the server deadline.") from exc


def find_hiring_benchmark(job_text: str) -> dict[str, Any] | None:
    normalized_job = job_text.lower()
    companies = HIRING_BENCHMARKS.get("companies", {})
    if not isinstance(companies, dict):
        return None
    for company_name, benchmark in companies.items():
        if not isinstance(benchmark, dict):
            continue
        aliases = benchmark.get("aliases", [])
        company_terms = [str(company_name), *(str(alias) for alias in aliases if alias)]
        if any(term.lower() in normalized_job for term in company_terms):
            return {
                "company_name": company_name,
                **benchmark,
            }
    return None


def capability_category_for_keyword(category: str, name: str) -> str:
    value = f"{category} {name}".lower()
    if any(term in value for term in ("python", "sql", "excel", "java", "c/c++", "前端", "后端", "软件", "技术", "工具")):
        return "tool"
    if any(term in value for term in ("协作", "沟通", "通用", "组织", "管理")):
        return "soft"
    if any(term in value for term in ("行业", "金融", "法律", "教育", "自然", "生命", "工程", "医学", "公共")):
        return "domain"
    if any(term in value for term in ("英语", "语言")):
        return "language"
    return "professional"


def capability_importance_for_weight(weight: int) -> str:
    if weight >= 5:
        return "must_have"
    if weight >= 3:
        return "important"
    return "nice_to_have"


def build_rule_capability_fallback(resume_text: str, job_text: str, note: str = "") -> dict[str, Any]:
    job_keywords = sorted(
        extract_job_keywords(job_text, KEYWORDS),
        key=lambda keyword: (-keyword.weight, keyword.name),
    )
    capabilities: list[dict[str, Any]] = []

    for keyword in job_keywords[:10]:
        matched = contains_any(resume_text, keyword.aliases)
        category = capability_category_for_keyword(keyword.category, keyword.name)
        importance = capability_importance_for_weight(keyword.weight)
        if category == "soft" and importance == "must_have":
            importance = "nice_to_have"
            weight = min(keyword.weight, 2)
        else:
            weight = keyword.weight
        capabilities.append(
            {
                "title": keyword.name,
                "category": category,
                "source": "explicit",
                "importance": importance,
                "weight": max(1, min(5, weight)),
                "jd_evidence": f"JD 中出现与「{keyword.name}」相关的关键词。",
                "resume_evidence": f"简历中已出现「{keyword.name}」相关表达。" if matched else "简历中暂未识别到直接证据。",
                "inferred_proficiency": "intermediate" if matched else "unknown",
                "confidence": 65 if matched else 45,
                "assessment_prompt": f"补充你在「{keyword.name}」上的真实任务、工具、产出或量化结果。",
            }
        )

    generic_capabilities = [
        {
            "title": "岗位核心任务",
            "category": "professional",
            "source": "inferred",
            "importance": "important",
            "weight": 4,
            "jd_evidence": "根据 JD 内容提炼出的岗位核心任务。",
            "resume_evidence": "请补充与岗位职责直接相关的经历证据。",
            "inferred_proficiency": "unknown",
            "confidence": 40,
            "assessment_prompt": "补充你做过的相似任务、负责范围和最终结果。",
        },
        {
            "title": "专业方法与工具",
            "category": "tool",
            "source": "inferred",
            "importance": "important",
            "weight": 3,
            "jd_evidence": "JD 通常会隐含对方法、工具或流程的要求。",
            "resume_evidence": "请补充你实际使用过的方法、工具和熟练程度。",
            "inferred_proficiency": "unknown",
            "confidence": 35,
            "assessment_prompt": "补充工具名称、使用场景、产出物或结果指标。",
        },
        {
            "title": "成果证据质量",
            "category": "professional",
            "source": "inferred",
            "importance": "important",
            "weight": 3,
            "jd_evidence": "岗位匹配不仅看关键词，也看结果是否可验证。",
            "resume_evidence": "请补充数据、作品、交付物、论文、证书或业务影响。",
            "inferred_proficiency": "unknown",
            "confidence": 35,
            "assessment_prompt": "补充可验证成果，例如数字、链接、奖项、报告或项目交付。",
        },
    ]
    for item in generic_capabilities:
        if len(capabilities) >= 3:
            break
        capabilities.append(item)

    return {
        "role_title": "当前目标岗位",
        "capabilities": capabilities[:10],
        "note": note or "LLM 能力识别暂不可用，已使用规则层生成基础能力表。",
    }


def serialize_user(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "auth_id": user.supabase_user_id,
        "email": user.email,
        "created_at": user.created_at.isoformat(),
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
    }


def serialize_history_record(record: AnalysisHistory) -> dict[str, Any]:
    return {
        "id": record.id,
        "user_id": record.user_id,
        "match_score": record.match_score,
        "strengths": record.strengths or [],
        "weaknesses": record.weaknesses or [],
        "suggestions": record.suggestions or [],
        "created_at": record.created_at.isoformat(),
    }


def current_user_dependency(
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_database_session),
) -> User:
    return require_current_user(session, authorization)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "engine": "rule_based",
        "keyword_count": len(KEYWORDS),
        **get_build_metadata(),
        **get_database_metadata(),
        **get_llm_metadata(),
        **get_request_control_metadata(),
        **get_auth_metadata(),
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


@app.get("/api/auth/config")
def auth_config() -> dict[str, object]:
    return get_auth_client_config()


@app.post("/api/auth/register")
def register(payload: AuthRequest, session: Session = Depends(get_database_session)) -> dict[str, Any]:
    if supabase_is_configured():
        raise HTTPException(status_code=409, detail="Register through Supabase Auth.")
    try:
        user = create_user(session, payload.email, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    access_token = create_access_token(session, user)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": serialize_user(user),
    }


@app.post("/api/auth/login")
def login(payload: AuthRequest, session: Session = Depends(get_database_session)) -> dict[str, Any]:
    if supabase_is_configured():
        raise HTTPException(status_code=409, detail="Sign in through Supabase Auth.")
    user = authenticate_user(session, payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")

    access_token = create_access_token(session, user)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": serialize_user(user),
    }


@app.get("/api/auth/me")
def me(current_user: User = Depends(current_user_dependency)) -> dict[str, Any]:
    return {
        "user": serialize_user(current_user),
    }


@app.post("/api/auth/logout")
def logout(
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_database_session),
) -> dict[str, Any]:
    if authorization:
        token = get_bearer_token(authorization)
        revoke_access_token(session, token)
    return {"ok": True}


@app.post("/api/history")
def create_history_record(
    payload: HistoryCreateRequest,
    current_user: User = Depends(current_user_dependency),
    session: Session = Depends(get_database_session),
) -> dict[str, Any]:
    record = AnalysisHistory(
        user_id=current_user.id,
        resume_text="",
        job_description="",
        match_score=payload.match_score,
        strengths=payload.strengths,
        weaknesses=payload.weaknesses,
        suggestions=payload.suggestions,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return {
        "record": serialize_history_record(record),
    }


@app.get("/api/history")
def list_history_records(
    current_user: User = Depends(current_user_dependency),
    session: Session = Depends(get_database_session),
) -> dict[str, Any]:
    records = session.scalars(
        select(AnalysisHistory)
        .where(AnalysisHistory.user_id == current_user.id)
        .order_by(AnalysisHistory.created_at.desc(), AnalysisHistory.id.desc())
    ).all()
    return {
        "records": [serialize_history_record(record) for record in records],
    }


@app.delete("/api/history/{record_id}")
def delete_history_record(
    record_id: int,
    current_user: User = Depends(current_user_dependency),
    session: Session = Depends(get_database_session),
) -> dict[str, Any]:
    record = session.scalar(
        select(AnalysisHistory).where(
            AnalysisHistory.id == record_id,
            AnalysisHistory.user_id == current_user.id,
        )
    )
    if not record:
        raise HTTPException(status_code=404, detail="Analysis history record not found.")

    session.delete(record)
    session.commit()
    return {"ok": True}


@app.post("/api/analyze")
def analyze_resume_job(payload: AnalyzeRequest) -> dict[str, Any]:
    started_at = time.perf_counter()
    result = analyze(payload.resume, payload.job, keywords=KEYWORDS)
    return {
        "engine": "rule_based",
        "timing": {
            "rule_ms": round((time.perf_counter() - started_at) * 1000),
        },
        **result,
    }


@app.post("/api/capabilities")
def discover_capabilities(
    payload: CapabilityDiscoveryRequest,
    request: Request,
    session: Session = Depends(get_database_session),
) -> dict[str, Any]:
    try:
        llm_config = get_llm_config()
        with llm_request_slot() as started_at:
            usage_event = enforce_rate_limit(
                session,
                request,
                "capability_discovery",
                len(payload.resume) + len(payload.job),
            )
            try:
                discovery = run_llm_task(discover_job_capabilities, payload.resume, payload.job)
            except LLMConfigurationError:
                complete_usage_event(session, usage_event, "configuration_error", started_at)
                discovery = build_rule_capability_fallback(
                    payload.resume,
                    payload.job,
                    "站点 LLM 暂未配置，已使用规则层生成基础能力表。",
                )
                return {
                    "engine": "rule_capability_fallback",
                    "provider": "rule_based",
                    "model": "keyword_fallback",
                    "thinking_mode": "disabled",
                    "timing": {"llm_ms": round((time.perf_counter() - started_at) * 1000)},
                    **discovery,
                }
            except Exception as exc:
                is_timeout = "timeout" in exc.__class__.__name__.lower()
                complete_usage_event(session, usage_event, "timeout" if is_timeout else "error", started_at)
                reason = (
                    f"LLM 能力识别超过 {get_llm_request_timeout_seconds():.0f} 秒，已使用规则层生成基础能力表。"
                    if is_timeout
                    else "LLM 能力识别失败，已使用规则层生成基础能力表。"
                )
                discovery = build_rule_capability_fallback(payload.resume, payload.job, reason)
                return {
                    "engine": "rule_capability_fallback",
                    "provider": llm_config.provider,
                    "model": llm_config.model,
                    "thinking_mode": get_llm_metadata().get("llm_thinking_mode"),
                    "timing": {"llm_ms": round((time.perf_counter() - started_at) * 1000)},
                    **discovery,
                }
            llm_ms = round((time.perf_counter() - started_at) * 1000)
            complete_usage_event(session, usage_event, "success", started_at)

        return {
            "engine": "llm_capability_discovery",
            "provider": llm_config.provider,
            "model": llm_config.model,
            "thinking_mode": get_llm_metadata().get("llm_thinking_mode"),
            "timing": {
                "llm_ms": llm_ms,
            },
            **discovery,
        }
    except LLMConfigurationError:
        discovery = build_rule_capability_fallback(
            payload.resume,
            payload.job,
            "站点 LLM 暂未配置，已使用规则层生成基础能力表。",
        )
        return {
            "engine": "rule_capability_fallback",
            "provider": "rule_based",
            "model": "keyword_fallback",
            "thinking_mode": "disabled",
            "timing": {"llm_ms": 0},
            **discovery,
        }
    except HTTPException as exc:
        if exc.status_code != 503:
            raise
        discovery = build_rule_capability_fallback(
            payload.resume,
            payload.job,
            "当前服务器繁忙，已使用规则层生成基础能力表。",
        )
        return {
            "engine": "rule_capability_fallback",
            "provider": "rule_based",
            "model": "keyword_fallback",
            "thinking_mode": "disabled",
            "timing": {"llm_ms": 0},
            **discovery,
        }


@app.post("/api/extract/resume")
async def extract_resume(file: UploadFile = File(...)) -> dict[str, Any]:
    content = await file.read()

    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Uploaded file is larger than 8 MB.")

    try:
        text, warnings = extract_resume_text(file.filename or "", content)
    except DocumentParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "filename": file.filename,
        "text": text,
        "character_count": len(text),
        "warnings": warnings,
    }


@app.post("/api/extract/job")
async def extract_job_document(file: UploadFile = File(...)) -> dict[str, Any]:
    content = await file.read()

    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Uploaded file is larger than 8 MB.")

    try:
        text, warnings = extract_document_text(file.filename or "", content)
    except DocumentParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "filename": file.filename,
        "text": text,
        "character_count": len(text),
        "warnings": warnings,
    }


@app.post("/api/normalize/job")
def normalize_job(
    payload: JobNormalizationRequest,
    request: Request,
    session: Session = Depends(get_database_session),
) -> dict[str, Any]:
    llm_config = get_llm_config()
    with llm_request_slot() as started_at:
        usage_event = enforce_rate_limit(session, request, "normalize_job", len(payload.raw_text))
        try:
            normalized = run_llm_task(normalize_job_text, payload.raw_text)
        except LLMConfigurationError as exc:
            complete_usage_event(session, usage_event, "configuration_error", started_at)
            raise HTTPException(status_code=503, detail="站点 LLM 暂未配置，请稍后再试。") from exc
        except Exception as exc:
            is_timeout = "timeout" in exc.__class__.__name__.lower()
            status = "timeout" if is_timeout else "error"
            complete_usage_event(session, usage_event, status, started_at)
            if is_timeout:
                raise HTTPException(
                    status_code=504,
                    detail=f"LLM 请求超过 {get_llm_request_timeout_seconds():.0f} 秒，请稍后再试。",
                ) from exc
            raise HTTPException(status_code=502, detail="LLM JD 整理失败，请稍后再试。") from exc
        complete_usage_event(session, usage_event, "success", started_at)

    return {
        "engine": "llm_job_normalizer",
        "provider": llm_config.provider,
        "model": llm_config.model,
        "api_style": llm_config.api_style,
        "normalized_job": normalized,
    }


@app.post("/api/ai-suggestions")
def ai_suggestions(
    payload: AISuggestionsRequest,
    request: Request,
    session: Session = Depends(get_database_session),
) -> dict[str, Any]:
    total_started_at = time.perf_counter()
    rule_started_at = time.perf_counter()
    analysis = analyze(payload.resume, payload.job, keywords=KEYWORDS)
    rule_ms = round((time.perf_counter() - rule_started_at) * 1000)
    analysis["benchmark_context"] = find_hiring_benchmark(payload.job)
    llm_config = get_llm_config()
    capability_assessments = [item.model_dump() for item in payload.capability_assessments]
    with llm_request_slot() as started_at:
        usage_event = enforce_rate_limit(
            session,
            request,
            "ai_suggestions",
            len(payload.resume) + len(payload.job),
        )
        try:
            advice = run_llm_task(
                generate_advice,
                payload.resume,
                payload.job,
                analysis,
                capability_assessments,
                payload.thinking,
            )
        except LLMConfigurationError as exc:
            complete_usage_event(session, usage_event, "configuration_error", started_at)
            raise HTTPException(status_code=503, detail="站点 LLM 暂未配置，请稍后再试。") from exc
        except Exception as exc:
            is_timeout = "timeout" in exc.__class__.__name__.lower()
            status = "timeout" if is_timeout else "error"
            complete_usage_event(session, usage_event, status, started_at)
            if is_timeout:
                raise HTTPException(
                    status_code=504,
                    detail=f"LLM 请求超过 {get_llm_request_timeout_seconds():.0f} 秒，请稍后再试。",
                ) from exc
            raise HTTPException(status_code=502, detail="AI 建议生成失败，请稍后再试。") from exc
        llm_ms = round((time.perf_counter() - started_at) * 1000)
        complete_usage_event(session, usage_event, "success", started_at)

    return {
        "engine": "llm_advice",
        "provider": llm_config.provider,
        "model": llm_config.model,
        "api_style": llm_config.api_style,
        "thinking_mode": resolve_thinking_mode(llm_config, payload.thinking),
        "rule_score": analysis.get("score"),
        "rule_score_source": "keyword_weight_formula",
        "capability_assessments": capability_assessments,
        "final_scoring": calculate_final_score(
            analysis.get("score"),
            advice,
            capability_assessments,
        ),
        "analysis_contract": get_llm_analysis_contract(),
        "timing": {
            "rule_ms": rule_ms,
            "llm_ms": llm_ms,
            "total_ms": round((time.perf_counter() - total_started_at) * 1000),
        },
        "advice": advice,
    }
