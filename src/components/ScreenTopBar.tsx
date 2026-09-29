/**
 * @file ScreenTopBar.tsx
 * @description 大屏全局导航栏：左侧品牌、中部（两个导航 Tab 紧邻流线型发光标题，整组绝对居中）、
 *              右侧「返回工作台」+ 实时时间（精确到秒）
 * @interaction 由 MonitorCockpit / DispatchCockpit 统一作为顶栏渲染；在独立大屏窗口内由父级传入 onSwitch 切换本地视图，
 *              在后台外壳下缺省按路由跳转
 */
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { go } from "../data/navigation";

/** 驾驶舱页面标识 */
export type CockpitId = "overview" | "screen";
/** 星期中文（导航栏时间显示用） */
const WEEK_CN = ["日", "一", "二", "三", "四", "五", "六"];
/** 导航 Tab 配置：顺序即展示顺序（分别位于中部标题的左右两侧） */
const TABS: [CockpitId, string][] = [
  ["overview", "管理驾驶舱"],
  ["screen", "调度指挥驾驶舱"],
];
/** 导航栏大标题与英文副标题：两个驾驶舱统一使用同一套文案 */
const TITLE = "XXX智能机器巡检数据驾驶舱";
const SUBTITLE = "INTELLIGENT INSPECTION DATA COCKPIT";

export function ScreenTopBar({
  current,
  onSwitch,
  extra,
}: {
  /** 当前所在驾驶舱 */
  current: CockpitId;
  /** 驾驶舱切换：缺省时按路由跳转 */
  onSwitch?: (id: CockpitId) => void;
  /**
   * 右侧附加控件（厂区筛选 / 全屏等）
   * @description 并入顶栏而不是单独占一行，避免顶部区域吃掉过多屏高（版面按比例分配）
   */
  extra?: ReactNode;
}) {
  const [now, NOW] = useState(() => new Date());
  // 大屏时钟需精确到秒：每秒推进一次，仅用于展示
  useEffect(() => {
    const i = setInterval(() => NOW(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  const switchTo = (id: CockpitId) => {
    if (id === current) return;
    if (onSwitch) onSwitch(id);
    else go(id);
  };
  const timeText = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} 星期${
    WEEK_CN[now.getDay()]
  } ${now.toLocaleTimeString("zh-CN", { hour12: false })}`;
  return (
    <header className="cs-nav">
      <div className="cs-nav-left">
        <div className="cs-brand">
          <i />
          XXX智能机器巡检平台
        </div>
      </div>
      {/* 中部：导航 Tab 分列标题左右，整组在导航栏中绝对居中 */}
      <div className="cs-nav-center">
        <button
          className={"cs-nav-tab" + (current === "overview" ? " active" : "")}
          onClick={() => switchTo("overview")}
        >
          {TABS[0][1]}
        </button>
        <div className="cs-nav-title">
          <h1>{TITLE}</h1>
          <small>{SUBTITLE}</small>
        </div>
        <button
          className={"cs-nav-tab" + (current === "screen" ? " active" : "")}
          onClick={() => switchTo("screen")}
        >
          {TABS[1][1]}
        </button>
      </div>
      <div className="cs-nav-right">
        {/* <button
          className="cs-nav-back"
          title="退出大屏，回到角色工作台"
          onClick={() => go("workbench")}
        >
          <ArrowLeft size={14} />
          返回工作台
        </button> */}
        {/* 各舱自身控件（厂区筛选 / 调度中心 / 全屏 / 紧急停止）：并入顶栏右侧，时间之前 */}
        {extra}
        <span className="cs-nav-time">{timeText}</span>
      </div>
    </header>
  );
}
