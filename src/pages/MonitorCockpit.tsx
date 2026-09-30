/**
 * @file MonitorCockpit.tsx
 * @description 管理驾驶舱：深色大屏形态（中栏 KPI 指标卡 + 巡检任务情况 + 告警排行 TOP10 三块上下排列，
 *              左栏 风险区域/风险设备、右栏 设备状态/告警趋势 各两块），按角色切默认视图，支持时间范围切换
 * @interaction 由 App.tsx 在 page === "overview" 时渲染；指标取自 data/metrics.ts，历史趋势取自 data/metricHistory.ts
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize, Minimize } from "lucide-react";
import { useStore } from "../data/store";
import { useRole } from "../components/Can";
import { Note, Table } from "../components/UI";
import { Donut, Ring } from "../components/Charts";
import { Sparkline } from "../components/Sparkline";
import { AutoScrollList } from "../components/AutoScrollList";
import { ScreenTopBar, type CockpitId } from "../components/ScreenTopBar";
import { metricValue, scopedState } from "../data/metrics";
import type { MetricPoint } from "../data/metricHistory";
import { deviceProfile, deviceTypes } from "../data/deviceProfile";
import { terminal } from "../data/selectors";

/** 告警排行分段配色（沉稳工业深色板：降饱和青蓝/蓝/紫/琥珀，扩展到 TOP10） */
const RANK_COLORS = [
  "#3aa7c9",
  "#5b8fe0",
  "#8a74d6",
  "#d39a3c",
  "#4fae8e",
  "#c96f6a",
  "#6cb3d6",
  "#7d8fd8",
  "#b189d0",
  "#c9a35a",
];
/** 任务状态分布配色（与色板一致，状态语义靠色相、不靠高饱和发光） */
const TASK_COLORS = { 执行中: "#3aa7c9", 已完成: "#5b8fe0", 待调度: "#d39a3c", 已终止: "#d06a63" };
/** 告警等级加权分：紧急 3 / 重要 2 / 一般 1（驱动风险区域与风险设备排序） */
const LEVEL_W = { 紧急: 3, 重要: 2, 一般: 1 } as const;
/** 风险等级判定：含紧急或加权分 ≥ 6 为高，≥ 3 为中，> 0 为低，0 为 — */
const riskLevel = (score: number, hasUrgent = false): "高" | "中" | "低" | "—" => {
  if (score <= 0) return "—";
  if (hasUrgent || score >= 6) return "高";
  if (score >= 3) return "中";
  return "低";
};
/** 风险等级对应的指示点色 + 柱状渐变（与全站色板同源） */
const RISK_DOT = { 高: "#d06a63", 中: "#d39a3c", 低: "#4fae8e", "—": "#6b8294" } as const;
const RISK_BAR = {
  高: "linear-gradient(90deg,#d06a63,#bf5b53)",
  中: "linear-gradient(90deg,#d39a3c,#c58e32)",
  低: "linear-gradient(90deg,#4fae8e,#31957f)",
  "—": "transparent",
} as const;
const riskLevelClass = (lv: "高" | "中" | "低" | "—") =>
  lv === "高" ? "high" : lv === "中" ? "mid" : lv === "低" ? "low" : "none";

/** KPI 数字卡：大数字 + 标签 + 3D 平台底座 */
function KpiCard({
  value,
  label,
  tone = "cyan",
}: {
  value: number | string;
  label: string;
  tone?: "green" | "red" | "amber" | "cyan";
}) {
  return (
    <div className="cs-kpi-tile">
      <b className={`num ${tone}`}>{value}</b>
      <small className="label">{label}</small>
      <i className="platform" />
    </div>
  );
}

/** KPI 环形进度卡：SVG 进度环 + 中心百分比 + 标签 */
function KpiRing({ value, label, tone = "#3ec0d8" }: { value: number; label: string; tone?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const r = 26;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;
  return (
    <div className="cs-kpi-tile ring">
      <div className="ring-host">
        <svg width="60" height="60" viewBox="0 0 60 60">
          <circle cx="30" cy="30" r={r} fill="none" stroke="rgba(148,174,204,0.22)" strokeWidth="6" />
          <circle
            cx="30" cy="30" r={r}
            fill="none" stroke={tone} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            transform="rotate(-90 30 30)"
          />
          <text x="30" y="35" textAnchor="middle" fontSize="14" fontWeight="700" fill={tone}>
            {v}%
          </text>
        </svg>
      </div>
      <small className="label">{label}</small>
      <i className="platform" />
    </div>
  );
}

/** 本地日期（YYYY-MM-DD） */
const localDay = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
/** 兼容 "YYYY-MM-DD HH:mm" 的时间解析（部分浏览器要求 T 分隔） */
const parseTime = (t: string) => Date.parse(t.replace(" ", "T"));

export function MonitorCockpit({
  onSwitch,
}: {
  /** 独立大屏窗口内的驾驶舱切换；后台外壳下缺省按路由跳转 */
  onSwitch?: (id: CockpitId) => void;
}) {
  const { s, act } = useStore();
  const role = useRole();
  const [view, SETV] = useState<"综合总览" | "运营管理">(role.cockpitView);
  const [region, SETR] = useState("全部区域");
  const [range, SETRANGE] = useState<"今日" | "近7天" | "近30天" | "全部">("近7天");
  const [trendRange, SETTREND] = useState<"近7天" | "近30天">("近7天");
  /** 风险面板时间范围（独立于告警排行/告警趋势，默认近 7 天） */
  const [riskRange, SETRISKRANGE] = useState<"今日" | "近7天" | "近30天" | "全部">("近7天");
  // 高亮凸显的机器：点击左侧设备列表 / 地图机器时联动，再次点击取消
  const [robotId, SETRID] = useState<string | null>(null);
  /** 设备卡内筛选：机型 / 状态（厂区沿用工具条筛选，二者同源） */
  const [devF, SETDEV] = useState("全部机型");
  const [stateF, SETSTATEF] = useState("全部状态");
  /** 设备池「全选」：一次选中当前筛选的全部机器（地图全部高亮） */
  const [allSel, SETALL] = useState(false);
  const [fs, FS] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  // 角色切换后回到该角色的默认视图
  useEffect(() => SETV(role.cockpitView), [role.cockpitView]);
  useEffect(() => {
    const onFs = () => FS(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const sc = scopedState(s, region);
  const mv = (key: string) => metricValue(sc, key);
  const TODAY = localDay();
  const MONTH = TODAY.slice(0, 7);

  /** 设备卡列表与分布：按卡内机型 / 状态筛选（厂区由工具条统一控制） */
  const listRobots = sc.robots.filter((r) => {
    if (devF !== "全部机型" && r.deviceType !== devF) return false;
    if (stateF === "任务中" && r.state !== "执行中") return false;
    if (stateF === "异常" && !["故障", "离线", "人工接管"].includes(r.state)) return false;
    if (stateF === "充电" && r.state !== "充电") return false;
    if (stateF === "空闲" && r.state !== "空闲") return false;
    return true;
  });
  /** 单台生效的高亮机器：原用于地图联动（驾驶舱已移除地图卡，保留 robotId/allSel 仅供设备卡高亮态） */

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) shellRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  // ── 时间范围过滤：按任务创建时间过滤 ──
  const rangeStart = useMemo(() => {
    if (range === "全部") return 0;
    if (range === "今日") return parseTime(TODAY + " 00:00");
    const days = range === "近7天" ? 7 : 30;
    return Date.now() - days * 86400000;
  }, [range, TODAY]);
  const tasksInRange = s.tasks.filter(
    (t) =>
      range === "全部" ||
      (Number.isFinite(parseTime(t.created)) && parseTime(t.created) >= rangeStart),
  );
  const taskDist = [
    { label: "执行中", value: tasksInRange.filter((t) => t.state === "执行中").length, color: TASK_COLORS.执行中 },
    { label: "已完成", value: tasksInRange.filter((t) => ["完成", "部分完成"].includes(t.state)).length, color: TASK_COLORS.已完成 },
    { label: "待调度", value: tasksInRange.filter((t) => ["待调度", "已分配", "下发中", "待执行"].includes(t.state)).length, color: TASK_COLORS.待调度 },
    { label: "已终止", value: tasksInRange.filter((t) => ["取消", "失败", "超期"].includes(t.state)).length, color: TASK_COLORS.已终止 },
  ];
  const taskTotal = tasksInRange.length;

  // ── 告警趋势：按日聚合真实告警时间 ──
  const trendDays = trendRange === "近7天" ? 7 : 30;
  const trendList: MetricPoint[] = useMemo(() => {
    const out: MetricPoint[] = [];
    for (let i = trendDays - 1; i >= 0; i--) {
      const key = localDay(new Date(Date.now() - i * 86400000));
      out.push({
        d: key.slice(5),
        v: s.alarms.filter((a) => a.time.slice(0, 10) === key).length,
      });
    }
    return out;
  }, [s.alarms, trendDays]);

  // ── 告警排行：按点位聚合，支持区域 + 时间筛选，取 TOP10 ──
  /** 排行时间范围（卡内独立筛选，默认近 7 天） */
  const [rankRange, SETRANKRANGE] = useState<"今日" | "近7天" | "近30天" | "全部">("近7天");
  /** 环形图悬浮的分段：与排行列表联动高亮 */
  const [rankHover, SETRANKHOVER] = useState<number | null>(null);
  /** 时间起点：今日按自然日，近 7/30 天按当前时间回推 */
  const rankStart = useMemo(() => {
    if (rankRange === "全部") return 0;
    if (rankRange === "今日") return parseTime(TODAY + " 00:00");
    return Date.now() - (rankRange === "近7天" ? 7 : 30) * 86400000;
  }, [rankRange, TODAY]);
  /** 区域 + 时间过滤后的告警（区域经任务归到机器所属厂区） */
  const rankAlarms = useMemo(
    () =>
      s.alarms
        .filter((a) => {
          if (rankRange === "全部") return true;
          if (rankRange === "今日") return a.time.slice(0, 10) === TODAY;
          const t = parseTime(a.time);
          return Number.isFinite(t) && t >= rankStart;
        })
        .filter((a) => {
          if (region === "全部区域") return true;
          const rid = s.tasks.find((t) => t.id === a.taskId)?.robotId;
          return s.robots.find((r) => r.id === rid)?.region === region;
        }),
    [s.alarms, s.tasks, s.robots, rankRange, rankStart, region, TODAY],
  );
  const rank = useMemo(() => {
    const map = new Map<string, number>();
    rankAlarms.forEach((a) => map.set(a.pointId, (map.get(a.pointId) || 0) + 1));
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([pid, value], i) => ({
        pid,
        name: s.points.find((p) => p.id === pid)?.name || pid,
        value,
        color: RANK_COLORS[i % RANK_COLORS.length],
      }));
  }, [rankAlarms, s.points]);
  const rankTotal = rankAlarms.length;

  // ── 风险面板：风险区域（全局厂区排行）+ 风险设备（按厂区筛选） ──
  const riskStart = useMemo(() => {
    if (riskRange === "全部") return 0;
    if (riskRange === "今日") return parseTime(TODAY + " 00:00");
    return Date.now() - (riskRange === "近7天" ? 7 : 30) * 86400000;
  }, [riskRange, TODAY]);
  const inRiskRange = (t: string) => {
    if (riskRange === "全部") return true;
    if (riskRange === "今日") return t.slice(0, 10) === TODAY;
    const ts = parseTime(t);
    return Number.isFinite(ts) && ts >= riskStart;
  };
  /** 告警 → 任务 → 机器人 → 厂区（仅用于风险区域聚合） */
  const regionOfAlarm = (taskId: string) => s.tasks.find((t) => t.id === taskId)?.robotId
    ? s.robots.find((r) => r.id === s.tasks.find((t) => t.id === taskId)!.robotId)?.region
    : undefined;
  /** 风险区域：全局所有厂区按加权分降序，柱长=相对最高分（始终让 Top1 满柱以便比较） */
  const riskRegions = useMemo(() => {
    const regions = Array.from(new Set(s.robots.map((r) => r.region))).filter(Boolean) as string[];
    const m = new Map<string, { count: number; score: number; open: number; urgent: number }>();
    regions.forEach((r) => m.set(r, { count: 0, score: 0, open: 0, urgent: 0 }));
    s.alarms.filter((a) => inRiskRange(a.time)).forEach((a) => {
      const reg = regionOfAlarm(a.taskId);
      if (!reg || !m.has(reg)) return;
      const v = m.get(reg)!;
      v.count += 1;
      v.score += LEVEL_W[a.level as keyof typeof LEVEL_W] ?? 1;
      if (a.state !== "已关闭") v.open += 1;
      if (a.level === "紧急") v.urgent += 1;
    });
    const list = regions.map((r) => ({ region: r, ...m.get(r)! }));
    list.sort((a, b) => b.score - a.score || b.count - a.count || a.region.localeCompare(b.region));
    const max = Math.max(1, ...list.map((x) => x.score));
    return list.map((x) => ({
      ...x,
      level: riskLevel(x.score, x.urgent > 0),
      pct: Math.round((x.score / max) * 100),
    }));
  }, [s.robots, s.tasks, s.alarms, riskRange, riskStart, TODAY]);
  const riskRegionTotal = riskRegions.reduce((sum, x) => sum + x.count, 0);
  /** 风险设备：按"被巡检设备"（Point.device）聚合 ——
   *  不同于 告警排行（按点位 pointId 聚合），这里上卷到设备层，
   *  让领导一眼看出"哪台储罐/哪个阀门站最该关注"。 */
  const riskDevices = useMemo(() => {
    // 1) 先按 sc.points（已按厂区筛选）初始化设备桶，每个设备带上其下属点位数量
    const m = new Map<
      string,
      { device: string; pointCount: number; alarmCount: number; score: number; open: number; urgent: number }
    >();
    sc.points.forEach((p) => {
      const dev = p.device || p.object || p.name;
      if (!dev) return;
      const cur = m.get(dev) || {
        device: dev,
        pointCount: 0,
        alarmCount: 0,
        score: 0,
        open: 0,
        urgent: 0,
      };
      cur.pointCount += 1;
      m.set(dev, cur);
    });
    // 2) 把时间范围内、且点位在 sc.points 内的告警累加到对应设备桶
    const scPointIds = new Set(sc.points.map((p) => p.id));
    s.alarms
      .filter((a) => inRiskRange(a.time) && scPointIds.has(a.pointId))
      .forEach((a) => {
        const p = s.points.find((x) => x.id === a.pointId);
        if (!p) return;
        const dev = p.device || p.object || p.name;
        const cur = m.get(dev);
        if (!cur) return;
        cur.alarmCount += 1;
        cur.score += LEVEL_W[a.level as keyof typeof LEVEL_W] ?? 1;
        if (a.state !== "已关闭") cur.open += 1;
        if (a.level === "紧急") cur.urgent += 1;
      });
    const list = Array.from(m.values());
    list.sort((a, b) => b.score - a.score || b.alarmCount - a.alarmCount || a.device.localeCompare(b.device));
    const max = Math.max(1, ...list.map((x) => x.score));
    return list.map((x) => ({
      ...x,
      level: riskLevel(x.score, x.urgent > 0),
      pct: Math.round((x.score / max) * 100),
    }));
  }, [sc.points, s.points, s.alarms, riskRange, riskStart, TODAY]);

  // ── 运营过程区 ──
  const overdue = s.tasks.filter(
    (t) => t.deadline && Date.parse(t.deadline) < Date.now() && !terminal.includes(t.state),
  ).length;
  const deviceRows = deviceTypes.map((d) => {
    const rs = s.robots.filter((r) => r.deviceType === d);
    const inScope = region === "全部区域" ? rs : rs.filter((r) => r.region === region);
    return {
      d,
      total: inScope.length,
      bad: inScope.filter((r) => ["故障", "离线"].includes(r.state)).length,
      low: inScope.filter((r) => r.battery < r.constraints.minBattery).length,
      fallback: deviceProfile[d].focusItems.join(" / "),
    };
  });
  const lowConfidence = s.results.filter((r) => r.confidence < 0.85).length;
  const fbTotal = s.feedbacks.length;
  const fbClosed = s.feedbacks.filter((f) => f.consumed).length;
  const woOpen = s.workOrders.filter((w) => !["已验收", "已关闭"].includes(w.state));
  const escalated = s.workOrders.filter((w) => w.slaState === "已升级").length;

  // ── KPI 仪表盘卡片：11 张大屏指标卡（5+6 两行布局） ──
  const MONTH_PREFIX = TODAY.slice(0, 7);
  const safetyDays = useMemo(() => {
    const times: number[] = [];
    s.tasks.forEach((t) => {
      const ts = parseTime(t.created);
      if (Number.isFinite(ts)) times.push(ts);
    });
    s.alarms.forEach((a) => {
      const ts = parseTime(a.time);
      if (Number.isFinite(ts)) times.push(ts);
    });
    if (!times.length) return 0;
    return Math.max(0, Math.floor((Date.now() - Math.min(...times)) / 86400000));
  }, [s.tasks, s.alarms]);
  const monthInspect = useMemo(
    () => s.tasks.filter((t) => t.created.slice(0, 7) === MONTH_PREFIX).length,
    [s.tasks, MONTH_PREFIX],
  );
  const monthRisk = useMemo(
    () => s.alarms.filter((a) => a.time.slice(0, 7) === MONTH_PREFIX).length,
    [s.alarms, MONTH_PREFIX],
  );
  const unhandledRisk = useMemo(
    () => s.alarms.filter((a) => a.state !== "已关闭").length,
    [s.alarms],
  );
  const todayFoundRisk = useMemo(
    () => s.alarms.filter((a) => a.time.slice(0, 10) === TODAY).length,
    [s.alarms, TODAY],
  );
  const todayUnhandledRisk = useMemo(
    () =>
      s.alarms.filter((a) => a.time.slice(0, 10) === TODAY && a.state !== "已关闭").length,
    [s.alarms, TODAY],
  );

  return (
    <div className="cockpit-screen monitor-screen" ref={shellRef}>
      {/* 大屏全局导航栏：品牌 + 导航 Tab + 发光标题 + 厂区筛选 / 全屏 + 时间
          （原「驾驶舱工具条」独立一行已取消：厂区筛选是全局口径、全屏是显示控制，都归顶栏） */}
      <ScreenTopBar
        current="overview"
        onSwitch={onSwitch}
        extra={
          <>
            <select
              className="cs-nav-region"
              aria-label="厂区"
              value={region}
              onChange={(e) => SETR(e.target.value)}
            >
              {["全部区域", ...new Set(s.robots.map((r) => r.region))].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <button
              className="cs-nav-icon"
              title={fs ? "退出大屏" : "展示全屏"}
              aria-label={fs ? "退出大屏" : "展示全屏"}
              onClick={toggleFullscreen}
            >
              {fs ? <Minimize size={15} /> : <Maximize size={15} />}
            </button>
          </>
        }
      />

      {/* 主体三栏 */}
      <div className="cs-body">
        {/* 左：风险区域 + 风险设备（聚焦"哪里最危险 / 哪台最危险"） */}
        <aside className="cs-left">
          {/* grow：撑满列高，与中/右两栏底边对齐 */}
          <section className="cs-card grow">
            <h3>
              风险区域
              <small>加权分排序 · {riskRange} · 共 {riskRegionTotal} 次</small>
              <span className="cs-range">
                {(["今日", "近7天", "近30天", "全部"] as const).map((x) => (
                  <button
                    key={x}
                    className={riskRange === x ? "active" : ""}
                    onClick={() => SETRISKRANGE(x)}
                  >
                    {x}
                  </button>
                ))}
              </span>
            </h3>
            <div className="cs-list">
              {!riskRegions.length && <Note>暂无区域数据</Note>}
              {riskRegions.map((x) => (
                <div key={x.region} className="cs-risk-row">
                  <i className="cs-dot" style={{ background: RISK_DOT[x.level] }} />
                  <div className="cs-risk-main">
                    <b className="cs-risk-name">{x.region}</b>
                    <small className="cs-risk-sub">
                      告警 {x.count} 次 · 未关 {x.open}
                      {x.urgent > 0 ? ` · 紧急 ${x.urgent}` : ""}
                    </small>
                  </div>
                  <span className="cs-bar">
                    <i style={{ width: `${x.pct}%`, background: RISK_BAR[x.level] }} />
                  </span>
                  <span className={`cs-risk-level ${riskLevelClass(x.level)}`}>{x.level}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="cs-card">
            <h3>
              风险设备
              <small>
                {region === "全部区域" ? "全部厂区" : region} · 按被巡检设备聚合 · {riskRange}
              </small>
            </h3>
            <div className="cs-list">
              {!riskDevices.length && <Note>当前筛选下无被巡检设备</Note>}
              {riskDevices.map((x) => (
                <div key={x.device} className="cs-risk-row">
                  <i className="cs-dot" style={{ background: RISK_DOT[x.level] }} />
                  <div className="cs-risk-main">
                    <b className="cs-risk-name">{x.device}</b>
                    <small className="cs-risk-sub">
                      {x.pointCount} 个点位 · 告警 {x.alarmCount}（未关 {x.open}）
                      {x.urgent > 0 ? ` · 紧急 ${x.urgent}` : ""}
                    </small>
                  </div>
                  <span className="cs-bar">
                    <i style={{ width: `${x.pct}%`, background: RISK_BAR[x.level] }} />
                  </span>
                  <span className={`cs-risk-level ${riskLevelClass(x.level)}`}>{x.level}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>

        {/* 中：顶部紧凑 KPI 卡网格 + 巡检任务情况 + 告警排行 TOP10 占满剩余高度 */}
        <main className="cs-center">
          {/* 紧凑 KPI 网格：3×3 九宫格（按评审去掉「今日计划任务 / 今日已完成任务」两项） */}
          <div className="cs-kpi-board">
            <KpiCard value={safetyDays} label="天 安全生产" tone="green" />
            <KpiCard value={sc.robots.length} label="台 巡检设备" />
            <KpiCard value={monthInspect} label="次 本月巡检" />
            <KpiCard value={monthRisk} label="次 本月风险" tone={monthRisk > 0 ? "red" : "cyan"} />
            <KpiCard value={unhandledRisk} label="次 未处理风险" tone={unhandledRisk > 0 ? "red" : "cyan"} />
            <KpiRing value={mv("taskRate")} label="任务完成率" />
            <KpiRing value={mv("closeRate")} label="风险排除率" />
            <KpiCard value={todayFoundRisk} label="个 今日发现风险" tone={todayFoundRisk > 0 ? "amber" : "cyan"} />
            <KpiCard value={todayUnhandledRisk} label="个 今日未处理风险" tone={todayUnhandledRisk > 0 ? "red" : "cyan"} />
          </div>
          {/* 巡检任务情况：紧接 KPI 下方（中栏三块：KPI · 任务情况 · 告警排行） */}
          <section className="cs-card cs-task-card">
            <h3>
              巡检任务情况
              <span className="cs-range">
                {(["今日", "近7天", "近30天", "全部"] as const).map((x) => (
                  <button key={x} className={range === x ? "active" : ""} onClick={() => SETRANGE(x)}>
                    {x}
                  </button>
                ))}
              </span>
            </h3>
            <div className="cs-task-body">
              <div className="cs-task-total">
                <b className="cs-big">{taskTotal}</b>
                <span className="cs-big-label">任务总数（{range}）</span>
              </div>
              <div className="cs-task-stats">
                {taskDist.map((x) => (
                  <div className="cs-task-stat" key={x.label}>
                    <b className="cs-task-count">{x.value}</b>
                    <Ring
                      value={taskTotal ? Math.round((x.value / taskTotal) * 100) : 0}
                      label={x.label}
                      tone={x.color}
                      size={64}
                      thickness={6}
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="cs-card grow">
            <h3>
              告警排行 TOP10
              <small>
                按点位聚合 · {rankRange} · 共 {rankTotal} 次 · 自动播放
              </small>
              {/* 区域 + 时间筛选：区域与工具条厂区同源 */}
              <span className="cs-range">
                <select
                  aria-label="区域"
                  value={region}
                  onChange={(e) => SETR(e.target.value)}
                >
                  {["全部区域", ...new Set(s.robots.map((r) => r.region))].map(
                    (x) => (
                      <option key={x}>{x}</option>
                    ),
                  )}
                </select>
                {(["今日", "近7天", "近30天", "全部"] as const).map((x) => (
                  <button
                    key={x}
                    className={rankRange === x ? "active" : ""}
                    onClick={() => SETRANKRANGE(x)}
                  >
                    {x}
                  </button>
                ))}
              </span>
            </h3>
            <div className="cs-rank-wrap">
              {/* 排行列表：自动上下滚动播放（无滚动条、不可手动拉动）；高度随格子伸缩，不再按固定行数定高 */}
              <AutoScrollList>
                <ul className="cs-rank">
                  {!rank.length && <li>暂无告警记录</li>}
                  {rank.map((x, i) => (
                    <li key={x.pid} className={rankHover === i ? "active" : ""}>
                      <span className="idx" style={{ background: x.color }}>
                        {i + 1}
                      </span>
                      <span className="name">{x.name}</span>
                      <span className="pct">
                        {x.value} 次 ·{" "}
                        {rankTotal ? Math.round((x.value / rankTotal) * 100) : 0}%
                      </span>
                    </li>
                  ))}
                </ul>
              </AutoScrollList>
              <Donut
                data={rank.map((x) => ({ label: x.name, value: x.value, color: x.color }))}
                center={`${rankTotal}`}
                onHover={SETRANKHOVER}
              />
            </div>
          </section>
        </main>

        {/* 右：设备状态 + 告警趋势（两块） */}
        <aside className="cs-right">
          {/* grow：撑满列高，与中/左两栏底边对齐 */}
          <section className="cs-card grow">
            <h3>
              设备状态
              <small>共 {listRobots.length} 台</small>
              {/* 全选：一次选中当前筛选的全部机器（在设备卡上高亮） */}
              <span className="cs-range">
                <button
                  className={allSel ? "active" : ""}
                  title="一次选中当前筛选的全部机器"
                  onClick={() => {
                    SETALL(!allSel);
                    SETRID(null);
                  }}
                >
                  {allSel ? "取消全选" : "全选"}
                </button>
              </span>
            </h3>
            <div className="cs-nums">
              {[
                { n: listRobots.filter((r) => r.state !== "离线").length, label: "在线" },
                { n: listRobots.filter((r) => r.state === "离线").length, label: "离线" },
                { n: listRobots.filter((r) => r.state === "执行中").length, label: "巡检中" },
                { n: listRobots.filter((r) => r.state === "空闲").length, label: "待机" },
              ].map((x) => (
                <div className="cs-num" key={x.label}>
                  <b>{x.n}</b>
                  <span>{x.label}</span>
                </div>
              ))}
            </div>
            {/* 设备筛选：机型 / 状态（厂区由顶部工具条统一控制，避免重复入口） */}
            <div className="ds-selects">
              <select aria-label="机型" value={devF} onChange={(e) => SETDEV(e.target.value)}>
                {["全部机型", ...deviceTypes].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <select
                aria-label="状态"
                value={stateF}
                onChange={(e) => SETSTATEF(e.target.value)}
              >
                {["全部状态", "任务中", "空闲", "充电", "异常"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </div>
            <div className="cs-list">
              {listRobots.map((r) => (
                <button
                  key={r.id}
                  className={allSel || robotId === r.id ? "active" : ""}
                  title="点击在地图中高亮该机器；再次点击取消"
                  onClick={() => {
                    SETALL(false);
                    SETRID(robotId === r.id ? null : r.id);
                  }}
                >
                  <i
                    className="cs-dot"
                    style={{ background: r.state === "离线" ? "#8794a3" : r.battery < r.constraints.minBattery ? "#d39a3c" : "#3aa7c9" }}
                  />
                  <div>
                    <b>
                      {r.name}
                      <em>{r.deviceType}</em>
                    </b>
                    <small>{r.state}</small>
                  </div>
                  <span className="cs-bar">
                    <i style={{ width: `${r.battery}%` }} />
                  </span>
                  <em className="cs-battery">{r.battery}%</em>
                </button>
              ))}
              {!listRobots.length && (
                <Note>
                  {sc.robots.length ? "当前筛选条件下无设备。" : "当前厂区无设备。"}
                </Note>
              )}
            </div>
          </section>

          <section className="cs-card">
            <h3>
              告警趋势
              <span className="cs-range">
                {(["近7天", "近30天"] as const).map((x) => (
                  <button key={x} className={trendRange === x ? "active" : ""} onClick={() => SETTREND(x)}>
                    {x}
                  </button>
                ))}
              </span>
            </h3>
            <div className="cs-trend">
              <Sparkline list={trendList} ok />
            </div>
            <div className="cs-trend-axis">
              <span>{trendDays} 天前</span>
              <span>今日</span>
            </div>
            <small className="cs-hint">
              按告警真实时间聚合，无数据日期计 0，不做插值平滑。
            </small>
          </section>
        </aside>
      </div>

      {/* 运营管理视图：过程区（仅非管理员默认进入） */}
      {view === "运营管理" && (
        <div className="cs-process">
          <section className="cs-card">
            <h3>任务与计划</h3>
            <Table
              heads={["指标", "数值"]}
              rows={[
                ["任务完成率", `${mv("taskRate")}%`],
                ["已超期任务", overdue],
                ["待调度任务", mv("pendingDispatch")],
                ["临时插单", s.tasks.filter((t) => t.source !== "计划生成").length],
                ["排班资质异常", s.shifts.filter((x) => !x.certOk).length],
              ]}
            />
          </section>
          <section className="cs-card">
            <h3>机器状态（按机型）</h3>
            <Table
              heads={["机型", "在册", "故障/离线", "低电量"]}
              rows={deviceRows.map((x) => [
                <>
                  {x.d}
                  <small>{x.fallback}</small>
                </>,
                x.total,
                x.bad,
                x.low,
              ])}
            />
          </section>
          <section className="cs-card">
            <h3>AI 质量</h3>
            <Table
              heads={["指标", "数值"]}
              rows={[
                ["复核积压", mv("reviewBacklog")],
                ["低置信度", lowConfidence],
                ["AI 准确率", `${mv("aiAccuracy")}%`],
                ["误报率", `${mv("falseRate")}%`],
                ["反馈闭环率", `${fbTotal ? Math.round((fbClosed / fbTotal) * 100) : 0}%`],
              ]}
            />
          </section>
          <section className="cs-card">
            <h3>异常闭环</h3>
            <Table
              heads={["环节", "数值"]}
              rows={[
                ["未确认告警", mv("unconfirmedAlarms")],
                ["工单未闭环", woOpen.length],
                ["SLA 超时升级", escalated],
                ["异常闭环率", `${mv("closeRate")}%`],
                ["MTTR", `${mv("mttr")} 分钟`],
              ]}
            />
          </section>
          <section className="cs-card">
            <h3>人员与排班</h3>
            <Table
              heads={["指标", "数值"]}
              rows={[
                ["人工接管率", `${mv("takeoverRate")}%`],
                ["接管申请", s.takeovers.length],
                ["现场保障量", mv("fieldDone")],
                ["现场待处理", mv("fieldPending")],
                ["排班执行率", `${mv("scheduleRate")}%`],
              ]}
            />
          </section>
        </div>
      )}

    </div>
  );
}

