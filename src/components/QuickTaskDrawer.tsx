import { useState } from "react";
import { useStore } from "../data/store";
import {
  taskTypeActions,
  atomicActionCapability,
  type TaskType,
  type AtomicAction,
} from "../data/types";
import { Modal, Field, Btn, Badge } from "./UI";
const actionOptions: { id: AtomicAction; description: string }[] = [
  { id: "拍照", description: "采集一张可见光照片" },
  { id: "录像片段", description: "采集一段现场视频" },
  { id: "采集红外热像", description: "生成红外热像与温度数据" },
  { id: "采集气体", description: "读取气体传感器采样值" },
  { id: "录制声音", description: "录制设备声音片段" },
];
export function QuickTaskDrawer({
  robotId = "",
  onClose,
  onCreated,
}: {
  robotId?: string;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const { s, act } = useStore();
  const [name, N] = useState("现场临时巡检"),
    [rid, R] = useState(robotId),
    [type, T] = useState<TaskType>("光学任务"),
    [actions, A] = useState<AtomicAction[]>(["拍照"]),
    [points, P] = useState<string[]>([]),
    [priority, PR] = useState("普通");
  const robot = s.robots.find((r) => r.id === rid);
  const available = s.points.filter(
    (p) => p.state === "已启用" && (!robot || p.mapId === robot.mapId),
  );
  return (
    <Modal title="新建临时任务" drawer drawerWidth={680} onClose={onClose}>
        <div className="form-grid">
          <Field label="任务名称">
            <input value={name} onChange={(e) => N(e.target.value)} />
          </Field>
          <Field label="任务类型">
            <select
              value={type}
              onChange={(e) => {
                const t = e.target.value as TaskType;
                T(t);
                A(
                  taskTypeActions[t].filter(
                    (a) =>
                      !robot ||
                      robot.capabilities.includes(atomicActionCapability[a]),
                  ),
                );
              }}
            >
              {Object.keys(taskTypeActions).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
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
                const next = s.robots.find((r) => r.id === e.target.value);
                R(e.target.value);
                A((old) =>
                  old.filter(
                    (a) =>
                      !next ||
                      next.capabilities.includes(atomicActionCapability[a]),
                  ),
                );
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
        <section className="atomic-action-section">
          <div className="split">
            <h4>原子采集动作</h4>
            <Badge>已选 {actions.length} 项</Badge>
          </div>
          <p className="muted">
            任务类型提供默认选择，可组合以下动作。
            {robot
              ? `当前机器人：${robot.capabilities.join(" / ")}`
              : "稍后调度时校验机器人能力。"}
          </p>
          <div className="atomic-action-grid">
            {actionOptions.map(({ id: a, description }) => {
              const capability = atomicActionCapability[a];
              const supported =
                !robot || robot.capabilities.includes(capability);
              return (
                <label
                  key={a}
                  className={
                    "atomic-action " + (actions.includes(a) ? "selected" : "")
                  }
                >
                  <input
                    type="checkbox"
                    checked={actions.includes(a)}
                    disabled={!supported}
                    onChange={() =>
                      A((old) =>
                        old.includes(a)
                          ? old.filter((x) => x !== a)
                          : [...old, a],
                      )
                    }
                  />
                  <span>
                    <b>{a}</b>
                    <small>{description}</small>
                    <em>
                      {supported
                        ? `需要 ${capability}`
                        : `当前机器人缺少 ${capability} 能力`}
                    </em>
                  </span>
                </label>
              );
            })}
          </div>
        </section>
        <h4>业务目标</h4>
        <div className="quick-point-list">
          {available.map((p) => (
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
                {p.item} · {p.unit}
              </span>
              <Badge>{p.state}</Badge>
            </label>
          ))}
        </div>
        <p className="muted">
          {rid
            ? "下发后加入目标机器人的待执行队列，保留当前任务断点。"
            : "创建后进入调度中心，选择符合条件的机器人。"}
          机器人自主寻找业务目标并完成采集。
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
