/**
 * @file MonitorCockpit.tsx
 * @description 管理驾驶舱（重构版）：**数字孪生场景 + 左右可折叠数据面板** 布局（参考「左右块折叠 / 展开」设计稿）。
 *   ① Header：左=系统名称 + 两舱切换，中=全局筛选（区域 / 时间），右=实时时间 + 系统状态指示灯；
 *   ② 综合总览：中央=厂区点云场景（MapCanvas）铺满主区 + 顶部悬浮 KPI 徽标；
 *      左栏（可折叠）= 基础数据 / 任务情况环形图 / 风险设备；
 *      右栏（可折叠）= 实时报警紧凑列表 / 报警排行 TOP10 / 告警趋势折线；
 *      左右栏以毛玻璃半透明卡片浮于场景之上，贴边箭头整体收起 / 展开，折叠后场景全屏；
 *   ③ KPI 以场景悬浮徽标呈现（原「运营管理」视图与切换入口已移除）。
 *   暗色主题：slate-950 底 / slate-900 卡片 / slate-800 边框，强调色 cyan-500 + red-500；图表统一用 Recharts。
 * @interaction 由 CockpitScreen 按 overview 渲染；指标口径取自 data/metrics.ts，历史趋势取自 data/metricHistory.ts；
 *              中央场景复用 components/MapCanvas.tsx（厂区点云画布）
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { scopedState } from "../data/metrics";
import { ScreenTopBar, type CockpitId } from "../components/ScreenTopBar";
import { MapCanvas } from "../components/MapCanvas";

/** 任务状态分布配色（与状态语义一一对应，用于环形图与图例） */
const TASK_COLORS = {
  执行中: "#06b6d4",
  已完成: "#22c55e",
  待调度: "#f59e0b",
  已终止: "#ef4444",
} as const;
/** 告警排行分段配色（青→蓝→紫→琥珀，低饱和） */
const RANK_COLORS = [
  "#06b6d4",
  "#38bdf8",
  "#6366f1",
  "#a855f7",
  "#f59e0b",
  "#14b8a6",
  "#f472b6",
  "#60a5fa",
  "#c084fc",
  "#facc15",
];
/** 告警等级加权分：一级 3 / 二级 2 / 三级 1 */
const LEVEL_W = { 一级: 3, 二级: 2, 三级: 1 } as const;
/** 风险等级 → 指示灯色 */
const RISK_DOT = { 高: "#ef4444", 中: "#f59e0b", 低: "#22c55e", "—": "#64748b" } as const;
const RISK_TEXT = { 高: "高", 中: "中", 低: "低", "—": "—" } as const;
const riskLevel = (score: number, hasUrgent = false): "高" | "中" | "低" | "—" => {
  if (score <= 0) return "—";
  if (hasUrgent || score >= 6) return "高";
  if (score >= 3) return "中";
  return "低";
};
/** 本地日期（YYYY-MM-DD） */
const localDay = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
/** 兼容 "YYYY-MM-DD HH:mm" 的时间解析（部分浏览器要求 T 分隔） */
const parseTime = (t: string) => Date.parse(t.replace(" ", "T"));
/** Recharts 统一 tooltip 皮肤（暗色卡片） */
const TOOLTIP_STYLE = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 8,
  fontSize: 12,
  color: "#e2e8f0",
} as const;
/** Recharts 统一坐标轴文字色 */
const AXIS_TICK = { fill: "#94a3b8", fontSize: 11 } as const;

type SmallRange = "今日" | "近7天" | "近30天";
const SMALL_RANGES: SmallRange[] = ["今日", "近7天", "近30天"];
type LargeRange = "近30天" | "半年" | "一年";
const LARGE_RANGES: LargeRange[] = ["近30天", "半年", "一年"];

export function MonitorCockpit({
  onSwitch,
}: {
  /** 独立大屏窗口内的驾驶舱切换 */
  onSwitch?: (id: CockpitId) => void;
}) {
  const { s } = useStore();
  /** 全局区域：固定全厂区（顶栏筛选器已按需求移除） */
  const region = "全部区域";
  /** 小粒度时间（任务情况 / 风险设备 / 报警排行） */
  const [sRange, SETS] = useState<SmallRange>("近7天");
  /** 实时报警独立时间筛选（不复用 sRange，避免影响其他卡） */
  const [aRange, SETA] = useState<SmallRange>("近7天");
  /** 大粒度时间（告警趋势） */
  const [lRange, SETL] = useState<LargeRange>("近30天");
  /** 实时时钟 */
  const [clock, SETCLOCK] = useState(() => new Date());
  const [fs, FS] = useState(false);
  /** 左右数据面板折叠状态（true=展开；折叠后中央场景全屏） */
  const [openL, OPENL] = useState(true);
  const [openR, OPENR] = useState(true);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => SETCLOCK(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const onFs = () => FS(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) shellRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  const sc = scopedState(s, region);
  const TODAY = localDay(clock);
  /** 实时报警独立时间范围起点（按今日 / 近7天 / 近30天） */
  const aRangeStart = useMemo(() => {
    if (aRange === "今日") return parseTime(TODAY + " 00:00");
    return Date.now() - (aRange === "近7天" ? 7 : 30) * 86400000;
  }, [aRange, TODAY]);
  /** 小粒度时间范围起点（用于任务情况 / 风险设备 / 报警排行） */
  const sRangeStart = useMemo(() => {
    if (sRange === "今日") return parseTime(TODAY + " 00:00");
    return Date.now() - (sRange === "近7天" ? 7 : 30) * 86400000;
  }, [sRange, TODAY]);
  /** 大粒度时间范围起点（用于告警趋势） */
  const lRangeStart = useMemo(() => {
    if (lRange === "近30天") return Date.now() - 30 * 86400000;
    if (lRange === "半年") return Date.now() - 182 * 86400000;
    return Date.now() - 365 * 86400000;
  }, [lRange]);
  /** 当前小粒度范围内的任务 */
  const tasksInRange = s.tasks.filter(
    (t) => {
      if (sRange === "今日") return (t.created || "").slice(0, 10) === TODAY;
      return Number.isFinite(parseTime(t.created)) && parseTime(t.created) >= sRangeStart;
    }
  );

  // ── KPI ──
  const todayTasks = s.tasks.filter((t) => t.created.slice(0, 10) === TODAY).length;
  const doneInRange = tasksInRange.filter((t) =>
    ["完成", "部分完成"].includes(t.state),
  ).length;
  const completeRate = tasksInRange.length
    ? Math.round((doneInRange / tasksInRange.length) * 100)
    : 0;
  const onlineRobots = sc.robots.filter((r) => r.state !== "离线").length;

  /** 实时报警：aRange 时间范围内 + 未处置 */
  const alarmsInARange = useMemo(() => {
    return sc.alarms.filter((a) => {
      if (a.handledAt) return false;
      if (aRange === "今日") return (a.time || "").slice(0, 10) === TODAY;
      const t = parseTime(a.time);
      return Number.isFinite(t) && t >= aRangeStart;
    });
  }, [sc.alarms, aRange, aRangeStart, TODAY]);

  // ── 实时报警 KPI：按级别 + 按分类聚合（不再逐条展示） ──
  const LV_ORDER = ["一级", "二级", "三级"] as const;
  const LEVEL_META: Record<string, { label: string; color: string; hint: string }> = {
    一级: { label: "一级 · 紧急", color: "#ef4444", hint: "需立即处置" },
    二级: { label: "二级 · 重要", color: "#f59e0b", hint: "需关注处理" },
    三级: { label: "三级 · 一般", color: "#22c55e", hint: "记录观察" },
  };
  const CATEGORY_META: Record<string, { label: string; color: string }> = {
    业务:   { label: "业务异常", color: "#06b6d4" },
    机器人: { label: "机器人",   color: "#a855f7" },
    设备:   { label: "设备故障", color: "#f97316" },
    环境:   { label: "环境异常", color: "#10b981" },
    安全:   { label: "安全隐患", color: "#ef4444" },
  };
  /** 未处置告警按级别分组 */
  const byLevel = useMemo(() => {
    const m: Record<string, number> = {};
    alarmsInARange.forEach((a) => (m[a.level] = (m[a.level] || 0) + 1));
    return LV_ORDER.map((lv) => ({ lv, count: m[lv] || 0 }));
  }, [alarmsInARange]);
  /** 未处置告警按分类分组（自动从数据里提取所有 category） */
  const byCategory = useMemo(() => {
    const m: Record<string, number> = {};
    alarmsInARange.forEach((a) => {
      const c = a.category || "其他";
      m[c] = (m[c] || 0) + 1;
    });
    // 按数量降序
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => ({ cat, count }));
  }, [alarmsInARange]);

  // ── 左·下：任务情况环形图 ──
  const taskDist = [
    { label: "执行中", value: tasksInRange.filter((t) => t.state === "执行中").length, color: TASK_COLORS.执行中 },
    { label: "已完成", value: tasksInRange.filter((t) => ["完成", "部分完成"].includes(t.state)).length, color: TASK_COLORS.已完成 },
    { label: "待调度", value: tasksInRange.filter((t) => ["待调度", "已分配", "下发中", "待执行"].includes(t.state)).length, color: TASK_COLORS.待调度 },
    { label: "已终止", value: tasksInRange.filter((t) => ["取消", "失败", "超期"].includes(t.state)).length, color: TASK_COLORS.已终止 },
  ];
  const taskTotal = tasksInRange.length;

  /** 判断时间字符串是否落在本月（YYYY-MM 前缀匹配） */
  const monthOf = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const THIS_MONTH = monthOf();
  /** 今日告警：总数 + 未处置 */
  const todayAlarms = sc.alarms.filter((a) => (a.time || "").slice(0, 10) === TODAY);
  const todayAlarmsOpen = todayAlarms.filter((a) => !a.handledAt);
  const thisMonthTasks = sc.tasks.filter((t) => (t.time || "").startsWith(THIS_MONTH));

  // ── 左·下：报警排行 TOP10（按点位聚合，横向条形图） ──
  const rank = useMemo(() => {
    const m = new Map<string, number>();
    sc.alarms
      .filter((a) => {
        if (sRange === "今日") return a.time.slice(0, 10) === TODAY;
        const t = parseTime(a.time);
        return Number.isFinite(t) && t >= sRangeStart;
      })
      .forEach((a) => m.set(a.pointId, (m.get(a.pointId) || 0) + 1));
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([pid, value], i) => ({
        name: s.points.find((p) => p.id === pid)?.name || pid,
        value,
        color: RANK_COLORS[i % RANK_COLORS.length],
      }));
  }, [sc.alarms, s.points, sRange, sRangeStart, TODAY]);

  // ── 右·上：风险设备（按被巡检设备聚合 + 状态呼吸灯） ──
  const riskDevices = useMemo(() => {
    const inRange = (t: string) =>
      sRange === "今日"
        ? t.slice(0, 10) === TODAY
        : Number.isFinite(parseTime(t)) && parseTime(t) >= sRangeStart;
    const m = new Map<
      string,
      { device: string; pointCount: number; alarmCount: number; score: number; urgent: number }
    >();
    sc.points.forEach((p) => {
      const dev = p.device || p.object || p.name;
      if (!dev) return;
      const cur = m.get(dev) || { device: dev, pointCount: 0, alarmCount: 0, score: 0, urgent: 0 };
      cur.pointCount += 1;
      m.set(dev, cur);
    });
    const scIds = new Set(sc.points.map((p) => p.id));
    sc.alarms
      .filter((a) => inRange(a.time) && scIds.has(a.pointId))
      .forEach((a) => {
        const p = s.points.find((x) => x.id === a.pointId);
        const dev = p?.device || p?.object || p?.name;
        const cur = dev ? m.get(dev) : undefined;
        if (!cur) return;
        cur.alarmCount += 1;
        cur.score += LEVEL_W[a.level as keyof typeof LEVEL_W] ?? 1;
        if (a.level === "一级") cur.urgent += 1;
      });
    return [...m.values()]
      .sort((a, b) => b.score - a.score || b.alarmCount - a.alarmCount || a.device.localeCompare(b.device))
      .map((x) => ({
        ...x,
        level: riskLevel(x.score, x.urgent > 0),
        pct: Math.round((x.score / Math.max(1, x.score)) * 100),
      }));
  }, [sc.points, sc.alarms, s.points, sRange, sRangeStart, TODAY]);
  const riskList = riskDevices.slice(0, 8);

  // ── 右·下：告警趋势（按真实时间聚合，无数据计 0、不插值） ──
  const lDays = lRange === "近30天" ? 30 : lRange === "半年" ? 182 : 365;
  const trendList = useMemo(() => {
    const out: { d: string; v: number }[] = [];
    for (let i = lDays - 1; i >= 0; i--) {
      const key = localDay(new Date(Date.now() - i * 86400000));
      out.push({ d: key.slice(5), v: sc.alarms.filter((a) => a.time.slice(0, 10) === key).length });
    }
    return out;
  }, [sc.alarms, lDays]);

  return (
    <div className="cockpit-screen mcp-screen" ref={shellRef}>
      {/* ── 顶部导航：两个驾驶舱共用同一个组件（卡片底 + 居中发光标题 + 带图标的导航 Tab） ──
          本舱自身控件（区域 / 时间筛选 + 系统状态灯 + 全屏）并入右侧，时间由统一顶栏渲染 */}
      <ScreenTopBar
        current="overview"
        onSwitch={onSwitch}
        extra={
          <>
            <button
              className="cs-nav-icon"
              title={fs ? "退出全屏" : "全屏展示"}
              onClick={toggleFullscreen}
            >
              {fs ? <Minimize size={15} /> : <Maximize size={15} />}
            </button>
          </>
        }
      />

      {/* ── 数字孪生场景 + 左右可折叠数据面板（参考「左右块折叠 / 展开」设计稿）──
          中央厂区点云场景铺满主区；左右栏毛玻璃卡片浮于场景上，
          贴边箭头整体收起 / 展开，折叠后场景全屏 */}
      <div className="mcp-main mcp-scene-wrap">
          {/* 中央场景：厂区点云画布（只读展示，不接遥控交互） */}
          <div className="mcp-scene">
            <MapCanvas
              points={sc.points}
              robots={sc.robots}
              chargers={s.chargers}
              rails={s.railSections}
              fit="xMidYMid slice"
            />
          </div>
          <div className="mcp-scene-tag">数字孪生场景 · {region}</div>

          {/* ══ 左栏：基础数据 / 任务情况 / 风险设备 ══ */}
          <aside className={"mcp-side mcp-side-l" + (openL ? "" : " folded")}>
            {/* 基础数据：巡检点 / 巡检机器人 / 本月告警 / 本月巡检 4 项 */}
            <section className="mcp-card">
              <div className="mcp-card-head">
                <h3>基础数据</h3>
                <small>{region} · 实时</small>
              </div>
              <ul className="mcp-base">
                <li>
                  <span>巡检点</span>
                  <b>{sc.points.length}</b>
                  <small>已启用 {sc.points.filter((p) => p.state === "已启用").length}</small>
                </li>
                <li>
                  <span>巡检机器人</span>
                  <b>{sc.robots.length}</b>
                  <small>在线 {onlineRobots}</small>
                </li>
                <li>
                  <span>今日告警</span>
                  <b className={todayAlarms.length ? "red" : ""}>{todayAlarms.length}</b>
                  <small>未处置 <b className="red">{todayAlarmsOpen.length}</b></small>
                </li>
                <li>
                  <span>本月巡检数</span>
                  <b>{thisMonthTasks.length}</b>
                  <small>{THIS_MONTH} · 已执行</small>
                </li>
              </ul>
            </section>

            {/* 任务情况环形图（左栏中部） */}
            <section className="mcp-card">
                <div className="mcp-card-head">
                  <h3>任务情况</h3>
                  <div className="mcp-range-chip" role="group" aria-label="任务情况时间">
                    {SMALL_RANGES.map((r) => (
                      <button key={r} className={sRange === r ? "on" : ""} onClick={() => SETS(r)}>{r}</button>
                    ))}
                  </div>
                  <small>· 共 {taskTotal} 个任务</small>
                </div>
                <div className="mcp-donut">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={taskDist}
                        dataKey="value"
                        nameKey="label"
                        innerRadius="62%"
                        outerRadius="88%"
                        paddingAngle={2}
                        stroke="none"
                        isAnimationActive={false}
                      >
                        {taskDist.map((d) => (
                          <Cell key={d.label} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: "#e2e8f0" }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mcp-donut-center">
                    <b>{taskTotal}</b>
                    <span>任务总数</span>
                  </div>
                </div>
                <ul className="mcp-legend">
                  {taskDist.map((d) => (
                    <li key={d.label}>
                      <i style={{ background: d.color }} />
                      {d.label}
                      <b>{d.value}</b>
                    </li>
                  ))}
                </ul>
            </section>

            {/* 风险设备（左栏收尾）：呼吸灯 + 等级徽标 */}
            <section className="mcp-card">
              <div className="mcp-card-head">
                <h3>风险设备</h3>
                <small>按被巡检设备聚合</small>
                <div className="mcp-range-chip" role="group" aria-label="风险设备时间">
                  {SMALL_RANGES.map((r) => (
                    <button key={r} className={sRange === r ? "on" : ""} onClick={() => SETS(r)}>{r}</button>
                  ))}
                </div>
              </div>
              <div className="mcp-risk-list">
                {riskList.map((x) => (
                  <div className="mcp-risk" key={x.device}>
                    <span
                      className={"mcp-breathe" + (x.level === "高" ? " is-bad" : x.level === "中" ? " is-warn" : "")}
                      style={{ background: RISK_DOT[x.level] }}
                    />
                    <div className="mcp-risk-main">
                      <b>{x.device}</b>
                      <small>
                        {x.pointCount} 个点位 · 告警 {x.alarmCount}
                        {x.urgent > 0 ? ` · 紧急 ${x.urgent}` : ""}
                      </small>
                    </div>
                    <span className={`mcp-risk-level lv-${x.level}`}>{RISK_TEXT[x.level]}</span>
                  </div>
                ))}
                {!riskList.length && <p className="mcp-empty">当前筛选下无被巡检设备。</p>}
              </div>
            </section>
          </aside>

          {/* ══ 右栏：实时报警 KPI / 报警排名 / 告警趋势 ══ */}
          <aside className={"mcp-side mcp-side-r" + (openR ? "" : " folded")}>
            {/* 实时报警：按级别 + 按分类 KPI 聚合，不再逐条列内容；独立时间筛选 */}
            <section className="mcp-card">
              <div className="mcp-card-head">
                <h3>实时报警</h3>
                <div className="mcp-range-chip" role="group" aria-label="实时报警时间">
                  {SMALL_RANGES.map((r) => (
                    <button key={r} className={aRange === r ? "on" : ""} onClick={() => SETA(r)}>{r}</button>
                  ))}
                </div>
                <small>· 未处置 {alarmsInARange.length}</small>
              </div>

              {/* ── 第一组：按告警级别（3 卡固定布局） ── */}
              <div className="mcp-alarm-group">
                <div className="mcp-alarm-group-title">按告警级别</div>
                <div className="mcp-alarm-kpi mcp-alarm-kpi-lv">
                  {byLevel.map(({ lv, count }) => {
                    const meta = LEVEL_META[lv]!;
                    return (
                      <div
                        key={lv}
                        className="mcp-kpi-cell"
                        style={{ borderLeftColor: meta.color }}
                      >
                        <div className="mcp-kpi-cell-label">
                          <span className="mcp-kpi-dot" style={{ background: meta.color }} />
                          {meta.label}
                        </div>
                        <div className="mcp-kpi-cell-num" style={{ color: meta.color }}>
                          {count}
                        </div>
                        <div className="mcp-kpi-cell-hint">{meta.hint}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── 第二组：按告警分类（2 卡自适应布局） ── */}
              <div className="mcp-alarm-group">
                <div className="mcp-alarm-group-title">按告警分类</div>
                {byCategory.length > 0 ? (
                  <div className="mcp-alarm-kpi">
                    {byCategory.map(({ cat, count }) => {
                      const meta = CATEGORY_META[cat] || { label: cat, color: "#64748b" };
                      return (
                        <div
                          key={cat}
                          className="mcp-kpi-cell"
                          style={{ borderLeftColor: meta.color }}
                        >
                          <div className="mcp-kpi-cell-label">
                            <span className="mcp-kpi-dot" style={{ background: meta.color }} />
                            {meta.label}
                          </div>
                          <div className="mcp-kpi-cell-num" style={{ color: meta.color }}>
                            {count}
                          </div>
                          <div className="mcp-kpi-cell-hint">占比 {alarmsInARange.length ? Math.round((count / alarmsInARange.length) * 100) : 0}%</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mcp-empty">{aRange}内无未处置报警。</p>
                )}
              </div>
            </section>

            <section className="mcp-card">
                <div className="mcp-card-head">
                  <h3>报警排行 TOP10</h3>
                  <small>按点位聚合</small>
                  <div className="mcp-range-chip" role="group" aria-label="报警排行时间">
                    {SMALL_RANGES.map((r) => (
                      <button key={r} className={sRange === r ? "on" : ""} onClick={() => SETS(r)}>{r}</button>
                    ))}
                  </div>
                </div>
                <div className="mcp-chart">
                  {rank.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={rank}
                        layout="vertical"
                        margin={{ top: 2, right: 28, bottom: 2, left: 4 }}
                      >
                        <CartesianGrid horizontal={false} stroke="#1e293b" />
                        <XAxis type="number" hide />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={132}
                          tick={AXIS_TICK}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          itemStyle={{ color: "#e2e8f0" }}
                          cursor={{ fill: "rgba(148,163,184,.08)" }}
                        />
                        <Bar dataKey="value" barSize={12} radius={[0, 4, 4, 0]} isAnimationActive={false} label={{ position: "right", fill: "#94a3b8", fontSize: 11 }}>
                          {rank.map((d) => (
                            <Cell key={d.name} fill={d.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="mcp-empty">暂无告警记录。</p>
                  )}
                </div>
              </section>

            {/* 告警趋势（右栏收尾） */}
            <section className="mcp-card">
              <div className="mcp-card-head">
                <h3>告警趋势</h3>
                <small>按真实时间聚合</small>
                <div className="mcp-range-chip" role="group" aria-label="告警趋势时间">
                  {LARGE_RANGES.map((r) => (
                    <button key={r} className={lRange === r ? "on" : ""} onClick={() => SETL(r)}>{r}</button>
                  ))}
                </div>
              </div>
              <div className="mcp-chart grow">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendList} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                    <CartesianGrid vertical={false} stroke="#1e293b" />
                    <XAxis dataKey="d" tick={AXIS_TICK} axisLine={{ stroke: "#1e293b" }} tickLine={false} />
                    <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={34} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: "#e2e8f0" }} />
                    <Line
                      type="monotone"
                      dataKey="v"
                      name="告警数"
                      stroke="#06b6d4"
                      strokeWidth={2}
                      dot={{ r: 2.5, fill: "#06b6d4" }}
                      activeDot={{ r: 4 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          </aside>

          {/* 折叠按钮：展开时贴在面板外侧，收起后回到屏幕边缘（场景全屏） */}
          <button
            className={"mcp-fold mcp-fold-l" + (openL ? " open" : "")}
            title={openL ? "收起左侧面板" : "展开左侧面板"}
            onClick={() => OPENL((v) => !v)}
          >
            {openL ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
          </button>
          <button
            className={"mcp-fold mcp-fold-r" + (openR ? " open" : "")}
            title={openR ? "收起右侧面板" : "展开右侧面板"}
            onClick={() => OPENR((v) => !v)}
          >
            {openR ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
      </div>
    </div>
  );
}
