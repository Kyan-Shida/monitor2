/**
 * @file TaskDetailPanel.tsx
 * @description 任务详情内容：概要头（主操作随状态切换）+ 任务摘要 / 任务控制与版本约束 + 派单历史 +
 *              「点位 + 动作序列」快照与结果
 * @interaction ObjectDetails.tsx（「任务详情」内置页）、Planning.tsx（任务列表「详情」抽屉）——两处共用同一实现，避免口径漂移
 */
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Badge, Btn, Panel, Table, Note } from "./UI";
import { ObjectLink } from "./Business";
import {
  stageOf,
  fmtTime,
  queueFor,
  terminal,
} from "../data/selectors";
import { archiveIdOf } from "../data/deviceMaster";
import type { PointActionPlan, Snapshot, Task } from "../data/types";

/**
 * 到位动作与视角摘要（任务详情「点位 + 动作序列」用）
 * @param p 任务内点位快照
 * @returns 一句话摘要；未编排视角时说明按默认视角执行
 */
function viewSummary(p: Snapshot): string {
  const ap: PointActionPlan | undefined = p.actionPlan;
  if (!ap)
    return "未编排视角（按默认视角执行，可在「巡检点管理 › 编辑巡检点」补配）";
  const bits = [
    ap.viewDir || "观察方向未设",
    `PTZ ${ap.ptz.pan}/${ap.ptz.tilt}/${ap.ptz.zoom}`,
  ];
  if (ap.dwellSec != null) bits.push(`停留 ${ap.dwellSec}s`);
  if (ap.light != null) bits.push(`补光 ${ap.light}`);
  if (ap.lift) bits.push(`升降 ${ap.lift}`);
  if (ap.preset) bits.push(ap.preset);
  if (ap.avoidPolicy) bits.push(ap.avoidPolicy);
  return bits.join(" · ");
}

export function TaskDetailPanel({
  task,
  onAfterNav,
}: {
  /** 要展示的任务 */
  task: Task;
  /** 发生页面跳转后的回调：抽屉用它关闭自己，内置页不需要 */
  onAfterNav?: () => void;
}) {
  const { s } = useStore();
  const t = task;
  /**
   * 主操作随任务状态变化，始终只给一个"此刻最该做"的入口
   * 待调度 → 去派单；已分配 / 下发中 / 待执行 / 执行中 / 暂停 → 执行监控；
   * 完成 / 部分完成 → 巡检结果；失败 / 取消 / 超期 → 执行回溯
   */
  const primary =
    t.state === "待调度"
      ? {
          label: "去派单",
          page: "dispatch",
          title: "前往调度中心：为该任务选择机器人并下发",
        }
      : ["已分配", "下发中", "待执行", "执行中", "暂停"].includes(t.state)
        ? {
            label: "执行监控",
            page: "execution",
            title: "打开实时执行监控：查看当前阶段、采集进度与现场画面",
          }
        : ["完成", "部分完成"].includes(t.state)
          ? {
              label: "巡检结果",
              page: "results",
              title: "查看该任务产出的巡检结果与复核状态",
            }
          : {
              label: "执行回溯",
              page: "replay",
              title: "任务未正常完成：回看执行事件与证据时间轴",
            };
  /** 是否已有派单记录：任务已分配到机器人（即非「待调度」）才算下发过 */
  const dispatched = !!t.robotId && t.state !== "待调度";
  /** 派单阶段随任务状态变化：未派单 / 已下发待接收 / 执行中 / 已完成 / 已终止 */
  const phase = (() => {
    switch (t.state) {
      case "待调度":
        return { label: "未派单", cls: "" };
      case "已分配":
      case "下发中":
        return { label: "已下发 · 待接收", cls: "amber" };
      case "待执行":
        return { label: "已接收 · 排队中", cls: "amber" };
      case "执行中":
      case "暂停":
        return { label: "执行中", cls: "green" };
      case "完成":
      case "部分完成":
        return { label: "已完成", cls: "green" };
      case "失败":
      case "取消":
      case "超期":
        return { label: "已终止", cls: "red" };
      default:
        return { label: t.state, cls: "" };
    }
  })();
  /** 机器人在该机器人队列中的排队位置（仅 已分配 / 下发中 / 待执行 处于排队态） */
  const queue = t.robotId ? queueFor(s, t.robotId) : [];
  const qpos = queue.findIndex((x) => x.id === t.id);
  const queued = ["已分配", "下发中", "待执行"].includes(t.state);
  const queueLabel = queued
    ? qpos >= 0
      ? `第 ${qpos + 1} / ${queue.length}（期望 ${t.expectedAt || "尽快"}）`
      : "排队中"
    : ["执行中", "暂停"].includes(t.state)
      ? "正在执行 · 当前任务"
      : "已出队";
  /** 跳转统一出口：抽屉形态下跳转后需要把自己关掉 */
  const jump = (page: string, pid?: string, from?: { page: string; id?: string }) => {
    go(page, pid, undefined, from);
    onAfterNav?.();
  };
  return (
    <>
      <div className="object-summary object-bar">
        <div className="os-title">
          <strong>
            {t.id} · {t.name}
          </strong>
          <Badge>{t.state}</Badge>
        </div>
        {/* 元信息带标签：裸编码（R01、m3 / p7）业务人员看不懂，需标注含义 */}
        <span className="os-meta">
          <span>
            <i>机器人</i>
            <ObjectLink type="robot" id={t.robotId} />
          </span>
          <span>
            <i>版本</i>m{t.mapVersion} / p{t.pointSet}
          </span>
          <span>
            <i>当前阶段</i>
            {stageOf(t)}
          </span>
        </span>
        <div className="actions os-actions">
          <Btn
            primary
            onClick={() => jump(primary.page, t.id)}
            title={primary.title}
          >
            {primary.label}
          </Btn>
        </div>
      </div>
      <div className="grid two">
        <Panel title="任务摘要">
          <dl>
            <dt>来源</dt>
            <dd>{t.source}</dd>
            <dt>任务类型</dt>
            <dd>{t.taskType || "综合巡检任务"}</dd>
            <dt>原子动作</dt>
            <dd>
              {(t.atomicActions || []).join(" / ") || "按检测项执行"}
              {/* 动作由"看什么"（采集方式）推导，「怎么看」由点位动作编排给出 */}
            </dd>
            <dt>计划版本</dt>
            <dd>
              {t.planId || "临时任务"} / v{t.planVersion || "—"}
            </dd>
            <dt>调度编号</dt>
            <dd>{t.dispatchId || "尚未下发"}</dd>
            <dt>生成时间</dt>
            <dd>{fmtTime(t.created)}</dd>
            <dt>开始时间</dt>
            <dd>{fmtTime(t.startedAt)}</dd>
            <dt>结束时间</dt>
            <dd>{fmtTime(t.finishedAt)}</dd>
            <dt>优先级</dt>
            <dd>{t.priority}</dd>
            <dt>业务完成</dt>
            <dd>
              {t.done.length} / {t.items.length} 有效检测项，失败{" "}
              {t.skipped.length}
            </dd>
            <dt>关联告警</dt>
            <dd>
              <ObjectLink type="alarm" id={t.alarmId} />
            </dd>
          </dl>
        </Panel>
        <Panel title="任务控制与版本约束">
          <Note>
            任务引用创建时的业务快照，地图或点位维护不会回写历史要求。机器人任务结束回报后，平台仍按有效检测项判定完整性。
          </Note>
          {terminal.includes(t.state) && (
            <Btn
              onClick={() =>
                jump("replay-detail", t.id, { page: "tasks", id: t.id })
              }
            >
              执行回溯与接管记录
            </Btn>
          )}
        </Panel>
      </div>
      {/* 派单历史：就地展示该任务的选择内容与下发情况，随任务状态改变 */}
      <Panel title="派单历史">
        {!dispatched ? (
          <Note>
            任务尚未派单，暂无派单记录。前往调度中心为该任务选择机器人并下发后，将在此展示分配记录、接收回执与队列位置。
          </Note>
        ) : (
          <>
            <div className="dispatch-phase">
              <span className={"badge " + phase.cls}>{phase.label}</span>
              <span className="muted">派单编号 {t.dispatchId || "—"}</span>
            </div>
            <dl className="kv dispatch-history">
              <dt>分配机器人</dt>
              <dd>
                <ObjectLink type="robot" id={t.robotId} />
              </dd>
              <dt>派单时间</dt>
              <dd>{fmtTime(t.created)}</dd>
              <dt>接收回执</dt>
              <dd>
                {t.startedAt
                  ? `${fmtTime(t.startedAt)} · 已接收`
                  : "待机器人接收回执"}
              </dd>
              <dt>当前队列位置</dt>
              <dd>{queueLabel}</dd>
              {t.finishedAt && (
                <>
                  <dt>结束时间</dt>
                  <dd>{fmtTime(t.finishedAt)}</dd>
                </>
              )}
              <dt>优先级</dt>
              <dd>{t.priority}</dd>
              <dt>派单来源</dt>
              <dd>{t.source}</dd>
            </dl>
          </>
        )}
      </Panel>
      <Panel title="点位 + 动作序列（检测项快照与结果）">
        <Table
          heads={[
            "业务点位",
            "设备 / 对象",
            "检测项与要求",
            "到位动作与视角",
            "版本",
            "结果",
          ]}
          rows={t.items.map((p) => [
            <ObjectLink type="point" id={p.id}>
              {p.name}
            </ObjectLink>,
            <ObjectLink type="archive" id={archiveIdOf(s, p.device)}>
              {p.device} / {p.object}
            </ObjectLink>,
            <>
              {p.item}
              <small>{p.requirement}</small>
            </>,
            <>
              {p.actions?.join(" / ") || "按检测项执行"}
              <small>{viewSummary(p)}</small>
            </>,
            `m${p.mapVersion} / 点位 v${p.version}`,
            s.results
              .filter((r) => r.taskId === t.id && r.pointId === p.id)
              .map((r) => (
                <ObjectLink key={r.id} type="review" id={r.id}>
                  {r.final} {r.unit} · {r.status}
                </ObjectLink>
              )),
          ])}
        />
      </Panel>
    </>
  );
}
