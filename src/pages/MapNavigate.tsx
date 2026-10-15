/**
 * @file MapNavigate.tsx
 * @description 地图「导航操作 + 实时监控」二合一内置页。
 *              从地图卡片「导航」进入：先选机器狗，再打开本页。
 *              地图复用标定工作台的那张图（含路网与定位点），不做二次打点。
 *              看：机器人位置、规划路径（沿路网）、实际轨迹、激光点云、
 *                  线速度 / 角速度 / 电量、导航消息；
 *              控：选点导航（customNavigate，从地图定位点里选目标点）、
 *                  取消导航（cancelNavigate）、重开导航（restartNav）、初始化重置。
 * @interaction Maps.tsx → 选择机器狗 → `#/robots/maps/navigate/:mapId?tab=robotId`
 */
import { useEffect, useMemo, useState } from "react";
import { useStore } from "../data/store";
import { Badge, Btn, Note, Panel } from "../components/UI";
import { MapImageCanvas } from "../components/MapImageCanvas";
import type { MapAsset, Robot } from "../data/types";

/** 路网图：邻接表（无向，权重 = 两点百分比距离） */
type Graph = Record<string, { to: string; w: number }[]>;

/** 由路网折线构造无向图：相邻定位点之间连边 */
function buildGraph(
  paths: { pointIds: string[] }[],
  node: Record<string, { x: number; y: number }>,
): Graph {
  const g: Graph = {};
  const link = (a: string, b: string) => {
    const w = Math.hypot(node[a].x - node[b].x, node[a].y - node[b].y);
    (g[a] ||= []).push({ to: b, w });
    (g[b] ||= []).push({ to: a, w });
  };
  paths.forEach((p) => {
    for (let i = 0; i + 1 < p.pointIds.length; i++) {
      const a = p.pointIds[i];
      const b = p.pointIds[i + 1];
      if (node[a] && node[b]) link(a, b);
    }
  });
  return g;
}

/** Dijkstra：返回 start → end 的节点序列；不连通返回 null */
function shortestPath(g: Graph, start: string, end: string): string[] | null {
  if (start === end) return [start];
  const dist: Record<string, number> = { [start]: 0 };
  const prev: Record<string, string> = {};
  const seen = new Set<string>();
  while (true) {
    let cur: string | null = null;
    let best = Infinity;
    Object.keys(dist).forEach((k) => {
      if (!seen.has(k) && dist[k] < best) {
        best = dist[k];
        cur = k;
      }
    });
    if (!cur) break;
    const c = cur as string;
    if (c === end) break;
    seen.add(c);
    (g[c] || []).forEach(({ to, w }) => {
      const nd = dist[c] + w;
      if (dist[to] === undefined || nd < dist[to]) {
        dist[to] = nd;
        prev[to] = c;
      }
    });
  }
  if (dist[end] === undefined) return null;
  const out = [end];
  let p = prev[end];
  while (p !== undefined) {
    out.unshift(p);
    p = prev[p];
  }
  return out;
}

export function MapNavigate({ id, tab }: { id?: string; tab?: string }) {
  const { s } = useStore();
  const m: MapAsset | undefined = s.maps.find((x) => x.id === id);

  const [rid, RID] = useState(tab || "");
  const robot: Robot | undefined =
    s.robots.find((r) => r.id === rid) || s.robots.find((r) => r.mapId === m?.id);

  /** 机器人位姿 + 当前航点序号 */
  const [nav, setNav] = useState({
    x: robot?.x ?? 50,
    y: robot?.y ?? 50,
    yaw: 0,
    idx: 1,
  });
  /** 已选目标点列表（按导航顺序，可排序 / 删除） */
  const [selectedIds, SETIDS] = useState<string[]>([]);
  /** 规划路径（百分比坐标序列，首点为出发位置） */
  const [route, setRoute] = useState<{ x: number; y: number }[]>([]);
  /** 实际轨迹 */
  const [trajectory, setTrajectory] = useState<{ x: number; y: number }[]>([
    { x: robot?.x ?? 50, y: robot?.y ?? 50 },
  ]);
  /** 导航状态 */
  const [navState, setNavState] = useState<
    "idle" | "navigating" | "paused" | "cancelled"
  >("idle");
  /** 线速度 m/s（模拟值） */
  const [linear, setLinear] = useState(0);
  /** 角速度 rad/s（模拟值） */
  const [angular, setAngular] = useState(0);
  /** 导航消息 */
  const [messages, setMessages] = useState<string[]>(["等待导航指令"]);

  // 切换机器人：位姿与导航状态一并重置
  useEffect(() => {
    if (!robot) return;
    setNav({ x: robot.x, y: robot.y, yaw: 0, idx: 1 });
    setTrajectory([{ x: robot.x, y: robot.y }]);
    setNavState("idle");
    setLinear(0);
    setAngular(0);
    setRoute([]);
    SETIDS([]);
    setMessages([`已切换至 ${robot.name}，等待导航指令`]);
  }, [robot?.id]);

  /** 本图标定点位：导航目标点候选（复用标定工作台的点，页面内不打新点） */
  const calib = s.mapCalibrations?.find((c) => c.mapId === m?.id);
  const targets = useMemo(() => calib?.targets || [], [calib]);
  /** 定位点 id → 坐标 */
  const nodeById = useMemo(() => {
    const n: Record<string, { x: number; y: number }> = {};
    targets.forEach((t) => {
      n[t.id] = { x: t.x, y: t.y };
    });
    return n;
  }, [targets]);

  /** 路网折线（底图渲染用）：定位点 id → 百分比坐标 */
  const plannedPaths = useMemo(
    () =>
      (m?.roadnet?.paths || [])
        .map((p) => ({
          id: p.id,
          kind: p.kind,
          points: p.pointIds
            .map((pid) => nodeById[pid])
            .filter((t): t is { x: number; y: number } => !!t),
        }))
        .filter((p) => p.points.length >= 2),
    [m?.roadnet?.paths, nodeById],
  );

  /** 距离某坐标最近的定位点 id */
  const nearestNode = (x: number, y: number) => {
    let best = "";
    let bd = Infinity;
    targets.forEach((t) => {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < bd) {
        bd = d;
        best = t.id;
      }
    });
    return best;
  };

  /**
   * 规划路径：机器人 →（按已选顺序）逐个目标点，段间沿路网
   * @description 相邻段用 Dijkstra 接龙；路网不连通时该段退化为直线，保证演示始终走得动
   */
  const planRoute = (): { x: number; y: number }[] => {
    const out: { x: number; y: number }[] = [{ x: nav.x, y: nav.y }];
    const g = buildGraph(m?.roadnet?.paths || [], nodeById);
    let cur = { x: nav.x, y: nav.y };
    selectedIds.forEach((tid) => {
      const goal = nodeById[tid];
      if (!goal) return;
      const seq = shortestPath(g, nearestNode(cur.x, cur.y), tid);
      const pts = seq
        ? seq.map((nid) => nodeById[nid])
        : [nodeById[nearestNode(cur.x, cur.y)] || goal, goal];
      pts.forEach((p) => {
        const last = out[out.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) > 0.05) out.push(p);
      });
      cur = goal;
    });
    return out;
  };

  /** 图面折线：路网 + 当前规划路径（规划路径高亮） */
  const displayPaths = useMemo(
    () =>
      route.length > 1
        ? [...plannedPaths, { id: "route", kind: "直线", points: route, selected: true }]
        : plannedPaths,
    [plannedPaths, route],
  );

  // 激光点云：围绕机器人生成随机点（随位姿刷新）
  const cloud = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 45; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 1 + Math.random() * 8;
      pts.push({ x: nav.x + Math.cos(angle) * r, y: nav.y + Math.sin(angle) * r });
    }
    return pts;
  }, [nav.x, nav.y]);

  // 导航仿真：沿规划路径逐点前进
  useEffect(() => {
    if (navState !== "navigating" || route.length < 2) return;
    const timer = setInterval(() => {
      setNav((prev) => {
        if (prev.idx >= route.length) return prev;
        const wp = route[prev.idx];
        const dx = wp.x - prev.x;
        const dy = wp.y - prev.y;
        const dist = Math.hypot(dx, dy);
        const step = 0.5; // 百分比 / tick
        if (dist < step) {
          const arrived = prev.idx === route.length - 1;
          if (arrived) {
            setNavState("idle");
            setLinear(0);
            setAngular(0);
            setMessages((ms) => [...ms.slice(-19), "已到达目标点，导航结束"]);
            return { x: wp.x, y: wp.y, yaw: prev.yaw, idx: prev.idx };
          }
          setMessages((ms) => [
            ...ms.slice(-19),
            `经过路径点 ${prev.idx}/${route.length - 1}`,
          ]);
          return { x: wp.x, y: wp.y, yaw: prev.yaw, idx: prev.idx + 1 };
        }
        const nx = prev.x + (dx / dist) * step;
        const ny = prev.y + (dy / dist) * step;
        setLinear(0.6 + Math.random() * 0.4);
        setAngular((Math.random() - 0.5) * 0.3);
        setTrajectory((t) => [...t.slice(-399), { x: nx, y: ny }]);
        return {
          x: nx,
          y: ny,
          yaw: (Math.atan2(dy, dx) * 180) / Math.PI,
          idx: prev.idx,
        };
      });
    }, 80);
    return () => clearInterval(timer);
  }, [navState, route]);

  if (!m) return <Note>地图不存在，请从地图列表进入。</Note>;
  if (!robot) {
    return (
      <Note>
        本地图尚未绑定机器人设备，请先在「地图下发」里绑定设备，再从地图卡片「导航」进入。
      </Note>
    );
  }

  const disabled = m.status === "停用";
  /** 已选目标点（有序、去重后的定位点坐标） */
  const chosen = selectedIds
    .map((tid) => ({ id: tid, pt: nodeById[tid] }))
    .filter((x) => !!x.pt);

  /** 选点导航：按已选顺序逐点导航，沿路网规划并开始 */
  const customNavigate = () => {
    if (!chosen.length || disabled) return;
    const r = planRoute();
    setRoute(r);
    setNav((p) => ({ ...p, idx: 1 }));
    setNavState("navigating");
    setMessages((ms) => [
      ...ms.slice(-19),
      `已选 ${chosen.length} 个目标点（${chosen.map((c) => c.id).join(" → ")}），规划 ${r.length - 1} 段路径，开始导航`,
    ]);
  };

  const cancelNavigate = () => {
    if (navState !== "navigating") return;
    setNavState("cancelled");
    setLinear(0);
    setAngular(0);
    setMessages((ms) => [...ms.slice(-19), "导航已取消"]);
  };

  /** 重开导航：从当前位姿按同一目标序列重新规划 */
  const restartNav = () => {
    if (!chosen.length || disabled) return;
    const r = planRoute();
    setRoute(r);
    setNav((p) => ({ ...p, idx: 1 }));
    setNavState("navigating");
    setMessages((ms) => [...ms.slice(-19), "重新启动导航"]);
  };

  /** 初始化重置：清空目标点选择、规划路径与导航状态 */
  const resetNav = () => {
    SETIDS([]);
    setRoute([]);
    setNav({ x: robot.x, y: robot.y, yaw: 0, idx: 1 });
    setTrajectory([{ x: robot.x, y: robot.y }]);
    setNavState("idle");
    setLinear(0);
    setAngular(0);
    setMessages(["已初始化重置，等待导航指令"]);
  };

  /** 加入目标点：图面点选 / 候选列表共用；重复点不重复加入 */
  const selectTarget = (tid: string) => {
    if (disabled) return;
    if (navState === "navigating") {
      setMessages((ms) => [...ms.slice(-19), "导航进行中，请先取消导航"]);
      return;
    }
    if (selectedIds.includes(tid)) {
      setMessages((ms) => [...ms.slice(-19), `目标点 ${tid} 已在列表中`]);
      return;
    }
    SETIDS((ids) => [...ids, tid]);
    setRoute([]);
    setMessages((ms) => [...ms.slice(-19), `目标点 ${tid} 已加入列表（第 ${selectedIds.length + 1} 个）`]);
  };

  /** 从已选列表删除目标点（导航中不允许） */
  const removeTarget = (tid: string) => {
    if (navState === "navigating") {
      setMessages((ms) => [...ms.slice(-19), "导航进行中，不能修改目标列表"]);
      return;
    }
    SETIDS((ids) => ids.filter((x) => x !== tid));
    setRoute([]);
    setMessages((ms) => [...ms.slice(-19), `目标点 ${tid} 已从列表移除`]);
  };

  /** 已选列表排序：dir = -1 上移 / 1 下移（导航中不允许） */
  const moveTarget = (tid: string, dir: -1 | 1) => {
    if (navState === "navigating") {
      setMessages((ms) => [...ms.slice(-19), "导航进行中，不能修改目标列表"]);
      return;
    }
    SETIDS((ids) => {
      const i = ids.indexOf(tid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ids.length) return ids;
      const next = [...ids];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setRoute([]);
  };

  /** 图面标记：全部定位点 */
  const markers = targets.map((t) => ({
    id: t.id,
    x: t.x,
    y: t.y,
    label: t.id,
    kind: t.pointType || t.kind,
  }));
  /** 最近一次加入的定位点：图面高亮 */
  const lastPicked = selectedIds[selectedIds.length - 1];

  return (
    <>
      <div className="context-bar">
        <b>{m.name}</b>
        <span>
          {m.id} · {m.region} · {robot.name} · 电量 {robot.battery}%
        </span>
        <Badge>{navState}</Badge>
      </div>

      {disabled && (
        <Note>
          <b>地图已停用：</b>该地图处于停用状态，导航操作已被禁用；如需使用请先启用地图。
        </Note>
      )}

      <div className="map-navigate">
        <div className="map-navigate-left">
          <div className="map-navigate-canvas-wrap">
            <MapImageCanvas
              image={m.image}
              paths={displayPaths}
              track={trajectory}
              markers={markers}
              selected={lastPicked || undefined}
              onSelect={selectTarget}
              height={560}
              hint="蓝色箭头 = 机器人；高亮折线 = 规划路径；点击图面定位点可选为导航目标"
            />
            {/* 激光点云 + 机器人朝向箭头覆盖层 */}
            <div className="map-navigate-overlay">
              {cloud.map((pt, i) => (
                <span
                  key={i}
                  className="map-navigate-cloud"
                  style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                />
              ))}
              {/* 已选目标点：图面高亮圈 + 序号 */}
              {chosen.map((c, i) => (
                <span
                  key={c.id}
                  className="map-navigate-chosen"
                  style={{ left: `${c.pt.x}%`, top: `${c.pt.y}%` }}
                >
                  <i>{i + 1}</i>
                </span>
              ))}
              <div
                className="map-navigate-robot"
                style={{
                  left: `${nav.x}%`,
                  top: `${nav.y}%`,
                  transform: `translate(-50%, -50%) rotate(${nav.yaw}deg)`,
                }}
                title="机器人当前位置"
              >
                <svg width="28" height="28" viewBox="0 0 28 28">
                  <polygon
                    points="14,2 26,24 14,19 2,24"
                    fill="#2563eb"
                    stroke="#fff"
                    strokeWidth="2"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="map-navigate-right">
          <Panel title="实时遥测">
            <div className="map-navigate-telemetry">
              <div className="map-navigate-stat">
                <label>线速度</label>
                <b>{linear.toFixed(2)}</b>
                <span>m/s</span>
              </div>
              <div className="map-navigate-stat">
                <label>角速度</label>
                <b>{angular.toFixed(2)}</b>
                <span>rad/s</span>
              </div>
              <div className="map-navigate-stat">
                <label>电量</label>
                <b>{robot.battery}</b>
                <span>%</span>
              </div>
              <div className="map-navigate-stat">
                <label>位姿</label>
                <b>
                  ({nav.x.toFixed(1)}, {nav.y.toFixed(1)})
                </b>
                <span>Yaw {nav.yaw.toFixed(0)}°</span>
              </div>
            </div>
          </Panel>

          <Panel title="选择目标点">
            {targets.length === 0 ? (
              <div className="map-navigate-empty">本地图暂无定位点，请先到标定工作台打点。</div>
            ) : (
              <div className="map-navigate-targets">
                {targets.map((t) => {
                  const picked = selectedIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={"map-navigate-target-row" + (picked ? " on" : "")}
                      onClick={() => selectTarget(t.id)}
                      disabled={disabled}
                      title={picked ? "已加入目标列表" : "加入目标列表"}
                    >
                      <span className="map-navigate-target-id">{t.id}</span>
                      <span className="map-navigate-target-kind">{t.pointType || t.kind}</span>
                      <span className="map-navigate-target-xy">
                        ({t.x.toFixed(1)}, {t.y.toFixed(1)})
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title={`已选目标点 · ${chosen.length}`}>
            {chosen.length === 0 ? (
              <div className="map-navigate-empty">
                尚未选择目标点：点击上方列表或图面定位点加入。
              </div>
            ) : (
              <div className="map-navigate-queue">
                {chosen.map((c, i) => (
                  <div key={c.id} className="map-navigate-queue-row">
                    <span className="map-navigate-queue-seq">{i + 1}</span>
                    <span className="map-navigate-queue-id">{c.id}</span>
                    <span className="map-navigate-queue-xy">
                      ({c.pt.x.toFixed(1)}, {c.pt.y.toFixed(1)})
                    </span>
                    <span className="map-navigate-queue-ops">
                      <button
                        type="button"
                        title="上移"
                        disabled={i === 0 || navState === "navigating"}
                        onClick={() => moveTarget(c.id, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        title="下移"
                        disabled={i === chosen.length - 1 || navState === "navigating"}
                        onClick={() => moveTarget(c.id, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        title="删除"
                        className="danger"
                        disabled={navState === "navigating"}
                        onClick={() => removeTarget(c.id)}
                      >
                        ✕
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="导航控制">
            <div className="map-navigate-controls">
              <Btn
                primary
                disabled={disabled || !chosen.length || navState === "navigating"}
                onClick={customNavigate}
              >
                选点导航
              </Btn>
              <Btn disabled={disabled || navState !== "navigating"} onClick={cancelNavigate}>
                取消导航
              </Btn>
              <Btn
                disabled={disabled || !chosen.length || navState === "navigating"}
                onClick={restartNav}
              >
                重开导航
              </Btn>
              <Btn onClick={resetNav}>初始化重置</Btn>
            </div>
            {chosen.length > 0 && (
              <div className="map-navigate-target">
                目标顺序：{chosen.map((c) => c.id).join(" → ")}
                {route.length > 1 && ` · 规划 ${route.length - 1} 段`}
              </div>
            )}
          </Panel>

          <Panel title="导航消息">
            <div className="map-navigate-messages">
              {messages.map((msg, i) => (
                <div key={i} className="map-navigate-message">
                  {msg}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
