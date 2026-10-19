/**
 * @file taskStatus.ts
 * @description 任务状态口径的唯一真源：状态全集 + 色调映射。
 *              参数字典「任务执行状态」、任务列表徽标、筛选下拉都从这里取，避免各处口径不一致。
 * @interaction data/types.ts 的 TaskStatus；seed.ts 的 DIC01；pages/Planning.tsx 的状态列
 */
import type { TaskStatus } from "./types";

/** 任务状态全集（顺序即业务流转顺序） */
export const TASK_STATUSES: TaskStatus[] = [
  "待调度",
  "已分配",
  "下发中",
  "待执行",
  "执行中",
  "已被接管",
  "暂停",
  "完成",
  "部分完成",
  "失败",
  "取消",
  "超期",
];


