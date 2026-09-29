import { useState } from "react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Btn, Badge, Panel, Table, Note } from "../components/UI";
import { MapCanvas } from "../components/MapCanvas";
export function Operations({ page, id }: { page: string; id?: string }) {
  const { s } = useStore();
  const [q, Q] = useState("");
  const r = s.robots.find((r) => r.id === id) || s.robots[0];
  if (page === "robots")
    return (
      <>
        <div className="metric-strip">
          {["执行中", "空闲", "充电", "离线"].map((x) => (
            <div key={x}>
              <span>{x}</span>
              <strong>{s.robots.filter((r) => r.state === x).length}</strong>
            </div>
          ))}
        </div>
        <Panel
          title="机器人资源"
          extra={
            <input
              placeholder="搜索机器人 / 区域"
              value={q}
              onChange={(e) => Q(e.target.value)}
            />
          }
        >
          <Table
            heads={[
              "机器人",
              "服务区域",
              "状态",
              "电量",
              "能力",
              "激活版本",
              "当前任务",
              "操作",
            ]}
            rows={s.robots
              .filter((r) => (r.name + r.region + r.id).includes(q))
              .map((r) => [
                <b>
                  {r.name}
                  <small>{r.id} · 四足机器人</small>
                </b>,
                r.region,
                <Badge>{r.state}</Badge>,
                <>
                  <progress max={100} value={r.battery} />
                  {r.battery}%
                </>,
                r.capabilities.join(" / "),
                `m${r.mapVersion} / p${r.pointSet}`,
                r.current || "无",
                <div className="actions">
                  <Btn onClick={() => go("robot", r.id)}>详情</Btn>
                  <Btn onClick={() => go("manual", r.id)}>遥控台</Btn>
                </div>,
              ])}
          />
        </Panel>
      </>
    );
  if (page === "robot")
    return (
      <>
        <div className="context-bar">
          <select value={r.id} onChange={(e) => go("robot", e.target.value)}>
            {s.robots.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <Badge>{r.state}</Badge>
          <Btn primary onClick={() => go("manual", r.id)}>
            操作 / 遥控台
          </Btn>
          <Btn onClick={() => go("queue")}>任务队列</Btn>
        </div>
        <div className="grid two">
          <Panel title="位置与地图">
            <MapCanvas
              points={s.points.filter((p) => p.mapId === r.mapId)}
              robots={[r]}
            />
          </Panel>
          <Panel title="机器人档案与实时状态">
            <dl>
              <dt>编号 / 产品</dt>
              <dd>{r.id} · 四足巡检机器人</dd>
              <dt>服务范围</dt>
              <dd>{r.region}</dd>
              <dt>电量</dt>
              <dd>{r.battery}%</dd>
              <dt>网络</dt>
              <dd>{r.state === "离线" ? "离线" : "在线 · 心跳正常（Mock）"}</dd>
              <dt>当前任务</dt>
              <dd>{r.current || "无"}</dd>
              <dt>激活版本</dt>
              <dd>
                {r.mapId} m{r.mapVersion}/p{r.pointSet}
              </dd>
              <dt>能力</dt>
              <dd>{r.capabilities.join(" / ")}</dd>
            </dl>
            <Btn onClick={() => go("maps", r.mapId, "sync")}>查看同步记录</Btn>
          </Panel>
        </div>
        <Panel title="关键组件">
          <Table
            heads={["组件", "状态", "业务影响"]}
            rows={[
              "导航",
              "激光雷达",
              "可见光相机",
              "双光云台",
              "气体传感器",
            ].map((x) => [x, <Badge>正常</Badge>, "已映射到可用能力"])}
          />
        </Panel>
      </>
    );
  if (page === "health")
    return (
      <Panel title="机器人健康摘要">
        <Table
          heads={["机器人", "组件 / 能力", "健康状态", "诊断信息", "操作"]}
          rows={s.robots.flatMap((r) =>
            ["电池", "导航与避障", "视觉目标识别"].map((c) => [
              r.id,
              c,
              <Badge>
                {c === "电池" && r.battery < 25 ? "低电量" : "正常"}
              </Badge>,
              c === "电池"
                ? `${r.battery}% · 低于25%禁止调度`
                : "当前可用 · Mock 状态",
              <Btn onClick={() => go("robot", r.id)}>查看机器人</Btn>,
            ]),
          )}
        />
      </Panel>
    );
  if (page === "calendar")
    return (
      <>
        <div className="toolbar">
          <b>2026 年 9 月 21 日 — 27 日</b>
          <Btn primary onClick={() => go("quick")}>
            ＋ 创建临时巡检
          </Btn>
        </div>
        <div className="calendar">
          {[
            "周一 21",
            "周二 22",
            "周三 23",
            "周四 24",
            "周五 25",
            "周六 26",
            "周日 27",
          ].map((d, i) => (
            <div key={d}>
              <h3>{d}</h3>
              {i === 1
                ? s.tasks.map((t) => (
                    <button key={t.id} onClick={() => go("tasks", t.id)}>
                      {t.name}
                      <small>{t.state}</small>
                    </button>
                  ))
                : s.plans.map((p) => (
                    <button key={p.id} onClick={() => go("plan-edit", p.id)}>
                      {p.time} {p.name}
                      <small>计划 · 尚未生成任务</small>
                    </button>
                  ))}
            </div>
          ))}
        </div>
      </>
    );
  return (
    <>
      <div className="metric-strip">
        {[
          ["在线机器人", s.robots.filter((r) => r.state !== "离线").length],
          ["执行中任务", s.tasks.filter((t) => t.state === "执行中").length],
          ["待调度任务", s.tasks.filter((t) => t.state === "待调度").length],
          ["待处理告警", s.alarms.filter((a) => a.state !== "已关闭").length],
        ].map(([n, v]) => (
          <div key={n}>
            <span>{n}</span>
            <strong>{v}</strong>
          </div>
        ))}
      </div>
      <div className="grid overview-layout">
        <Panel
          title="一期罐区运行态势"
          extra={<Btn onClick={() => go("maps")}>地图管理 →</Btn>}
        >
          <MapCanvas
            points={s.points}
            robots={s.robots.filter((r) => r.mapId === "MAP-A03")}
          />
        </Panel>
        <Panel title="值班待办" extra={<Badge>异常优先</Badge>}>
          {s.alarms
            .filter((a) => a.state !== "已关闭")
            .map((a) => (
              <button
                className="alert-row"
                key={a.id}
                onClick={() => go("alarm", a.id)}
              >
                <Badge>{a.state}</Badge>
                <b>{a.name}</b>
                <small>{a.time}</small>
              </button>
            ))}
          {s.robots
            .filter(
              (r) =>
                r.region === s.maps[0].region &&
                (r.mapId !== s.maps[0].id ||
                  r.mapVersion !== s.maps[0].version ||
                  r.pointSet !== s.maps[0].pointSet),
            )
            .map((r) => (
              <Note key={r.id}>
                {r.id} 地图版本待同步。
                <Btn onClick={() => go("maps", s.maps[0].id, "sync")}>
                  安排维护
                </Btn>
              </Note>
            ))}
          <h4>业务流程演示入口</h4>
          <div className="guide-links">
            <Btn onClick={() => go("maps")}>01 地图 → 标注 → 同步</Btn>
            <Btn onClick={() => go("templates")}>02 模板 → 调度 → 执行</Btn>
            <Btn onClick={() => go("alarms")}>03 异常 → 复查 → 关闭</Btn>
            <Btn onClick={() => go("manual", "R01")}>
              04 接管 → 遥控 → 恢复
            </Btn>
          </div>
        </Panel>
      </div>
      <Panel
        title="实时任务"
        extra={<Btn onClick={() => go("dispatch")}>进入调度工作台 →</Btn>}
      >
        <Table
          heads={["任务", "机器人", "自主阶段", "进度", "状态", "操作"]}
          rows={s.tasks.map((t) => [
            t.name,
            t.robotId || "未分配",
            t.state === "执行中" ? "自主寻址 / 目标识别" : "—",
            `${t.done.length}/${t.items.length}`,
            <Badge>{t.state}</Badge>,
            <Btn onClick={() => go("execution", t.id)}>监控</Btn>,
          ])}
        />
      </Panel>
    </>
  );
}
