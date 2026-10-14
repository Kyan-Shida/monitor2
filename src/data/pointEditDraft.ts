/**
 * @file pointEditDraft.ts
 * @description 「添加 / 编辑巡检点」与「添加 / 编辑巡检项」（内置页）之间的**会话草稿**：
 *              两页共用同一组 `useViewState` 键（sessionStorage），
 *              跳去巡检项内置页再返回时，巡检点表单（名称 / 地图 / 定位点 / 巡检项）不丢。
 * @interaction pages/PointEdit.tsx、pages/InspectItemEdit.tsx
 */

/** 会话草稿键前缀（`useViewState` 内部会补 "view:" 前缀，清理时需带上） */
export const pointDraftKey = (id?: string) => `pe.${id || "new"}`;

/** 一次巡检点编辑会话用到的全部键后缀 */
const SUFFIXES = [".name", ".map", ".target", ".items", ".draft"] as const;

/**
 * 清掉某次巡检点编辑会话的全部草稿
 * @description 保存成功（或主动放弃）后调用；否则下次进入会看到上一次未提交的内容
 * @param id 巡检点 id；缺省 / "new" = 新建会话
 */
export function clearPointDraft(id?: string) {
  const key = pointDraftKey(id);
  for (const suffix of SUFFIXES) {
    try {
      sessionStorage.removeItem("view:" + key + suffix);
    } catch {
      // file:// 离线打开时可能禁用会话存储：忽略即可
    }
  }
}
