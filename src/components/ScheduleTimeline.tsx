import { useStore } from "../data/store";
import { schedule, timeAt, robotAvailability } from "../data/selectors";
import { ObjectLink } from "./Business";
import { Badge } from "./UI";
import type { Task } from "../data/types";
export function ScheduleTimeline({
  hours = 4,
  selected,
  onSelect,
  robotId,
  draggable = false,
  compact = false,
}: {
  hours?: number;
  selected?: string;
  onSelect: (t: Task) => void;
  robotId?: string;
  draggable?: boolean;
  /** 紧凑模式：内嵌单机器人场景（调度中心队列块）使用——省略机器人列与块内小字，刻度占满宽度 */
  compact?: boolean;
}) {
  const { s, act } = useStore();
  const minutes = hours * 60;
  return (
    <div className={"gantt" + (compact ? " compact" : "")}>
      <div className="gantt-ruler">
        <span>机器人 / 预计可用</span>
        <div>
          {Array.from({ length: hours + 1 }, (_, i) => (
            <span key={i} style={{ left: `${(i / hours) * 100}%` }}>
              {i === 0 ? "现在" : timeAt(i * 60)}
            </span>
          ))}
        </div>
      </div>
      {s.robots
        .filter((r) => !robotId || r.id === robotId)
        .map((r) => {
          const windows = schedule(s, r);
          const end = windows.at(-1)?.end || 0;
          return (
            <div className="gantt-row" key={r.id}>
              <div className="gantt-robot">
                <ObjectLink type="robot" id={r.id}>
                  {r.id} · {r.name}
                </ObjectLink>
                <Badge>{r.state}</Badge>
                <small>{robotAvailability(s, r)}</small>
              </div>
              <div
                className="gantt-lane"
                style={{ backgroundSize: `${100 / hours}% 100%` }}
              >
                {windows.map((w) => (
                  <button
                    title={`${w.label} · ${timeAt(w.start)}—${timeAt(w.end)}${w.task ? " · " + w.task.priority : ""}`}
                    className={`gantt-block ${w.kind} ${w.task?.state === "执行中" ? "running" : ""} ${selected === w.id ? "selected" : ""}`}
                    style={{
                      left: `${(w.start / minutes) * 100}%`,
                      width: `${((w.end - w.start) / minutes) * 100}%`,
                    }}
                    key={w.id}
                    draggable={draggable && ["已分配", "待执行"].includes(w.task?.state || "")}
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", w.id)
                    }
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (w.task)
                        act({
                          type: "REORDER",
                          id: e.dataTransfer.getData("text/plain"),
                          beforeId: w.id,
                        });
                    }}
                    onClick={() => w.task && onSelect(w.task)}
                  >
                    {w.task?.id || w.label}
                    <small>
                      {w.task?.priority || "预留"} · {w.end - w.start}分
                    </small>
                  </button>
                ))}
                {end < minutes && (
                  <div
                    className="gantt-free"
                    style={{
                      left: `${(end / minutes) * 100}%`,
                      width: `${((minutes - end) / minutes) * 100}%`,
                    }}
                  >
                    空闲窗口 · {minutes - end}分钟
                  </div>
                )}
              </div>
            </div>
          );
        })}
      <div className="timeline-caption">
        <span>■ 当前任务</span>
        <span>▤ 待执行任务</span>
        <span>▧ 充电 / 同步维护</span>
        <span>空白区域为未来空闲窗口 · 估计排程，开始前重新校验</span>
      </div>
    </div>
  );
}
