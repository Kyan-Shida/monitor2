/**
 * @file PointCalibration.tsx
 * @description **巡检点导入**：先确定数据来源机器人（机器狗），再「从机器人拉取数据」或「上传表格文件」，
 *              最终落到「巡检点管理」。
 *              MAP-02 口径：采集一趟、产出两件；存储两份、上传两处；模块两个、ID 一绑。
 *              标定数据含点位坐标 / 定位 ID / 姿态 / 上装参数，**不含业务目标与告警阈值**；
 *              独立存储（data/mapCalibration.ts），自带版本 c{n}，与地图空间版本 V{n} 解耦。
 * @interaction 由「巡检点管理」（pages/InspectionPoints.tsx）的「巡检点导入」入口打开；
 *              导入走 engine action `IMPORT_POINT_CALIBRATION`
 */
import { useState } from "react";
import { useStore } from "../data/store";
import {
  parsePointCalibration,
  type CalibrationParseResult,
} from "../data/mapCalibration";
import { readCalibrationWorkbook } from "../data/excel";
import { Btn, Field, Note, Panel, Table } from "./UI";

/**
 * 巡检点导入入口：确定数据来源机器人 → 拉取 / 上传表格文件
 * @param mapId 初始地图 id（缺省取第一张地图）
 */
export function PointCalibration({ mapId }: { mapId?: string }) {
  const { s } = useStore();
  const [curId, SETCUR] = useState(mapId || s.maps[0]?.id || "");
  const m = s.maps.find((x) => x.id === curId) || s.maps[0];
  return (
    <>
      {s.pendingCalibration && <PendingBar />}
      <div className="toolbar">
        <div className="actions">
          <label className="inline-filter">
            <span>标定地图：</span>
            <select value={m?.id || ""} onChange={(e) => SETCUR(e.target.value)}>
              {s.maps.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <BatchImport mapId={m?.id} />
    </>
  );
}

/**
 * 批量文件上传：先确定数据来源机器人（机器狗），再选「拉取数据」或「上传表格文件」
 * @param mapId 目标地图（可为空 → 暂存）
 */
function BatchImport({ mapId }: { mapId?: string }) {
  const { s } = useStore();
  /** 数据来源机器人 id（**必选**，未选前不允许导入） */
  const [robotId, SETROBOT] = useState("");
  /** 拉取失败提示（不返回任何模拟数据，只给明确原因） */
  const [pullMsg, SETPULL] = useState("");
  const robot = s.robots.find((r) => r.id === robotId);

  /**
   * 从机器人拉取巡检点数据
   * @description 项目**尚未接入机器人端数据接口**。按"禁止模拟数据"口径：
   *              不返回任何假装的数据，只给出明确提示，并以 ERROR 级记录完整错误信息。
   */
  function pullFromRobot() {
    console.error("[巡检点导入] 从机器人拉取数据失败：机器人端数据接口未接入", {
      robotId,
      robotName: robot?.name,
    });
    SETPULL(
      `机器人端数据接口未接入，暂时无法从「${robot?.name || robotId}」拉取巡检点数据。请改用「上传表格文件」，或等待接口接入。`,
    );
  }

  return (
    <>
      <Panel title="批量文件上传">
        <Field label="数据来源机器人">
          <select
            value={robotId}
            onChange={(e) => {
              SETROBOT(e.target.value);
              SETPULL("");
            }}
          >
            <option value="">请选择机器人…</option>
            {s.robots.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}（{r.id}）
              </option>
            ))}
          </select>
        </Field>
        {robotId && (
          <>
            <div className="actions">
              <Btn onClick={pullFromRobot}>从机器人拉取数据</Btn>
            </div>
            {pullMsg && (
              <p role="alert" className="muted">
                {pullMsg}
              </p>
            )}
          </>
        )}
      </Panel>
      {robotId && <TableUploadPanel key={robotId} mapId={mapId} robotId={robotId} />}
    </>
  );
}

/**
 * 待绑定标定文件提示条：选择地图后绑定（或放弃）
 * @description MAP-02 修改要点 4：允许标定文件先于地图导入
 */
function PendingBar() {
  const { s, act } = useStore();
  const pending = s.pendingCalibration!;
  const [mapId, SETMAP] = useState("");
  return (
    <Note>
      <b>有 1 份巡检点标定文件待绑定：</b>
      {pending.file} · {pending.points.length} 个定位点 · 导入于 {pending.at}
      <span className="actions">
        <select value={mapId} onChange={(e) => SETMAP(e.target.value)}>
          <option value="">选择要绑定的地图…</option>
          {s.maps.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <Btn
          primary
          disabled={!mapId}
          onClick={() => act({ type: "BIND_PENDING_CALIBRATION", mapId })}
        >
          绑定到该地图
        </Btn>
        <Btn onClick={() => act({ type: "DISCARD_PENDING_CALIBRATION" })}>放弃</Btn>
      </span>
    </Note>
  );
}

/**
 * 上传表格文件：真实解析 CSV / TXT / JSON，解析不出即报错（不生成模拟数据）
 * @param mapId 当前选中的地图（可为空 → 暂存）
 * @param robotId 数据来源机器人 id（随标定数据一并记录，仅作归属）
 */
function TableUploadPanel({
  mapId,
  robotId,
}: {
  mapId?: string;
  robotId: string;
}) {
  const { s, act } = useStore();
  const [file, SETFILE] = useState("");
  const [result, RESULT] = useState<CalibrationParseResult | null>(null);
  /** 目标地图；空串 = 暂存待绑定 */
  const [targetMap, SETMAP] = useState(mapId || "");
  const [readErr, ERR] = useState("");

  /**
   * 选择并解析标定文件
   * @param f 用户选择的文件
   */
  async function pick(f?: File) {
    if (!f) return;
    ERR("");
    SETFILE(f.name);
    try {
      const isXlsx =
        /\.xlsx$/i.test(f.name) || f.type.includes("spreadsheetml");
      const res = isXlsx
        ? await readCalibrationWorkbook(f)
        : parsePointCalibration(await f.text());
      RESULT(res);
    } catch {
      RESULT(null);
      ERR("文件无法读取，请重新选择。");
    }
  }

  const points = result?.points || [];
  return (
    <Panel title="上传表格文件（同批采集的第二件产出）">
      <Field label="巡检点标定文件">
        <input
          type="file"
          accept=".csv,.txt,.json,.xlsx,text/plain,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="选择巡检点标定文件"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </Field>
      {readErr && (
        <p role="alert" className="muted">
          {readErr}
        </p>
      )}
      {result?.error && (
        <p role="alert" className="muted">
          {file}：{result.error}
        </p>
      )}
      {points.length > 0 && (
        <>
          <p className="muted">
            已解析 <b>{file}</b>：<b>{points.length}</b> 个定位点
          </p>
          <Table
            heads={["定位ID", "x", "y", "类型", "姿态（水平/俯仰/变焦）"]}
            rows={points.slice(0, 10).map((p) => [
              p.externalId,
              p.x,
              p.y,
              p.kind || "—",
              p.ptz ? `${p.ptz.pan} / ${p.ptz.tilt} / ${p.ptz.zoom}` : "—",
            ])}
          />
          {points.length > 10 && (
            <p className="muted">仅预览前 10 条，导入时会写入全部 {points.length} 条。</p>
          )}
          <Field label="绑定到地图">
            <select value={targetMap} onChange={(e) => SETMAP(e.target.value)}>
              <option value="">（暂存，待点云地图就绪后再绑定）</option>
              {s.maps.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="actions">
            <Btn
              primary
              onClick={() => {
                const ok = act({
                  type: "IMPORT_POINT_CALIBRATION",
                  mapId: targetMap,
                  pending: !targetMap,
                  file,
                  // 来源机器人：只作数据归属，随标定数据一并落库
                  robotId,
                  points,
                });
                // 成功后清空预览，避免重复提交同一批点位
                if (ok) {
                  RESULT(null);
                  SETFILE("");
                }
              }}
            >
              {targetMap ? "导入并绑定到该地图" : "暂存待绑定"}
            </Btn>
            <Btn
              onClick={() => {
                RESULT(null);
                SETFILE("");
              }}
            >
              重新选择
            </Btn>
          </div>
        </>
      )}
    </Panel>
  );
}
