import type {
  State,
  Task,
  Robot,
  Point,
  Plan,
  Template,
  TaskType,
  AtomicAction,
  WorkOrder,
  SlaLevel,
  DeviceAsset,
  InspectItem,
  CandidateOrigin,
  MapAsset,
  BusinessTarget,
  JudgeType,
  InspectSpec,
} from "./types";
import { stages, atomicActionCapability, captureKinds } from "./types";
import {
  rulesOf,
  evaluateRule,
  systemRulesOf,
  type AlarmRule,
} from "./alarmRules";
import { fieldCommand, releaseOutputs } from "./fieldControl";
import { bindingReasons } from "./planSchedule";
import { hasMobility } from "./deviceProfile";
import {
  deviceOf,
  isDeviceStopped,
  isInspected,
  defaultInspectItemName,
  actionsOfPoint,
  captureKindsOfPoint,
  robotCoversPoint,
} from "./deviceMaster";
export interface Action {
  type: string;
  [key: string]: any;
}
const id = (p: string) =>
  p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const must = (ok: unknown, msg: string) => {
  if (!ok) throw Error(msg);
};
/** SLA 分级时限（分钟）：紧急 5 / 高 15 / 普通 60 */
export const SLA_MINUTES: Record<SlaLevel, number> = {
  紧急: 5,
  高: 15,
  普通: 60,
};
/** 预警阈值（分钟）：剩余时间不足该值进入预警态 */
export const SLA_WARN_MINUTES = 5;
/**
 * 模拟机器人读数（原型：真实读数应由机器人 / AI 回传）
 * @description 按**该点位自己的判定规则**生成正常 / 异常读数，使模拟数据与阈值自洽：
 *              正常取量程中点，异常取"严格超上限"；无量纲（期望状态）按期望值 / 反值生成。
 *              规则未配置时给保守值（正常 0.65 / 异常 0.92）并交由复核判定。
 * @param rule 该点位的判定规则
 * @param abnormal 是否要求异常读数
 * @returns 读数字符串
 */
function mockReading(rule: AlarmRule | undefined, abnormal: boolean): string {
  if (!rule) return abnormal ? "0.92" : "0.65";
  if (rule.type === "期望状态")
    return abnormal
      ? rule.expected === "开启"
        ? "关闭"
        : "开启"
      : rule.expected || "开启";
  const min = Number.isFinite(rule.min) ? rule.min : 0;
  const max = Number.isFinite(rule.max) ? rule.max : 1;
  const round = (n: number) => String(Math.round(n * 100) / 100);
  if (!abnormal) return round((min + max) / 2);
  // 异常必须严格超出上限：上限 + 至少 1 个单位（或上限的 15%）
  return round(max + Math.max(1, Math.abs(max) * 0.15));
}
/**
 * 告警级别 → SLA 级别
 * @param level 告警级别（重要 / 紧急 / 一般）
 * @returns 对应 SLA 级别
 */
const slaLevelOf = (level: string): SlaLevel =>
  level === "紧急" ? "紧急" : level === "重要" ? "高" : "普通";
function continueQueue(s: State, r: Robot) {
  const next = s.tasks.find((t) => t.robotId === r.id && t.state === "待执行");
  if (!next || constraints(s, next, r, true).length) return;
  next.state = "执行中";
  next.startedAt ||= new Date().toISOString();
  r.current = next.id;
  r.state = "执行中";
}
/**
 * 地图定版发布（单级）
 * @description 平台不区分"试验版 / 正式版"，发布即把当前内容定版为「已发布」；
 *              原始资料（点云 / 视频）与至少一个业务点位是硬前提
 * @param s 状态
 * @param m 目标地图
 */
function publishMap(s: State, m: MapAsset) {
  must(m.cloud && m.video, "缺少原始点云或视频，禁止发布");
  must(
    s.points.some((p) => p.mapId === m.id && p.state !== "停用"),
    "至少需要一个已标注业务点位",
  );
  m.state = "已发布";
  m.history.unshift(`m${m.version} / p${m.pointSet} 已发布`);
}
/**
 * 下发前确保已定版：内容还是草稿时，**随下发自动定版**
 * @description 这是"不存在试验版 / 正式版"的落地方式——用户只需「下发」一个动作
 * @param s 状态
 * @param m 目标地图
 * @returns 本次是否顺带完成了定版（用于文案提示）
 */
function ensurePublished(s: State, m: MapAsset): boolean {
  if (m.state === "已发布") return false;
  publishMap(s, m);
  return true;
}
/**
 * 业务巡检目标的「是否巡检」写穿到设备清单的巡检项
 * @description 过渡期约定：设备清单的 `InspectItem.inspect` 仍是任务生成的实际依据，
 *              同一仪表下**只要有一个业务目标开着**，该巡检项即为开——避免两处口径不一致
 * @param s 状态
 * @param instrumentId 仪表 id（与设备巡检项 id 同源）
 */
function syncInspectFlag(s: State, instrumentId: string) {
  const list = (s.businessTargets || []).filter(
    (b) => b.instrumentId === instrumentId,
  );
  if (!list.length) return;
  const item = s.devices
    ?.flatMap((d) => d.items)
    .find((it) => it.id === instrumentId);
  if (item) item.inspect = list.some((b) => b.inspect);
}
/**
 * 地图下发的逐台校验与登记（单台 SYNC 与批量 SYNC_BATCH 共用同一口径）
 * @description 只登记"传输中"记录；版本一致以机器人激活回执为准，不在此处改动机器人版本
 * @param s 状态
 * @param m 目标地图
 * @param r 目标机器人
 */
function pushSync(s: State, m: MapAsset, r: Robot) {
  must(r.region === m.region, "机器人服务区域与地图不匹配");
  must(
    !s.sessions.some(
      (x) => x.robotId === r.id && !["已释放", "已超时"].includes(x.state),
    ),
    "人工控制会话占用",
  );
  s.syncs.unshift({
    id: id("SYNC"),
    mapId: m.id,
    robotId: r.id,
    mapVersion: m.version,
    pointSet: m.pointSet,
    state: "传输中",
  });
}
export function constraints(
  s: State,
  t: Task,
  r: Robot,
  start = false,
  now = Date.now(),
): string[] {
  const m = s.maps.find((m) => m.id === t.mapId);
  return [
    ...(r.region !== m?.region ? ["区域不匹配"] : []),
    // 检测能力按"采集方式"判定（J′）：业务类型（仪表 / 阀门）不参与调度校验
    ...(t.items.some((p) => !robotCoversPoint(s, p, r)) ? ["检测能力不足"] : []),
    ...((t.atomicActions || []).some(
      (action) => !r.capabilities.includes(atomicActionCapability[action]),
    )
      ? ["原子动作能力不足"]
      : []),
    // 移动能力按机型校验：爬楼点位不可派给四轮车或挂轨
    ...(hasMobility(r.mobility, t.requiredMobility)
      ? []
      : ["移动能力不足（机型不匹配）"]),
    // 电量阈值按机型差异配置（机器狗 40% / 四轮车 25% / 挂轨 15%）
    ...(r.battery < r.constraints.minBattery
      ? [`电量低于 ${r.constraints.minBattery}%`]
      : []),
    // 挂轨专用：所在轨道区段被其他机器占用时不可派单
    ...(r.deviceType === "挂轨" &&
    r.constraints.railSectionId &&
    s.railSections.some(
      (x) =>
        x.id === r.constraints.railSectionId &&
        !!x.robotId &&
        x.robotId !== r.id,
    )
      ? ["轨道区段被占用"]
      : []),
    ...(["离线", "充电", "返航中", "故障", "维护"].includes(r.state)
      ? [r.state]
      : []),
    ...(s.sessions.some(
      (x) => x.robotId === r.id && !["已释放", "已超时"].includes(x.state),
    )
      ? ["人工控制会话占用"]
      : []),
    // 设备停用拦截：口径来自设备主数据。
    // （旧实现读 extras.category === "equipment"，但种子里从无该类数据，该校验一直空转）
    ...(t.items.some((p) => isDeviceStopped(s, p)) ? ["所属设备已停用"] : []),
    ...(t.items.some(
      (p) => s.points.find((q) => q.id === p.id)?.state !== "已启用",
    )
      ? ["点位未启用或需重新验证"]
      : []),
    ...(r.mapId !== t.mapId ||
    r.mapVersion !== t.mapVersion ||
    r.pointSet !== t.pointSet
      ? ["地图/点位版本待同步"]
      : []),
    ...(start && t.notBefore && Date.parse(t.notBefore) > now
      ? ["尚未到计划执行时间"]
      : []),
    ...(start && r.current && r.current !== t.id ? ["当前任务尚未结束"] : []),
  ];
}
export function transition(state: State, a: Action): State {
  const s = structuredClone(state);
  let object = a.id || a.robotId || a.mapId || "平台";
  let detail = a.reason || a.name || "";
  const map = () => {
    const m = s.maps.find((m) => m.id === (a.mapId || a.id));
    must(m, "地图不存在");
    return m!;
  };
  const task = () => {
    const t = s.tasks.find((t) => t.id === a.id);
    must(t, "任务不存在");
    return t!;
  };
  const robot = (rid?: string) => {
    const r = s.robots.find((r) => r.id === (rid || a.robotId || a.id));
    must(r, "机器人不存在");
    return r!;
  };
  function createTask(
    name: string,
    pids: string[],
    source: string,
    priority: Task["priority"] = "普通",
    alarmId?: string,
    plan?: Plan,
    taskType: TaskType = "综合巡检任务",
    atomicActions?: AtomicAction[],
  ) {
    let items = pids
      .map((pid) => s.points.find((p) => p.id === pid))
      .filter(Boolean) as Point[];
    must(
      items.length && items.every((p) => p.state === "已启用"),
      "请选择已启用且自主验证通过的点位",
    );
    must(!items.some((p) => isDeviceStopped(s, p)), "任务包含已停用设备");
    // 「是否巡检」过滤：设备主数据里关闭的检测项不进任务指令集（阶段③ 开关的落地处）
    items = items.filter((p) => isInspected(s, p));
    must(
      items.length,
      "所选点位的检测项均已在设备主数据中关闭「是否巡检」",
    );
    must(
      new Set(items.map((p) => p.mapId)).size === 1,
      "一期任务使用同一地图版本",
    );
    const m = s.maps.find((m) => m.id === items[0].mapId)!;
    must(m.state === "已发布", "正式任务需要已发布地图");
    // 任务指令集：由点位的「采集方式」（设备主数据里的巡检项 kind）推导原子动作，
    // 而不是由业务类型（仪表 / 阀门）推导；旧数据无主数据时回落 Point.kind。
    // 「怎么看」（PTZ / 补光 / 停留 / 避障）随点位快照一并带给执行端，与动作正交。
    const derivedActions = [
      ...new Set(items.flatMap((p) => actionsOfPoint(s, p))),
    ];
    // 完成时限按优先级派发（分钟）：紧急 30 / 高 120 / 普通 240
    const limitMinutes =
      priority === "紧急" ? 30 : priority === "高" ? 120 : 240;
    const due = new Date(Date.now() + limitMinutes * 60000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const t: Task = {
      id: id("T"),
      name,
      source,
      priority,
      taskType,
      atomicActions: atomicActions?.length ? atomicActions : derivedActions,
      alarmId,
      planId: plan?.id,
      planVersion: plan?.version,
      state: "待调度",
      deadline: `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())} ${pad(due.getHours())}:${pad(due.getMinutes())}`,
      mapId: m.id,
      mapVersion: m.version,
      pointSet: m.pointSet,
      items: items.map((p) => ({
        ...p,
        mapVersion: m.version,
        pointSet: m.pointSet,
        // 到位动作快照：任务创建后即使设备主数据的采集方式被改，历史任务口径不变
        actions: actionsOfPoint(s, p),
      })),
      stage: 0,
      index: 0,
      done: [],
      skipped: [],
      retries: 0,
      duration: items.length * 8,
      created: new Date().toLocaleString("zh-CN"),
    };
    s.tasks.unshift(t);
    object = t.id;
    return t;
  }
  switch (a.type) {
    case "SAVE_SYSTEM_RULES": {
      must(s.roleId === "admin", "仅管理员可修改告警参数");
      const x = a.rules;
      must(
        [x.heartbeatSeconds, x.dispatchSeconds, x.lowBattery].every(
          (v) => Number.isFinite(v) && v > 0,
        ) && x.lowBattery <= 100,
        "请填写有效的秒数和电量百分比",
      );
      s.systemRules = { ...x, version: systemRulesOf(s).version + 1 };
      detail = "系统告警参数已更新";
      break;
    }
    case "SAVE_ALARM_RULE": {
      must(s.roleId === "admin", "仅管理员可修改告警配置");
      const rule = a.rule;
      must(
        rule.name?.trim() && s.points.some((p) => p.id === rule.pointId),
        "请填写规则名称与有效检测项",
      );
      must(
        rule.type === "期望状态"
          ? rule.expected?.trim()
          : Number.isFinite(rule.min) &&
              Number.isFinite(rule.max) &&
              rule.min <= rule.max,
        "请检查上下限或期望状态",
      );
      s.alarmRules = rulesOf(s);
      const old = s.alarmRules.find((r) => r.id === rule.id);
      const next = { ...rule, version: (old?.version || 0) + 1 };
      s.alarmRules = s.alarmRules.filter((r) => r.id !== rule.id).concat(next);
      object = rule.id;
      detail = "告警参数新版本已生效，历史结果保持原规则";
      break;
    }
    case "FIELD_COMMAND": {
      fieldCommand(s, robot(), a.command, a.value, a.fail);
      detail = `现场控制 ${a.command} · ${s.fieldDevices![robot().id].status}`;
      break;
    }
    case "IMPORT": {
      must(a.name && a.file, "请填写地图名称并选择地图图片");
      const targets = (a.targets || []).map((t: any) => ({
        id: String(t.id),
        externalId: String(t.id),
        source: "地图导入" as const,
        kind: t.kind || "可见光",
        x: Number(t.x),
        y: Number(t.y),
        state: "待确认" as const,
      }));
      const m = {
        id: id("MAP"),
        name: a.name,
        region: a.region || "一期罐区",
        version: 1,
        pointSet: 1,
        state: "草稿" as const,
        source: a.source || "手持仪器",
        batch: id("B"),
        cloud: a.cloud || "",
        video: a.video || "",
        file: a.file,
        checksum: "demo-sha256:93b8…",
        // 底图：上传的图片（示例地图 / 用户本地图片）
        image: a.image || undefined,
        // 地图点位：随文件带入的定位ID（可直接绑定巡检点）
        targets,
        history: ["m1 / p1 导入草稿，待绑定巡检点"],
      };
      s.maps.unshift(m);
      // 轨迹采样点：随文件带入（在地图工作台按顺序连线）
      if (a.track?.length)
        s.trackSamples = [
          ...(s.trackSamples || []),
          ...a.track.map((t: any, i: number) => ({
            id: id("TS"),
            mapId: m.id,
            x: Number(t.x),
            y: Number(t.y),
            kind: t.kind || "停靠点",
            seq: i + 1,
          })),
        ];
      object = m.id;
      detail = `已导入地图（定位ID ${targets.length} 个 · 轨迹 ${(a.track || []).length} 点）`;
      break;
    }
    case "ARCHIVE": {
      const m = map();
      must(a.cloud && a.video, "点云与原始视频必须同时登记");
      m.cloud = a.cloud;
      m.video = a.video;
      break;
    }
    // ── 「地图 → 巡检任务」链路 · 阶段①② 地图与坐标（只增不改） ──
    case "SET_MAP_IMAGE": {
      const m = map();
      // 清除时写空串而非 undefined：与"从未有过底图"区分，避免被老缓存补图逻辑回填
      m.image = a.image || "";
      detail = a.image ? "底图已上传（可在图上标注点位）" : "底图已清除";
      break;
    }
    case "CALIBRATE_FRAMES": {
      const m = map();
      m.frames = { ...(m.frames || {}), ...(a.frames || {}) };
      // 有分辨率与原点即视为已标定，仅其一为部分标定
      m.frames.calibState =
        m.frames.resolution && m.frames.origin
          ? "已标定"
          : m.frames.resolution || m.frames.origin
            ? "部分标定"
            : "未标定";
      detail = `坐标标定已保存（${m.frames.calibState}）`;
      break;
    }
    case "SET_MAP_LAYERS": {
      const m = map();
      m.layers = { ...(m.layers || {}), ...(a.layers || {}) };
      detail = "地图图层已更新";
      break;
    }
    // ── 阶段③ 设备主数据：导入 → 审核 → 启停 / 是否巡检 ──
    case "IMPORT_DEVICES": {
      const rows = (a.devices || []) as Partial<DeviceAsset>[];
      must(rows.length, "请提供要导入的设备清单");
      must(rows.length <= 200, "单次最多导入 200 台设备，请拆分批次");
      const batch = a.batch || "IMP-" + Date.now().toString(36).toUpperCase();
      const incoming = new Map<string, Partial<DeviceAsset>>();
      rows.forEach((r) => {
        const code = String(r.id || "").trim();
        must(code, "设备编码不能为空（编码是设备身份的唯一依据）");
        must(
          /^[A-Za-z0-9_-]{2,32}$/.test(code),
          `设备编码「${code}」格式不合法（仅字母 / 数字 / 下划线 / 中划线）`,
        );
        must(!incoming.has(code), `设备编码「${code}」在本批次内重复`);
        must(String(r.name || "").trim(), `设备「${code}」缺少设备名称`);
        (r.items || []).forEach((it: InspectItem) => {
          must(
            it.id && it.target,
            `设备「${code}」存在缺少编码或检测目标的巡检项`,
          );
          must(
            captureKinds.includes(it.kind),
            `设备「${code}」检测目标「${it.target}」的采集方式不合法（应为 ${captureKinds.join(" / ")}）`,
          );
          // 单位校验：需要读数的检测目标必须给出单位，否则阈值无法判定
          const numeric = /读数|浓度|温度|液位|压力|电流|电压|振动|流量/.test(
            it.target,
          );
          must(
            !numeric || String(it.unit || "").trim(),
            `检测目标「${it.target}」缺少单位（数值类检测必须带单位）`,
          );
        });
        incoming.set(code, r);
      });
      const devs = (s.devices ??= []);
      // 批量导入（默认）→ 待审核；标注页「＋快速新建」传 approved → 直接生效（来源=人工新增）
      const autoApprove = a.approved === true;
      let added = 0;
      let updated = 0;
      incoming.forEach((r, code) => {
        const cur = devs.find((d) => d.id === code);
        const rec: DeviceAsset = {
          id: code,
          name: String(r.name),
          type: r.type || "未分类",
          regionCode: r.regionCode || "",
          locationDesc: r.locationDesc || "",
          coord: r.coord,
          coordSys: r.coordSys,
          height: r.height,
          parts: r.parts,
          items: (r.items || []) as InspectItem[],
          photo: cur?.photo,
          remark: r.remark,
          // 批量导入即进「待审核」：清单不直接生效，避免编码/单位错误污染任务口径
          reviewState: autoApprove ? "已通过" : "待审核",
          state: cur?.state === "停用" ? "停用" : "在用",
          importBatch: autoApprove ? "人工新增" : batch,
          importedAt: new Date().toLocaleString("zh-CN"),
        };
        if (cur) {
          devs[devs.indexOf(cur)] = rec;
          updated++;
        } else {
          devs.push(rec);
          added++;
        }
      });
      object = autoApprove ? incoming.keys().next().value || "人工新增" : batch;
      detail = autoApprove
        ? `设备已新建并直接生效（人工新增 ${added} 台，不经批量审核）`
        : `设备清单已导入（新增 ${added} 台 / 更新 ${updated} 台，均进入待审核）`;
      break;
    }
    case "REVIEW_DEVICE_IMPORT": {
      const ids: string[] = a.ids?.length ? a.ids : a.id ? [a.id] : [];
      must(ids.length, "请选择要审核的设备");
      const devs = (s.devices ??= []);
      const hit = devs.filter((d) => ids.includes(d.id));
      must(hit.length === ids.length, "存在未找到的设备编码");
      hit.forEach((d) =>
        must(d.reviewState === "待审核", `设备「${d.name}」不处于待审核状态`),
      );
      if (a.pass === false) {
        hit.forEach((d) => {
          d.reviewState = "已驳回";
          d.reviewNote = a.note || "资料不完整，请补充后重新导入";
        });
      } else {
        hit.forEach((d) => {
          d.reviewState = "已通过";
          d.reviewNote = undefined;
          // 审核通过即为"生效"：设备可直接在标注页选用
          if (a.inspect !== undefined)
            d.items.forEach((it) => (it.inspect = !!a.inspect));
        });
        // 设备清单版本：与地图 / 点位版本并列，供机器人同步比对（阶段⑧）
        s.maps.forEach(
          (m) => (m.deviceListVersion = (m.deviceListVersion || 1) + 1),
        );
      }
      object = ids.length === 1 ? ids[0] : "批量审核";
      detail =
        a.pass === false
          ? `已驳回 ${hit.length} 台设备（${hit.map((d) => d.id).join("、")}）`
          : `已通过 ${hit.length} 台设备，设备清单版本已更新`;
      break;
    }
    case "SET_INSPECT_FLAG": {
      const d = deviceOf(s, a.deviceId);
      must(d, "设备不存在");
      must(
        d!.reviewState === "已通过",
        `设备「${d!.name}」尚未通过审核，不能配置「是否巡检」`,
      );
      const it = d!.items.find((x) => x.id === a.itemId);
      must(it, "巡检项不存在");
      it!.inspect = a.inspect !== false;
      // 同一仪表的业务巡检目标一起跟随（两处开关必须同口径）
      (s.businessTargets || [])
        .filter((b) => b.instrumentId === it!.id)
        .forEach((b) => (b.inspect = it!.inspect));
      object = d!.id;
      detail = `${d!.name} · ${it!.target}「是否巡检」已${it!.inspect ? "开启" : "关闭"}`;
      break;
    }
    case "SET_DEVICE_STATE": {
      const d = deviceOf(s, a.deviceId);
      must(d, "设备不存在");
      const next: "在用" | "停用" = a.state === "停用" ? "停用" : "在用";
      if (next === "停用") {
        const pts = s.points.filter((p) => p.device === d!.name);
        must(
          a.confirmed === true,
          `停用「${d!.name}」将拦截其 ${pts.length} 个点位的任务下发，请二次确认`,
        );
        // 只拦截后续新建 / 派单；已在执行或已排队的任务不自动回收，交调度页人工处置
      }
      d!.state = next;
      object = d!.id;
      detail =
        next === "停用"
          ? "设备已停用（含该设备点位的任务将被拦截）"
          : "设备已恢复启用";
      break;
    }
    // ── 业务巡检目标：仪表 + 巡检要求 + 算法 + 阈值 + 判断标准 ──
    case "ADD_BUSINESS_TARGET": {
      const ins = s.instruments?.find((x) => x.id === a.instrumentId);
      must(ins, "仪表不存在，请先在设备主数据中维护检测目标");
      must(
        ins!.state !== "停用",
        `仪表「${ins!.name}」所属设备已停用，暂不能新增业务巡检目标`,
      );
      const req = s.requirements?.find((r) => r.id === a.requirementId);
      must(req, "巡检要求不存在");
      must(
        String(a.algorithm || "").trim(),
        `请为「${req!.name}」指定算法（AI 表达方式）`,
      );
      const judge: JudgeType = a.judge || req!.judge;
      if (judge === "数值范围")
        must(
          Number.isFinite(a.min) && Number.isFinite(a.max) && a.min <= a.max,
          "数值范围判定需要有效上下限（下限不大于上限）",
        );
      if (judge === "期望状态")
        must(String(a.expected || "").trim(), "期望状态判定需要填写期望值");
      const rec: BusinessTarget = {
        id: id("BT"),
        instrumentId: ins!.id,
        requirementId: req!.id,
        // 业务目标与业务要求：留空时按"仪表 + 判定方式"和巡检要求说明自动生成
        goal:
          String(a.goal || "").trim() ||
          `确认${ins!.name}${judge === "期望状态" ? "状态符合要求" : "读数在正常范围内"}`,
        require: String(a.require || "").trim() || req!.description,
        algorithm: String(a.algorithm).trim(),
        judge,
        unit: judge === "数值范围" ? a.unit || ins!.unit : undefined,
        min: judge === "数值范围" ? Number(a.min) : undefined,
        max: judge === "数值范围" ? Number(a.max) : undefined,
        expected: judge === "期望状态" ? String(a.expected).trim() : undefined,
        criteria: a.criteria || req!.description,
        // 告警设置：新建默认开启（重要级）；**调整入口只有「业务巡检目标」**
        alarm: a.alarm || {
          on: true,
          level: "重要",
          trigger: "单次超限即告警（一期不支持连续多次）",
          notify: ["设备岗"],
        },
        needPhoto: !!a.needPhoto,
        needVideo: !!a.needVideo,
        needReview: !!a.needReview,
        cycle: a.cycle || req!.cycle || "每日",
        priority: a.priority || "普通",
        inspect: a.inspect !== false,
        createdAt: new Date().toLocaleString("zh-CN"),
      };
      s.businessTargets = [rec, ...(s.businessTargets || [])];
      syncInspectFlag(s, ins!.id);
      object = rec.id;
      detail = `已为「${s.devices?.find((d) => d.id === ins!.deviceId)?.name || ins!.deviceId} · ${ins!.name}」新增业务巡检目标：${req!.name}（${rec.algorithm}）`;
      break;
    }
    case "UPDATE_BUSINESS_TARGET": {
      const b = s.businessTargets?.find((x) => x.id === a.id);
      must(b, "业务巡检目标不存在");
      if (a.algorithm !== undefined) {
        must(String(a.algorithm).trim(), "算法不能为空");
        b!.algorithm = String(a.algorithm).trim();
      }
      if (a.judge !== undefined) b!.judge = a.judge;
      if (a.unit !== undefined) b!.unit = a.unit;
      if (a.min !== undefined) b!.min = Number(a.min);
      if (a.max !== undefined) b!.max = Number(a.max);
      if (b!.judge === "数值范围")
        must(
          Number.isFinite(b!.min) &&
            Number.isFinite(b!.max) &&
            (b!.min as number) <= (b!.max as number),
          "数值范围判定需要有效上下限（下限不大于上限）",
        );
      if (a.expected !== undefined) b!.expected = a.expected;
      if (a.criteria !== undefined) b!.criteria = a.criteria;
      if (a.goal !== undefined) b!.goal = a.goal;
      if (a.require !== undefined) b!.require = a.require;
      // 告警设置：按字段合并更新（平台唯一的告警配置入口）
      if (a.alarm !== undefined)
        b!.alarm = {
          ...(b!.alarm || { on: true, level: "重要" as const }),
          ...a.alarm,
        };
      if (a.needPhoto !== undefined) b!.needPhoto = !!a.needPhoto;
      if (a.needVideo !== undefined) b!.needVideo = !!a.needVideo;
      if (a.needReview !== undefined) b!.needReview = !!a.needReview;
      if (a.cycle !== undefined) b!.cycle = a.cycle;
      if (a.priority !== undefined) b!.priority = a.priority;
      if (a.inspect !== undefined) b!.inspect = !!a.inspect;
      syncInspectFlag(s, b!.instrumentId);
      object = b!.id;
      detail = `业务巡检目标已更新（是否巡检：${b!.inspect ? "开" : "关"}）`;
      break;
    }
    // ── 巡检点管理：巡检点 = 名称 + 地图 + 地图点位 + 多个巡检项 ──
    case "SAVE_POINT": {
      const m = map();
      must(String(a.name || "").trim(), "请填写巡检点名称");
      const target = m.targets.find((t) => t.id === a.targetId);
      must(target, "请选择地图上带定位ID的点");
      must(
        target!.externalId,
        "所选点不是地图自带的定位ID点；请先在地图工作台补录定位ID",
      );
      const specs = (a.inspectItems || []) as InspectSpec[];
      must(specs.length, "请至少添加一个巡检项（名称 + 业务目标 + 机器操作内容）");
      const btOf = (sid: string) => s.businessTargets?.find((b) => b.id === sid);
      const insOf = (sid: string) => {
        const bt = btOf(sid);
        must(bt, "巡检项的业务目标不存在，请先维护业务巡检目标");
        const ins = s.instruments?.find((x) => x.id === bt!.instrumentId);
        must(ins, "业务目标关联的仪表不存在");
        return ins!;
      };
      specs.forEach((sp, i) => {
        must(String(sp.name || "").trim(), `第 ${i + 1} 个巡检项缺少名称`);
        const ins = insOf(sp.targetId);
        must(ins.state !== "停用", `巡检项「${sp.name}」的仪表所属设备已停用`);
        must(
          (sp.actions || []).length,
          `巡检项「${sp.name}」请至少选择一个原子动作`,
        );
        must(sp.pose, `巡检项「${sp.name}」缺少机器操作参数（云台 / 视角）`);
      });
      const firstIns = insOf(specs[0].targetId);
      const firstDev = s.devices?.find((d) => d.id === firstIns.deviceId);
      must(firstDev, "仪表所属设备不存在");
      const old = s.points.find((p) => p.id === a.pointId);
      // 一对一校验：一个定位ID点只能绑一个巡检点
      if (target!.pointId && target!.pointId !== old?.id) {
        const owner = s.points.find((p) => p.id === target!.pointId);
        throw Error(
          `该地图点位已被巡检点「${owner?.name || target!.pointId}」占用，请另选定位ID点`,
        );
      }
      // 改绑地图点位时释放旧点位占用，避免一个定位ID挂两个巡检点
      if (old && old.targetId !== target!.id) {
        const prev = m.targets.find((t) => t.id === old.targetId);
        if (prev && prev.pointId === old.id) {
          prev.pointId = undefined;
          prev.state = "待确认";
        }
      }
      const pid = old?.id || id("P");
      // 巡检项 → 逻辑点（内部对象、不暴露给用户）；重复保存保持幂等
      const kept = (s.logicalPoints || []).filter(
        (x) => x.physicalPointId !== pid,
      );
      const created = specs.map((sp) => {
        const ins = insOf(sp.targetId);
        return {
          id: id("LP"),
          deviceId: ins.deviceId,
          itemIds: [ins.id],
          region: m.region,
          locateState: "已落位" as const,
          physicalPointId: pid,
          locateOrigin: "人工新增" as const,
        };
      });
      s.logicalPoints = [...kept, ...created];
      const normalized: InspectSpec[] = specs.map((sp) => ({
        ...sp,
        id: sp.id || id("IP"),
        actions: [...new Set(sp.actions)],
      }));
      const p: Point = {
        id: pid,
        name: String(a.name).trim(),
        targetId: target!.id,
        mapId: m.id,
        version: (old?.version || 0) + 1,
        // 以下 5 个字段是"首个巡检项"的派生视图，仅为兼容旧页面与旧链接
        device: firstDev!.name,
        object: firstIns.name,
        item: normalized[0].name,
        unit: firstIns.unit || "",
        kind: firstIns.capture,
        requirement:
          btOf(normalized[0].targetId)?.criteria || normalized[0].name,
        state: old ? "待重新验证" : "待验证",
        x: target!.x,
        y: target!.y,
        pose: old?.pose || { x: target!.x, y: target!.y, yaw: 0 },
        actionPlan: normalized[0].pose,
        inspectItems: normalized,
        logicalIds: created.map((x) => x.id),
        taught: a.taught ?? old?.taught,
      };
      if (old) s.points = s.points.map((q) => (q.id === old.id ? p : q));
      else s.points.push(p);
      target!.state = "已确认";
      target!.pointId = p.id;
      m.pointSet++;
      m.state = "草稿";
      object = p.id;
      detail = `已保存巡检点（${normalized.length} 个巡检项 · 覆盖 ${new Set(created.map((c) => c.deviceId)).size} 台设备）`;
      break;
    }
    case "SURVEY_CAPTURE": {
      const m = map();
      must(a.pointType, "请选择踩点点位类型");
      const rec = {
        id: id("SS"),
        mapId: m.id,
        offline: !!a.offline,
        synced: !a.offline,
        pointType: a.pointType,
        deviceCode: a.deviceCode,
        target: a.target,
        viewDir: a.viewDir,
        ptzPreset: a.ptzPreset,
        photo: a.photo,
        remark: a.remark,
        x: Number.isFinite(a.x) ? a.x : 50,
        y: Number.isFinite(a.y) ? a.y : 50,
      };
      s.siteSurveys = [rec, ...(s.siteSurveys || [])];
      object = rec.id;
      detail = `现场踩点已记录（${a.pointType}${a.offline ? " · 离线待同步" : ""}）`;
      break;
    }
    case "SURVEY_SYNC": {
      const pending = (s.siteSurveys || []).filter((x) => x.offline && !x.synced);
      must(pending.length, "没有待同步的离线踩点记录");
      pending.forEach((x) => (x.synced = true));
      detail = `已同步 ${pending.length} 条离线踩点记录`;
      break;
    }
    case "TRACK_RECORD": {
      const m = map();
      const samples = s.trackSamples || [];
      const seq = samples.filter((x) => x.mapId === m.id).length + 1;
      const sample = {
        id: id("TS"),
        mapId: m.id,
        x: Number.isFinite(a.x) ? a.x : 50,
        y: Number.isFinite(a.y) ? a.y : 50,
        kind: a.kind || "停靠点",
        seq,
      };
      s.trackSamples = [...samples, sample];
      // 轨迹变化同样属于地图内容变更
      m.state = "草稿";
      object = sample.id;
      detail = `轨迹已记录（${sample.kind} · 第 ${seq} 点）`;
      break;
    }
    case "ANNOTATE": {
      const m = map();
      must(
        a.name && a.device && a.requirement,
        "请完整填写点位名称、所属设备与采集要求",
      );
      // v3：设备与检测对象只能来自设备主数据（标注页可「＋快速新建」即时落库），不再手工输入设备名
      const dev = deviceOf(s, a.device);
      must(dev, "所选设备不在设备主数据中，请选择设备或先快速新建");
      must(
        dev!.reviewState === "已通过",
        `设备「${dev!.name}」尚未通过审核，暂不能标注点位`,
      );
      must(dev!.state !== "停用", `设备「${dev!.name}」已停用，不能标注点位`);
      // 「看什么」多选：一次停靠可覆盖多个检测对象（一个停靠位覆盖多设备/多目标的落地处）
      const objects: string[] = (
        a.objects?.length ? a.objects : [a.object]
      ).filter((x: string) => dev!.items.some((it) => it.target === x));
      must(
        objects.length,
        `请至少选择一个检测对象（来自设备「${dev!.name}」的清单）`,
      );
      const old = s.points.find((p) => p.id === a.pointId);
      const target = m.targets.find((t) => t.id === a.targetId);
      must(target, "请选择候选目标或人工新增目标");
      const pid = old?.id || id("P");
      // 逻辑点（阶段④）：不暴露给用户，按「一次停靠覆盖 N 个检测对象」自动派生；
      // 重建前先清掉本点位旧记录，保证重复标注幂等
      const kept = (s.logicalPoints || []).filter(
        (x) => x.physicalPointId !== pid,
      );
      const created = objects.map((obj) => ({
        id: id("LP"),
        deviceId: dev!.id,
        itemIds: [dev!.items.find((it) => it.target === obj)!.id],
        region: m.region,
        locateState: "已落位" as const,
        physicalPointId: pid,
        locateOrigin: (a.origin || "人工新增") as CandidateOrigin,
      }));
      s.logicalPoints = [...kept, ...created];
      const primary = dev!.items.find((it) => it.target === objects[0])!;
      const p: Point = {
        id: pid,
        name: a.name,
        device: dev!.name,
        object: objects[0],
        item: a.item || defaultInspectItemName(objects[0]),
        unit: a.unit ?? primary.unit,
        kind: target!.kind,
        requirement: a.requirement,
        mapId: m.id,
        targetId: target!.id,
        x: target!.x,
        y: target!.y,
        version: (old?.version || 0) + 1,
        state: old ? "待重新验证" : "待验证",
        // 「怎么看」与标注同一入口保存（不再另开"动作编排"页面）
        actionPlan: a.actionPlan || old?.actionPlan,
        pose: a.pose || old?.pose || { x: target!.x, y: target!.y, yaw: 0 },
        taught: a.taught ?? old?.taught,
        logicalIds: created.map((x) => x.id),
      };
      if (old) s.points = s.points.map((q) => (q.id === old.id ? p : q));
      else s.points.push(p);
      target!.state = "已确认";
      target!.pointId = p.id;
      m.pointSet++;
      m.state = "草稿";
      object = p.id;
      detail = `已标注点位（一次停靠覆盖 ${created.length} 个检测对象）`;
      break;
    }
    case "ADD_TARGET": {
      const m = map();
      // 平台新增的地图点位：来源标记为"平台新增"，与随地图导入的定位ID区分开
      m.targets.push({
        id: id("O"),
        source: "平台新增",
        externalId: a.externalId,
        kind: a.kind || "仪表",
        x: a.x || 50,
        y: a.y || 48,
        state: "待确认",
      });
      // 地图内容变了就打回草稿：否则"已发布"名不副实，下发给机器人的点位集与现实不符
      m.state = "草稿";
      m.history.unshift("新增地图点位，待重新发布");
      break;
    }
    case "UPLOAD_REFERENCE": {
      const m = map();
      const target = m.targets.find(t => t.id === a.targetId);
      must(target && target.state !== "已剔除", "请先选择有效目标");
      must(typeof a.dataUrl === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(a.dataUrl), "请选择 PNG、JPG 或 WebP 图片");
      must(a.dataUrl.length <= 700000, "图片过大，请选择 500 KB 以内的图片");
      const used = s.maps.flatMap(m => m.targets).filter(t => t !== target).reduce((total,t) => total + (t.referenceImage?.dataUrl.length || 0), 0);
      must(used + a.dataUrl.length <= 2000000, "演示环境图片存储空间不足，请压缩图片后再上传");
      target!.referenceImage = { name: a.name, dataUrl: a.dataUrl, uploadedAt: new Date().toISOString() };
      object = target!.id;
      detail = `人工上传参考图像：${a.name}`;
      break;
    }
    case "DISCARD_TARGET": {
      const m = map();
      const t = m.targets.find((t) => t.id === a.targetId)!;
      must(!t.pointId, "已关联业务点位的目标请先维护点位");
      t.state = "已剔除";
      // 点位集变化同样打回草稿
      m.state = "草稿";
      m.history.unshift("剔除地图点位，待重新发布");
      break;
    }
    case "PUBLISH": {
      const m = map();
      // 单级发布：平台不区分"试验版 / 正式版"，定版即当前内容
      publishMap(s, m);
      object = m.id;
      detail = "当前地图内容已定版发布";
      break;
    }
    case "SYNC": {
      const m = map();
      const published = ensurePublished(s, m);
      pushSync(s, m, robot());
      detail = `已下发 m${m.version} / p${m.pointSet}${published ? "（内容同时定版为已发布）" : ""}`;
      break;
    }
    case "SYNC_BATCH": {
      const m = map();
      const ids: string[] = a.robotIds || [];
      must(ids.length, "请至少选择一台设备");
      // 先逐台校验再统一定版：避免"定版成功但下发被拒"的半截状态
      const targets = ids.map((rid) => {
        const r = s.robots.find((x) => x.id === rid);
        must(r, `设备 ${rid} 不存在`);
        must(r.region === m.region, "机器人服务区域与地图不匹配");
        return r!;
      });
      const published = ensurePublished(s, m);
      targets.forEach((r) => pushSync(s, m, r));
      object = m.id;
      detail = `已向 ${targets.length} 台设备下发 m${m.version} / p${m.pointSet}${published ? "（内容同时定版为已发布）" : ""}`;
      break;
    }
    case "SYNC_STEP": {
      const sy = s.syncs.find((x) => x.id === a.id)!;
      const r = robot(sy.robotId);
      must(
        s.syncs.find((x) => x.robotId === r.id)?.id === sy.id,
        "旧同步回执已失效",
      );
      if (a.fail) {
        sy.state = "失败";
        sy.reason = "模拟网络中断，机器人保留原激活版本";
        break;
      }
      if (sy.state === "失败") {
        sy.state = "传输中";
        sy.reason = "";
        break;
      }
      if (sy.state === "传输中") sy.state = "校验中";
      else if (sy.state === "校验中") sy.state = "待激活";
      else if (sy.state === "待激活") {
        must(
          !r.current && r.state === "空闲",
          "机器人任务或维护窗口冲突，结束任务后再激活",
        );
        sy.state = "已同步";
        r.mapId = sy.mapId;
        r.mapVersion = sy.mapVersion;
        r.pointSet = sy.pointSet;
      }
      break;
    }
    case "VALIDATE": {
      const p = s.points.find((p) => p.id === a.id)!;
      const m = s.maps.find((m) => m.id === p.mapId)!;
      const r = robot();
      must(r.state === "空闲", "验证机器人必须空闲");
      must(
        r.mapId === m.id &&
          r.mapVersion === m.version &&
          r.pointSet === m.pointSet,
        "请先将当前试验版本同步并激活",
      );
      const need = captureKindsOfPoint(s, p);
      must(
        need.every((k) => r.capabilities.includes(k)),
        `验证机器人不具备该点位的采集方式（需要 ${need.join(" / ")}）`,
      );
      if (a.fail) {
        p.state = "待重新验证";
        p.validated = undefined;
        p.validationFailure = `${r.id} / m${m.version} / p${m.pointSet}：目标身份未确认（模拟失败），请修正标注后重新验证`;
        break;
      }
      p.validationFailure = undefined;
      p.state = "已启用";
      p.validated = `${r.id} / 能力 v2 / m${m.version} / 点位 v${p.version} / 目标身份与采集质量通过（模拟）`;
      break;
    }
    case "CHANGE_ADD":
      s.changes.unshift({
        id: id("CH"),
        mapId: a.mapId,
        pointId: a.pointId,
        type: a.kind,
        source: "人工登记",
        note: a.reason,
        state: "待确认",
      });
      break;
    case "CHANGE_CONFIRM": {
      const c = s.changes.find((c) => c.id === a.id)!;
      must(c.state === "待确认", "仅待确认变化可受理");
      c.state = "维护中";
      const p = s.points.find((p) => p.id === c.pointId);
      if (p) p.state = "待重新验证";
      break;
    }
    case "CHANGE_REVISION": {
      const c = s.changes.find((c) => c.id === a.id)!;
      must(c.state === "维护中", "请先确认变化");
      must(a.file || c.type === "仅业务属性变更", "空间变化须导入修订地图文件");
      const m = s.maps.find((m) => m.id === c.mapId)!;
      m.version++;
      m.pointSet++;
      m.state = "草稿";
      if (a.file) m.file = a.file;
      m.history.unshift(`m${m.version} 修订来源：${c.id}，原始资料保持归档`);
      c.version = m.version;
      c.pointSet = m.pointSet;
      c.state = "待同步";
      break;
    }
    case "CHANGE_CLOSE": {
      const c = s.changes.find((c) => c.id === a.id)!;
      const m = s.maps.find((m) => m.id === c.mapId)!;
      must(
        c.state === "待同步" && m.state === "已发布",
        "请完成修订、验证与正式发布",
      );
      must(
        s.robots
          .filter((r) => r.region === m.region)
          .every(
            (r) =>
              r.mapId === m.id &&
              r.mapVersion === m.version &&
              r.pointSet === m.pointSet,
          ),
        "区域内机器人尚未全部同步",
      );
      c.state = "已完成";
      break;
    }
    case "SAVE_TEMPLATE": {
      must(a.name && a.points?.length, "请输入模板名称并选择检测点位");
      const old = s.templates.find((t) => t.id === a.id);
      const t: Template = {
        id: old?.id || id("TMP"),
        name: a.name,
        points: a.points,
        priority: a.priority || "普通",
        end: a.end || "返航",
        state: a.state || old?.state || "启用",
        version: (old?.version || 0) + 1,
      };
      s.templates = old
        ? s.templates.map((x) => (x.id === old.id ? t : x))
        : [t, ...s.templates];
      object = t.id;
      break;
    }
    case "TOGGLE_TEMPLATE_STATE": {
      const t = s.templates.find((x) => x.id === a.id);
      must(t, "模板不存在或已删除");
      if (t.state === "启用") {
        const used = s.plans.filter(
          (p) => p.templateId === a.id && p.state === "启用",
        );
        must(used.length === 0, "该模板仍有启用的计划引用，请先停用相关计划");
      }
      t.state = t.state === "启用" ? "停用" : "启用";
      break;
    }
    case "DELETE_TEMPLATE": {
      const t = s.templates.find((x) => x.id === a.id);
      must(t, "模板不存在或已删除");
      const used = s.plans.filter((p) => p.templateId === a.id);
      must(used.length === 0, "该模板已被巡检计划引用，请先解除引用再删除");
      s.templates = s.templates.filter((x) => x.id !== a.id);
      break;
    }
    case "SAVE_PLAN": {
      const bound = s.robots.find((r) => r.id === a.robotId);
      must(bound, "请选择执行机器人");
      must(
        !bindingReasons(s, a.templateId, bound!).length,
        bindingReasons(s, a.templateId, bound!).join("；"),
      );
      must(
        /^\d{2}:\d{2}$/.test(a.time) &&
          Number(a.time.slice(0, 2)) < 24 &&
          Number(a.time.slice(3)) < 60,
        "请填写有效执行时间",
      );
      must(
        [a.advance, a.timeout, a.wait].every(
          (v) => Number.isFinite(+v) && +v >= 0,
        ),
        "时间参数必须为非负数",
      );
      must(
        a.name && a.templateId && a.start <= a.end,
        "请填写计划、模板及有效日期",
      );
      const old = s.plans.find((p) => p.id === a.id);
      const p: Plan = {
        id: old?.id || id("PL"),
        name: a.name,
        templateId: a.templateId,
        robotId: a.robotId,
        cycle: a.cycle,
        start: a.start,
        end: a.end,
        time: a.time,
        advance: +a.advance,
        timeout: +a.timeout,
        wait: +a.wait,
        state: "启用",
        version: (old?.version || 0) + 1,
      };
      s.plans = old
        ? s.plans.map((x) => (x.id === old.id ? p : x))
        : [p, ...s.plans];
      object = p.id;
      break;
    }
    case "GENERATE": {
      const p = s.plans.find((p) => p.id === a.id)!;
      must(p?.state === "启用", "计划已停用");
      const r = s.robots.find((r) => r.id === p.robotId);
      must(r, "旧计划待绑定机器人，请编辑后启用自动执行");
      const now = a.now ?? Date.now();
      const slot = a.scheduledAt || new Date(now).toISOString();
      const key = a.scheduledAt
        ? String(Date.parse(slot))
        : new Date(now).toISOString().slice(0, 10) + p.time;
      must(
        !s.tasks.some((t) => t.planId === p.id && t.scheduleKey === key),
        "该计划时段已生成任务，请勿重复生成",
      );
      const template = s.templates.find((t) => t.id === p.templateId)!;
      must(template?.state === "启用", "模板已停用");
      const t = createTask(
        p.name,
        template.points,
        "计划生成",
        template.priority,
        undefined,
        p,
      );
      Object.assign(t, {
        robotId: r!.id,
        state: "已分配",
        scheduleKey: key,
        notBefore: slot,
        allowedWait: p.wait,
        autoRun: true,
        expectedAt: slot,
        deadline: new Date(
          Date.parse(slot) + (p.wait + p.timeout) * 60000,
        ).toISOString(),
      });
      t.blockedReason = constraints(s, t, r!).join("；") || undefined;
      p.lastGenerated = key;
      p.generationError = undefined;
      detail = `计划自动生成，绑定 ${r!.id}；${new Date(slot).toLocaleString("zh-CN")} 起执行`;
      break;
    }
    case "AUTO_EXPIRE": {
      const t = task();
      t.state = "超期";
      t.blockedReason = "超过计划允许等待时间，请人工处理或重建任务";
      break;
    }
    case "CREATE_TASK":
      createTask(
        a.name,
        a.points,
        "人工临时",
        a.priority,
        undefined,
        undefined,
        a.taskType,
        a.atomicActions,
      );
      break;
    case "QUICK_DISPATCH": {
      must(a.atomicActions?.length, "请至少选择一个原子动作");
      const t = createTask(
          a.name,
          a.points,
          "执行监控临时下发",
          a.priority,
          undefined,
          undefined,
          a.taskType,
          a.atomicActions,
        ),
        r = robot();
      const reasons = constraints(s, t, r);
      must(!reasons.length, reasons.join("；"));
      t.robotId = r.id;
      t.dispatchId = id("DSP");
      t.state = "待执行";
      detail = `${t.taskType} · ${t.atomicActions.join(" / ")}；${r.id} 已接收并进入待执行队列`;
      break;
    }
    case "ASSIGN": {
      const t = task(),
        r = robot();
      must(
        ["待调度", "已分配"].includes(t.state),
        "已接收任务须先确认撤回后再改派",
      );
      const reasons = constraints(s, t, r).filter(
        (x) => x !== "地图/点位版本待同步",
      );
      must(!reasons.length, reasons.join("；"));
      t.robotId = r.id;
      t.state = "已分配";
      break;
    }
    case "DISPATCH": {
      const t = task(),
        r = robot(t.robotId);
      must(t.state === "已分配", "请先排队分配");
      must(
        !constraints(s, t, r, false, a.now ?? Date.now()).length,
        constraints(s, t, r, false, a.now ?? Date.now()).join("；"),
      );
      t.dispatchId = id("DSP");
      t.state = "下发中";
      break;
    }
    case "RECEIPT": {
      const t = task();
      must(t.state === "下发中", "当前没有待确认下发");
      t.state = "待执行";
      break;
    }
    case "ENQUEUE": {
      // 加入队列：一次性把待派单任务分配并下发至机器人预执行队列，机器人空闲则直接开跑
      const t = task(),
        r = robot();
      must(["待调度", "已分配"].includes(t.state), "任务不是待派单状态");
      const reasons = constraints(s, t, r);
      must(!reasons.length, reasons.join("；"));
      t.robotId = r.id;
      t.dispatchId = id("DSP");
      t.state = "待执行";
      if (
        !r.current &&
        (!t.notBefore || Date.parse(t.notBefore) <= (a.now ?? Date.now()))
      ) {
        must(
          !constraints(s, t, r, true).length,
          constraints(s, t, r, true).join("；"),
        );
        t.state = "执行中";
        t.startedAt ||= new Date().toISOString();
        r.current = t.id;
        r.state = "执行中";
        detail = `${t.id} 已加入 ${r.id} 队列并立即执行`;
      } else {
        detail = `${t.id} 已加入 ${r.id} 队列，等待当前任务结束后执行`;
      }
      break;
    }
    case "DISPATCH_NOW": {
      // 立即执行：与「加入队列」同一原子链路，仅语义强调即时下发（机器人忙碌时同样回落为排队）
      const t = task(),
        r = robot();
      must(["待调度", "已分配"].includes(t.state), "任务不是待派单状态");
      const reasons = constraints(s, t, r);
      must(!reasons.length, reasons.join("；"));
      t.robotId = r.id;
      t.dispatchId = id("DSP");
      t.state = "待执行";
      if (
        !r.current &&
        (!t.notBefore || Date.parse(t.notBefore) <= (a.now ?? Date.now()))
      ) {
        must(
          !constraints(s, t, r, true).length,
          constraints(s, t, r, true).join("；"),
        );
        t.state = "执行中";
        t.startedAt ||= new Date().toISOString();
        r.current = t.id;
        r.state = "执行中";
        detail = `${t.id} 已立即下发并由 ${r.id} 执行`;
      } else {
        detail = `${t.id} 已下发至 ${r.id}，当前任务结束后续执行`;
      }
      break;
    }
    case "WITHDRAW": {
      const t = task();
      must(
        ["已分配", "下发中", "待执行"].includes(t.state),
        "执行中任务不能直接撤回",
      );
      must(a.confirmed, "必须确认机器人未执行且已撤回");
      t.state = "待调度";
      t.robotId = undefined;
      t.dispatchId = undefined;
      break;
    }
    case "REASSIGN": {
      const t = task(),
        r = robot();
      must(
        ["已分配", "下发中", "待执行"].includes(t.state),
        "执行中任务不能直接改派",
      );
      must(a.confirmed, "须先确认撤回");
      const reasons = constraints(s, t, r).filter(
        (x) => x !== "地图/点位版本待同步",
      );
      must(!reasons.length, reasons.join("；"));
      detail = `${t.robotId} 撤回已确认，改派至 ${r.id}`;
      t.robotId = r.id;
      t.dispatchId = undefined;
      t.state = "已分配";
      break;
    }
    case "REORDER": {
      const t = task();
      must(["已分配", "待执行"].includes(t.state), "只能调整未执行队列");
      const i = s.tasks.indexOf(t);
      s.tasks.splice(i, 1);
      if (a.beforeId) {
        const before = s.tasks.find((x) => x.id === a.beforeId);
        must(
          before &&
            before.robotId === t.robotId &&
            ["已分配", "待执行"].includes(before.state),
          "只能在同一机器人预排队列中调序",
        );
        s.tasks.splice(s.tasks.indexOf(before!), 0, t);
      } else s.tasks.unshift(t);
      detail = "机器人队列顺序已确认调整，后续预计时间重算";
      break;
    }
    case "PREEMPT": {
      const t = task(),
        r = robot();
      must(t.priority !== "普通", "仅高优/紧急任务允许人工抢占");
      must(!constraints(s, t, r).length, constraints(s, t, r).join("；"));
      const old = s.tasks.find((x) => x.id === r.current);
      must(old?.state === "执行中", "没有可抢占的执行任务");
      old!.state = "暂停";
      r.current = undefined;
      r.state = "空闲";
      t.robotId = r.id;
      t.preemptedTaskId = old!.id;
      t.state = "已分配";
      detail = `已确认暂停 ${old!.id}，保留断点；新任务等待下发`;
      break;
    }
    case "START": {
      const t = task(),
        r = robot(t.robotId);
      must(["待执行", "暂停"].includes(t.state), "任务尚未接收");
      must(
        !constraints(s, t, r, true, a.now ?? Date.now()).length,
        constraints(s, t, r, true, a.now ?? Date.now()).join("；"),
      );
      const releasedSession = s.sessions.find(x => x.taskId === t.id && x.robotId === r.id);
      if (t.state === "暂停" && releasedSession?.state === "已释放" && !releasedSession.resumedAt)
        releasedSession.resumedAt = new Date(a.now ?? Date.now()).toISOString();
      t.state = "执行中";
      t.startedAt ||= new Date(a.now ?? Date.now()).toISOString();
      t.nextReportAt = (a.now ?? Date.now()) + 3500;
      r.current = t.id;
      r.state = "执行中";
      break;
    }
    case "PAUSE": {
      const t = task();
      must(t.state === "执行中", "任务未在执行");
      t.state = "暂停";
      robot(t.robotId).state = "暂停";
      break;
    }
    case "STOP": {
      const t = task();
      must(
        !["完成", "失败", "部分完成", "取消"].includes(t.state),
        "任务已结束",
      );
      t.state = t.done.length ? "部分完成" : "取消";
      if (t.robotId) {
        const r = robot(t.robotId);
        if (r.current === t.id) {
          r.current = undefined;
          r.state = "空闲";
        }
      }
      break;
    }
    case "TASK_FINISHED": {
      const t = task();
      must(t.state === "执行中", "任务不在执行中");
      t.items
        .filter((p) => !t.done.includes(p.id) && !t.skipped.includes(p.id))
        .forEach((p) => t.skipped.push(p.id));
      t.state =
        t.done.length === t.items.length
          ? "完成"
          : t.done.length
            ? "部分完成"
            : "失败";
      t.finishedAt = new Date().toISOString();
      const r = robot(t.robotId);
      r.current = undefined;
      r.state = "空闲";
      continueQueue(s, r);
      detail = `TASK_FINISHED 已收到；有效检测项 ${t.done.length}/${t.items.length}，平台判定 ${t.state}`;
      break;
    }
    case "FAIL": {
      const t = task();
      must(t.state === "执行中", "任务未执行");
      t.failure = a.reason || "目标歧义";
      break;
    }
    case "RETRY": {
      const t = task();
      must(t.failure && t.retries < 2, "重试已耗尽，请接管或跳过");
      t.retries++;
      t.failure = undefined;
      t.stage = 1;
      break;
    }
    case "TICK":
    case "SKIP": {
      const t = task(),
        r = robot(t.robotId);
      must(t.state === "执行中" && r.state === "执行中", "机器人未在自主执行");
      must(
        !constraints(s, t, r, true, a.now ?? Date.now()).length,
        constraints(s, t, r, true, a.now ?? Date.now()).join("；"),
      );
      t.nextReportAt = (a.now ?? Date.now()) + 3500;
      if (a.type === "TICK") {
        must(!t.failure, "请先处理执行异常");
        if (t.stage < stages.length - 1) {
          t.stage++;
          r.x = Math.min(85, r.x + 2);
          detail = stages[t.stage];
          break;
        }
      }
      const p = t.items[t.index];
      if (a.type === "SKIP") {
        t.skipped.push(p.id);
        t.failure = undefined;
      } else {
        let abnormal = !!a.abnormal;
        const rule = rulesOf(s).find((r) => r.pointId === p.id);
        // 模拟读数由该点位自己的判定规则驱动（J′）：不再按 Point.kind 硬编码，
        // 保证"采到的数"与"它自己的标准"自洽（温度点不会再读出 0.92℃）
        const value =
          a.value !== undefined ? String(a.value) : mockReading(rule, abnormal);
        const evaluation = evaluateRule(rule, value);
        abnormal = evaluation.abnormal;
        const res = {
          ruleSnapshot: rule ? structuredClone(rule) : undefined,
          id: id("RES"),
          taskId: t.id,
          pointId: p.id,
          item: p.item,
          raw: value,
          recognized: value,
          final: value,
          unit: p.unit,
          abnormal,
          status: evaluation.valid ? "已识别" : "待复核",
          source: "机器人自主采集 / AI v1.2（模拟）",
          confidence: 0.97,
          time: new Date().toLocaleString("zh-CN"),
          reviews: [],
        };
        s.results.unshift(res);
        t.done.push(p.id);
        if (abnormal) {
          const existing = s.alarms.find(
            (x) =>
              x.pointId === p.id && !["已关闭", "已恢复"].includes(x.state),
          );
          if (existing)
            existing.notes.push(`重复异常结果 ${res.id}；${evaluation.reason}`);
          else
            s.alarms.unshift({
              id: id("AL"),
              // 由业务结果触发的告警恒为"业务"分类（机器人本体异常由机器人事件生成）
              category: "业务",
              resultId: res.id,
              taskId: t.id,
              pointId: p.id,
              name: p.name + " 检测异常",
              level: rule?.level || "重要",
              state: "待确认",
              notes: [
                `规则 ${rule?.id || "无"} v${rule?.version || 0}：${evaluation.reason}`,
                // 通知对象来自业务巡检目标的「告警设置」，随告警记录带出
                ...(rule?.notify?.length
                  ? [`通知 ${rule.notify.join("、")}`]
                  : []),
              ],
              time: res.time,
            });
        }
        if (t.alarmId && !abnormal && rule?.enabled && evaluation.valid) {
          const al = s.alarms.find((x) => x.id === t.alarmId)!;
          al.state = "已恢复";
          al.notes.push("复查有效结果 " + res.id + "：" + value + p.unit);
        }
      }
      detail = `${p.id} · ${p.item} · ${a.type === "SKIP" ? "跳过记未完成" : "采集结果已生成"}`;
      t.index++;
      t.stage = 0;
      t.retries = 0;
      if (t.index >= t.items.length) {
        t.finishedAt = new Date().toISOString();
        t.state = t.skipped.length
          ? t.done.length
            ? "部分完成"
            : "失败"
          : "完成";
        r.current = undefined;
        r.state = "空闲";
        continueQueue(s, r);
      }
      break;
    }
    case "TAKEOVER": {
      const r = robot();
      must(r.state !== "离线", "机器人离线");
      must(
        !s.sessions.some(
          (x) => x.robotId === r.id && !["已释放", "已超时"].includes(x.state),
        ),
        "机器人已有独占会话",
      );
      s.sessions.unshift({
        id: id("SESSION"),
        startedAt: new Date().toISOString(),
        robotId: r.id,
        taskId: r.current,
        state: "待暂停确认",
        expires: Date.now() + 300000,
        seq: 0,
        pan: 0,
        tilt: 0,
      });
      object = s.sessions[0].id;
      detail = `${r.id} 已建立接管会话`;
      break;
    }
    case "CONTROL_ACK": {
      const x = s.sessions.find((x) => x.id === a.id)!;
      must(x.state === "待暂停确认", "会话状态不符");
      const r = robot(x.robotId);
      const t = s.tasks.find((t) => t.id === x.taskId);
      if (t) t.state = "暂停";
      r.state = "人工接管";
      x.state = "已接管";
      break;
    }
    case "CONTROL": {
      const x = s.sessions.find((x) => x.id === a.id)!;
      must(
        x.state === "已接管" && x.expires > Date.now(),
        "会话无效或到期，指令被拒绝",
      );
      const r = robot(x.robotId);
      must(r.state !== "离线", "机器人离线，未收到执行回执");
      x.seq++;
      /** 位移步长由驾驶舱速度档位决定（1-9，默认 3），避免速度控制成为死控件 */
      const step = Math.max(1, Math.min(9, Number(a.step) || 3));
      if (a.command === "左移") r.x = Math.max(4, r.x - step);
      if (a.command === "右移") r.x = Math.min(96, r.x + step);
      if (a.command === "前进") r.y = Math.max(4, r.y - step);
      if (a.command === "后退") r.y = Math.min(96, r.y + step);
      if (a.command === "云台左转") x.pan -= 10;
      if (a.command === "云台右转") x.pan += 10;
      if (a.command === "云台抬头") x.tilt += 5;
      if (a.command === "采集照片") {
        const t = s.tasks.find((t) => t.id === x.taskId);
        const p =
          t?.items[Math.min(t.index, t.items.length - 1)] ||
          s.points.find((p) => p.mapId === r.mapId);
        if (p)
          s.results.unshift({
            id: id("RES"),
            taskId: t?.id || "人工调试",
            pointId: p.id,
            item: p.item,
            // 遥控采集的图像需回传后由 AI 识别，前端不编造读数
            raw: "待回传",
            recognized: "待识别",
            final: "待复核",
            unit: p.unit,
            abnormal: false,
            status: "待复核",
            source: "人工遥控采集 / " + x.id,
            confidence: 0,
            time: new Date().toLocaleString("zh-CN"),
            reviews: [],
          });
      }
      detail = `${x.id} #${x.seq} ${a.command} · 模拟执行回执已确认${a.command === "采集照片" ? "；人工证据已留档，待结果复核，不覆盖自主结果" : ""}`;
      break;
    }
    case "CONTROL_EXIT": {
      const x = s.sessions.find((x) => x.id === a.id)!;
      must(x.state === "已接管", "当前不在接管中");
      x.state = "退出核对中";
      robot(x.robotId).state = "暂停";
      break;
    }
    case "CONTROL_RELEASE": {
      const x = s.sessions.find((x) => x.id === a.id)!;
      must(
        x.state === "退出核对中" && a.checked,
        "请核对版本、任务与已完成检测项",
      );
      x.state = "已释放";
      x.releasedAt = new Date().toISOString();
      const r = robot(x.robotId);
      r.state = x.taskId ? "暂停" : "空闲";
      break;
    }
    case "REVIEW": {
      const r = s.results.find((x) => x.id === a.id)!;
      must(a.value !== "" && a.reason, "请输入最终值和复核原因");
      r.reviews.push({
        value: a.value,
        reason: a.reason,
        time: new Date().toLocaleString("zh-CN"),
      });
      r.reviews[r.reviews.length - 1].conclusion = a.conclusion || "确认";
      r.reviews[r.reviews.length - 1].finalState =
        a.finalState || (r.abnormal ? "异常" : "正常");
      r.final = a.value;
      r.status = a.conclusion === "标记无效" ? "无效" : "已确认";
      if (a.finalState) r.abnormal = a.finalState === "异常";
      if (r.status === "无效") {
        const t = s.tasks.find((t) => t.id === r.taskId);
        if (t) {
          const valid = s.results.some(
            (x) =>
              x.id !== r.id &&
              x.taskId === t.id &&
              x.pointId === r.pointId &&
              !["无效", "失败", "待复核"].includes(x.status),
          );
          if (!valid) {
            t.done = t.done.filter((pid) => pid !== r.pointId);
            if (!t.skipped.includes(r.pointId)) t.skipped.push(r.pointId);
            if (t.state === "完成")
              t.state = t.done.length ? "部分完成" : "失败";
          }
        }
      }
      break;
    }
    case "ALARM_ACK": {
      const al = s.alarms.find((x) => x.id === a.id)!;
      must(al.state === "待确认", "告警已确认");
      al.state = "处理中";
      al.notes.push("张工确认告警");
      break;
    }
    case "ALARM_NOTE": {
      const al = s.alarms.find((x) => x.id === a.id)!;
      must(a.reason, "请输入处置记录");
      al.notes.push(a.reason);
      break;
    }
    case "RECHECK": {
      const al = s.alarms.find((x) => x.id === a.id)!;
      must(
        ["处理中", "已恢复"].includes(al.state),
        "请先确认告警，或等待当前复查完成",
      );
      const t = createTask(
        al.name + "复查",
        [al.pointId],
        "异常复查",
        "高",
        al.id,
      );
      al.reviewTask = t.id;
      al.state = "待复查";
      break;
    }
    case "ALARM_CLOSE": {
      const al = s.alarms.find((x) => x.id === a.id)!;
      must(al.state === "已恢复" && a.reason, "需有效复查恢复结果和关闭依据");
      al.state = "已关闭";
      al.notes.push("关闭依据：" + a.reason);
      break;
    }
    case "EXTERNAL": {
      must(a.businessId, "请输入业务编号");
      const old = s.requests.find((r) => r.businessId === a.businessId);
      if (old) {
        object = old.taskId;
        detail = "同一调用方+业务编号幂等命中";
        break;
      }
      const t = createTask(
        "上层业务任务 " + a.businessId,
        s.templates[0].points,
        "上层业务平台",
      );
      s.requests.push({ businessId: a.businessId, taskId: t.id });
      break;
    }
    case "EXTRA_SAVE": {
      must(a.name, "名称不能为空");
      const old = s.extras.find((x) => x.id === a.id);
      const x = {
        id: old?.id || id("CFG"),
        category: a.category,
        name: a.name,
        status: a.status || "启用",
        detail: a.detail || "",
      };
      s.extras = old
        ? s.extras.map((y) => (y.id === old.id ? x : y))
        : [x, ...s.extras];
      break;
    }
    case "EXTRA_TOGGLE": {
      const x = s.extras.find((x) => x.id === a.id)!;
      x.status = x.status === "启用" ? "停用" : "启用";
      break;
    }
    case "EMERGENCY_STOP": {
      // 急停为最高优先级安全动作：暂停全部执行中任务、机器人进入安全待机、强制释放遥控会话
      const running = s.tasks.filter((t) => t.state === "执行中");
      running.forEach((t) => {
        t.state = "暂停";
        const r = s.robots.find((x) => x.id === t.robotId);
        if (r) r.state = "暂停";
      });
      s.sessions
        .filter((x) => !["已释放", "已超时"].includes(x.state))
        .forEach((x) => {
          x.state = "已超时";
          const r = s.robots.find((y) => y.id === x.robotId);
          if (r && r.state === "人工接管") r.state = "暂停";
        });
      detail = `急停已触发：${running.length} 个执行中任务已暂停，遥控会话已强制释放`;
      break;
    }
    case "RECHARGE": {
      const r = robot();
      must(r.state !== "离线", "机器人离线，无法下发回充指令");
      must(!r.current, "机器人存在执行中任务，请先暂停或结束");
      must(
        !["故障", "维护"].includes(r.state),
        "机器人故障或维护中，暂不可回充",
      );
      must(
        !s.sessions.some(
          (x) => x.robotId === r.id && !["已释放", "已超时"].includes(x.state),
        ),
        "请先释放人工接管会话",
      );
      r.state = "返航中";
      detail = `${r.id} 已下发自动回充，等待到位回报`;
      break;
    }
    case "RETURN_HOME": {
      // 一键返航：终止当前任务并直接下发回充，合并为单次状态迁移避免两次操作竞争
      const r = robot();
      must(r.state !== "离线", "机器人离线，无法下发返航指令");
      const cur = s.tasks.find((x) => x.id === r.current);
      if (cur && !["完成", "失败", "部分完成", "取消"].includes(cur.state)) {
        cur.state = cur.done.length ? "部分完成" : "取消";
      }
      r.current = undefined;
      s.sessions
        .filter(
          (x) => x.robotId === r.id && !["已释放", "已超时"].includes(x.state),
        )
        .forEach((x) => {
          x.state = "已释放";
      x.releasedAt = new Date().toISOString();
        });
      r.state = "返航中";
      detail = `${r.id} 已释放遥控并返航，等待到位回报`;
      break;
    }
    case "RETURN_ARRIVED": {
      const r = robot();
      must(r.state === "返航中", "机器人不在返航中");
      r.state = "充电";
      detail = `${r.id} 到位回报已确认，开始充电`;
      break;
    }
    case "POSTURE": {
      const r = robot();
      must(
        !["离线", "故障"].includes(r.state),
        "机器人离线或故障，无法调整姿态",
      );
      r.posture = a.posture || "站立";
      detail = `${r.id} 姿态动作：${r.posture}`;
      break;
    }
    case "WO_CREATE": {
      // 驾驶舱一键派单：由告警生成工单，并按 SLA 分级设定处置时限
      const al = s.alarms.find((x) => x.id === a.alarmId);
      must(al, "告警不存在");
      must(
        !s.workOrders.some(
          (w) =>
            w.alarmId === al!.id && !["已验收", "已关闭"].includes(w.state),
        ),
        "该告警已有未闭环工单，请勿重复派单",
      );
      const level = slaLevelOf(al!.level);
      const now = new Date();
      const wo: WorkOrder = {
        id: id("WO"),
        alarmId: al!.id,
        pointId: al!.pointId,
        title: al!.name + "处置",
        level,
        state: a.assignee ? "已派单" : "待派单",
        assignee: a.assignee,
        slaLeft: SLA_MINUTES[level],
        slaState: "正常",
        spares: [],
        note: a.reason || "",
        created: now.toLocaleString("zh-CN"),
        timeline: [
          {
            time: now.toLocaleTimeString("zh-CN", { hour12: false }),
            actor: a.actor || "调度台",
            action: a.assignee ? "生成并派单" : "工单生成",
            detail: a.assignee ? `指派给 ${a.assignee}` : "待指派处置人",
          },
        ],
      };
      s.workOrders.unshift(wo);
      al!.state = "处理中";
      al!.notes.push(
        `已生成工单 ${wo.id} · ${level}级 SLA ${SLA_MINUTES[level]} 分钟`,
      );
      object = wo.id;
      detail = `${wo.title} · ${level}级 SLA ${SLA_MINUTES[level]} 分钟`;
      break;
    }
    case "WO_ASSIGN": {
      const wo = s.workOrders.find((x) => x.id === a.id);
      must(wo, "工单不存在");
      must(a.assignee, "请选择处置人");
      must(
        ["待派单", "已派单"].includes(wo!.state),
        "工单已进入处置流程，如需调整请使用转派",
      );
      const isTransfer = wo!.state === "已派单";
      wo!.assignee = a.assignee;
      wo!.state = "已派单";
      wo!.timeline.push({
        time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        actor: a.actor || "调度台",
        action: isTransfer ? "转派" : "派单",
        detail: `指派给 ${a.assignee}`,
      });
      detail = `${wo!.id} 已${isTransfer ? "转派" : "派单"}给 ${a.assignee}`;
      break;
    }
    case "WO_ESCALATE": {
      const wo = s.workOrders.find((x) => x.id === a.id);
      must(wo, "工单不存在");
      must(!["已验收", "已关闭"].includes(wo!.state), "工单已闭环，无需升级");
      wo!.slaState = "已升级";
      wo!.timeline.push({
        time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        actor: a.actor || "调度台",
        action: "超时升级",
        detail: a.reason || "SLA 超时，按升级链上报上一级",
      });
      detail = `${wo!.id} 已升级：${a.reason || "SLA 超时"}`;
      break;
    }
    case "SLA_TICK": {
      // 倒计时推进：仅基于真实剩余时间递减，不产生任何模拟数据
      const open = s.workOrders.filter(
        (w) => !["已验收", "已关闭"].includes(w.state),
      );
      object = "SLA";
      if (!open.length) {
        detail = "无未闭环工单";
        break;
      }
      open.forEach((w) => {
        w.slaLeft -= 1;
        if (w.slaLeft <= 0) {
          if (w.slaState !== "已升级") {
            w.slaState = "已升级";
            w.timeline.push({
              time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
              actor: "系统",
              action: "SLA 超时",
              detail: "已按升级链自动上报",
            });
          }
        } else if (w.slaLeft <= SLA_WARN_MINUTES && w.slaState === "正常") {
          w.slaState = "预警";
        }
      });
      detail = `${open.length} 个未闭环工单 SLA 已推进 1 分钟`;
      break;
    }
    case "ALARM_FALSE": {
      // 真假标记：误报写入反馈队列，供"误报漏报分析"消费，形成模型迭代闭环
      const al = s.alarms.find((x) => x.id === a.id);
      must(al, "告警不存在");
      must(a.reason, "请填写误报判定依据");
      al!.notes.push("误报判定：" + a.reason);
      al!.state = "已关闭";
      const res = s.results.find((r) => r.id === al!.resultId);
      const robotId = res
        ? s.tasks.find((t) => t.id === res.taskId)?.robotId
        : undefined;
      s.feedbacks.unshift({
        id: id("FB"),
        resultId: al!.resultId,
        deviceType:
          s.robots.find((r) => r.id === robotId)?.deviceType || "机器狗",
        pointId: al!.pointId,
        algorithm: res?.source || "未标注算法",
        label: "误报",
        reviewer: a.actor || "调度台",
        consumed: false,
        time: new Date().toLocaleString("zh-CN"),
      });
      detail = `${al!.name} 已标记误报并关闭，反馈进入模型迭代队列`;
      break;
    }
    case "ALARM_ESCALATE": {
      const al = s.alarms.find((x) => x.id === a.id);
      must(al, "告警不存在");
      al!.notes.push("超时升级：" + (a.reason || "SLA 超时，升级至上一级处置"));
      detail = `${al!.name} 已升级`;
      break;
    }
    default:
      throw Error("未知操作 " + a.type);
  }
  s.logs.unshift({
    id: id("LOG"),
    time: new Date().toLocaleTimeString("zh-CN"),
    action: a.type,
    object,
    detail: detail || "张工 · 操作成功（Mock）",
  });
  releaseOutputs(s);
  return s;
}
