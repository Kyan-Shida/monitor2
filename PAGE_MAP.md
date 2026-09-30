# 原型页面 ↔ 代码文件映射速查

> 改动任何页面前先查表找文件，按 **页面 ID → 路由 URL → 组件文件** 三步走。
> 全局样式走 `styles.css`，数据走 `src/data/`，文档清单见文末「文档索引」。

---

## 核心入口（改导航/路由必看）

| 想改什么 | 去哪改 |
|---------|--------|
| 侧边栏菜单结构（一级中心 + 二级叶子） | `src/data/navigation.ts` → `groups` 数组 |
| 路由 hash 映射（`#/xxx` → page ID） | `src/data/navigation.ts` → `paths` 对象 |
| 页面父子关系（面包屑链 / 返回目标） | `src/data/navigation.ts` → `parents` 对象 |
| **详情页的动态来源**（面包屑/返回按入口归属） | 链接带回 `?from=page/id`；`ObjectLink` 传 `from`，见 `navigation.ts` 的 `Route.from` / `href` / `go` / `back` 与 `App.tsx` 的 `fromMeta` |
| 侧边栏隐藏/显示某个页面 | `src/data/navigation.ts` → `hiddenIds` 数组 |
| 一级中心图标（顺序对齐 `groups`） | `src/App.tsx` → `icons` 数组 |
| 二级叶子页面图标（按 page ID） | `src/App.tsx` → `pageIcons` 对象 |
| 全局搜索关键词 → 页面 | `src/App.tsx` → `keywordPages` 对象 |
| 角色能看到哪些中心 / 页面 / 权限点 | `src/data/roles.ts` → 各角色 `centers` / `pages` / `perms` + `PERMS` |
| page → 组件路由分发 | `src/App.tsx` 的 `body = ...` if/else 链 |
| 种子数据（机器人/任务/结果/告警/地图…） | `src/data/seed.ts` → `seed()`，由 `src/data/store.tsx` 注入 Context |
| 状态机（所有 `act` 动作的效果） | `src/data/engine.ts` → `transition()`（未知动作会抛错） |
| 指标口径（全站唯一来源） | `src/data/metrics.ts` |
| 通用 UI 组件（Btn/Modal/Note/Panel/Table/Badge/Steps…） | `src/components/UI.tsx` |
| 通用业务组件（ObjectLink/Kpis/EventTimeline/Pager） | `src/components/Business.tsx` |
| 面包屑 / 返回 / 侧边栏 / 路由分发 | `src/App.tsx` 内部渲染 |
| 驾驶舱顶栏（时间 / 切换 Tab） | `src/pages/CockpitScreen.tsx` |
| 离线单文件导出（双击即用） | `scripts/export-static.mjs` → 产出 `静态版/index.html` |
| 全局样式 | `src/styles.css` |

---

## 页面 ID → 路由 → 组件文件

### 🔧 工作台（一级中心）

| 页面 ID | 路由 URL | 组件文件 | 备注 |
|---------|---------|---------|------|
| `workbench` | `#/workbench` | `src/pages/Workbench.tsx` | 角色默认落地页（6 个待办 KPI，点击弹出该类明细弹窗；页面只读展示，复核等写操作跳转对应页面）。**快捷入口 4 项**（2026-09-30 调整）：新建任务 → `quick`（直达临时任务创建抽屉）· 任务调度 → `dispatch` · 结果查询 → `results`（原「结果复核」）· 告警记录 → `alarms` |

### 🛠️ 巡检执行（一级中心）

| 页面 ID | 路由 URL | 组件文件 | 备注 |
|---------|---------|---------|------|
| `standards` | `#/resources/standards` | `src/pages/Supporting.tsx` 兜底，侧边栏已隐藏 | 巡检标准（占位） |
| `templates` | `#/resources/templates` | `src/pages/Planning.tsx`（`page="templates"`） | 巡检模板 |
| `plans` | `#/planning/plans` | `src/pages/Planning.tsx`（`page="plans"`） | 计划列表 |
| `plan-edit` | `#/planning/plan-edit` | `src/pages/Planning.tsx`（`page="plan-edit"`） | 计划编辑，父页面 `plans` |
| `tasks` | `#/planning/tasks` | `src/pages/Planning.tsx`（`page="tasks"`） | 任务列表 |
| `quick` | `#/planning/quick` | `src/pages/Planning.tsx`（`page="quick"`） | 目标与要求，侧边栏已隐藏 |
| `calendar` | `#/monitor/calendar` | `src/pages/OperationsLegacy.tsx`（经 `Operations.tsx` 转调） | 任务日历，侧边栏已隐藏（该文件仅此分支在用） |
| `dispatch` | `#/dispatch/workbench` | `src/pages/DispatchDesk.tsx` | 调度中心：页头「当前调度对象」+ 平台态势 6 项 + 左机器人资源列（`DispatchFleetOverview`）+ 右工作区（当前任务 / 待执行队列 / 待安排·未来时间轴） |
| `queue` | `#/dispatch/queue` | `src/pages/DispatchDesk.tsx`（兼容旧链接） | 合并到调度中心，侧边栏隐藏重复入口 |
| `dispatch-log` | `#/dispatch/records` | `src/pages/Supporting.tsx` 日志兜底，侧边栏已隐藏 | 调度记录 |
| `execution` | `#/execution/live` | `src/pages/ExecutionWorkbench.tsx`（`Execution.tsx` 再导出） | 实时执行监控 |
| `manual` | `#/execution/manual` | `src/pages/Operations.tsx`（`page="manual"`） | **人工接管与遥控**（机器人选择器 + 内嵌 `ControlConsole`）；2026-09-29 由「机器人管理 › 机器人能力」移入「巡检执行 › 执行」，路由由 `#/robots/manual` 改为 `#/execution/manual` |
| `replay` | `#/execution/replay` | `src/pages/ObjectDetails.tsx`（`page="replay"`） | 执行回溯（主从列表）；**侧边栏已收起**（`hiddenIds`），仍可从任务详情主按钮进入；内置页 `replay-detail` 不受影响 |

> 说明：原独立页「远程操控台」(`control`) 已合并进「人工操作与遥控」(`manual`)，其路由与页面已删除；各处「接管 / 遥控台」入口统一跳 `manual`。

### 📊 结果与异常（一级中心）

| 页面 ID | 路由 URL | 组件文件 | 备注 |
|---------|---------|---------|------|
| `results` | `#/results/query` | `src/pages/Results.tsx`（`page="results"`） | 巡检结果查询（按任务分组可折叠 / 任务·机器·时间筛选） |
| `review` | `#/results/review/:id` | `src/pages/Results.tsx`（`page="review"`） | 结果详情 / 复核（含人工复核表单），父页面 `results` |
| `archive` | `#/results/equipment` | `src/pages/DeviceArchive.tsx` | 设备巡检档案，内部 5 个 tab |
| `alarms` | `#/alarms/events` | `src/pages/Results.tsx`（`Alarms` 导出，`page="alarms"`） | 告警事件 |
| `alarm` | `#/alarms/detail/:id` | `src/pages/Results.tsx`（`Alarms` 导出，`page="alarm"`） | 告警详情 / 复查（含处置工作台），父页面 `alarms` |
| `rules` | `#/alarms/rules` | `src/pages/AlarmConfiguration.tsx` | 巡检点列表行内规则抽屉；旧 rules 路由兼容进入点位列表 |

> 三个只读**内置页**见下文「隐藏的详情/下钻页」：`result-detail` / `alarm-detail` / `replay-detail`。

### 🗺️ 资源与地图（一级中心）

| 页面 ID | 路由 URL | 组件文件 | 备注 |
|---------|---------|---------|------|
| `equipment` | `#/resources/equipment` | `src/pages/DeviceMaster.tsx` | **设备主数据**（阶段③）：清单导入 → 待审核 → 通过/驳回 → 启停与「是否巡检」；设备是"巡检什么"的唯一来源，禁止由点位反推 |
| `points` | `#/resources/points` | `src/pages/BusinessTargets.tsx` | **巡检目标台账**：仪表 + 巡检要求 + 算法 + 阈值 + 判断标准；列表 + 两步抽屉（选检测目标 → 配业务逻辑）。巡检项从这里选目标 |
| `annotation` | `#/resources/annotation` | `src/pages/InspectionPoints.tsx` | **巡检点管理**（原「点位标注与验证工作台」槽位）：已配置巡检点列表（地图/状态筛选 + 搜索 + 分页）+「＋ 添加巡检点」 |
| `point-edit` | `#/resources/points/edit` | `src/pages/PointEdit.tsx` | **添加 / 编辑巡检点内置页**（父页面 `annotation`）：巡检点名称 + 地图 + 地图点位（带定位ID）+ 多个巡检项（名称 + 业务目标 + 原子动作 / 云台参数），逐项保存 |
| `point-annotate` | `#/resources/points/annotate` | `src/pages/Annotation.tsx` | **地图标注工作台内置页**（父页面 `annotation`）：候选目标 / 图面双击打点 / 试采与自主验证；仍被地图上线工作台第 1 步内嵌 |
| `maps` | `#/robots/maps` | `src/pages/Maps.tsx` | **地图管理**：只有地图列表（区域/状态筛选 + 搜索 + 分页 + 「详情」）；旧深链 `?tab=workflow/survey/archive/changes` 仍可进入（已不在界面暴露） |
| `map-detail` | `#/robots/maps/detail/:id` | `src/pages/MapDetail.tsx` | **地图详情内置页**（父页面 `maps`）：信息 / 版本三元组 / 内容概览 / 版本历史 / 预览；**操作区只有两个按钮**——**地图工作台**（`components/MapWorkbench.tsx`：底图 + 定位ID（区分来源）+ 轨迹，可继续新增）与**地图下发**（`components/MapDispatch.tsx`：多选设备批量下发 + 回执）；`?tab=workbench/sync` 可直达抽屉。**地图预览**（`components/MapSpatialPreview.tsx`，2D `MapCanvas` / 3D SVG 双视图）：2026-09-30 起叠加**自动巡检路网**（橙色实线，蛇形正交连线，覆盖全部巡航点——"所有点都在线上"）与本地图**巡检路线**（绿色虚线，来自 `s.routes` 按途经巡航点连线） |

> 已删除：`objects`（设备 → 对象 → 检测项）独立页——能力已并入设备主数据；设备的检测项与「是否巡检」开关现由「设备清单」行内「详情」右侧抽屉承载；
> `routes`（路线管理，含「路线与轨道」子分组）——2026-09-30 删除，路线随地图带入。

### 🤖 机器人管理（一级中心）

| 页面 ID | 路由 URL | 组件文件 | 备注 |
|---------|---------|---------|------|
| `robots` | `#/robots/monitor` | `src/pages/Operations.tsx`（`page="robots"`） | 机器台账（列表） |
| `robot` | `#/robots/detail/:id` | `src/pages/Operations.tsx`（`page="robot"`） | 机器人运行监测，内部 3 个 tab（monitor/tasks/records） |
| `robot-new` | `#/robots/new` | `src/pages/RobotNew.tsx` | **新增机器人**（表单页）：编码（唯一）/ 名称 / 机型 / 区域 / 地图 / 采集能力 / 移动能力 / 机型约束 / 固件；引擎 action `ADD_ROBOT`（2026-09-30 新增） |
| `health` | `#/robots/health` | `src/pages/Operations.tsx`（`page="health"`） | **机器人能力**（合并页）：页内 3 个 tab——能力与健康（`?tab=ability`，默认）/ 地图与版本（`?tab=map`）/ 机型专项（`?tab=device`）；顶部带机器人选择器 |
| `robot-map` | `#/robots/map` | `src/pages/Operations.tsx`（`page="robot-map"`） | （已合并进 `health`）地图与版本；**侧边栏已隐藏**，旧链接仍可打开 |
| `device` | `#/robots/device` | `src/pages/Operations.tsx`（`page="device"`） | （已合并进 `health`）机型专项；**侧边栏已隐藏**，旧链接仍可打开 |

> `health` / `robot-map` / `device`（以及已移入「巡检执行 › 执行」的 `manual`）共享同一机器人选择状态（`useViewState("robot-detail.selected")`），且**路由 `id` 优先于该状态**，便于从驾驶舱/执行台定向跳入。
> 2026-09-30：原三个二级页「能力与健康 / 地图与版本 / 机型专项」合并为「机器人能力」一页（页内 Tab 切换），`robot-map` / `device` 加入 `hiddenIds`（路由保留）；同日新增 `robot-new` 页面，页面总数 38 → 37（`engine.test.ts` 断言同步）。

### 📈 分析与报表（一级中心）

| 页面 ID | 路由 URL | 组件文件 | 备注 |
|---------|---------|---------|------|
| `metrics` | `#/analytics/metrics` | `src/pages/Metrics.tsx` | 指标中心（口径唯一来源） |
| `analytics` | `#/analytics/overview` | `src/pages/Supporting.tsx` 兜底，侧边栏已隐藏 | 基础分析（占位） |

### ⚙️ 系统设置（一级中心）

| 页面 ID | 路由 URL | 组件文件 | 备注 |
|---------|---------|---------|------|
| `services` | `#/ai/services` | `src/pages/Supporting.tsx` 兜底，侧边栏已隐藏 | 能力 / 服务管理（占位） |
| `roles` | `#/system/roles` | `src/pages/Supporting.tsx` → `src/components/RoleMatrix.tsx` | 角色 / 权限矩阵 |
| `users` | `#/system/users` | `src/pages/Supporting.tsx` 兜底，侧边栏已隐藏 | 组织 / 用户（占位） |
| `audit` | `#/system/audit` | `src/pages/Supporting.tsx` 日志分支 | 审计日志 |
| `integration` | `#/integration/services` | `src/pages/Supporting.tsx`（`page="integration"`） | 上层任务服务 / 接口配置 |
| `interface-log` | `#/integration/logs` | `src/pages/Supporting.tsx` 日志分支 | 接口日志 |
| `settings` | `#/system/settings` | `src/pages/Supporting.tsx` 兜底 | 字典 / 参数 |
| `media` | `#/media/library` | `src/pages/Supporting.tsx`（`page="media"`） | 资源库，侧边栏已隐藏 |

### 🖥️ 驾驶舱大屏（独立入口，不出现在侧边栏）

| 页面 ID | 路由 URL | 组件文件 | 备注 |
|---------|---------|---------|------|
| `bigscreen` | `#/screen/bigscreen` | `src/pages/CockpitScreen.tsx` | 大屏外壳（顶栏 Tab 切 综合总览 / 调度指挥），由顶栏按钮新标签页打开 |
| `overview` | `#/monitor/overview` | `src/pages/CockpitScreen.tsx` | 管理驾驶舱（自适应全屏） |
| `screen` | `#/screen` | `src/pages/CockpitScreen.tsx` | 调度驾驶舱（云台 / 镜头调控 + 对讲 · 声光） |

### 🔗 隐藏的详情 / 下钻页（无侧边栏入口）

| 页面 ID | 路由 URL | 组件文件 | 进入方式 / 备注 |
|---------|---------|---------|----------------|
| `point` | `#/resources/points/detail/:id` | `src/pages/ObjectDetails.tsx`（`page="point"`） | 巡检点详情；父页面 `annotation` |
| `task-detail` | `#/planning/tasks/detail/:id` | `src/pages/ObjectDetails.tsx`（`page="task-detail"`） | 任务详情；父页面 `tasks` |
| `result-detail` | `#/results/equipment/detail/:id` | `src/pages/Results.tsx`（`page="result-detail"`） | 结果只读详情；设备档案的结果编号进入；父页面 `archive` |
| `alarm-detail` | `#/results/equipment/alarm/:id` | `src/pages/Results.tsx`（`Alarms` 的 `page="alarm-detail"`） | 告警只读详情；设备档案的关联告警进入；父页面 `archive` |
| `replay-detail` | `#/results/equipment/replay/:id` | `src/pages/ObjectDetails.tsx`（`page="replay-detail"`） | 执行回溯（只读）；设备档案「过程回放」、机器人「历史任务」进入；父页面 `archive` |

**进入写法（带来源页）**：

```tsx
<ObjectLink to="result-detail" id="RES001" from={{ page: "archive" }}>RES001</ObjectLink>
<ObjectLink to="replay-detail" id="T020" from={{ page: "robot", id: "R01" }}>过程回放</ObjectLink>
```

- `from` 会被写成 URL 的 `?from=robot/R01`；`App.tsx` 据此决定**面包屑分组 / 父级链 / 返回目标 / 侧边栏高亮**。
- 不带 `from` 时回落到 `routeMeta` 里静态声明的父页面。

---

## 组件文件清单

### 页面层（`src/pages/`）

| 文件 | 内部渲染分支（`page` 参数） | 主要内容 |
|------|--------------------------|---------|
| `Workbench.tsx` | — | 角色工作台（KPI 条 + 5 块待办面板） |
| `MonitorCockpit.tsx` | — | 管理驾驶舱（综合总览 + 运营管理） |
| `DispatchCockpit.tsx` | — | 调度指挥驾驶舱（地图 + 控制带 + 告警/SLA） |
| `CockpitScreen.tsx` | — | 大屏外壳（顶栏 Tab 切两个驾驶舱） |
| `Metrics.tsx` | — | 指标中心（指标卡 + 口径 + 下钻弹窗） |
| `Operations.tsx` | `robots` / `robot` / `health`（合并页，页内 3 Tab）/ `robot-map`（隐藏，兼容旧链）/ `manual`（菜单已移入「巡检执行 › 执行」）/ `device`（隐藏，兼容旧链）/ `calendar`(转调 Legacy) | 机器台账 + 运行监测 + 机器人能力/地图/人工操作/机型 |
| `RobotNew.tsx` | `robot-new` | 新增机器人表单页（引擎 `ADD_ROBOT`） |
| `OperationsLegacy.tsx` | `calendar`（其余分支为历史死代码） | 旧版运维页；现仅任务日历在用 |
| `Maps.tsx` | — | 地图管理（内部 tab：list / detail / archive / sync / changes） |
| `Annotation.tsx` | `point-annotate`（内置页） | 地图标注工作台（候选目标 / 试采 / 自主验证）；不再是菜单页 |
| `Planning.tsx` | `plans` / `plan-edit` / `tasks` / `quick` / `templates` | 计划 + 任务 + 模板 |
| `DispatchDesk.tsx` / `Scheduling.tsx` | `dispatch` / `queue` | 调度中心（左资源列 + 右工作区）/ 旧三栏调度工作台（`Scheduling.tsx` 本版不可达） |
| `ExecutionWorkbench.tsx` | — | 实时执行监控（`Execution.tsx` 再导出为 `Execution`） |
| `Execution.tsx` | — | 再导出 `Execution`；并导出 `ControlConsole`（人工接管与遥控控制台主体，内嵌于 `manual`） |
| `Results.tsx` | `results` / `review` / `result-detail` | 巡检结果查询 + 复核 + 结果详情；同时导出 `Alarms`（`alarms` / `alarm` / `alarm-detail`） |
| `DeviceArchive.tsx` | — | 设备巡检档案（内部 5 tab，含任务/时间筛选） |
| `ObjectDetails.tsx` | `point` / `task-detail` / `replay-detail` / `replay` | 下钻详情复用页 |
| `Supporting.tsx` | `equipment` / `points` / `integration` / `media` / `analytics`(+`archive` 死分支) / 日志类(`audit`/`interface-log`/`dispatch-log`) / 通用兜底(`standards`/`routes`/`services`/`users`/`settings`)，`roles` 转 `RoleMatrix` | 设备资源 + 巡检点 + 集成/资源库/日志/配置兜底 |

### 组件层（`src/components/`）

| 文件 | 导出 / 内容 |
|------|------------|
| `UI.tsx` | `Btn` / `Badge` / `Panel` / `Field` / `Note` / `Empty` / `Table` / `Modal`（`drawer` / `drawerWidth` 切右侧抽屉形态，`footer` 为固定底栏）/ `Steps` / `Download` |
| `Business.tsx` | `ObjectLink`（支持 `to` / `from` 下钻） / `Kpis` / `EventTimeline` / `Pager` |
| `MapCanvas.tsx` | SVG 伪地图（点位/候选/机器人/充电桩/轨道，支持缩放与点选） |
| `Video.tsx` | 视频 / 证据占位画面 |
| `ResultTrend.tsx` | 单点位历史值趋势折线 |
| `ControlPad.tsx` | 遥控盘（方向宫格 + 速度档位） |
| `Can.tsx` | 权限包裹组件 + `useRole()` |
| `ScreenTopBar.tsx` | 驾驶舱顶栏（品牌 / Tab / 各舱控件插槽 `extra`（厂区筛选 · 调度中心 · 全屏图标 · 紧急停止）/ 时间） |
| `RoleMatrix.tsx` | 角色权限矩阵 |
| `TaskPeekDrawer.tsx` | 调度中心「任务详情」右侧抽屉（决策速览：来源 / 类型 / 阶段 / 计划时间 / 排队位置 / 阻塞校验 / 点位快照，底部「打开完整任务详情」跳内置页） |
| `TaskDetailPanel.tsx` | 任务详情内容（概要头 + 任务摘要 / 任务控制与版本约束 + 派单历史 + 检测项快照与结果）；`task-detail` 内置页与任务列表详情抽屉共用同一实现 |

### 数据层（`src/data/`）

| 文件 | 内容 |
|------|------|
| `navigation.ts` | `groups` / `paths` / `parents` / `hiddenIds` / `routeMeta` / `parse` / `href` / `go` / `back` / `menuIdOf` / `useViewState`（含 `Route.from` 机制与存储容错） |
| `store.tsx` | `Store` Provider 与 `useStore()`；状态持久化（失败降级为内存态） |
| `seed.ts` | 全部演示种子数据（点位/地图/机器人/模板/计划/任务/结果/告警/日志/工单…）及构造助手 |
| `engine.ts` | 状态机 `transition(state, action)`：调度/执行/复核/告警/地图/工单等全部动作 |
| `metrics.ts` | 指标定义与口径（`metricValue` / `metricsFor` / `metricOk`） |
| `selectors.ts` | 派生计算（`pointOf` / `stageOf` / `queueFor` / `schedule` / `checks` / `fmtTime` / `terminal` …） |
| `roles.ts` | 角色定义、`canSee` / `canDo` / `PERMS` 权限点 |
| `types.ts` | 全量数据模型类型 + `stages` / `taskTypeActions` 常量 |
| `deviceProfile.ts` | 机型差异配置与 `hasMobility` 能力判定 |

### 样式

| 文件 | 内容 |
|------|------|
| `styles.css` | 全局唯一样式表（侧边栏、顶栏、center-tabs、panel、table、btn、modal、驾驶舱、`panel-filters-wrap` 等） |

---

## 常见改动 → 去哪里

| 你想改什么 | 直接改 |
|-----------|--------|
| 侧边栏加/减/重命名某个菜单项 | `navigation.ts` → `groups` 数组 |
| 侧边栏隐藏一个已实现页面 | `navigation.ts` → `hiddenIds` 加 ID |
| 新增一级中心 | ① `navigation.ts` groups 插新组 ② `App.tsx` icons 插图标 ③ `roles.ts` 各角色 centers 加组名 ④ `App.tsx` pageIcons 加叶子图标 ⑤ `App.tsx` 路由分发加分支 |
| 新增一个内置详情页 | ① `navigation.ts` 加 `paths` + `parents` + `routeMeta` ② `App.tsx` 路由分发 ③ 入口处用 `ObjectLink to=... from=...` |
| 页面要显示真实数据 | `src/data/seed.ts` 加数据 → 页面 `const { s } = useStore()` |
| 改机器人 / 任务 / 结果 / 告警的演示数据 | `src/data/seed.ts` 对应数组（`robots` / `tasks` / `results` / `alarms`） |
| 改某张表的列头 / 行 | 对应页面里的 `<Table heads={[...]} rows={[...]} />` |
| 改按钮 / panel / tab 样式 | `styles.css` 的 `.btn` / `.panel` / `.object-tabs` / `.center-tabs` |
| 改面包屑与返回 | `App.tsx` 的面包屑块（`breadcrumbGroup` / `fromMeta` / `chain`）+ `.breadcrumb` 样式 |
| 改角色可见范围 | `roles.ts` → 角色的 `pages` / `centers` |
| 改路由 hash 格式 | `navigation.ts` → `paths` |
| 改父子关系 | `navigation.ts` → `parents` 与 `routeMeta` 的 `parent` |
| 导出离线单文件 | `node scripts/export-static.mjs` |

---

## 目录速览

```
巡检业务平台原型/
├── index.html                   ← Vite 根 HTML
├── favicon.svg
├── vite.config.ts               ← 开发/常规构建
├── scripts/export-static.mjs    ← 离线单文件导出（→ 静态版/index.html）
├── src/
│   ├── App.tsx                  ← 侧边栏 + 面包屑/返回 + 路由分发 + 权限守卫
│   ├── main.tsx                 ← 入口 <Store><App/></Store>
│   ├── styles.css               ← 全局样式（唯一 CSS）
│   ├── components/
│   │   ├── UI.tsx               ← 基础组件
│   │   ├── Business.tsx         ← ObjectLink / Kpis / EventTimeline / Pager
│   │   ├── MapCanvas.tsx        ← SVG 地图
│   │   ├── Video.tsx            ← 视频/证据占位
│   │   ├── ResultTrend.tsx      ← 趋势折线
│   │   ├── ControlPad.tsx       ← 遥控盘
│   │   ├── Can.tsx              ← 权限组件
│   │   ├── ScreenTopBar.tsx     ← 驾驶舱顶栏
│   │   └── RoleMatrix.tsx       ← 权限矩阵
│   ├── pages/
│   │   ├── Workbench.tsx        ← 工作台
│   │   ├── MonitorCockpit.tsx   ← 管理驾驶舱
│   │   ├── DispatchCockpit.tsx  ← 调度指挥驾驶舱
│   │   ├── CockpitScreen.tsx    ← 大屏外壳
│   │   ├── Metrics.tsx          ← 指标中心
│   │   ├── Operations.tsx       ← 机器台账/详情/能力/地图/人工操作/机型
│   │   ├── OperationsLegacy.tsx ← 仅任务日历在用（其余死代码）
│   │   ├── Maps.tsx             ← 地图管理
│   │   ├── InspectionPoints.tsx ← 巡检点管理（菜单页）
│   │   ├── PointEdit.tsx        ← 添加/编辑巡检点（内置页）
│   │   ├── Annotation.tsx       ← 地图标注工作台（内置页）
│   │   ├── Planning.tsx         ← 计划/任务/模板
│   │   ├── Scheduling.tsx       ← 调度工作台/任务队列
│   │   ├── ExecutionWorkbench.tsx ← 实时执行监控
│   │   ├── Execution.tsx        ← 再导出 Execution + ControlConsole
│   │   ├── Results.tsx          ← 结果查询/复核/结果详情 + Alarms
│   │   ├── DeviceArchive.tsx    ← 设备巡检档案
│   │   ├── ObjectDetails.tsx    ← 点位/任务/执行回溯 下钻详情
│   │   └── Supporting.tsx       ← 设备资源/巡检点/集成/日志/配置兜底
│   └── data/
│       ├── navigation.ts / store.tsx / seed.ts / engine.ts
│       ├── metrics.ts / selectors.ts / roles.ts / types.ts
│       └── deviceProfile.ts
└── 文档：平台操作手册.md / README.md / PAGE_MAP.md / 巡检业务平台原型交互评审-01.md / 页面优化清单-01.md
```

---

## 踩坑清单（改导航必看）

**新增一级中心必须同时改 5 处**，少一处就炸：

1. ✅ `navigation.ts` → `groups` 数组加新组
2. ✅ `App.tsx` → `icons` 数组加图标（**顺序必须跟 `groups` 对齐**，否则 `<Icon/>` 为 `undefined` 会导致 React 崩溃）
3. ✅ `roles.ts` → 所有角色的 `centers` 数组加组名
4. ✅ `App.tsx` → `pageIcons` 加二级叶子图标
5. ✅ `App.tsx` → 路由分发加分支

**其它注意**：

- 隐藏页面只改一处：`navigation.ts` → `hiddenIds` 加 ID。**不要删路由**——详情页 / 直接 URL 访问还能用。
- 新增「内置详情页」时，`parents` 与 `routeMeta.parent` **两处都要写**（前者管侧边栏高亮与权限继承，后者管面包屑与返回）；同时 `App.tsx` 要加路由分发。
- 需要「同一内置页从不同业务页进入且面包屑不同」时，入口必须带 `from`；不带 `from` 时会回落到静态父页。
- 删除一个页面时，务必全局搜 `go("xxx"`、`to="xxx"`、`pageIcons.xxx`、`roles.ts`、`metrics.ts` 的下钻映射（`drillTarget`）、`App.tsx` 的 `keywordPages` 一起清理。
- `file://` 离线分发前先跑 `node scripts/export-static.mjs`；直接发 `dist/index.html` 会因外链 ES module 的 CORS 限制白屏。

---

## 文档索引

| 文档 | 用途 |
|------|------|
| `平台操作手册.md` | 交付客户的操作手册：模块操作、端到端业务流程、权限与状态规则、交付与离线分发 |
| `README.md` | 项目说明、技术栈、启动与离线导出、关键约定、已知问题 |
| `PAGE_MAP.md`（本文） | 页面 ↔ 文件 ↔ 路由 ↔ 数据来源速查 |
| `巡检业务平台原型交互评审-01.md` | 首轮交互评审（2026-09-23）＋ 落地回访核对 |
| `页面优化清单-01.md` | 逐页 UI/UX 优化清单（含优先级与排期建议） |

## 2026-09-28 共用模块

- 计划绑定：`PlanRobotBinding.tsx`；定时排程：`data/planSchedule.ts`、`data/automation.ts`。
- 临时任务：`QuickTaskDrawer.tsx`，任务列表、执行监控和调度共用。
- 现场控制：`FieldControls.tsx`、`data/fieldControl.ts`，人工遥控与调度驾驶舱共用。
- 告警：`AlarmConfiguration.tsx`、`SystemAlarmParameters.tsx`、`data/alarmRules.ts`。
- 地图展示：`MapSpatialPreview.tsx`，沿用既有点位身份与地图版本。

第二轮反馈：大屏 `CockpitScreen.tsx` 恢复组合完整 `MonitorCockpit.tsx` 与 `DispatchCockpit.tsx`；规则解释组件 `ResultRuleEvidence.tsx` 展示历史快照。

第三轮反馈：`DispatchFleetOverview.tsx` 提供平台机器人执行总览；`Supporting.tsx` 的点位列表内嵌规则抽屉，复用 `AlarmConfiguration`，不再独立展示规则页。

## 2026-09-29 调整

- 计划绑定机器人由原生下拉改为**卡片式能力对照**（`PlanRobotBinding.tsx`）：顶部先列模板需求（所需检测能力 / 服务区域 / 巡检点数），每台机器人一张卡片给出「具备 / 缺失 / 另有」能力标签、可绑定结论与不可绑定原因（区域不匹配时提示模板区域、能力不足时列出缺失项），选中后展示移动能力、执行前提与能力可用性。
- 新增 `data/robotCapabilities.ts` 作为能力可用性**唯一口径**（视觉 / 红外 / 气体 / 声音 / 导航 / 电池 / 通信 → 正常 / 未接入 / 低电量），机器人管理页「能力、组件与业务影响」与计划绑定页共用同一函数。
- `data/planSchedule.ts` 新增 `requiredKinds()`：模板所需检测能力集合，绑定校验与能力对照同源。
- 侧边栏收起「执行回溯记录」（`navigation.ts` 的 `hiddenIds`）：页面与内置页 `replay-detail` 保留，仍可从任务详情 / 设备档案 / 机器人 / 结果详情进入。
- 巡检计划表头长注释（「模板（注：…）」）改为表头下方副行小字（`th .th-note`），避免 `th` 的 nowrap 撑宽导致列挤压。
- 调度中心（`#/dispatch/workbench`）布局重构为**左资源列 + 右工作区**：页头显示当前调度对象（去掉与资源列重复的机器人下拉），平台态势 6 项独立成条；左栏 `DispatchFleetOverview.tsx` 由 6 列宽表改为**机器人资源卡片列**（区域 · 电量 · 地图版本 + 当前任务与阶段进度 + 待执行与预计可用 + 阻塞提示，选中卡片左侧主色条）；右栏为「当前任务 / 待执行队列（含**预计开始**时刻）/ 待安排与异常任务 / **未来 4 小时排程**」—— 排程独立成块（清单与时间轴拆开，避免两类视图叠在同一 panel），时间轴为 `compact` 紧凑版（56px 高、去空闲斜纹、图例只留三色语义），且队列「预计开始」与排程同源（同一份 `schedule()`）；窄屏回落单列。队列与待安排的「详情」改为**右侧抽屉**（`TaskPeekDrawer.tsx`：决策速览 + 「打开完整任务详情」跳内置页 `task-detail`，带回 `?from=dispatch`），避免跳页打断调度上下文。
- **浮层形态规范**：`UI.tsx` 的 `Modal` 新增 `drawer` / `drawerWidth`（右侧抽屉形态）与 `footer`（固定底栏：按钮不随内容滚动、也不浮在内容上）。新建 / 编辑计划（760px）、新建 / 编辑模板（700px）、配置编辑、地图导入向导（780px）、原始结果·来源任务（720px）、巡检结果报告（700px）、对象与检测项（860px）共 7 处由居中弹窗改为右侧抽屉；其中内容较长的 4 处（计划 / 模板 / 报告 / 对象与检测项）使用 `footer` 固定底栏。二次确认与轻量提示仍用居中弹窗；已手写 `.drawer-host` 的 3 处（规则编辑 / 临时任务 / 任务速览）迁移到新 prop。
- 任务列表「详情」由跳转内置页改为**右侧抽屉**：新增 `components/TaskDetailPanel.tsx` 承载任务详情内容（概要头 + 任务摘要 / 任务控制与版本约束 + 派单历史 + 检测项快照与结果）；`task-detail` 内置页与列表抽屉**共用同一实现**（`ObjectDetails.tsx` 的 task-detail 分支改为渲染该组件），避免口径漂移；面板内主操作跳转后抽屉自动关闭。
- 「人工操作与遥控」菜单由「机器人管理 › 机器人能力」移入**「巡检执行 › 执行」**（该子分组顺序：实时执行监控 → 人工操作与遥控），路由由 `#/robots/manual` 改为 `#/execution/manual`。页面实现仍在 `Operations.tsx`（`page="manual"`）；各处入口（调度中心 / 实时执行监控 / 驾驶舱驾驶舱的「人工接管」）按页面 ID 跳转，不受路径变化影响。
- 两个驾驶舱（`MonitorCockpit.tsx` / `DispatchCockpit.tsx`）**取消「驾驶舱工具条」独立一行**（`.cs-toolbar` 不再渲染），控件按语义归位：
  - `ScreenTopBar.tsx` 新增 `extra` 插槽渲染（此前**声明但未渲染**，导致"并入顶栏"的控件实际丢失）→ 顶栏右侧、时间之前渲染各舱控件；
  - 管理舱：厂区筛选（`.cs-nav-region`）+ 全屏图标（`.cs-nav-icon`）；调度舱：调度中心 + 全屏图标 + 紧急停止（`.screen-estop`，保留红色实底）；
  - 调度舱「对讲 / 声光 · R0x」→ 右栏「视频信息」卡头 `.cs-range` 按钮（禁用态见 `.cs-range button:disabled`）。
- 大屏版面竖向改为「顶栏（内容高度 `auto`）→ KPI 8% → 主体」，主体横向左 22% / 中 52% / 右 26%；调度舱栏内按比例切格（左 4 卡 36/22/14/28，右 3 卡 40/24/36），中栏为「地图 `minmax(0,1fr)` + 控制带 `auto`」（方向键盘不被压扁），视频双画面在格内平分高度；列表 `AutoScrollList` 不再传 `rows`，改由 `.auto-scroll.fill` 撑满格子。
- 大屏可读性（两舱通病"字太小"）：在 `.bigscreen` 内按层级**直接提升字号**（卡片标题 15px / 列表 13–14px / KPI 数字 26px / 按钮 13px / 表格 13px / 弹窗 13–16px 等，见 `styles.css`「大屏字号提升」段）。**只改字号、不动宽高**，因此不影响铺满与分格比例。
  > 曾尝试整屏缩放统一放大（`zoom` 或 `transform: scale` + `calc(100vw / zoom)`），但缩放与 `vw/vh`、宽高计算相互牵扯：实测内容只占大屏一部分、右侧留黑，已放弃。
- 大屏铺满：`.bigscreen { height: 100vh }` + `.bigscreen .cockpit-screen { height: 100% }`（不用 `dvh`，无头 / 嵌入预览下 `dvh` 与可视视口不一致会留一条空白）。
- 大屏内 `Modal` 统一**深色主题**（`.bigscreen .modal` 及其内 `panel-head / note / btn / segmented / badge / field-controls / input`）：弹窗本身是浅色主题，但大屏容器把文字色设为浅色并被继承，白底 + 浅色字导致「现场音视频控制」弹窗几乎不可读。
- 调度舱「云台控制」卡新增**镜头调控**（`.ds-lens`）：倍率 / 聚焦模式 / 补光读数 + 「变倍 −／变倍 ＋／手动·自动聚焦／近焦／远焦／补光开·关」6 键；直接走 `FIELD_COMMAND`，与 `data/fieldControl.ts` 的 `robot.fieldDevices` 同源，可用性口径一致（已接管 + 机型支持 + 在线）。
- **镜头调控去重**：此前「镜头」在大屏云台卡与「现场控制」弹窗各有一份。现按"同一台相机的控制放同一张卡"收敛——镜头全部归大屏「云台控制」卡；`FieldControls.tsx` 新增可选 `tabs` 参数（缺省仍是 音频 / 镜头 / 声光播报，后台「实时执行监控」页不受影响）；弹窗标题改为「现场对讲与声光」。
- **现场操作全部内联到控制带（4 块）**：`.ds-pads` 由 3 列改 4 列，新增第 4 块「**声光 · 语音**」（`.ds-cam` 网格：警笛 / 警灯 / 连接拾音 / 按住讲话 + 预录播报 `select` + 播放预录 / 停止输出），直接走 `FIELD_COMMAND`；`styles.css` 增补 `.ds-pads select { width: 100% }`。
- **调度舱不再有现场控制弹窗**：右栏「视频信息」卡头的弹窗入口移除，`FieldControls` 与 `fieldOpen` 状态一并从 `DispatchCockpit.tsx` 移除（后台「实时执行监控」仍用它）；声光 / 对讲 / 播报不再有两处入口。
- **「申请接管」改为就地弹窗**（新增 `components/TakeoverDialog.tsx`）：点「申请接管 / 接管会话」在本页**居中弹窗**走完 申请接管 → 暂停确认 → 人工遥控 → 退出 / 释放并恢复，**不跳** `#/execution/manual`；状态机 action 与 `Execution.tsx` 的 `ControlConsole` 完全一致（`TAKEOVER` / `CONTROL_ACK` / `CONTROL_EXIT` / `CONTROL_RELEASE` / `START`），差异只有两点：① 会话用**宽口径**查找（含「待暂停确认 / 退出核对中」，否则"确认机器人已暂停"入口出不来）② 恢复任务留在本页（`START`）而不跳执行监控。动作条在弹窗内容底部（`.modal-actions`）并随会话状态变化，另补「接管须知」要点。
  > 形态取舍：先做过右侧抽屉（`TakeoverDrawer.tsx`，已删）——大屏里抽屉的高度与底栏贴底依赖 `.modal-body` 的 flex 拉伸，在 `.cockpit-screen` 这个 grid 容器内不稳（实测底栏停在内容之后、下方留大片空白），故改回居中弹窗。
- `.bigscreen .ds-root .cs-alert`（曾把声光放在「当前设备」卡）已随控制带第 4 块落地而移除，避免同一能力两处入口。

## 客户第二次更新

| 页面 / 模块 | 实现 |
|---|---|
| 任务结果详情 `#/results/task-result/:id` | `ObjectDetails.tsx` → `ResultView.tsx` |
| 执行回溯详情 | `ReplayDetail.tsx`（双画面、路径、风险/事件） |
| 大屏自动播放 | `AutoScrollList.tsx` |
| 离线证据图 | `data/evidence.ts`（示意图） |
| 父级页签复用 | `PageTabs.tsx` |

## 2026-09-30 地图管理重构（列表 / 详情 / 工作台 / 下发）

| 变更 | 说明 |
|---|---|
| **地图管理只保留三件事** | 地图列表（区域/状态筛选 + 搜索 + 分页 + 「详情」）→ **地图详情内置页** →「**地图工作台**」「**地图下发**」两个右侧抽屉。原 5 个 Tab（上线工作台 / 建图与坐标 / 原始资料 / 变化管理）退为**兼容深链**（`?tab=` 仍可用），不在界面暴露 |
| 新增文件 | `pages/MapDetail.tsx`（内置页 `map-detail`，父页面 `maps`）；`components/MapWorkbench.tsx`；`components/MapDispatch.tsx` |
| 地图点位带来源 | `Candidate.source`（`地图导入` / `平台新增`）+ `Candidate.externalId`（地图自带的外部定位ID）；种子里的点位均为「地图导入」并带 `externalId` |
| 轨迹可视化 | `MapImageCanvas` 新增 `track` 折线覆盖层（与底图同一百分比坐标系，`vectorEffect` 保证线宽不随缩放变粗）；平台新增点位用琥珀色标记区分 |
| 内容变更即回「草稿」 | `ADD_TARGET` / `DISCARD_TARGET` / `TRACK_RECORD` 都会把地图打回草稿并写入版本历史（避免"已发布"名不副实） |
| 批量下发 | 新 action `SYNC_BATCH { mapId, robotIds[] }`；与单台 `SYNC` 共用 `pushSync` 校验；**存在区域不匹配设备则整批拒绝**，不产生半截状态 |
| 深链迁移 | 全平台 `go("maps", id, "sync")` → `go("map-detail", id, "sync")`；标注页「进入地图上线工作台 / 发布检查」→「地图工作台 / 地图详情」 |
| **单级定版（无试验 / 正式版）** | `MapAsset.state` 由 `草稿 \| 试验发布 \| 已发布` 收敛为 **`草稿 \| 已发布`**；`PUBLISH` 改为单级定版（不再要求点位全部已启用）；**`SYNC` / `SYNC_BATCH` 下发时自动定版**（新增 `publishMap` / `ensurePublished`）；详情页移除「发布版本」按钮；旧缓存里的 `试验发布` 在 `store.withSeedDefaults` 归一为 `已发布`；`MapOnboarding` 第 3 步文案改为「定版发布」 |

## 2026-09-30 工厂树与巡检目标台账（客户定稿模型第一步）

| 变更 | 说明 |
|---|---|
| **下线「路线管理」** | 菜单项 + 「路线与轨道」子分组 + 路由 `resources/routes` + `pages/Routes.tsx` **整体删除**（路线随地图带入）；`pages.length` 39 → **38** |
| **「巡检点列表」→「巡检目标台账」** | 沿用原菜单槽位与路由（`#/resources/points`），组件换成 `pages/BusinessTargets.tsx`；巡检点列表原退为内置页 `point-list`，**本轮已并入「巡检点管理」并删除该路由**，巡检点详情父级改为 `annotation` |
| **「点位标注与验证工作台」→「巡检点管理」** | `annotation` 菜单项改名，组件换成 `pages/InspectionPoints.tsx`（巡检点列表 +「＋ 添加巡检点」）；新增内置页 `point-edit`（`#/resources/points/edit`，名称 + 地图 + 地图点位 + 多个巡检项）与 `point-annotate`（`#/resources/points/annotate`，原 `Annotation.tsx` 降级为地图标注工作台，仍被地图上线工作台第 1 步内嵌）。**菜单项数与 `pages.length` 均不变（38）** |
| **巡检点 / 巡检项定形** | 新增 `InspectSpec`（巡检项 = 名称 + 业务目标 + 原子动作 + 云台参数），`Point.inspectItems[]`；任务指令集与「需要哪些采集方式」改为**以巡检项配置为准**（不再按 `p.kind` 硬编码推），引擎新增 `SAVE_POINT`（含一对一占用校验） |
| **告警只有一处入口** | `BusinessTarget` 增 `goal` / `require` / `alarm`（告警开关 · 等级 · 触发条件 · 通知）；`rulesOf()` 的默认来源改为**所绑业务目标**（阈值 + 等级 + 开关）。`SAVE_ALARM_RULE` 与 `s.alarmRules` 保留为历史规则版本，但**UI 入口全部收口**：巡检点详情不再内嵌 `AlarmConfiguration`，巡检点列表的规则查看改为**只读**并指向「巡检目标台账」 |
| **巡检点详情只读** | `ObjectDetails` 的 `point` 分支只保留「最近检测结果」（任务 / 时间 / 结果 / 判定 / 详情），删除「业务目标要求」面板与规则编辑器 |
| **Mock 地图定位ID点** | 示例地图除 11 个已被占用的定位ID（`O101`~`O111`）外，新增 12 个**空闲定位ID点**（`O201`~`O212`），「添加巡检点」可直接绑定 |
| **模板 / 临时任务收口到巡检点** | 巡检模板勾选表与临时任务抽屉的列与文案全部改为巡检点口径（巡检点 / 地图定位ID / 巡检项 / 机器操作内容），不再出现"业务目标 / 业务点位"字样 |
| **巡检结果查询按业务场景重排** | `Results.tsx`（`results`）：7 个平铺下拉 → **业务范围芯片（可点，计数与列表同源）+ 时间范围（今日/近7天/近30天/自定义）+ 区域 · 设备 + 关键词 + 更多筛选（任务/机器人/原始状态，默认收起）**；新增**按巡检点视角**（最近 3 条读数 + 点位详情），保留按任务视角。新增 `parseTime()` 供时间筛选与排序共用 |
| **告警事件：闭环可视化 + 去花哨** | 4 张彩色分级卡 + 分级图例 → **闭环阶段条**（全部/待确认/处理中/待复查/已恢复/已闭环，可点筛选）+ 一行闭环与分级口径说明；表格新增**闭环进度**（5 段点阵 + n/5）与**处置与工单**（工单号 · 状态 · SLA 剩余 · 责任人 / 复查任务 / 尚未派单）；等级改为**小圆点 + 文案**，行级只留左侧细边（删除整行渐变染色） |
| **工作台速览：分级逻辑修正** | 「分级告警信息」→「**告警与闭环**」：去掉无意义的第四档"其他"，3 档芯片**可点筛选且计数与列表同源**；修正口径矛盾（已恢复属未闭环、已关闭才闭环）；列表由取数组尾部改为**按真实时间倒序**取最近 5 条；补「未闭环 N · 近 7 天已闭环 N」与闭环链说明 |
| 新增数据集合 | `State.areas`（区域）/ `instruments`（仪表）/ `requirements`（巡检要求模板）/ `businessTargets`（巡检目标台账） |
| 种子派生（加层不改义） | 仪表 ← **已通过审核**设备的检测目标（13 台）；区域 ← 设备的厂区去重；业务目标 ← 仪表 + 按「采集方式 + 单位」映射的默认巡检要求（13 条），阈值走 `alarmRules.defaultRangeOfUnit`，与点位判定规则**同源** |
| 巡检要求模板库 | 看滴漏 / 看高温 / 看仪表读数 / 看外观破损 / 看气体浓度 / 看阀位状态 / 听异响；每条带默认算法（AI 表达方式）与判定方式（数值范围 / 期望状态 / 有无目标 / 等级评分） |
| 新 action | `ADD_BUSINESS_TARGET`（校验仪表在册且非停用、要求存在、算法必填、数值范围上下限有效、期望状态必填）、`UPDATE_BUSINESS_TARGET`（含 `inspect` 开关） |
| 「是否巡检」双向一致 | 过渡期约定：同一仪表下**只要有一条业务目标开着**，设备清单巡检项即为开（`syncInspectFlag`）；`SET_INSPECT_FLAG` 也会写回该仪表的全部业务目标 |
| 新增页面 | `pages/BusinessTargets.tsx`（KPI + 区域/设备/是否巡检筛选 + 分页 + 两步抽屉）；`deviceMaster.defaultRequirementOfInstrument` 为"仪表 → 默认巡检要求"的**唯一口径**（种子与页面共用） |
