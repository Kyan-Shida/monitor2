import { useState } from "react";
import { useStore } from "../data/store";
import { constraints } from "../data/engine";
import { go, usePageSize, useViewState } from "../data/navigation";
import { Btn, Badge, Panel, Table, Note, Modal, Field } from "../components/UI";
import { ObjectLink, Kpis, Pager } from "../components/Business";
import { QueueStrip } from "../components/QueueStrip";
import { mapVer } from "../data/versionLabel";
import {
  queueFor,
  currentTask,
  robotQueue,
  checks,
  queueStates,
} from "../data/selectors";
export function Scheduling({ page, id }: { page: string; id?: string }) {
  const { s, act } = useStore();
  const [selected, SEL] = useViewState(
    page + ".task." + (id || "all"),
    id && s.tasks.some((t) => t.id === id)
      ? id
      : (page === "queue"
          ? s.tasks.find(
              (t) =>
                t.robotId === (id || "R01") && queueStates.includes(t.state),
            )?.id
          : undefined) ||
          s.tasks.find((t) => t.state === "待调度")?.id ||
          s.tasks[0].id,
  );
  const [rid, R] = useViewState(
    page + ".robot." + (id || "all"),
    id && s.robots.some((r) => r.id === id) ? id : "R01",
  );
  const [q, Q] = useViewState(page + ".query", "");
  const [dPn, DP] = useViewState("scheduling.dispatch.page", 1);
  // 每页条数：与全站列表口径一致（默认 5 条，可切 10 / 20）
  const [dSize, SETDSIZE] = usePageSize("scheduling.dispatch.size");
  const [modal, M] = useState(""),
    [reassign, RA] = useState("R02"),
    [mode, SETMODE] = useState<"queue" | "now">("queue");
  const t = s.tasks.find((t) => t.id === selected) || s.tasks[0],
    r = s.robots.find((r) => r.id === rid) || s.robots[0];
  const cur = currentTask(s, r);
  const check = checks(s, t, r);
  // 待调度任务池只列「尚未分派」的任务；已分配 / 已下发等进入执行流程的任务不再占据调度池
  const pending = s.tasks.filter((t) => t.state === "待调度");
  const ts = queueFor(s, r.id);
  const ix = ts.findIndex((x) => x.id === t.id);
  /** 选中任务在该机器人队列里的位置（平台不估算耗时，只说先后） */
  const queuePos =
    t.id === cur?.id ? "执行中" : ix >= 0 ? `第 ${ix + 1} 位` : "未入列";
  /** 派单记录（队列中 + 暂停的任务）：分页切片后交给表格 */
  const dispatchList = s.tasks.filter(
    (x) => queueStates.includes(x.state) || x.state === "暂停",
  );
  const dPages = Math.max(1, Math.ceil(dispatchList.length / dSize));
  const dCur = Math.min(Math.max(1, dPn), dPages);
  const dRows = dispatchList.slice((dCur - 1) * dSize, dCur * dSize);
  const canAssign = ["待调度", "已分配"].includes(t.state);
  // 一次派单：引擎侧将 分配→下发→接收→启动 收敛为原子动作，避免工作台逐点手动分步
  function dispatchTask() {
    act({
      type: mode === "now" ? "DISPATCH_NOW" : "ENQUEUE",
      id: t.id,
      robotId: r.id,
    });
  }
  const exactId = id && s.tasks.some((x) => x.id === id) ? id : undefined;
  // An explicit task drill-down selects that task on first mount; persisted selection remains on return.
  /** 顶部 KPI 按「任务 / 执行 / 机器人」三类归组，每项 hover 可见统计口径；仅调度工作台页展示 */
  const headline = (
    <>
      <Kpis
        items={[
          {
            label: "待调度",
            value: s.tasks.filter((t) => t.state === "待调度").length,
            group: "任务",
            hint: "口径：状态为「待调度」的任务数，等待分配机器人",
          },
          {
            label: "即将超期",
            value: s.tasks.filter(
              (t) =>
                t.deadline &&
                Date.parse(t.deadline) - Date.now() < 900000 &&
                t.state === "待调度",
            ).length,
            group: "任务",
            hint: "口径：待调度且距截止时间不足 15 分钟的任务数",
          },
          {
            label: "执行中",
            value: s.robots.filter((r) => r.state === "执行中").length,
            group: "执行",
            hint: "口径：当前状态为「执行中」的机器人数量",
          },
          {
            label: "已排队",
            value: s.tasks.filter((t) => queueStates.includes(t.state)).length,
            group: "执行",
            hint: "口径：已分配 / 下发中 / 待执行等已进入机器人队列的任务数",
          },
          {
            label: "空闲机器人",
            value: s.robots.filter((r) => r.state === "空闲").length,
            group: "机器人",
            hint: "口径：状态为「空闲」、可立即接收任务的机器人数量",
          },
          {
            label: "版本待同步",
            value: s.robots.filter((r) => {
              const m = s.maps.find((m) => m.id === r.mapId);
              return (
                m && m.version !== r.mapVersion
              );
            }).length,
            group: "机器人",
            hint: "口径：地图版本与机器人激活版本不一致的机器人数量，需先同步才能下发",
          },
        ]}
      />
      <Note>
        KPI 分「任务 / 执行 / 机器人」三类，鼠标悬停任一指标可查看其统计口径；数值随任务与机器人状态实时变化。
      </Note>
    </>
  );

  /** 调度工作台：单一「派单」动作 + 方式切换，替代原先 加入队列/立即下发/模拟接收回执 多步操作 */
  const dispatchControls = (
    <div className="decision-actions dispatch-actions">
      <div className="dispatch-mode">
        <span className="muted">派单方式</span>
        <div className="segmented">
          <button
            className={mode === "queue" ? "active" : ""}
            onClick={() => SETMODE("queue")}
          >
            加入队列
          </button>
          <button
            className={mode === "now" ? "active" : ""}
            onClick={() => SETMODE("now")}
          >
            立即执行
          </button>
        </div>
      </div>
      {canAssign ? (
        <Btn
          primary
          disabled={
            constraints(s, t, r).filter((x) => x !== "地图版本待同步")
              .length > 0
          }
          onClick={dispatchTask}
          title="将任务一次性分配并下发至选中机器人"
        >
          {mode === "now" ? "立即派单执行" : "派单入列"}
        </Btn>
      ) : (
        <Note>该任务已派单或处于执行流程，管理操作请到「机器人任务队列」。</Note>
      )}
      {mode === "now" && r.current && (
        <Note>机器人当前有执行任务，将先下发排队，待其结束后续执行。</Note>
      )}
    </div>
  );
  /** 机器人任务队列：仅保留队列管理动作，按任务状态渐进显隐；不再复刻派单按钮 */
  const queueControls = (
    <div className="decision-actions">
      {t.state === "已分配" && <Btn primary onClick={() => act({ type: "ENQUEUE", id: t.id, robotId: r.id })}>继续派单</Btn>}
      {(t.state === "暂停" || (t.state === "待执行" && !r.current)) && (
        <Btn
          primary
          onClick={() => act({ type: "START", id: t.id, robotId: r.id })}
        >
          {t.state === "暂停" ? "恢复任务" : "开始任务"}
        </Btn>
      )}
      {t.state === "执行中" && (
        <Btn onClick={() => act({ type: "PAUSE", id: t.id })}>暂停任务</Btn>
      )}
      {["已分配", "下发中", "待执行"].includes(t.state) && (
        <Btn onClick={() => M("reassign")}>改派</Btn>
      )}
      {["已分配", "待执行"].includes(t.state) && (
        <Btn onClick={() => act({ type: "REORDER", id: t.id })}>置于队首</Btn>
      )}
      {cur && cur.id !== t.id && (
        <Btn danger onClick={() => M("preempt")}>
          任务抢占
        </Btn>
      )}
      {["已分配", "下发中", "待执行"].includes(t.state) && (
        <Btn onClick={() => act({ type: "WITHDRAW", id: t.id, confirmed: true })}>
          移除出列
        </Btn>
      )}
    </div>
  );
  /** 约束校验拆分：不满足项置顶，调度员第一眼先看卡点 */
  const blocked = check.filter((x) => !x.pass);
  const passed = check.filter((x) => x.pass);
  const detail = (
    <>
      <dl className="kv decision-selected">
        <dt>选中任务</dt>
        <dd>
          <ObjectLink type="task-detail" id={t.id}>
            {t.name}
          </ObjectLink>
          <small>{t.id}</small>
        </dd>
        <dt>候选机器人</dt>
        <dd>
          <ObjectLink type="robot" id={r.id}>
            {r.id} · {r.name}
          </ObjectLink>
        </dd>
      </dl>
      <div className="constraint-summary">
        <span className="ok">{passed.length} 项通过</span>
        {blocked.length > 0 && (
          <span className="no">{blocked.length} 项不满足</span>
        )}
      </div>
      <div className="constraint-list">
        {[...blocked, ...passed].map((x) => (
          <div
            key={x.name}
            className={x.pass ? undefined : "is-blocked"}
          >
            <i className={x.pass ? "pass" : "blocked"}>{x.pass ? "✓" : "!"}</i>
            <div>
              <b>{x.name}</b>
              <small>{x.detail}</small>
            </div>
          </div>
        ))}
      </div>
    </>
  );
  return (
    <>
      {page === "dispatch" && headline}
      {page === "dispatch" ? (
        <>
          <div className="dispatch-workbench workbench-surface">
            <section className="task-pool">
              <div className="split">
                <h3>
                  待调度任务池 <small>{pending.length} 个任务</small>
                </h3>
              </div>
              <input
                aria-label="调度任务搜索"
                placeholder="搜索任务 / 来源"
                value={q}
                onChange={(e) => Q(e.target.value)}
              />
              <div className="pool-scroll">
                {pending
                  .filter((t) => (t.name + t.id + t.source).includes(q))
                  .map((t) => (
                    <article
                      className={
                        "pool-task " + (selected === t.id ? "selected" : "")
                      }
                      key={t.id}
                      onClick={() => SEL(t.id)}
                    >
                      {/* 主行：任务名 + 状态，便于快速扫读 */}
                      <div className="pool-task-head">
                        <h4>{t.name}</h4>
                        <Badge>{t.state}</Badge>
                        {/* 点开看细节：跳转任务完整详情页（阻止冒泡，避免误改选中） */}
                        <button
                          className="card-detail-link"
                          title="查看任务完整详情"
                          onClick={(e) => {
                            e.stopPropagation();
                            go("tasks", t.id);
                          }}
                        >
                          详情
                        </button>
                      </div>
                      {/* 决策摘要：编号 / 区域 / 规模 / 时长 */}
                      <div className="pool-task-meta">
                        <span className="pool-task-id">{t.id}</span>
                        <span>
                          {s.maps.find((m) => m.id === t.mapId)?.region || "—"}
                        </span>
                        <span>
                          {t.items.length} 点 / {t.items.length} 检测项
                        </span>
                      </div>
                      {/* 次要信息：默认隐藏，选中该卡时展开；用标签—值网格对齐，避免长句连排 */}
                      <div className="pool-task-detail">
                        <dl className="kv">
                          <dt>来源</dt>
                          <dd>{t.source}</dd>
                          <dt>类型</dt>
                          <dd>{t.taskType || "综合巡检任务"}</dd>
                          <dt>期望</dt>
                          <dd>{t.expectedAt || "尽快 / 调度窗口内"}</dd>
                          <dt>版本</dt>
                          <dd>
                            {mapVer(t.mapVersion)}
                          </dd>
                          <dt>原子动作</dt>
                          <dd>
                            {(t.atomicActions || []).join(" / ") ||
                              "按检测项执行"}
                          </dd>
                          <dt>需要能力</dt>
                          <dd>
                            {[...new Set(t.items.map((p) => p.kind))].join(
                              " / ",
                            )}
                          </dd>
                        </dl>
                      </div>
                    </article>
                  ))}
              </div>
            </section>
            <section className="resource-pool">
              <h3>机器人资源池</h3>
              {s.robots.map((r) => {
                const c = currentTask(s, r),
                  reasons = constraints(s, t, r);
                const category = reasons.length
                  ? reasons.join("；")
                  : c
                    ? "可以排队 · 当前任务完成后"
                    : "推荐 · 可以立即执行";
                return (
                  <article
                    className={
                      "resource-row " + (rid === r.id ? "selected" : "")
                    }
                    key={r.id}
                    onClick={() => R(r.id)}
                  >
                    {/* 主行：机器人 + 状态 */}
                    <div className="resource-head">
                      <span className="resource-name">
                        {r.id} · {r.name}
                      </span>
                      <Badge>{r.state}</Badge>
                      {/* 点开看细节：跳转机器人详情页（阻止冒泡，避免误改选中） */}
                      <button
                        className="card-detail-link"
                        title="查看机器人详情"
                        onClick={(e) => {
                          e.stopPropagation();
                          go("robot", r.id);
                        }}
                      >
                        详情
                      </button>
                    </div>
                    {/* 决策摘要：区域 / 电量 */}
                    <div className="resource-meta">
                      <span>{r.region}</span>
                      <span className={r.battery < 40 ? "warn" : ""}>
                        电量 {r.battery}%
                      </span>
                    </div>
                    {/* 合格性始终一行可见，不满足时只给条数，明细悬停展开再看 */}
                    <div
                      className={
                        "eligibility " +
                        (reasons.length ? "warning" : "success")
                      }
                    >
                      {reasons.length
                        ? `${reasons.length} 项不满足 · 点击查看详情`
                        : category}
                    </div>
                    {/* 次要信息：默认隐藏，选中该卡时展开；标签—值网格对齐 */}
                    <div className="resource-detail">
                      <dl className="kv">
                        <dt>能力</dt>
                        <dd>{r.capabilities.join(" / ")}</dd>
                        <dt>当前任务</dt>
                        <dd>{c?.name || "无"}</dd>
                        <dt>队列</dt>
                        <dd>{queueFor(s, r.id).length} 个待执行</dd>
                        <dt>版本</dt>
                        <dd>
                          {mapVer(r.mapVersion)}
                        </dd>
                        {reasons.length > 0 && (
                          <>
                            <dt>不满足</dt>
                            <dd>{reasons.join("；")}</dd>
                          </>
                        )}
                      </dl>
                      {/* 仅在执行任务时才展示进度，空闲时不再显示空进度条 */}
                      {c && (
                        <div className="resource-current">
                          <progress
                            max={c.items.length || 1}
                            value={c.done.length || 0}
                          />
                          <small>
                            {c.done.length}/{c.items.length} 有效检测项
                          </small>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
            <section className="decision-panel">
              <h3>调度决策</h3>
              {detail}
              {dispatchControls}
            </section>
          </div>
        </>
      ) : (
        <section className="robot-schedule-block">
          <div className="robot-schedule-head">
            <b>机器人队列管理</b>
            <select
              aria-label="队列机器人"
              value={rid}
              onChange={(e) => {
                R(e.target.value);
                const task = s.tasks.find(
                  (t) =>
                    t.robotId === e.target.value &&
                    queueStates.includes(t.state),
                );
                if (task) SEL(task.id);
              }}
            >
              {s.robots.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id} · {r.name}
                </option>
              ))}
            </select>
            <span>可拖动未下发任务调整顺序；已接收任务需撤回确认</span>
          </div>
          <div className="robot-schedule-body">
            <Panel title="机器人 · 当前任务与队列顺序">
              <QueueStrip
                selected={selected}
                onSelect={(task) => {
                  SEL(task.id);
                  if (task.robotId) R(task.robotId);
                }}
                draggable={true}
              />
            </Panel>
            <Panel
              title={`${r.id} · 队列顺序`}
              extra={
                <ObjectLink type="robot" id={r.id}>
                  机器人监测 →
                </ObjectLink>
              }
            >
              <div className="queue-drag-list">
                {robotQueue(s, r).map((x, i) => (
                  <div
                    className={
                      "queue-line " + (x.id === selected ? "selected" : "")
                    }
                    key={x.id}
                    draggable={x.id !== cur?.id && x.state === "已分配"}
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", x.id)
                    }
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      act({
                        type: "REORDER",
                        id: e.dataTransfer.getData("text/plain"),
                        beforeId: x.id,
                      });
                    }}
                    onClick={() => SEL(x.id)}
                  >
                    <span className="drag-handle">⠿</span>
                    {/* 当前任务不占队列序号 */}
                    <b>{x.id === cur?.id ? "当前" : i + (cur ? 0 : 1)}</b>
                    <div>
                      <ObjectLink type="task-detail" id={x.id}>
                        {x.name}
                      </ObjectLink>
                      <small>
                        {x.id === cur?.id
                          ? `${x.done.length}/${x.items.length} 检测项`
                          : x.blockedReason || "队列等待"}
                      </small>
                    </div>
                    <Badge>{x.state}</Badge>
                    <Btn onClick={() => SEL(x.id)}>选中</Btn>
                  </div>
                ))}
              </div>
              {!robotQueue(s, r).length && (
                <Note>机器人队列为空，可从调度工作台分配任务。</Note>
              )}
            </Panel>
          </div>
        </section>
      )}
      {page === "dispatch" && (
        <Panel title="各机器人队列">
          <QueueStrip
            selected={selected}
            onSelect={(task) => {
              SEL(task.id);
              if (task.robotId) R(task.robotId);
            }}
            draggable={true}
          />
        </Panel>
      )}
      {page === "queue" && (
        <Panel title="队列管理与决策">
          <div className="impact-grid">
            <div>
              前置任务<b>{ix > 0 ? ts[ix - 1].id : cur?.id || "无"}</b>
            </div>
            <div>
              后续任务<b>{ix >= 0 ? ts[ix + 1]?.id || "无" : "待加入队列"}</b>
            </div>
            <div>
              队列位置<b>{queuePos}</b>
            </div>
          </div>
          {detail}
          {queueControls}
        </Panel>
      )}
      {page === "dispatch" && (
        <Panel title="任务分配与接收记录">
          <Table
            heads={["任务", "机器人", "状态", "实际执行门槛", "操作"]}
            rows={dRows.map((t) => [
              <ObjectLink type="task-detail" id={t.id}>
                {t.name}
              </ObjectLink>,
              <ObjectLink type="robot" id={t.robotId} />,
              <Badge>{t.state}</Badge>,
              t.robotId
                ? constraints(
                    s,
                    t,
                    s.robots.find((r) => r.id === t.robotId)!,
                    true,
                  ).join("；") || "满足执行门槛"
                : "未分配",
              <div className="actions">
                <Btn
                  onClick={() => {
                    SEL(t.id);
                    R(t.robotId || "R01");
                  }}
                >
                  调度决策
                </Btn>
                <Btn onClick={() => go("queue", t.robotId)}>机器人队列</Btn>
              </div>,
            ])}
          />
          <Pager
            page={dCur}
            count={dispatchList.length}
            size={dSize}
            onChange={DP}
            onSize={(n) => {
              SETDSIZE(n);
              DP(1);
            }}
          />
        </Panel>
      )}
      {modal && (
        <Modal
          title={modal === "preempt" ? "确认抢占影响" : "撤回确认与改派"}
          onClose={() => M("")}
        >
          {modal === "preempt" ? (
            <>
              <Note>
                原任务 {cur?.name} 将暂停。已完成 {cur?.done.length}/
                {cur?.items.length} 项保留。完成后需明确恢复原任务。
              </Note>
              <Btn
                danger
                onClick={() => {
                  if (act({ type: "PREEMPT", id: t.id, robotId: r.id })) M("");
                }}
              >
                模拟暂停确认并抢占
              </Btn>
            </>
          ) : (
            <>
              <Note>
                已接收或下发中的任务，先模拟查询确认未执行、撤回成功，再允许改派。
              </Note>
              <Field label="改派至">
                <select value={reassign} onChange={(e) => RA(e.target.value)}>
                  {s.robots.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.id} · {r.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Btn
                primary
                onClick={() => {
                  if (
                    act({
                      type: "REASSIGN",
                      id: t.id,
                      robotId: reassign,
                      confirmed: true,
                    })
                  ) {
                    R(reassign);
                    M("");
                  }
                }}
              >
                确认撤回并改派
              </Btn>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
