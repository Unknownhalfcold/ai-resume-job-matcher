# Web MVP

## 目标

Web MVP 将当前 Python 规则匹配逻辑迁移到浏览器端，提供一个可以直接演示的交互页面。

当前实现方式：

- `index.html`：页面结构
- `assets/styles.css`：页面样式
- `assets/app.js`：浏览器端匹配逻辑
- `data/keywords.json`：共享关键词配置
- `docs/scoring.html`：评分逻辑页面

如果后端 `http://localhost:8001` 正在运行，前端会自动使用 API 模式；如果后端未运行，前端会继续使用浏览器本地规则分析。

## 本地预览

在项目根目录启动本地服务：

```powershell
py -m http.server 8000
```

打开：

```text
http://localhost:8000
```

## 当前能力

- 粘贴简历文本和岗位 JD
- 计算关键词权重匹配分数
- 展示已匹配和缺失关键词
- 按能力维度展示覆盖情况
- 展示高优先级缺口
- 展示优化建议
- 复制 JSON 结果
- 载入示例数据

## 设计方向

页面采用克制、留白充足、信息层级清晰的产品工具界面。

第一屏提供产品入口和结果预览，分析器作为核心工作区紧接在开始页之后。

## GitHub Pages

仓库根目录已包含 `index.html`，后续可以在 GitHub 仓库中开启 Pages：

1. 打开仓库 `Settings`
2. 进入 `Pages`
3. Source 选择 `Deploy from a branch`
4. Branch 选择 `main`
5. Folder 选择 `/root`
6. 保存

发布后，页面会以 GitHub Pages 地址访问。
