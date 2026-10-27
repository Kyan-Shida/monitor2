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
  /** 超管视角：true = 平台管理（仅租户 / 账号），false = 进入某租户看业务 */
  platformMode: boolean;
  /** 超管回到平台管理视角 */
  backToPlatform: () => void;
  /** 登录：校验账号密码 → 锁定租户 → 整份载入该租户数据；可选指定目标厂区（无权限则回退默认） */
  signIn: (
    username: string,
    password: string,
    preferTenantId?: string,
  ) => boolean;
  /** 退出登录：清会话，回到登录页 */
  signOut: () => void;
  message: string;
  /**
   * 反馈类型：`error` = 被校验拦下来的操作（App 用居中弹窗展示，必须被看见）；
   *            `ok`    = 操作成功 / 上下文切换（轻提示即可，不打断连续操作）
   */
  messageTone: MessageTone;
  /** 关闭居中提示（错误弹窗由用户主动确认，不会自动消失） */
  clearMessage: () => void;
}>({} as any);
/** 反馈类型：见 StoreContext.messageTone */
export type MessageTone = "ok" | "error";
