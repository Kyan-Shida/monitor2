/**
 * @file evidence.ts
 * @description 证据图占位生成（离线 SVG data URI，不依赖网络与静态资源）：
 *              为「巡检结果详情」的「原始采集图像 / 识别分析后图像」两列提供示意画面
 * @interaction 由 components/ResultView.tsx（巡检结果详情内置页）调用；同一巡检项生成结果稳定（按标签哈希取色），刷新不跳变
 */

/** 稳定哈希：同一标签始终得到同一配色 */
const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
  return h;
};
/** SVG 文本转义：避免点位名中的特殊字符破坏图形 */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 场景底图（现场画面示意）：原始图与识别图共用 */
const base = (hue: number) => `
  <defs><linearGradient id='b' x1='0' y1='0' x2='0' y2='1'>
    <stop offset='0' stop-color='hsl(${hue},26%,34%)'/>
    <stop offset='1' stop-color='hsl(${hue},22%,18%)'/>
  </linearGradient></defs>
  <rect width='320' height='200' fill='url(#b)'/>
  <rect x='0' y='152' width='320' height='8' fill='rgba(255,255,255,.10)'/>
  <rect x='20' y='56' width='92' height='96' rx='6' fill='rgba(255,255,255,.10)'/>
  <rect x='132' y='70' width='14' height='82' fill='rgba(255,255,255,.16)'/>
  <circle cx='200' cy='104' r='42' fill='rgba(255,255,255,.14)' stroke='rgba(255,255,255,.30)' stroke-width='3'/>
  <path d='M200 62V78M200 130v16M158 104h16M226 104h16' stroke='rgba(255,255,255,.42)' stroke-width='2'/>`;

/**
 * 原始采集图像：机器人相机原始画面示意
 * @param label 画面标注（一般为巡检点名称）
 * @returns 离线 SVG data URI
 */
export function rawPhoto(label: string): string {
  const hue = 196 + (hash(label) % 18);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200'>${base(hue)}
  <rect x='12' y='12' width='54' height='7' rx='3' fill='rgba(255,255,255,.5)'/>
  <text x='12' y='38' font-family='sans-serif' font-size='12' fill='rgba(255,255,255,.78)'>原始采集图像</text>
  <text x='12' y='188' font-family='sans-serif' font-size='12' fill='rgba(255,255,255,.88)'>${esc(label)}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * 识别分析后图像：在原始画面上叠加 AI 识别框与读数标注
 * @param label 画面标注（一般为巡检点名称）
 * @param reading 识别读数文案（如 0.92 MPa）
 * @param abnormal 是否异常：异常用红色框、正常用绿色框
 * @returns 离线 SVG data URI
 */
export function analyzedPhoto(
  label: string,
  reading: string,
  abnormal: boolean,
): string {
  const hue = 196 + (hash(label) % 18);
  const tone = abnormal ? "hsl(8,72%,52%)" : "hsl(150,50%,44%)";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200'>${base(hue)}
  <rect x='12' y='12' width='54' height='7' rx='3' fill='rgba(255,255,255,.5)'/>
  <text x='12' y='38' font-family='sans-serif' font-size='12' fill='rgba(255,255,255,.78)'>AI 识别分析</text>
  <rect x='154' y='58' width='92' height='92' fill='none' stroke='${tone}' stroke-width='3'/>
  <path d='M154 74h16M154 58h16M154 58v16M230 58h16M246 58v16M246 134v16M230 150h16M170 150h-16M154 150v-16'
        stroke='${tone}' stroke-width='3' fill='none'/>
  <rect x='150' y='36' width='120' height='18' rx='4' fill='${tone}'/>
  <text x='156' y='50' font-family='sans-serif' font-size='12' fill='#fff'>${esc(reading)}</text>
  <text x='12' y='188' font-family='sans-serif' font-size='12' fill='rgba(255,255,255,.88)'>${esc(label)}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * 识别耗时（演示值）：按结果 ID 稳定生成 0.4–0.9s，避免每次渲染跳变
 * @param seed 稳定种子（一般传结果 ID）
 */
export const costOf = (seed: string) => (0.42 + (hash(seed) % 48) / 100).toFixed(2);
