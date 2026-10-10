import { TakeoverOutcome } from "../components/TakeoverOutcome";
import { FieldControls } from "../components/FieldControls";
import { useState } from "react";
import { useStore } from "../data/store";
import { mapVer } from "../data/versionLabel";
import { go } from "../data/navigation";
import { Btn, Badge, Panel, Table, Note, Field } from "../components/UI";
import { MapCanvas } from "../components/MapCanvas";
import { Video } from "../components/Video";
import { Can, useRole } from "../components/Can";
import { PERMS } from "../data/roles";
export { Execution, ExecutionMonitor } from "./ExecutionWorkbench";
/**
 * 人工接管与遥控控制台主体
 * @description 内嵌于「人工操作与遥控」页；机器人身份由该页页头的选择器确定，故此处不再重复选择器
 * @param robotId 当前机器人 ID
 */
export function ControlConsole({ robotId }: { robotId: string }) {
  const { s, act } = useStore();
  const role = useRole();
  const r = s.robots.find((x) => x.id === robotId) || s.robots[0];
  const x = s.sessions.find(
    (y) => y.robotId === r.id && !["已释放", "已超时"].includes(y.state),
  );
  const t = s.tasks.find((y) => y.id === r.current);
  /** TKO-01：机器人主动「申请人工接管」产生的待处理会话 */
  const robotReqs = s.sessions.filter(
    (y) =>
      y.robotId === r.id &&
      y.origin === "机器人申请" &&
      y.state === "待暂停确认",
  );
  const [checked, C] = useState(false);
  const [view, setView] = useState<"video" | "map">("video");
  const latest = s.sessions.find(y => y.robotId === r.id);
  const session = x || latest;
  const evidence = session ? s.results.filter(result => result.source.includes(session.id)) : [];
  const logs = s.logs.filter(l => s.sessions.some(y => y.robotId === r.id && (l.object === y.id || l.detail.includes(y.id))));
  const outcome = x?.state || (latest?.resumedAt ? "已恢复自主执行" : latest?.state === "已释放" ? "控制权已释放" : latest?.state || "未接管");
  return (
    <>
      <div className="context-bar">
        <Badge>{r.state}</Badge>
        <span>
          电量 {r.battery}% · {mapVer(r.mapVersion)}
        </span>
        <span>当前任务：{t?.name || "无执行任务"}</span>
        <Badge>{outcome}</Badge>
      </div>
      <div className="manual-workspace">
        <section className="manual-scene">
          <Panel title="现场态势" extra={<div className="segmented"><button className={view === "video" ? "active" : ""} onClick={() => setView("video")}>实时视频</button><button className={view === "map" ? "active" : ""} onClick={() => setView("map")}>位置地图</button></div>}>
            <div className="manual-visual">
              {view === "video" ? <Video pan={x?.pan} /> : <MapCanvas points={s.points.filter(p => p.mapId === r.mapId)} robots={[r]} />}
            </div>
            <div className="manual-readout"><span>当前位置：X {r.x} / Y {r.y}</span><span>云台：水平 {x?.pan || 0}° / 俯仰 {x?.tilt || 0}°</span><span>操作反馈：{logs[0]?.detail || "暂无操作回执"}</span></div>
          </Panel>
          <Panel title="本次接管 · 采集与处理" extra={<Badge>{outcome}</Badge>}>
            {session ? <><div className="manual-readout"><span>采集证据 <b>{evidence.length}</b> 条</span><span>会话 {session.id}</span></div>
              {evidence.length ? <Table heads={["采集项", "处理状态", "操作"]} rows={evidence.slice(0,3).map(result => [result.item, <Badge>{result.status}</Badge>, <Btn onClick={() => go("result-detail", result.id)}>查看结果</Btn>])}/> : <p className="muted">本次尚未采集证据。人工采集结果独立留档，不覆盖自主结果。</p>}
              {latest?.resumedAt && !x && <p>原任务已于 {new Date(latest.resumedAt).toLocaleTimeString("zh-CN")} 恢复自主执行。</p>}
            </> : <p className="muted">申请接管后，这里展示本次采集证据和处理状态。</p>}
            <details className="manual-history"><summary>查看完整接管记录、证据与操作回执</summary><TakeoverOutcome robotId={r.id}/></details>
          </Panel>
        </section>
        <aside className="manual-controls">
        <Panel title="接管与任务控制" extra={<Badge>{outcome}</Badge>}>
          {/* TKO-03：第一阶段接管＝「借调」：任务暂停 → 人工操作 → 释放 → 恢复原任务 */}
          <p className="muted">
            {x?.state === "已接管"
              ? "控制权已取得（借调中）：可移动机器人或采集证据，做完人工的事后释放并恢复原任务。"
              : x?.state === "待暂停确认"
                ? "下一步：确认机器人已暂停，取得控制权。"
                : x?.state === "退出核对中"
                  ? "下一步：核对现场与任务，释放控制权。"
                  : ["暂停", "已被接管"].includes(t?.state || "")
                    ? "下一步：明确恢复原任务。"
                    : latest?.resumedAt
                      ? "任务已恢复；需要再次操作时可申请新会话。"
                      : "先申请接管，再进行移动、云台和采集操作。"}
          </p>
          {/* TKO-01：机器人申请人工接管 —— 人从异常入口进入，而非主动切入 */}
          {!!robotReqs.length && (
            <Note>
              <b>机器人申请人工接管</b>（{robotReqs.length}）：机器人自主处理超时，请接管或跳过。
              <div className="actions">
                <Btn
                  primary
                  onClick={() =>
                    act({ type: "CONTROL_ACK", id: robotReqs[0].id })
                  }
                >
                  接管（确认已暂停）
                </Btn>
                <Btn
                  onClick={() =>
                    act({ type: "ROBOT_TAKEOVER_SKIP", robotId: r.id })
                  }
                >
                  跳过（机器人继续）
                </Btn>
              </div>
            </Note>
          )}
          {!x && (
            <Can perm={PERMS.接管申请}>
              <Btn
                primary={!["暂停", "已被接管"].includes(t?.state || "")}
                disabled={r.state === "离线"}
                onClick={() => {
                  C(false);
                  act({ type: "TAKEOVER", robotId: r.id });
                }}
                title="人工主动接管（区别于机器人申请）"
              >
                申请接管（人工主动）
              </Btn>
            </Can>
          )}
          {/* TKO-01 演示：模拟机器人端发起接管申请（现场由机器人自主触发） */}
          {!x && !robotReqs.length && r.state !== "离线" && (
            <Btn
              onClick={() => act({ type: "ROBOT_TAKEOVER_REQ", robotId: r.id })}
              title="演示：模拟机器人自主处理超时后申请人工接管"
            >
              机器人申请接管（演示）
            </Btn>
          )}
          <p>持有人：{x ? role.person : "无"}</p>

          <small>{x?.id}</small>
          {x?.state === "待暂停确认" && (
            <Btn primary onClick={() => act({ type: "CONTROL_ACK", id: x.id })}>
              确认机器人已暂停
            </Btn>
          )}
          {x?.state === "已接管" && (
            <>
              <p>有效至 {new Date(x.expires).toLocaleTimeString()}</p>
              <div className="remote-pad">
                {["前进", "停止", "后退", "左移", "右移"].map((cmd) => (
                  <Btn
                    key={cmd}
                    onClick={() =>
                      act({ type: "CONTROL", id: x.id, command: cmd })
                    }
                  >
                    {cmd}
                  </Btn>
                ))}
              </div>
              <h4>云台与采集</h4>
              <div className="actions">
                {["云台左转", "云台右转", "云台抬头", "采集照片"].map((cmd) => (
                  <Btn
                    key={cmd}
                    onClick={() =>
                      act({ type: "CONTROL", id: x.id, command: cmd })
                    }
                  >
                    {cmd}
                  </Btn>
                ))}
              </div>
              <hr />
              <Btn
                primary
                onClick={() => act({ type: "CONTROL_EXIT", id: x.id })}
              >
                退出人工接管
              </Btn>
            </>
          )}
          {x?.state === "退出核对中" && (
            <>
              <Note>
                当前任务 {t?.name || "无"}；已完成 {t?.done.length || 0} 项 /
                剩余 {(t?.items.length || 0) - (t?.done.length || 0)}{" "}
                项。实际版本 {mapVer(r.mapVersion)}。
              </Note>
              <Field label="恢复核对">
                <label>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => C(e.target.checked)}
                  />{" "}
                  已确认版本、任务断点、结果一致
                </label>
              </Field>
              <Btn
                primary
                disabled={!checked}
                onClick={() =>
                  act({ type: "CONTROL_RELEASE", id: x.id, checked })
                }
              >
                释放控制权
              </Btn>
            </>
          )}
          {/* TKO-04：被接管的任务在释放后需在此显式恢复 */}
          {!x && t && ["暂停", "已被接管"].includes(t.state) && (
            <Btn
              primary
              onClick={() => {
                act({ type: "START", id: t.id });
              }}
            >
              恢复任务
            </Btn>
          )}
        </Panel>
          <FieldControls key={r.id} robotId={r.id} />
        </aside>
      </div>
    </>
  );
}
