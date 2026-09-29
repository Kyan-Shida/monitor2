/**
 * @file QuickTaskDrawer.tsx
 * @description 临时任务抽屉：勾选**巡检点**下发临时任务。
 *              指令集（原子动作）与任务类型**由所选巡检点的巡检项决定**，不需要手工选择；
 *              机器人能力只做提示，真正校验在调度中心（QUICK_DISPATCH / CREATE_TASK）。
 * @interaction 任务列表「＋ 临时巡检任务」、实时执行监控「＋ 下发临时任务」
 */
import { useState } from "react";
import { useStore } from "../data/store";
import {
  atomicActionCapability,
  taskTypeOfActions,
  type AtomicAction,
} from "../data/types";
import { actionsOfPoint } from "../data/deviceMaster";
import { Modal, Field, Btn, Badge } from "./UI";

export function QuickTaskDrawer({
  robotId = "",
  pointIds,
  onClose,
  onCreated,
}: {
  robotId?: string;
  /** 预选巡检点（如从执行监控当前点位直接下发） */
  pointIds?: string[];
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const { s, act } = useStore();
  const [name, N] = useState("现场临时巡检"),
    [rid, R] = useState(robotId),
    [points, P] = useState<string[]>(pointIds || []),
    [priority, PR] = useState("普通");
  const robot = s.robots.find((r) => r.id === rid);
  const available = s.points.filter(
    (p) => p.state === "已启用" && (!robot || p.mapId === robot.mapId),
  );
  /** 已勾选的巡检点 */
  const picked = points
    .map((pid) => s.points.find((p) => p.id === pid))
    .filter(Boolean) as typeof s.points;
  /** 指令集：所选巡检点的巡检项里的机器操作内容（并集） */
  const actions: AtomicAction[] = [
    ...new Set(picked.flatMap((p) => actionsOfPoint(s, p))),
  ];
  /** 任务类型：由指令集反推（单一能力 → 对应类型，多种 → 综合巡检任务） */
  const type = taskTypeOfActions(actions);
  /** 当前机器人不具备的能力（仅提示） */
  const missing = robot
    ? [
        ...new Set(
          actions
            .map((a) => atomicActionCapability[a])
            .filter((c) => !robot.capabilities.includes(c)),
        ),
      ]
    : [];
  return (
    <Modal title="新建临时任务" drawer drawerWidth={680} onClose={onClose}>
        <div className="form-grid">
          <Field label="任务名称">
            <input value={name} onChange={(e) => N(e.target.value)} />
          </Field>
          <Field label="优先级">
            <select value={priority} onChange={(e) => PR(e.target.value)}>
              {["普通", "高", "紧急"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="执行机器人">
            <select
              value={rid}
              onChange={(e) => {
                R(e.target.value);
                // 机器人不同 → 地图不同，已选巡检点作废
                P([]);
              }}
            >
              <option value="">稍后调度</option>
              {s.robots.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id} · {r.name} · {r.state}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <h4>巡检点</h4>
        <p className="muted">
          临时任务以<b>巡检点</b>为最小单位：勾选巡检点即可，
          机器人到点后按各巡检项的机器操作内容（原子动作 / 云台视角）逐项执行。
        </p>
        <div className="quick-point-list">
          {available.map((p) => {
            const m = s.maps.find((x) => x.id === p.mapId);
            const mp = m?.targets.find((t) => t.id === p.targetId);
            const specs = p.inspectItems || [];
            return (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={points.includes(p.id)}
                  onChange={() =>
                    P(
                      points.includes(p.id)
                        ? points.filter((x) => x !== p.id)
                        : [...points, p.id],
                    )
                  }
                />
                <b>{p.name}</b>
                <span>
                  {mp?.externalId ? `定位ID ${mp.externalId} · ` : ""}
                  {specs.length
                    ? `${specs.length} 个巡检项 · ${specs.map((x) => x.name).join(" / ")}`
                    : `${p.item} · ${p.unit}`}
                </span>
                <Badge>{p.state}</Badge>
              </label>
            );
          })}
        </div>
        {/* 指令集只读展示：原子动作来自巡检点，不需要手工勾选 */}
        <section className="atomic-action-section">
          <div className="split">
            <h4>本次指令集</h4>
            <Badge>
              来自巡检点 · {actions.length} 项 · {type}
            </Badge>
          </div>
          <p className="muted">
            指令集由所选巡检点的巡检项决定，无需手工选择。
            {robot
              ? `当前机器人能力：${robot.capabilities.join(" / ")}`
              : "稍后调度时校验机器人能力。"}
          </p>
          <div className="actions">
            {actions.length ? (
              actions.map((a) => (
                <Badge
                  key={a}
                  tone={
                    robot && !robot.capabilities.includes(atomicActionCapability[a])
                      ? "red"
                      : "blue"
                  }
                >
                  {a}（需 {atomicActionCapability[a]}）
                </Badge>
              ))
            ) : (
              <span className="muted">先勾选巡检点，这里会显示它要求的原子动作。</span>
            )}
          </div>
          {!!missing.length && (
            <p className="muted">
              当前机器人缺少 <b>{missing.join(" / ")}</b> 能力：下发会被调度校验拦截，
              可改派具备该能力的机器人。
            </p>
          )}
        </section>
        <p className="muted">
          {rid
            ? "下发后加入目标机器人的待执行队列，保留当前任务断点。"
            : "创建后进入调度中心，选择符合条件的机器人。"}
          机器人按巡检点逐个停靠并执行巡检项。
        </p>
        <div className="modal-actions">
          <Btn onClick={onClose}>取消</Btn>
          <Btn
            primary
            disabled={!name.trim() || !points.length || !actions.length}
            onClick={() =>
              act(
                {
                  type: rid ? "QUICK_DISPATCH" : "CREATE_TASK",
                  name,
                  points,
                  priority,
                  taskType: type,
                  // 指令集来自巡检点：提交时显式带上，与引擎推导一致
                  atomicActions: actions,
                  robotId: rid,
                },
                (n) => {
                  onCreated?.(n.tasks[0].id);
                  onClose();
                },
              )
            }
          >
            {rid ? "下发至队列" : "创建并待调度"}
          </Btn>
        </div>
    </Modal>
  );
}
