/**
 * @file MapBindPicker.tsx
 * @description 地图绑定机器狗选择器。地图下发是独立功能（见 MapDispatch），本组件**不做下发**：
 *              - picker 模式：导航 / 编辑按钮入口。列出「已绑定本图」的机器狗，单选一台后进入后续流程。
 *              - detail 模式：卡片徽章下拉入口。只读展示已绑定机器狗及版本状态，可一键跳转「地图下发」。
 * @interaction Maps.tsx（导航 / 编辑按钮、徽章下拉）
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { Btn, Note, Modal } from "./UI";
import type { MapAsset, Robot } from "../data/types";

type BindMode = "picker" | "detail";

export function MapBindPicker({
  map,
  onClose,
  mode = "picker",
  onAfter,
  onDispatch,
}: {
  map: MapAsset;
  onClose: () => void;
  mode?: BindMode;
  /** picker 模式：确认选中的机器狗 id（由上层决定跳转目标） */
  onAfter?: (robotId: string) => void;
  /** 点「前往地图下发」的回调（打开 MapDispatch 抽屉） */
  onDispatch?: () => void;
}) {
  const { s } = useStore();
  const [sel, SEL] = useState<string[]>([]);

  /** 已绑定本图的机器狗 */
  const bound = s.robots.filter((r) => r.mapId === map.id);

  /** picker 模式禁用：离线 / 故障不能用于导航或标定 */
  const unusable = (r: Robot) => r.state === "离线" || r.state === "故障";
  const outdatedCount = bound.filter((r) => r.mapVersion < map.version).length;

  /** picker 确认：把选中机器狗交给上层跳转 */
  const confirm = () => {
    if (sel.length) onAfter?.(sel[0]);
  };

  const dispatchBtn = onDispatch && (
    <Btn primary onClick={onDispatch}>
      前往地图下发
    </Btn>
  );

  return (
    <Modal
      title={mode === "picker" ? "选择机器人设备" : "机器人设备绑定详情"}
      onClose={onClose}
    >
      <div className="mbp-head">
        <Note>
          地图 <b>{map.name}</b> V{map.version}（{map.region}）
          {mode === "picker" && " · 从中选择一台执行"}
        </Note>
      </div>

      {bound.length === 0 ? (
        <div className="mbp-section">
          <div className="mbp-empty">本地图尚未绑定机器人设备，请先到「地图下发」绑定。</div>
          <div className="mbp-actions">
            <Btn onClick={onClose}>{mode === "picker" ? "取消" : "关闭"}</Btn>
            {dispatchBtn}
          </div>
        </div>
      ) : (
        <>
          <div className="mbp-section">
            <div className="mbp-section-title">
              已绑定 · {bound.length} 台
              {outdatedCount > 0 && (
                <span className="mbp-outdated"> · ⚠{outdatedCount} 台版本落后</span>
              )}
            </div>
            <div className="mbp-list">
              {bound.map((r) => {
                const synced = r.mapVersion === map.version;
                const chosen = sel.includes(r.id);
                const disabled = mode === "picker" && unusable(r);
                return mode === "picker" ? (
                  <button
                    key={r.id}
                    type="button"
                    className={
                      "mbp-row" + (chosen ? " on" : "") + (disabled ? " disabled" : "")
                    }
                    disabled={disabled}
                    onClick={() => SEL(chosen ? [] : [r.id])}
                    title={disabled ? "离线 / 故障，暂不可用" : "选择该机器人设备"}
                  >
                    <span className="mbp-check">{chosen ? "●" : "○"}</span>
                    <span className="mbp-name">🐕 {r.name}</span>
                    <span className="mbp-meta">
                      {r.state} · {r.region}
                    </span>
                    <span className={"mbp-version" + (synced ? " ok" : " lag")}>
                      V{r.mapVersion}
                      {synced ? " ✓最新" : ` · 落后 V${map.version}`}
                    </span>
                  </button>
                ) : (
                  <div
                    key={r.id}
                    className={"mbp-row static" + (synced ? "" : " outdated")}
                  >
                    <span className="mbp-check">🐕</span>
                    <span className="mbp-name">{r.name}</span>
                    <span className="mbp-meta">
                      {r.state} · {r.region}
                    </span>
                    <span className={"mbp-version" + (synced ? " ok" : " lag")}>
                      V{r.mapVersion}
                      {synced ? " ✓最新" : ` · 落后 V${map.version}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mbp-actions">
            <Btn onClick={onClose}>{mode === "picker" ? "取消" : "关闭"}</Btn>
            {mode === "picker" ? (
              <Btn primary disabled={!sel.length} onClick={confirm}>
                确认进入
              </Btn>
            ) : (
              dispatchBtn
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
