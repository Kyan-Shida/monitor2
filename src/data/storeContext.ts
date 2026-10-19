import { createContext } from "react";
import type { State } from "./types";
import type { Action } from "./engine";
import type { AuthAccount } from "./auth";
export const StoreContext = createContext<{
  s: State;
  act: (a: Action, onSuccess?: (s: State) => void) => boolean;
  reset: () => void;
  /** 切换演示角色（原型阶段代替真实登录），影响菜单 / 默认页 / 按钮 / 驾驶舱视图 */
  setRole: (id: string) => void;
  /** 切换演示租户（省事版多租户）：整份换数据，仅超级管理员可用 */
  setTenant: (id: string) => void;
  /** 当前登录账号；null = 未登录（App 渲染登录页） */
  account: AuthAccount | null;
  /** 登录：校验账号密码 → 锁定租户 → 整份载入该租户数据 */
  signIn: (username: string, password: string) => boolean;
  /** 退出登录：清会话，回到登录页 */
  signOut: () => void;
  message: string;
}>({} as any);
