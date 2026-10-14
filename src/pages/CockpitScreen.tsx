import { useState, useEffect, useCallback, type CSSProperties } from "react";
import { MonitorCockpit } from "./MonitorCockpit";
import { DispatchCockpit } from "./DispatchCockpit";
import { VideoWall } from "./VideoWall";
import type { CockpitId } from "../components/ScreenTopBar";
/**
 * 三套大屏共用同一容器：overview=数据大屏、screen=机器人监控、video=视频监控流。
 * Tab 切换会卸载旧 cockpit-screen → 浏览器自动 exitFullscreen（全屏元素从 DOM 消失）。
 * 因此 onSwitch 在这里统一拦截：切换后如果之前是全屏，对新挂载的 .cockpit-screen 再 requestFullscreen。
 */
export function CockpitScreen({
  initial = "overview",
}: {
  initial?: CockpitId;
}) {
  const [which, setWhich] = useState<CockpitId>(initial);
  const [viewport, setViewport] = useState(() => ({w: window.innerWidth, h: window.innerHeight}));
  useEffect(() => {
    const resize = () => setViewport({w: window.innerWidth, h: window.innerHeight});
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  /** 拦截 Tab 切换：保持全屏状态跨越组件卸载/挂载 */
  const switchTo = useCallback((next: CockpitId) => {
    if (next === which) return;
    const wasFullscreen = !!document.fullscreenElement;
    setWhich(next);
    if (wasFullscreen) {
      // 用两帧延迟确保新 cockpit-screen 已挂载（React commit → DOM 插入 → 布局完成）
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLElement>(".cockpit-screen:not(:fullscreen)");
          el?.requestFullscreen?.();
        }),
      );
    }
  }, [which]);

  // Keep all cockpit modules on the display; compact screens scale the complete canvas.
  const scale = Math.min(1, viewport.h / 1200, viewport.w / 1436);
  return (
    <div className="bigscreen" style={{"--cockpit-scale": scale, "--cockpit-height": `${viewport.h / scale}px`} as CSSProperties}>
      {which === "overview" ? (
        <MonitorCockpit onSwitch={switchTo} />
      ) : which === "screen" ? (
        <DispatchCockpit onSwitch={switchTo} />
      ) : (
        <VideoWall onSwitch={switchTo} />
      )}
    </div>
  );
}
