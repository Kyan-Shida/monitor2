# 00 · 巡检项录入方式调整：删除「Excel 导入」

> 变更类型：UI 功能下线 + 死代码/依赖清理
> 变更日期：2026-10-06
> 影响模块：巡检点管理 → 添加 / 编辑巡检点 → 巡检项编辑抽屉

---

## 一、变更目标

在「添加 / 编辑巡检点」的**巡检项编辑抽屉**中，参数录入方式原有三种：操控台录入 / 手动输入 / Excel 导入。
本次**仅删除第 3 项「Excel 导入」**，保留「操控台录入」与「手动输入」。

由于该选项是 Excel 批量导入的唯一入口，删除后相关面板、解析逻辑、模板下载、`xlsx` 依赖随之整体下线，避免留下不可达的死代码。

---

## 二、变更内容

### 2.1 文件清单

| 文件 | 变更 |
|---|---|
| `src/components/InspectItemDrawer.tsx` | ⭐ 主改动：删选项、删面板、删解析与模板逻辑、删状态与引入 |
| `src/pages/PointEdit.tsx` | 移除仅供 Excel 参考数据使用的 `surveys` / `trials` 取值与传参 |
| `src/styles.css` | 删除 `.excel-import` / `.file-btn` 样式（已无引用） |
| `package.json` | 移除 `xlsx` 依赖（已无任何引用） |

### 2.2 具体改动

1. **录入方式选项**由 3 个收敛为 2 个：
   - `{ k: "cockpit", label: "操控台录入" }`
   - `{ k: "manual", label: "手动输入" }`
   - 删除 `{ k: "excel", label: "Excel 导入" }`
2. **`EditMode` 类型**：`"cockpit" | "manual" | "excel"` → `"cockpit" | "manual"`。
3. **删除渲染分支**：`{mode === "excel" && (<ExcelImportPanel ... />)}`。
4. **删除函数**：`applyExcelRows()`、`downloadExcelTemplate()`、`parseExcelFile()`、`ExcelImportPanel()`、`parseRows()`。
5. **删除状态**：`excelRows` / `excelErr`。
6. **删除引入**：`atomicActions`（供 Excel 面板与解析使用）、`loadXlsx()`、`SiteSurvey` / `TrialReceipt` 类型。
7. **删除属性**：抽屉 props 中未被消费的 `surveys` / `trials`（其文档用途即“Excel 模板/导入可参考”）。
8. **删除依赖**：`package.json` 中 `"xlsx": "^0.18.5"`（`src` 下已 0 引用）。

---

## 三、核心逻辑说明（变更后）

```
InspectItemDrawer
├─ mode: "cockpit" | "manual"（默认 "manual"）
├─ mode === "manual"  → <ManualActionPanel/>
└─ mode === "cockpit" → <ControlCockpit/>
```

- 参数录入仍由 `mode` 驱动，剩余两个分支逻辑不变。
- `cfgOf()` / `updCfg()` 中 `source` 仍按 `mode === "cockpit" ? "cockpit" : "manual"` 标记，语义不受影响。
- `AtomicActionConfig.source` 的联合类型仍保留 `"import"`（供其它导入来源使用），本次未改动该类型。

---

## 四、数据结构 / 接口影响

- `InspectItemDrawerProps`：删除 `surveys: SiteSurvey[]` 与 `trials: TrialReceipt[]` 两个属性（**破坏性变更**，仅本仓库内 `PointEdit.tsx` 一处调用方，已同步修改）。
- 无状态结构（`State` / seed）变更，无数据库/持久化影响。
- 无引擎 action 变更。

---

## 五、验证

| 项 | 结果 |
|---|---|
| `npx tsc -b` | ✅ 通过 |
| `npm test` | ⚠️ 62 / 63 通过 |
| Lint（改动文件） | ✅ 0 错误 |

**唯一失败用例**：`engine.test.ts` → `38 unique phase-one pages`（实际 37）。
**该失败与本次变更无关**，属既有问题：`navigation.ts` 中 `"points-space:空间与区域目标::点位与对象"` 被注释导致页面总数少 1，而测试断言仍为 38。需产品确认是恢复该菜单项还是同步修正断言。

---

## 六、注意事项与遗留

1. `xlsx` 已从 `package.json` 移除；**下次执行 `npm install` 时会自动裁剪** node_modules（无需手动卸载）。本机当前 node_modules 中可能仍残留该包，不影响运行。
2. `scripts/export-static.mjs` 中关于“把动态 import()（如 xlsx）内联进主 chunk”的注释已失去对应对象，可后续顺手清理（不影响功能）。
3. `AtomicActionConfig.source` 仍含 `"import"`，若后续确认无任何导入来源，可再单独收敛类型。
4. `静态版/index.html` 为历史导出产物，仍含旧代码，属预期。

---

## 七、AI 上下文速查

| 项 | 内容 |
|---|---|
| 技术栈 | React 19 + TypeScript 5 + Vite 5，自研 hash 路由，单一 Context Store + 纯函数 state machine |
| 启动 | `npm run dev`（http://localhost:5173）；`npm run build`；`npm test`（node:test + tsx） |
| 改动入口 | 菜单「资源与地图 › 点位与对象 › 巡检点管理」→「编辑巡检点」→ 巡检项「编辑 / 添加」→ 抽屉顶部「参数录入方式」 |
| 关键文件 | `src/components/InspectItemDrawer.tsx`（抽屉）、`src/pages/PointEdit.tsx`（调用方） |
| 相关类型 | `InspectSpec`、`AtomicActionConfig`（`source: "manual" \| "cockpit" \| "import"`） |
| 依赖变动 | 移除 `xlsx@^0.18.5` |
