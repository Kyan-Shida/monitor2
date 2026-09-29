import { TakeoverOutcome } from "./TakeoverOutcome";
/**
 * @file ReplayDetail.tsx
 * @description 执行回溯详情（对照任务回溯参考版式）：左侧「可见光 / 红外」双画面 + 导航地图（点位与巡检路径），
 *              右侧任务汇总信息 +「巡检结果 / 风险记录 / 执行事件」分页列表，支持逐项展开与全部展开
 * @interaction 由 pages/ObjectDetails.tsx 在执行回溯页选中任务后渲染；只读回看，不产生状态变更
 */
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useStore } from "../data/store";
import { fmtTime } from "../data/selectors";
import { Badge, Btn, Note, Panel } from "./UI";
import { MapCanvas } from "./MapCanvas";
import { Video } from "./Video";
import { EventTimeline } from "./Business";
import type { Task } from "../data/types";

export function ReplayDetail({
  /** 待回看的已结束任务 */
  task,
}: {
  task: Task;
}) {
  const { s } = useStore();
  /** 右侧分页：巡检结果 / 风险记录 / 执行事件 */
  const [tab, SETTAB] = useState<"结果" | "风险" | "事件">("结果");
  /** 全部展开 / 收起，以及逐项展开的点位 */
  const [allOpen, SETALL] = useState(false);
  const [openIds, SETOPEN] = useState<string[]>([]);

  const robot = s.robots.find((r) => r.id === task.robotId);
  const results = s.results.filter((r) => r.taskId === task.id);
  const alarms = s.alarms.filter((a) => a.taskId === task.id);
  const items = task.items;
  /** 逐点位汇总：检测项数、异常判定与完成状态 */
  const rows = items.map((p) => {
    const rs = results.filter((r) => r.pointId === p.id);
    const state = rs.some((r) => r.abnormal)
      ? "异常"
      : rs.some(r => r.status === "待复核" || r.status === "无效")
        ? "待判定" : rs.length
        ? "正常"
        : task.skipped?.includes(p.id)
          ? "未采集"
          : task.done.includes(p.id)
            ? "已巡检"
            : "未执行";
    return { p, rs, state };
  });
  const risks = rows.filter((r) => r.state === "异常");
  const doneCount = task.done.length;
  const total = items.length;
  const rate = total ? Math.round((doneCount / total) * 100) : 0;
  /** 完成巡检项：已产出有效检测结果的数量（与「总巡检项」同口径） */
  const doneItems = results.filter((r) => r.status !== "无效").length;
  const riskTotal = risks.length + alarms.length;
  const isOpen = (pid: string) => allOpen || openIds.includes(pid);
  const toggle = (pid: string) =>
    SETOPEN((prev) =>
      prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid],
    );
  /** 地图点位着色：异常 / 失败 / 已完成 / 待执行 */
  const pointStates = Object.fromEntries(
    rows.map((r) => [
      r.p.id,
      r.state === "异常"
        ? "异常"
        : r.state === "未采集"
          ? "失败"
          : r.rs.length
            ? "已完成"
            : "待执行",
    ]),
  );

  return (
    <div className="replay-view">
      <div style={{gridColumn: "1 / -1"}}><TakeoverOutcome taskId={task.id} /></div>
      {/* 左：现场画面 + 导航地图 */}
      <div className="rv-media">
        <div className="rv-videos">
          <Video live={false} label={`${task.name} · 可见光`} />
          <Video live={false} label="红外热像" />
        </div>
        <Panel title="导航地图">
          <MapCanvas
            points={items}
            robots={robot ? [robot] : []}
            path={items.map((p) => ({ x: p.x, y: p.y }))}
            pointStates={pointStates}
            fit="xMidYMid meet"
          />
          <small className="rv-legend">
            巡检点位 {total} 个 · 已完成 {doneCount} 个 · 异常 {risks.length} 个 ·
            虚线为本次巡检路径（按点位顺序）
          </small>
        </Panel>
      </div>

      {/* 右：任务汇总 + 分页列表 */}
      <div className="rv-side">
        <div className="rv-info">
          <span>
            执行设备<b>{robot ? `${robot.name}（${robot.id}）` : "—"}</b>
          </span>
          <span>
            执行批次<b>{task.id} · m{task.mapVersion} / p{task.pointSet}</b>
          </span>
          <span>
            执行开始时间<b>{fmtTime(task.startedAt)}</b>
          </span>
          <span>
            执行结束时间<b>{fmtTime(task.finishedAt)}</b>
          </span>
          <span>
            巡检点数<b>{total} 个</b>
          </span>
          <span>
            总巡检项<b>{results.length} 项</b>
          </span>
          <span>
            完成巡检项<b>{doneItems} 项</b>
          </span>
          <span>
            完成率<b>{rate}%</b>
          </span>
          <span>
            执行结果
            <b>
              <Badge>{task.state}</Badge>
            </b>
          </span>
          <span>
            发现风险
            <b className={riskTotal ? "rv-risk" : ""}>{riskTotal} 项</b>
          </span>
        </div>

        <Panel
          title="巡检结果与风险记录"
          extra={
            tab !== "事件" && (
              <Btn onClick={() => SETALL(!allOpen)}>
                {allOpen ? "全部收起" : "全部展开"}
              </Btn>
            )
          }
        >
          <div className="rv-tabs">
            {(
              [
                ["结果", `巡检结果（${results.length}）`],
                ["风险", `风险记录（${riskTotal}）`],
                ["事件", "执行事件"],
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

          {tab === "事件" ? (
            <EventTimeline taskId={task.id} />
          ) : tab === "结果" ? (
            <div className="rv-rows">
              {!rows.length && <Note>该任务没有巡检点位。</Note>}
              {rows.map((r, i) => (
                <div
                  className={"rv-row" + (isOpen(r.p.id) ? " open" : "")}
                  key={r.p.id}
                >
                  <span className="n">{i + 1}</span>
                  <button className="name" onClick={() => toggle(r.p.id)}>
                    {r.p.name}
                  </button>
                  <span className="cnt">{r.rs.length}</span>
                  <span
                    className={
                      "st " +
                      (r.state === "异常"
                        ? "bad"
                        : r.state === "正常"
                          ? "ok"
                          : "idle")
                    }
                  >
                    {r.state}
                  </span>
                  <button
                    className="caret-btn"
                    aria-label="展开 / 收起"
                    onClick={() => toggle(r.p.id)}
                  >
                    <ChevronRight size={14} className="rv-caret" />
                  </button>
                  {isOpen(r.p.id) && (
                    <div className="rv-detail">
                      {r.rs.length ? (
                        r.rs.map((x) => (
                          <div key={x.id}>
                            <div className="rv-detail-row">
                              <i>检测项</i>
                              {r.p.object} · {x.item}
                            </div>
                            <div className="rv-detail-row">
                              <i>识别 → 最终值</i>
                              {x.recognized} → {x.final} {x.unit}
                            </div>
                            <div className="rv-detail-row">
                              <i>判断 / 复核</i>
                              <Badge>{x.status === "待复核" ? "待判定" : x.abnormal ? "异常" : "正常"}</Badge>
                              <Badge>{x.status}</Badge>
                            </div>
                            <div className="rv-detail-row">
                              <i>识别置信度</i>
                              {(x.confidence * 100).toFixed(0)}%
                            </div>
                            <div className="rv-detail-row">
                              <i>指标类型</i>
                              {r.p.kind} · {r.p.requirement}
                            </div>
                            <div className="rv-detail-row">
                              <i>采集时间</i>
                              {x.time}
                            </div>
                            <div className="rv-detail-row">
                              <i>证据来源</i>
                              {x.source}
                            </div>
                            <div className="rv-thumb">
                              <Video live={false} label={r.p.name} />
                            </div>
                          </div>
                        ))
                      ) : (
                        <Note>
                          该点位本次未采集到结果
                          {task.skipped?.includes(r.p.id) ? "（执行中被跳过）" : ""}。
                        </Note>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rv-rows">
              {!riskTotal && <Note>本次任务未发现风险项。</Note>}
              {risks.map((r, i) => (
                <div className="rv-row open" key={r.p.id}>
                  <span className="n">{i + 1}</span>
                  <span className="name-static">{r.p.name}</span>
                  <span className="cnt">
                    {r.rs.filter((x) => x.abnormal).length}
                  </span>
                  <span className="st bad">异常</span>
                  <span />
                  <div className="rv-detail">
                    {r.rs
                      .filter((x) => x.abnormal)
                      .map((x) => (
                        <div className="rv-detail-row" key={x.id}>
                          <i>异常项</i>
                          {x.item}：{x.recognized} → {x.final} {x.unit}（
                          {x.status}）
                        </div>
                      ))}
                  </div>
                </div>
              ))}
              {alarms.map((a, i) => (
                <div className="rv-row open" key={a.id}>
                  <span className="n">{risks.length + i + 1}</span>
                  <span className="name-static">{a.name}</span>
                  <span className="cnt" />
                  <span className="st bad">{a.level}</span>
                  <span />
                  <div className="rv-detail">
                    <div className="rv-detail-row">
                      <i>告警</i>
                      {a.id} · {a.pointId} · {a.time}
                    </div>
                    <div className="rv-detail-row">
                      <i>当前状态</i>
                      <Badge>{a.state}</Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
