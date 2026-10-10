/**
 * @file DispatchDesk.tsx
 * @description 调度中心：顶部平台态势 + 左「平台机器人」资源列 + 右调度工作区（当前任务 / 待执行队列 / 待安排与异常）
 * @interaction App.tsx 路由分发（dispatch / queue）；子组件 DispatchFleetOverview（机器人资源列）、QueueStrip（队列顺序条）
 */
import { DispatchFleetOverview } from "../components/DispatchFleetOverview";
import { useState } from "react";
import { useStore } from "../data/store";
import { constraints } from "../data/engine";
import { go } from "../data/navigation";
import { queueFor, stageOf } from "../data/selectors";
import { Btn, Badge, Panel, Table, Note, Modal } from "../components/UI";
import { QueueStrip } from "../components/QueueStrip";
import { TaskPeekDrawer } from "../components/TaskPeekDrawer";
import type { Task } from "../data/types";

export function DispatchDesk({ id }: { id?: string }) {
  const { s, act } = useStore();
  const linked = s.tasks.find((t) => t.id === id)?.robotId;
  const [rid, setRid] = useState(
    s.robots.find((r) => r.id === id || r.id === linked)?.id || s.robots[0].id,
  );
  const [preempt, setPreempt] = useState<Task>();
  /** 「详情」抽屉中的任务：调度场景就地查看，不打断当前机器人与队列的上下文 */
  const [peek, setPeek] = useState<Task>();
  const r = s.robots.find((r) => r.id === rid)!;
  const current = s.tasks.find((t) => t.id === r.current);
  // DSP-02 / TKO-04：队列含「已被接管」，被接管任务需在此可见并有「恢复任务」入口
  const queue = s.tasks.filter(
    (t) =>
      t.robotId === rid &&
      ["已分配", "下发中", "待执行", "暂停", "已被接管"].includes(t.state) &&
      t.id !== current?.id,
  );
  const pending = s.tasks.filter(
    (t) =>
      (!t.robotId || t.robotId === rid) &&
      (t.state === "待调度" ||
        t.state === "超期" ||
        t.state === "已被接管" ||
        (t.state === "已分配" && !!t.blockedReason)),
  );
  /**
   * 「详情」就地打开右侧抽屉，而不是跳到任务详情页
   * @description 调度是连续决策场景（常要连着比较多个排队任务），跳页会丢失当前调度对象与队列位置；
   *              抽屉只给"调度决策最小信息集"，需要派单历史 / 结果下钻时再由抽屉底部跳完整详情内置页
   */
  const detail = (t: Task) => setPeek(t);
  /**
   * 平台态势指标：只保留任务相关（全平台口径）
   * 依次为 执行任务 / 排队任务 / 待安排 / 超期 / 阻塞任务
   */
  const kpis: [string, number][] = [
    ["执行任务", s.tasks.filter((t) => t.state === "执行中").length],
    [
      "排队任务",
      s.tasks.filter((t) => ["已分配", "下发中", "待执行"].includes(t.state))
        .length,
    ],
    ["待安排", s.tasks.filter((t) => t.state === "待调度").length],
    ["超期", s.tasks.filter((t) => t.state === "超期").length],
    [
      "阻塞任务",
      s.tasks.filter(
        (t) =>
          !!t.blockedReason &&
          !["完成", "失败", "取消", "超期"].includes(t.state),
      ).length,
    ],
  ];
  return (
    <div className="single-dispatch">
      <div className="context-bar">
        <strong>调度中心</strong>
        {/* 当前调度对象：与左栏选中的机器人同源，只读展示，避免与资源列表重复交互 */}
        <div className="dispatch-current">
          <span className="muted">当前调度对象</span>
          <b>
            {r.id} · {r.name}
          </b>
          <Badge>{r.state}</Badge>
          <span className="muted">
            电量 {r.battery}% · V{r.mapVersion}
          </span>
        </div>
      </div>
      {/* 平台态势：全平台任务指标，横向一条，不与单台机器人信息混排 */}
      <div className="fleet-summary">
        {kpis.map(([label, n]) => (
          <div key={label}>
            <span>{label}</span>
            <b>{n}</b>
          </div>
        ))}
      </div>
      <div className="dispatch-console">
        <Panel title={`平台机器人 · ${s.robots.length} 台`}>
          <DispatchFleetOverview selected={rid} onSelect={setRid} />
        </Panel>
        <div className="dispatch-work">
          <Panel title={`当前任务 · ${r.name}`}>
            {current ? (
              <div className="context-bar">
                <div>
                  <b>{current.name}</b>
                  <p>
                    {current.id} · {stageOf(current)} · 已完成{" "}
                    {current.done.length}/{current.items.length} 项
                  </p>
                </div>
                <Badge>{current.state}</Badge>
                <Btn primary onClick={() => go("execution-monitor", current.id)}>
                  查看实时执行
                </Btn>
                {current.state === "执行中" && (
                  <Btn onClick={() => act({ type: "PAUSE", id: current.id })}>
                    暂停任务
                  </Btn>
                )}
              </div>
            ) : (
              <p>当前无执行任务，符合条件的任务将按队列执行。</p>
            )}
            <small>{r.capabilities.join(" / ")}</small>
          </Panel>
          <Panel title={`待执行队列 · ${queue.length} 项`}>
            <Table
              heads={["顺序 / 任务", "来源 / 状态", "阻塞原因", "操作"]}
              rows={queue.map((t, i) => {
                const reasons = constraints(s, t, r, true);
                const prior = queue
                  .slice(0, i)
                  .reverse()
                  .find((x) => ["已分配", "待执行"].includes(x.state));
                return [
                  <>
                    <b>
                      {i + 1}. {t.name}
                    </b>
                    <small>{t.id}</small>
                  </>,
                  <>
                    {t.source}
                    <Badge>{t.state}</Badge>
                  </>,
                  <>
                    {/* 队列是顺序语义（前一条完成即轮到自己），平台不估算具体时刻 */}
                    {t.blockedReason || reasons.join("；") || "满足执行条件"}
                  </>,
                  <div className="actions">
                    <Btn
                      disabled={
                        !prior || !["已分配", "待执行"].includes(t.state)
                      }
                      onClick={() =>
                        act({ type: "REORDER", id: t.id, beforeId: prior?.id })
                      }
                    >
                      上移
                    </Btn>
                    {["待执行", "暂停"].includes(t.state) && !current && (
                      <Btn
                        disabled={!!reasons.length}
                        onClick={() => act({ type: "START", id: t.id })}
                      >
                        开始执行
                      </Btn>
                    )}
                    {/* TKO-04 / DSP-02：被接管的任务在调度中心可直接恢复 */}
                    {t.state === "已被接管" && (
                      <Btn
                        primary
                        onClick={() => act({ type: "START", id: t.id })}
                      >
                        恢复任务
                      </Btn>
                    )}
                    <Btn onClick={() => detail(t)}>详情</Btn>
                  </div>,
                ];
              })}
            />
            {!queue.length && (
              <p className="empty">暂无排队任务，等待计划自动生成。</p>
            )}
          </Panel>
          {/* 队列顺序独立成块：上面的表给逐条明细，这里给「当前 → 后续」的整体先后关系 */}
          <Panel title="队列顺序">
            <QueueStrip robotId={rid} selected={peek?.id} onSelect={detail} />
          </Panel>
          {/* 待安排：需要人工决策的任务，独立成块，与队列块互不切换 */}
          <Panel title={`待安排与异常任务 · ${pending.length} 项`}>
              {s.plans
                .filter((p) => p.robotId === rid && p.generationError)
                .map((p) => (
                  <Note key={p.id}>
                    {p.name}：{p.generationError}
                    <Btn onClick={() => go("plans")}>修改计划</Btn>
                  </Note>
                ))}
              <Table
                heads={["任务", "来源", "处理提示", "操作"]}
                rowClass={(_row, i) =>
                  pending[i].state === "超期" ? "alert-row" : ""
                }
                rows={pending.map((t) => {
                  const reasons = constraints(s, t, r);
                  return [
                    t.name,
                    <>
                      {t.source}
                      <Badge>{t.state}</Badge>
                    </>,
                    t.state === "超期"
                      ? "已触发超期告警"
                      : reasons.join("；") ||
                        (current
                          ? "加入队列后等待当前任务完成"
                          : "加入后即可执行"),
                    <div className="actions">
                      {/* 超期任务同样可派单/加入队列，仅以行高亮提示超期，不冻结操作 */}
                      <Btn
                        primary
                        disabled={!!reasons.length}
                        onClick={() =>
                          act({ type: "ENQUEUE", id: t.id, robotId: rid })
                        }
                      >
                        {current ? "加入队列" : "下发执行"}
                      </Btn>
                      {current?.state === "执行中" && (
                        <Btn
                          disabled={!!reasons.length}
                          onClick={() => setPreempt(t)}
                        >
                          插单
                        </Btn>
                      )}
                      {reasons.includes("地图版本待同步") && (
                        <Btn onClick={() => go("map-detail", t.mapId, "sync")}>
                          同步地图
                        </Btn>
                      )}
                      <Btn onClick={() => detail(t)}>详情</Btn>
                    </div>,
                  ];
                })}
              />
              {!pending.length && (
                <p className="empty">没有需要人工安排的任务。</p>
              )}
          </Panel>
        </div>
      </div>
      {peek && (
        <TaskPeekDrawer
          task={peek}
          robotId={rid}
          onClose={() => setPeek(undefined)}
        />
      )}
      {preempt && (
        <Modal title="确认紧急插单" onClose={() => setPreempt(undefined)}>
          <Note>
            暂停当前任务“{current?.name}”，先执行“{preempt.name}
            ”。被暂停任务保留，可在任务详情处理恢复。
          </Note>
          <Btn
            danger
            onClick={() => {
              if (act({ type: "PREEMPT", id: preempt.id, robotId: rid })) {
                act({ type: "ENQUEUE", id: preempt.id, robotId: rid });
                setPreempt(undefined);
              }
            }}
          >
            确认暂停并插单
          </Btn>
        </Modal>
      )}
    </div>
  );
}
