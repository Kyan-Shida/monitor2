/**
 * @file Metrics.tsx
 * @description 分析报表（原「指标中心」）：基于巡检结果的三种视角分析——
 *              ① 全机器人巡检结果分析（完成情况 / 风险情况）
 *              ② 单台 / 多台巡检机器人分析（可勾选多台做汇总对比）
 *              ③ 按区域的巡检分析
 * @interaction 被 App.tsx 按路由 metrics 渲染；平台指标口径仍以 data/metrics.ts 为准，
 *              本页只对巡检任务执行结果做下钻分析，不定义平台指标口径
 */
import { useState, type ReactNode } from "react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Badge, Btn, Empty, Field, Note, Panel, Table } from "../components/UI";
import type { Robot } from "../data/types";

/** 完成口径：完成 / 部分完成均计入已巡检完成（与平台 taskRate 口径一致） */
const DONE_STATES = ["完成", "部分完成"];
/** 执行中口径 */
const RUNNING_STATES = ["执行中", "暂停"];
/** 待执行口径：尚未开跑（含待调度 / 已分配 / 下发中 / 待执行） */
const QUEUE_STATES = ["待调度", "已分配", "下发中", "待执行"];
/** 告警处理判定：已处理 = 已填写处理结果（有处理时间） */
const isLabeled = (a: { handledAt?: string }) => !!a.handledAt;

/**
 * 百分比：保留一位小数
 * @param a 分子
 * @param b 分母
 * @returns 百分比数值（0-100，一位小数）；分母为 0 时返回 0
 */
const rate = (a: number, b: number) =>
  b > 0 ? Math.round((a / b) * 1000) / 10 : 0;

/** 分析用 KPI 卡（纯展示，不可点） */
function Kpi({
  name,
  value,
  unit,
  foot,
}: {
  name: string;
  value: ReactNode;
  unit?: string;
  foot?: ReactNode;
}) {
  return (
    <div className="kpi-card ana-card">
      <span className="kpi-name">{name}</span>
      <b className="kpi-value">
        {value}
        {unit && <small>{unit}</small>}
      </b>
      {foot && <span className="kpi-foot">{foot}</span>}
    </div>
  );
}

/** 单台机器人的巡检分析结果 */
interface RobotStat {
  robot: Robot;
  taskCount: number;
  done: number;
  doneRate: number;
  itemTotal: number;
  abnormal: number;
  abnormalRate: number;
  alarmCount: number;
  openAlarm: number;
}

/** 单个区域的巡检分析结果 */
interface RegionStat {
  region: string;
  robotCount: number;
  taskCount: number;
  doneRate: number;
  itemTotal: number;
  abnormal: number;
  abnormalRate: number;
  alarmCount: number;
  openAlarm: number;
}

export function Metrics() {
  const { s } = useStore();
  // 机器人分析：厂区 / 机型筛选 + 多选
  const [regionF, SETREGION] = useState("全部");
  const [typeF, SETTYPE] = useState("全部");
  const [sel, SETSEL] = useState<string[]>([]);

  /** 任务所属区域：按任务绑定的地图回推，未匹配到时归入「未归属区域」 */
  const regionOf = (mapId: string) =>
    s.maps.find((m) => m.id === mapId)?.region || "未归属区域";

  /* ── ① 全机器人：完成情况 ── */
  const baseTasks = s.tasks.filter((t) => t.state !== "取消");
  const doneTasks = s.tasks.filter((t) => DONE_STATES.includes(t.state));
  const runningTasks = s.tasks.filter((t) => RUNNING_STATES.includes(t.state));
  const queueTasks = s.tasks.filter((t) => QUEUE_STATES.includes(t.state));
  const cancelTasks = s.tasks.filter((t) => t.state === "取消");
  const taskDoneRate = rate(doneTasks.length, baseTasks.length);

  /* ── ① 全机器人：风险情况 ── */
  const abnormalResults = s.results.filter((r) => r.abnormal);
  const abnormalRate = rate(abnormalResults.length, s.results.length);
  const openAlarms = s.alarms.filter((a) => !isLabeled(a));

  /* ── ② 单台 / 多台机器人分析 ── */
  const robotStats: RobotStat[] = s.robots.map((robot) => {
    const tasks = s.tasks.filter((t) => t.robotId === robot.id);
    const ids = new Set(tasks.map((t) => t.id));
    const results = s.results.filter((r) => ids.has(r.taskId));
    const abnormal = results.filter((r) => r.abnormal).length;
    const alarms = s.alarms.filter((a) => ids.has(a.taskId));
    const done = tasks.filter((t) => DONE_STATES.includes(t.state)).length;
    const base = tasks.filter((t) => t.state !== "取消").length;
    return {
      robot,
      taskCount: tasks.length,
      done,
      doneRate: rate(done, base),
      itemTotal: results.length,
      abnormal,
      abnormalRate: rate(abnormal, results.length),
      alarmCount: alarms.length,
      openAlarm: alarms.filter((a) => !isLabeled(a)).length,
    };
  });
  const regions = Array.from(new Set(s.robots.map((r) => r.region))).filter(Boolean);
  const types = Array.from(new Set(s.robots.map((r) => r.deviceType)));
  const shownRobots = robotStats.filter(
    (x) =>
      (regionF === "全部" || x.robot.region === regionF) &&
      (typeF === "全部" || x.robot.deviceType === typeF),
  );
  const selStats = shownRobots.filter((x) => sel.includes(x.robot.id));
  /** 选中机器人的汇总（任务 / 检测项 / 异常 / 告警累加） */
  const selSum = selStats.reduce(
    (a, x) => ({
      taskCount: a.taskCount + x.taskCount,
      done: a.done + x.done,
      itemTotal: a.itemTotal + x.itemTotal,
      abnormal: a.abnormal + x.abnormal,
      alarmCount: a.alarmCount + x.alarmCount,
      openAlarm: a.openAlarm + x.openAlarm,
    }),
    { taskCount: 0, done: 0, itemTotal: 0, abnormal: 0, alarmCount: 0, openAlarm: 0 },
  );
  const allShownSelected =
    shownRobots.length > 0 && shownRobots.every((x) => sel.includes(x.robot.id));
  /** 全选 / 取消全选：只作用于当前筛选出的机器人，不误伤已选的筛选外对象 */
  const toggleAll = () =>
    SETSEL((prev) => {
      const ids = shownRobots.map((x) => x.robot.id);
      const all = ids.length > 0 && ids.every((id) => prev.includes(id));
      return all
        ? prev.filter((id) => !ids.includes(id))
        : Array.from(new Set([...prev, ...ids]));
    });

  /* ── ③ 按区域分析 ── */
  const regionStats: RegionStat[] = Array.from(
    new Set([...s.robots.map((r) => r.region), ...s.maps.map((m) => m.region)]),
  )
    .filter(Boolean)
    .map((region) => {
      const tasks = s.tasks.filter((t) => regionOf(t.mapId) === region);
      const ids = new Set(tasks.map((t) => t.id));
      const results = s.results.filter((r) => ids.has(r.taskId));
      const abnormal = results.filter((r) => r.abnormal).length;
      const alarms = s.alarms.filter((a) => ids.has(a.taskId));
      const done = tasks.filter((t) => DONE_STATES.includes(t.state)).length;
      const base = tasks.filter((t) => t.state !== "取消").length;
      return {
        region,
        robotCount: s.robots.filter((r) => r.region === region).length,
        taskCount: tasks.length,
        doneRate: rate(done, base),
        itemTotal: results.length,
        abnormal,
        abnormalRate: rate(abnormal, results.length),
        alarmCount: alarms.length,
        openAlarm: alarms.filter((a) => !isLabeled(a)).length,
      };
    })
    .sort((a, b) => b.abnormal - a.abnormal);
  const regionMax = Math.max(1, ...regionStats.map((x) => x.abnormal));

  return (
    <div className="analysis-report">

      {/* ① 全机器人巡检结果分析 */}
      <Panel title="① 全机器人巡检结果分析">
        <div className="ana-split">
          {/* 左列：完成情况 + 任务状态分布 */}
          <div className="ana-col">
            <div className="ana-h">完成情况</div>
            <div className="kpi-grid">
              <Kpi name="巡检任务总数" value={s.tasks.length} unit="条" />
              <Kpi name="已完成任务" value={doneTasks.length} unit="条" foot={<>完成 + 部分完成</>} />
              <Kpi name="执行中任务" value={runningTasks.length} unit="条" />
              <Kpi name="待执行任务" value={queueTasks.length} unit="条" foot={<>待调度 / 已分配 / 待执行</>} />
              <Kpi name="取消任务" value={cancelTasks.length} unit="条" />
              <Kpi name="任务完成率" value={taskDoneRate} unit="%" foot={<>应执行 {baseTasks.length} 条</>} />
            </div>
          </div>
          {/* 右列：风险情况 + 告警等级分布 */}
          <div className="ana-col">
            <div className="ana-h">风险情况</div>
            <div className="kpi-grid">
              <Kpi name="检测项总数" value={s.results.length} unit="项" />
              <Kpi name="异常检测项" value={abnormalResults.length} unit="项" foot={<>识别判定为异常</>} />
              <Kpi name="异常率" value={abnormalRate} unit="%" />
              <Kpi name="告警总数" value={s.alarms.length} unit="条" />
              <Kpi name="未处理告警" value={openAlarms.length} unit="条" foot={<>尚未填写处理结果</>} />
            </div>
          </div>
        </div>
      </Panel>

      {/* ③ 按区域巡检分析 */}
      <Panel title="② 区域巡检分析 · 按异常项降序">
        {!regionStats.length ? (
          <Empty>暂无区域数据</Empty>
        ) : (
          <Table
            heads={["区域", "巡检机器人", "巡检任务", "完成率", "异常项 / 异常率", "告警 / 未处理", "风险占比"]}
            rows={regionStats.map((x) => [
              <b>{x.region}</b>,
              `${x.robotCount} 台`,
              `${x.taskCount} 条`,
              `${x.doneRate}%`,
              <>
                {x.abnormal ? <Badge>{x.abnormal} 项</Badge> : "0 项"}
                <small>异常率 {x.abnormalRate}%</small>
              </>,
              <>
                {x.alarmCount} 条
                <small>未处理 {x.openAlarm}</small>
              </>,
              <div className="ana-bar">
                <progress value={x.abnormal} max={regionMax} />
                <span>{rate(x.abnormal, abnormalResults.length)}%</span>
              </div>,
            ])}
          />
        )}
      </Panel>
    </div>
  );
}
