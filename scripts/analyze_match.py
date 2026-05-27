from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_KEYWORDS_PATH = Path(__file__).resolve().parent.parent / "data" / "keywords.json"


@dataclass(frozen=True)
class Keyword:
    name: str
    category: str
    weight: int
    aliases: tuple[str, ...]
    suggestion: str


def load_keywords(path: Path = DEFAULT_KEYWORDS_PATH) -> tuple[Keyword, ...]:
    raw_keywords: list[dict[str, Any]] = json.loads(path.read_text(encoding="utf-8"))
    return tuple(
        Keyword(
            name=item["name"],
            category=item["category"],
            weight=int(item["weight"]),
            aliases=tuple(item["aliases"]),
            suggestion=item["suggestion"],
        )
        for item in raw_keywords
    )


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def normalize(text: str) -> str:
    return text.lower().replace("／", "/").replace("，", ",")


def contains_any(text: str, aliases: tuple[str, ...]) -> bool:
    normalized = normalize(text)
    return any(alias.lower() in normalized for alias in aliases)


def extract_job_keywords(job_text: str, keywords: tuple[Keyword, ...]) -> list[Keyword]:
    return [keyword for keyword in keywords if contains_any(job_text, keyword.aliases)]


def analyze(
    resume_text: str,
    job_text: str,
    keywords: tuple[Keyword, ...] | None = None,
) -> dict[str, object]:
    keyword_list = keywords or load_keywords()
    job_keywords = extract_job_keywords(job_text, keyword_list)

    matched = [keyword for keyword in job_keywords if contains_any(resume_text, keyword.aliases)]
    missing = [keyword for keyword in job_keywords if keyword not in matched]

    total_weight = sum(keyword.weight for keyword in job_keywords)
    matched_weight = sum(keyword.weight for keyword in matched)
    score = round((matched_weight / total_weight) * 100) if total_weight else 0

    suggestion_items = build_suggestion_items(missing)

    return {
        "score": score,
        "score_details": {
            "matched_weight": matched_weight,
            "total_job_weight": total_weight,
            "formula": f"{matched_weight} / {total_weight} * 100" if total_weight else "0",
        },
        "job_keywords": serialize_keywords(job_keywords),
        "matched_keywords": serialize_keywords(matched),
        "missing_keywords": serialize_keywords(missing),
        "category_summary": build_category_summary(job_keywords, matched),
        "priority_gaps": suggestion_items[:5],
        "suggestion_items": suggestion_items,
        "suggestions": [str(item["suggestion"]) for item in suggestion_items],
    }


def serialize_keywords(keywords: list[Keyword]) -> list[dict[str, object]]:
    return [
        {
            "name": keyword.name,
            "category": keyword.category,
            "weight": keyword.weight,
        }
        for keyword in keywords
    ]


def priority_label(weight: int) -> str:
    if weight >= 5:
        return "高优先级"
    if weight >= 3:
        return "中优先级"
    return "低优先级"


def build_category_summary(
    job_keywords: list[Keyword],
    matched_keywords: list[Keyword],
) -> list[dict[str, object]]:
    matched_set = set(matched_keywords)
    grouped: dict[str, dict[str, object]] = {}

    for keyword in job_keywords:
        group = grouped.setdefault(
            keyword.category,
            {
                "category": keyword.category,
                "matched_weight": 0,
                "total_weight": 0,
                "score": 0,
                "matched_keywords": [],
                "missing_keywords": [],
            },
        )
        group["total_weight"] = int(group["total_weight"]) + keyword.weight

        if keyword in matched_set:
            group["matched_weight"] = int(group["matched_weight"]) + keyword.weight
            group["matched_keywords"].append(keyword)  # type: ignore[union-attr]
        else:
            group["missing_keywords"].append(keyword)  # type: ignore[union-attr]

    summaries = []
    for group in grouped.values():
        total_weight = int(group["total_weight"])
        matched_weight = int(group["matched_weight"])
        summaries.append(
            {
                "category": group["category"],
                "matched_weight": matched_weight,
                "total_weight": total_weight,
                "score": round((matched_weight / total_weight) * 100) if total_weight else 0,
                "matched_keywords": serialize_keywords(group["matched_keywords"]),  # type: ignore[arg-type]
                "missing_keywords": serialize_keywords(group["missing_keywords"]),  # type: ignore[arg-type]
            }
        )

    return summaries


def build_suggestion_items(missing_keywords: list[Keyword]) -> list[dict[str, object]]:
    sorted_keywords = sorted(missing_keywords, key=lambda keyword: (-keyword.weight, keyword.name))
    return [
        {
            "name": keyword.name,
            "category": keyword.category,
            "weight": keyword.weight,
            "priority": priority_label(keyword.weight),
            "suggestion": keyword.suggestion,
        }
        for keyword in sorted_keywords
    ]


def format_keyword_list(items: list[dict[str, object]]) -> str:
    if not items:
        return "  暂无"

    lines = []
    for item in items:
        lines.append(f"  - {item['name']} | 类别：{item['category']} | 权重：{item['weight']}")
    return "\n".join(lines)


def format_suggestions(suggestions: list[str]) -> str:
    if not suggestions:
        return "  当前简历已经覆盖了岗位中的主要关键词，可以继续优化表达质量和结果数据。"

    return "\n".join(f"  {index}. {suggestion}" for index, suggestion in enumerate(suggestions, start=1))


def print_debug_report(result: dict[str, object]) -> None:
    score_details = result["score_details"]  # type: ignore[assignment]
    print()
    print("分数计算明细：")
    print(f"  已匹配关键词权重：{score_details['matched_weight']}")  # type: ignore[index]
    print(f"  岗位关键词总权重：{score_details['total_job_weight']}")  # type: ignore[index]
    print(f"  计算公式：{score_details['formula']}")  # type: ignore[index]


def print_text_report(result: dict[str, object], debug: bool = False) -> None:
    print("AI 简历与岗位匹配度分析报告")
    print("=" * 36)
    print(f"匹配度分数：{result['score']}/100")
    print()
    print("岗位关键词：")
    print(format_keyword_list(result["job_keywords"]))  # type: ignore[arg-type]
    print()
    print("简历已匹配关键词：")
    print(format_keyword_list(result["matched_keywords"]))  # type: ignore[arg-type]
    print()
    print("简历缺失关键词：")
    print(format_keyword_list(result["missing_keywords"]))  # type: ignore[arg-type]
    print()
    print("修改建议：")
    print(format_suggestions(result["suggestions"]))  # type: ignore[arg-type]

    if debug:
        print_debug_report(result)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze resume-job match score.")
    parser.add_argument(
        "--resume",
        type=Path,
        default=Path("examples/resume_sample.txt"),
        help="Path to resume text file.",
    )
    parser.add_argument(
        "--job",
        type=Path,
        default=Path("examples/job_sample.txt"),
        help="Path to job description text file.",
    )
    parser.add_argument(
        "--keywords",
        type=Path,
        default=DEFAULT_KEYWORDS_PATH,
        help="Path to keyword configuration JSON.",
    )
    parser.add_argument(
        "--format",
        choices=("text", "json"),
        default="text",
        help="Output format.",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Show score calculation details in text output.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = analyze(
        read_text(args.resume),
        read_text(args.job),
        keywords=load_keywords(args.keywords),
    )

    if args.format == "json":
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return

    print_text_report(result, debug=args.debug)


if __name__ == "__main__":
    main()
