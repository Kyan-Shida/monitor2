import { useEffect, useRef, useState } from "react";
import {
  ClipboardCopy,
  Download,
  MessageSquarePlus,
  MousePointer2,
  Upload,
  X,
} from "lucide-react";
import {
  feedbackMarkdown,
  isFeedback,
  loadFeedback,
  mergeFeedback,
  saveFeedback,
  type FeedbackCategory,
  type FeedbackPriority,
  type ReviewFeedback,
} from "../review/feedback";

type Target = { selector: string; text: string };
const categories: FeedbackCategory[] = ["布局", "功能", "流程", "文案", "其他"];
const priorities: FeedbackPriority[] = ["阻断", "重要", "建议"];

function selectorFor(element: HTMLElement) {
  const parts: string[] = [];
  let node: HTMLElement | null = element;
  while (node && node.tagName !== "MAIN") {
    const tag = node.tagName.toLowerCase();
    const siblings = node.parentElement
      ? [...node.parentElement.children].filter(
          (child) => child.tagName === node?.tagName,
        )
      : [];
    const index = siblings.indexOf(node) + 1;
    parts.unshift(`${tag}:nth-of-type(${index})`);
    node = node.parentElement;
  }
  return `main > ${parts.join(" > ")}`;
}

function download(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function FeedbackReview({ pageTitle }: { pageTitle: string }) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [items, setItems] = useState(loadFeedback);
  const [reviewer, setReviewer] = useState(
    () => localStorage.getItem("inspection-reviewer") || "",
  );
  const [category, setCategory] = useState<FeedbackCategory>("布局");
  const [priority, setPriority] = useState<FeedbackPriority>("重要");
  const [comment, setComment] = useState("");
  const [scope, setScope] = useState<"page" | "all">("page");
  const [notice, setNotice] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const highlighted = useRef<HTMLElement | null>(null);
  const currentRoute = window.location.hash || "#/monitor/overview";
  const visible =
    scope === "all"
      ? items
      : items.filter((item) => item.route === currentRoute);

  useEffect(() => saveFeedback(items), [items]);
  useEffect(
    () => localStorage.setItem("inspection-reviewer", reviewer),
    [reviewer],
  );
  useEffect(() => {
    if (!picking) return;
    const clear = () => {
      highlighted.current?.classList.remove("review-target-highlight");
      highlighted.current = null;
    };
    const move = (event: MouseEvent) => {
      const element = (event.target as HTMLElement).closest<HTMLElement>(
        "main *",
      );
      if (element === highlighted.current) return;
      clear();
      if (element) {
        element.classList.add("review-target-highlight");
        highlighted.current = element;
      }
    };
    const choose = (event: MouseEvent) => {
      const element = (event.target as HTMLElement).closest<HTMLElement>(
        "main *",
      );
      if (!element) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setTarget({
        selector: selectorFor(element),
        text: (
          element.innerText ||
          element.getAttribute("aria-label") ||
          element.title ||
          ""
        )
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 100),
      });
      setOpen(true);
      setPicking(false);
    };
    document.addEventListener("mousemove", move, true);
    document.addEventListener("click", choose, true);
    return () => {
      document.removeEventListener("mousemove", move, true);
      document.removeEventListener("click", choose, true);
      clear();
    };
  }, [picking]);

  const persist = () => {
    if (!reviewer.trim() || !comment.trim() || !target) {
      setNotice("请填写评审人和具体意见。");
      return;
    }
    const next: ReviewFeedback = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      reviewer: reviewer.trim(),
      route: currentRoute,
      pageTitle,
      selector: target.selector,
      targetText: target.text,
      category,
      priority,
      comment: comment.trim(),
      createdAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    };
    setItems((previous) => [next, ...previous]);
    setComment("");
    setTarget(null);
    setNotice("意见已保存在当前浏览器。评审结束后请导出或复制。");
  };
  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  const copyForCodex = async () => {
    if (!items.length) return;
    const markdown = feedbackMarkdown(items, baseUrl);
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(markdown);
      setNotice(`已复制 ${items.length} 条意见，可直接粘贴使用。`);
    } catch {
      const field = document.createElement("textarea");
      field.value = markdown;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      setNotice(
        copied
          ? `已复制 ${items.length} 条意见，可直接粘贴使用。`
          : "浏览器限制复制，请使用“下载 Markdown”传递意见。",
      );
    }
  };
  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    let incoming: ReviewFeedback[] = [];
    let invalid = 0;
    for (const file of [...files]) {
      try {
        const data: unknown = JSON.parse(await file.text());
        if (!Array.isArray(data) || !data.every(isFeedback))
          throw new Error("invalid feedback");
        incoming = incoming.concat(data);
      } catch {
        invalid += 1;
      }
    }
    setItems((previous) => mergeFeedback(previous, incoming));
    setNotice(
      `导入 ${incoming.length} 条意见${invalid ? `，${invalid} 个文件格式不符` : ""}；重复记录已合并。`,
    );
    if (importRef.current) importRef.current.value = "";
  };
  const locate = (item: ReviewFeedback) => {
    if (window.location.hash !== item.route) window.location.hash = item.route;
    setOpen(false);
    window.setTimeout(() => {
      const element = item.selector
        ? document.querySelector<HTMLElement>(item.selector)
        : null;
      element?.scrollIntoView({ block: "center", behavior: "smooth" });
      element?.classList.add("review-target-flash");
      window.setTimeout(
        () => element?.classList.remove("review-target-flash"),
        2200,
      );
      if (item.selector && !element)
        setNotice("该元素可能已随页面修改，请按页面文字定位。");
    }, 120);
  };

  return (
    <>
      <button
        className="review-entry"
        onClick={() => setOpen(true)}
        title="收集页面评审意见"
      >
        <MessageSquarePlus size={16} /> 评审意见
        {items.length > 0 && <b>{items.length}</b>}
      </button>
      {picking && (
        <div className="review-pick-tip">
          <MousePointer2 size={17} /> 点击页面中的问题位置进行标注
          <button onClick={() => setPicking(false)}>退出标注</button>
        </div>
      )}
      {open && (
        <>
          <div className="review-scrim" onClick={() => setOpen(false)} />
          <aside className="review-drawer" aria-label="原型评审意见">
            <div className="review-drawer-head">
              <div>
                <strong>原型评审意见</strong>
                <small>定位页面问题，导出评审意见</small>
              </div>
              <button aria-label="关闭评审面板" onClick={() => setOpen(false)}>
                <X size={19} />
              </button>
            </div>
            <div className="review-drawer-body">
              <div className="review-actions">
                <button
                  className="btn primary"
                  onClick={() => {
                    setOpen(false);
                    setPicking(true);
                    setNotice("");
                  }}
                >
                  <MousePointer2 size={15} /> 点击页面标注
                </button>
                <button
                  className="btn"
                  onClick={() => setTarget({ selector: "", text: "整页" })}
                >
                  添加整页意见
                </button>
              </div>
              <p className="review-hint">
                标注时点击页面元素即可记录当前页面、元素路径和文字；该点击不会触发原页面操作。
              </p>
              {target && (
                <div className="review-editor">
                  <div className="review-editor-title">
                    新意见 · {pageTitle}
                  </div>
                  <div className="review-target-text">
                    {target.text || target.selector || "整页"}
                  </div>
                  <label>
                    评审人
                    <input
                      value={reviewer}
                      onChange={(event) => setReviewer(event.target.value)}
                      placeholder="填写姓名或团队"
                    />
                  </label>
                  <div className="review-editor-row">
                    <label>
                      类别
                      <select
                        value={category}
                        onChange={(event) =>
                          setCategory(event.target.value as FeedbackCategory)
                        }
                      >
                        {categories.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      优先级
                      <select
                        value={priority}
                        onChange={(event) =>
                          setPriority(event.target.value as FeedbackPriority)
                        }
                      >
                        {priorities.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    具体意见
                    <textarea
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder="说明当前问题和期望效果"
                      rows={4}
                    />
                  </label>
                  <div className="review-editor-buttons">
                    <button className="btn primary" onClick={persist}>
                      保存意见
                    </button>
                    <button className="btn" onClick={() => setTarget(null)}>
                      取消
                    </button>
                  </div>
                </div>
              )}
              {notice && (
                <div className="review-notice" role="status">
                  {notice}
                </div>
              )}
              <div className="review-list-head">
                <strong>
                  已记录意见 <span>{items.length}</span>
                </strong>
                <select
                  aria-label="意见范围"
                  value={scope}
                  onChange={(event) =>
                    setScope(event.target.value as "page" | "all")
                  }
                >
                  <option value="page">当前页面</option>
                  <option value="all">全部页面</option>
                </select>
              </div>
              <div className="review-list">
                {visible.length === 0 && (
                  <p className="review-empty">
                    还没有意见。可标注页面元素，或添加整页意见。
                  </p>
                )}
                {visible.map((item) => (
                  <article className="review-item" key={item.id}>
                    <div className="review-item-top">
                      <span className={`review-priority ${item.priority}`}>
                        {item.priority}
                      </span>
                      <span>{item.category}</span>
                      <time>{item.createdAt}</time>
                    </div>
                    <button
                      className="review-item-title"
                      onClick={() => locate(item)}
                    >
                      {item.pageTitle} · {item.targetText || "整页"}
                    </button>
                    <p>{item.comment}</p>
                    <div className="review-item-bottom">
                      <span>{item.reviewer}</span>
                      <button
                        onClick={() =>
                          setItems((previous) =>
                            previous.filter((x) => x.id !== item.id),
                          )
                        }
                      >
                        删除
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
            <div className="review-drawer-foot">
              <div className="review-export-primary">
                <button
                  className="btn primary"
                  disabled={!items.length}
                  onClick={copyForCodex}
                >
                  <ClipboardCopy size={15} /> 一键复制
                </button>
                <button
                  className="btn"
                  disabled={!items.length}
                  onClick={() =>
                    download(
                      "巡检原型评审意见.md",
                      feedbackMarkdown(items, baseUrl),
                      "text/markdown;charset=utf-8",
                    )
                  }
                >
                  <Download size={15} /> 下载 Markdown
                </button>
              </div>
              <div className="review-export-secondary">
                <button
                  disabled={!items.length}
                  onClick={() =>
                    download(
                      `巡检原型评审数据-${reviewer.trim() || "未署名"}.json`,
                      JSON.stringify(items, null, 2),
                      "application/json;charset=utf-8",
                    )
                  }
                >
                  导出数据 JSON
                </button>
                <button onClick={() => importRef.current?.click()}>
                  <Upload size={14} /> 导入多人意见
                </button>
                <input
                  ref={importRef}
                  className="review-file-input"
                  type="file"
                  accept=".json,application/json"
                  multiple
                  onChange={(event) => void importFiles(event.target.files)}
                />
              </div>
              <small>
                意见只保存在本机浏览器。评审结束请下载文件或复制，发布站点不会自动汇总。
              </small>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
