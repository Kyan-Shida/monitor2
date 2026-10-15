/**
 * @file QuickTaskDrawer.tsx
 * @description 临时任务抽屉：**先定路线来源，再定巡检点**。
 *              · 使用现有路线 = 直接从「巡检路线」拉过来（点位 + 父线地图一并带入）；
 *              · 自选巡检点 = 先选区域地图，再在该图上挑点，顺序可调。
 *              一期要求一条任务的巡检点落在**同一张地图**上（机器狗按区域调度、任务自身要求 mapId 唯一），
 *              跨图时才提示用户；跨区域能力后续开放（见下 `pickedMaps` 处的扩展点）。
 *              指令集（原子动作）与任务类型由所选巡检点的巡检项决定，不需要手工选择。
 * @interaction 任务列表「＋ 临时巡检任务」、实时执行监控「＋ 下发临时任务」
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { optimizePointOrder } from "../data/pointOrder";
import { taskTypeOfActions, type AtomicAction } from "../data/types";
import { actionsOfPoint } from "../data/deviceMaster";
import { targetsOf } from "../data/mapCalibration";
import { Modal, Field, Btn, Badge, Note } from "./UI";
import { Pager } from "./Business";
import { PointPicker } from "./PointPicker";
import { RoutePreview } from "./RoutePreview";

/** 路线来源：引用现有巡检路线 / 自选巡检点 */
type RouteSource = "route" | "manual";

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
  /** 可引用的巡检路线（启用中；停用路线不参与生成任务，与计划口径一致） */
  const routes = s.templates.filter((t) => t.state === "启用");
  const robot = s.robots.find((r) => r.id === robotId);
  const [name, N] = useState("现场临时巡检"),
    [rid] = useState(robotId),
    [points, P] = useState<string[]>(pointIds || []),
    /** 路线来源：默认「使用现有路线」（有可用路线时），否则自选 */
    [source, SRC] = useState<RouteSource>(
      routes.length && !pointIds?.length ? "route" : "manual",
    ),
    [routeId, RID] = useState(routes[0]?.id || ""),
    /** 自选模式下的区域地图（显式选择优先，其次机器人所属地图） */
    [pickMap, PMAP] = useState("");
  /** 巡检点列表：搜索 / 分页 */
  const [q, Q] = useState(""),
    [pn, PN] = useState(1);
  /** 生效的地图：显式选择 → 机器人地图 → 第一张有启用巡检点的图 */
  const fallbackMap =
    s.maps.find((m) =>
      s.points.some((p) => p.state === "已启用" && p.mapId === m.id),
    )?.id || "";
  const activeMap = pickMap || robot?.mapId || fallbackMap;
  /**
   * 拉取现有路线的点位与基线地图
   * @description 路线（Template）= 同一张地图上的有序点位，故点位与地图要一起带入，
   *              否则会出现"点了路线、地图还是上一张"的错配
   */
  const applyRoute = (id: string) => {
    const r = routes.find((x) => x.id === id);
    if (!r) return;
    P([...r.points]);
    PMAP(
      r.mapId || s.points.find((p) => p.id === r.points[0])?.mapId || activeMap,
    );
  };
  /**
   * 已选点位所属地图（去重）
   * @description 扩展点：跨区域能力开放后，这里改为"允许的地图白名单"（如 `Template.mapIds`），
   *              下面只做提示、不做拦截即可，其余链路（引擎同一地图校验）同步放开
   */
  const pickedMaps = [
    ...new Set(
      points
        .map((pid) => s.points.find((p) => p.id === pid)?.mapId)
        .filter(Boolean) as string[],
    ),
  ];
  const crossMap = pickedMaps.length > 1;
  /** 候选巡检点：启用 + 锁定当前地图（跨图点不进候选，从源头保证同图） */
  const available = s.points.filter(
    (p) => p.state === "已启用" && p.mapId === activeMap,
  );
  const SIZE = 6;
  const filtered = available.filter((p) =>
    (p.id + p.name + p.device).includes(q.trim()),
  );
  /**
   * 单点勾选 / 取消
   * @description 必须用函数式更新：目录树上的「整组全选」会连续调用本函数多次，
   *              基于闭包里的 points 计算会让后一次覆盖前一次（表现为只进去一个点）
   */
  const togglePoint = (id: string) =>
    P((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  /**
   * 调整已选顺序（数组顺序 = 机器狗跑这条临时路线的顺序）
   */
  const reorder = (from: number, to: number) =>
    P((prev) => {
      if (from === to || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
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
        <Field label="路线来源">
          <select
            value={source}
            onChange={(e) => {
              const v = e.target.value as RouteSource;
              SRC(v);
              // 换来源即换基线：清空已选，避免把上一种来源的点带过来
              P([]);
              if (v === "route" && routes[0]) {
                RID(routes[0].id);
                applyRoute(routes[0].id);
              } else {
                PMAP(robot?.mapId || fallbackMap);
              }
            }}
          >
            <option value="route" disabled={!routes.length}>
              {routes.length ? "使用现有巡检路线" : "使用现有巡检路线（暂无可用）"}
            </option>
            <option value="manual">自选巡检点</option>
          </select>
        </Field>
        {source === "route" ? (
          <Field label="选择路线">
            <select
              value={routeId}
              onChange={(e) => {
                RID(e.target.value);
                applyRoute(e.target.value);
              }}
            >
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.points.length} 个巡检点
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="区域地图">
            {/* 换图**不清空**已选：允许跨图挑选，由下方跨图提示 + 提交拦截兜底 */}
            <select value={activeMap} onChange={(e) => PMAP(e.target.value)}>
              {s.maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}（{m.region}）
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <h4>巡检点</h4>
      <PointPicker
        points={filtered}
        selected={points}
        onToggle={togglePoint}
        onClear={() => P([])}
        // 顺序即执行顺序：箭头 / 拖拽都落到这里
        onReorder={reorder}
        // 最优排序：按父线（路网）节点次序重排，避免走回头路
        onOptimize={() => P(optimizePointOrder(s, points))}
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
                <span>
                  {s.maps.find((m) => m.id === activeMap)?.name || "未选地图"} · 共{" "}
                  {treeRows.length} 个 · 已选 {points.length} 个
                </span>
              </div>
              <div className="quick-point-list">
                {treeRows.slice((page - 1) * SIZE, page * SIZE).map((p) => {
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
      {crossMap && (
        <Note>
          已选巡检点跨越了 {pickedMaps.length} 张地图（
          {pickedMaps
            .map((id) => s.maps.find((m) => m.id === id)?.name || id)
            .join(" / ")}
          ）。一台机器人设备一次只跑一张地图，请只保留同一张地图上的巡检点；
          <b>跨区域巡检能力将在后续版本开放</b>。
        </Note>
      )}
      {/* 临时路线图：与巡检路线同一套预览（底图 + 父线 + 有序子线） */}
      <RoutePreview
        map={s.maps.find((m) => m.id === (pickedMaps[0] || activeMap))}
        stops={picked}
      />
      <div className="modal-actions">
        <Btn onClick={onClose}>取消</Btn>
        <Btn
          primary
          disabled={!name.trim() || !points.length || !actions.length || crossMap}
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
