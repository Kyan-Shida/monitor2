/**
 * @file pointEditDraft.ts
 * @description 「巡检点详情」（新增 / 编辑巡检点合并页）的**会话草稿**：
 *              表单与巡检项都走同一组 `useViewState` 键（sessionStorage），
 *              刷新或切页回来时名称 / 地图 / 坐标 / 巡检项不丢。
 * @interaction pages/PointEdit.tsx
 */

/** 会话草稿键前缀（`useViewState` 内部会补 "view:" 前缀，清理时需带上） */
export const pointDraftKey = (id?: string) => `pe.${id || "new"}`;

/** 一次巡检点编辑会话用到的全部键后缀（点「保存」成功或「取消」时整组清掉） */
const SUFFIXES = [
  ".name",
  ".map",
  ".target",
  ".items",
  ".draft",
  ".robot",
  ".recAct",
  ".picked",
  ".poseSaved",
] as const;

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
