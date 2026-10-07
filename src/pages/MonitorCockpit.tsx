/**
 * @file MonitorCockpit.tsx
 * @description 管理驾驶舱（重构版）：**顶部概览 + 底部双栏（70/30）** 网格布局，不再使用左中右三栏。
 *   ① Header：左=系统名称 + 两舱切换，中=全局筛选（区域 / 时间），右=实时时间 + 系统状态指示灯；
 *   ② 全局 KPI：一排 4 个扁平大数字卡片（今日巡检 / 未处理报警 / 任务完成率 / 在线设备）；
 *   ③ 左侧主工作区（70%）：上=**实时报警数据表格**（可滚动 · 按等级红橙底色区分）、
 *      下=任务情况环形图(40%) + 报警排行 TOP10 横向条形图(60%)；
 *   ④ 右侧辅助监控区（30%）：上=风险设备紧凑卡片（状态呼吸灯）、下=告警趋势折线图（延伸高度）。
 *   暗色主题：slate-950 底 / slate-900 卡片 / slate-800 边框，强调色 cyan-500 + red-500；图表统一用 Recharts。
 * @interaction 由 CockpitScreen 按 overview 渲染；指标口径取自 data/metrics.ts，历史趋势取自 data/metricHistory.ts
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, MapPin, Maximize, Minimize, TriangleAlert } from "lucide-react";
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
/** 告警等级加权分：紧急 3 / 重要 2 / 一般 1 */
const LEVEL_W = { 紧急: 3, 重要: 2, 一般: 1 } as const;
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

type RangeKey = "今日" | "近7天" | "近30天" | "全部";
const RANGES: RangeKey[] = ["今日", "近7天", "近30天", "全部"];

export function MonitorCockpit({
  onSwitch,
}: {
  /** 独立大屏窗口内的驾驶舱切换 */
  onSwitch?: (id: CockpitId) => void;
}) {
  const { s } = useStore();
  /** 全局筛选：区域 / 时间（头部筛选器，牵引全屏口径） */
  const [region, SETR] = useState("全部区域");
  const [range, SETRANGE] = useState<RangeKey>("近7天");
  /** 实时时钟 */
  const [clock, SETCLOCK] = useState(() => new Date());
  const [view, SETVIEW] = useState<"综合总览" | "运营管理">("综合总览");
  const [fs, FS] = useState(false);
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
  /** 时间范围起点 */
  const rangeStart = useMemo(() => {
    if (range === "全部") return 0;
    if (range === "今日") return parseTime(TODAY + " 00:00");
    return Date.now() - (range === "近7天" ? 7 : 30) * 86400000;
  }, [range, TODAY]);
  const tasksInRange = s.tasks.filter(
    (t) =>
      range === "全部" ||
      (Number.isFinite(parseTime(t.created)) && parseTime(t.created) >= rangeStart),
  );

  // ── KPI ──
  const todayTasks = s.tasks.filter((t) => t.created.slice(0, 10) === TODAY).length;
  const openAlarms = sc.alarms.filter((a) => a.state !== "已关闭");
  const openAlarmUrgent = openAlarms.filter((a) => a.level === "紧急").length;
  const doneInRange = tasksInRange.filter((t) =>
    ["完成", "部分完成"].includes(t.state),
  ).length;
  const completeRate = tasksInRange.length
    ? Math.round((doneInRange / tasksInRange.length) * 100)
    : 0;
  const onlineRobots = sc.robots.filter((r) => r.state !== "离线").length;

  // ── 左·上：实时报警数据表格（等级优先 + 时间倒序） ──
  const alarmRows = useMemo(() => {
    const rank = (lv: string) => (lv === "紧急" ? 0 : lv === "重要" ? 1 : 2);
    return [...openAlarms]
      .sort(
        (a, b) => rank(a.level) - rank(b.level) || b.time.localeCompare(a.time),
      )
      .slice(0, 60);
  }, [openAlarms]);
  /** 点位 → 设备 / 区域（表格「设备 / 区域」列） */
  const placeOf = (pointId: string) => {
    const p = s.points.find((x) => x.id === pointId);
    const regionName = p ? s.maps.find((m) => m.id === p.mapId)?.region : undefined;
    return { device: p?.device || p?.object || pointId || "—", region: regionName || "—" };
  };

  // ── 左·下：任务情况环形图 ──
  const taskDist = [
    { label: "执行中", value: tasksInRange.filter((t) => t.state === "执行中").length, color: TASK_COLORS.执行中 },
    { label: "已完成", value: tasksInRange.filter((t) => ["完成", "部分完成"].includes(t.state)).length, color: TASK_COLORS.已完成 },
    { label: "待调度", value: tasksInRange.filter((t) => ["待调度", "已分配", "下发中", "待执行"].includes(t.state)).length, color: TASK_COLORS.待调度 },
    { label: "已终止", value: tasksInRange.filter((t) => ["取消", "失败", "超期"].includes(t.state)).length, color: TASK_COLORS.已终止 },
  ];
  const taskTotal = tasksInRange.length;

  // ── 左·下：报警排行 TOP10（按点位聚合，横向条形图） ──
  const rank = useMemo(() => {
    const m = new Map<string, number>();
    sc.alarms
      .filter((a) => {
        if (range === "全部") return true;
        if (range === "今日") return a.time.slice(0, 10) === TODAY;
        const t = parseTime(a.time);
        return Number.isFinite(t) && t >= rangeStart;
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
  }, [sc.alarms, s.points, range, rangeStart, TODAY]);

  // ── 右·上：风险设备（按被巡检设备聚合 + 状态呼吸灯） ──
  const riskDevices = useMemo(() => {
    const inRange = (t: string) =>
      range === "全部"
        ? true
        : range === "今日"
          ? t.slice(0, 10) === TODAY
          : Number.isFinite(parseTime(t)) && parseTime(t) >= rangeStart;
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
        if (a.level === "紧急") cur.urgent += 1;
      });
    return [...m.values()]
      .sort((a, b) => b.score - a.score || b.alarmCount - a.alarmCount || a.device.localeCompare(b.device))
      .map((x) => ({
        ...x,
        level: riskLevel(x.score, x.urgent > 0),
        pct: Math.round((x.score / Math.max(1, x.score)) * 100),
      }));
  }, [sc.points, sc.alarms, s.points, range, rangeStart, TODAY]);
  const riskList = riskDevices.slice(0, 8);

  // ── 右·下：告警趋势（按真实时间聚合，无数据计 0、不插值） ──
  const trendDays = range === "近30天" ? 30 : 7;
  const trendList = useMemo(() => {
    const out: { d: string; v: number }[] = [];
    for (let i = trendDays - 1; i >= 0; i--) {
      const key = localDay(new Date(Date.now() - i * 86400000));
      out.push({ d: key.slice(5), v: sc.alarms.filter((a) => a.time.slice(0, 10) === key).length });
    }
    return out;
  }, [sc.alarms, trendDays]);

  // ── 运营管理（非管理员默认视图）：过程指标表 ──
  const incomplete = s.tasks.filter(
    (t) => t.deadline && Date.parse(t.deadline) < Date.now() && !["完成", "取消", "失败", "超期"].includes(t.state),
  ).length;
  const woOpen = s.workOrders.filter((w) => !["已验收", "已关闭"].includes(w.state)).length;

  return (
    <div className="cockpit-screen mcp-screen" ref={shellRef}>
      {/* ── 顶部导航：两个驾驶舱共用同一个组件（卡片底 + 居中发光标题 + 带图标的导航 Tab） ──
          本舱自身控件（区域 / 时间筛选 + 系统状态灯 + 全屏）并入右侧，时间由统一顶栏渲染 */}
      <ScreenTopBar
        current="overview"
        onSwitch={onSwitch}
        extra={
          <>
            <div className="mcp-filters">
              <label>
                <MapPin size={12} />
                <span>区域</span>
                <select value={region} onChange={(e) => SETR(e.target.value)} aria-label="区域">
                  {["全部区域", ...new Set(s.robots.map((r) => r.region))].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                <CalendarDays size={12} />
                <span>时间</span>
                <select
                  value={range}
                  onChange={(e) => SETRANGE(e.target.value as RangeKey)}
                  aria-label="时间范围"
                >
                  {RANGES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mcp-status">
              <span className="mcp-led ok">
                <i />
                平台正常
              </span>
              <span className={`mcp-led ${onlineRobots < sc.robots.length ? "warn" : "ok"}`}>
                <i />
                在线 {onlineRobots}/{sc.robots.length}
              </span>
              <span className={`mcp-led ${openAlarmUrgent > 0 ? "bad" : "ok"}`}>
                <i />
                一级告警 {openAlarmUrgent}
              </span>
              <button
                className="cs-nav-icon"
                title={fs ? "退出全屏" : "全屏展示"}
                onClick={toggleFullscreen}
              >
                {fs ? <Minimize size={15} /> : <Maximize size={15} />}
              </button>
            </div>
          </>
        }
      />

      {/* ── 全局 KPI：一排 4 个扁平大数字卡片 ── */}
      <section className="mcp-kpis">
        <div className="mcp-kpi">
          <span>今日巡检</span>
          <b className="cyan">{todayTasks}</b>
          <small>{range} {tasksInRange.length} 次</small>
        </div>
        <div className="mcp-kpi">
          <span>未处理报警</span>
          <b className={openAlarms.length ? "red" : "cyan"}>{openAlarms.length}</b>
          <small>紧急 {openAlarmUrgent} 条</small>
        </div>
        <div className="mcp-kpi">
          <span>任务完成率</span>
          <b className="cyan">{completeRate}%</b>
          <small>完成 {doneInRange} / {tasksInRange.length}</small>
        </div>
        <div className="mcp-kpi">
          <span>在线设备</span>
          <b className="cyan">{onlineRobots}</b>
          <small>共 {sc.robots.length} 台</small>
        </div>
      </section>

      {view === "综合总览" ? (
        /* ── 底部双栏：左 70% 主工作区 / 右 30% 辅助监控 ── */
        <div className="mcp-main">
          <div className="mcp-left">
            {/* 左·上：实时报警数据表格 */}
            <section className="mcp-card">
              <div className="mcp-card-head">
                <h3>实时报警</h3>
                <small>
                  按等级排序 · 未处理优先 · 共 {openAlarms.length} 条（紧急 {openAlarmUrgent}）
                </small>
              </div>
              <div className="mcp-table-scroll">
                <table className="mcp-table">
                  <thead>
                    <tr>
                      <th>报警等级</th>
                      <th>设备 / 区域</th>
                      <th>报警内容</th>
                      <th>时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alarmRows.map((a) => {
                      const place = placeOf(a.pointId);
                      return (
                        <tr key={a.id} className={"lv-" + a.level}>
                          <td>
                            <span className={"mcp-lv lv-" + a.level}>{a.level}</span>
                          </td>
                          <td>
                            <b>{place.device}</b>
                            <small>{place.region}</small>
                          </td>
                          <td className="mcp-alarm-name">{a.name}</td>
                          <td className="mcp-time">{a.time}</td>
                          <td>
                            <button className="mcp-btn" onClick={() => go("alarm", a.id)}>
                              处置
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {!alarmRows.length && (
                      <tr>
                        <td colSpan={5} className="mcp-empty">
                          当前无未处理报警。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 左·下：任务情况环形图(40%) + 报警排行 TOP10(60%) */}
            <div className="mcp-lower">
              <section className="mcp-card">
                <div className="mcp-card-head">
                  <h3>任务情况</h3>
                  <small>{range} · 共 {taskTotal} 个任务</small>
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

              <section className="mcp-card">
                <div className="mcp-card-head">
                  <h3>报警排行 TOP10</h3>
                  <small>按点位聚合 · {range}</small>
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
            </div>
          </div>

          {/* 右 30%：风险设备 + 告警趋势 */}
          <div className="mcp-right">
            <section className="mcp-card">
              <div className="mcp-card-head">
                <h3>风险设备</h3>
                <small>按被巡检设备聚合 · {range}</small>
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

            <section className="mcp-card">
              <div className="mcp-card-head">
                <h3>告警趋势</h3>
                <small>近 {trendDays} 天 · 按真实时间聚合</small>
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
          </div>
        </div>
      ) : (
        /* 运营管理：过程指标（非管理员默认视图），保留原有业务动作 */
        <div className="mcp-ops">
          {[
            { t: "任务与计划", rows: [["已超期任务", incomplete], ["待调度任务", tasksInRange.filter((x) => x.state === "待调度").length], ["临时插单", s.tasks.filter((x) => x.source !== "计划生成").length]] },
            { t: "异常闭环", rows: [["未处理报警", openAlarms.length], ["工单未闭环", woOpen], ["一级告警", openAlarmUrgent]] },
            { t: "设备与人员", rows: [["在线设备", onlineRobots], ["离线设备", sc.robots.length - onlineRobots], ["人工接管", s.takeovers.length]] },
          ].map((card) => (
            <section className="mcp-card" key={card.t}>
              <div className="mcp-card-head">
                <h3>{card.t}</h3>
              </div>
              <ul className="mcp-ops-list">
                {card.rows.map(([k, v]) => (
                  <li key={String(k)}>
                    <span>{k}</span>
                    <b>{v as number}</b>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* 总览 / 运营 视图切换（非管理员日常看运营过程指标） */}
      <button
        className="mcp-view-switch"
        onClick={() => SETVIEW((v) => (v === "综合总览" ? "运营管理" : "综合总览"))}
        title="切换综合总览 / 运营管理"
      >
        <TriangleAlert size={14} />
        {view === "综合总览" ? "运营管理" : "综合总览"}
      </button>
    </div>
  );
}
