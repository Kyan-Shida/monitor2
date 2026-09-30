/**
 * @file Maps.tsx
 * @description 地图管理：**只保留三件事** ——
 *              ① 地图列表（筛选 / 搜索 / 分页，展示版本、区域、状态、内容与下发情况）
 *              ② 地图工作台（抽屉，见 components/MapWorkbench.tsx）
 *              ③ 地图下发与机器同步（抽屉，见 components/MapDispatch.tsx）
 *              点「详情」进入内置页 pages/MapDetail.tsx（`#/robots/maps/detail/:id`）。
 * @interaction 详情页由 App.tsx 按路由 `map-detail` 渲染；本文件仅负责列表与旧深链兼容分支
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go, useViewState } from "../data/navigation";
import {
  Btn,
  Badge,
  Panel,
  Table,
  Field,
  Note,
  Modal,
} from "../components/UI";
import { Pager } from "../components/Business";
import { MapOnboarding } from "../components/MapOnboarding";
import { MapSurveyPanel } from "../components/MapSurveyPanel";
import {
  SAMPLE_MAP_FILE,
  SAMPLE_MAP_IMAGE,
  SAMPLE_MAP_TARGETS,
  SAMPLE_MAP_TRACK,
} from "../data/sampleMap";
import { MAP_IMAGE_MAX_SIZE } from "../data/types";

/**
 * 旧深链保留分支（不在工具栏暴露，仅由 URL `?tab=` 进入）
 * @description 地图详情与机器人同步已迁到内置页 / 抽屉；
 *              此处仅保留历史深链与"后置能力"（上线工作台、建图与坐标、原始资料、变化管理）不被断链
 */
const LEGACY_TABS: Record<string, string> = {
  workflow: "地图上线工作台（旧版）",
  survey: "建图与坐标（后置能力）",
  archive: "原始资料",
  changes: "地图 / 点位变化管理",
};
/** 地图列表每页条数（原型固定值，与其余列表页一致的操作方式） */
const PAGE_SIZE = 8;

export function Maps({ tab = "list", id }: { tab?: string; id?: string }) {
  const { s, act } = useStore();
  const m = s.maps.find((x) => x.id === id) || s.maps[0];
  const [modal, M] = useState(""),
    [name, N] = useState("罐区补充采集地图"),
    [file, F] = useState(""),
    [cloud, C] = useState(""),
    [video, V] = useState(""),
    /** 底图（data URL） */
    [image, IMG] = useState(""),
    /** 随文件带入的定位ID点 */
    [targets, TG] = useState<{ id: string; x: number; y: number; kind: string }[]>(
      [],
    ),
    /** 随文件带入的轨迹采样点 */
    [track, TK] = useState<{ x: number; y: number; kind: string; seq: number }[]>(
      [],
    ),
    [importErr, ER] = useState(""),
    [note, NO] = useState(""),
    [kind, K] = useState("仅业务属性变更"),
    [pid, P] = useState("P002");
  const [query, Q] = useViewState("maps.query", ""),
    [regionF, RF] = useViewState("maps.filter.region", "全部"),
    [stateF, SF] = useViewState("maps.filter.state", "全部"),
    [pager, PG] = useViewState("maps.page", 1);

  /** 使用示例地图：一键填好底图 + 定位ID + 轨迹 + 原始资料 */
  function useSample() {
    ER("");
    if (!name.trim()) N("二期装置区示例地图");
    F(SAMPLE_MAP_FILE);
    IMG(SAMPLE_MAP_IMAGE);
    TG(SAMPLE_MAP_TARGETS);
    TK(SAMPLE_MAP_TRACK);
    C("sample-multimodal.pcd");
    V("sample-video.mp4");
  }
  /** 选择本地地图图片：读为底图，并（原型里）随文件补入示例定位ID与轨迹 */
  async function pickImage(file?: File) {
    ER("");
    if (!file) return;
    if (!file.type.startsWith("image/"))
      return ER("请选择图片文件（JPG / PNG / WebP）。");
    if (file.size > MAP_IMAGE_MAX_SIZE)
      return ER(
        `图片过大（建议 ${MAP_IMAGE_MAX_SIZE / 1024 / 1024} MB 以内），请压缩后再上传。`,
      );
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(new Error());
        r.readAsDataURL(file);
      });
      IMG(dataUrl);
      F(file.name);
      if (!name.trim()) N(file.name.replace(/\.[^.]+$/, ""));
      // 原型无法从图片里解析定位ID/轨迹：按示例点位自动补齐（可在「地图工作台」继续新增 / 删除）
      TG(SAMPLE_MAP_TARGETS);
      TK(SAMPLE_MAP_TRACK);
    } catch {
      ER("图片无法读取，请换一张有效图片后重试。");
    }
  }
  const legacy = LEGACY_TABS[tab];
  if (legacy)
    return (
      <>
        <div className="context-bar">
          <b>{legacy}</b>
          <span>该视图已不再作为地图管理主入口，仅为兼容历史深链保留</span>
          <Btn onClick={() => go("maps")}>← 返回地图列表</Btn>
          <Btn primary onClick={() => go("map-detail", m.id)}>
            打开地图详情
          </Btn>
        </div>
        {tab === "workflow" && <MapOnboarding key={m.id} mapId={m.id} />}
        {tab === "survey" && <MapSurveyPanel key={m.id} mapId={m.id} />}
        {tab === "archive" && (
          <Panel title="采集批次原始资料 · 保留原文件">
            <Note>
              采集批次 {m.batch} · {m.source}。此原型登记文件元信息，不上传真实大文件。
            </Note>
            <Table
              heads={["类型", "文件名", "校验", "归档状态"]}
              rows={[
                [
                  "激光 + 视觉点云",
                  m.cloud || "未提供",
                  m.cloud ? m.checksum : "待校验",
                  m.cloud ? "已留档" : "缺失",
                ],
                [
                  "原始建图视频",
                  m.video || "未提供",
                  m.video ? m.checksum : "待校验",
                  m.video ? "已留档" : "缺失",
                ],
                ["生成地图", m.file, m.checksum, "独立版本存储"],
              ]}
            />
            <Btn
              onClick={() => {
                C(m.cloud);
                V(m.video);
                M("archive");
              }}
            >
              补充归档资料
            </Btn>
          </Panel>
        )}
        {tab === "changes" && (
          <Panel
            title="现场变化与影响处理"
            extra={
              <Btn primary onClick={() => M("change")}>
                登记变化
              </Btn>
            }
          >
            <Table
              heads={["编号 / 来源", "类型 / 证据", "状态", "影响", "操作"]}
              rows={s.changes
                .filter((c) => c.mapId === m.id)
                .map((c) => [
                  <>
                    {c.id}
                    <small>{c.source}</small>
                  </>,
                  <>
                    {c.type}
                    <small>{c.note}</small>
                  </>,
                  <Badge>{c.state}</Badge>,
                  c.pointId,
                  <div className="actions">
                    <Btn
                      disabled={c.state !== "待确认"}
                      onClick={() => act({ type: "CHANGE_CONFIRM", id: c.id })}
                    >
                      确认影响
                    </Btn>
                    <Btn
                      disabled={c.state !== "维护中"}
                      onClick={() => {
                        P(c.id);
                        F("");
                        M("revision");
                      }}
                    >
                      提交修订
                    </Btn>
                    <Btn
                      disabled={c.state !== "待同步"}
                      onClick={() => act({ type: "CHANGE_CLOSE", id: c.id })}
                    >
                      核对并关闭
                    </Btn>
                  </div>,
                ])}
            />
          </Panel>
        )}
        {changeModals()}
      </>
    );

  const regions = ["全部", ...new Set(s.maps.map((x) => x.region))];
  // 平台不区分试验版 / 正式版：状态只有 草稿（内容未定版）与 已发布（已定版）
  const states = ["全部", "草稿", "已发布"];
  const kw = query.trim();
  const list = s.maps.filter(
    (x) =>
      (!kw || (x.name + x.id + x.region).includes(kw)) &&
      (regionF === "全部" || x.region === regionF) &&
      (stateF === "全部" || x.state === stateF),
  );
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const cur = Math.min(pager || 1, pages);
  const rows = list.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);

  return (
    <>
      <div className="toolbar">
        <div className="actions">
          <label className="inline-filter">
            <span>区域：</span>
            <select value={regionF} onChange={(e) => RF(e.target.value)}>
              {regions.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="inline-filter">
            <span>状态：</span>
            <select value={stateF} onChange={(e) => SF(e.target.value)}>
              {states.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <input
            placeholder="搜索地图名称 / 编号 / 区域"
            value={query}
            onChange={(e) => Q(e.target.value)}
          />
        </div>
        <Btn
          primary
          onClick={() => {
            M("import");
            ER("");
            IMG("");
            F("");
            TG([]);
            TK([]);
          }}
        >
          ＋ 导入地图
        </Btn>
      </div>
      <Panel
        title="地图列表"
        extra={<span>{list.length} 张</span>}
      >
        <p className="muted">
          地图随文件自带定位ID与轨迹；平台可在「地图工作台」继续新增。发布后进入「地图下发」同步给设备。
        </p>
        <Table
          heads={[
            "地图 / 区域",
            "版本",
            "内容",
            "下发情况",
            "状态",
            "操作",
          ]}
          rows={rows.map((x) => {
            const pts = s.points.filter((p) => p.mapId === x.id);
            const added = x.targets.filter((t) => t.source === "平台新增").length;
            const track = (s.trackSamples || []).filter((t) => t.mapId === x.id)
              .length;
            const aligned = s.robots.filter(
              (r) =>
                r.mapId === x.id &&
                r.mapVersion === x.version &&
                r.pointSet === x.pointSet,
            ).length;
            return [
              <b>
                {x.name}
                <small>
                  {x.id} · {x.region}
                </small>
              </b>,
              <>
                m{x.version} / p{x.pointSet}
                <small>更新 {x.history[0] || "—"}</small>
              </>,
              <>
                定位ID {x.targets.length - added} · 新增 {added}
                <small>
                  轨迹 {track} · 业务点位 {pts.length}
                </small>
              </>,
              <>
                {aligned} / {s.robots.length} 台版本一致
                <small>
                  {x.state === "草稿" ? "内容未定版（下发时自动定版）" : "已定版，可下发"}
                </small>
              </>,
              <Badge>{x.state}</Badge>,
              <div className="actions">
                <Btn primary onClick={() => go("map-detail", x.id)}>
                  详情
                </Btn>
              </div>,
            ];
          })}
        />
        <Pager page={cur} count={list.length} size={PAGE_SIZE} onChange={PG} />
      </Panel>

      {modal === "import" && (
        <Modal
          title="导入地图"
          drawer
          drawerWidth={780}
          onClose={() => M("")}
        >
          <Note>
            上传一张<b>地图图片</b>即可完成导入：图片随文件带出的<b>定位ID</b>与
            <b>轨迹</b>会一并带入，导入后可在「地图工作台」查看与继续新增，再到
            「巡检点管理」绑定巡检点。
          </Note>
          <Field label="地图名称">
            <input
              value={name}
              placeholder="例如 二期装置区巡检地图"
              onChange={(e) => N(e.target.value)}
            />
          </Field>
          <Field label="区域">
            <input value="一期罐区" readOnly />
          </Field>
          <Field label="地图图片（底图）">
            <input
              type="file"
              accept="image/*"
              aria-label="上传地图图片"
              onChange={(e) => {
                void pickImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </Field>
          <div className="actions">
            <Btn primary onClick={useSample}>
              使用示例地图（含定位ID与轨迹）
            </Btn>
            {image && (
              <Btn
                onClick={() => {
                  IMG("");
                  F("");
                  TG([]);
                  TK([]);
                }}
              >
                清除
              </Btn>
            )}
          </div>
          {importErr && (
            <p role="alert" className="muted">
              {importErr}
            </p>
          )}
          {image ? (
            <>
              <img
                className="map-import-preview"
                src={image}
                alt="地图底图预览"
              />
              <p className="muted">
                已就绪：<b>{targets.length}</b> 个定位ID · <b>{track.length}</b>{" "}
                个轨迹采样点 · 底图已上传
              </p>
            </>
          ) : (
            <p className="muted">
              {file || "尚未选择图片"} —— 选择图片或点「使用示例地图」。
            </p>
          )}
          <details className="map-import-extra">
            <summary>补充原始资料（可后补，不填也能导入）</summary>
            <Field label="原始点云">
              <input value={cloud} onChange={(e) => C(e.target.value)} />
            </Field>
            <Field label="原始视频">
              <input value={video} onChange={(e) => V(e.target.value)} />
            </Field>
            <Note>缺少资料允许暂存草稿，但不能正式发布。</Note>
          </details>
          <div className="modal-actions">
            <Btn onClick={() => M("")}>取消</Btn>
            <Btn
              primary
              disabled={!image || !name.trim()}
              onClick={() => {
                if (
                  act({
                    type: "IMPORT",
                    name,
                    file: file || "map-" + Date.now().toString(36) + ".map",
                    image,
                    targets,
                    track,
                    cloud,
                    video,
                  })
                )
                  M("");
              }}
            >
              导入地图
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );

  /** 变化管理（旧深链分支）用到的登记 / 修订 / 归档弹窗 */
  function changeModals() {
    const pts = s.points.filter((p) => p.mapId === m.id);
    return modal ? (
      <Modal
        title={
          modal === "change"
            ? "登记现场变化"
            : modal === "revision"
              ? "修订地图与点位版本"
              : "原始资料归档"
        }
        drawer
        drawerWidth={780}
        onClose={() => M("")}
      >
        {modal === "change" ? (
          <>
            <Field label="变化类型">
              <select value={kind} onChange={(e) => K(e.target.value)}>
                <option>仅业务属性变更</option>
                <option>目标移动/新增/移除</option>
                <option>通道/结构变化</option>
              </select>
            </Field>
            <Field label="关联点位">
              <select value={pid} onChange={(e) => P(e.target.value)}>
                {pts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="变化说明与证据">
              <textarea value={note} onChange={(e) => NO(e.target.value)} />
            </Field>
            <Btn
              primary
              onClick={() => {
                if (
                  act({
                    type: "CHANGE_ADD",
                    mapId: m.id,
                    pointId: pid,
                    kind,
                    reason: note,
                  })
                )
                  M("");
              }}
            >
              登记
            </Btn>
          </>
        ) : modal === "revision" ? (
          <>
            <Field label="外部修订地图文件">
              <input
                type="file"
                onChange={(e) => F(e.target.files?.[0]?.name || "")}
              />
            </Field>
            <Btn onClick={() => F("revised-map-demo.map")}>
              使用修订地图示例
            </Btn>
            <p>{file}</p>
            <Note>
              提交后重新发布试验版本、同步验证、正式发布，再核对区域机器人完成变化关闭。
            </Note>
            <Btn
              primary
              onClick={() => {
                if (act({ type: "CHANGE_REVISION", id: pid, file })) M("");
              }}
            >
              保存修订版本
            </Btn>
          </>
        ) : (
          <>
            <Field label="点云归档文件">
              <input value={cloud} onChange={(e) => C(e.target.value)} />
            </Field>
            <Field label="视频归档文件">
              <input value={video} onChange={(e) => V(e.target.value)} />
            </Field>
            <Btn
              primary
              onClick={() => {
                if (act({ type: "ARCHIVE", id: m.id, cloud, video })) M("");
              }}
            >
              保存归档
            </Btn>
          </>
        )}
      </Modal>
    ) : null;
  }
}
