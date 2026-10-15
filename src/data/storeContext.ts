import { createContext } from "react";
import type { State } from "./types";
import type { Action } from "./engine";
export const StoreContext = createContext<{
  s: State;
  act: (a: Action, onSuccess?: (s: State) => void) => boolean;
  reset: () => void;
  /** 切换演示角色（原型阶段代替真实登录），影响菜单 / 默认页 / 按钮 / 驾驶舱视图 */
  setRole: (id: string) => void;
  /** 切换演示租户（省事版多租户）：整份换数据，仅超管可用 */
  setTenant: (id: string) => void;
  message: string;
}>({} as any);
