import { useState, useEffect, type CSSProperties } from "react";
import { MonitorCockpit } from "./MonitorCockpit";
import { DispatchCockpit } from "./DispatchCockpit";
import type { CockpitId } from "../components/ScreenTopBar";
/** 保留客户版两套完整驾驶舱的信息与业务动作。 */
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
  // Keep all cockpit modules on the display; compact screens scale the complete canvas.
  const scale = Math.min(1, viewport.h / 1200, viewport.w / 1436);
  return (
    <div className="bigscreen" style={{"--cockpit-scale": scale, "--cockpit-height": `${viewport.h / scale}px`} as CSSProperties}>
      {which === "overview" ? (
        <MonitorCockpit onSwitch={setWhich} />
      ) : (
        <DispatchCockpit onSwitch={setWhich} />
      )}
    </div>
  );
}
