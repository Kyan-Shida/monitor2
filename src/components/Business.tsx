import { useState, type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Btn, Empty } from "./UI";
import { logNames, taskEvents } from "../data/selectors";
export function ObjectLink({
  type,
  id,
  children,
  tab,
  to,
  from,
}: {
  type: string;
  id?: string;
  children?: ReactNode;
  tab?: string;
  /** 目标页面 ID：传入时渲染为可跳转入口（如结果详情内置页）；不传则保持纯展示，不做下钻 */
  to?: string;
  /** 显式来源页：目标为内置详情页时带回，用于其面包屑与返回按入口动态归属 */
  from?: { page: string; id?: string };
}) {
  // 默认纯展示：保留 ID/名称信息但不做下钻跳转，避免为下钻而切碎使用流程
  const text =
    typeof children === "string" || typeof children === "number"
      ? String(children)
      : id || type;
  if (to)
    return (
      <button
        type="button"
        className="object-link goto"
        title={`${text} · 查看详情`}
        onClick={() => go(to, id, tab, from)}
      >
        {children || id || "—"}
      </button>
    );
  return (
    <span className="object-link" title={text}>
      {children || id || "—"}
    </span>
  );
}
/** KPI 图标色调：横向卡片布局下的彩色图标块配色 */
export type KpiTone = "blue" | "green" | "orange" | "red" | "purple" | "gray";
export interface KpiItem {
  label: string;
  value: ReactNode;
  /** 口径说明：以 title 呈现，hover 即可看到该指标如何统计 */
  hint?: string;
  /** 分类标签：相邻且同 group 的指标合并为一组并显示组名；不传则不显示组名 */
  group?: string;
  /** 指标图标：渲染在名称左侧，强化可读性与可识别度 */
  icon?: LucideIcon;
  /** 图标色调：仅 card 布局生效，缺省为蓝色 */
  tone?: KpiTone;
  /** 数值单位：仅 card 布局生效，以小字缀在数值后（如「项」） */
  unit?: string;
  action?: () => void;
}
/**
 * KPI 指标条（支持分类与口径说明）
 * @description 无跳转动作的指标渲染为 div（纯展示），避免"看起来可点但点不动"的误导；
 *              带 action 的渲染为 button 并保留可点样式；
 *              相邻且 group 相同的指标归为一组并显示组名，组宽按指标数量分配，整体单行排布
 * @param items 指标项：label 标签、value 数值、hint 口径说明、group 分类、action 点击动作
 */
/**
 * KPI 指标条（支持分类与口径说明）
 * @description 无跳转动作的指标渲染为 div（纯展示），避免"看起来可点但点不动"的误导；
 *              带 action 的渲染为 button 并保留可点样式；
 *              相邻且 group 相同的指标归为一组并显示组名，组宽按指标数量分配，整体单行排布；
 *              card 布局为横向卡片：彩色图标居左，名称与核心数值居右（参考仪表盘 KPI 卡样式）
 * @param items 指标项：label 标签、value 数值、hint 口径说明、group 分类、icon 图标、tone 色调、unit 单位、action 点击动作
 * @param card 是否使用横向卡片布局（彩色图标居左），默认紧凑布局
 */
export function Kpis({ items, card }: { items: KpiItem[]; card?: boolean }) {
  // 相邻同组归并（用有序数组而非 Map，保持声明顺序即展示顺序）
  const groups: { name: string; items: KpiItem[] }[] = [];
  for (const x of items) {
    const key = x.group || "";
    const last = groups[groups.length - 1];
    if (last && last.name === key) last.items.push(x);
    else groups.push({ name: key, items: [x] });
  }
  /**
   * 渲染单个指标项
   * @param x 指标项
   * @returns button（可点）或 div（纯展示）
   */
  const renderItem = (x: KpiItem) => {
    const ico = x.icon ? (
      <span className={"kpi-ico" + (card && x.tone ? " tone-" + x.tone : "")}>
        <x.icon size={card ? 17 : 15} />
      </span>
    ) : null;
    if (card) {
      // 横向卡片：图标居左，右侧上下排「名称 / 数值（+单位）」
      const body = (
        <>
          {ico}
          <span className="kpi-info">
            <span className="kpi-name">{x.label}</span>
            <b className="kpi-value">
              {x.value}
              {x.unit && <small className="kpi-unit">{x.unit}</small>}
            </b>
          </span>
        </>
      );
      return x.action ? (
        <button key={x.label} className="kpi-card" onClick={x.action} title={x.hint}>
          {body}
        </button>
      ) : (
        <div key={x.label} className="kpi-card" title={x.hint}>
          {body}
        </div>
      );
    }
    // 紧凑布局：图标 + 名称一行，数值在下
    const body = (
      <>
        <span className="kpi-head">
          {ico}
          <span>{x.label}</span>
        </span>
        <b>{x.value}</b>
      </>
    );
    return x.action ? (
      <button key={x.label} onClick={x.action} title={x.hint}>
        {body}
      </button>
    ) : (
      <div key={x.label} title={x.hint}>
        {body}
      </div>
    );
  };
  return (
    <div className="workbench-kpis">
      {groups.map((g, i) => (
        <div
          className="kpi-group"
          key={g.name + "-" + i}
          style={{ flex: g.items.length }}
        >
          {g.name && <em className="kpi-group-name">{g.name}</em>}
          <div className="kpi-group-items">{g.items.map(renderItem)}</div>
        </div>
      ))}
    </div>
  );
}
export function EventTimeline({
  taskId,
  robotId,
}: {
  taskId?: string;
  robotId?: string;
}) {
  const { s } = useStore();
  let events = taskEvents(s, taskId);
  if (robotId)
    events = events.filter(
      (l) =>
        l.object === robotId ||
        s.tasks.some((t) => t.robotId === robotId && t.id === l.object) ||
        s.sessions.some(
          (x) =>
            x.robotId === robotId &&
            (x.id === l.object || l.detail.includes(x.id)),
        ),
    );
  return (
    <div className="event-timeline">
      {!events.length && <Empty>尚无执行事件</Empty>}
      {events.map((l) => (
        <TimelineRow key={l.id} l={l} />
      ))}
    </div>
  );
}

const ABNORMAL_ACTIONS = [
  "FAIL",
  "STOP",
  "SKIP",
  "ALARM_ACK",
  "EMERGENCY_STOP",
];

function TimelineRow({ l }: { l: import("../data/types").Log }) {
  const [zoom, setZoom] = useState(false);
  const abnormal = ABNORMAL_ACTIONS.includes(l.action);
  return (
    <div>
      <time>{l.time}</time>
      <i className={abnormal ? "ev-dot abnormal" : "ev-dot"} />
      <section>
        <b>{logNames[l.action] || l.action}</b>
        <p>{l.detail}</p>
        {l.reading && (
          <div className="ev-reading">
            <span className="ev-reading-label">采集数据</span>
            {l.reading}
          </div>
        )}
        {l.image && (
          <div className="ev-media">
            <img
              className={"ev-image" + (zoom ? " zoom" : "")}
              src={l.image}
              alt="现场证据"
              onClick={() => setZoom((z) => !z)}
            />
            <small className="ev-hint">点击图片放大 / 还原</small>
          </div>
        )}
        <small>{l.object}</small>
      </section>
    </div>
  );
}
export function Pager({
  page,
  count,
  size = 6,
  unit = "条",
  onChange,
}: {
  page: number;
  count: number;
  size?: number;
  /** 计数单位：结果分页为"条"，任务维度分组分页为"个任务" */
  unit?: string;
  onChange: (n: number) => void;
}) {
  const max = Math.max(1, Math.ceil(count / size));
  return (
    <div className="pager">
      <span>
        共 {count} {unit} · 第 {Math.min(page, max)} / {max} 页
      </span>
      <Btn disabled={page <= 1} onClick={() => onChange(page - 1)}>
        上一页
      </Btn>
      <Btn disabled={page >= max} onClick={() => onChange(page + 1)}>
        下一页
      </Btn>
    </div>
  );
}
