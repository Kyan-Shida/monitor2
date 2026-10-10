/**
 * @file versionLabel.ts
 * @description 版本号的中文展示口径：地图空间版本 V{n}、对象自带版本 v{n}。
 *              裸编码（如 V2）业务人员读不懂，统一由此处转成中文（数字保留）。
 *              系统只保留「地图空间版本」一个版本维度：巡检点 / 标定数据不设独立版本。
 * @interaction 被 pages/* 与 components/* 中的版本展示位调用
 */

/**
 * 地图空间版本：V{n} → 地图第 n 版
 * @param v 地图版本号（缺省按 0 处理）
 * @returns 中文版本标签
 */
export function mapVer(v?: number): string {
  return `地图第 ${v ?? 0} 版`;
}
