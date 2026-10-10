/**
 * @file excel.ts
 * @description 现场采集结果的 Excel 导入 / 导出。
 *              - 导出：把本次现场采集的「标定点 + 巡检点（含巡检项）」写成 .xlsx，
 *                其中「标定点」工作表的列与 `parsePointCalibration` 完全一致，
 *                因此可再次在「巡检点管理 › 巡检点导入」中导入（仅重建标定点，符合 MAP-02 口径）。
 *              - 导入：读取 .xlsx 的「标定点」工作表，转 CSV 后复用 `parsePointCalibration`，
 *                与 CSV / TXT / JSON 走同一套解析与校验口径（解析不出即报错，不生成模拟数据）。
 * @interaction 现场采集页（PointOnsite）导出；巡检点导入（PointCalibration）读 .xlsx。
 */
import * as XLSX from "xlsx";
import {
  parsePointCalibration,
  type CalibrationParseResult,
} from "./mapCalibration";

/** 一条现场采集记录（供导出）：标定点 + 巡检点身份 + 巡检项明细 */
export interface OnsiteExportPoint {
  pointId: string;
  name: string;
  mapId: string;
  mapName: string;
  externalId: string;
  x: number;
  y: number;
  robotId?: string;
  kind?: string;
  items: {
    name: string;
    targetLabel: string;
    actions: string[];
    ptz: { pan: number; tilt: number; zoom: number };
    light?: number;
    dwellSec?: number;
    viewDir?: string;
    avoidPolicy?: string;
  }[];
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 把巡检项拍平成「巡检点」工作表的一行（长表：一个巡检项一行） */
function pointRows(p: OnsiteExportPoint): (string | number)[][] {
  const base = [
    p.pointId,
    p.name,
    p.mapId,
    p.mapName,
    p.externalId,
    p.x,
    p.y,
    p.robotId || "",
  ];
  if (!p.items.length) {
    return [[...base, "", "", "", "", "", "", "", ""]];
  }
  return p.items.map((it, i) => [
    ...base,
    i + 1,
    it.name,
    it.targetLabel,
    it.actions.join(" / "),
    `${it.ptz.pan}° / ${it.ptz.tilt}° / ${it.ptz.zoom}`,
    it.light !== undefined ? `${it.light}%` : "",
    it.dwellSec !== undefined ? `${it.dwellSec}s` : "",
    it.viewDir || "",
    it.avoidPolicy || "",
  ]);
}

/**
 * 导出本次现场采集结果为 .xlsx
 * @description 两个工作表：
 *              - 标定点：列与 `parsePointCalibration` 一致（定位ID, X, Y, 类型, 水平角, 俯仰角, 变焦），可再次导入。
 *              - 巡检点：巡检点身份 + 巡检项明细（长表），作为完整采集档案。
 */
export function exportOnsiteWorkbook(points: OnsiteExportPoint[]): void {
  if (!points.length) return;
  const calibHeader = ["定位ID", "X", "Y", "类型", "水平角", "俯仰角", "变焦"];
  const calibRows = points.map((p) => [
    p.externalId,
    p.x,
    p.y,
    p.kind || "可见光",
    "",
    "",
    "",
  ]);
  const pointHeader = [
    "巡检点ID",
    "巡检点名称",
    "地图ID",
    "地图名称",
    "定位ID",
    "X",
    "Y",
    "采集机器人",
    "序号",
    "巡检项名称",
    "巡检目标台账",
    "原子动作",
    "云台(水平/俯仰/变焦)",
    "补光",
    "停留",
    "视角",
    "避让策略",
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([calibHeader, ...calibRows]),
    "标定点",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([pointHeader, ...points.flatMap(pointRows)]),
    "巡检点",
  );
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `现场采集巡检点_${stamp}.xlsx`);
}

/**
 * 读取 .xlsx 形式的巡检点标定文件
 * @description 取「标定点」工作表（缺省取第一张），转 CSV 后复用 `parsePointCalibration`，
 *              保证与 CSV / TXT / JSON 走同一套解析与校验口径。
 */
export async function readCalibrationWorkbook(
  file: File,
): Promise<CalibrationParseResult> {
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const name =
      (wb.SheetNames || []).find((n) => n.includes("标定")) ||
      wb.SheetNames?.[0];
    if (!name) {
      return { points: [], error: "Excel 里没有可读取的工作表。" };
    }
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
    return parsePointCalibration(csv);
  } catch {
    return {
      points: [],
      error: "Excel 文件解析失败，请确认是 .xlsx 且含「标定点」工作表。",
    };
  }
}

/**
 * 读取 Excel / CSV 为二维字符串表（首行通常是表头）
 * @description 设备清单等「贴表即导入」的统一入口：.xlsx / .xls 走 SheetJS 取第一张工作表，
 *              .csv 直接按行切分；不做业务校验，列语义交给调用方。
 * @param file 用户选择的文件
 * @returns 行 × 列的字符串数组；解析失败抛错
 */
export async function readSheetRows(file: File): Promise<string[][]> {
  const cell = (v: unknown) => String(v ?? "").trim();
  if (/\.csv$/i.test(file.name)) {
    return (await file.text())
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => line.split(",").map(cell));
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const name = wb.SheetNames?.[0];
  if (!name) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
    header: 1,
    raw: false,
    defval: "",
  });
  return rows.map((r) => (Array.isArray(r) ? r.map(cell) : []));
}

/**
 * 把二维表导出为 .xlsx（单工作表）
 * @description 设备清单模板等「填好再导入」场景的统一导出；与 `readSheetRows` 互为往返口径。
 * @param aoa 行 × 列的单元格（首行为表头）
 * @param sheetName 工作表名
 * @param filename 下载文件名（含 .xlsx）
 */
export function downloadXlsx(
  aoa: (string | number)[][],
  sheetName: string,
  filename: string,
) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName);
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  downloadBlob(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename,
  );
}
