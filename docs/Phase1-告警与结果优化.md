# Phase1 - 告警与结果优化（会议评审 9_30 清单首批落地）

> 本文档对应 `AI对话/9_30会议评审/会议评审纪要.md` 与 `01-原型修改处理清单.md` 的实施第一阶段。
> 按清单「附录 D 建议施工顺序」与优先级（P0 阻断 / P0 必改）挑选最高价值、最自包含的项先落地。

## 阶段目标
在不破坏既有成熟数据模型（schema 6）与状态机的前提下，优先收敛客户最痛的 4 类问题：
1. 告警处置链路过长 → 简化闭环
2. 结果详情层级不清、"表计识别"抬头错误 → 重构为 任务→巡检点→巡检项
3. 任务列表无时间范围、默认爆量 → 加时间筛选 + 未完成置顶
4. 紧急告警无全站强提醒 → 新增右下角弹窗

## 完成内容

### 文件清单与核心改动

| 文件 | 改动 | 对应清单 |
|------|------|----------|
| `src/data/engine.ts` | 新增 `ALARM_RESOLVE`（处理并消警即终态）；放宽 `ALARM_CLOSE`，不再强制复查任务/恢复确认 | ALM-02、ALM-03 |
| `src/pages/Results.tsx` | 告警闭环说明文案改为简化流程；3 处步骤条统一为「异常触发→确认处置→已消警关闭」；告警处置工作台新增「处理并消警」主按钮，"创建复查任务"降级为可选 | ALM-02、ALM-03 |
| `src/pages/Workbench.tsx` | 待我处理 KPI 文案与简化闭环一致 | ALM-06 一致性 |
| `src/pages/Planning.tsx` | 任务列表新增「时间范围」筛选（今日/近7天/近30天，默认今日，最大锁 30 天）；未完成状态置顶排序；无数据时空态提示；筛选变更重置分页 | TASK-02 |
| `src/components/ResultView.tsx` | 分页抬头「表计识别」→「检测项明细」；检测结果按巡检点分组、可折叠（任务→巡检点→巡检项，异常点置顶）；执行批次/地图版本移入「诊断信息」折叠块 | RES-03、RES-04（部分） |
| `src/App.tsx` | 新增 `AlarmPopup` 全站告警弹窗：对未确认的「紧急/重要」告警右下角浮层，可直达告警页或逐条忽略 | ALM-06 |
| `src/styles.css` | 新增 `.rd-points`/`.rd-point`/`.rd-diag`/`.alarm-popup` 等样式 | RES-03、ALM-06 |

### API / 状态机变更
- 告警状态机新增可选终态动作 `ALM_RESOLVE`：任意未关闭状态 → 已关闭（带处理意见），不再强制经过「待复查/已恢复」。
- 既有 `RECHECK`（可选复查任务）、`ALARM_NOTE`、`ALARM_CLOSE` 保留。

## 遇到的问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `npm run build` 报 `Could not resolve entry module ";/index.html"` | Windows 下 npm 脚本用 `;` 作分隔符（应为 `&&`/sh）；且直接 `npx vite build` 在本机也存在该入口解析异常，属预存环境问题，与本次改动无关 | 原型以 `npm run dev`（端口 5175）运行；`tsc -b` 类型检查已通过，开发服务器启动无报错 |
| 类型检查报 `tab` 类型不匹配 | 标签页 key 由「表计识别」改为「检测项」但 state 联合类型未同步 | 同步 `useState<"检测项"|"执行记录"|"复核记录">` |
| 告警弹窗字段名错误 | Alarm 类型字段为 `name`（非 equipment/desc/asset） | 改用 `a.name` |

## 关键文件列表
- ⭐ `src/data/engine.ts`（状态机，所有业务动作的单一入口）
- ⭐ `src/pages/Results.tsx`（告警处置 + 结果复核主页面）
- ⭐ `src/components/ResultView.tsx`（巡检结果详情，RES-03 核心）
- ⭐ `src/pages/Planning.tsx`（任务/计划，TASK-02）
- `src/App.tsx`（外壳 + 全站告警弹窗）

## AI 上下文速查
1. **项目技术栈**：React 18 + TypeScript + Vite 5 + lucide-react 图标；纯前端原型，状态存 `localStorage`（`src/data/store.tsx`）。
2. **外部服务/模型**：无真实后端；识别结果/告警为前端合成（`src/data/seed.ts` + `src/lib/photo.ts` 生成 SVG 占位图），遵循「禁止模拟数据」红线：仅为演示占位，非接口假数据。
3. **服务端口**：开发 `npm run dev` → http://localhost:5175 ；生产构建（`vite build`）本机存在入口解析异常，暂以 dev 为准。
4. **核心调用链**：UI 组件 → `act()`（`engine.ts` 纯函数 reducer）→ `useStore` 持久化 → 重渲染。
5. **数据模型关系**：Task → items(Point) → results(Result)；Alarm 关联 resultId/taskId/pointId/robotId；状态机集中在 `engine.ts`。
6. **启动命令**：`npm install`（国内镜像，见 `.npmrc`）→ `npm run dev`。
7. **配置文件**：`vite.config.ts`、`tsconfig.json`、`.npmrc`（registry.npmmirror.com）。
8. **本阶段新增依赖**：无。
9. **注意事项 / 已知问题**：
   - `npm run build` 在 Windows 下因 `;` 分隔符 + vite 入口解析异常无法打包，已在 `dev` 路径验证；后续如需静态导出走 `scripts/export-static.mjs`。
   - TASK-02 默认「今日」：种子任务时间若非当天，列表会显示空态（符合验收），可切「近 30 天」查看。
10. **下一阶段建议**：按清单顺序推进 EXE-02（任务维度总览）、DSP-01（计划任务直接绑定机器人）、PT-02、TKO-01/03/04、MAP-02、TGT-01、SCR-01/04 等，并补齐 ALM-05（有效/无效告警标注）、RES-01（结果定位历史）。

## 待办（本阶段未覆盖，留待后续 Phase）
ALM-01/04/05、EXE-01/02、DSP-01、EQ-01、TKO-01/02/03/04、PT-01/02、TGT-01/02、MAP-02、RES-01/02、SCR-01/02/03/04、DATA-01、UI-01、P0-缺项、P1/P2 余下条目。
