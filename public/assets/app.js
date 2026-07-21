"use strict";

const elements = {
  snapshotState: document.querySelector("#snapshotState"),
  snapshotStateWrap: document.querySelector(".snapshot-state"),
  snapshotTime: document.querySelector("#snapshotTime"),
  metrics: document.querySelector("#metrics"),
  daySelect: document.querySelector("#daySelect"),
  searchInput: document.querySelector("#searchInput"),
  rankingTitle: document.querySelector("#rankingTitle"),
  rankingCount: document.querySelector("#rankingCount"),
  rankingList: document.querySelector("#rankingList"),
  detailEmpty: document.querySelector("#detailEmpty"),
  detailContent: document.querySelector("#detailContent"),
  detailMeta: document.querySelector("#detailMeta"),
  detailTitle: document.querySelector("#detailTitle"),
  detailHeat: document.querySelector("#detailHeat"),
  postText: document.querySelector("#postText"),
  postStats: document.querySelector("#postStats"),
  commentsCount: document.querySelector("#commentsCount"),
  commentsList: document.querySelector("#commentsList")
};

const view = {
  data: null,
  selectedDate: "",
  selectedPid: 0,
  query: ""
};

elements.daySelect.addEventListener("change", () => {
  view.selectedDate = elements.daySelect.value;
  view.selectedPid = 0;
  choosePost();
  render();
});

elements.searchInput.addEventListener("input", () => {
  view.query = elements.searchInput.value.trim().toLocaleLowerCase("zh-CN");
  const posts = filteredPosts(selectedDay());
  if (!posts.some((item) => item.post.pid === view.selectedPid)) {
    view.selectedPid = posts[0]?.post?.pid || 0;
  }
  renderRanking();
  renderDetail();
});

loadSnapshot();
window.setInterval(loadSnapshot, 10 * 60 * 1000);

async function loadSnapshot() {
  setState("正在读取快照", "loading");
  try {
    const snapshotURL = new URL("data/snapshot.json", document.baseURI);
    const response = await fetch(snapshotURL, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data || data.schema_version !== 1 || !Array.isArray(data.days)) {
      throw new Error("快照格式无效");
    }
    view.data = data;
    chooseDay();
    choosePost();
    render();
    const updated = formatDateTime(data.source_updated_at || data.generated_at);
    setState(`快照更新于 ${updated}`, "ready");
    elements.snapshotTime.textContent = `数据由校内监控服务定时脱敏生成；源数据更新时间：${updated}。`;
  } catch (error) {
    setState(`快照读取失败：${error.message}`, "error");
    renderEmpty("暂时无法读取公开快照，请稍后重试。");
  }
}

function setState(message, state) {
  elements.snapshotState.textContent = message;
  elements.snapshotStateWrap.className = `snapshot-state ${state}`;
}

function chooseDay() {
  const days = view.data?.days || [];
  if (!days.some((day) => day.date === view.selectedDate)) {
    view.selectedDate = days.find((day) => day.posts?.length)?.date || days[0]?.date || "";
  }
}

function choosePost() {
  const posts = filteredPosts(selectedDay());
  if (!posts.some((item) => item.post.pid === view.selectedPid)) {
    view.selectedPid = posts[0]?.post?.pid || 0;
  }
}

function selectedDay() {
  return view.data?.days?.find((day) => day.date === view.selectedDate) || null;
}

function selectedPost() {
  return selectedDay()?.posts?.find((item) => item.post.pid === view.selectedPid) || null;
}

function filteredPosts(day) {
  const posts = day?.posts || [];
  if (!view.query) return posts;
  return posts.filter((item) => {
    const postText = item.post?.text || "";
    const commentText = (item.comments || []).map((comment) => comment.text || "").join("\n");
    return `${postText}\n${commentText}`.toLocaleLowerCase("zh-CN").includes(view.query);
  });
}

function render() {
  renderMetrics();
  renderDays();
  renderRanking();
  renderDetail();
}

function renderMetrics() {
  const stats = view.data?.stats || {};
  const metrics = [
    ["公开日期", stats.day_count || 0],
    ["公开帖子", stats.post_count || 0],
    ["公开评论", stats.comment_count || 0],
    ["当前日期", view.selectedDate || "—"]
  ];
  elements.metrics.replaceChildren(...metrics.map(([label, value]) => {
    const item = node("div", "metric");
    item.append(node("span", "", label), node("strong", "", String(value)));
    return item;
  }));
}

function renderDays() {
  const days = view.data?.days || [];
  elements.daySelect.replaceChildren(...days.map((day) => {
    const option = document.createElement("option");
    option.value = day.date;
    option.textContent = `${day.date} · ${day.posts?.length || 0} 条`;
    option.selected = day.date === view.selectedDate;
    return option;
  }));
  elements.daySelect.disabled = days.length === 0;
  elements.rankingTitle.textContent = view.selectedDate ? `${view.selectedDate} 榜单` : "当日榜单";
}

function renderRanking() {
  const posts = filteredPosts(selectedDay());
  elements.rankingCount.textContent = `${posts.length} 条`;
  if (!posts.length) {
    elements.rankingList.replaceChildren(node("div", "empty-list", view.query ? "没有匹配的公开内容。" : "该日期没有公开条目。"));
    return;
  }
  elements.rankingList.replaceChildren(...posts.map((item) => {
    const button = node("button", `rank-card${item.post.pid === view.selectedPid ? " active" : ""}`);
    button.type = "button";
    button.dataset.pid = String(item.post.pid);
    button.setAttribute("aria-pressed", item.post.pid === view.selectedPid ? "true" : "false");
    button.addEventListener("click", () => {
      view.selectedPid = item.post.pid;
      renderRanking();
      renderDetail();
      if (window.innerWidth < 901) elements.detailContent.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const number = node("span", "rank-number", String(item.rank));
    const copy = node("div", "rank-copy");
    copy.append(node("p", "rank-text", item.post.text || "（无文字内容）"));
    const meta = node("div", "rank-meta");
    meta.append(
      chip(`热度 ${item.heat || 0}`),
      chip(`评论 ${item.comment_count || 0}`),
      chip(formatDateTime(item.post.timestamp))
    );
    copy.append(meta);
    button.append(number, copy);
    return button;
  }));
}

function renderDetail() {
  const item = selectedPost();
  if (!item) {
    elements.detailContent.hidden = true;
    elements.detailEmpty.hidden = false;
    return;
  }

  elements.detailEmpty.hidden = true;
  elements.detailContent.hidden = false;
  elements.detailMeta.textContent = `排名 #${item.rank} · ${formatDateTime(item.post.timestamp)}`;
  elements.detailTitle.textContent = `树洞 #${item.post.pid}`;
  elements.detailHeat.textContent = String(item.heat || 0);
  elements.postText.textContent = item.post.text || "（无文字内容）";
  elements.postStats.replaceChildren(
    chip(`点赞 ${item.favorite_count || 0}`),
    chip(`评论 ${item.comment_count || 0}`),
    chip(`公开 ${item.comments?.length || 0}`)
  );
  renderComments(item);
}

function renderComments(item) {
  const comments = item.comments || [];
  const omitted = item.comments_omitted || 0;
  elements.commentsCount.textContent = omitted > 0
    ? `显示 ${comments.length} 条，另有 ${omitted} 条未进入公开快照`
    : `${comments.length} 条`;
  if (!comments.length) {
    elements.commentsList.replaceChildren(node("div", "empty-list", "暂无公开评论。"));
    return;
  }
  elements.commentsList.replaceChildren(...comments.map((comment, index) => {
    const card = node("article", `comment${comment.is_author || comment.is_lz ? " author" : ""}`);
    const head = node("div", "comment-head");
    const author = comment.is_author || comment.is_lz ? `#${index + 1} · 洞主` : `#${index + 1}`;
    const quote = comment.quote_id ? ` · 回复评论 ${comment.quote_id}` : "";
    head.append(node("span", "", `${author}${quote}`), node("time", "", formatDateTime(comment.timestamp)));
    card.append(head, node("p", "", comment.text || "（无文字内容）"));
    return card;
  }));
}

function renderEmpty(message) {
  view.data = { schema_version: 1, days: [], stats: {} };
  render();
  elements.detailEmpty.replaceChildren(node("strong", "", "无法显示快照"), node("span", "", message));
}

function chip(text) {
  return node("span", "meta-chip", text);
}

function node(tag, className = "", text = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== "") element.textContent = text;
  return element;
}

function formatDateTime(value) {
  if (!value) return "未知时间";
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}
