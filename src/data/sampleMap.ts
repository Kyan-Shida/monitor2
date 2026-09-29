/**
 * @file sampleMap.ts
 * @description 示例地图底图：厂区平面示意图（内联 SVG，转 data URL）。
 *              用于原型"上传底图 → 图上标注点位"的初始演示，避免引入二进制资源
 *              （离线单文件导出时会外链失效）。
 * @interaction 被 data/seed.ts 用作 MapAsset.image 的初始值
 */

/** 示例底图 SVG（viewBox 1000×620，与点位百分比坐标同构） */
const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 620" font-family="PingFang SC,Microsoft YaHei,sans-serif">
  <rect width="1000" height="620" fill="#eef2f7"/>
  <rect x="22" y="22" width="956" height="576" fill="#f8fafd" stroke="#b7c5d6" stroke-width="3"/>
  <rect x="22" y="286" width="956" height="52" fill="#e4eaf2"/>
  <rect x="470" y="22" width="52" height="576" fill="#e4eaf2"/>
  <line x1="22" y1="312" x2="978" y2="312" stroke="#c8d3e1" stroke-width="2" stroke-dasharray="14 12"/>
  <line x1="496" y1="22" x2="496" y2="598" stroke="#c8d3e1" stroke-width="2" stroke-dasharray="14 12"/>

  <rect x="620" y="52" width="330" height="82" rx="6" fill="#eef4fb" stroke="#9db1c8" stroke-width="3" stroke-dasharray="10 7"/>
  <text x="785" y="102" text-anchor="middle" font-size="22" fill="#4d6076">A 段管廊</text>
  <rect x="620" y="486" width="330" height="72" rx="6" fill="#eef4fb" stroke="#9db1c8" stroke-width="3" stroke-dasharray="10 7"/>
  <text x="785" y="530" text-anchor="middle" font-size="22" fill="#4d6076">B 段管廊</text>

  <g stroke="#8ea4bc" stroke-width="4" fill="#dee7f1">
    <circle cx="230" cy="168" r="82"/>
    <circle cx="230" cy="448" r="82"/>
    <circle cx="792" cy="248" r="70"/>
    <circle cx="792" cy="418" r="70"/>
  </g>
  <g fill="none" stroke="#a8b9cd" stroke-width="2" stroke-dasharray="8 8">
    <circle cx="230" cy="168" r="60"/>
    <circle cx="230" cy="448" r="60"/>
    <circle cx="792" cy="248" r="50"/>
    <circle cx="792" cy="418" r="50"/>
  </g>
  <g fill="#c4d0de">
    <circle cx="230" cy="168" r="11"/>
    <circle cx="230" cy="448" r="11"/>
    <circle cx="792" cy="248" r="10"/>
    <circle cx="792" cy="418" r="10"/>
  </g>
  <g font-size="21" fill="#4a5c72" text-anchor="middle">
    <text x="230" y="272">T-01 原料罐</text>
    <text x="230" y="552">T-03 原料罐</text>
    <text x="792" y="342">T-02 缓冲罐</text>
    <text x="792" y="512">T-04 缓冲罐</text>
  </g>

  <rect x="384" y="106" width="176" height="104" rx="8" fill="#e8eef7" stroke="#93a7bd" stroke-width="3"/>
  <text x="472" y="166" text-anchor="middle" font-size="20" fill="#4d6076">泵房 P-1</text>
  <rect x="384" y="404" width="176" height="104" rx="8" fill="#e8eef7" stroke="#93a7bd" stroke-width="3"/>
  <text x="472" y="464" text-anchor="middle" font-size="20" fill="#4d6076">配电房</text>

  <g stroke="#b3c1d2" stroke-width="12" stroke-linecap="round" fill="none">
    <path d="M312 168H384"/>
    <path d="M560 158H722"/>
    <path d="M312 448H384"/>
    <path d="M560 456H722"/>
    <path d="M472 210V404"/>
  </g>
  <g stroke="#b3c1d2" stroke-width="3">
    <path d="M312 154v28M312 434v28M560 144v28M560 442v28"/>
  </g>

  <g fill="#e3ecf5" stroke="#93a7bd" stroke-width="3">
    <rect x="60" y="548" width="46" height="46" rx="6"/>
    <rect x="894" y="548" width="46" height="46" rx="6"/>
  </g>
  <g font-size="16" fill="#5b6b7c" text-anchor="middle">
    <text x="83" y="530">充电桩</text>
    <text x="917" y="530">停靠点</text>
  </g>

  <g>
    <rect x="40" y="40" width="188" height="96" rx="6" fill="#ffffff" stroke="#c8d5e4"/>
    <text x="54" y="68" font-size="17" fill="#3f5568">图例</text>
    <circle cx="62" cy="90" r="6" fill="#dee7f1" stroke="#8ea4bc" stroke-width="2"/>
    <text x="76" y="95" font-size="15" fill="#5b6b7c">储罐</text>
    <rect x="48" y="108" width="20" height="12" fill="#e4eaf2"/>
    <text x="76" y="119" font-size="15" fill="#5b6b7c">道路</text>
  </g>

  <g transform="translate(936,64)">
    <circle r="26" fill="#ffffff" stroke="#c8d5e4"/>
    <path d="M0 -17 L7 9 L0 3 L-7 9 Z" fill="#5b7fa6"/>
  </g>
  <text x="936" y="118" text-anchor="middle" font-size="15" fill="#6b7f94">N</text>

  <g>
    <rect x="40" y="566" width="150" height="12" fill="#5b7fa6"/>
    <rect x="40" y="566" width="75" height="12" fill="#9fb6cd"/>
    <text x="200" y="577" font-size="14" fill="#6b7f94">0        5        10 m</text>
  </g>
</svg>`;

/** 示例底图（data URL，可直接作为 <img src> 使用） */
export const SAMPLE_MAP_IMAGE = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(SAMPLE_SVG);

/**
 * 示例地图自带的**定位ID点**（地图导入来源，尚未绑定巡检点）
 * @description 真实项目里由建图文件带入；原型随示例地图 / 上传图片一起给出，
 *              让"导入地图 → 直接可绑定巡检点"一步成立（坐标与底图百分比同构）
 */
export const SAMPLE_MAP_TARGETS: {
  id: string;
  x: number;
  y: number;
  kind: string;
}[] = [
  { id: "A04-101", x: 24, y: 30, kind: "可见光" },
  { id: "A04-102", x: 40, y: 24, kind: "可见光" },
  { id: "A04-103", x: 56, y: 34, kind: "红外" },
  { id: "A04-104", x: 72, y: 26, kind: "可见光" },
  { id: "A04-105", x: 84, y: 36, kind: "红外" },
  { id: "A04-106", x: 26, y: 72, kind: "气体" },
  { id: "A04-107", x: 44, y: 66, kind: "可见光" },
  { id: "A04-108", x: 62, y: 74, kind: "气体" },
  { id: "A04-109", x: 80, y: 68, kind: "可见光" },
  { id: "A04-110", x: 88, y: 60, kind: "可见光" },
];

/** 示例地图自带的轨迹采样点（按顺序连线） */
export const SAMPLE_MAP_TRACK: { x: number; y: number; kind: string; seq: number }[] = [
  { x: 16, y: 82, kind: "起点", seq: 1 },
  { x: 30, y: 66, kind: "停靠点", seq: 2 },
  { x: 46, y: 40, kind: "转弯点", seq: 3 },
  { x: 64, y: 30, kind: "停靠点", seq: 4 },
  { x: 84, y: 30, kind: "停靠点", seq: 5 },
  { x: 86, y: 60, kind: "终点", seq: 6 },
];

/** 示例地图文件名（展示 / 校验用） */
export const SAMPLE_MAP_FILE = "sample-map-A04.map";
