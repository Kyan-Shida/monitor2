/**
 * @file QueueStrip.tsx
 * @description 机器人执行队列条：按「当前任务 → 队列顺序」横向铺开任务块（可拖拽调序、点击选中）。
 *              平台无法估算机器人跑完一次巡检需要多久，故队列只表达先后顺序——不画时间轴、
 *              不给预计时刻与空闲窗口（原 ScheduleTimeline 甘特图据此下线）。
 * @interaction pages/DispatchDesk.tsx（调度中心队列块）、pages/Scheduling.tsx（派单 / 队列页）
 */
import { Fragment } from "react";
import { useStore } from "../data/store";
import { currentTask, robotQueue } from "../data/selectors";
import { ObjectLink } from "./Business";
import { Badge } from "./UI";
import type { Task } from "../data/types";
export function QueueStrip({
  selected,
  onSelect,
  robotId,
  draggable = false,
}: {
  /** 选中任务：与页面其它块的选中态同源 */
  selected?: string;
  /** 点击任务块：由调用方决定是就地查看还是切换选中 */
  onSelect: (t: Task) => void;
  /** 只展示单台机器人（调度中心内嵌场景）：此时隐藏机器人标签列，避免与页头重复 */
  robotId?: string;
  /** 未下发任务可拖拽调整队列顺序 */
  draggable?: boolean;
}) {
  const { s, act } = useStore();
  const robots = s.robots.filter((r) => !robotId || r.id === robotId);
  return (
    <div className="queue-strip">
      {robots.map((r) => {
        const cur = currentTask(s, r);
        const items = robotQueue(s, r);
        return (
          <div className="queue-row" key={r.id}>
            {!robotId && (
              <div className="queue-robot">
                <ObjectLink type="robot" id={r.id}>
                  {r.id} · {r.name}
                </ObjectLink>
                <Badge>{r.state}</Badge>
              </div>
            )}
            <div className="queue-lane">
              {items.map((t, i) => {
                const isCurrent = t.id === cur?.id;
                return (
                  <Fragment key={t.id}>
                    {/* 块间连接符：队列只有先后语义，用箭头代替时间轴 */}
                    {i > 0 && <span className="queue-arrow">›</span>}
                    <button
                      className={
                        "queue-block" +
                        (isCurrent ? " current" : "") +
                        (t.blockedReason ? " blocked" : "") +
                        (selected === t.id ? " selected" : "")
                      }
                      title={t.blockedReason || t.name}
                      draggable={
                        draggable &&
                        !isCurrent &&
                        ["已分配", "待执行"].includes(t.state)
                      }
                      onDragStart={(e) =>
                        e.dataTransfer.setData("text/plain", t.id)
                      }
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        act({
                          type: "REORDER",
                          id: e.dataTransfer.getData("text/plain"),
                          beforeId: t.id,
                        });
                      }}
                      onClick={() => onSelect(t)}
                    >
                      {/* 序号即队列位置；当前任务不占队列序号，用「当前」标识 */}
                      <b>{isCurrent ? "当前" : i - (cur ? 1 : 0) + 1}</b>
                      {t.id}
                      <small>
                        {isCurrent
                          ? `${t.state} · ${t.done.length}/${t.items.length} 检测项`
                          : t.state}
                      </small>
                    </button>
                  </Fragment>
                );
              })}
              {!!items.length && (
                <>
                  <span className="queue-arrow">›</span>
                  <span className="queue-tail">队尾</span>
                </>
              )}
              {!items.length && <span className="queue-empty">队列为空</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
