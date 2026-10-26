import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "./seed";
import { transition as run } from "./engine";
import type { State, Tenant } from "./types";

const admin = (): State => seed();
const curTenantOf = (s: State) => s.tenants!.find((t) => t.id === s.tenantId)!;
const otherTenantOf = (s: State) =>
  s.tenants!.find((t) => t.id !== s.tenantId)!;

test("新增租户：名称与编码必填、编码 2–6 位大写字母数字且自动大写", () => {
  const s = admin();
  assert.throws(
    () => run(s, { type: "ADD_TENANT", tenant: { id: "", name: "", code: "HN" } }),
    /租户名称/,
  );
  assert.throws(
    () =>
      run(s, {
        type: "ADD_TENANT",
        tenant: { id: "", name: "华南石化", code: "" },
      }),
    /租户编码/,
  );
  assert.throws(
    () =>
      run(s, {
        type: "ADD_TENANT",
        tenant: { id: "", name: "华南石化", code: "H" },
      }),
    /2–6 位/,
  );
  assert.throws(
    () =>
      run(s, {
        type: "ADD_TENANT",
        tenant: { id: "", name: "华南石化", code: "华南" },
      }),
    /2–6 位/,
  );
  const added = run(s, {
    type: "ADD_TENANT",
    tenant: { id: "", name: "华南石化", code: "hn", status: "启用" },
  });
  const t = added.tenants!.find((x) => x.name === "华南石化")!;
  assert.equal(t.code, "HN");
  assert.equal(t.status, "启用");
  assert.ok(t.updatedAt, "新增租户应写更新时间");
  // 名称 / 编码各自唯一
  assert.throws(
    () =>
      run(added, {
        type: "ADD_TENANT",
        tenant: { id: "", name: "华南石化", code: "SC" },
      }),
    /同名/,
  );
  assert.throws(
    () =>
      run(added, {
        type: "ADD_TENANT",
        tenant: { id: "", name: "西南炼化", code: "hn" },
      }),
    /相同编码/,
  );
});

test("修改租户：id 不变、名称可改、编码仍唯一", () => {
  const s = admin();
  const other = otherTenantOf(s);
  const renamed = run(s, {
    type: "UPDATE_TENANT",
    tenant: { ...other, name: "西北管道" } as Tenant,
  });
  const hit = renamed.tenants!.find((t) => t.id === other.id)!;
  assert.equal(hit.id, other.id);
  assert.equal(hit.name, "西北管道");
  assert.throws(
    () =>
      run(s, {
        type: "UPDATE_TENANT",
        tenant: { ...other, name: curTenantOf(s).name },
      }),
    /同名/,
  );
  assert.throws(
    () =>
      run(s, {
        type: "UPDATE_TENANT",
        tenant: { ...other, code: curTenantOf(s).code },
      }),
    /相同编码/,
  );
});

test("停用校验：当前正在使用的租户不可停用，其余可停用后切回启用", () => {
  const s = admin();
  const cur = curTenantOf(s);
  assert.throws(
    () =>
      run(s, {
        type: "UPDATE_TENANT",
        tenant: { ...cur, status: "停用" },
      }),
    /当前正在使用的租户不能停用/,
  );
  const other = otherTenantOf(s);
  const off = run(s, {
    type: "UPDATE_TENANT",
    tenant: { ...other, status: "停用" },
  });
  assert.equal(off.tenants!.find((t) => t.id === other.id)!.status, "停用");
  // 停用后可以重新启用
  const back = run(off, {
    type: "UPDATE_TENANT",
    tenant: { ...off.tenants!.find((t) => t.id === other.id)!, status: "启用" },
  });
  assert.equal(back.tenants!.find((t) => t.id === other.id)!.status, "启用");
});

test("停用校验：至少要保留一个启用状态的租户", () => {
  const s = admin();
  const other = otherTenantOf(s);
  // 模拟异常数据：当前租户指向一个已停用租户，此时再停用唯一启用租户应被拒
  const broken: State = {
    ...s,
    tenantId: other.id,
    tenants: s.tenants!.map((t) => ({ ...t, status: "停用" })),
  };
  const alive = broken.tenants!.find((t) => t.id === other.id)!;
  // 先把它改回启用（当前租户允许启用），再把另一个停用 → 至少保留一个
  const half: State = {
    ...broken,
    tenants: broken.tenants!.map((t) =>
      t.id === alive.id ? { ...t, status: "启用" } : t,
    ),
  };
  assert.throws(
    () =>
      run(half, {
        type: "UPDATE_TENANT",
        tenant: { ...half.tenants!.find((t) => t.id === alive.id)!, status: "停用" },
      }),
    /当前正在使用的租户不能停用/,
  );
  const empty: State = { ...half, tenantId: "T-NONE" };
  assert.throws(
    () =>
      run(empty, {
        type: "UPDATE_TENANT",
        tenant: { ...empty.tenants!.find((t) => t.id === alive.id)!, status: "停用" },
      }),
    /至少要保留一个启用状态的租户/,
  );
});

test("删除租户：当前租户不可删、至少留一个，删后编码可复用", () => {
  const s = admin();
  const cur = curTenantOf(s);
  const other = otherTenantOf(s);
  assert.throws(
    () => run(s, { type: "DELETE_TENANT", id: cur.id }),
    /当前正在使用的租户不能删除/,
  );
  const gone = run(s, { type: "DELETE_TENANT", id: other.id });
  assert.equal(gone.tenants!.some((t) => t.id === other.id), false);
  assert.equal(gone.tenants!.length, s.tenants!.length - 1);
  // 只剩一个租户时不能删空（当前租户指向不存在的 id，先绕过「当前租户」那条）
  const single: State = { ...s, tenants: [cur], tenantId: "T-NONE" };
  assert.throws(
    () => run(single, { type: "DELETE_TENANT", id: cur.id }),
    /至少要保留一个租户/,
  );
  // 编码随租户一起释放，可重新开通
  const again = run(gone, {
    type: "ADD_TENANT",
    tenant: { id: "", name: "西部管道二期", code: other.code, status: "启用" },
  });
  assert.ok(again.tenants!.some((t) => t.code === other.code && t.id !== other.id));
});

test("租户管理仅管理员可维护，且清单缺失时给出明确报错", () => {
  const s = admin();
  assert.throws(
    () => run(s, { type: "UPDATE_TENANT", tenant: { ...otherTenantOf(s), id: "T-X" } }),
    /租户不存在/,
  );
  const user = seed();
  user.roleId = "user";
  assert.throws(
    () => run(user, { type: "ADD_TENANT", tenant: { id: "", name: "新租户", code: "NEW" } }),
    /仅管理员/,
  );
  assert.throws(
    () =>
      run(user, {
        type: "UPDATE_TENANT",
        tenant: { ...otherTenantOf(user), name: "另一名字" },
      }),
    /仅管理员/,
  );
});

test("新增租户首次进入：seed 按清单给数据加编码前缀，不因清单缺项崩溃", () => {
  const s = run(admin(), {
    type: "ADD_TENANT",
    tenant: { id: "", name: "华南石化", code: "HN", status: "启用" },
  });
  const t = s.tenants!.find((x) => x.name === "华南石化")!;
  const fresh = seed(t.id, s.tenants!);
  assert.equal(fresh.tenantId, t.id);
  assert.ok(fresh.areas.every((a) => a.name.startsWith("HN·")));
  assert.ok(fresh.robots.every((r) => r.name.startsWith("HN·")));
  // 清单里查不到的租户 id：不加前缀但也不抛错
  const orphan = seed("T-UNKNOWN", s.tenants!);
  assert.equal(orphan.tenantId, "T-UNKNOWN");
});
