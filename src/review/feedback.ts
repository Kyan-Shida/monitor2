export type FeedbackPriority = "阻断" | "重要" | "建议";
export type FeedbackCategory = "布局" | "功能" | "流程" | "文案" | "其他";

export interface ReviewFeedback {
  id: string;
  reviewer: string;
  route: string;
  pageTitle: string;
  selector: string;
  targetText: string;
  category: FeedbackCategory;
  priority: FeedbackPriority;
  comment: string;
  createdAt: string;
}

const key = "inspection-prototype-review-feedback-v1";

export function loadFeedback(): ReviewFeedback[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(raw) ? raw.filter(isFeedback) : [];
  } catch {
    return [];
  }
}

export function saveFeedback(items: ReviewFeedback[]) {
  localStorage.setItem(key, JSON.stringify(items));
}

export function isFeedback(value: unknown): value is ReviewFeedback {
  if (!value || typeof value !== "object") return false;
  const x = value as Record<string, unknown>;
  return [
    "id",
    "reviewer",
    "route",
    "pageTitle",
    "selector",
    "targetText",
    "category",
    "priority",
    "comment",
    "createdAt",
  ].every((field) => typeof x[field] === "string");
}

export function mergeFeedback(
  current: ReviewFeedback[],
  incoming: ReviewFeedback[],
) {
  const byId = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => byId.set(item.id, item));
  return [...byId.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function feedbackMarkdown(items: ReviewFeedback[], baseUrl: string) {
  const rows = items.map((item, index) => {
    const location = `${baseUrl}${item.route}`;
    return [
      `## ${index + 1}. [${item.priority}] ${item.pageTitle} · ${item.category}`,
      `- 评审人：${item.reviewer}`,
      `- 页面：${location}`,
      `- 元素：${item.selector || "整页"}`,
      `- 页面文字：${item.targetText || "无"}`,
      `- 时间：${item.createdAt}`,
      `- 意见：${item.comment}`,
    ].join("\n");
  });
  return [
    "# 石化智能巡检原型评审意见",
    "",
    "以下是评审人在原型页面上记录的意见。请根据页面地址、元素路径和页面文字定位问题，逐条处理，并说明无法定位或需要澄清的项目。",
    "",
    `共 ${items.length} 条意见。`,
    "",
    ...rows.flatMap((row) => [row, ""]),
  ].join("\n");
}
