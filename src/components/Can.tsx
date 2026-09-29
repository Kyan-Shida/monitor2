/**
 * @file Can.tsx
 * @description 按钮级权限门控：页面用 <Can perm={PERMS.x}> 包裹，避免权限判断散落各页面
 * @interaction 所有含操作按钮的页面（调度、执行、告警、驾驶舱等）
 */
import type { ReactNode } from "react";
import { useStore } from "../data/store";
import { canDo, roleOf, type Role } from "../data/roles";

/**
 * 读取当前演示角色（原型阶段由角色切换器决定，代替真实登录）
 * @returns 当前角色定义
 */
export const useRole = (): Role => roleOf(useStore().s.roleId);

/**
 * 权限门控：无权限时不渲染子节点
 * @param perm 权限点，取自 roles.ts 的 PERMS
 * @param children 有权限时渲染的内容
 */
export const Can = ({ perm, children }: { perm: string; children: ReactNode }) =>
  canDo(useRole(), perm) ? <>{children}</> : null;
