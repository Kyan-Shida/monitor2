/**
 * @file TaskPeekDrawer.tsx
 * @description 调度中心的「任务详情」抽屉：就地展示调度决策所需的最小信息集（来源/优先级/点位快照/排队位置/阻塞原因），
 *              不打断调度上下文；需要派单历史与结果下钻时再跳「完整任务详情」内置页
 * @interaction DispatchDesk.tsx（待执行队列与待安排的「详情」按钮、未来时间轴点击块）
 */
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Btn, Badge, Table, Modal } from "./UI";
import { queueFor, stageOf, fmtTime } from "../data/selectors";
import { constraints } from "../data/engine";
import type { Task } from "../data/types";

export function TaskPeekDrawer({
  task,
  robotId,
  onClose,
}: {
  /** 待查看的任务 */
  task: Task;
  /** 当前调度对象：未派单任务据此给出「若派给这台机器人」的约束校验结果 */
  robotId: string;
  onClose: () => void;
}) {
  const { s } = useStore();
  const t = task;
  const robot = s.robots.find((r) => r.id === (t.robotId || robotId));
  /** 排队位置：仅已分配 / 下发中 / 待执行处于排队态 */
  const queue = t.robotId ? queueFor(s, t.robotId) : [];
  const qpos = queue.findIndex((x) => x.id === t.id);
  const queued = ["已分配", "下发中", "待执行"].includes(t.state);
  const queueLabel = queued
    ? qpos >= 0
      ? `第 ${qpos + 1} / ${queue.length} 位`
      : "排队中"
    : ["执行中", "暂停"].includes(t.state)
      ? "正在执行 · 当前任务"
      : "未在队列中";
  /** 未派单任务：按当前调度对象预检约束，让「详情」直接回答"能不能派给它" */
  const reasons = !t.robotId && robot ? constraints(s, t, robot) : [];
  /** 检测项状态：已完成 / 已跳过 / 待执行 */
  const itemState = (id: string) =>
    t.done.includes(id) ? "已完成" : t.skipped.includes(id) ? "已跳过" : "待执行";
  return (
    <Modal title={`任务详情 · ${t.id}`} drawer onClose={onClose}>
        <div className="peek-head">
          <b>{t.name}</b>
          <Badge>{t.state}</Badge>
          <Badge>{t.priority}</Badge>
        </div>
        <dl className="peek-facts">
          <dt>来源</dt>
          <dd>
            {t.source}
            {/* 计划版本仅在任务由计划生成时追加，避免与来源文案冲突 */}
            {t.planId ? ` · ${t.planId} v${t.planVersion ?? "—"}` : ""}
          </dd>
          <dt>任务类型</dt>
          <dd>
            {t.taskType || "综合巡检任务"} ·{" "}
            {(t.atomicActions || []).join(" / ") || "按检测项执行"}
          </dd>
          <dt>当前阶段</dt>
          <dd>{stageOf(t)}</dd>
          <dt>计划时间</dt>
          <dd>
            {t.notBefore ? fmtTime(t.notBefore) : "当前任务结束后"}
            {t.deadline ? ` · 要求完成 ${fmtTime(t.deadline)}` : ""}
          </dd>
          <dt>执行机器人</dt>
          <dd>
            {t.robotId
              ? `${t.robotId} · ${queueLabel}`
              : `未派单${robot ? `（当前调度对象：${robot.id} · ${robot.name}）` : ""}`}
          </dd>
          <dt>地图版本</dt>
          <dd>
            m{t.mapVersion} / p{t.pointSet}
          </dd>
          <dt>阻塞 / 校验</dt>
          <dd>
            {t.blockedReason ||
              (reasons.length
                ? `若派给 ${robot?.id}：${reasons.join("；")}`
                : t.robotId
                  ? "无阻塞"
                  : `若派给 ${robot?.id}：满足执行条件`)}
          </dd>
          <dt>生成时间</dt>
          <dd>{fmtTime(t.created)}</dd>
        </dl>
        <h4 className="peek-title">
          巡检点位 · {t.items.length} 项
        </h4>
        <Table
          heads={["点位 / 检测项", "状态"]}
          rows={t.items
            .slice(0, 8)
            .map((i) => [
              <>
                <b>{i.name}</b>
                <small>
                  {i.id} · {i.item} {i.unit}
                </small>
              </>,
              <Badge key={i.id}>{itemState(i.id)}</Badge>,
            ])}
        />
        {t.items.length > 8 && (
          <p className="muted">仅显示前 8 项，共 {t.items.length} 项。</p>
        )}
        <div className="modal-actions">
          <Btn onClick={onClose}>关闭</Btn>
          <Btn
            primary
            // 带回来源页：完整详情的面包屑与返回都归属调度中心，不会跳到别处
            onClick={() =>
              go("task-detail", t.id, undefined, { page: "dispatch" })
            }
          >
            打开完整任务详情 →
          </Btn>
        </div>
    </Modal>
  );
}
