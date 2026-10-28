import { useEffect, useState } from "react";
import { useStore } from "../data/store";
import { optimizePointOrder } from "../data/pointOrder";
import { go, usePageSize, useViewState } from "../data/navigation";
import {
  Btn,
  Badge,
  Drawer,
  Panel,
  Field,
  Switch,
  Table,
  Note,
  Modal,
  Confirm,
} from "../components/UI";
import { FilterPanel } from "../components/FilterPanel";
import { Pager } from "../components/Business";
import { QuickTaskDrawer } from "../components/QuickTaskDrawer";
import { PlanRobotBinding } from "../components/PlanRobotBinding";
import { TaskDetailPanel } from "../components/TaskDetailPanel";
import { PointPicker } from "../components/PointPicker";
import { RoutePreview } from "../components/RoutePreview";
import { MapBindPicker } from "../components/MapBindPicker";
import { useListDelete } from "../components/ListDelete";
import { RetryTaskModal } from "../components/RetryTaskModal";
import { fmtTime } from "../data/selectors";
import { actionsOfPoint, captureKindsOfPoint } from "../data/deviceMaster";
import { targetsOf } from "../data/mapCalibration";
import { constraints } from "../data/engine";
import {
  planKindOf,
  planMapBlockedOf,
  planOccurrences,
} from "../data/planSchedule";
import { routeMapIds, routeRenderMapId } from "../data/routeMaps";
import {
  planCycles,
  planKinds,
  planUnitMax,
  planUnits,
  routeModes,
} from "../data/types";
import type {
  MapAsset,
  Plan,
  PlanCycle,
  PlanKind,
  PlanUnit,
  Point,
  RouteMode,
  RouteNode,
  Task,
} from "../data/types";
/** 任务列表一行：真实任务，或「还没到下发时间」的计划占位行（置灰） */
type TaskListRow =
  | { kind: "task"; task: Task }
  | { kind: "pending"; plan: Plan; at: number };
/** 时间戳 → 北京时间「MM-DD HH:mm」，与排期口径一致 */
const mdhm = (ms: number) =>
  new Date(ms + 8 * 3600000).toISOString().slice(5, 16).replace("T", " ");
export function Planning({ page, id }: { page: string; id?: string }) {
  const { s, act } = useStore();
  const initial = s.plans.find((p) => p.id === id);
  const [templateId, TI] = useState(initial?.templateId || s.templates[0].id),
    [name, N] = useState(initial?.name || ""),
    [selected, SE] = useState<string[]>(s.templates[0].points),
    [tstate, TS] = useState<"启用" | "停用">("启用"),
    [pickQuery, PQ] = useState(""),
    [pickPage, PP] = useState(1),
    /** 执行方式：周期任务（按周期循环）/ 定时任务（指定日期执行一次） */
    [kind, KD] = useState<PlanKind>(initial?.kind || "周期任务"),
    [cycle, CY] = useState<PlanCycle>(initial?.cycle || "每天"),
    [start, ST] = useState(initial?.start || "2026-09-22"),
    [end, EN] = useState(initial?.end || "2026-12-31"),
    [time, TM] = useState(initial?.time || "10:00"),
    /** 周期任务新口径：间隔单位（天/时/分）+ 执行间隔 + 每日时段（开始 / 结束时间） */
    [unit, UN] = useState<PlanUnit>(initial?.unit || "天"),
    [interval, IV] = useState<number>(initial?.interval || 1),
    [fromTime, FT] = useState(initial?.fromTime || "08:00"),
    [toTime, TT] = useState(initial?.toTime || "18:00"),
    [query, Q] = useViewState("planning." + page + ".query", ""),
    [srcFilter, SF] = useViewState<string>("planning.tasks.srcFilter", "全部"),
    [statusFilter, STF] = useViewState<string>(
      "planning.tasks.statusFilter",
      "全部",
    ),
    [robotFilter, RF] = useViewState<string>(
      "planning.tasks.robotFilter",
      "全部",
    ),
    /**
     * TASK-02：时间范围筛选
     * @description 默认「全部」（实际回看 30 天）：默认只给「今日」会把昨天以前的任务藏起来，
     *              调度台/队列里看得到的任务在列表里找不到，数量就对不上
     */
    [timeRange, TR] = useViewState<string>("planning.tasks.timeRange2", "全部"),
    [srcPage, SP] = useState(1),
    /** 任务列表筛选面板展开态：条件默认收起，点「筛选」才显示 */
    [taskFilterOpen, SETTASKFILTEROPEN] = useState(false),
    /** TASK-04：派单（未分配任务选机器人一键派单） */
    [dispatchTask, setDispatchTask] = useState<Task>(),
    [dispatchRobot, setDispatchRobot] = useState(""),
    /** 超期补派：待确认的超期任务（确认后新建一条任务，原任务留档只读） */
    [retryTask, setRetryTask] = useState<Task>(),
    /** TASK-05：多选删除已下线——「取消」已能终止任务，同一件事只留一个入口 */
    /** 计划操作的二次确认：取消 / 开始 共用一个确认弹窗 */
    [confirm, setConfirm] = useState<{
      title: string;
      text: string;
      /** 影响运行态的动作套危险样式；路线 / 计划这类计划性配置用普通「确认」 */
      danger?: boolean;
      run: () => void;
    } | null>(null);
  /** 任务列表「详情」抽屉中的任务：就地查看完整详情，不打断列表上下文 */
  const [taskPeek, setTaskPeek] = useState<Task>();
  const [boundRobot, BR] = useState(initial?.robotId || "");
  const [advance, AD] = useState(initial?.advance || 15),
    [timeout, TO] = useState(initial?.timeout || 60),
    [wait, WA] = useState(initial?.wait || 30);
  /**
   * 预览底图（纯展示用，不落库）
   * @description 路线不绑定地图，地图只负责把巡检点和线路画出来；默认取首个点位所在的地图，
   *              可手动切到别的图查看，切图不影响已选点位与执行顺序
   */
  const [routeMapId, RM] = useState("");
  /**
   * 自建线路锚点
   * @description undefined = 预设路线（沿父线路网自动寻路）；数组 = 自建路线（自绘线路，
   *              不走父线，保存后为停用状态，须经机器导航验证可行才允许启用）
   */
  const [routePath, RP] = useState<RouteNode[] | undefined>(undefined);
  /** 路线行「导航」的目标：按点位反推的底图 + 路线 id（先选机器人，再进地图导航，兼作自建路线的验证入口） */
  const [navTarget, SETNAVTARGET] = useState<{
    map: MapAsset;
    id: string;
  } | null>(null);
  /** 待导航验证的路线 id（要跨到地图导航页，故随视图状态传递） */
  const [navRoute, SETNAVROUTE] = useViewState<string>("maps.navRoute", "");
  /** 任务列表每页条数：与全站列表口径一致（默认 5 条，可切 10 / 20） */
  const [taskPageSize, SETTASKSIZE] = usePageSize("planning.tasks.size");
  /** 巡检路线列表：页码 + 每页条数（与全站列表口径一致） */
  const [routePn, RPN] = useViewState("planning.routes.page", 1);
  const [routeSize, SETROUTESIZE] = usePageSize("planning.routes.size");
  /** 巡检计划列表：页码 + 每页条数（与全站列表口径一致） */
  const [planPn, PPN] = useViewState("planning.plans.page", 1);
  const [planSize, SETPLANSIZE] = usePageSize("planning.plans.size");
  /**
   * 巡检路线列表删除（通用组件）
   * @description 与「巡检目标台账」「设备台账」同一套交互：勾选列常驻 + 表头右侧批量删除 + 二次确认。
   *              被巡检计划引用的路线由引擎拦下（不删任何一条），避免出现"删一半"的中间态
   */
  const del = useListDelete({
    onDelete: (ids) => {
      const used = ids.find((id) => s.plans.some((p) => p.templateId === id));
      if (used !== undefined) {
        // 借引擎给出与单条删除一致的报错文案（弹窗不关闭，便于先去计划里解除引用）
        act({ type: "DELETE_TEMPLATE", id: used });
        return false;
      }
      ids.forEach((id) => act({ type: "DELETE_TEMPLATE", id }));
      return true;
    },
    batch: {
      pageIds: s.templates.map((t) => t.id),
      title: (n) => `删除 ${n} 条巡检路线`,
      nameOf: (id) => s.templates.find((t) => t.id === id)?.name || id,
    },
  });
  /** 路线编辑内置页：左栏（表单 + 巡检点）展开态（默认展开，点地图左缘竖槽收起给地图腾宽度） */
  const [sideOpen, SETSIDEOPEN] = useState(true);
  /** 巡检计划列表分页切片（页面内多个分支 return，切片统一在顶层算好） */
  const planPages = Math.max(1, Math.ceil(s.plans.length / planSize));
  const planCur = Math.min(Math.max(1, planPn), planPages);
  const planRows = s.plans.slice((planCur - 1) * planSize, planCur * planSize);
  /**
   * 当前是否处于「巡检路线编辑」上下文（templates 页）
   * @description 中栏列表的渲染回调里有一个同名局部变量 `page`（分页页码，number），
   *              会遮蔽 props 的 page；这里先把它收成布尔，避免在回调内比较出错
   */
  const routeLocked = page === "templates" || page === "route-edit";
  /**
   * 路线编辑内置页：进入时按目标路线载入表单（无 id 即新建，置默认值）
   * @description 只随 `page` / `id` 重载，编辑过程中的 store 更新不再覆盖正在填的表单
   */
  useEffect(() => {
    if (page !== "route-edit") return;
    const t = s.templates.find((x) => x.id === id);
    if (t) {
      N(t.name);
      SE(t.points);
      TS(t.state);
      RM(routeRenderMapId(s, t.points));
      RP(t.mode === "自建路线" ? t.path || [] : undefined);
      return;
    }
    N("");
    SE([]);
    TS("启用");
    RP(undefined);
    RM(
      s.maps.find((m) => s.points.some((p) => p.mapId === m.id))?.id ||
        s.maps[0]?.id ||
        "",
    );
  }, [page, id]);
  /**
   * 路线编辑：底图跟着巡检点走
   * @description 路线只记巡检点序列，底图纯展示；已选点（或自建线路吸附到的点）一变，
   *              就自动切到这些点所在的地图，不用再手动选图
   */
  const routeAutoMapSig =
    page === "route-edit"
      ? routeMapIds(
          s,
          routePath === undefined
            ? selected
            : (routePath.map((n) => n.pointId).filter(Boolean) as string[]),
        ).join("|")
      : "";
  useEffect(() => {
    if (!routeAutoMapSig) return;
    RM(routeAutoMapSig.split("|")[0]);
  }, [routeAutoMapSig]);
  /** 重置计划表单为默认值（新建时调用） */
  const resetPlanForm = () => {
    N("");
    BR("");
    TI(s.templates[0].id);
    KD("周期任务");
    CY("每天");
    TM("10:00");
    UN("天");
    IV(1);
    FT("08:00");
    TT("18:00");
    ST("2026-09-22");
    EN("2026-12-31");
    AD(15);
    TO(60);
    WA(30);
  };
  /** 加载已有计划到表单（编辑时调用） */
  const loadPlanForm = (pid: string) => {
    const p = s.plans.find((x) => x.id === pid);
    if (!p) return;
    N(p.name);
    BR(p.robotId || "");
    TI(p.templateId);
    // 执行方式走统一口径（老数据缺 kind 时按「周期任务」）
    KD(planKindOf(p));
    CY(p.cycle);
    TM(p.time);
    // 新口径计划带上间隔与时段；老计划回落默认值（保存时按新口径写入）
    UN(p.unit || "天");
    IV(p.interval || 1);
    FT(p.fromTime || p.time || "08:00");
    TT(p.toTime || "18:00");
    ST(p.start);
    EN(p.end);
    AD(p.advance);
    TO(p.timeout);
    WA(p.wait);
  };
  /**
   * 勾选 / 取消单个巡检点
   * @description 必须用函数式更新：目录树上的「整组全选」会连续调用本函数多次，
   *              若基于闭包里的 selected 计算，后一次会覆盖前一次 —— 表现为点了全选却只进去一个点
   */
  const toggle = (id: string) =>
    SE((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  /**
   * 调整已选巡检点顺序（数组顺序 = 机器狗跑子线的顺序）
   * @description 箭头与拖拽共用：把 from 位置的项摘出来插到 to 位置，其余项相对顺序不变
   */
  const reorder = (from: number, to: number) =>
    SE((prev) => {
      if (from === to || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved)/*  */;
      return next;
    });
  /** 巡检点选择器的筛选与分页（模板弹窗与临时任务共用同一数据源与口径） */
  const [pickStateF, PSF] = useViewState<string>("planning.picker.state", "全部");
  const [pickMapF, PMF] = useViewState<string>("planning.picker.map", "全部");
  // 每页条数：与全站列表口径一致（默认 5 条，可切 10 / 20）
  const [pickSize, SETPICKSIZE] = usePageSize("planning.picker.size");
  /** 目录树之外的前置筛选（搜索 / 状态 / 地图）：目录树二级结构在此结果上再裁剪 */
  const pickCandidates = s.points.filter(
    (p) =>
      (p.id + p.name + p.device).includes(pickQuery.trim()) &&
      (pickStateF === "全部" || p.state === pickStateF) &&
      (pickMapF === "全部" || p.mapId === pickMapF),
  );
  /**
   * 已配置巡检点勾选表（数据源 s.points 来自「巡检点管理」页，平台预先配置好）
   * 模板/临时任务**以巡检点为最小单位**勾选（不选业务目标：业务目标是巡检项内部的事）
   */
  const pickerTable = (cascade = false) => (
    <PointPicker
      points={pickCandidates}
      selected={selected}
      cascade={cascade}
      onToggle={toggle}
      onClear={() => SE([])}
      // 路线编辑需要顺序：机器狗按巡检点顺序跑子线
      onReorder={routeLocked ? reorder : undefined}
      // 最优排序：按父线（路网）节点次序重排，避免走回头路
      onOptimize={
        routeLocked
          ? () => SE(optimizePointOrder(s, selected, routeMapId))
          : undefined
      }
    >
      {(rows) => {
        // 目录树裁剪后重算页数：切节点 / 改筛选不会停在空页
        const page = Math.min(
          pickPage,
          Math.max(1, Math.ceil(rows.length / pickSize)),
        );
        const pageRows = rows.slice(
          (page - 1) * pickSize,
          page * pickSize,
        );
        return (
          <>
      <div className="filter-bar">
        <input
          aria-label="巡检点搜索"
          placeholder="搜索巡检点 / 编码 / 设备"
          value={pickQuery}
          onChange={(e) => {
            PQ(e.target.value);
            PP(1);
          }}
        />
        {/* 路线编辑不受地图限制：点位可按区域 / 地图自由筛选 */}
        {!routeLocked && (
          <select
            aria-label="按地图筛选"
            value={pickMapF}
            onChange={(e) => {
              PMF(e.target.value);
              PP(1);
            }}
          >
            <option value="全部">全部地图</option>
            {s.maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="按状态筛选"
          value={pickStateF}
          onChange={(e) => {
            PSF(e.target.value);
            PP(1);
          }}
        >
          {["全部", "已启用", "停用"].map(
            (x) => (
              <option key={x}>{x}</option>
            ),
          )}
        </select>
        <span>
          共 {rows.length} 个 · 已选 {selected.length} 个
        </span>
      </div>
      <Table
        heads={
          // 级联模式（内置页左栏）：只留「选择 + 巡检点名称」，其余信息在选择器里看
          cascade
            ? ["选择", "巡检点名称"]
            : [
                "选择",
                "巡检点名称",
                "地图 / 标定点",
                "巡检项",
                "机器操作内容",
                "覆盖设备",
                "状态",
              ]
        }
        rows={pageRows.map((p) => {
          const mp = targetsOf(s, p.mapId).find((t) => t.id === p.targetId);
          const specs = p.inspectItems || [];
          const cells = [
            <input
              type="checkbox"
              checked={selected.includes(p.id)}
              onChange={() => toggle(p.id)}
            />,
            <>
              <b>{p.name}</b>
              <small>
                {p.id} · {p.device}
              </small>
            </>,
            <>
              {s.maps.find((x) => x.id === p.mapId)?.name || p.mapId}
              <small>{mp?.externalId ? `定位ID ${mp.externalId}` : "无定位ID"}</small>
            </>,
            <>
              {specs.length} 项
              <small>{specs.map((sp) => sp.name).join(" / ") || p.item}</small>
            </>,
            <>
              {actionsOfPoint(s, p).join(" / ") || "—"}
              <small>{captureKindsOfPoint(s, p).join(" / ")}</small>
            </>,
            // TPL-01：覆盖设备可能多项 → 计数 + 明细展示（当前点位收敛到首个巡检项所属设备）
            <>
              {(() => {
                const devs = [
                  ...new Set(
                    specs
                      .map((sp) => {
                        const bt = s.businessTargets?.find(
                          (b) => b.id === sp.targetId,
                        );
                        const ins = bt
                          ? s.instruments?.find((i) => i.id === bt.instrumentId)
                          : undefined;
                        const dev = ins
                          ? s.devices?.find((d) => d.id === ins.deviceId)
                          : undefined;
                        return dev?.name;
                      })
                      .filter(Boolean) as string[],
                  ),
                ];
                const names = devs.length ? devs : [p.device];
                return (
                  <>
                    {names.length} 台<small>{names.join(" / ")}</small>
                  </>
                );
              })()}
            </>,
            <>
              <Badge>{p.state}</Badge>
            </>,
          ];
          return cascade ? cells.slice(0, 2) : cells;
        })}
      />
      <Pager
        page={page}
        count={rows.length}
        size={pickSize}
        onChange={PP}
        onSize={(n) => {
          SETPICKSIZE(n);
          PP(1);
        }}
      />
          </>
        );
      }}
    </PointPicker>
  );
  if (page === "quick")
    return (
      <QuickTaskDrawer
        inline
        onClose={() => go("tasks")}
        onCreated={(id) => go("dispatch", id)}
      />
    );
  if (page === "route-edit") {
    const editing = s.templates.find((x) => x.id === id);
    /** 是否自建路线（`routePath` 为数组即自建，undefined 为预设路线） */
    const customRoute = routePath !== undefined;
    /** 自建线路吸附到的巡检点数：至少 2 个才构成一段可执行路线 */
    const pathStopCount = (routePath || []).filter((n) => n.pointId).length;
    /**
     * 保存路线
     * @description 自建路线的执行点 = 自绘线路上吸附到的巡检点（按画线顺序）；
     *              预设路线沿用勾选顺序。自建路线由引擎落成「停用 + 待导航验证」
     */
    const saveRoute = () => {
      const pathSeq = (routePath || [])
        .map((n) => n.pointId)
        .filter(Boolean) as string[];
      if (
        act({
          type: "SAVE_TEMPLATE",
          id,
          name,
          points: customRoute ? pathSeq : selected,
          state: tstate,
          mode: customRoute ? "自建路线" : "预设路线",
          path: customRoute ? routePath : undefined,
          end: "返航",
        })
      )
        go("templates");
    };
    return (
      /* route-edit-page：整页等比缩放锁一屏，左栏（基础信息 / 巡检点）在栏内滚动，右栏地图吃满剩余高度 */
      <div className="route-edit-page">
        <div className="route-edit-head">
          <b>
            {editing
              ? `编辑路线 · ${editing.id} · v${editing.version}`
              : "新建巡检路线"}
          </b>
          <div className="actions">
            <Btn onClick={() => go("templates")}>取消</Btn>
            <Btn
              primary
              disabled={
                !name.trim() ||
                (customRoute
                  ? (routePath || []).length < 2 || pathStopCount < 2
                  : !selected.length)
              }
              onClick={saveRoute}
            >
              保存路线
            </Btn>
          </div>
        </div>
        {/* 左：基础信息 + 选择巡检点；右：地图展示与画线（默认两栏，可把左栏收起给地图腾宽度） */}
        <div className={"route-edit-grid" + (sideOpen ? "" : " collapsed")}>
          {/* 左栏表单：点地图左缘的竖槽把手可整体收起，收起后只有地图一栏 */}
          {sideOpen && (
            <div className="route-edit-col">
            <Panel title="基础信息">
              <div className="form-grid">
                <Field label="路线名称" required>
                  <input
                    value={name}
                    onChange={(e) => N(e.target.value)}
                    placeholder="输入路线名称"
                  />
                </Field>
                <Field label="路线方式" required>
                  <select
                    value={customRoute ? "自建路线" : "预设路线"}
                    onChange={(e) => {
                      // 切到自建路线 → 从空白线路开始画；切回预设路线 → 丢弃自绘线路
                      RP(e.target.value === "自建路线" ? [] : undefined);
                    }}
                  >
                    {routeModes.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </Field>
                <Field label="状态" required>
                  {customRoute ? (
                    <span className="badge amber">停用 · 待导航验证</span>
                  ) : (
                    <select
                      value={tstate}
                      onChange={(e) => TS(e.target.value as "启用" | "停用")}
                    >
                      <option>启用</option>
                      <option>停用</option>
                    </select>
                  )}
                </Field>
                <Field label="结束动作" required>
                  <input readOnly value="返航" />
                </Field>
              </div>
            </Panel>
            <Panel title="选择巡检点">{pickerTable(true)}</Panel>
            </div>
          )}
          {/*
            右：地图展示与画线（始终渲染）
            点地图左缘的竖槽把手 = 收起左侧表单，把整幅宽度让给地图（再点一次还原）；
            地图不参与折叠，所以不存在「收起后点不到」的空态
          */}
          <div className="re-map">
            <span
              className="re-fold"
              title={sideOpen ? "收起左侧表单，展开地图" : "展开左侧表单"}
              onClick={() => SETSIDEOPEN(!sideOpen)}
            />
            <div className="route-edit-col">
              <RoutePreview
                map={s.maps.find(
                  (m) => m.id === (routeMapId || routeRenderMapId(s, selected)),
                )}
                maps={s.maps}
                onMapChange={RM}
                stops={
                  selected
                    .map((pid) => s.points.find((p) => p.id === pid))
                    .filter(Boolean) as Point[]
                }
                path={routePath}
                onPathChange={(next) => RP(next)}
                height="100%"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (page === "templates") {
    /** 新建路线：跳「路线编辑」内置页（表单 + 巡检点选择 + 画线一屏放不下，原弹窗已改内置页） */
    const openNew = () => go("route-edit");
    /** 编辑路线：跳内置页并带上路线 id */
    const openEdit = (t: (typeof s.templates)[number]) =>
      go("route-edit", t.id);
    /** 打开「导航」选机器人：自建路线同时登记为待验证（导航页跑完一遍即可置为已验证） */
    const openNavigate = (t: (typeof s.templates)[number]) => {
      // 路线不绑定地图：按巡检点反推一张能画出它的底图
      const map = s.maps.find((m) => m.id === routeRenderMapId(s, t.points));
      if (!map) return;
      SETNAVROUTE(t.mode === "自建路线" && !t.verified ? t.id : "");
      SETNAVTARGET({ map, id: t.id });
    };
    // 分页切片：当前页一律 clamp 到有效范围
    const routePages = Math.max(1, Math.ceil(s.templates.length / routeSize));
    const routeCur = Math.min(Math.max(1, routePn), routePages);
    const routeRows = s.templates.slice(
      (routeCur - 1) * routeSize,
      routeCur * routeSize,
    );
    return (
      <>
        <Panel
          title="巡检路线"
          extra={
            <>
              <div className="actions">
                {/* 删除：复用列表删除组件，放在列表头右侧（勾选后批量删） */}
                {del.bar}
                <Btn primary onClick={openNew}>
                  ＋ 新建路线
                </Btn>
              </div>
            </>
          }
        >
          <Table
            heads={[
              del.head,
              "编号",
              "路线名称",
              "路线分类",
              "巡检点数",
              "更新时间",
              "状态",
              "操作",
            ]}
            rows={routeRows.map((t) => [
              del.cell(t.id, t.name),
              <span className="cell-muted">{t.id}</span>,
              <b>{t.name}</b>,
              // 路线分类：预设路线（沿已标定的固定路网）/ 自建路线（自绘线路）
              t.mode || "预设路线",
              `${t.points.length} 个`,
              <span className="cell-muted">{t.updatedAt || "—"}</span>,
              // 状态 = 开关：与地图 / 巡检点同一套交互，点一下先二次确认
              <>
                <Switch
                  checked={t.state === "启用"}
                  label={`${t.name} 启停状态`}
                  onChange={() =>
                    setConfirm({
                      title: t.state === "启用" ? "停用路线" : "启用路线",
                      text:
                        t.state === "启用"
                          ? `确认停用路线「${t.name}」？停用后将不再引用该路线生成任务。`
                          : `确认启用路线「${t.name}」？`,
                      run: () => act({ type: "TOGGLE_TEMPLATE_STATE", id: t.id }),
                    })
                  }
                />
                {t.mode === "自建路线" && (
                  <small className="cell-muted">
                    {t.verified
                      ? `已验证${t.verifiedBy ? " · " + t.verifiedBy : ""}`
                      : "待导航验证"}
                  </small>
                )}
              </>,
              <div className="actions">
                {/* 导航：选机器人后进入地图导航（与地图卡片的「导航」同一套逻辑）；
                    自建路线同时是它的导航验证入口 —— 实跑可行后才允许启用 */}
                <Btn
                  disabled={
                    !s.maps.some((m) =>
                      routeMapIds(s, t.points).includes(m.id),
                    )
                  }
                  onClick={() => openNavigate(t)}
                >
                  导航
                </Btn>
                <Btn onClick={() => openEdit(t)}>编辑</Btn>
              </div>,
            ])}
          />
          <Pager
            page={routeCur}
            count={s.templates.length}
            size={routeSize}
            onChange={RPN}
            onSize={(n) => {
              SETROUTESIZE(n);
              RPN(1);
            }}
          />
          {del.modal}
        </Panel>
        {/* 路线编辑（原弹窗）已改为内置页 `route-edit`：表单 + 巡检点选择在左，地图画线在右 */}

        {navTarget && (
          <MapBindPicker
            map={navTarget.map}
            onClose={() => SETNAVTARGET(null)}
            onAfter={(rid) => {
              const target = navTarget;
              SETNAVTARGET(null);
              // 走「路线导航」内置页：归属仍是「巡检路线」，不切到地图管理目录
              go("route-navigate", target.map.id, rid);
            }}
          />
        )}
        {confirm && (
          <Confirm
            title={confirm.title}
            message={confirm.text}
            confirmText="确认"
            danger={confirm.danger}
            onClose={() => setConfirm(null)}
            onConfirm={() => {
              confirm.run();
              setConfirm(null);
            }}
          />
        )}
      </>
    );
  }
  if (page === "plans")
    return (
      <>
        <Panel
          className="plans-panel"
          title="巡检计划 · 绑定机器人按时自动执行"
          extra={
            <Btn
              primary
              onClick={() => {
                resetPlanForm();
                go("plan-edit");
              }}
            >
              ＋ 新建计划
            </Btn>
          }
        >
          {/* PLAN-01：信息架构补「巡检规划（路线 / 频次）」一步；有效期须明确，避免"无限期"观感 */}
          <Table
            heads={[
              "编号",
              "计划名称",
              "任务类型",
              "巡检路线",
              "周期 / 时间",
              "执行机器人",
              "有效期",
              "状态",
              "操作",
            ]}
            rows={planRows.map((p) => {
              const k = planKindOf(p);
              /** 受阻：计划本身还在，但它依赖的地图被停用 / 停用中，到点也生成不出任务 */
              const block = planMapBlockedOf(s, p);
              return [
              // 编号 是任务 / 排程引用计划的主键，独立成列便于对账
              <span className="cell-muted">{p.id}</span>,
              p.name,
              k,
              s.templates.find((t) => t.id === p.templateId)?.name,
              // 定时任务没有周期：直接显示「执行日期 + 时刻」并标注一次性
              k === "定时任务"
                ? `${p.start} ${p.time}（一次）`
                : p.unit
                  ? `每 ${p.interval || 1} ${p.unit} · ${p.fromTime}-${p.toTime}`
                  : p.cycle === "每小时"
                    ? "每小时 · 整点"
                    : `${p.cycle} ${p.time}`,
              p.robotId || "待绑定",
              k === "定时任务"
                ? `${p.start} 当日一次`
                : `${p.start} 至 ${p.end}`,
              // 状态 = 开关：停用即停止后续自动生成，启用即恢复按时生成；受阻时并列一个标签
              <span className="actions">
                <Switch
                  checked={p.state === "启用"}
                  label={`${p.name} 启停状态`}
                  onChange={() =>
                    setConfirm({
                      title: p.state === "启用" ? "停用计划" : "启用计划",
                      text:
                        p.state === "启用"
                          ? `确认停用计划「${p.name}」？停用后该计划将不再生成新任务，已生成任务不受影响。`
                          : `确认启用计划「${p.name}」？将恢复按时自动生成任务。`,
                      run: () =>
                        act({
                          type: p.state === "启用" ? "STOP_PLAN" : "START_PLAN",
                          id: p.id,
                        }),
                    })
                  }
                />
                {block && (
                  <span title={block}>
                    <Badge tone="amber">受阻</Badge>
                  </span>
                )}
              </span>,
              <div className="actions">
                <Btn
                  onClick={() => {
                    loadPlanForm(p.id);
                    go("plan-edit", p.id);
                  }}
                >
                  编辑
                </Btn>
                {/* 受阻时给一跳转：直接去地图管理启用，不必自己猜是哪张图 */}
                {block && (
                  <Btn title={block} onClick={() => go("maps")}>
                    去处理
                  </Btn>
                )}
                <Btn
                  primary
                  disabled={p.state !== "启用"}
                  onClick={() => {
                    if (act({ type: "GENERATE", id: p.id })) go("tasks");
                  }}
                >
                  模拟当前时刻到点
                </Btn>
              </div>,
              ];
            })}
          />
          <Pager
            page={planCur}
            count={s.plans.length}
            size={planSize}
            onChange={PPN}
            onSize={(n) => {
              SETPLANSIZE(n);
              PPN(1);
            }}
          />
        </Panel>
        {confirm && (
          <Confirm
            title={confirm.title}
            message={confirm.text}
            confirmText="确认"
            danger={confirm.danger}
            onClose={() => setConfirm(null)}
            onConfirm={() => {
              confirm.run();
              setConfirm(null);
            }}
          />
        )}
      </>
    );
  if (page === "plan-edit")
    return (
      <>
        <Panel
          title={initial ? "编辑计划 · 新版本仅影响未来任务" : "新建巡检计划"}
          extra={
            <div className="actions">
              <Btn onClick={() => go("plans")}>取消</Btn>
              <Btn
                primary
                onClick={() => {
                  if (
                    act({
                      type: "SAVE_PLAN",
                      id: initial?.id,
                      name,
                      kind,
                      templateId,
                      robotId: boundRobot,
                      cycle,
                      unit,
                      interval,
                      fromTime,
                      toTime,
                      start,
                      end,
                      time,
                      advance,
                      timeout,
                      wait,
                    })
                  )
                    go("plans");
                }}
              >
                保存计划版本
              </Btn>
            </div>
          }
        >
          <div className="plan-form">
            <section className="form-section">
              <h4>基本信息</h4>
              <div className="form-grid">
                <Field label="计划名称" required>
                  <input value={name} onChange={(e) => N(e.target.value)} />
                </Field>
                <Field label="巡检路线" required>
                  <select
                    value={templateId}
                    onChange={(e) => TI(e.target.value)}
                  >
                    {s.templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · v{t.version}
                      </option>
                    ))}
                  </select>
                </Field>
                <PlanRobotBinding
                  value={boundRobot}
                  onChange={BR}
                  templateId={templateId}
                />
                <Field label="任务类型" required>
                  <select
                    value={kind}
                    onChange={(e) => KD(e.target.value as PlanKind)}
                  >
                    {planKinds.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </section>
            <section className="form-section">
              <h4>排程规则</h4>
              <div className="form-grid">
                {/* 周期任务：间隔单位（天/时/分）+ 执行间隔 + 每日执行时段；定时任务：开始日期 + 时间 */}
                {kind === "周期任务" ? (
                  <>
                    <Field label="间隔单位" required>
                      <select
                        value={unit}
                        onChange={(e) => UN(e.target.value as PlanUnit)}
                      >
                        {planUnits.map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label={`执行间隔 / ${unit}`} required>
                      <input
                        type="number"
                        min={1}
                        max={planUnitMax[unit]}
                        value={interval}
                        onChange={(e) => IV(+e.target.value)}
                      />
                    </Field>
                    <Field label="开始时间" required>
                      <input
                        type="time"
                        value={fromTime}
                        onChange={(e) => FT(e.target.value)}
                      />
                    </Field>
                    <Field label="结束时间" required>
                      <input
                        type="time"
                        value={toTime}
                        onChange={(e) => TT(e.target.value)}
                      />
                    </Field>
                    <Field label="有效期开始" required>
                      <input
                        type="date"
                        value={start}
                        onChange={(e) => ST(e.target.value)}
                      />
                    </Field>
                    <Field label="有效期结束" required>
                      <input
                        type="date"
                        value={end}
                        onChange={(e) => EN(e.target.value)}
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="开始日期" required>
                      <input
                        type="date"
                        value={start}
                        onChange={(e) => ST(e.target.value)}
                      />
                    </Field>
                    <Field label="开始时间" required>
                      <input
                        type="time"
                        value={time}
                        onChange={(e) => TM(e.target.value)}
                      />
                    </Field>
                  </>
                )}
              </div>
            </section>
            <section className="form-section">
              <h4>执行参数</h4>
              <div className="form-grid">
                <Field label="提前下发 / 分钟" required>
                  <input
                    type="number"
                    min={1}
                    value={advance}
                    onChange={(e) => AD(+e.target.value)}
                  />
                </Field>
                <Field label="执行超时 / 分钟" required>
                  <input
                    type="number"
                    min={1}
                    value={timeout}
                    onChange={(e) => TO(+e.target.value)}
                  />
                </Field>
                <Field label="允许等待 / 分钟" required>
                  <input
                    type="number"
                    min={1}
                    value={wait}
                    onChange={(e) => WA(+e.target.value)}
                  />
                </Field>
              </div>
            </section>
          </div>
          <Note>
            计划按北京时间自动生成、下发并执行；提前下发不提前启动。浏览器打开期间运行模拟时钟，异常进入调度中心。周期任务按「间隔单位 + 执行间隔」在每日时段内循环，超出有效期不再生成。<b>定时任务</b>只在「开始日期 + 开始时间」执行一次，错过不补跑。
          </Note>
        </Panel>
      </>
    );
  if (page === "quick")
    return (
      <>
        {pickerTable()}
        <Btn
          primary
          onClick={() => {
            if (
              act({
                type: "CREATE_TASK",
                name: name || "临时巡检",
                points: selected,
              })
            )
              go("dispatch");
          }}
        >
          进入调度
        </Btn>
      </>
    );
  const t = s.tasks.find((t) => t.id === id);
  /** 任务列表：搜索词 + 来源/状态/机器人三字段筛选 + 分页（每页条数走全站 usePageSize） */
  /** 从任务数据动态派生下拉选项，避免硬编码与种子数据不同步 */
  const sourceOpts = ["全部", ...new Set(s.tasks.map((x) => x.source))];
  /** 状态筛选：只留常用决策状态（完整状态仍由行内 Badge 表达，避免下拉过长） */
  const statusOpts = [
    "全部",
    "待下发",
    "待调度",
    "已分配",
    "超期",
    "暂停",
    "取消",
  ];
  const robotOpts = [
    "全部",
    "未分配",
    ...new Set(s.tasks.map((x) => x.robotId).filter(Boolean)),
  ];
  /**
   * 未来 24 小时内将要下发的计划任务（此刻还没生成任务）
   * @description 计划到点才由引擎生成任务；提前 24 小时先把这些时刻作为**置灰占位行**列进任务列表，
   *              调度员一个列表就能看到「接下来要干什么」，不必再单开一个「今日待生成」页
   */
  const upcomingRows = (() => {
    const now = Date.now();
    return s.plans
      .filter((p) => p.state === "启用")
      .flatMap((p) =>
        planOccurrences(p, now)
          .filter((at) => at > now && at - now <= 24 * 3600000)
          .filter(
            (at) =>
              !s.tasks.some(
                (t) => t.planId === p.id && t.scheduleKey === String(at),
              ),
          )
          .map((at) => ({ plan: p, at })),
      )
      .sort((a, b) => a.at - b.at);
  })();
  const allFiltered: TaskListRow[] = (() => {
    /** TASK-02：按所选时间范围过滤（生成时间 created）；「今日」= 当天；最大 30 天 */
    const now = Date.now();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const windowMs =
      timeRange === "今日"
        ? now - dayStart.getTime()
        : timeRange === "近 7 天"
          ? 7 * 864e5
          : timeRange === "近 30 天"
            ? 30 * 864e5
            : Infinity;
    const loMs =
      timeRange === "今日"
        ? dayStart.getTime()
        : now - Math.min(windowMs, 30 * 864e5);
    const inWindow = (t: (typeof s.tasks)[number]) => {
      const c = Date.parse(t.created);
      return Number.isNaN(c) ? true : c >= loMs && c <= now;
    };
    const taskRows: Extract<TaskListRow, { kind: "task" }>[] = s.tasks
      .filter((t) => {
        if ((t.name + t.id).includes(query) === false) return false;
        if (srcFilter !== "全部" && t.source !== srcFilter) return false;
        if (statusFilter !== "全部" && t.state !== statusFilter) return false;
        if (robotFilter !== "全部" && (t.robotId || "未分配") !== robotFilter)
          return false;
        if (!inWindow(t)) return false;
        return true;
      })
      .map((task) => ({ kind: "task" as const, task }));
    /** 预告行还没生成任务，按「计划生成 / 待下发」参与同一套筛选口径 */
    const pending: TaskListRow[] = upcomingRows
      .filter((x) => (x.plan.name + x.plan.id).includes(query))
      .filter((x) => srcFilter === "全部" || srcFilter === "计划生成")
      .filter((x) => statusFilter === "全部" || statusFilter === "待下发")
      .filter(
        (x) =>
          robotFilter === "全部" ||
          (x.plan.robotId || "未分配") === robotFilter,
      )
      .map((x) => ({ kind: "pending" as const, ...x }));
    /** TASK-02：未完成（待调度/已分配/下发中/待执行/执行中/暂停/…）置顶，已完成置后 */
    const TERMINAL = new Set(["完成", "部分完成", "失败", "取消", "超期"]);
    taskRows.sort((x, y) => {
      const adone = TERMINAL.has(x.task.state) ? 1 : 0;
      const bdone = TERMINAL.has(y.task.state) ? 1 : 0;
      if (adone !== bdone) return adone - bdone;
      return Date.parse(y.task.created) - Date.parse(x.task.created);
    });
    // 待下发的排最前：它们都是最近 24 小时内的事，比历史记录更该先看到
    return [...pending, ...taskRows];
  })();
  // 分页只算真实任务：预告行（计划有这一刻但还没生成）是常驻提示，不计入条数、也不参与翻页
  const pendingRows = allFiltered.filter((r) => r.kind === "pending");
  const allTasks = allFiltered.filter((r) => r.kind === "task");
  const pageMax = Math.max(1, Math.ceil(allTasks.length / taskPageSize));
  const curPage = Math.min(srcPage, pageMax);
  const pageRows = allTasks.slice(
    (curPage - 1) * taskPageSize,
    curPage * taskPageSize,
  );
  /** 表格实际渲染的行：预告行固定在最前，后面跟当页任务 */
  const tableRows: TaskListRow[] = [...pendingRows, ...pageRows];
  /** 筛选器统一切换回第一页 */
  const resetPage = () => SP(1);
  /** 生效中的筛选条件数：按钮上标出来，免得列表"莫名少了几条" */
  const activeFilters = [
    timeRange !== "全部",
    srcFilter !== "全部",
    statusFilter !== "全部",
    robotFilter !== "全部",
    !!query,
  ].filter(Boolean).length;
  /** 任务列表筛选：复用全站 FilterPanel（草稿条件，点「查询」才生效） */
  const [taskDraft, SETTASKDRAFT] = useState<Record<string, string>>({
    src: srcFilter,
    state: statusFilter,
    robot: robotFilter,
    range: timeRange,
    kw: query,
  });
  const applyTaskFilter = () => {
    SF(taskDraft.src);
    STF(taskDraft.state);
    RF(taskDraft.robot);
    TR(taskDraft.range);
    Q(taskDraft.kw);
    SP(1);
  };
  const resetTaskFilter = () => {
    const d = { src: "全部", state: "全部", robot: "全部", range: "全部", kw: "" };
    SETTASKDRAFT(d);
    SF(d.src);
    STF(d.state);
    RF(d.robot);
    TR(d.range);
    Q(d.kw);
    SP(1);
  };
  return (
    <>
      <Panel
        className="panel-filters-wrap"
        title="任务列表"
        extra={
          <div className="actions">
            <Btn onClick={() => SETTASKFILTEROPEN(!taskFilterOpen)}>
              {taskFilterOpen
                ? "收起筛选"
                : activeFilters
                  ? `筛选 · ${activeFilters}`
                  : "筛选"}
            </Btn>
            {/* 建临时任务要「左表单 + 右路线图」同屏，直接进内置页而不是盖一层浮层 */}
            <Btn primary onClick={() => go("quick")}>
              ＋ 临时巡检任务
            </Btn>
          </div>
        }
      >
        {/* TASK-01：任务生成规则说明；DSP-01：计划任务直接绑定机器人、临时任务走调度 */}
        {/* 筛选：条件收进「筛选」按钮，展开后复用全站 FilterPanel（草稿条件，点「查询」才生效） */}
        {taskFilterOpen && (
          <FilterPanel
            fields={[
              { key: "src", label: "来源", options: sourceOpts },
              { key: "state", label: "状态", options: statusOpts },
              { key: "robot", label: "机器人", options: robotOpts },
              {
                key: "range",
                label: "时间范围",
                options: ["全部", "今日", "近 7 天", "近 30 天"],
              },
              { key: "kw", label: "搜索任务", placeholder: "任务名称 / 编号" },
            ]}
            value={taskDraft}
            onChange={(n) => SETTASKDRAFT((p) => ({ ...p, ...n }))}
            onSearch={applyTaskFilter}
            onReset={resetTaskFilter}
          />
        )}
        <Table
          heads={["编号", "任务名称", "任务来源", "状态", "机器人", "时间", "操作"]}
          rowClass={(_, i) =>
            tableRows[i]?.kind === "pending" ? "row-pending" : ""
          }
          rows={tableRows.map((row) => {
            // 置灰占位行：计划里有这一刻的任务，但还没到下发时间
            if (row.kind === "pending") {
              const plan = row.plan;
              const robot =
                s.robots.find((x) => x.id === plan.robotId)?.name ||
                plan.robotId ||
                "待绑定";
              return [
                <span className="cell-muted">{plan.id}</span>,
                <>
                  <b>{plan.name}</b>
                  <small className="cell-muted">未生成</small>
                </>,
                "计划生成",
                <Badge>待下发</Badge>,
                robot,
                <>
                  <span>{mdhm(row.at)}</span>
                  <small className="cell-muted">未到下发时间</small>
                </>,
                <div className="actions">
                  <Btn onClick={() => go("plan-edit", plan.id)}>查看计划</Btn>
                </div>,
              ];
            }
            const t = row.task;
            return [
              // 编号 是结果 / 告警 / 快照引用的主键，独立成列便于对账
              <span className="cell-muted">{t.id}</span>,
              <>
                <b>{t.name}</b>
                {/* 补派溯源只标在「新任务」上；原任务的去向统一放在操作列，避免同一句话出现两次 */}
                {t.retryOf && (
                  <small className="cell-muted">补派自 {t.retryOf}</small>
                )}
              </>,
              t.source,
              <Badge>{t.state}</Badge>,
              t.robotId || "未分配",
              <>
                <span>{fmtTime(t.created)}</span>
                <small className="cell-muted">
                  {t.finishedAt
                    ? `结束 ${fmtTime(t.finishedAt)}`
                    : t.deadline
                      ? `要求 ${fmtTime(t.deadline)} 前完成`
                      : "尚未结束"}
                </small>
              </>,
              <div className="actions">
                {/* 行内只留高频入口：派单 / 新建补派；取消、撤回、暂停、恢复、终止统一进「详情」 */}
                {t.state === "待调度" && (
                  <Btn
                    primary
                    onClick={() => {
                      setDispatchTask(t);
                      setDispatchRobot(t.robotId || "");
                    }}
                  >
                    派单
                  </Btn>
                )}
                {/* 超期已留档、不再流转：要接着干只能基于快照新建补派任务 */}
                {t.state === "超期" &&
                  (t.retriedBy ? (
                    <span className="cell-muted">已补派 {t.retriedBy}</span>
                  ) : (
                    <Btn primary onClick={() => setRetryTask(t)}>
                      新建补派任务
                    </Btn>
                  ))}
                <Btn onClick={() => setTaskPeek(t)}>详情</Btn>
              </div>,
            ];
          })}
        />
        <Pager
          page={curPage}
          count={allTasks.length}
          size={taskPageSize}
          onChange={(n) => SP(n)}
          onSize={(n) => {
            SETTASKSIZE(n);
            SP(1);
          }}
        />
      </Panel>
      {t && (
        <Panel title={`${t.name} · 不可变任务快照`}>
          <Table
            heads={["点位", "目标身份", "检测要求", "地图版本"]}
            rows={t.items.map((p) => [
              p.name,
              p.targetId,
              p.requirement,
              `V${p.mapVersion}`,
            ])}
          />
          <p>
            计划版本：{t.planVersion || "—"} · 调度编号：
            {t.dispatchId || "未下发"} · 告警来源：{t.alarmId || "—"}
          </p>
          <Btn onClick={() => go("results", t.id)}>查看任务结果</Btn>
        </Panel>
      )}
      {/* 超期补派：确认后新建任务，原任务保持「超期」留档 */}
      {retryTask && (
        <RetryTaskModal
          task={retryTask}
          onClose={() => setRetryTask(undefined)}
        />
      )}
      {/* TASK-04：派单弹窗（按调度约束列出适配机器人，选其一即可一键派单） */}
      {dispatchTask && (
        <Modal
          title={`派单 · ${dispatchTask.name}`}
          wide
          onClose={() => setDispatchTask(undefined)}
          footer={
            <>
              <Btn onClick={() => setDispatchTask(undefined)}>取消</Btn>
              <Btn
                primary
                disabled={!dispatchRobot}
                onClick={() => {
                  if (
                    act({
                      type: "ASSIGN",
                      id: dispatchTask.id,
                      robotId: dispatchRobot,
                    })
                  )
                    setDispatchTask(undefined);
                }}
              >
                一键派单
              </Btn>
            </>
          }
        >
          <Table
            heads={["选择", "机器人", "状态", "适配校验"]}
            rows={s.robots.map((rb) => {
              // 与 ASSIGN 同源校验：地图版本待同步可在派单后同步，不作为拦截项
              const reasons = constraints(s, dispatchTask, rb).filter(
                (x) => x !== "地图版本待同步",
              );
              return [
                <input
                  type="radio"
                  name="dispatch-robot"
                  aria-label={`派单给 ${rb.id}`}
                  disabled={!!reasons.length}
                  checked={dispatchRobot === rb.id}
                  onChange={() => setDispatchRobot(rb.id)}
                />,
                <b>
                  {rb.id} · {rb.name}
                  <small>
                    电量 {rb.battery}% · V{rb.mapVersion}
                  </small>
                </b>,
                <Badge>{rb.state}</Badge>,
                reasons.length ? (
                  <Badge tone="red">{reasons.join("；")}</Badge>
                ) : (
                  <Badge tone="green">适配</Badge>
                ),
              ];
            })}
          />
        </Modal>
      )}
      {/* 任务详情抽屉：列表里就地看完整详情（与「任务详情」内置页共用 TaskDetailPanel），主操作由面板内按钮提供 */}
      {taskPeek && (
        <Drawer
          title={`任务详情 · ${taskPeek.id}`}
          subtitle={taskPeek.name}
          onClose={() => setTaskPeek(undefined)}
          footer={<Btn onClick={() => setTaskPeek(undefined)}>关闭</Btn>}
        >
          <TaskDetailPanel
            task={taskPeek}
            onAfterNav={() => setTaskPeek(undefined)}
          />
        </Drawer>
      )}
      {/* 操作二次确认（路线 / 计划启停、单条取消撤回）：全站共用同一个确认组件 */}
      {confirm && (
        <Confirm
          title={confirm.title}
          message={confirm.text}
          confirmText="确认"
          danger={confirm.danger}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            confirm.run();
            setConfirm(null);
          }}
        />
      )}
    </>
  );
}
