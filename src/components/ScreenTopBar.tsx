/**
 * @file ScreenTopBar.tsx
 * @description 大屏全局导航栏：**两个驾驶舱共用同一个组件、同一套样式**——
 *              卡片底（bg-slate-900 #0f172a + border-slate-800 #1e293b + 圆角）上，
 *              左侧「品牌 + 两舱导航 Tab（带图标）」、中部「居中发光标题」、
 *              右侧「各舱自身控件 + 实时时间（精确到秒）」。
 * @interaction 由 MonitorCockpit / DispatchCockpit 统一作为顶栏渲染；在独立大屏窗口内由父级传入 onSwitch 切换本地视图，
 *              在后台外壳下缺省按路由跳转
 */
import { useEffect, useState, type ReactNode } from "react";
import { LayoutDashboard, Radio, Video } from "lucide-react";
import { go } from "../data/navigation";

/** 大屏页面标识 */
export type CockpitId = "overview" | "screen" | "video";
/** 星期中文（导航栏时间显示用） */
const WEEK_CN = ["日", "一", "二", "三", "四", "五", "六"];
/** 导航 Tab 配置：顺序即展示顺序，图标与文案一一对应 */
const TABS: { id: CockpitId; label: string; Icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "数据大屏", Icon: LayoutDashboard },
  { id: "screen", label: "机器人监控", Icon: Radio },
  { id: "video", label: "视频监控流", Icon: Video },
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
   * 右侧附加控件（筛选 / 状态灯 / 调度中心 / 全屏 / 紧急停止等）
   * @description 各舱自身控件并入顶栏右侧，避免顶部区域再占一行、吃掉屏高
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
      {/* 左：品牌 + 两舱导航 Tab（两舱位置完全一致，切换时不再跳动） */}
      <div className="cs-nav-left">
        <div className="cs-brand">
          <i />
          XXX智能机器巡检平台
        </div>
        <nav className="cs-nav-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={"cs-nav-tab" + (current === t.id ? " active" : "")}
              onClick={() => switchTo(t.id)}
            >
              <t.Icon size={13} />
              {t.label}
            </button>
          ))}
        </nav>
      </div>
      {/* 中：居中发光标题（两舱共用同一套文案） */}
      <div className="cs-nav-center">
        <div className="cs-nav-title">
          <h1>{TITLE}</h1>
          <small>{SUBTITLE}</small>
        </div>
      </div>
      <div className="cs-nav-right">
        {/* 各舱自身控件：并入顶栏右侧，时间之前 */}
        {extra}
        <span className="cs-nav-time">{timeText}</span>
      </div>
    </header>
  );
}
