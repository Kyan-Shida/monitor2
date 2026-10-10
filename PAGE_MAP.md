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
| `execution` | `#/execution/live` | `src/pages/ExecutionWorkbench.tsx`（`Execution.tsx` 再导出） | 实时执行监控：**执行总览 · 任务维度**（异常优先）；行内「监控」进入**内置页** `execution-monitor` |
| `manual` | `#/execution/manual` | `src/pages/Operations.tsx`（`page="manual"`） | **人工接管与遥控**（机器人选择器 + 内嵌 `ControlConsole`）；2026-09-29 由「机器人管理 › 机器人能力」移入「巡检执行 › 执行」，路由由 `#/robots/manual` 改为 `#/execution/manual` |
| `replay` | `#/execution/replay` | `src/pages/ObjectDetails.tsx`（`page="replay"`） | 执行回溯（主从列表）；**侧边栏已收起**（`hiddenIds`），仍可从任务详情主按钮进入；内置页 `replay-detail` 不受影响 |

> 说明：原独立页「远程操控台」(`control`) 已合并进「人工操作与遥控」(`manual`)，其路由与页面已删除；各处「接管 / 遥控台」入口统一跳 `manual`。

### 📊 结果与异常（一级中心）

| 页面 ID | 路由 URL | 组件文件 | 备注 |
|---------|---------|---------|------|
| `results` | `#/results/query` | `src/pages/Results.tsx`（`page="results"`） | 巡检结果（按任务分组可折叠 / 任务·机器·时间筛选） |
| `review` | `#/results/review/:id` | `src/pages/Results.tsx`（`page="review"`） | 结果详情 / 复核（含人工复核表单），父页面 `results` |
| `archive` | `#/results/equipment` | `src/pages/DeviceArchive.tsx` | 设备巡检档案，内部 5 个 tab |
| `alarms` | `#/alarms/events` | `src/pages/Results.tsx`（`Alarms` 导出，`page="alarms"`） | 告警管理（列表 + 处理 + 复检闭环） |
| `alarm` | `#/alarms/detail/:id` | `src/pages/Results.tsx`（`Alarms` 导出，`page="alarm"`） | 告警详情 / 复查（含处置工作台），父页面 `alarms` |
| `rules` | `#/alarms/rules` | `src/pages/AlarmConfiguration.tsx` | 巡检点列表行内规则抽屉；旧 rules 路由兼容进入点位列表 |

> 三个只读**内置页**见下文「隐藏的详情/下钻页」：`result-detail` / `alarm-detail` / `replay-detail`。

### 🗺️ 资源与地图（一级中心）

| 页面 ID | 路由 URL | 组件文件 | 备注 |
|---------|---------|---------|------|
| `equipment` | `#/resources/equipment` | `src/pages/DeviceMaster.tsx` | **设备主数据**（阶段③）：Excel 清单导入（模板 = 设备身份 3 列 + 检测项 3 列，同编码多行 = 多检测项）→ 启停 → 详情抽屉内维护检测项；设备是"巡检什么"的唯一来源，禁止由点位反推 |
| `points` | `#/resources/points` | `src/pages/BusinessTargets.tsx` | **巡检目标台账**：仪表（或区域 / 环境）+ 巡检要求 + 算法 + 告警规则；列表 + 两步抽屉（① 选检测目标 → ② 配业务逻辑与算法 = **左栏配置**：1 巡检要求 / 2 使用算法逻辑 / 3 告警规则，**右栏直接展示**配置结果）。第 3 段来源二选一：**手动输入**（本站定判定口径）或**选择现有模板**（口径由模板下发）。区域 / 环境类目标不关联设备台账，从**适用的巡检要求**进入（采集方式 / 判定 / 算法随要求带出，需填参照物锚点）。巡检项从这里选目标 |
| ~~`points-space`~~ | `#/resources/points-space` | `src/pages/BusinessTargets.tsx`（`tab="space"`） | **空间与区域目标（菜单项已删除，路由保留）**：复用「巡检目标台账」页并预置「空间与区域」筛选（`isSpaceTarget` = 非仪表 / 不关联设备）。区域 / 环境类目标的新建入口收口到「巡检目标台账」：筛选「空间与区域」看非装置类台账，新建走抽屉第一步的「区域（环境）」页签 |
| `annotation` | `#/resources/annotation` | `src/pages/InspectionPoints.tsx` | **巡检点管理**（原「点位标注与验证工作台」槽位）：已配置巡检点列表（地图/状态筛选 + 搜索 + 分页）+「**巡检点导入**」（`components/PointCalibration.tsx`，右侧抽屉：先选**数据来源机器人（机器狗）**，再「从机器人拉取数据」（接口未接入、不造假数据）/「上传表格文件」（CSV/TXT/JSON 解析 → 绑定地图或暂存））|
| `point-edit` | `#/resources/points/edit` | `src/pages/PointEdit.tsx` | **添加 / 编辑巡检点内置页**（父页面 `annotation`）：巡检点名称 + 地图 + 标定点（**定位ID = 来源绑定键**）+ 多个巡检项（名称 + 业务目标 + 原子动作 / 云台参数），逐项保存 |
| `point-annotate` | `#/resources/points/annotate` | `src/pages/Annotation.tsx` | **地图标注工作台内置页**（父页面 `annotation`）：候选目标 / 图面双击打点 / 试采与自主验证；仍被地图上线工作台第 1 步内嵌 |
| `maps` | `#/robots/maps` | `src/pages/Maps.tsx` | **地图管理（第一个模块）**：地图列表（区域/状态筛选 + 搜索 + 分页 + 「详情」）+「＋ 导入地图」（**只导入①点云地图文件**，不含定位ID与巡检点）；旧深链 `?tab=workflow/survey/archive/changes` 仍可进入（已不在界面暴露） |
| `map-detail` | `#/robots/maps/detail/:id` | `src/pages/MapDetail.tsx` | **地图详情内置页**（父页面 `maps`）：信息 / 空间版本 m / 版本历史 / 纯点云底图预览；**操作区只有一个按钮**——**地图下发**（`components/MapDispatch.tsx`：多选设备批量下发 + 回执）；`?tab=sync` 可直达抽屉，旧深链 `?tab=workbench` 提示标定已迁至巡检点管理。**本页不含任何定位ID / 标定点 / 巡检点**（`MapSpatialPreview` 只渲染纯点云底图；原「地图工作台」已下线，标定数据改由 `mapCalibration.ts` 独立存储） |

> 已删除：`objects`（设备 → 对象 → 检测项）独立页——能力已并入设备主数据；设备的检测项现由「设备清单」行内「详情」右侧抽屉承载；
> `routes`（路线管理，含「路线与轨道」子分组）——2026-09-30 删除，路线随地图带入。

### 🛠️ 后台管理（一级中心）

| 页面 ID | 路由 URL | 组件文件 | 备注 |
|---------|---------|---------|------|
| `admin` | `#/admin` | `src/pages/Admin.tsx` | **工厂基础数据**：区域 / 设备 / 仪表三块维护（区域是设备树分组与地图「区域」下拉的唯一来源）；工具栏右侧留「算法模板管理 →」入口 |
| `algo-templates` | `#/admin/algo-templates` | `src/pages/AlgoTemplates.tsx` | **算法模板管理**：平台 AI 能力（算法）清单的唯一维护入口 —— 算法编码 / 名称 / 部署位置 / 适配检测类型 / 关联台账 / 状态 + 新增·编辑·启停·删除；被巡检目标台账、快速新建台账、巡检点编辑按名称引用 |
| `alarm-templates` | `#/admin/alarm-templates` | `src/pages/AlarmTemplates.tsx` | **告警模板管理**：告警触发逻辑的唯一维护入口 —— 告警模板（模板名称 + 触发条件 + 触发逻辑 + 声光报警秒数 + 默认等级 + 处理流程）新增·修改·启停；检测类型含 压力 / 温度 / 气体浓度 / 阀门状态 / 位移 / 液位 / 声纹 / 不安全行为 / 外观（环境 / 区域类目标靠巡检要求的 `detectKind` 命中，同类型多模板按单位优先）；点位判定规则、巡检目标台账、告警处置页引用此处配置 |
| `requirements` | `#/admin/requirements` | `src/pages/Requirements.tsx` | **巡检要求管理**（2026-10-10 新增）：平台「**看什么、怎么判**」标准表达（模板库）的唯一维护入口 —— 列表（名称 / 分类 / 适用目标类型 / 采集方式·检测类型 / 判定口径 / 采集复核 / 版本·更新时间 / 被引用处数）+ 新增·修改弹窗（要求分类 / 适用目标类型多选 / 默认采集方式 / 检测类型 / 说明 / 算法·AI 表达方式 / 判定方式（数值范围需单位+上下限、期望状态需期望状态）/ 采集与复核 / 周期）。台账按目标类型与采集方式匹配到对应要求；保存即新版本，已落库台账保留当时快照。缓存迁移改为**按 id 合并**（仅补 seed 缺失项），不再整表覆盖，避免误删用户在后台新建的条目 |
| `payloads` | `#/admin/payloads` | `src/pages/RobotPayloads.tsx` | **机器人上装能力**（上装主数据）：上装编码 / 名称 / 采集方式 / 支持动作 / 适用机型 / 启停；机器人能力、任务指令集与派单校验按「上装 → 采集方式 → 原子动作」反查 |

### 🤖 机器人管理（一级中心）

| 页面 ID | 路由 URL | 组件文件 | 备注 |
|---------|---------|---------|------|
| `robots` | `#/robots/monitor` | `src/pages/Operations.tsx`（`page="robots"`） | 机器台账（列表） |
| `robot` | `#/robots/detail/:id` | `src/pages/Operations.tsx`（`page="robot"`） | 机器人运行监测，内部 3 个 tab（monitor/tasks/records） |
| `robot-new` | `#/robots/new` | `src/pages/RobotNew.tsx` | **新增机器人**（表单页）：编码（唯一）/ 名称 / 机型 / 区域 / 地图 / 采集能力 / 机型约束 / 固件；引擎 action `ADD_ROBOT`（2026-09-30 新增） |
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
| `execution-monitor` | `#/execution/monitor/:id` | `src/pages/ExecutionWorkbench.tsx`（`ExecutionMonitor`，`Execution.tsx` 再导出） | **现场态势（单任务监控）**：现场态势（巡检地图 · 当前业务点位 + 现场视频 · 机器人自主观测）+ 任务进度与控制（暂停 / 恢复 / 接管 / 终止 / 下发临时任务）+ 实时结果与检测项完成情况；执行总览行内「监控」及工作台 / 调度 / 结果 / 调度台 / 任务详情等入口进入；父页面 `execution` |

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
| `ExecutionWorkbench.tsx` | `execution` / `execution-monitor`（内置页） | 实时执行监控总览（`Execution`）+ 单任务现场态势（`ExecutionMonitor`，内置页） |
| `Execution.tsx` | — | 再导出 `Execution` / `ExecutionMonitor`；并导出 `ControlConsole`（人工接管与遥控控制台主体，内嵌于 `manual`） |
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
| `deviceProfile.ts` | 机型差异配置（机型 / 摘要 / 约束 / 差异 Tab / 图层 / 操控 / 告警 / KPI） |

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

- 计划绑定机器人由原生下拉改为**卡片式能力对照**（`PlanRobotBinding.tsx`）：顶部先列模板需求（所需检测能力 / 服务区域 / 巡检点数），每台机器人一张卡片给出「具备 / 缺失 / 另有」能力标签、可绑定结论与不可绑定原因（区域不匹配时提示模板区域、能力不足时列出缺失项），选中后展示执行前提与能力可用性。
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

## 2026-10-06 地图 / 巡检点分模块（MAP-02 V1.3：采集一趟、产出两件）

| 变更 | 说明 |
|---|---|
| **MAP-02 口径升级** | 由"页面流程顺序"升级为「**数据产出与模块边界**」：**采集一趟、产出两件**（① 点云地图文件 ② 巡检点标定文件）；**存储两份、上传两处**（地图归「地图管理」，标定文件归「巡检点管理」）；**模块两个、ID 一绑**（按定位 ID 绑定）。文案不再出现"第一步现场跑图、第二步现场标定" |
| **地图彻底去点位** | `MapAsset` 删除 `targets` 与 `pointSet`：地图只存纯点云底图与建图元信息，**不含任何定位ID与巡检点**；`IMPORT` 不再随文件带入点位 / 轨迹 |
| **标定数据独立成模块** | 新增 `data/mapCalibration.ts`：`MapCalibration`（`mapId` / `version` c{n} / `targets` / `file` / `importedAt`）+ `targetsOf` / `calibrationVersionOf` / `ensureCalibration` / `mergeCalibrationPoints` / `parsePointCalibration`（真实解析 CSV / TXT / JSON，解析不出即报错，不生成模拟数据） |
| **取消"巡航点"术语** | 全平台统一为两级口径：**标定点** = 地图位置 + 定位ID（仅时空信息）；**巡检点** = 名称 + 标定点 + 多个巡检项 |
| **版本口径解耦** | 地图只保留空间版本 m；`pointSet` 全面更名为 `calibrationVersion`（c）并改由标定数据提供；展示由 `m3 / p7` 改为 `m3 / c7` |
| **标定不再改地图** | `ADD_TARGET` / `ANNOTATE` / `SAVE_POINT` / `SAVE_MAP_CALIBRATION` 只推进标定版本，**不再把地图打回草稿**；只有地图修订（`CHANGE_REVISION`）才 `m++` 并回草稿 |
| **新 / 更名 action** | 新增 `IMPORT_POINT_CALIBRATION`（按定位 ID 合并 = **地图重传后重绑**）、`BIND_PENDING_CALIBRATION` / `DISCARD_PENDING_CALIBRATION`（标定文件先到可**暂存**）；`SAVE_MAP_TARGETS` 更名 `SAVE_MAP_CALIBRATION` |
| **新组件** | `components/PointCalibration.tsx`（原 `components/MapWorkbench.tsx` 下线）：导入标定文件 → 解析预览 → 绑定地图 / 暂存 → 底图核对与补录 |
| **地图管理收口** | 列表删除"定位ID / 轨迹 / 业务点位"列，改为纯点云内容与下发情况；详情只保留「地图下发」按钮与纯点云预览（`MapSpatialPreview` 传空标定点）；旧深链 `?tab=workbench` 提示标定已迁至巡检点管理 |
| **巡检点列表操作列** | 去掉行内「详情」按钮（保留「编辑巡检点」）；`point` 详情页路由保留，仍可由结果 / 执行 / 驾驶舱下钻进入 |
| **主键口径（对齐 DATA-01）** | 定位 ID 仅作**来源绑定键**，非业务主键；平台巡检点主键独立生成；统一坐标 XYZ + 姿态 + 上装参数为跨地图 / 跨版本定位依据；地图重传后按定位 ID 自动匹配，匹配不上按坐标辅助 + 人工确认重绑 |
| **测试** | 62 → **63** 项（新增 MAP-02 全链路：解析 → 导入绑定 → 重绑 → 暂存）；`map-management.test.ts` 旧"点位回草稿"断言改为"标定与地图版本解耦" |

## 2026-10-08 版本口径收敛：点位版本（c）全线下线

| 变更 | 说明 |
|---|---|
| **只保留地图空间版本 V** | 系统不再有「点位版本」概念：`Robot` / `Task` / `Snapshot` / `Sync` / `Change` 删除 `calibrationVersion`，`MapCalibration` 删除 `version`（c{n}），`Point` 删除 `version`（v{n}）；`data/versionLabel.ts` 只保留 `mapVer`（`verPair` / `calVer` 移除） |
| **版本校验收敛** | 地图下发与执行只校验 `mapId` + `mapVersion`；约束文案「地图/标定版本待同步」→「地图版本待同步」；机器人「地图与版本」面板只显示空间版本 V{n}；`metrics.ts` 的「版本待同步」口径只算地图版本 |
| **标定数据仍独立存储（无版本号）** | `data/mapCalibration.ts` 保留 `MapCalibration`（`mapId` / `targets` / `file` / `importedAt`）与 `targetsOf` / `ensureCalibration` / `mergeCalibrationPoints` / `parsePointCalibration`；删除 `calibrationVersionOf`，标定类 action（`ADD_TARGET` / `ANNOTATE` / `SAVE_POINT` / `IMPORT_POINT_CALIBRATION` / `BIND_PENDING_CALIBRATION`）不再 `c++`，标定改动依然不打回地图草稿、不改地图空间版本 |
| **老缓存兼容** | `store.withSeedDefaults` 只回填 `mapVersion`；老缓存里残留的 `calibrationVersion` 字段不再被读取（忽略即可，无需清缓存） |
| **展示口径** | 巡检点列表 / 编辑页 / 验证记录 / 任务快照视图 / 执行结果明细 / 排程与执行工作台 / 派单台 / 机器人能力页中的 `c{n}`、`v{n}`、「第 n 版」字样全部移除；「点位版本与验证记录」弹窗更名为「验证记录」 |
| **测试** | 全绿（65 项）：删除/改写 `engine.test.ts`、`map-management.test.ts`、`customer-revision.test.ts`、`capability-scope.test.ts` 中与点位版本相关的断言与夹具字段 |

## 2026-10-08 移动能力（mobility）整体下线

| 变更 | 说明 |
|---|---|
| **模型字段删除** | `types.ts` 删除 `MobilityCapability` 类型、`Robot.mobility`、`Task.requiredMobility`；`deviceProfile.ts` 删除 `DeviceProfile.mobility` 与 `hasMobility()`（三类机型的 mobility 清单同步移除） |
| **调度校验收敛** | 派单约束删除「移动能力不足（机型不匹配）」一项；`selectors.checks` 删除「移动能力」校验行；机器人可承接范围只由**采集能力 / 原子动作能力 / 区域 / 电量 / 轨道区段 / 地图版本**决定 |
| **界面删除** | `RobotNew.tsx` 删除「移动能力（决定任务可否下发到本机型）」勾选组及相关 state；机器人能力页「机型专项」表删除「移动能力」行；计划绑定机器人详情删除「移动能力」项 |
| **seed / 测试** | 机器人夹具删除 `mobility`、任务夹具删除 `requiredMobility`（T013 不再以"需爬楼"阻止四轮车改派）；`engine.test.ts` 改派断言保留「未确认先拒绝 → 确认后成功」语义 |
| **文档同步** | `PAGE_MAP.md` 与「平台操作手册」同步删除移动能力相关描述与派单拒绝原因项 |

## 2026-10-09 后台管理 › 机器人上装能力 + 字段下线（优先级 / 频次 / 是否巡检）

| 变更 | 说明 |
|---|---|
| **新增页面 `payloads`** | `pages/RobotPayloads.tsx`（后台管理 › 机器人上装能力）：上装编码 / 名称 / 采集方式 / 支持动作 / 适用机型 / 启停；动作只能属于其采集方式（`atomicActionCapability` 唯一决定），适用机型取自 `deviceProfile.deviceTypes`；新 action `ADD_ROBOT_PAYLOAD` / `UPDATE_ROBOT_PAYLOAD` / `SET_ROBOT_PAYLOAD_STATE` / `DELETE_ROBOT_PAYLOAD`，数据集合 `State.robotPayloads`（seed 提供示例上装），测试见 `robot-payload.test.ts` |
| **优先级下线** | `priority` 从界面整体移除：设备详情检测项表与新增 / 编辑表单、巡检目标台账列表与两步抽屉表单均不再出现；`InspectItem.priority` / `BusinessTarget.priority` 字段保留（种子与引擎同步逻辑不动），界面继续按下线处理（导入落默认「普通」） |
| **频次 / 巡检周期下线** | 巡检目标台账列表列与抽屉内「巡检频次」（含「每班 / 每日 / 每周 / 每月」选项）移除；设备台账「周期」列、检测项表单「周期」项、Excel 模板与导入预览的「巡检周期」列一并移除；`cycle` 字段保留，新增检测项落默认「每日」 |
| **是否巡检下线** | 巡检目标台账列表行内开关与工具栏「是否巡检」筛选、设备详情抽屉检测项开关、Excel 模板与预览的「是否巡检」列全部移除；巡检点管理的「已关闭巡检」、巡检项抽屉目标下拉的「（已关闭是否巡检）」文案同步删除；`inspect` 字段与引擎 action `SET_INSPECT_FLAG` 保留（任务指令集过滤与「覆盖率」口径仍读该字段，界面不再暴露开关） |
| **聚合口径随之收敛** | 设备台账 KPI「巡检项（开启）X/Y」→「巡检项 N」；详情抽屉「巡检项 X/Y 参与」→「巡检项 N 项」；巡检目标台账 KPI 去掉「参与巡检」 |
| **Excel 导入模板收敛** | 模板由 8 列收敛为 6 列：设备编码 / 设备名称 / 设备类型 / 检测目标 / 采集方式 / 单位；**同一设备编码可占多行**（一行一个检测项），导入按编码聚合、同目标去重；数值类检测目标必须带单位（`IMPORT_DEVICES` 校验不变） |
| **巡检结果报表导出口径** | 结果报表不再展示存在待复核项的任务（`isPending` 过滤到任务级）；**已确认异常允许导出**，仅「待复核」阻塞导出（`canExportOf` 只判 `isPending`） |
| **测试** | 全绿（68 项）：`device-master.test.ts` 的「本批次内重复编码报错」断言改为「同设备多行合并检测项」，新增上装能力用例 |

## 2026-10-09 后台管理 › 告警规则模板管理（可配置告警触发逻辑）+ 告警列表交互收敛

| 变更 | 说明 |
|---|---|
| **新增页面 `alarm-templates`** | `pages/AlarmTemplates.tsx`（后台管理 › 告警规则模板管理）：① 告警规则模板 = 名称 + 触发条件 + 处理流程（新增 / 修改 / 启停）；② 平台标准规则库 = 名称 + 级别 + 类型 + 阈值 + 触发条件；③ 引用位置说明。数据集合 `State.alarmTemplates` / `State.alarmRuleLib`（seed 提供 5 个模板 + 5 条规则），类型与工具见 `data/alarmTemplates.ts`，动作 `SAVE_ALARM_TEMPLATE` / `SAVE_ALARM_RULE_LIB`（仅管理员，保存即新版本），测试见 `alarm-template.test.ts` |
| **触发逻辑可配置（连续确认）** | 模板 / 规则的「触发条件」含 `mode`（单次即触发 / 连续确认）+ `consecutive`（连续 N 次）：引擎在生成告警前按同点位最近 N 条**同类异常**结果判门槛（风险异常与 AI 状态异常各自成链），未达门槛只留检测结果不派工单；`AlarmRule` 新增 `triggerMode` / `consecutive`，随结果快照留痕 |
| **其他页面引用** | ① 点位判定规则兜底分支（未绑巡检目标台账）按检测类型套用启用模板的触发条件、等级与触发逻辑（`rulesOf`，`AlarmRule.templateId` 记录引用）；② 「采集结果与告警规则」页新增只读「告警规则模板与规则库 · 引用自后台管理」，规则编辑弹窗可一键套用模板 / 规则库；③ 告警处置页新增「处置流程 · 引用告警规则模板」，按结果快照引用的模板展示步骤（机器人本体事件回落到级别处置建议） |
| **告警事件页：点击直进详情** | 告警编号与操作列「处理 / 查看」由弹窗改为直接跳转告警详情页；删除「告警详情」弹窗（其内容与详情页重复） |
| **告警事件页：列收敛** | 删除「告警阈值」列（阈值仍在处置页「风险信息 / 触发证据」中展示，且历史结果按快照口径） |
| **测试** | 全绿（71 项）：`engine.test.ts` 页数断言 38 → 39；新增 `alarm-template.test.ts`（模板引用一致性、版本与权限、连续确认触发门槛） |

## 2026-10-09 声光报警时长 + 反馈（复检）闭环 + 告警页收敛

| 变更 | 说明 |
|---|---|
| **模板新增「声光报警（秒）」** | `AlarmTemplate.alarmSeconds`（0 = 不启动声光报警）：模板表单新增数字项 + 说明、模板列表新增「声光报警」列；告警生成时随引用模板写入告警留痕（`引用模板 TPL-01：单次即触发 · 声光报警 10 秒`），处置页「处置流程」头部按同口径展示；seed 5 个模板分别配 10 / 5 / 15 / 10 / 8 秒 |
| **受理 → 反馈（复检）流程** | 新增 `Alarm.verify`（`VerifyFlow`：受理时间 / 步骤清单 / 状态 / 闭环时间 / 说明）与动作 `ALARM_VERIFY`：① **受理**时按结果快照引用的模板的处置流程落库为复检清单（无模板时回落该级别处置建议，保证清单非空），并写一条留痕；② **忽略**不进复检；③ 处置页新增「反馈（复检）· 基于处置流程」面板：逐条勾选完成情况（已完成记录时间）+ 复检说明（可选），**只有一个「保存反馈」动作**；④ 已闭环的复检只读，不可重复提交 |
| **闭环由系统判定（无人工判定按钮）** | 「保存反馈」后由引擎判定：**处置流程全部勾选完成 = 有效闭环**（闭环时间 = 保存时间，说明可选，缺省写「处置流程全部完成，系统判定有效闭环」）；**未全部完成 / 没反馈 = 仍为待反馈**，可继续补齐；**待反馈且距受理超过 30 天 = 无效闭环**（`selectors.VERIFY_DAYS = 30` + `verifyStateOf` 派生，不写回数据）。超期后引擎拒绝再提交反馈；列表「处理状态」列在受理/忽略徽标下补一行复检状态（待反馈剩 N 天 / 有效闭环 / 无效闭环） |
| **seed 演示数据** | AL007（受理、4 步完成 2 步 → 待反馈）、AL016（4 步全完成 → 有效闭环）、AL017（受理于 33 天前未闭环 → 自动无效闭环） |
| **页面收敛** | 「告警规则模板管理」删除「引用位置 · 改了会影响哪」面板（引用关系已写在规则行与处置页） |
| **测试** | 全绿（73 项）：`alarm-template.test.ts` 新增「受理进复检 / 未全完成不能判有效 / 保存进度 / 有效闭环且不可重复提交」「忽略不进复检、超 30 天派生无效闭环、有效闭环按记录值」「声光报警随告警留痕」用例 |

## 2026-10-09 菜单改名（巡检结果查询 → 巡检结果；告警事件 → 告警管理）

| 变更 | 说明 |
|---|---|
| **菜单名收敛** | `navigation.ts`：`results` 页面名「巡检结果查询」→「**巡检结果**」（二级分组「结果」不变）；`alarms` 页面名「告警事件」→「**告警管理**」（二级分组「告警与处理」不变）。页面 ID / 路由（`#/results/query`、`#/alarms/events`）与权限口径不变，旧深链照旧可用 |
| **同源文案同步** | 告警列表页内标题「告警事件」→「告警管理」；驾驶舱告警面板下钻按钮「告警事件 ›」→「告警管理 ›」；报表页「明细全部归『巡检结果查询』」→「巡检结果」 |

## 2026-10-09 告警处置页字段整理 + 复检块位置 + 列表列收敛

| 变更 | 说明 |
|---|---|
| **删除「现场处理记录」块** | 处置页「现场记录」面板只保留证据画面 + 采集时间；处理留痕在「处理情况」「反馈（复检）」与告警详情页（`alarm-detail` 的「处理记录」）查看 |
| **风险信息字段整理** | 去掉与页头重复的「告警等级 / 触发时间」；「触发值 + 最终值 + 识别结果」三行合并为**读数**（最终值，原始采集值不同才带出一行小字）；「告警阈值」仅在结果带规则快照时显示（不再出现空「—」行）；字段顺序改为 分类 → 状态 → 设备 → 点位/检测项 → 执行机器人 → 判定（AI 状态 / 风险信息 / 读数 / 阈值）→ 建议处置 |
| **来源任务弹窗字段整理** | 按「执行机器人 → 原子动作 → 关联来源 → 时间」排列；「关联计划 / 触发告警」无值时不占位；「开始 / 结束」拆为「开始时间 / 结束时间」并统一走 `fmtTime()` |
| **种子补规则快照** | `RES001` 改由 `result()` 生成（原手写对象缺 `ruleSnapshot`）→ AL001 的「告警阈值」不再是空值 |
| **复检块位置与出现时机** | 「反馈（复检）」仅在**受理后**出现（未处理 / 忽略不显示），并与「处理情况」同列堆叠（`alarm-col`），即出现在处理情况正下方；处理情况里选「受理」时就地提示「保存后自动进入复检流程」 |
| **告警列表列收敛** | 删除「区域」与「告警来源任务」两列（列数 11 → 9；来源任务仍可从处置页「来源任务」按钮查看） |

## 2026-10-09 术语统一（告警规则模板）+ 台账与后台打通 + 字段收敛

| 变更 | 说明 |
|---|---|
| **术语统一** | 「告警模板」全量改为「**告警规则模板**」（菜单「后台管理 › 告警规则模板管理」、页面标题 / 按钮 / 弹窗、处置页「处置流程 · 引用告警规则模板」、采集结果与告警规则页引用区块、代码注释与文档），源码中已无旧术语 |
| **修复两处误删** | 后台管理页的「告警规则库」表格与处置页的「处置流程 · 引用告警规则模板」面板在早前删除「引用位置」时被一并带掉，已恢复（`flowTpl` 不再是未使用变量） |
| **版本口径收敛** | 告警规则模板表与告警规则库表的「版本 / 状态」列改为「**状态 / 更新时间**」：去掉「第 N 版」，只留启用/停用 + 更新时间（版本仍在数据里留痕，保存即递增） |
| **处置页风险信息：触发来源** | 新增「**触发规则**」（规则 ID · 名称 · 第 N 版 · 触发逻辑，取自结果规则快照）与「**关联告警规则模板**」（模板名 · ID · N 步处置流程）；配合原有「告警阈值」形成完整链路：哪条规则 → 哪个模板 → 什么阈值 → 怎么处置 |
| **台账关联告警规则模板（打通）** | `BusinessAlarm.templateId` 新增；「巡检目标台账 › 告警设置」增「关联告警规则模板」下拉，选中即带出判定方式 / 阈值 / 单位 / 期望状态 / 告警等级 / 触发条件说明，并展示模板处置流程；`rulesOf` 判定优先用**台账关联的模板**（停用 / 删除时回落到按检测类型自动匹配）；seed 台账按检测类型带出默认关联 |
| **算法与判定口径引用后台** | 「算法 / AI 表达方式」由手输改为下拉，取值「后台管理 › 算法模板管理」启用清单（旧自由文本保留为一项，不丢值）——覆盖巡检目标台账、快速新建台账、巡检点编辑三处；判定方式 / 阈值处增「套用告警规则模板」一键带出 |

## 2026-10-09 后台管理 › 算法模板管理（从「工厂基础数据」拆出）

| 变更 | 说明 |
|---|---|
| **独立成页** | 新增页面 `algo-templates`（`#/admin/algo-templates`，`pages/AlgoTemplates.tsx`）：平台 AI 能力（算法）清单的唯一维护入口 —— 算法编码 / 名称 / 部署位置 / 适配检测类型 / 关联台账 / 状态 + 新增·编辑·启停·删除（删除带二次确认）；旧深链 `admin?tab=algo` 由 `App.tsx` 转发到本页，不失效 |
| **工厂基础数据收敛** | `Admin.tsx` 只剩 区域 / 设备 / 仪表 三块（Tab 4 → 3）；工具栏右侧加「算法模板管理 →」入口；算法表单、算法状态/删除动作从 Admin 迁出（引擎动作与数据集合 `State.algoConfigs` 不变） |
| **引用口径同步** | 目标台账 / 快速新建台账 / 巡检点编辑的「算法 / AI 表达方式（来源：后台管理 › 算法模板管理）」文案统一；`types.ts`、`store.tsx` 注释同步 |
| **测试** | 全绿（75 项）：`engine.test.ts` 页数断言 39 → 40 |

## 2026-10-09 巡检目标台账：第一步选检测目标改左中右三栏 + 字段修复

| 变更 | 说明 |
|---|---|
| **step① 三栏选择（左中右）** | 「添加 / 编辑巡检目标台账」第一步（设备类）由「区域下拉 + 设备下拉 + 宽表」改为三栏主从选择：**左** = 区域 › 设备树（复用 `DeviceTree`）、**中** = 该设备下的仪表列表（`pick` 行 + 关键词搜索，选中即带出默认巡检要求）、**右** = 已选检测目标摘要（区域 › 设备、采集方式 / 单位、已有目标条数）；复用平台既有的 `.pick-3col / .pick-main / .pick-picked / .pick` 样式与 `DeviceTree`。抽屉内的三栏导航与列表页筛选解耦（新增 `navKey / insKw` 抽屉内状态，不动 `bt.area / bt.device`） |
| **字段修复** | 该文件此前被编辑器缓冲区覆盖，丢了「业务目标 / 业务要求 / 判断标准补充说明 / 采集与复核要求」四个字段，且「算法 / AI 表达方式」来源文案回退为旧页名；已全部补回并统一为「来源：后台管理 › 算法模板管理」 |

## 2026-10-09 告警规则模板与规则库合并 + 巡检目标台账表单收敛

| 变更 | 说明 |
|---|---|
| **合并为一套「告警规则模板」** | 原「告警规则库」的字段（名称 / 级别 / 类型 / 阈值 / 触发条件）与模板完全重叠，故整体并入：删除 `State.alarmRuleLib`、`AlarmRuleItem`、`ruleLibOf()`、动作 `SAVE_ALARM_RULE_LIB`、seed 的 `ALARM_RULE_LIB`、后台管理页的「告警规则库」面板与规则编辑弹窗；`AlarmTemplates.tsx` 只剩一块「告警规则模板」表（触发条件 / 触发逻辑 / 声光报警 / 等级 / 处理流程 / 状态·更新时间） |
| **引用口径随之收敛** | 模板表的「被 N 条规则引用」→「**被引用 N 处**」（台账 `alarm.templateId` + 点位规则 `rule.templateId`，新增 `templateRefCountOf()`）；「采集结果与告警规则」页的引用区块只列模板（去掉标准规则表），规则编辑弹窗的「套用模板 / 规则库」→「**套用告警规则模板**」（只列启用模板） |
| **台账表单收敛（针对"是否合理"的整改）** | ① 删掉与「告警设置 › 关联告警规则模板」重复的「套用告警规则模板」（同一字段两处选择易误解）；② 「超限时产生告警」勾选框改为两态「**告警开关（告警 / 不告警）**」；③ 关联模板时「触发条件说明」**只读**（触发逻辑由模板统一下发），并就地提示"判定方式 / 阈值仅在「不关联」时按手填值判定" |
| **测试** | 全绿（75 项）：`alarm-template.test.ts` 的规则库断言改为「模板引用处数」断言 |
| **测试** | 全绿（75 项）：新增「台账关联告警规则模板：点位规则按关联模板判定（可换模板）」 |

## 2026-10-09 「告警开关」下线 + 台账「配业务」改三段（1 / 2 / 3）+ 触发逻辑措辞分条件

| 变更 | 说明 |
|---|---|
| **「告警开关」整体下线** | 平台口径 = **判定异常即告警**（不存在"告警开关 / 超限时告警"）：删除 `BusinessAlarm.on`（类型 / seed / 引擎 ADD·UPDATE / 台账表单 / 快速新建 / 检验用例），`rulesOf()` 的 `enabled` 只看 `bt.inspect !== false`；界面不再出现任何"告警开关"字样 |
| **台账第二步按草图收敛为三段** | 「配业务逻辑与算法」= **1 巡检要求**（下拉 + 说明）→ **2 使用算法逻辑**（下拉，来源后台算法模板）→ **3 告警规则**（下拉 = 关联后台告警模板，并回显生效模板的触发逻辑 / 模板默认等级 / 声光报警 / 处置流程 / 判定线）；配套样式 `.form-section` |
| **同批删除的手填项** | ① 业务目标 / 业务要求（改由引擎按「仪表或锚点 + 巡检要求 + 判定方式」自动生成，环境类不再强制手填目标）；② 采集与复核要求（拍照 / 录像 / 人工复核勾选；`needPhoto` 等字段仍随巡检要求带出，人工复核本已下线）；③ 判定方式 / 阈值 / 期望状态 / 判断标准补充说明 / 告警等级 / 触发条件说明（判定口径由告警模板下发） |
| **触发逻辑措辞按条件区分** | 「触发逻辑」= 判定命中后**什么时候**生成告警：`logicText()` 不再统一输出「单次即触发」，改为「**识别超限即触发**」（数值范围）/「**识别不符即触发**」（期望状态）/「连续 N 次识别超限确认」；模板编辑弹窗与「采集结果与告警规则」规则弹窗的下拉项改为「识别即触发（本次识别到异常就告警）/ 连续确认（连续 N 次异常才告警）」，模板弹窗就地给出口径解释 |
| **术语统一回「告警模板」** | 「告警规则模板」全量改回「**告警模板**」（菜单「后台管理 › 告警模板管理」、页面标题 / 按钮 / 弹窗、表头改「模板名称 / 适用检测类型」、处置页与引用区块文案、代码注释与文档） |
| **测试** | 全绿（75 项）：`business-target.test.ts` 去掉「关掉告警」用例，改为验证「关掉是否巡检 → 点位规则不再判定」 |

## 2026-10-09 台账「配业务」改左右两栏 + 告警规则支持「手动输入 / 选择现有模板」

| 变更 | 说明 |
|---|---|
| **左右两栏（左配右看）** | 「配业务逻辑与算法」= 左栏配置（`1 巡检要求` / `2 使用算法逻辑` / `3 告警规则`）+ 右栏 `配置结果 · 直接展示` 面板：把左栏配好的内容直接展示（巡检要求、**采集方式与单位**、算法、生效的触发条件 / 触发逻辑 / 等级 / 声光报警 / 处置流程），不再重复输入。右栏为**只读摘要**：分组卡（编号圆标 + 虚线分隔）+ 标签/值成对行 + 处置流程步骤；配色与圆角统一走 `--ent-*` 设计变量；窄屏（<1100px）自动单列 |
| **告警规则来源二选一** | 第 3 段增单选「**选择现有模板**（口径由模板下发，未指定 = 按检测类型自动套用）/ **手动输入**」。手动输入字段：触发条件（判定方式 + 阈值 / 期望状态）、触发逻辑（识别即触发 / 连续 N 次确认）、告警等级、声光报警秒数、处理流程（每行一步）；数据落到 `BusinessAlarm.source / triggerMode / consecutive / alarmSeconds / flow` |
| **判定口径按来源分流** | `rulesOf()` 台账分支：模板来源取模板的触发条件 / 触发逻辑 / 等级（台账显式设置为准，模板默认兜底）/ 声光报警 / 处置流程，`AlarmRule.templateId` 记引用；手动来源用台账自己的判定口径。老数据缺 `source` 时按「有模板 ID = 模板，否则手动」推断，行为不变 |
| **快照与下游贯通** | `AlarmRule` 增 `alarmSeconds` / `flow`（随结果快照带出）：受理进入复检时按「引用模板 → 快照流程 → 级别处置建议」取步骤；处置页「处置流程」面板按来源展示（模板 / 手动），告警留痕区分「引用模板 xxx」与「告警规则（手动输入）」；手动来源的「连续确认」至少 2 次（ADD / UPDATE 双侧校验） |
| **测试** | 全绿（**76 项**）：新增「告警规则来源二选一：选择现有模板 / 手动输入（手填口径落库并随快照带出）」 |

## 2026-10-09 环境 / 区域类目标接回主数据链路（巡检要求 → 算法 → 告警模板）

| 变更 | 说明 |
|---|---|
| **原问题** | 「添加巡检目标台账 › 区域（环境）」走的是页面内硬编码的 `ENV_KINDS` 列表：绕过「巡检要求」主数据（第 1 段空着、显示成第一条"看仪表读数"）、采集方式 / 单位成了 `— · —`、算法名不在「算法模板管理」清单里、告警模板只能按单位猜（无单位 → 阀门状态 → 命中「阀门状态异常告警」） |
| **巡检要求补三个字段** | `Requirement` 增 `targetKinds`（适用目标类型：仪表 / 环境 / 区域）、`capture`（默认采集方式：仪表类取仪表，环境 / 区域类由要求给出）、`detectKind`（检测类型，用于匹配告警模板——环境类没有量纲，不再靠单位猜） |
| **区域入口改走主数据** | 「区域（环境）」不再用 `ENV_KINDS`，直接列出**适用的巡检要求**（看高温 / 看区域气体浓度 / 听异响（声纹）/ 看 AI 不安全行为 / 环境拍照比对），点选即带出采集方式、判定方式、量程（要求声明的 ppm 0–50：`applyRequirement` 改为优先用要求声明的量程）、算法与依据；第 1 段下拉按目标类型过滤（仪表类不出现区域要求，反之亦然），选项里标注「适用 仪表 / 区域」；`PointEdit` 与快速补录的仪表台账同样只列仪表类要求 |
| **算法候选按巡检要求收敛** | 以该要求的默认算法在「算法模板管理」里的 `adapt`（算法族）为口径过滤候选，避免把「表计读数识别」配到区域声纹上 |
| **告警模板按检测类型匹配** | 新增 `kindOfTarget(s, requirementId, unit)`（要求声明优先、单位兜底）；`templateFor(s, kind, unit, preferredId)` 改按检测类型匹配，**同类型多模板时按单位优先**；`kindOfUnit` 补 `ppm → 气体浓度`；无单位的声纹 / AI 行为 / 外观不再误落到「阀门状态」 |
| **后台数据补齐** | 巡检要求：新增 `REQ-GAS-AREA`（看区域气体浓度 · ppm 0–50）/ `REQ-AI`（看 AI 不安全行为）/ `REQ-ENV-VIS`（环境拍照比对），原 7 条补 `targetKinds` / `capture` / `detectKind`；算法模板：新增「区域气体浓度判读 v1.0」「AI 不安全行为识别 v1.0」「可见光图像比对 v1.0」；告警模板：`APPLY_KINDS` 增「声纹 / 不安全行为 / 外观」，新增 `TPL-06` 区域可燃气体（ppm 0–50 · 一级 · 声光 30 秒）/ `TPL-07` 区域高温（℃ 0–120）/ `TPL-08` 声纹异常（连续确认 2 次）/ `TPL-09` AI 不安全行为 / `TPL-10` 外观异常。种子区域台账 `BT-ENV-GAS`（→ REQ-GAS-AREA + TPL-06）、`BT-ENV-IR`（→ TPL-07）同步 |
| **老缓存迁移（只补缺）** | `store.tsx` 新增判据：① `needReqMaster`（巡检要求缺 `targetKinds` / `capture` 或缺新增条目 → 整表用 seed 覆盖，该主数据无编辑入口）；② `needAlgoMaster` / `needTplMaster`（按 id 只补 seed 里新增的算法 / 告警模板，不覆盖后台已维护的条目）；③ `needEnvNorm`（区域示例台账 `BT-ENV-GAS` → `REQ-GAS-AREA` + `TPL-06`、`BT-ENV-IR` → `TPL-07`）；页面对缺字段的老数据也做了兼容（`targetKinds` 判空），避免旧缓存打开即白屏 |
| **测试** | 全绿（**77 项**）：新增「环境 / 区域类目标也走主数据：巡检要求 → 算法 → 告警模板（检测类型不再靠单位猜）」 |

## 2026-10-10 空间与区域：菜单项删除，入口收口到台账页

| 变更 | 说明 |
|---|---|
| **菜单项删除** | 「资源与地图 › 点位与对象 › **空间与区域目标**」按产品要求删除（`navigation.ts` 注释掉，保留说明）；路由 `#/resources/points-space` 与台账页 `tab="space"` 视图保留，页数回到 **40**（随后新增「巡检要求管理」→ **41**，`engine.test.ts` 断言同步） |
| **入口收口** | 区域 / 环境类目标仍从「巡检目标台账」走：列表筛选「空间与区域」看非装置类台账；新建走「＋ 添加巡检目标台账」→ 第一步「区域（环境）」页签 → 选适用巡检要求 → 填参照物锚点 |
| **两条新增路径（口径不同，别混）** | ① **设备下的区域类检测项**（罐壁 / 管廊 / 罐区等空间目标）：设备主数据 › 该设备「详情」› 检测项 › 新增/编辑，**分类选「区域」**（检测目标写 罐壁/管廊 也会自动判为区域）→ 系统按检测项派生台账（`targetKind` 随检测项）；② **不挂设备的纯环境 / 区域目标**（罐区气体 / 区域红外 / 声纹 / AI 行为 / 环境拍照）：空间与区域目标 › ＋ 添加巡检目标台账 › 「区域（环境）」选适用巡检要求 → 填参照物锚点 |

## 2026-10-10 新增「巡检要求管理」后台页

| 变更 | 说明 |
|---|---|
| **新增页面 `requirements`** | `pages/Requirements.tsx`（后台管理 › 巡检要求管理）：平台「**看什么、怎么判**」标准表达（模板库）的唯一维护入口。列表展示 名称 / 分类 / 适用目标类型（仪表·环境·区域多选）/ 采集方式·检测类型（APPLY_KINDS）/ 判定口径（数值范围区间 / 期望状态）/ 采集与复核（拍照·录像·人工复核）/ 版本·更新时间 / 被引用处数；新增·修改弹窗含 要求分类 / 适用目标类型多选 / 默认采集方式 / 检测类型 / 说明 / 算法·AI 表达方式 / 判定方式（数值范围需单位+上下限、期望状态需期望状态）/ 采集与复核 / 周期 |
| **引擎动作 `SAVE_REQUIREMENT`** | 仅管理员可维护；保存即 `version` 自增并写 `updatedAt`；新条目自动生成 `REQ-` 前缀 id；校验 名称 / 要求分类 / 适用目标类型 / 采集方式 / 算法 / 判定方式（数值范围需合法单位与上下限、期望状态需期望状态）。被引用的台账保留当时快照，不会回溯改写 |
| **台账匹配口径不变** | 巡检目标台账按 `Requirement.targetKinds`（仪表 / 环境 / 区域）过滤候选要求，按 `capture` / `detectKind` 匹配算法与告警模板——本页是这些主数据的唯一编辑入口（此前仅 seed） |
| **缓存迁移改为按 id 合并** | `store.tsx` 的 `needReqMaster` 由「整表用 seed 覆盖」改为「仅补 seed 里缺失的新增项（如 REQ-GAS-AREA）」；`requirements` 合并逻辑与算法 / 告警模板一致，**保留用户在后台新建 / 修改的条目**，避免误删 |
| **入口与路由** | 侧边栏「后台管理 › 巡检要求管理」（`navigation.ts` 菜单 + `paths` + `App.tsx` 路由）；「工厂基础数据」(`Admin.tsx`) 工具栏新增「巡检要求管理 →」快捷入口；页面数 40 → **41**（`engine.test.ts` 断言同步） |
| **测试** | 全绿（**78 项**）：新增 `SAVE_REQUIREMENT` 用例（角色校验 / 判定口径校验 / 保存生成 REQ- id 且版本自增） |
