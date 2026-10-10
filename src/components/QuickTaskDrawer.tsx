/**
 * @file QuickTaskDrawer.tsx
 * @description 临时任务抽屉：勾选**巡检点**下发临时任务。
 *              指令集（原子动作）与任务类型**由所选巡检点的巡检项决定**，不需要手工选择；
 *              机器人能力只做提示，真正校验在调度中心（QUICK_DISPATCH / CREATE_TASK）。
 * @interaction 任务列表「＋ 临时巡检任务」、实时执行监控「＋ 下发临时任务」
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { taskTypeOfActions, type AtomicAction } from "../data/types";
import { actionsOfPoint } from "../data/deviceMaster";
import { targetsOf } from "../data/mapCalibration";
import { Modal, Field, Btn, Badge } from "./UI";
import { Pager } from "./Business";
import { PointPicker } from "./PointPicker";

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
    [points, P] = useState<string[]>(pointIds || []);
  /** 巡检点列表：搜索 / 筛选 / 分页 */
  const [q, Q] = useState(""),
    [mapF, MF] = useState("全部"),
    [pn, PN] = useState(1);
  const robot = s.robots.find((r) => r.id === rid);
  const available = s.points.filter(
    (p) => p.state === "已启用" && (!robot || p.mapId === robot.mapId),
  );
  const SIZE = 6;
  const filtered = available.filter(
    (p) =>
      (p.id + p.name + p.device).includes(q.trim()) &&
      (mapF === "全部" || p.mapId === mapF),
  );
  /** 单点勾选 / 取消（目录树整组勾选同样落到这里） */
  const togglePoint = (id: string) =>
    P(points.includes(id) ? points.filter((x) => x !== id) : [...points, id]);
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
  return (
    <Modal title="新建临时任务" wide onClose={onClose}>
        <div className="form-grid">
          <Field label="任务名称">
            <input value={name} onChange={(e) => N(e.target.value)} />
          </Field>
        </div>
        <h4>巡检点</h4>
        <PointPicker
          points={filtered}
          selected={points}
          onToggle={togglePoint}
          onClear={() => P([])}
        >
          {(treeRows) => {
            // 目录树裁剪后重算页数，避免停在空页
            const page = Math.min(
              pn,
              Math.max(1, Math.ceil(treeRows.length / SIZE)),
            );
            return (
              <>
                <div className="filter-bar">
                  <input
                    aria-label="巡检点搜索"
                    placeholder="搜索巡检点 / 编码 / 设备"
                    value={q}
                    onChange={(e) => {
                      Q(e.target.value);
                      PN(1);
                    }}
                  />
                  <select
                    aria-label="按地图筛选"
                    value={mapF}
                    onChange={(e) => {
                      MF(e.target.value);
                      PN(1);
                    }}
                  >
                    <option value="全部">全部地图</option>
                    {s.maps.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <span>
                    共 {treeRows.length} 个 · 已选 {points.length} 个
                  </span>
                </div>
                <div className="quick-point-list">
                  {treeRows
                    .slice((page - 1) * SIZE, page * SIZE)
                    .map((p) => {
                      const mp = targetsOf(s, p.mapId).find(
                        (t) => t.id === p.targetId,
                      );
                      const specs = p.inspectItems || [];
                      return (
                        <label key={p.id}>
                          <input
                            type="checkbox"
                            checked={points.includes(p.id)}
                            onChange={() => togglePoint(p.id)}
                          />
                          <b>{p.name}</b>
                          <span>
                            {mp?.externalId ? `定位ID ${mp.externalId} · ` : ""}
                            {specs.length
                              ? `${specs.length} 个巡检项 · ${specs
                                  .map((x) => x.name)
                                  .join(" / ")}`
                              : `${p.item} · ${p.unit}`}
                          </span>
                          <Badge>{p.state}</Badge>
                        </label>
                      );
                    })}
                </div>
                <Pager
                  page={page}
                  count={treeRows.length}
                  size={SIZE}
                  onChange={PN}
                />
              </>
            );
          }}
        </PointPicker>
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
