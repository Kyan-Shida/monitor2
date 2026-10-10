import { QuickTaskDrawer } from "../components/QuickTaskDrawer";
import { useState } from "react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { stages, type Robot, type Task } from "../data/types";
import { stageOf, terminal, judgeOf } from "../data/selectors";
import {
  Btn,
  Badge,
  Panel,
  Note,
  Steps,
  Table,
  Modal,
  Field,
} from "../components/UI";
import { ObjectLink, Kpis, EventTimeline } from "../components/Business";
import { MapCanvas } from "../components/MapCanvas";
import { Video } from "../components/Video";
/**
 * 任务是否属于「今日排期」
 * @description 以计划时间（notBefore）判定；临时任务没有计划时间则取生成时间。
 *              时间不可解析时按今日处理，避免整条任务被静默吞掉
 * @param t 任务
 * @returns 计划 / 生成时间是否落在当天
 */
function isToday(t: Task): boolean {
  const ts = Date.parse(t.notBefore || t.created);
  if (Number.isNaN(ts)) return true;
  const d = new Date(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function Execution() {
  const { s } = useStore();
  /**
   * EXE-02（P0-阻断）：执行监控首页为「任务维度总览」——以任务为中心（不再先选机器人），
   * 异常项优先置顶；每一行都给「监控」入口（含未运行任务：进入后展示机器人实时地图/视频/状态），
   * 行内查看任务详情由「当前任务」列的对象链接承担。
   */
  const overview = s.tasks
    // EXE-02：只显示今日排期任务（计划时间缺省取生成时间），明天/后天的排期不进执行总览
    .filter((t) => !terminal.includes(t.state) && isToday(t))
    .map((t) => {
      const res = s.results.filter((r) => r.taskId === t.id);
      return {
        t,
        robot: s.robots.find((x) => x.id === t.robotId),
        abn: res.filter((r) => r.abnormal).length,
        /** 未处理告警：异常即告警，与告警事件页同源 */
        pend: s.alarms.filter((a) => a.taskId === t.id && !a.handledAt).length,
        done: res.length,
      };
    })
    .sort((a, b) => {
      const rank = (x: typeof overview[number]) =>
        (x.abn > 0 ? 0 : 1) * 10 +
        (x.t.state === "已被接管"
          ? 0
          : x.t.state === "执行中"
            ? 1
            : x.t.state === "暂停"
              ? 2
              : 3);
      return rank(a) - rank(b);
    });
  return (
    <Panel
      title={`执行总览 · 任务维度（${overview.length}）`}
      extra={<></>}
    >
      {overview.length ? (
        <Table
          heads={["机器人", "当前任务", "状态", "操作"]}
          rows={overview.map(({ t, robot: rb }) => [
            rb ? (
              <ObjectLink type="robot" id={rb.id}>
                {rb.name}
              </ObjectLink>
            ) : (
              t.robotId || "未分配"
            ),
            <ObjectLink type="task-detail" id={t.id}>
              {t.name}
            </ObjectLink>,
            <Badge>{t.state}</Badge>,
            <Btn primary onClick={() => go("execution-monitor", t.id)}>
              监控
            </Btn>,
          ])}
        />
      ) : (
        <Note>当前没有进行中的任务。</Note>
      )}
    </Panel>
  );
}

/**
 * 单任务现场态势（内置页 `execution-monitor`）：地图 + 现场视频 + 任务进度与控制
 * @param id 任务 id；缺省取所选机器人的当前任务
 */
export function ExecutionMonitor({ id }: { id?: string }) {
  const { s } = useStore();
  const linkedTask = s.tasks.find((task) => task.id === id);
  const [robotId, setRobotId] = useState(
    linkedTask?.robotId ||
      s.robots.find((robot) => robot.current)?.id ||
      s.robots[0]?.id ||
      "",
  );
  const robot = s.robots.find((item) => item.id === robotId);
  const liveTasks = s.tasks.filter(
    (task) =>
      task.robotId === robotId &&
      ["执行中", "已被接管", "暂停"].includes(task.state),
  );
  const task =
    liveTasks.find((item) => item.id === id) ||
    liveTasks.find((item) => item.id === robot?.current) ||
    liveTasks[0];
  return (
    <>
      {task ? (
        <LiveTaskMonitor key={task.id} id={task.id} />
      ) : (
        <RobotIdleMonitor robot={robot} task={linkedTask} />
      )}
    </>
  );
}
/**
 * 机器人实时状况：即使没有正在执行的任务，也展示机器人地图、现场视频与状态，
 * 满足「点击任务即可查看实时状况（未运行也可监控）」。
 */
function RobotIdleMonitor({ robot, task }: { robot?: Robot; task?: Task }) {
  return (
    <Panel title="机器人实时状况">
      {task && (
        <div className="execution-summary">
          <div className="execution-summary-primary">
            <Badge>{task.state}</Badge>
            <ObjectLink type="robot" id={robot?.id}>
              {robot?.name || "未分配机器人"}
            </ObjectLink>
            <ObjectLink type="task-detail" id={task.id}>
              {task.name}（任务详情）
            </ObjectLink>
          </div>
        </div>
      )}
      <div className="live-workspace">
        <section className="live-scene">
          <div className="live-scene-tabs">
            <b>现场态势</b>
          </div>
          <div className="live-visual live-dual-view">
            <Panel title="巡检地图 · 当前业务点位">
              <MapCanvas
                points={[]}
                robots={robot ? [robot] : []}
                onRobot={(id) => go("robot", id)}
              />
            </Panel>
            <Panel title="现场视频 · 机器人自主观测">
              <Video robotId={robot?.id} />
              {!task && robot && (
                <p className="muted">
                  {robot.name}
                  当前没有执行中或暂停的任务，可实时查看其地图与现场视频。
                </p>
              )}
            </Panel>
          </div>
        </section>
        <aside className="live-control-column">
          <Panel
            title="机器人状态"
            extra={robot ? <Badge>{robot.state}</Badge> : undefined}
          >
            {robot ? (
              <div className="execution-facts">
                <span>
                  <small>所属区域</small>
                  {robot.region}
                </span>
                <span>
                  <small>电量</small>
                  {robot.battery}%
                </span>
                <span>
                  <small>机型</small>
                  {robot.deviceType}
                </span>
                <span>
                  <small>地图版本</small>V{robot.mapVersion}
                </span>
              </div>
            ) : (
              <p className="muted">暂无可监控的机器人。</p>
            )}
            <div className="actions">
              <Btn primary onClick={() => go("dispatch")}>
                前往调度中心
              </Btn>
              {robot && (
                <Btn onClick={() => go("manual", robot.id)}>
                  人工操作与遥控
                </Btn>
              )}
            </div>
          </Panel>
        </aside>
      </div>
    </Panel>
  );
}
function LiveTaskMonitor({ id }: { id: string }) {
  const { s, act } = useStore();
  // 执行监控只展示进行中的任务（执行中 / 已被接管 / 暂停：均属执行途中，仍需可监控/恢复/接管）
  // EXE-01：第一阶段颗粒度放粗 —— 只保留位置、当前任务/巡检点、相机画面与最终结果，
  // 不呈现「聚焦中 / 快聚焦到」等高频过程态（本体多数无法实时反馈，接口负担也大）。
  const liveStates = ["执行中", "已被接管", "暂停"];
  const t = s.tasks.find(task => task.id === id)!;
  const liveTasks = s.tasks.filter(task => task.robotId === t.robotId && liveStates.includes(task.state));
  const r = s.robots.find((r) => r.id === t.robotId),
    p = t.items[t.index];
  const [abnormal, A] = useState(false),
    [quickOpen, setQuickOpen] = useState(false),
    [submittedTask, setSubmittedTask] = useState("");
  const results = s.results.filter((x) => x.taskId === t.id);
  const valid = results.filter(
    (x) => !["无效", "失败", "待复核"].includes(x.status),
  );
  return (
    <>
      <div className="execution-summary">
        <div className="execution-summary-primary">
          <select
            aria-label="监控任务"
            value={t.id}
            onChange={(e) => go("execution-monitor", e.target.value)}
          >
            {liveTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id} · {t.name} · {t.state}
              </option>
            ))}
          </select>
          <Badge>{t.state}</Badge>
          <ObjectLink type="robot" id={r?.id}>
            {r?.name || "未分配机器人"}
          </ObjectLink>
          <ObjectLink type="task-detail" id={t.id}>
            任务详情
          </ObjectLink>
        </div>
        <div className="execution-summary-meta">
          <span>
            <small>开始时间</small>
            {t.startedAt
              ? new Date(t.startedAt).toLocaleTimeString()
              : t.created}
          </span>
          <span>
            <small>版本</small>V{t.mapVersion}
          </span>
          <span>
            <small>任务类型</small>
            {t.taskType || "综合巡检任务"}
          </span>
          <span>
            <small>原子动作</small>
            {(t.atomicActions || []).join(" / ") || "按检测项执行"}
          </span>
        </div>
      </div>
      {!liveStates.includes(t.state) && <Note>当前没有执行中或暂停的任务。<Btn onClick={() => go("dispatch")}>前往调度中心</Btn></Note>}
      <div className="live-workspace">
        <section className="live-scene">
          <div className="live-scene-tabs"><b>现场态势</b></div>
          <div className="live-visual live-dual-view">
        <Panel title="巡检地图 · 当前业务点位">
          <MapCanvas
            points={t.items}
            robots={r ? [r] : []}
            selected={p?.targetId}
            pointStates={Object.fromEntries(
              t.items.map((p) => [
                p.id,
                t.skipped.includes(p.id)
                  ? "失败"
                  : results.some((x) => x.pointId === p.id && x.abnormal)
                    ? "异常"
                    : t.done.includes(p.id)
                      ? "已完成"
                      : "待执行",
              ]),
            )}
            onSelect={(id) =>
              go("point", t.items.find((p) => p.targetId === id)?.id)
            }
            onRobot={(id) => go("robot", id)}
          />
        </Panel>
        <Panel title="现场视频 · 机器人自主观测">
          <Video label={p?.name} robotId={r?.id} />
          <div className="execution-facts">
            <span>
              目标识别 <b>{t.stage >= 2 ? "已锁定" : "搜索中"}</b>
            </span>
            <span>
              自主调整 <b>{t.stage >= 3 ? "按现场视角调整" : "待目标锁定"}</b>
            </span>
            <span>
              采集要求 <b>{p?.requirement || "完成当前检测项"}</b>
            </span>
          </div>
        </Panel>
          </div>
        <Panel title="实时结果">
          <Table
            heads={["检测项", "最终值", "结果状态", "详情"]}
            rows={results.map((x) => [
              x.item,
              `${x.final} ${x.unit}`,
              <Badge>{judgeOf(x)}</Badge>,
              <ObjectLink type="review" id={x.id}>
                结果证据 →
              </ObjectLink>,
            ])}
          />
        </Panel>
          <details className="live-history"><summary>任务事件时间轴</summary>
        <Panel title="任务事件时间轴">
          {/* EXE-01：第一阶段颗粒度放粗，事件轴只记录关键节点，不追聚焦等高频过程态 */}
          <Note>
            第一阶段颗粒度放粗：事件轴只记录关键节点（到点 / 采集完成 / 异常），
            不呈现「聚焦中 / 快聚焦到」等本体无法稳定实时反馈的过程态。
          </Note>
          <EventTimeline taskId={t.id} />
        </Panel>
          </details>
      <details className="simulation">
        <summary>演示事件注入 · 模拟机器人回报</summary>
        <div className="actions">
          <label>
            <input
              type="checkbox"
              checked={abnormal}
              onChange={(e) => A(e.target.checked)}
            />{" "}
            生成异常结果
          </label>
          <Btn
            primary
            disabled={t.state !== "执行中" || !!t.failure}
            onClick={() => act({ type: "TICK", id: t.id, abnormal })}
          >
            模拟下一自主阶段回报
          </Btn>
          {[
            "目标未找到",
            "目标存在歧义",
            "不可达",
            "采集质量不足",
            "传感器异常",
            "AI分析失败",
          ].map((reason) => (
            <Btn
              key={reason}
              disabled={t.state !== "执行中"}
              onClick={() => act({ type: "FAIL", id: t.id, reason })}
            >
              {reason}
            </Btn>
          ))}
          <Btn
            disabled={t.state !== "执行中"}
            onClick={() => act({ type: "TASK_FINISHED", id: t.id })}
          >
            模拟 TASK_FINISHED
          </Btn>
        </div>
        <small>
          结束回报后按有效检测项判定完成、部分完成或失败，未形成结果的检测项不会自动计为成功。
        </small>
      </details>
        </section>
        <aside className="live-control-column">
          <Panel title="任务进度与控制" extra={<Badge>{t.state}</Badge>}>
            <div className="live-progress"><b>{stageOf(t)}</b><span>已完成 {t.done.length} / {t.items.length} 个检测项</span></div>
            <progress aria-label="任务完成进度" value={t.done.length} max={Math.max(1,t.items.length)} />
            <div className="live-counts"><span>未处理告警 <b>{s.alarms.filter(a => a.taskId === t.id && !a.handledAt).length}</b></span><span>异常 <b>{results.filter(x => x.abnormal).length}</b></span><span>失败 / 跳过 <b>{t.skipped.length}</b></span></div>
      <div className="live-task-controls">

        <Btn primary onClick={() => setQuickOpen(true)}>
          ＋ 下发临时任务
        </Btn>
        <Btn
          disabled={t.state !== "执行中"}
          onClick={() => act({ type: "PAUSE", id: t.id })}
        >
          暂停任务
        </Btn>
        <Btn
          disabled={t.state !== "暂停"}
          onClick={() => act({ type: "START", id: t.id })}
        >
          恢复任务
        </Btn>
        <Btn disabled={!r} onClick={() => go("manual", r?.id)}>
          人工接管 →
        </Btn>
        <Btn
          danger
          disabled={!["执行中", "暂停"].includes(t.state)}
          onClick={() => act({ type: "STOP", id: t.id })}
        >
          终止任务
        </Btn>
        {t.failure && (
          <>
            <Badge>{t.failure}</Badge>
            <Btn onClick={() => act({ type: "RETRY", id: t.id })}>重试目标</Btn>
            <Btn onClick={() => act({ type: "SKIP", id: t.id })}>
              跳过检测项
            </Btn>
          </>
        )}
      </div>
            <details className="live-stages"><summary>查看自主执行阶段</summary><ol>{stages.map((stage,index) => <li key={stage} className={index === t.stage ? "current" : ""}>{stage}{index === t.stage ? " · 当前" : ""}</li>)}</ol></details>
          </Panel>
      {submittedTask && (
        <Note>
          临时任务 <ObjectLink type="task-detail" id={submittedTask} />
          已由目标机器人接收并进入待执行队列。当前任务保持执行，不改变断点。
          <div className="actions">
            <Btn onClick={() => go("dispatch", submittedTask)}>
              查看调度详情
            </Btn>
            <Btn
              onClick={() =>
                go(
                  "queue",
                  s.tasks.find((x) => x.id === submittedTask)?.robotId,
                )
              }
            >
              查看机器人队列
            </Btn>
          </div>
        </Note>
      )}
        <Panel title="检测项完成情况">
          <div className="checklist">
            {t.items.map((x) => {
              const rs = results.find((z) => z.pointId === x.id);
              return (
                <div key={x.id} className={p?.id === x.id ? "selected" : ""}>
                  <div className="split">
                    <ObjectLink type="point" id={x.id}>
                      {x.name}
                    </ObjectLink>
                    <Badge>
                      {t.done.includes(x.id)
                        ? "完成"
                        : t.skipped.includes(x.id)
                          ? "失败 / 跳过"
                          : p?.id === x.id
                            ? t.failure || "执行中"
                            : "待执行"}
                    </Badge>
                  </div>
                  <p>
                    {x.object} / {x.item}
                  </p>
                  {rs && (
                    <ObjectLink type="review" id={rs.id}>
                      {rs.final} {rs.unit} · {rs.status} →
                    </ObjectLink>
                  )}
                </div>
              );
            })}
          </div>
          <p>
            有效结果 {valid.length} 条 · 已满足 {t.done.length} 个检测项
          </p>
        </Panel>
        </aside>
      </div>
      {quickOpen && (
        <QuickTaskDrawer
          robotId={t.robotId}
          pointIds={p ? [p.id] : []}
          onClose={() => setQuickOpen(false)}
          onCreated={setSubmittedTask}
        />
      )}
    </>
  );
}
