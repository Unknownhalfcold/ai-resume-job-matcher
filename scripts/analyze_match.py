from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Keyword:
    name: str
    category: str
    weight: int
    aliases: tuple[str, ...]


KEYWORDS: tuple[Keyword, ...] = (
    Keyword("AI 产品", "产品能力", 5, ("ai 产品", "ai产品", "人工智能产品", "llm 产品", "大语言模型")),
    Keyword("需求分析", "产品能力", 5, ("需求分析", "需求调研", "需求文档", "prd")),
    Keyword("功能设计", "产品能力", 4, ("功能设计", "产品设计", "方案设计")),
    Keyword("用户研究", "产品能力", 4, ("用户研究", "用户调研", "用户反馈", "访谈")),
    Keyword("竞品分析", "产品能力", 3, ("竞品分析", "竞品调研", "市场分析")),
    Keyword("产品原型", "产品能力", 3, ("产品原型", "原型设计", "figma", "axure")),
    Keyword("项目管理", "协作能力", 4, ("项目管理", "进度管理", "推进落地", "功能落地")),
    Keyword("跨团队协作", "协作能力", 4, ("跨团队", "协作", "研发", "设计团队", "沟通")),
    Keyword("数据分析", "数据能力", 5, ("数据分析", "数据指标", "指标分析", "数据驱动")),
    Keyword("SQL", "数据能力", 4, ("sql", "mysql", "postgresql")),
    Keyword("Python", "技术能力", 4, ("python",)),
    Keyword("Excel", "数据能力", 2, ("excel", "表格")),
    Keyword("A/B 测试", "数据能力", 3, ("a/b 测试", "ab测试", "实验分析")),
    Keyword("招聘场景", "行业理解", 3, ("招聘", "简历", "求职", "岗位匹配")),
    Keyword("教育场景", "行业理解", 2, ("教育场景", "教育等场景", "教育产品", "学习场景", "课程推荐")),
    Keyword("文档表达", "通用能力", 3, ("文档", "表达", "写作", "逻辑分析")),
)


SUGGESTION_TEMPLATES: dict[str, str] = {
    "AI 产品": "补充你对 AI 产品或大语言模型应用场景的理解，例如简历分析、招聘匹配、教育辅助等。",
    "需求分析": "在项目经历中写清楚你如何拆解用户问题、整理需求，并形成 PRD 或功能清单。",
    "功能设计": "补充你设计过的核心功能、用户流程或页面结构，而不只是写“参与项目”。",
    "用户研究": "加入用户访谈、问卷、反馈整理等经历，说明你如何发现用户痛点。",
    "竞品分析": "补充你对同类产品的比较维度，例如功能、用户流程、商业模式或优缺点。",
    "产品原型": "如果你做过原型，可以写出使用的工具和原型覆盖的关键页面。",
    "项目管理": "强调你如何推动任务落地，例如排期、对齐需求、跟进进度和复盘结果。",
    "跨团队协作": "写出你与研发、设计、运营或数据同学协作的具体场景。",
    "数据分析": "补充你分析过的数据指标、分析方法，以及分析后带来的产品或业务决策。",
    "SQL": "如果会 SQL，建议写出查询、清洗或分析数据的具体场景。",
    "Python": "如果会 Python，建议说明你用它做过文本处理、数据分析或自动化任务。",
    "Excel": "补充 Excel 用法，例如透视表、公式、数据清洗或可视化。",
    "A/B 测试": "如果岗位强调增长或实验，建议补充实验设计、指标对比或效果评估经历。",
    "招聘场景": "把当前项目和招聘、简历、岗位匹配场景联系起来，突出行业理解。",
    "教育场景": "如果申请教育 AI 相关岗位，可以补充学习体验、课程或知识推荐相关理解。",
    "文档表达": "突出你写过 PRD、分析报告、项目总结或研究文档。",
}


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def normalize(text: str) -> str:
    return text.lower().replace("／", "/").replace("，", ",")


def contains_any(text: str, aliases: tuple[str, ...]) -> bool:
    normalized = normalize(text)
    return any(alias.lower() in normalized for alias in aliases)


def extract_job_keywords(job_text: str) -> list[Keyword]:
    return [keyword for keyword in KEYWORDS if contains_any(job_text, keyword.aliases)]


def analyze(resume_text: str, job_text: str) -> dict[str, object]:
    job_keywords = extract_job_keywords(job_text)

    matched = [keyword for keyword in job_keywords if contains_any(resume_text, keyword.aliases)]
    missing = [keyword for keyword in job_keywords if keyword not in matched]

    total_weight = sum(keyword.weight for keyword in job_keywords)
    matched_weight = sum(keyword.weight for keyword in matched)
    score = round((matched_weight / total_weight) * 100) if total_weight else 0

    suggestions = [
        SUGGESTION_TEMPLATES.get(keyword.name, f"建议在简历中补充与“{keyword.name}”相关的具体经历。")
        for keyword in missing
    ]

    return {
        "score": score,
        "job_keywords": serialize_keywords(job_keywords),
        "matched_keywords": serialize_keywords(matched),
        "missing_keywords": serialize_keywords(missing),
        "suggestions": suggestions,
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


def print_text_report(result: dict[str, object]) -> None:
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
        "--format",
        choices=("text", "json"),
        default="text",
        help="Output format.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = analyze(read_text(args.resume), read_text(args.job))

    if args.format == "json":
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return

    print_text_report(result)


if __name__ == "__main__":
    main()
