# 录用背景基准

## 使用原则

项目不会让 LLM 凭模型记忆生成某公司的“已录用员工画像”。只有满足以下条件的数据才能进入 `data/hiring_benchmarks.json`：

- 匿名、聚合，不包含姓名、联系方式或可识别个人的信息。
- 有公开来源或获得合法授权的数据来源。
- 标注来源链接、采集日期、样本量和适用岗位。
- 只描述总体分布，不把院校、性别、年龄等个人属性当作能力结论。
- 样本过少、来源不清或时间过旧时不进入评分，只能作为低置信度说明。

没有可靠基准时，模型必须使用 `jd_only`，仅根据当前 JD 和用户简历分析。

## 数据格式

```json
{
  "companies": {
    "示例公司": {
      "aliases": ["Example Company"],
      "roles": ["数据分析", "商业分析"],
      "sample_size": 50,
      "source_notice": "匿名聚合公开样本，仅供参考",
      "sources": [
        {
          "title": "公开来源标题",
          "url": "https://example.com/source",
          "accessed_at": "2026-06-11"
        }
      ],
      "typical_education_background": ["相关专业本科及以上占多数"],
      "common_awards_or_credentials": ["岗位相关证书在部分样本中出现"],
      "common_research_directions": ["与岗位相关的研究方向"],
      "common_internship_experience": ["同职能或相邻职能实习较常见"]
    }
  }
}
```

示例只说明结构，不能直接作为真实公司数据提交。

## 后续校准

可靠数据积累后，应按公司、岗位族、地区和时间窗口检索，再将最相关的匿名摘要交给 LLM。最终评分仍由固定函数计算，招聘背景基准只用于解释和有限校准，不能替代 JD。
