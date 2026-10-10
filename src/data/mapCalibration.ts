/**
 * @file mapCalibration.ts
 * @description **巡检点标定文件的独立存储模块**——与地图（纯点云）彻底分开存放。
 *              MAP-02 口径：**采集一趟、产出两件**（① 点云地图文件 ② 巡检点标定文件）；
 *              **存储两份、上传两处**（地图归「地图管理」，标定文件归「巡检点管理」）；
 *              **模块两个、ID 一绑**（两模块通过地图上的定位 ID 绑定）。
 *              地图只存"机器人能走哪"的点云底图，**不含任何定位ID与巡检点**；
 *              标定文件含点位坐标 / 定位 ID / 姿态 / 上装参数，**不含业务目标与告警阈值**。
 * @interaction 被 data/engine.ts（导入 / 标定 / 绑定 / 下发）与页面（地图管理、巡检点管理）消费
 */
import type { Candidate, PTZ } from "./types";

/**
 * 统一坐标系（已部分落地）：`Candidate` / `ParsedCalibrationPoint` 已增加 `world?`（全厂 XYZ 米），
 *   标定导入（CSV 可选 world 列 / JSON `world`）与现场采集（`CAPTURE_ONSITE_POINT`）均会写入 `world`；
 *   `PointEdit` 画布优先按 `world` 定位，任务快照 `Snapshot` 已携带 `world` 下发。
 *   演示环境 `world` 按底图 1:1（z=0）初始化；真实项目由标定文件直接给 XYZ 或机器人位姿换算。
 * 待补齐（见 docs/统一坐标系实现.md）：① `MapAsset.geoRef` 地理配准 + `geo.ts` 的
 *   `worldToPixel/pixelToWorld` 纯函数转换层；② 解析兼容"经纬度 / 大地坐标"并互转；
 *   ③ 底图重标定后 `world` 与百分比的再对齐。
 */

/**
 * 巡检点标定文件：一张地图对应一份，与地图分开放（标定数据不设独立版本）
 * @description 地图重传 / 删除不会连带影响标定数据（关联靠 mapId，非隶属）
 */
export interface MapCalibration {
  /** 标定文件编号，如 CAL-A03 */
  id: string;
  /** 关联地图 id（**仅关联，非隶属**；地图重传后按定位 ID 匹配重绑） */
  mapId: string;
  /** 标定点（= 地图位置 + 定位ID，无业务信息、无巡检项） */
  targets: Candidate[];
  /** 来源标定文件名（采集时与点云地图同批产出） */
  file?: string;
  /**
   * 数据来源机器人（机器狗）id —— 现场采集这批点位数据的机器人。
   * @description 上传前需先明确"是哪只狗的数据"；机器人只作**来源归属**，
   *              不改变标定数据的定位语义（定位仍以定位 ID + 统一坐标系为准）。
   */
  robotId?: string;
  /** 标定文件导入时间 */
  importedAt?: string;
  /** 最近一次标定时间 */
  updatedAt: string;
}

/** 从标定文件解析出的一条定位点 */
export interface ParsedCalibrationPoint {
  /** 定位 ID（**来源绑定键**，非业务主键） */
  externalId: string;
  /** 底图投影坐标（百分比） */
  x: number;
  y: number;
  /** 统一坐标系坐标（米，可选；标定文件直接给 XYZ 时优先用，否则由 x/y 换算） */
  world?: { x: number; y: number; z: number };
  /** 采集方式 / 类型（可选） */
  kind?: string;
  /** 上装姿态（水平 / 俯仰 / 变焦，可选） */
  ptz?: PTZ;
}

/** 标定文件解析结果 */
export interface CalibrationParseResult {
  points: ParsedCalibrationPoint[];
  /** 解析失败 / 无有效行时的原因（中文，直接可用于页面提示） */
  error?: string;
}

/**
 * 解析「巡检点标定文件」文本
 * @description 支持两种真实格式（**不生成任何模拟数据**，解析不出就报错）：
 *              - CSV / TXT：逗号、制表符或分号分隔，列为
 *                `定位ID, x, y[, 类型][, 水平角, 俯仰角, 变焦]`，可带表头（表头行自动跳过）；
 *              - JSON：`[{ id|externalId, x, y, kind?, ptz? }]`，或形如 `{ points: [...] }` 的对象。
 * @param text 文件文本内容
 * @returns 解析结果；无有效行时 error 给出原因
 */
export function parsePointCalibration(text: string): CalibrationParseResult {
  const raw = (text || "").trim();
  if (!raw) return { points: [], error: "文件内容为空，未解析到定位点。" };
  if (raw.startsWith("[") || raw.startsWith("{")) {
    try {
      const data = JSON.parse(raw) as
        | Record<string, unknown>[]
        | { points?: Record<string, unknown>[]; targets?: Record<string, unknown>[] };
      const arr = Array.isArray(data)
        ? data
        : data.points || data.targets || [];
      const points: ParsedCalibrationPoint[] = [];
      arr.forEach((it) => {
        const externalId = String(it.id ?? it.externalId ?? "").trim();
        const x = Number(it.x);
        const y = Number(it.y);
        if (!externalId || !Number.isFinite(x) || !Number.isFinite(y)) return;
        const ptz = (it.ptz || {}) as PTZ;
        const w = (it.world ?? {}) as { x?: unknown; y?: unknown; z?: unknown };
        const wx = Number(w.x ?? it.wx);
        const wy = Number(w.y ?? it.wy);
        const wz = Number(w.z ?? it.wz);
        const world =
          Number.isFinite(wx) && Number.isFinite(wy)
            ? { x: wx, y: wy, z: Number.isFinite(wz) ? wz : 0 }
            : undefined;
        points.push({
          externalId,
          x,
          y,
          world,
          kind: it.kind ? String(it.kind) : undefined,
          ptz: Number.isFinite(ptz.pan) ? ptz : undefined,
        });
      });
      return points.length
        ? { points }
        : { points: [], error: "JSON 里没有解析到带定位ID与坐标的点。" };
    } catch {
      return { points: [], error: "JSON 格式解析失败，请检查文件内容。" };
    }
  }
  // CSV / TXT：逐行解析（表头行因第二列不是数字而被自动跳过）
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const points: ParsedCalibrationPoint[] = [];
  let skipped = 0;
  lines.forEach((line) => {
    const cells = line.split(/[,\t;]/).map((c) => c.trim());
    const externalId = cells[0];
    const x = Number(cells[1]);
    const y = Number(cells[2]);
    if (!externalId || !Number.isFinite(x) || !Number.isFinite(y)) {
      skipped++;
      return;
    }
    const pan = Number(cells[4]);
    const tilt = Number(cells[5]);
    const zoom = Number(cells[6]);
    const wx = Number(cells[7]);
    const wy = Number(cells[8]);
    const wz = Number(cells[9]);
    const world =
      Number.isFinite(wx) && Number.isFinite(wy)
        ? { x: wx, y: wy, z: Number.isFinite(wz) ? wz : 0 }
        : undefined;
    points.push({
      externalId,
      x,
      y,
      world,
      kind: cells[3] || undefined,
      ptz:
        Number.isFinite(pan) && Number.isFinite(tilt) && Number.isFinite(zoom)
          ? { pan, tilt, zoom }
          : undefined,
    });
  });
  if (!points.length)
    return {
      points: [],
      error: `未解析到有效定位点（已跳过 ${skipped} 行无法识别的记录）。`,
    };
  return { points };
}

/**
 * 持有标定集合的最小结构
 * @description 只声明读取标定数据所需的字段，避免与 types.ts 形成模块循环依赖
 */
interface HasCalibrations {
  mapCalibrations?: MapCalibration[];
}

/**
 * 取某张地图的标定文件
 * @param s 状态（或任何含标定集合的对象）
 * @param mapId 地图 id
 * @returns 标定文件；该地图尚未标定时返回 undefined
 */
export function calibrationOf(
  s: HasCalibrations,
  mapId: string,
): MapCalibration | undefined {
  return (s.mapCalibrations || []).find((c) => c.mapId === mapId);
}

/**
 * 取某张地图的巡检点列表（未标定时返回空数组）
 * @param s 状态
 * @param mapId 地图 id
 * @returns 巡检点列表（只读用途；写入请走 engine 的标定 action）
 */
export function targetsOf(s: HasCalibrations, mapId: string): Candidate[] {
  return calibrationOf(s, mapId)?.targets || [];
}

/**
 * 取得（不存在则创建）某张地图的标定文件
 * @description 供 engine 在写入巡检点时调用
 * @param s 可变状态
 * @param mapId 地图 id
 * @returns 该地图的标定文件（**可变引用**）
 */
export function ensureCalibration(
  s: HasCalibrations & { mapCalibrations?: MapCalibration[] },
  mapId: string,
): MapCalibration {
  s.mapCalibrations ||= [];
  let cal = s.mapCalibrations.find((c) => c.mapId === mapId);
  if (!cal) {
    cal = {
      id: `CAL-${mapId}`,
      mapId,
      targets: [],
      updatedAt: new Date().toLocaleString("zh-CN"),
    };
    s.mapCalibrations.push(cal);
  }
  return cal;
}

/**
 * 待绑定的标定文件（地图尚未就绪时的暂存）
 * @description MAP-02 修改要点 4：允许**先导入标定文件**，待点云地图就绪后再选地图绑定；
 *              绑定前这些定位点不参与任何业务（不会自动生成巡检点）。
 */
export interface PendingCalibration {
  /** 来源文件名 */
  file: string;
  /** 数据来源机器人（机器狗）id */
  robotId?: string;
  /** 解析出的定位点 */
  points: ParsedCalibrationPoint[];
  /** 导入时间 */
  at: string;
}

/**
 * 把导入的定位点合并进一份标定数据
 * @description 按**定位 ID** 匹配：
 *              - 已存在同 ID → 更新坐标 / 类型 / 姿态（**地图重传后重绑就落在这里**）；
 *              - 不存在 → 新增一条标定点（尚不产生平台巡检点，需再走「绑定」动作）。
 * @param cal 目标标定数据（**可变引用**）
 * @param points 解析出的定位点
 * @returns 新增数与重绑数（用于操作回执文案）
 */
export function mergeCalibrationPoints(
  cal: MapCalibration,
  points: ParsedCalibrationPoint[],
): { added: number; rebound: number } {
  let added = 0;
  let rebound = 0;
  points.forEach((p) => {
    const existed = cal.targets.find((t) => t.externalId === p.externalId);
    if (existed) {
      existed.x = p.x;
      existed.y = p.y;
      if (p.world) existed.world = p.world;
      if (p.kind) existed.kind = p.kind;
      if (p.ptz) existed.recommended = { ...(existed.recommended || {}), ptz: p.ptz };
      rebound++;
      return;
    }
    cal.targets.push({
      id: p.externalId,
      externalId: p.externalId,
      source: "地图导入",
      kind: p.kind || "可见光",
      x: p.x,
      y: p.y,
      // 统一坐标系：优先用标定文件给的 world，否则按演示口径由底图坐标 1:1 初始化（z=0）
      world: p.world || { x: p.x, y: p.y, z: 0 },
      state: "待确认",
      recommended: p.ptz ? { ptz: p.ptz } : undefined,
    });
    added++;
  });
  return { added, rebound };
}
