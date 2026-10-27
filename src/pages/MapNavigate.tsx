/**
 * @file MapNavigate.tsx
 * @description 地图「路线导航测试 + 实时监控」内置页。
 *              从巡检路线「导航」进入：对本图的自建路线实跑一遍做验证。
 *              地图复用标定工作台的那张图（含路网与定位点），不做二次打点。
 *              看：机器人位置、规划路径、实际轨迹、激光点云、
 *                  线速度 / 角速度 / 电量、导航消息；
 *              控：运行路线 / 验证通过 / 放弃验证；
 *                  机器控制（可见光 + 红外实时画面）与应急操控
 *                  （终止回库 abortAndReturn、操控脱困 jog）。
 * @interaction Planning.tsx 路线列表「导航」→ `#/robots/maps/navigate/:mapId?tab=robotId`
 */
import { useEffect, useMemo, useState } from "react";
import { Thermometer, Video } from "lucide-react";
import { useStore } from "../data/store";
import { useViewState } from "../data/navigation";
import { routeMapIds } from "../data/routeMaps";
import { Badge, Btn, Note, Panel } from "../components/UI";
import { MapImageCanvas } from "../components/MapImageCanvas";
import type { MapAsset, Robot } from "../data/types";

export function MapNavigate({ id, tab }: { id?: string; tab?: string }) {
  const { s, act } = useStore();
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
  /** 操控脱困模式：开启后可手动点动微调机器人位姿 */
  const [manual, setManual] = useState(false);
  /** 线速度 m/s（模拟值） */
  const [linear, setLinear] = useState(0);
  /** 角速度 rad/s（模拟值） */
  const [angular, setAngular] = useState(0);
  /** 导航消息 */
  const [messages, setMessages] = useState<string[]>(["等待导航指令"]);
  /** 待验证的自建路线 id（从路线列表「导航」带入，随即走一遍验证） */
  const [verifyId, SETVERIFYID] = useViewState<string>("maps.navRoute", "");
  /**
   * 待验证路线
   * @description 只认「本图 + 自建 + 尚未验证」的路线；路线不绑定地图，
   *              「本图」按巡检点反推（点落在本图即在本页验证）；自建线路不走父线，
   *              必须由机器人实跑可行后才允许启用，因此本页承担它的验证入口
   */
  const verifying = s.templates.find(
    (t) =>
      t.id === verifyId &&
      t.mode === "自建路线" &&
      !t.verified &&
      routeMapIds(s, t.points).includes(m?.id || ""),
  );
  /** 本页是否已按待验证路线实跑过一次（跑过才允许判定「验证通过」） */
  const [ranRoute, SETRANROUTE] = useState(false);

  // 切换机器人：位姿与导航状态一并重置
  useEffect(() => {
    if (!robot) return;
    setNav({ x: robot.x, y: robot.y, yaw: 0, idx: 1 });
    setTrajectory([{ x: robot.x, y: robot.y }]);
    setNavState("idle");
    setLinear(0);
    setAngular(0);
    setRoute([]);
    SETRANROUTE(false);
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

  /** 图面折线：路网 + 当前规划路径（规划路径高亮） */
  const displayPaths = useMemo(() => {
    /** 图面折线：路网（父线）+ 待验证的自定义线路 + 当前规划路径 */
    type DrawPath = {
      id: string;
      kind: string;
      points: { x: number; y: number }[];
      selected?: boolean;
    };
    const list: DrawPath[] = [...plannedPaths];
    // 待验证的自定义线路先铺在图上，便于对着它实跑一遍
    if (verifying?.path && verifying.path.length > 1)
      list.push({
        id: `verify-${verifying.id}`,
        kind: "自建路线",
        points: verifying.path,
        selected: true,
      });
    if (route.length > 1)
      list.push({ id: "route", kind: "直线", points: route, selected: true });
    return list;
  }, [plannedPaths, route, verifying]);

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

  /** 停用 / 停用中都不接受新导航：停用中说明图上还有任务在跑 */
  const disabled = m.status === "停用" || !!m.stopping;

  /** 终止回库：中断当前导航，机器人停止并返回库位 */
  const abortAndReturn = () => {
    setRoute([]);
    setNavState("idle");
    setLinear(0);
    setAngular(0);
    setManual(false);
    setMessages((ms) => [...ms.slice(-19), "已终止任务，机器人返回库位"]);
  };

  /** 操控脱困：手动点动微调机器人位姿（每步 2%） */
  const jog = (dx: number, dy: number) => {
    setNavState("idle");
    setLinear(0);
    setAngular(0);
    setNav((p) => ({
      ...p,
      x: Math.min(98, Math.max(2, p.x + dx)),
      y: Math.min(98, Math.max(2, p.y + dy)),
    }));
  };

  /** 图面标记：全部定位点 */
  const markers = targets.map((t) => ({
    id: t.id,
    x: t.x,
    y: t.y,
    label: t.id,
    kind: t.pointType || t.kind,
  }));
  return (
    <>
      <div className="context-bar">
        <b>{m.name}</b>
        <span>
          {m.id} · {m.region} · {robot.name} · 电量 {robot.battery}%
        </span>
        <Badge>{navState}</Badge>
        {verifying && <Badge tone="amber">路线验证 · {verifying.id}</Badge>}
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
              height={560}
              hint="蓝色箭头 = 机器人；高亮折线 = 规划路径"
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

          {/* 地图下方：机器控制（可见光 + 红外实时画面 + 应急操控） */}
          <Panel className="map-navigate-machine">
            <div className="cockpit-video-row">
              <div className="video-pane">
                <span className="video-label">
                  <Video size={14} /> 可见光
                </span>
                <div className="video-placeholder">
                  <span>演示画面 · 非真实机器人推流</span>
                </div>
              </div>
              <div className="video-pane">
                <span className="video-label">
                  <Thermometer size={14} /> 红外热像
                </span>
                <div className="video-placeholder thermal">
                  <span>演示画面 · 非真实机器人推流</span>
                </div>
              </div>
            </div>
            <div className="map-navigate-controls">
              <Btn danger onClick={abortAndReturn}>
                终止回库
              </Btn>
              <Btn onClick={() => setManual((v) => !v)}>
                {manual ? "退出操控" : "操控脱困"}
              </Btn>
            </div>
            {manual && (
              <div className="map-navigate-dpad">
                <button type="button" title="前进" onClick={() => jog(0, -2)}>
                  ↑
                </button>
                <div className="map-navigate-dpad-mid">
                  <button type="button" title="左移" onClick={() => jog(-2, 0)}>
                    ←
                  </button>
                  <button type="button" title="右移" onClick={() => jog(2, 0)}>
                    →
                  </button>
                </div>
                <button type="button" title="后退" onClick={() => jog(0, 2)}>
                  ↓
                </button>
              </div>
            )}
          </Panel>
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

          {verifying && (
            <Panel title={`路线验证 · ${verifying.id}`}>
              <div className="map-navigate-target">
                {verifying.name} · 路径 {verifying.path?.length || 0} 点
              </div>
              <div className="map-navigate-controls">
                <Btn
                  primary
                  disabled={disabled || navState === "navigating"}
                  onClick={() => {
                    // 验证就是照自绘线路实跑一遍：不走路网规划，直接沿线走
                    setRoute(verifying.path || []);
                    setNav((p) => ({ ...p, idx: 1 }));
                    setNavState("navigating");
                    SETRANROUTE(true);
                    setMessages((ms) => [
                      ...ms.slice(-19),
                      `开始按路线 ${verifying.id} 实跑验证`,
                    ]);
                  }}
                >
                  运行路线
                </Btn>
                <Btn
                  disabled={!ranRoute || disabled || navState === "navigating"}
                  onClick={() => {
                    if (
                      act({
                        type: "VERIFY_ROUTE",
                        id: verifying.id,
                        robotId: robot.id,
                      })
                    ) {
                      setMessages((ms) => [
                        ...ms.slice(-19),
                        `路线 ${verifying.id} 导航验证通过，可启用`,
                      ]);
                      SETVERIFYID("");
                      SETRANROUTE(false);
                    }
                  }}
                >
                  验证通过
                </Btn>
                <Btn onClick={() => SETVERIFYID("")}>放弃验证</Btn>
              </div>
            </Panel>
          )}

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
