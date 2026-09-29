/**
 * @file ControlPad.tsx
 * @description 驾驶舱导航控制盘：方向指令宫格 + 速度档位滑块（速度档位真实作用于位移步长）
 * @interaction 被 pages/DispatchCockpit.tsx 消费；指令经 act({ type: "CONTROL", command, step }) 进入状态机
 */
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Crosshair,
} from "lucide-react";

/** 手动移动指令集 */
export type MoveCommand = "前进" | "后退" | "左移" | "右移";

export function ControlPad({
  onCommand,
  disabled = false,
  speed,
  onSpeed,
  hint,
}: {
  /** 方向指令回调 */
  onCommand: (cmd: MoveCommand) => void;
  /** 未接管或设备不可用时禁用 */
  disabled?: boolean;
  /** 速度档位 1-9，映射为位移步长 */
  speed: number;
  onSpeed: (v: number) => void;
  /** 禁用原因提示 */
  hint?: string;
}) {
  return (
    <>
      <div className="cs-pad">
        <button
          className="pad-up"
          disabled={disabled}
          onClick={() => onCommand("前进")}
          aria-label="前进"
        >
          <ChevronUp size={18} />
        </button>
        <button
          className="pad-left"
          disabled={disabled}
          onClick={() => onCommand("左移")}
          aria-label="左移"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="pad-core">
          <Crosshair size={16} />
        </span>
        <button
          className="pad-right"
          disabled={disabled}
          onClick={() => onCommand("右移")}
          aria-label="右移"
        >
          <ChevronRight size={18} />
        </button>
        <button
          className="pad-down"
          disabled={disabled}
          onClick={() => onCommand("后退")}
          aria-label="后退"
        >
          <ChevronDown size={18} />
        </button>
      </div>
      <label className="cs-speed">
        <span>速度</span>
        <input
          type="range"
          min={1}
          max={9}
          value={speed}
          disabled={disabled}
          onChange={(e) => onSpeed(Number(e.target.value))}
        />
        <b>{speed}</b>
      </label>
      {hint && <small className="cs-hint">{hint}</small>}
    </>
  );
}
