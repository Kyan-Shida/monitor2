/**
 * @file Maps.tsx
 * @description 地图管理（第一个模块）：**只管理纯点云地图文件**
 *              ——MAP-02 口径：**采集一趟、产出两件；存储两份、上传两处；模块两个、ID 一绑**。
 *              本模块负责其中的 ① <b>点云地图文件</b>：
 *              ① 地图列表（筛选 / 搜索 / 分页，展示空间版本、区域、状态、底图与下发情况）
 *              ② 「＋ 导入地图」：上传纯点云地图（**不含任何定位ID与巡检点**）
 *              ③ 地图下发与机器同步（抽屉，见 components/MapDispatch.tsx）
 *              另一件产出（**巡检点标定文件**）归第二个模块：「巡检点管理」
 *              （见 components/PointCalibration.tsx），两者按**定位 ID**绑定。
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
import { SAMPLE_MAP_FILE, SAMPLE_MAP_IMAGE } from "../data/sampleMap";
import { MAP_IMAGE_MAX_SIZE } from "../data/types";
import { areaOptions } from "../data/deviceMaster";

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
    /** 地图所属区域：既可从既有区域下拉选择，也允许用户输入新区域 */
    [region, RG] = useState("一期罐区"),
    [file, F] = useState(""),
    [cloud, C] = useState(""),
    [video, V] = useState(""),
    /** 底图（data URL） */
    [image, IMG] = useState(""),
    [importErr, ER] = useState(""),
    [note, NO] = useState(""),
    [kind, K] = useState("仅业务属性变更"),
    [pid, P] = useState("P002"),
    /** 导入地图前的二次确认开关 */
    [confirmImport, CI] = useState(false);
  const [query, Q] = useViewState("maps.query", ""),
    [regionF, RF] = useViewState("maps.filter.region", "全部"),
    [stateF, SF] = useViewState("maps.filter.state", "全部"),
    [pager, PG] = useViewState("maps.page", 1);

  /** 使用示例点云地图：一键填好底图与原始资料（**不含任何点位信息**） */
  function useSample() {
    ER("");
    if (!name.trim()) N("二期装置区示例地图");
    F(SAMPLE_MAP_FILE);
    IMG(SAMPLE_MAP_IMAGE);
    C("sample-multimodal.pcd");
    V("sample-video.mp4");
  }
  /** 二次确认通过后真正执行导入：把表单内容创建为一张「未发布」地图 */
  function doImport() {
    if (
      act({
        type: "IMPORT",
        name,
        region,
        file: file || "map-" + Date.now().toString(36) + ".map",
        image,
        cloud,
        video,
      })
    ) {
      CI(false);
      M("");
    }
  }
  /** 选择本地地图图片：读为底图（地图是纯点云，上传不携带任何点位 / 业务信息） */
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
  // 状态是派生值：未发布 = 当前版本还没下发给所有旧版本机器（新图从未下发也算）；已发布 = 已下发到位
  const states = ["全部", "未发布", "已发布"];
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
          }}
        >
          ＋ 导入地图
        </Btn>
      </div>
      <Panel
        title="地图列表"
        extra={<span>{list.length} 张</span>}
      >
        <Table
          heads={["地图名称", "所属区域", "更新时间", "地图版本", "状态", "操作"]}
          rows={rows.map((x) => [
            // 版本一致性只看"地图空间版本 + 独立标定数据版本"（地图上已无标定数据版本）

              <b>{x.name}</b>,
              x.region,
              x.updatedAt || "—",
              `V${x.version}`,
              <Badge>{x.state}</Badge>,
              <div className="actions">
                <Btn primary onClick={() => go("map-detail", x.id)}>
                  详情
                </Btn>
              </div>,
            ]
          )}
        />
        <Pager page={cur} count={list.length} size={PAGE_SIZE} onChange={PG} />
      </Panel>

      {modal === "import" && (
        <Modal
          title="导入地图"
          wide
          onClose={() => M("")}
        >
          <Field label="地图名称">
            <input
              value={name}
              placeholder="例如 二期装置区巡检地图"
              onChange={(e) => N(e.target.value)}
            />
          </Field>
          <Field label="区域">
            {/* 区域取自「后台管理」的区域主数据：只允许下拉选择，不允许手填 */}
            <select value={region} onChange={(e) => RG(e.target.value)}>
              {areaOptions(s).map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
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
              使用示例点云地图
            </Btn>
            {image && (
              <Btn
                onClick={() => {
                  IMG("");
                  F("");
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
          {image && (
            <>
              <img
                className="map-import-preview"
                src={image}
                alt="地图底图预览"
              />
            </>
          )}
          <div className="modal-actions">
            <Btn onClick={() => M("")}>取消</Btn>
            <Btn
              primary
              disabled={!image || !name.trim()}
              onClick={() => CI(true)}
            >
              导入地图
            </Btn>
          </div>
        </Modal>
      )}

      {modal === "import" && confirmImport && (
        <Modal title="确认导入地图" onClose={() => CI(false)}>
          <Table
            heads={["项目", "内容"]}
            rows={[
              ["地图名称", name || "—"],
              ["区域", region || "—"],
              ["底图", image ? "已上传" : "未上传"],
            ]}
          />
          <div className="modal-actions">
            <Btn onClick={() => CI(false)}>返回修改</Btn>
            <Btn primary onClick={doImport}>
              确认导入
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
              ? "修订地图版本"
              : "原始资料归档"
        }
        wide
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
