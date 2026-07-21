const els = {
  subtitle: document.querySelector("#subtitle"),
  liveBadge: document.querySelector("#liveBadge"),
  metrics: document.querySelector("#metrics"),
  roundDetailsBtn: document.querySelector("#roundDetailsBtn"),
  roundDetails: document.querySelector("#roundDetails"),
  dayCount: document.querySelector("#dayCount"),
  daySelect: document.querySelector("#daySelect"),
  daySummary: document.querySelector("#daySummary"),
  olderDayBtn: document.querySelector("#olderDayBtn"),
  newerDayBtn: document.querySelector("#newerDayBtn"),
  heatChart: document.querySelector("#heatChart"),
  rankTitle: document.querySelector("#rankTitle"),
  rankCount: document.querySelector("#rankCount"),
  rankList: document.querySelector("#rankList"),
  detailEyebrow: document.querySelector("#detailEyebrow"),
  detailTitle: document.querySelector("#detailTitle"),
  detailHeat: document.querySelector("#detailHeat"),
  postBody: document.querySelector("#postBody"),
  commentSearch: document.querySelector("#commentSearch"),
  referencedOnlyCheckbox: document.querySelector("#referencedOnlyCheckbox"),
  commentCount: document.querySelector("#commentCount"),
  commentsList: document.querySelector("#commentsList"),
  mobileViewButtons: [...document.querySelectorAll("[data-mobile-view]")],
  mobilePanels: [...document.querySelectorAll("[data-mobile-panel]")],
  toast: document.querySelector("#toast")
};

const palette = [
  ["#137b73", "#e0f1ee"],
  ["#d04f3f", "#f8e5df"],
  ["#3867b7", "#e4ecfb"],
  ["#a76a00", "#fff0bf"],
  ["#6757b8", "#ece9ff"],
  ["#24744f", "#e3f3e8"]
];

const state = {
  data: null,
  selectedDate: "",
  selectedPid: 0,
  commentQuery: "",
  referencedOnly: false,
  roundDetailsOpen: false,
  mobileView: "rank",
  timer: 0,
  toastTimer: 0,
  renderKeys: {
    metrics: null,
    roundDetails: null,
    days: null,
    rank: null,
    detail: null,
    comments: null,
    chart: null
  }
};

init();

function init() {
  bindEvents();
  loadState();
  state.timer = window.setInterval(loadState, 10 * 60 * 1000);
}

function bindEvents() {
  els.roundDetailsBtn.addEventListener("click", () => {
    state.roundDetailsOpen = !state.roundDetailsOpen;
    renderRoundDetails();
  });

  for (const button of els.mobileViewButtons) {
    button.addEventListener("click", () => setMobileView(button.dataset.mobileView));
  }

  els.daySelect.addEventListener("change", () => selectDate(els.daySelect.value));
  els.olderDayBtn.addEventListener("click", () => stepDay(1));
  els.newerDayBtn.addEventListener("click", () => stepDay(-1));

  els.rankList.addEventListener("click", (event) => {
    const card = event.target.closest("[data-pid]");
    if (!card) return;
    state.selectedPid = Number(card.dataset.pid);
    renderRank();
    renderDetail();
    renderComments();
    if (window.innerWidth < 768) setMobileView("detail");
  });

  els.commentSearch.addEventListener("input", () => {
    state.commentQuery = els.commentSearch.value.trim().toLowerCase();
    renderComments();
  });

  els.referencedOnlyCheckbox.addEventListener("change", () => {
    state.referencedOnly = els.referencedOnlyCheckbox.checked;
    renderComments();
  });

  els.commentsList.addEventListener("click", (event) => {
    const jump = event.target.closest("[data-jump-comment]");
    if (!jump) return;
    jumpToComment(Number(jump.dataset.jumpComment));
  });

  window.addEventListener("resize", () => drawChart(getSelectedDay(), true));
}

async function loadState() {
  try {
    const response = await fetch(new URL("data/snapshot.json", document.baseURI), { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.schema_version !== 1 || !Array.isArray(payload.days)) {
      throw new Error("快照格式无效");
    }
    state.data = payload;
    chooseDefaults();
    render();
  } catch (error) {
    els.liveBadge.textContent = "快照不可用";
    els.liveBadge.className = "status-badge error";
    showToast(`读取快照失败：${error.message}`);
  }
}

function chooseDefaults() {
  const days = state.data?.days || [];
  if (!days.length) {
    state.selectedDate = "";
    state.selectedPid = 0;
    return;
  }
  if (!state.selectedDate || !days.some((day) => day.date === state.selectedDate)) {
    state.selectedDate = (days.find((day) => day.posts?.length) || days[0]).date;
  }
  const selectedDay = getSelectedDay();
  if (!selectedDay?.posts?.some((item) => item.post.pid === state.selectedPid)) {
    state.selectedPid = selectedDay?.posts?.[0]?.post?.pid || 0;
  }
}

function render() {
  renderHeader();
  renderMetrics();
  renderRoundDetails();
  renderDays();
  renderRank();
  renderDetail();
  renderComments();
  renderMobileView();
  drawChart(getSelectedDay());
}

function renderHeader() {
  const data = state.data;
  const updated = data.source_updated_at || data.generated_at;
  const range = data.date_from && data.date_to ? `数据范围 ${data.date_from} 至 ${data.date_to}` : "暂无公开数据";
  els.subtitle.textContent = `${range} · 快照更新于 ${formatDateTime(updated)}`;
  els.liveBadge.textContent = `只读快照 · ${formatTime(updated)}`;
  els.liveBadge.className = "status-badge online";
}

function renderMetrics() {
  const stats = state.data.stats;
  const key = JSON.stringify([
    stats.day_count,
    stats.post_count,
    stats.comment_count,
    state.data.source_updated_at
  ]);
  if (state.renderKeys.metrics === key) return;
  state.renderKeys.metrics = key;
  const metrics = [
    ["公开天数", stats.day_count || 0, palette[0][0]],
    ["上榜树洞", stats.post_count || 0, palette[2][0]],
    ["公开评论", stats.comment_count || 0, palette[3][0]],
    ["页面模式", "只读", palette[5][0]]
  ];
  replaceChildren(
    els.metrics,
    metrics.map(([label, value, color]) => {
      const node = el("div", "metric");
      node.style.setProperty("--accent-color", color);
      node.append(el("span", "", label), el("strong", "", String(value)));
      return node;
    })
  );
}

function renderRoundDetails() {
  if (!state.data) return;
  const policy = state.data.public_policy || {};
  const key = JSON.stringify([
    state.roundDetailsOpen,
    state.data.generated_at,
    state.data.source_updated_at,
    policy.max_days,
    policy.top_n,
    policy.max_comments_per_post
  ]);
  if (state.renderKeys.roundDetails === key) return;
  state.renderKeys.roundDetails = key;
  els.roundDetailsBtn.setAttribute("aria-expanded", String(state.roundDetailsOpen));
  els.roundDetails.hidden = !state.roundDetailsOpen;
  if (!state.roundDetailsOpen) return;
  const details = [
    ["页面模式", "静态只读"],
    ["源数据更新", formatDateTime(state.data.source_updated_at)],
    ["快照生成", formatDateTime(state.data.generated_at)],
    ["保留天数", policy.max_days || 0],
    ["每日上限", policy.top_n || 0],
    ["单洞评论上限", policy.max_comments_per_post || 0]
  ];
  replaceChildren(
    els.roundDetails,
    details.map(([label, value]) => {
      const node = el("div", "round-stat");
      node.append(el("span", "", label), el("strong", "", String(value)));
      return node;
    })
  );
}

function renderDays() {
  const days = state.data.days || [];
  const key = JSON.stringify([
    state.selectedDate,
    days.map((day) => [day.date, day.leader_heat || 0, day.posts?.length || 0])
  ]);
  if (state.renderKeys.days === key) return;
  state.renderKeys.days = key;
  els.dayCount.textContent = `${days.length} 天`;
  if (!days.length) {
    replaceChildren(els.daySelect, []);
    els.daySelect.disabled = true;
    els.olderDayBtn.disabled = true;
    els.newerDayBtn.disabled = true;
    replaceChildren(els.daySummary, [dayStat("最高", "-"), dayStat("上榜", "-"), dayStat("公开", "-")]);
    return;
  }
  els.daySelect.disabled = false;
  const monthGroups = new Map();
  for (const day of days) {
    const month = day.date.slice(0, 7);
    if (!monthGroups.has(month)) monthGroups.set(month, []);
    const option = document.createElement("option");
    option.value = day.date;
    option.textContent = `${day.date} · 最高${day.leader_heat || 0}`;
    monthGroups.get(month).push(option);
  }
  const groups = [...monthGroups.entries()].map(([month, options]) => {
    const group = document.createElement("optgroup");
    group.label = month;
    group.append(...options);
    return group;
  });
  replaceChildren(els.daySelect, groups);
  els.daySelect.value = state.selectedDate;
  const index = days.findIndex((day) => day.date === state.selectedDate);
  els.olderDayBtn.disabled = index < 0 || index >= days.length - 1;
  els.newerDayBtn.disabled = index <= 0;
  const day = getSelectedDay();
  replaceChildren(
    els.daySummary,
    day
      ? [dayStat("最高", day.leader_heat || 0), dayStat("上榜", day.posts.length), dayStat("公开", day.posts.length)]
      : [dayStat("最高", "-"), dayStat("上榜", "-"), dayStat("公开", "-")]
  );
}

function dayStat(label, value) {
  const node = el("div", "day-stat");
  node.append(el("span", "", label), el("strong", "", String(value)));
  return node;
}

function renderRank() {
  const day = getSelectedDay();
  const key = JSON.stringify([
    state.selectedDate,
    state.selectedPid,
    (day?.posts || []).map((item) => [
      item.post.pid,
      item.rank,
      item.heat,
      item.favorite_count,
      item.comment_count,
      item.comments_omitted,
      hashString(item.post.text || "")
    ])
  ]);
  if (state.renderKeys.rank === key) return;
  state.renderKeys.rank = key;
  const scrollTop = els.rankList.scrollTop;
  els.rankTitle.textContent = day ? `${day.date} 榜单` : "榜单";
  els.rankCount.textContent = `${day?.posts?.length || 0} 条`;
  if (!day || !day.posts.length) {
    replaceChildren(els.rankList, [el("div", "empty-state", "当前日期没有上榜树洞")]);
    els.rankList.scrollTop = scrollTop;
    return;
  }
  replaceChildren(
    els.rankList,
    day.posts.map((item, index) => createRankCard(item, index))
  );
  els.rankList.scrollTop = scrollTop;
}

function createRankCard(item, index) {
  const color = palette[index % palette.length];
  const card = el("article", "rank-card");
  card.dataset.pid = String(item.post.pid);
  card.classList.toggle("active", item.post.pid === state.selectedPid);
  card.style.setProperty("--accent-color", color[0]);
  card.style.setProperty("--accent-bg", color[1]);
  const rank = el("div", "rank-index", String(item.rank));
  const main = el("div", "rank-main");
  const line = el("div", "rank-line");
  line.append(el("strong", "", `#${item.post.pid}`), el("span", "", `热度 ${item.heat}`));
  const text = el("p", "rank-text", compactText(item.post.text) || "（空正文）");
  text.title = compactText(item.post.text) || "（空正文）";
  const meta = el("div", "rank-meta");
  const omitted = item.comments_omitted || 0;
  const syncLabel = omitted ? `省略 ${omitted}` : "公开快照";
  const syncModifier = omitted ? "pending" : "complete";
  meta.append(
    chip(`收藏 ${item.favorite_count}`),
    chip(`评论 ${item.comment_count}`),
    chip(syncLabel, syncModifier)
  );
  main.append(line, text, meta);
  card.append(rank, main);
  return card;
}

function renderDetail() {
  const item = getSelectedPost();
  const key = item
    ? JSON.stringify([
        item.post.pid,
        item.post.timestamp,
        item.post.text,
        item.heat,
        item.favorite_count,
        item.comment_count
      ])
    : "none";
  if (state.renderKeys.detail === key) return;
  state.renderKeys.detail = key;
  if (!item) {
    els.detailEyebrow.textContent = "未选择";
    els.detailTitle.textContent = "等待榜单数据";
    els.detailHeat.textContent = "0";
    els.postBody.textContent = "";
    els.commentCount.textContent = "0";
    replaceChildren(els.commentsList, [el("div", "empty-state", "暂无树洞详情")]);
    return;
  }
  els.detailEyebrow.textContent = `#${item.post.pid} · ${formatUnix(item.post.timestamp)}`;
  els.detailTitle.textContent = `热度 = ${item.favorite_count} 收藏 + ${item.comment_count} 评论`;
  els.detailHeat.textContent = String(item.heat);
  const text = el("div", "post-text", item.post.text || "（空正文）");
  replaceChildren(els.postBody, [text]);
}

function renderComments() {
  const item = getSelectedPost();
  const key = item
    ? JSON.stringify([
        item.post.pid,
        state.commentQuery,
        state.referencedOnly,
        item.comments_total,
        item.comments_omitted,
        commentsFingerprint(item.comments || [])
      ])
    : "none";
  if (state.renderKeys.comments === key) return;
  state.renderKeys.comments = key;
  if (!item) return;
  const scrollTop = els.commentsList.scrollTop;
  const relations = buildCommentRelations(item.comments || []);
  const query = state.commentQuery;
  const comments = (item.comments || []).filter((comment, index) => {
    if (state.referencedOnly && !comment.quote_id && !relations.quotedBy.has(comment.cid)) return false;
    if (!query) return true;
    return [
      comment.text,
      String(comment.cid),
      String(index + 1),
      comment.quote_id ? String(comment.quote_id) : ""
    ].join(" ").toLowerCase().includes(query);
  });
  const totalText = item.comments_total ? `${comments.length} / ${item.comments_total}` : String(comments.length);
  els.commentCount.textContent = `${totalText} 条评论`;
  if (!comments.length) {
    const message = state.referencedOnly ? "当前评论中没有引用关系" : "暂无公开评论";
    replaceChildren(els.commentsList, [el("div", "empty-state", message)]);
    els.commentsList.scrollTop = scrollTop;
    return;
  }
  replaceChildren(
    els.commentsList,
    comments.map((comment) => createCommentCard(comment, relations))
  );
  els.commentsList.scrollTop = scrollTop;
}

function createCommentCard(comment, relations) {
  const color = colorForIdentity(commentIdentity(comment));
  const card = el("article", "comment-card");
  card.id = `comment-${comment.cid}`;
  card.dataset.commentId = String(comment.cid);
  card.style.setProperty("--accent", color.line);
  card.style.setProperty("--person-deep", color.deep);
  card.style.setProperty("--person-strong", color.strong);
  card.style.setProperty("--person-soft", color.soft);
  card.style.setProperty("--person-surface", color.surface);
  card.style.setProperty("--person-ink", color.ink);
  card.style.setProperty("--person-muted", color.muted);
  const head = el("div", "comment-head");
  const author = comment.is_author || comment.is_lz ? "洞主" : "匿名";
  head.append(
    el("span", "comment-author", author),
    el("span", "", `C${comment.cid} · ${formatUnix(comment.timestamp)}`)
  );
  card.append(head);
  if (comment.quote_id) {
    const target = relations.byId.get(comment.quote_id);
    const quote = el("button", "quote-box relation-button");
    quote.type = "button";
    quote.dataset.jumpComment = String(comment.quote_id);
    quote.append(
      el("strong", "", `引用 C${comment.quote_id}`),
      el("span", "", target ? clipText(target.text, 100) : "被引用评论不在当前保存内容中")
    );
    card.append(quote);
  }
  card.append(el("div", "comment-text", comment.text || "（空评论）"));
  const quotedBy = relations.quotedBy.get(comment.cid) || [];
  if (quotedBy.length) {
    const replies = el("div", "reply-links");
    replies.append(el("span", "reply-label", "被引用："));
    for (const reply of quotedBy.slice(0, 5)) {
      replies.append(createReplyButton(reply));
    }
    if (quotedBy.length > 5) {
      const overflow = document.createElement("details");
      overflow.className = "reply-overflow";
      const summary = document.createElement("summary");
      summary.textContent = `+${quotedBy.length - 5}`;
      const menu = el("div", "reply-overflow-menu");
      for (const reply of quotedBy.slice(5)) {
        menu.append(createReplyButton(reply));
      }
      overflow.append(summary, menu);
      replies.append(overflow);
    }
    card.append(replies);
  }
  return card;
}

function createReplyButton(reply) {
  const button = el("button", "reply-link", `C${reply.cid}`);
  button.type = "button";
  button.dataset.jumpComment = String(reply.cid);
  button.title = `跳转到评论 C${reply.cid}`;
  return button;
}

function buildCommentRelations(comments) {
  const byId = new Map();
  const quotedBy = new Map();
  for (const comment of comments) {
    byId.set(comment.cid, comment);
  }
  for (const comment of comments) {
    if (!comment.quote_id) continue;
    if (!quotedBy.has(comment.quote_id)) quotedBy.set(comment.quote_id, []);
    quotedBy.get(comment.quote_id).push(comment);
  }
  return { byId, quotedBy };
}

function jumpToComment(cid) {
  const item = getSelectedPost();
  if (!item?.comments?.some((comment) => comment.cid === cid)) {
    showToast(`评论 C${cid} 不在当前保存内容中`);
    return;
  }
  if (state.commentQuery) {
    state.commentQuery = "";
    els.commentSearch.value = "";
    renderComments();
  }
  if (state.referencedOnly) {
    state.referencedOnly = false;
    els.referencedOnlyCheckbox.checked = false;
    renderComments();
  }
  window.requestAnimationFrame(() => {
    const target = document.querySelector(`#comment-${cid}`);
    if (!target) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    target.classList.add("flash");
    window.setTimeout(() => target.classList.remove("flash"), 900);
  });
}

function commentIdentity(comment) {
  return comment.is_author || comment.is_lz ? "洞主" : `公开评论-${comment.cid}`;
}

function colorForIdentity(identity) {
  const slotCount = 72;
  const hueStep = 137;
  const slot = hashString(identity) % slotCount;
  const hue = (17 + slot * hueStep) % 360;
  return {
    line: `hsl(${hue} 58% 42%)`,
    deep: `hsl(${hue} 48% 28%)`,
    strong: `hsl(${hue} 52% 84%)`,
    soft: `hsl(${hue} 58% 93%)`,
    surface: `hsl(${hue} 54% 98%)`,
    ink: `hsl(${hue} 45% 18%)`,
    muted: `hsl(${hue} 28% 34%)`
  };
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function commentsFingerprint(comments) {
  let hash = 2166136261;
  for (const comment of comments) {
    const token = [
      comment.cid,
      comment.timestamp,
      comment.quote_id || 0,
      comment.text || "",
      comment.is_author || comment.is_lz ? "author" : "anonymous"
    ].join("|");
    hash ^= hashString(token);
    hash = Math.imul(hash, 16777619);
  }
  return `${comments.length}:${hash >>> 0}`;
}

function drawChart(day, force = false) {
  const canvas = els.heatChart;
  const rect = canvas.getBoundingClientRect();
  const key = JSON.stringify([
    state.selectedDate,
    Math.round(rect.width),
    Math.round(rect.height),
    (day?.posts || []).slice(0, 5).map((item) => [item.post.pid, item.heat])
  ]);
  if (!force && state.renderKeys.chart === key) return;
  state.renderKeys.chart = key;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, rect.width, rect.height);

  const posts = (day?.posts || []).slice(0, 5);
  if (!posts.length) {
    ctx.fillStyle = "#6e756c";
    ctx.font = "700 12px Segoe UI, sans-serif";
    ctx.fillText("暂无热度数据", 10, 24);
    return;
  }
  const maxHeat = Math.max(...posts.map((item) => item.heat), 1);
  const row = Math.min(20, (rect.height - 10) / posts.length);
  posts.forEach((item, index) => {
    const y = 5 + index * row;
    const barHeight = Math.max(5, row - 6);
    const width = Math.max(4, (rect.width - 76) * (item.heat / maxHeat));
    const color = palette[index % palette.length];
    ctx.fillStyle = color[1];
    roundRect(ctx, 50, y, rect.width - 60, barHeight, 4);
    ctx.fill();
    ctx.fillStyle = color[0];
    roundRect(ctx, 50, y, width, barHeight, 4);
    ctx.fill();
    ctx.fillStyle = "#394039";
    ctx.font = "700 9px Segoe UI, sans-serif";
    ctx.fillText(`#${item.post.pid}`, 2, y + Math.min(11, row - 3));
    ctx.textAlign = "right";
    ctx.fillText(String(item.heat), rect.width - 3, y + Math.min(11, row - 3));
    ctx.textAlign = "left";
  });
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function setMobileView(view) {
  if (view !== "rank" && view !== "detail") return;
  state.mobileView = view;
  renderMobileView();
}

function renderMobileView() {
  for (const button of els.mobileViewButtons) {
    const active = button.dataset.mobileView === state.mobileView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  for (const panel of els.mobilePanels) {
    panel.classList.toggle("active", panel.dataset.mobilePanel === state.mobileView);
  }
}

function getSelectedDay() {
  return (state.data?.days || []).find((day) => day.date === state.selectedDate) || null;
}

function selectDate(date) {
  if (!date || date === state.selectedDate) return;
  state.selectedDate = date;
  const day = getSelectedDay();
  state.selectedPid = day?.posts?.[0]?.post?.pid || 0;
  if (window.innerWidth < 768) state.mobileView = "rank";
  render();
}

function stepDay(offset) {
  const days = state.data?.days || [];
  const index = days.findIndex((day) => day.date === state.selectedDate);
  const next = days[index + offset];
  if (next) selectDate(next.date);
}

function getSelectedPost() {
  const day = getSelectedDay();
  return (day?.posts || []).find((item) => item.post.pid === state.selectedPid) || null;
}

function chip(text, modifier = "") {
  return el("span", `meta-chip ${modifier}`.trim(), text);
}

function compactText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function clipText(text, length) {
  const compact = compactText(text);
  return compact.length > length ? `${compact.slice(0, length)}...` : compact;
}

function formatUnix(seconds) {
  if (!seconds) return "-";
  return new Date(seconds * 1000).toLocaleString("zh-CN", { hour12: false });
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("zh-CN", { hour12: false });
}

function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}

function replaceChildren(parent, children) {
  parent.replaceChildren(...children);
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  state.toastTimer = window.setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2600);
}
