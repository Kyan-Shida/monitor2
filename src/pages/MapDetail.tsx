/**
 * @file MapDetail.tsx
 * @description 地图详情（内置页，挂在「地图管理」目录下）：展示单张**纯点云地图**的信息与状态，
 *              并提供一个内嵌抽屉——**地图下发**（多选设备同步）。
 *              **本页不含任何定位ID与巡检点**：采集同批产出的「巡检点标定文件」归第二个模块
 *              ——「巡检点管理 › 导入巡检点标定文件」（components/PointCalibration.tsx）——
 *              导入，两者按**定位 ID**绑定。
 * @interaction 地图列表「详情」→ `#/robots/maps/detail/:id`；深链 `?tab=sync` 直达下发抽屉，
 *              旧深链 `?tab=workbench` 会提示标定已迁至巡检点管理
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Badge, Btn, Modal, Note, Panel } from "../components/UI";
import { MapSpatialPreview } from "../components/MapSpatialPreview";
import { MapImageCanvas } from "../components/MapImageCanvas";
import { MapDispatch } from "../components/MapDispatch";
import { mapVer } from "../data/versionLabel";
import { SAMPLE_MAP_IMAGE } from "../data/sampleMap";

export function MapDetail({ id, tab }: { id?: string; tab?: string }) {
  const { s, act } = useStore();
  const m = s.maps.find((x) => x.id === id) || s.maps[0];
  /** 抽屉：空串表示关闭；深链 `?tab=sync` 可直接打开下发抽屉 */
  const [drawer, DRAWER] = useState(tab === "sync" ? "下发" : "");
  if (!m) return <Note>地图不存在，请从地图列表进入。</Note>;
  /** 旧深链 `?tab=workbench`：地图工作台已不再属于地图管理 */
  const legacyWorkbench = tab === "workbench";

  /** 下发入口：直接开抽屉 */
  const openDispatch = () => DRAWER("下发");

  /**
   * 本图的业务使用数据（真实业务只关心三件事：图里有多少活、谁在用、用得对不对）
   * - pts：本图上的巡检点（地图只是底图，点位是独立标定数据，按 mapId 关联）
   * - holders：已激活本图的设备（robot.mapId 指向本图即视为在用）
   * - stale：激活版本与本图当前版本不一致的设备——不下发就不算真正生效
   */
  const pts = s.points.filter((p) => p.mapId === m.id);
  const holders = s.robots.filter((r) => r.mapId === m.id);
  const stale = holders.filter((r) => r.mapVersion !== m.version);

  return (
    <>
      <div className="context-bar">
        <b>{m.name}</b>
        <span>
          {m.id} · {m.region} · {mapVer(m.version)}
        </span>
        <Badge>{m.syncState}</Badge>
      </div>

      {legacyWorkbench && (
        <Note>
          <b>地图工作台已下线：</b>巡检点标定归第二个模块——「巡检点管理 › 巡检点导入」；
          标定数据独立存储、与地图分开放，两者按<b>定位 ID</b>绑定。
          <Btn onClick={() => go("annotation", m.id)}>前往巡检点导入 →</Btn>
        </Note>
      )}

      {/* 身份：这张图是谁——一眼可读，不放任何技术细节 */}
      <Panel title="地图信息">
        <dl className="kv">
          <dt>地图名称</dt>
          <dd>
            <b>{m.name}</b>
          </dd>
          <dt>地图编号</dt>
          <dd>{m.id}</dd>
          <dt>所属区域</dt>
          <dd>{m.region}</dd>
          <dt>空间版本</dt>
          <dd>第 {m.version} 版</dd>
          <dt>启用状态</dt>
          <dd>
            <Badge>{m.status || "启用"}</Badge>
            <Btn
              danger={m.status !== "停用"}
              onClick={() => act({ type: "TOGGLE_MAP_STATUS", id: m.id })}
            >
              {m.status === "停用" ? "启用" : "停用"}
            </Btn>
          </dd>
          <dt>更新时间</dt>
          <dd>{m.updatedAt || "—"}</dd>
        </dl>
      </Panel>

      {/*
        可用性链路：按「建图 → 有活 → 在跑 → 跑得对」的顺序排，任一步不通这张图就干不了活。
        - 底图：没有底图就无法在图上标注巡检点（链路起点）
        - 巡检点：0 个说明本图还没标定，生成不了任何巡检任务
        - 已激活设备：0 台说明本图还没部署到机器人（刚导入属于正常状态）
        - 版本同步：逐台亮出版本，谁落后一目了然，并直接给「去更新」入口；
                    0 台不是沉默，而是提示「尚未下发给任何设备」并给下发入口
      */}
      <Panel title="使用情况">
        <dl className="kv">
          <dt>底图</dt>
          <dd>
            {m.image ? (
              "已上传"
            ) : (
              <>
                <Badge tone="amber">缺失</Badge> 无底图无法在图上标注巡检点
              </>
            )}
          </dd>
          <dt>巡检点</dt>
          <dd>
            {pts.length ? (
              <>
                {pts.length} 个
                <Btn onClick={() => go("annotation", m.id)}>巡检点管理 →</Btn>
              </>
            ) : (
              <>
                <Badge tone="amber">未标定</Badge> 本图还不能生成巡检任务
                <Btn onClick={() => go("annotation", m.id)}>去标定 →</Btn>
              </>
            )}
          </dd>
          <dt>已激活设备</dt>
          <dd>
            {holders.length
              ? `${holders.length} 台 · ${holders.map((r) => r.id).join("、")}`
              : "暂无设备激活本图"}
          </dd>
          <dt>版本同步</dt>
          <dd>
            {!holders.length ? (
              <>
                尚未下发给任何设备
                <Btn onClick={openDispatch}>下发 →</Btn>
              </>
            ) : stale.length ? (
              <>
                {stale
                  .map(
                    (r) => `${r.id} 运行 ${mapVer(r.mapVersion)}（当前 ${mapVer(m.version)}）`,
                  )
                  .join("；")}
                <Btn primary onClick={openDispatch}>去更新 →</Btn>
              </>
            ) : (
              `全部已同步（当前 ${mapVer(m.version)}）`
            )}
          </dd>
        </dl>
      </Panel>

      {/* 版本历史：只展示版本号 + 更新时间（变更明细属内部日志，不在详情页暴露） */}
      <Panel
        title="版本历史"
        extra={
          <span>
            {m.history.length} 个版本 · 当前 {mapVer(m.version)}
          </span>
        }
      >
        {m.history.length ? (
          <ol className="vlog">
            {[...m.history]
              .sort((a, b) => b.version - a.version)
              .map((h, i) => (
                <li
                  key={`${h.version}-${i}`}
                  className={h.version === m.version ? "on" : ""}
                >
                  <b>{mapVer(h.version)}</b>
                  <span>
                    {h.version === m.version && <Badge>当前</Badge>}
                  </span>
                  <time>{h.at || "—"}</time>
                </li>
              ))}
          </ol>
        ) : (
          <p className="muted">暂无版本记录</p>
        )}
      </Panel>
      <Panel title="地图预览（纯点云底图）">
        <MapSpatialPreview
          map={m}
          points={[]}
          targets={[]}
          routes={[]}
          onSelect={() => go("annotation", m.id)}
        />
      </Panel>

      {/*
        区域范围：画在全厂区 2D 底图上的闭合多边形（后台管理 › 区域配置 绘制）。
        没有任何区域画过范围时不占版面
      */}
      {(() => {
        const shaded = (s.areas || []).filter(
          (a) => (a.polygon?.length || 0) >= 3,
        );
        if (!shaded.length) return null;
        return (
          <Panel
            title="区域范围"
            extra={<span>{shaded.length} 个区域</span>}
          >
            <MapImageCanvas
              image={SAMPLE_MAP_IMAGE}
              height={380}
              hint="区域范围 · 到「后台管理 › 区域配置」调整"
              areas={shaded.map((a) => ({
                id: a.id,
                name: a.name,
                points: a.polygon!,
                closed: true,
              }))}
            />
          </Panel>
        );
      })()}

      {/* 技术存档（建图来源 / 地图文件 / 原始资料）不在地图详情展示：仅在溯源与厂商对接时查看 */}

      {drawer && (
        <Modal
          title={`${m.name} · 地图下发与机器同步`}
          wide
          onClose={() => DRAWER("")}
        >
          <MapDispatch mapId={m.id} />
        </Modal>
      )}
    </>
  );
}
