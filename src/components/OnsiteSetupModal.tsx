/**
 * @file OnsiteSetupModal.tsx
 * @description 「现场采集」进页前的准备弹窗：先定**执行机器人 + 机器人使用地图**，确认后才进巡检点详情
 *              （页内因此不再放这两个选择器）。
 *              防呆：离线 / 故障 / 维护的机器人不可选；地图只列该机器人已绑定的那几张，
 *              停用图与版本落后的图都会被拦下并给出原因，原因未清空时「开始采集」不可点。
 * @interaction pages/PointEdit.tsx（field 入口）、data/robotMaps.ts
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { boundMapsOf, mapBlockedReason, robotBlockedReason } from "../data/robotMaps";
import { Btn, Field, Modal } from "./UI";

export function OnsiteSetupModal({
  robotId,
  mapId,
  onClose,
  onConfirm,
}: {
  /** 进入前的机器人（深链带入 / 上次选择） */
  robotId: string;
  /** 进入前的地图（上次选择） */
  mapId: string;
  onClose: () => void;
  /** 确认：带回执行机器人与它要用的地图 */
  onConfirm: (robotId: string, mapId: string) => void;
}) {
  const { s } = useStore();
  const [rid, RID] = useState(robotId || s.robots[0]?.id || "");
  const [mid, MID] = useState(mapId);
  const r = s.robots.find((x) => x.id === rid);
  /** 只列该机器人已绑定的地图；切机器人后旧地图不适用，回落到新机器人的第一张 */
  const maps = boundMapsOf(s, r);
  const cur = maps.some((x) => x.id === mid) ? mid : maps[0]?.id || "";
  const m = maps.find((x) => x.id === cur);
  /** 防呆结论：机器人或地图任一不可用就拦下 */
  const block = robotBlockedReason(r) || (r ? mapBlockedReason(r, m) : "");

  return (
    <Modal
      title="现场采集准备"
      slim
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>取消</Btn>
          <Btn
            primary
            disabled={!!block}
            onClick={() => r && cur && onConfirm(r.id, cur)}
          >
            开始采集
          </Btn>
        </>
      }
    >
      <Field label="执行机器人" required>
        <select
          value={rid}
          onChange={(e) => {
            RID(e.target.value);
            // 地图跟着机器人走：清空后由 boundMapsOf 回落到新机器人的第一张
            MID("");
          }}
        >
          {s.robots.map((rb) => {
            const bad = robotBlockedReason(rb);
            return (
              <option key={rb.id} value={rb.id} disabled={!!bad}>
                {rb.id} · {rb.name}（{rb.state}
                {bad ? " · 不可执行" : ""}）
              </option>
            );
          })}
        </select>
      </Field>
      <Field label="机器人使用地图" required>
        <select
          value={cur}
          disabled={!maps.length}
          onChange={(e) => MID(e.target.value)}
        >
          {maps.length ? (
            maps.map((mm) => (
              <option
                key={mm.id}
                value={mm.id}
                disabled={!!r && !!mapBlockedReason(r, mm)}
              >
                {mm.name} V{mm.version}
                {mm.status === "停用" ? " · 已停用" : ""}
              </option>
            ))
          ) : (
            <option value="">未绑定地图</option>
          )}
        </select>
      </Field>
      {block && (
        <p role="alert" className="reference-upload-error">
          {block}
        </p>
      )}
    </Modal>
  );
}
