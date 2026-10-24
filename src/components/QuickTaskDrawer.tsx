/**
 * @file QuickTaskDrawer.tsx
 * @description 临时任务抽屉：**先定路线来源，再定巡检点**。
 *              · 使用现有路线 = 直接从「巡检路线」拉过来（点位序列 + 按点位反推的预览底图）；
 *              · 自选巡检点 = 先选区域地图，再在该图上挑点，顺序可调。
 *              一期要求一条任务的巡检点落在**同一张地图**上（机器狗按区域调度、任务自身要求 mapId 唯一），
 *              跨图时才提示用户；跨区域能力后续开放（见下 `pickedMaps` 处的扩展点）。
 *              指令集（原子动作）与任务类型由所选巡检点的巡检项决定，不需要手工选择。
 * @interaction 任务列表「＋ 临时巡检任务」、实时执行监控「＋ 下发临时任务」
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { optimizePointOrder } from "../data/pointOrder";
import { routeRenderMapId } from "../data/routeMaps";
import { taskTypeOfActions, type AtomicAction } from "../data/types";
import { actionsOfPoint } from "../data/deviceMaster";
import { Drawer, InnerPage, Field, Btn, Note } from "./UI";
import { PointPicker } from "./PointPicker";
import { RoutePreview } from "./RoutePreview";

/** 路线来源：引用现有巡检路线 / 自选巡检点 */
type RouteSource = "route" | "manual";

export function QuickTaskDrawer({
  robotId = "",
  pointIds,
  onClose,
  onCreated,
  inline = false,
}: {
  robotId?: string;
  /** 预选巡检点（如从执行监控当前点位直接下发） */
  pointIds?: string[];
  /**
   * 内置页模式：作为整页渲染（路由级「新建临时任务」入口）
   * @description 左表单 + 右路线图要同屏且高度足够，浮层里会被压扁，整页才是它该待的地方
   */
  inline?: boolean;
  /** 关闭（取消 / 未接 onCreated 时的收尾） */
  onClose: () => void;
  /**
   * 创建成功后的处理（拿到新任务 id）
   * @description 传了就由调用方决定去向（跳调度页 / 就地提示）并自行收起抽屉，
   *              组件不再调用 onClose，避免两次跳转互相覆盖；不传则按普通关闭收尾
   */
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
    [pickMap, PMAP] = useState(""),
    /** 左栏（表单 + 巡检点）展开态（默认展开，点地图左缘竖槽收起给地图腾宽度） */
    [sideOpen, SETSIDEOPEN] = useState(true);
  /** 生效的地图：显式选择 → 机器人地图 → 第一张有启用巡检点的图 */
  const fallbackMap =
    s.maps.find((m) =>
      s.points.some((p) => p.state === "已启用" && p.mapId === m.id),
    )?.id || "";
  const activeMap = pickMap || robot?.mapId || fallbackMap;
  /**
   * 拉取现有路线的点位与预览底图
   * @description 路线只是一个有序点位数组（不绑定地图），底图按点位反推，
   *              避免出现"点了路线、地图还是上一张"的错配
   */
  const applyRoute = (id: string) => {
    const r = routes.find((x) => x.id === id);
    if (!r) return;
    P([...r.points]);
    PMAP(routeRenderMapId(s, r.points) || activeMap);
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
  const body = (
    /*
      两栏：左 = 表单 + 巡检点选择，右 = 临时路线图整列
      与「巡检路线」编辑内置页同一形态（`route-edit-grid` / `re-map` / `re-fold` 直接复用），
      地图不再在下方堆叠，画线看线时表单与已选清单同屏可见
    */
    <div className={"route-edit-grid" + (sideOpen ? "" : " collapsed")}>
        {/* 左栏表单：点地图左缘的竖槽把手可整体收起，收起后只有地图一栏 */}
        {sideOpen && (
        <div className="route-edit-col">
          <div className="form-grid">
            <Field label="任务名称" required>
              <input value={name} onChange={(e) => N(e.target.value)} />
            </Field>
            <Field label="路线来源" required>
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
                  {routes.length
                    ? "使用现有巡检路线"
                    : "使用现有巡检路线（暂无可用）"}
                </option>
                <option value="manual">自选巡检点</option>
              </select>
            </Field>
            {source === "route" ? (
              <Field label="选择路线" required>
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
          {/*
            巡检点选择：级联选择器（区域 › 设备 › 巡检点）+ 已选清单，
            与「巡检路线」编辑页同一形态，不再平铺目录树 + 勾选表 + 分页
          */}
          <PointPicker
            cascade
            points={available}
            selected={points}
            onToggle={togglePoint}
            onClear={() => P([])}
            // 顺序即执行顺序：箭头 / 拖拽都落到这里
            onReorder={reorder}
            // 最优排序：按父线（路网）节点次序重排，避免走回头路
            onOptimize={() => P(optimizePointOrder(s, points))}
          >
            {() => null}
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
        </div>
        )}
        {/* 右：临时路线图（与巡检路线同一套预览：底图 + 父线 + 有序子线）；
            把手贴在地图左缘，点它收起左侧表单、把整幅宽度让给地图 */}
        <div className="re-map">
          <span
            className="re-fold"
            title={sideOpen ? "收起左侧表单，展开地图" : "展开左侧表单"}
            onClick={() => SETSIDEOPEN(!sideOpen)}
          />
          <div className="route-edit-col">
            <RoutePreview
              map={s.maps.find((m) => m.id === (pickedMaps[0] || activeMap))}
              stops={picked}
              height={380}
            />
          </div>
        </div>
    </div>
  );
  const footActions = (
    <>
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
              // 创建成功后的去向**只由调用方决定**：这里不再顺手 onClose ——
              // 否则「关闭 = 回任务列表」这类入口会用后一次跳转把前一次顶掉（表现为留在列表、没进调度页）
              if (onCreated) onCreated(n.tasks[0].id);
              else onClose();
            },
          )
        }
      >
        {rid ? "下发至队列" : "创建并待调度"}
      </Btn>
    </>
  );
  // 路由级入口：整页创建（左表单 + 右路线图同屏，高度不受浮层限制）
  if (inline)
    return (
      <InnerPage title="新建临时任务" actions={footActions}>
        {body}
      </InnerPage>
    );
  return (
    <Drawer title="新建临时任务" onClose={onClose} footer={footActions}>
      {body}
    </Drawer>
  );
}
