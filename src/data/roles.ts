/**
 * @file roles.ts
 * @description 2 个角色的权限定义：管理员与非管理员共用同一套页面，由角色决定可见菜单、数据范围、操作按钮与审批权限
 * @interaction 被 App.tsx（菜单过滤 + 角色切换器）、components/Can.tsx（按钮级门控）、components/RoleMatrix.tsx（权限矩阵）消费
 */
import { parentOf } from "./navigation";

/** 数据范围：决定列表可见数据 */
export type Scope = "全区域演示（仅菜单/操作权限，未模拟数据隔离）" | "全租户" | "分管厂区" | "值班班次" | "责任设备" | "本人";

/** 按钮级权限点：页面用 <Can perm={PERMS.xxx}> 包裹，禁止散落 if 判断 */
export const PERMS = {
  告警确认: "alarm.ack",
  一键派单: "alarm.dispatch",
  超时升级: "alarm.escalate",
  工单派单: "wo.assign",
  工单转派: "wo.transfer",
  工单处置: "wo.handle",
  验收通过: "accept.pass",
  验收驳回: "accept.reject",
  批量验收: "accept.batch",
  误报标记: "accept.false",
  AI复核: "ai.review",
  标注反馈: "ai.feedback",
  计划编辑: "task.plan",
  调度下发: "task.dispatch",
  紧急插队: "task.preempt",
  临时任务: "task.quick",
  远程接管: "robot.control",
  紧急停止: "robot.estop",
  一键返航充电: "robot.recharge",
  接管申请: "robot.takeover.apply",
  接管审批: "robot.takeover.approve",
  双人复核: "robot.countersign",
  现场保障: "field.handle",
  现场派单: "field.dispatch",
  配置编辑: "config.edit",
  配置发布: "config.publish",
  组织编辑: "org.edit",
  权限编辑: "perm.edit",
  审计查看: "audit.view",
  报表查看: "report.view",
  导出申请: "report.export",
  导出审批: "report.export.approve",
  口径管理: "metric.manage",
  指标查看: "metric.view",
  驾驶舱查看: "cockpit.view",
  驾驶舱下钻: "cockpit.drill",
  驾驶舱订阅: "cockpit.subscribe",
  大屏模式: "cockpit.screen",
  驾驶舱指挥: "cockpit.cmd",
} as const;

export type Perm = (typeof PERMS)[keyof typeof PERMS];

/** 角色定义：权限跟岗位走 */
export interface Role {
  id: string;
  /** 角色名称 */
  name: string;
  /** 演示用人员姓名（原型阶段代替真实登录） */
  person: string;
  /** 默认落地页（页面 ID） */
  landing: string;
  /** 可见的一级业务中心 */
  centers: string[];
  /** 可见页面 ID 白名单；"*" 表示其可见中心下的全部页面 */
  pages: string[] | "*";
  scope: Scope;
  /** 审批权限 */
  approvals: string[];
  /** 按钮级操作权限 */
  perms: string[];
  /** 管理驾驶舱默认视图 */
  cockpitView: "综合总览" | "运营管理";
}

/** 业务操作权限：两类角色的公共部分 */
const bizPerms: string[] = [
  PERMS.告警确认, PERMS.一键派单, PERMS.超时升级,
  PERMS.工单派单, PERMS.工单转派, PERMS.工单处置,
  PERMS.验收通过, PERMS.验收驳回, PERMS.批量验收, PERMS.误报标记,
  PERMS.AI复核, PERMS.标注反馈,
  PERMS.计划编辑, PERMS.调度下发, PERMS.紧急插队, PERMS.临时任务,
  PERMS.远程接管, PERMS.紧急停止, PERMS.一键返航充电,
  PERMS.接管申请, PERMS.双人复核,
  PERMS.现场保障, PERMS.现场派单,
  PERMS.报表查看, PERMS.导出申请, PERMS.指标查看,
  PERMS.驾驶舱查看, PERMS.驾驶舱下钻, PERMS.驾驶舱订阅, PERMS.大屏模式, PERMS.驾驶舱指挥,
];

/** 管理权限：仅管理员具备 */
const adminPerms: string[] = [
  PERMS.配置编辑, PERMS.配置发布, PERMS.组织编辑, PERMS.权限编辑,
  PERMS.审计查看, PERMS.导出审批, PERMS.口径管理, PERMS.接管审批,
];

/** 2 个角色：不拆页面，只改变视图 / 菜单 / 数据范围 / 按钮 / 审批 */
export const roles: Role[] = [
  {
    id: "admin",
    name: "管理员",
    person: "王姐",
    // 驾驶舱已改为顶栏「驾驶舱大屏」入口，落地页统一为角色工作台
    landing: "workbench",
    centers: ["工作台", "巡检执行", "调度中心", "结果与异常", "资源与地图", "机器人管理", "分析与报表", "系统设置"],
    pages: "*",
    scope: "全租户",
    approvals: ["接管审批", "导出审批", "配置发布", "插单审批", "资质审批"],
    perms: [...bizPerms, ...adminPerms],
    cockpitView: "综合总览",
  },
  {
    id: "user",
    name: "非管理员",
    person: "老周",
    landing: "workbench",
    // 不含「系统设置」：配置、权限、审计、集成属管理动作
    centers: ["工作台", "巡检执行", "调度中心", "结果与异常", "资源与地图", "机器人管理", "分析与报表"],
    pages: "*",
    scope: "全区域演示（仅菜单/操作权限，未模拟数据隔离）",
    approvals: [],
    perms: bizPerms,
    cockpitView: "运营管理",
  },
];

/** 默认角色（原型演示首次进入时的身份） */
export const defaultRoleId = "admin";

/**
 * 按 ID 取角色定义
 * @param id 角色 ID
 * @returns 角色定义；未匹配时返回默认角色
 */
export const roleOf = (id?: string): Role =>
  roles.find((r) => r.id === id) || roles.find((r) => r.id === defaultRoleId)!;

/**
 * 判断页面是否对该角色可见
 * 详情页（如巡检点详情、任务详情）继承其上级页面的可见性
 * @param role 角色
 * @param pageId 页面 ID
 * @param group 页面所属一级中心
 * @returns 可见返回 true
 */
export function canSee(role: Role, pageId: string, group: string) {
  if (!role.centers.includes(group)) return false;
  if (role.pages === "*") return true;
  if (role.pages.includes(pageId)) return true;
  const parent = parentOf(pageId);
  return !!parent && role.pages.includes(parent);
}

/**
 * 判断角色是否具备某操作权限
 * @param role 角色
 * @param perm 权限点，取自 PERMS
 * @returns 有权限返回 true
 */
export const canDo = (role: Role, perm: string) => role.perms.includes(perm);
