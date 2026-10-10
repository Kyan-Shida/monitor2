import { TakeoverOutcome } from "./TakeoverOutcome";
/**
 * @file ResultView.tsx
 * @description 「巡检结果详情」内置页：顶部任务概要 + 检测项明细（按巡检点分组、
 *              任务 → 巡检点 → 巡检项 三级可折叠）+ 执行记录；纯展示页，无复核动作，
 *              异常即告警：异常检测项直接给出关联告警事件入口。
 * @interaction 由 pages/ObjectDetails.tsx 的 result-view 分支渲染；告警处置在 pages/Results.tsx 的告警页
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import {
  fmtTime,
  hasAlarm,
  aiStateOf,
  riskReasonOf,
  readingOf,
  isAbnormal,
  judgeOf,
} from "../data/selectors";
import { Badge, Btn, Modal, Note, Panel, Table } from "./UI";
import { ObjectLink } from "./Business";
import { analyzedPhoto, costOf, rawPhoto } from "../data/evidence";
import type { Alarm, Result, Task } from "../data/types";

export function ResultView({ task }: { task: Task }) {
  const { s } = useStore();
  /** 分页：检测项明细 / 执行记录 */
  const [tab, SETTAB] = useState<"检测项" | "执行记录">("检测项");
  /** 导出为演示占位提示 */
  const [exportKind, SETEXPORT] = useState<"EXCEL" | "PDF" | null>(null);
  /** RES-03：巡检点分组折叠状态（默认全部展开） */
  const [collapsed, SETCOL] = useState<Set<string>>(() => new Set());
  const togglePoint = (pid: string) =>
    SETCOL((old) => {
      const n = new Set(old);
      n.has(pid) ? n.delete(pid) : n.add(pid);
      return n;
    });

  const robot = s.robots.find((r) => r.id === task.robotId);
  const map = s.maps.find((m) => m.id === task.mapId);
  const list = s.results.filter((r) => r.taskId === task.id);
  const pointOf = (pid: string) => s.points.find((p) => p.id === pid);
  /**
   * 检测项对应的告警事件：异常即告警，按结果 ID 精确匹配（不做"按点位猜告警"的模糊回退）
   * @param r 检测结果
   * @returns 关联告警；正常检测项返回 undefined
   */
  const alarmOf = (r: Result) => s.alarms.find((a) => a.resultId === r.id);
  // 只有 AI 状态异常 / 风险信息异常的检测项才有告警：正常项即使残留关联也不展示告警
  const alarms = list.filter(hasAlarm).map(alarmOf).filter(Boolean);
  /** 告警涉及的巡检点个数（异常即告警，口径与告警事件列表一致） */
  const alarmPoints = new Set(alarms.map((a) => a!.pointId)).size;
  /** 识别结果 = 机器读取到的数据；风险信息 = 正常 / 异常（原因），两者分列展示 */
  const alarmOfRow = (r: Result) => (hasAlarm(r) ? alarmOf(r) : undefined);
  // 展示已有任务事件，不按结果行数生成预置位或控制回执。
  const camRows = s.logs.filter(log => log.object === task.id).map(log => ({
    time: log.time, point: task.id, action: `${log.action} · ${log.detail}`,
  }));
  /**
   * RES-03：将检测结果按「巡检点」分组，形成 任务 → 巡检点（可折叠）→ 巡检项 三级层级；
   * 有告警的巡检点优先置顶，便于一眼看出哪个巡检点有问题。
   */
  const pointGroups = (() => {
    const order = task.items.map((it) => it.id);
    const map = new Map<string, Result[]>();
    for (const r of list) {
      if (!map.has(r.pointId)) map.set(r.pointId, []);
      map.get(r.pointId)!.push(r);
    }
    const arr = [...map.entries()].map(([pid, rs]) => {
      const p = pointOf(pid);
      return {
        id: pid,
        name: p?.name || pid,
        device: p?.device || "—",
        rs,
        /** 该巡检点下的告警事件（异常即告警：AI 状态异常 / 风险信息异常才有） */
        alarms: rs
          .filter(hasAlarm)
          .map(alarmOf)
          .filter(Boolean) as Alarm[],
        order: order.indexOf(pid),
      };
    });
    arr.sort(
      (a, b) =>
        (b.alarms.length > 0 ? 1 : 0) - (a.alarms.length > 0 ? 1 : 0) ||
        a.order - b.order,
    );
    return arr;
  })();

  return (
    <div className="rd">
      {/* RES：原底部动作栏上移 —— 顶部操作条（说明在左 / 任务回溯·导出在右）；返回仍用页面顶部返回 */}
      <div className="rd-top">
        <div className="rd-actions">
          <Btn
            onClick={() =>
              go("replay-detail", task.id, undefined, {
                page: "result-view",
                id: task.id,
              })
            }
          >
            任务回溯
          </Btn>
          <Btn primary onClick={() => SETEXPORT("PDF")}>
            导出为 PDF
          </Btn>
        </div>
      </div>
      <div style={{gridColumn: "1 / -1"}}><TakeoverOutcome taskId={task.id} /></div>
      {/* 顶部：任务概要（编号与名称并列，便于与列表 / 其它系统对账） */}
      <div className="rd-grid">
        <span>
          任务ID
          <b>{task.id}</b>
        </span>
        <span>
          任务名称
          <b>{task.name}</b>
        </span>
        <span>
          机器人
          <b>{robot ? `${robot.name}（${robot.id}）` : "—"}</b>
        </span>
        <span>
          地图
          <b>{map?.name || task.mapId}</b>
        </span>
        <span>
          执行结果
          <b>
            <Badge>{task.state}</Badge>
          </b>
        </span>
        <span>
          巡检点
          <b className={alarmPoints ? "rd-bad" : undefined}>
            {task.items.length} 个{alarmPoints ? ` · 告警 ${alarmPoints}` : ""}
          </b>
        </span>
        <span>
          巡检项
          <b className={alarms.length ? "rd-bad" : undefined}>
            {list.length} 项{alarms.length ? ` · 告警 ${alarms.length}` : ""}
          </b>
        </span>
        <span>
          开始时间
          <b>{fmtTime(task.startedAt)}</b>
        </span>
        <span>
          结束时间
          <b>{fmtTime(task.finishedAt)}</b>
        </span>
        {task.failure && (
          <span>
            终止原因
            <b>{task.failure}</b>
          </span>
        )}
      </div>
      <h4 className="rd-h">巡检结果明细（任务 → 巡检点 → 巡检项）</h4>
      <div className="rv-tabs">
        {(
          [
            ["检测项", `检测项明细（${list.length}）`],
            ["执行记录", "执行记录"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            className={"rv-tab" + (tab === k ? " active" : "")}
            onClick={() => SETTAB(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "检测项" ? (
        !list.length ? (
          <Note>该任务暂无检测结果。</Note>
        ) : (
          <div className="rd-points">
            {/* RES-03：任务 → 巡检点（可折叠）→ 巡检项 三级层级；异常点优先置顶 */}
            {pointGroups.map((pg) => (
              <section className="rd-point" key={pg.id}>
                <header
                  className={"rd-point-head" + (pg.alarms.length ? " bad" : "")}
                  onClick={() => togglePoint(pg.id)}
                >
                  <span className="rd-point-caret">
                    {collapsed.has(pg.id) ? "▸" : "▾"}
                  </span>
                  <b>{pg.name}</b>
                  <Badge>{pg.rs.length} 项</Badge>
                  <small className="rd-point-target">关联：{pg.device}</small>
                </header>
                {!collapsed.has(pg.id) && (
                  <div className="table-scroll">
                    <table className="rd-table">
                      <thead>
                        <tr>
                          {[
                            "巡检项",
                            "原始采集图像",
                            "识别分析后图像",
                            "识别结果",
                            "识别耗时",
                            "AI 状态",
                            "风险信息",
                            "关联告警",
                            "采集时间",
                          ].map((h) => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pg.rs.map((r) => {
                          const p = pointOf(r.pointId);
                          const name = p?.name || r.pointId;
                          return (
                            <tr key={r.id}>
                              <td>{r.item}</td>
                              <td>
                                <img
                                  className="rd-img"
                                  src={rawPhoto(name)}
                                  alt={`${name} 原始采集图像`}
                                />
                              </td>
                              <td>
                                <img
                                  className="rd-img"
                                  src={analyzedPhoto(
                                    name,
                                    `${r.final} ${r.unit}`.trim(),
                                    r.abnormal,
                                  )}
                                  alt={`${name} 识别分析后图像`}
                                />
                              </td>
                              {/* 识别结果 = 机器读取到的数据（不做判定表述） */}
                              <td className="rd-result">{readingOf(r)}</td>
                              <td>{costOf(r.id)}s</td>
                              <td>
                                <span
                                  className={
                                    "rd-ai" + (r.aiAbnormal ? " bad" : "")
                                  }
                                >
                                  {aiStateOf(r)}
                                </span>
                              </td>
                              {/* 风险信息 = 正常 / 异常（原因） */}
                              <td>
                                <span
                                  className={
                                    "rd-risk" + (r.abnormal ? " bad" : "")
                                  }
                                >
                                  {riskReasonOf(r)}
                                </span>
                              </td>
                              <td>
                                {/* 异常即告警：只有 AI 状态异常 / 风险信息异常的检测项才有告警 */}
                                {(() => {
                                  const al = alarmOfRow(r);
                                  return al ? (
                                    <ObjectLink type="alarm" to="alarm" id={al.id}>
                                      {al.id}
                                    </ObjectLink>
                                  ) : (
                                    <span className="muted">无</span>
                                  );
                                })()}
                              </td>
                              <td className="rd-time">{r.time}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}
          </div>
        )
      ) : tab === "执行记录" ? (
        <div className="table-scroll">
          <table className="rd-table">
            <thead>
              <tr>
                {["时间", "关联任务", "执行记录", "来源"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!camRows.length && <tr><td colSpan={4}>暂无留存的执行事件，不补造动作记录。</td></tr>}
              {camRows.map((c, i) => (
                <tr key={i}>
                  <td className="rd-time">{c.time}</td>
                  <td>{c.point}</td>
                  <td>{c.action}</td>
                  <td>
                    <span className="rd-ai">任务事件日志</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {exportKind && (
        <Modal title={`导出为 ${exportKind}`} onClose={() => SETEXPORT(null)}>
          <Note>
            演示环境暂不生成真实文件。生产环境将按该任务导出「巡检结果详情」（
            {exportKind}），含任务概要、逐巡检点检测项、原始采集图像、AI 识别后图像与关联告警。
          </Note>
          <div className="actions">
            <Btn primary onClick={() => SETEXPORT(null)}>
              知道了
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
