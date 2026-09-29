import { TakeoverOutcome } from "./TakeoverOutcome";
/**
 * @file ResultView.tsx
 * @description 「巡检结果详情」内置页（由弹窗改为路由页面）：顶部任务概要 + 「AI 识别结果」分页
 *              （表计识别 / 执行记录 / 复核记录）——复核入口与复核数据留在本页，
 *              点行内「复核」进入该结果**自己的内置页**（「结果详情 / 复核」页，在其中完成复核）
 * @interaction 由 pages/ObjectDetails.tsx 的 result-view 分支渲染；复核在 pages/Results.tsx 的 review 页提交
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { fmtTime } from "../data/selectors";
import { Badge, Btn, Modal, Note, Panel, Table } from "./UI";
import { analyzedPhoto, costOf, rawPhoto } from "../data/evidence";
import type { Result, Task } from "../data/types";

export function ResultView({ task }: { task: Task }) {
  const { s } = useStore();
  /** 分页：表计识别 / 执行记录 / 复核记录 */
  const [tab, SETTAB] = useState<"表计识别" | "执行记录" | "复核记录">(
    "表计识别",
  );
  /** 导出为演示占位提示 */
  const [exportKind, SETEXPORT] = useState<"EXCEL" | "PDF" | null>(null);

  const robot = s.robots.find((r) => r.id === task.robotId);
  const map = s.maps.find((m) => m.id === task.mapId);
  const list = s.results.filter((r) => r.taskId === task.id);
  const pointOf = (pid: string) => s.points.find((p) => p.id === pid);
  /** 待复核结果数 */
  const pendings = list.filter((r) => r.status === "待复核");
  /** 巡检点异常数：存在异常结果的点位个数 */
  const abnPoints = new Set(
    list.filter((r) => r.abnormal).map((r) => r.pointId),
  ).size;
  const abnItems = list.filter((r) => r.abnormal).length;
  /** 识别结果文案：异常给结论，温度类给读数，正常即场景正常 */
  const resultText = (r: Result) =>
    r.status === "待复核" ? "待复核，尚未确认有效结论" : r.abnormal
      ? `${r.item}异常：${r.final} ${r.unit}（超出阈值）`
      : r.item.includes("温度")
        ? `最高温度: ${r.final}${r.unit}`
        : "场景正常";
  // 展示已有任务事件，不按结果行数生成预置位或控制回执。
  const camRows = s.logs.filter(log => log.object === task.id).map(log => ({
    time: log.time, point: task.id, action: `${log.action} · ${log.detail}`,
  }));
  /** 最近一次复核记录 */
  const lastReview = (r: Result) => r.reviews[r.reviews.length - 1];
  /**
   * 进入该结果自己的内置页（「结果详情 / 复核」）：复核表单与复核历史都在其中
   * @param r 目标结果
   */
  const openReview = (r: Result) =>
    go("review", r.id, undefined, { page: "result-view", id: task.id });

  return (
    <div className="rd">
      <div style={{gridColumn: "1 / -1"}}><TakeoverOutcome taskId={task.id} /></div>
      {/* 顶部：任务概要 */}
      <div className="rd-grid">
        <span>
          机器人
          <b>{robot ? `${robot.name}（${robot.id}）` : "—"}</b>
        </span>
        <span>
          地图名称
          <b>{map?.name || task.mapId}</b>
        </span>
        <span>
          任务名称
          <b>{task.name}</b>
        </span>
        <span>
          巡检点数
          <b>{task.items.length} 个</b>
        </span>
        <span>
          巡检点异常数
          <b className={abnPoints ? "rd-bad" : undefined}>{abnPoints} 个</b>
        </span>
        <span>
          巡检项数量
          <b>{list.length} 项</b>
        </span>
        <span>
          巡检项异常数
          <b className={abnItems ? "rd-bad" : undefined}>{abnItems} 项</b>
        </span>
        <span>
          开始时间
          <b>{fmtTime(task.startedAt)}</b>
        </span>
        <span>
          结束时间
          <b>{fmtTime(task.finishedAt)}</b>
        </span>
        <span>
          执行结果
          <b>
            <Badge>{task.state}</Badge>
          </b>
        </span>
        <span>
          执行批次
          <b>
            {task.id} · m{task.mapVersion} / p{task.pointSet}
          </b>
        </span>
        <span>
          终止原因
          <b>{task.failure || "—"}</b>
        </span>
      </div>

      <h4 className="rd-h">AI 识别结果</h4>
      <div className="rv-tabs">
        {(
          [
            ["表计识别", `表计识别（${list.length}）`],
            ["执行记录", "执行记录"],
            ["复核记录", `复核记录（待复核 ${pendings.length}）`],
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

      {tab === "表计识别" ? (
        !list.length ? (
          <Note>该任务暂无检测结果。</Note>
        ) : (
          <div className="table-scroll">
            <table className="rd-table">
              <thead>
                <tr>
                  {[
                    "巡检点",
                    "巡检项",
                    "台账",
                    "原始采集图像",
                    "识别分析后图像",
                    "识别结果",
                    "识别耗时",
                    "AI 状态",
                    "复核状态",
                    "时间",
                    "操作",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const p = pointOf(r.pointId);
                  const name = p?.name || r.pointId;
                  return (
                    <tr key={r.id}>
                      <td>{name}</td>
                      <td>{r.item}</td>
                      <td>{p?.device || "—"}</td>
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
                      <td className="rd-result">{resultText(r)}</td>
                      <td>{costOf(r.id)}s</td>
                      <td>
                        <span className={"rd-ai" + (r.abnormal ? " bad" : "")}>
                          {r.status === "待复核" ? "待判定" : r.abnormal ? "异常" : "正常"}
                        </span>
                      </td>
                      <td>
                        <Badge>{r.status}</Badge>
                      </td>
                      <td className="rd-time">{r.time}</td>
                      <td>
                        {/* 复核：进入该结果自己的内置页（结果详情 / 复核） */}
                        <Btn
                          primary={r.status === "待复核"}
                          title="进入该结果的「结果详情 / 复核」内置页"
                          onClick={() => openReview(r)}
                        >
                          复核
                        </Btn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
      ) : (
        /* 复核记录：本任务逐项复核状态与最近结论；点「复核」进入该结果自己的内置页 */
        <Panel
          title="复核记录"
          extra={
            <Btn
              primary
              disabled={!pendings.length}
              onClick={() => openReview(pendings[0])}
            >
              复核待处理项
            </Btn>
          }
        >
          <Note>
            复核表单与复核历史在该结果自己的内置页（「结果详情 / 复核」）中完成，本页只做汇总与入口。
          </Note>
          <Table
            heads={[
              "结果",
              "巡检点 / 检测项",
              "识别 → 最终值",
              "AI 判断",
              "复核状态",
              "最近复核（时间 / 结论 / 依据）",
              "操作",
            ]}
            rows={list.map((r) => {
              const lr = lastReview(r);
              return [
                r.id,
                <>
                  {pointOf(r.pointId)?.name}
                  <small>{r.item}</small>
                </>,
                `${r.recognized} → ${r.final} ${r.unit}`,
                <Badge>{r.status === "待复核" ? "待判定" : r.abnormal ? "异常" : "正常"}</Badge>,
                <Badge>{r.status}</Badge>,
                lr
                  ? `${lr.time} / ${lr.conclusion || "确认"} / ${lr.reason}`
                  : "—",
                <Btn onClick={() => openReview(r)}>复核</Btn>,
              ];
            })}
          />
        </Panel>
      )}

      {/* 底部操作：任务回溯（进入自己的内置页）/ 导出（演示占位）；返回使用页面顶部返回 */}
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
        <Btn onClick={() => SETEXPORT("EXCEL")}>导出为 EXCEL</Btn>
        <Btn primary onClick={() => SETEXPORT("PDF")}>
          导出为 PDF
        </Btn>
      </div>
      <small className="rd-hint">
        演示环境：图像为离线生成的示意画面；导出按钮为占位提示，不生成真实文件。
      </small>

      {exportKind && (
        <Modal title={`导出为 ${exportKind}`} onClose={() => SETEXPORT(null)}>
          <Note>
            演示环境暂不生成真实文件。生产环境将按该任务导出「巡检结果详情」（
            {exportKind}），含任务概要、逐巡检点检测项、原始采集图像、AI 识别后图像与复核结论。
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
