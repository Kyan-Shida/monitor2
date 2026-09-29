/**
 * @file DispatchFleetOverview.tsx
 * @description 调度中心左栏：平台机器人资源列（状态 / 电量 / 当前任务进度 / 待执行与可用时间），
 *              按「全部 / 执行中 / 空闲 / 需关注」筛选；点击卡片即把右侧调度工作区切到该机器人
 * @interaction DispatchDesk.tsx（调度中心两栏布局的中左栏）；数据来自 data/selectors 的 queueFor / robotAvailability / stageOf
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { queueFor, robotAvailability, stageOf } from "../data/selectors";
import { Badge } from "./UI";
export function DispatchFleetOverview({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  const { s } = useStore();
  const [filter, setFilter] = useState("全部");
  const issue = (id: string) =>
    s.tasks.some(
      (t) =>
        t.robotId === id &&
        !!t.blockedReason &&
        !["完成", "取消", "失败", "超期"].includes(t.state),
    );
  const robots = s.robots.filter(
    (r) =>
      filter === "全部" ||
      (filter === "需关注"
        ? ["故障", "离线", "暂停", "人工接管"].includes(r.state) || issue(r.id)
        : r.state === filter),
  );
  return (
    <>
      <div className="segmented fleet-filter">
        {["全部", "执行中", "空闲", "需关注"].map((x) => (
          <button
            key={x}
            className={filter === x ? "active" : ""}
            onClick={() => setFilter(x)}
          >
            {x}
          </button>
        ))}
      </div>
      <div className="fleet-list">
        {robots.map((r) => {
          const current = s.tasks.find((t) => t.id === r.current);
          const waiting = queueFor(s, r.id);
          /** 阻塞原因：优先取该机器人当前阻塞任务的说明，否则按状态给兜底文案 */
          const blocked = s.tasks.find(
            (t) =>
              t.robotId === r.id &&
              !!t.blockedReason &&
              !["完成", "失败", "取消", "超期"].includes(t.state),
          );
          const hint =
            blocked?.blockedReason ||
            (["离线", "充电", "故障"].includes(r.state)
              ? "当前不可启动任务"
              : "");
          return (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              className={"fleet-card" + (r.id === selected ? " selected" : "")}
              onClick={() => onSelect(r.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelect(r.id);
              }}
            >
              <div className="fleet-card-head">
                <b>
                  {r.id} · {r.name}
                </b>
                <Badge>{r.state}</Badge>
              </div>
              <div className="fleet-card-meta">
                {r.region} · 电量 {r.battery}% · m{r.mapVersion}/p{r.pointSet}
              </div>
              <div className="fleet-card-task">
                {current ? (
                  <>
                    {current.name}
                    <small>
                      {stageOf(current)} · {current.done.length}/
                      {current.items.length} 项
                    </small>
                  </>
                ) : (
                  <span className="muted">暂无执行任务</span>
                )}
              </div>
              <div className="fleet-card-foot">
                <span>待执行 {waiting.length} 项</span>
                <span>{robotAvailability(s, r)}</span>
              </div>
              {hint && <div className="fleet-card-note">⚠ {hint}</div>}
            </div>
          );
        })}
        {!robots.length && <p className="empty">该筛选下暂无机器人</p>}
      </div>
    </>
  );
}
