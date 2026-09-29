/**
 * @file PlanRobotBinding.tsx
 * @description 计划绑定执行机器人：以模板需求为基准，卡片式对比候选机器人的检测能力与可绑定状态；
 *              选中的机器人把执行前提与能力可用性内联展开在同一张卡片内，避免明细与卡片并列导致归属不清
 * @interaction Planning.tsx（新建 / 编辑计划弹窗）；能力可用性口径来自 data/robotCapabilities，绑定校验来自 data/planSchedule
 */
import { useStore } from "../data/store";
import { bindingReasons, requiredKinds } from "../data/planSchedule";
import { Badge } from "./UI";
import { capabilityMatrix } from "../data/robotCapabilities";
export function PlanRobotBinding({
  value,
  onChange,
  templateId,
}: {
  value: string;
  onChange: (id: string) => void;
  templateId: string;
}) {
  const { s } = useStore();
  const template = s.templates.find((t) => t.id === templateId);
  /** 模板所需检测能力：作为候选机器人的能力对照基准 */
  const needKinds = requiredKinds(s, templateId);
  const points = s.points.filter((p) => template?.points.includes(p.id));
  /** 模板点位涉及的服务区域：区域不匹配时提示具体区域 */
  const needRegions = [
    ...new Set(
      points
        .map((p) => s.maps.find((m) => m.id === p.mapId)?.region)
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  const cur = s.robots.find((r) => r.id === value);
  /**
   * 选中机器人的执行前提与能力可用性
   * @description 只渲染在被选中的那张卡片内部（缩进对齐卡片内容），不再作为独立面板挂在列表下方
   */
  const detail = cur && (
    <div className="pb-detail">
      <div className="pb-detail-title">执行前提与能力可用性</div>
      <dl className="pb-facts">
        <dt>移动能力</dt>
        <dd>{cur.mobility.join(" / ")}</dd>
        <dt>执行前提</dt>
        <dd>
          {cur.state} · 电量 {cur.battery}% · 地图 {cur.mapId} m
          {cur.mapVersion}/p{cur.pointSet}
        </dd>
        <dt>当前任务</dt>
        <dd>
          {cur.current
            ? `正在执行 ${cur.current}，届时按队列等待`
            : "当前无执行任务"}
        </dd>
      </dl>
      {/* 能力可用性：与机器人管理页「能力、组件与业务影响」同口径 */}
      <div className="pb-avail">
        {capabilityMatrix(cur).map((c) => (
          <span
            key={c.key}
            className={
              "pb-chip " +
              (c.availability === "正常"
                ? "ok"
                : c.availability === "低电量"
                  ? "warn"
                  : "off")
            }
            title={c.impact}
          >
            {c.key} · {c.availability}
          </span>
        ))}
      </div>
    </div>
  );
  return (
    <section className="plan-binding">
      {/* 对照基准：先说清模板要什么，再看机器人有什么 */}
      <div className="pb-req">
        <h4>执行机器人 · 计划任务按时自动执行</h4>
        <p>
          模板需求：{needKinds.length ? needKinds.join(" / ") : "未指定检测能力"}
          <span> · 服务区域 {needRegions.join(" / ") || "未指定"}</span>
          <span> · 共 {points.length} 个巡检点</span>
        </p>
      </div>
      <div className="pb-list">
        <label className={"pb-card" + (value === "" ? " selected" : "")}>
          <input
            type="radio"
            name="plan-robot"
            checked={value === ""}
            onChange={() => onChange("")}
          />
          <div className="pb-main">
            <div className="pb-title">
              <b>暂不绑定</b>
              <span className="pb-meta">
                保存后可在计划列表继续编辑，绑定前不生成任务
              </span>
              {value === "" && <span className="pb-flag">已选</span>}
            </div>
          </div>
        </label>
        {s.robots.map((r) => {
          const reasons = bindingReasons(s, templateId, r);
          const blocked = reasons.length > 0;
          /** 缺失的检测能力：把「检测能力不足」展开成具体缺哪几项 */
          const missing = needKinds.filter((k) => !r.capabilities.includes(k));
          /** 机器人具备但模板未要求的能力：作为富余能力提示 */
          const extra = r.capabilities.filter((k) => !needKinds.includes(k));
          const selected = value === r.id;
          return (
            <label
              key={r.id}
              className={
                "pb-card" + (blocked ? " blocked" : "") + (selected ? " selected" : "")
              }
            >
              <input
                type="radio"
                name="plan-robot"
                checked={selected}
                disabled={blocked}
                onChange={() => onChange(r.id)}
              />
              <div className="pb-main">
                <div className="pb-title">
                  <b>
                    {r.id} · {r.name}
                  </b>
                  <Badge>{r.deviceType}</Badge>
                  <span className="pb-meta">
                    {r.region} · {r.state} · 电量 {r.battery}%
                  </span>
                  {selected && <span className="pb-flag">已选</span>}
                </div>
                <div className="pb-caps">
                  {needKinds.map((k) => (
                    <span
                      key={k}
                      className={
                        "pb-chip " +
                        (r.capabilities.includes(k) ? "ok" : "miss")
                      }
                    >
                      {k} {r.capabilities.includes(k) ? "具备" : "缺失"}
                    </span>
                  ))}
                  {extra.length > 0 && (
                    <span className="pb-chip extra">
                      另有 {extra.join(" / ")}
                    </span>
                  )}
                </div>
                {blocked ? (
                  <p className="pb-alert" role="alert">
                    不可绑定：
                    {reasons.includes("服务区域不匹配") &&
                      `服务区域不匹配（模板服务区域 ${needRegions.join(" / ")}）`}
                    {reasons.includes("服务区域不匹配") &&
                      reasons.includes("检测能力不足") &&
                      "；"}
                    {reasons.includes("检测能力不足") &&
                      `检测能力不足（缺 ${missing.join(" / ")}）`}
                    {reasons
                      .filter(
                        (x) =>
                          x !== "服务区域不匹配" && x !== "检测能力不足",
                      )
                      .map((x) => `；${x}`)}
                  </p>
                ) : (
                  <p className="pb-ok">
                    可绑定：服务区域与检测能力均满足模板要求
                  </p>
                )}
                {/* 选中态下就地展开明细：与卡片同属一块，避免"明细属于谁"含混 */}
                {selected && detail}
              </div>
            </label>
          );
        })}
      </div>
    </section>
  );
}
