/**
 * @file MapDetail.tsx
 * @description 地图详情（内置页，挂在「地图管理」目录下）：展示单张**纯点云地图**的信息与状态，
 *              并提供一个内嵌抽屉——**地图下发**（多选设备同步）。
 *              **本页不含任何定位ID与巡检点**：采集同批产出的「巡检点标定文件」归第二个模块
 *              ——「巡检点管理 › 导入巡检点标定文件」（components/PointCalibration.tsx）——
 *              导入，两者按**定位 ID**绑定。
 * @layout 左右分栏：左栏放信息类面板（信息 / 使用情况 / 版本历史 / 区域范围），
 *         右栏放地图预览（sticky 常驻）——一屏看全，不用上下拉动
 * @interaction 地图列表「详情」→ `#/robots/maps/detail/:id`；深链 `?tab=sync` 直达下发抽屉，
 *              旧深链 `?tab=workbench` 会提示标定已迁至巡检点管理
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Badge, Btn, Drawer, Note, Panel } from "../components/UI";
import { MapSpatialPreview } from "../components/MapSpatialPreview";
import { MapImageCanvas } from "../components/MapImageCanvas";
import { MapDispatch } from "../components/MapDispatch";
import { mapVer } from "../data/versionLabel";
import { mapNo, fmtDateTime } from "../data/types";
import { SAMPLE_MAP_IMAGE } from "../data/sampleMap";

export function MapDetail({ id, tab }: { id?: string; tab?: string }) {
  const { s } = useStore();
  const m = s.maps.find((x) => x.id === id) || s.maps[0];
  /** 抽屉：空串表示关闭；深链 `?tab=sync` 可直接打开下发抽屉 */
  const [drawer, DRAWER] = useState(tab === "sync" ? "下发" : "");
  if (!m) return <Note>地图不存在，请从地图列表进入。</Note>;
  /** 旧深链 `?tab=workbench`：地图工作台已不再属于地图管理 */
  const legacyWorkbench = tab === "workbench";

  /**
   * 本图的业务使用数据（真实业务只关心两件事：谁在用、用得对不对）
   * - holders：已激活本图的设备（robot.mapId 指向本图即视为在用）
   * - stale：激活版本与本图当前版本不一致的设备——不下发就不算真正生效
   * @description 「巡检点 / 标定点」不再在地图详情展示：标定数据独立放「巡检点管理」，
   *              地图详情只讲纯点云底图本身的使用情况
   */
  const holders = s.robots.filter((r) => r.mapId === m.id);
  const stale = holders.filter((r) => r.mapVersion !== m.version);

  return (
    <>
      {legacyWorkbench && (
        <Note>
          <b>地图工作台已下线：</b>巡检点标定归第二个模块——「巡检点管理 › 巡检点导入」；
          标定数据独立存储、与地图分开放，两者按<b>定位 ID</b>绑定。
          <Btn onClick={() => go("annotation", m.id)}>前往巡检点导入 →</Btn>
        </Note>
      )}

      {/* 左右分栏：左信息 / 右地图，两栏各自内聚，整页一屏可读 */}
      <div className="map-detail-split">
        <div className="map-detail-left">
          {/* 身份：这张图是谁——一眼可读，不放任何技术细节 */}
          <Panel title="地图信息">
            <dl className="kv">
              <dt>地图名称</dt>
              <dd>
                <b>{m.name}</b>
              </dd>
              <dt>地图编号</dt>
              <dd>{mapNo(m.id)}</dd>
              <dt>所属区域</dt>
              <dd>{m.region}</dd>
              <dt>空间版本</dt>
              <dd>第 {m.version} 版</dd>
              {/* 启停已收敛到地图列表的开关（带二次确认），详情页不再重复入口 */}
              <dt>更新时间</dt>
              <dd>{fmtDateTime(m.updatedAt)}</dd>
            </dl>
          </Panel>

          {/*
            可用性链路：按「建图 → 在跑 → 跑得对」的顺序排，任一步不通这张图就干不了活。
            - 底图：没有底图就无法在图上标注巡检点（链路起点）
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
              <dt>已激活设备</dt>
              <dd>
                {holders.length
                  ? `${holders.length} 台 · ${holders.map((r) => r.id).join("、")}`
                  : "暂无设备激活本图"}
              </dd>
              <dt>版本同步</dt>
              <dd>
                {!holders.length
                  ? "尚未下发给任何设备"
                  : stale.length
                    ? stale
                        .map(
                          (r) =>
                            `${r.id} 运行 ${mapVer(r.mapVersion)}（当前 ${mapVer(m.version)}）`,
                        )
                        .join("；")
                    : `全部已同步（当前 ${mapVer(m.version)}）`}
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
                      <time>{fmtDateTime(h.at)}</time>
                    </li>
                  ))}
              </ol>
            ) : (
              <p className="muted">暂无版本记录</p>
            )}
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
              <Panel title="区域范围" extra={<span>{shaded.length} 个区域</span>}>
                <MapImageCanvas
                  image={SAMPLE_MAP_IMAGE}
                  height={300}
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
        </div>

        {/* 右栏：地图本体。sticky 常驻，翻左栏信息时地图始终在视口里，不用上下拉动 */}
        <div className="map-detail-right">
          <Panel
            title="地图（纯点云底图）"
            extra={
              <span>
                {mapNo(m.id)} · {mapVer(m.version)}
              </span>
            }
          >
            <MapSpatialPreview
              map={m}
              points={[]}
              targets={[]}
              routes={[]}
              onSelect={() => go("annotation", m.id)}
            />
          </Panel>
        </div>
      </div>

      {/* 技术存档（建图来源 / 地图文件 / 原始资料）不在地图详情展示：仅在溯源与厂商对接时查看 */}

      {/* 地图下发：抽屉（多选设备批量下发 + 本图历史下发记录） */}
      {drawer && (
        <Drawer
          title="地图下发"
          subtitle={`${m.name} · ${mapNo(m.id)} · 目标版本 ${mapVer(m.version)}`}
          onClose={() => DRAWER("")}
        >
          <MapDispatch mapId={m.id} />
        </Drawer>
      )}
    </>
  );
}
