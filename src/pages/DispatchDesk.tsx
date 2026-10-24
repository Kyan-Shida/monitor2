/**
 * @file DispatchDesk.tsx
 * @description 调度中心：顶部平台态势 + 左「平台机器人」资源列 + 右调度工作区（当前任务 / 待执行队列 / 待安排或未来时间轴）
 * @interaction App.tsx 路由分发（dispatch / queue）；子组件 DispatchFleetOverview（机器人资源列）、ScheduleTimeline（未来时间轴）、QuickTaskDrawer（临时任务）
 */
import { DispatchFleetOverview } from "../components/DispatchFleetOverview";
import { useState } from "react";
import { useStore } from "../data/store";
import { constraints } from "../data/engine";
import { go } from "../data/navigation";
import {
  queueFor,
  robotAvailability,
  stageOf,
  schedule,
  taskPriority,
  timeAt,
} from "../data/selectors";
import { Btn, Badge, Panel, Table, Note, Modal } from "../components/UI";
import { QuickTaskDrawer } from "../components/QuickTaskDrawer";
import { ScheduleTimeline } from "../components/ScheduleTimeline";
import { TaskPeekDrawer } from "../components/TaskPeekDrawer";
import { fmtDateTime, type Task } from "../data/types";

export function DispatchDesk({ id }: { id?: string }) {
  const { s, act } = useStore();
  const linked = s.tasks.find((t) => t.id === id)?.robotId;
  const [rid, setRid] = useState(
    s.robots.find((r) => r.id === id || r.id === linked)?.id || s.robots[0].id,
  );
  const [quick, setQuick] = useState(false);
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
  /**
   * 待安排：需要人工决策派单的任务
   * @description 尚未进入队列（待调度）、被接管待恢复、或已分配却被阻塞需改派的这几类；
   *              与下面的「历史记录」分开陈列——前者可派单，后者已留档只读
   */
  const scheduling = s.tasks.filter(
    (t) =>
      (!t.robotId || t.robotId === rid) &&
      (t.state === "待调度" ||
        t.state === "已被接管" ||
        (t.state === "已分配" && !!t.blockedReason)),
  );
  /**
   * 待安排的表格
   * @description 超期任务不再单独留档于调度台 —— 统一在「任务列表 › 任务记录」里展示与补派
   */
  const decisionTable = (list: Task[]) => (
    <Table
      heads={["任务", "来源 / 优先级", "处理提示", "操作"]}
      rows={list.map((t) => {
        const reasons = constraints(s, t, r);
        return [
          <>
            <b>{t.name}</b>
            <small>{t.id}</small>
          </>,
          <>
            {t.source} · {taskPriority(s, t)}
            <Badge>{t.state}</Badge>
          </>,
          reasons.join("；") ||
            (current ? "加入队列后等待当前任务完成" : "加入后即可执行"),
          <div className="actions">
            <Btn
              primary
              disabled={!!reasons.length}
              onClick={() => act({ type: "ENQUEUE", id: t.id, robotId: rid })}
            >
              {current ? "加入队列" : "下发执行"}
            </Btn>
            {taskPriority(s, t) !== "普通" && current?.state === "执行中" && (
              <Btn
                disabled={!!reasons.length}
                onClick={() => setPreempt(t)}
              >
                紧急插单
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
  );
  /**
   * 该机器人的排程窗口
   * @description 队列里每个任务的「预计开始」直接取这里，与下方甘特同源（同一份 schedule()），
   *              避免表格与甘特出现两套时间口径
   */
  const windows = schedule(s, r);
  /**
   * 取任务在排程中的预计开始（相对当前时间的分钟数）
   * @param taskId 任务 ID
   * @returns 相对分钟数；该任务不在排程窗口内时返回 undefined
   */
  const startOf = (taskId: string) =>
    windows.find((w) => w.task?.id === taskId)?.start;
  /**
   * 「详情」就地打开右侧抽屉，而不是跳到任务详情页
   * @description 调度是连续决策场景（常要连着比较多个排队任务），跳页会丢失当前调度对象与队列位置；
   *              抽屉只给"调度决策最小信息集"，需要派单历史 / 结果下钻时再由抽屉底部跳完整详情内置页
   */
  const detail = (t: Task) => setPeek(t);
  /**
   * 平台态势指标：全平台口径，与左栏「单台机器人」信息解耦
   * 依次为 机器人 / 在线 / 执行任务 / 排队任务 / 待安排 / 阻塞任务
   */
  const kpis: [string, number][] = [
    ["机器人", s.robots.length],
    ["在线", s.robots.filter((x) => x.state !== "离线").length],
    ["执行任务", s.tasks.filter((t) => t.state === "执行中").length],
    [
      "排队任务",
      s.tasks.filter((t) => ["已分配", "下发中", "待执行"].includes(t.state))
        .length,
    ],
    ["待安排", s.tasks.filter((t) => t.state === "待调度").length],
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
      </div>
      {/* 平台态势：全平台 6 项指标，横向一条，不与单台机器人信息混排 */}
      <div className="fleet-summary">
        {kpis.map(([label, n]) => (
          <div key={label}>
            <span>{label}</span>
            <b>{n}</b>
          </div>
        ))}
      </div>
      {/* 三栏：左「机器人资源」· 中「当前任务 / 队列 / 排程」· 右「待安排」 */}
      <div className="dispatch-console dd-3col">
        <div className="dd-col dd-col-l">
          <Panel title={`平台机器人 · ${s.robots.length} 台`}>
            <DispatchFleetOverview selected={rid} onSelect={setRid} />
          </Panel>
        </div>
        <div className="dispatch-work dd-col dd-col-c">
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
                {current.state === "暂停" && (
                  <Btn onClick={() => act({ type: "START", id: current.id })}>
                    恢复任务
                  </Btn>
                )}
              </div>
            ) : (
              <p>当前无执行任务，符合条件的任务将按队列执行。</p>
            )}
            <small>
              预计可用：{robotAvailability(s, r)} · {r.capabilities.join(" / ")}
            </small>
          </Panel>
          <Panel title={`待执行队列 · ${queue.length} 项`}>
            <Table
              heads={[
                "顺序 / 任务",
                "来源 / 状态",
                "预计开始 / 阻塞原因",
                "操作",
              ]}
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
                    {/* 预计开始与下方甘特同源（同一份 schedule()）：≤0 分钟即"立即"，否则给出具体时刻 */}
                    {(() => {
                      const sm = startOf(t.id);
                      if (sm === undefined)
                        return t.notBefore
                          ? fmtDateTime(t.notBefore)
                          : "当前任务结束后";
                      return sm <= 0 ? "立即" : timeAt(sm);
                    })()}
                    <small>
                      {t.blockedReason || reasons.join("；") || "满足执行条件"}
                    </small>
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
                    {t.state === "已分配" && (
                      <Btn
                        disabled={!!constraints(s, t, r).length}
                        onClick={() =>
                          act({ type: "ENQUEUE", id: t.id, robotId: rid })
                        }
                      >
                        重试下发
                      </Btn>
                    )}
                    <Btn onClick={() => detail(t)}>详情</Btn>
                  </div>,
                ];
              })}
            />
            {!queue.length && (
              <p className="empty">
                暂无排队任务。可添加临时任务，或等待计划自动生成。
              </p>
            )}
          </Panel>
          {/* 排程独立成块：队列是「清单」、排程是「时间轴」，两类语汇同块会互相干扰且行与块对不上号 */}
          <Panel title="未来 4 小时排程">
            <ScheduleTimeline
              robotId={rid}
              compact
              selected={peek?.id}
              onSelect={detail}
            />
            <p className="muted">
              估计排程，开始前重新校验；空白为可排程的空闲窗口。
            </p>
          </Panel>
        </div>
        {/* 右栏：待安排（要人工决策）；超期任务不在此留档，统一在「任务列表 › 任务记录」展示 */}
        <div className="dispatch-work dd-col dd-col-r">
          {/* 待安排：需要人工决策派单的任务 */}
          <Panel title={`待安排 · ${scheduling.length} 项`}>
              {s.plans
                .filter((p) => p.robotId === rid && p.generationError)
                .map((p) => (
                  <Note key={p.id}>
                    {p.name}：{p.generationError}
                    <Btn onClick={() => go("plans")}>修改计划</Btn>
                  </Note>
                ))}
              {decisionTable(scheduling)}
              {!scheduling.length && (
                <p className="empty">没有需要人工安排的任务。</p>
              )}
          </Panel>
        </div>
      </div>
      {quick && (
        <QuickTaskDrawer robotId={rid} onClose={() => setQuick(false)} />
      )}
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
