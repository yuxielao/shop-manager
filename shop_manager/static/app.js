const API = "/api";

// ========== 全局状态 ==========
let showProfit = false;
let currentPage = 1;
let detailProductId = null;

// ========== 顶部导航 ==========
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    const target = document.getElementById("tab-" + tab.dataset.tab);
    if (target) target.classList.add("active");
    if (tab.dataset.tab === "products") loadProducts();
    if (tab.dataset.tab === "stats") loadStats();
  });
});

function showTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  if (name === "detail") {
    document.getElementById("tab-detail").classList.add("active");
  } else {
    const tab = document.querySelector(`[data-tab="${name}"]`);
    if (tab) tab.classList.add("active");
    document.getElementById("tab-" + name).classList.add("active");
    if (name === "products") loadProducts();
    if (name === "stats") loadStats();
  }
}

// ========== 利润开关 ==========
const toggleProfit = document.getElementById("toggle-profit");
toggleProfit.addEventListener("change", () => {
  showProfit = toggleProfit.checked;
  loadProducts(currentPage);
});

document.getElementById("toggle-profit-stats").addEventListener("change", function () {
  loadStats();
});

// ========== Toast ==========
function toast(msg, type) {
  type = type || "";
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(function () { el.remove(); }, 2500);
}

// ========== Modal 确认框 ==========
function confirmDelete(msg) {
  return new Promise(function (resolve) {
    document.getElementById("modal-message").textContent = msg;
    var overlay = document.getElementById("modal-overlay");
    overlay.classList.remove("hidden");

    function cleanup() {
      overlay.classList.add("hidden");
      document.getElementById("modal-confirm").removeEventListener("click", onConfirm);
      document.getElementById("modal-cancel").removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onOverlayClick);
    }
    function onConfirm() { cleanup(); resolve(true); }
    function onCancel() { cleanup(); resolve(false); }
    function onOverlayClick(e) { if (e.target === overlay) onCancel(); }

    document.getElementById("modal-confirm").addEventListener("click", onConfirm);
    document.getElementById("modal-cancel").addEventListener("click", onCancel);
    overlay.addEventListener("click", onOverlayClick);
  });
}

// ========== 商品列表 ==========
async function loadProducts(page) {
  page = page || 1;
  currentPage = page;
  try {
    var res = await fetch(API + "/products?page=" + page + "&page_size=20");
  } catch (e) {
    toast("网络错误，无法加载商品列表", "error");
    return;
  }
  var data = await res.json();
  var tbody = document.getElementById("product-tbody");

  tbody.innerHTML = data.items.map(function (p) {
    var profitHtml;
    if (p.profit != null) {
      if (showProfit) {
        profitHtml = '<span class="' + (p.profit >= 0 ? 'profit-pos' : 'profit-neg') + '">¥' + p.profit + '</span>';
      } else {
        profitHtml = '<span class="profit-hidden-text">点击查看</span>';
      }
    } else {
      profitHtml = "-";
    }

    return '<tr>' +
      '<td>' + p.id + '</td>' +
      '<td><a href="#" data-action="detail" data-id="' + p.id + '">' + esc(p.name) + '</a></td>' +
      '<td>' + (p.retail_price != null ? "¥" + p.retail_price : "-") + '</td>' +
      '<td>' + (p.min_wholesale_price != null ? "¥" + p.min_wholesale_price : "-") + '</td>' +
      '<td class="profit-cell" data-profit="' + (p.profit != null ? p.profit : "") + '">' + profitHtml + '</td>' +
      '<td>' + p.alias_count + '</td>' +
      '<td>' + (p.updated_at ? p.updated_at.slice(0, 10) : "-") + '</td>' +
      '<td>' +
        '<button class="btn-small" data-action="detail" data-id="' + p.id + '">编辑</button> ' +
        '<button class="btn-danger btn-small" data-action="delete" data-id="' + p.id + '" data-name="' + escAttr(p.name) + '">删除</button>' +
      '</td>' +
      '</tr>';
  }).join("");

  var totalPages = Math.ceil(data.total / data.page_size);
  document.getElementById("pagination").innerHTML = totalPages > 1 ? buildPagination(page, totalPages) : "";
}

function buildPagination(current, total) {
  var html = "";
  if (current > 1) html += '<button onclick="loadProducts(' + (current - 1) + ')">上一页</button>';
  html += '<span>' + current + ' / ' + total + '</span>';
  if (current < total) html += '<button onclick="loadProducts(' + (current + 1) + ')">下一页</button>';
  return html;
}

// 事件委托
document.getElementById("product-tbody").addEventListener("click", async function (e) {
  var btn = e.target.closest("[data-action]");
  if (btn) {
    e.preventDefault();
    var action = btn.dataset.action;
    var id = parseInt(btn.dataset.id);
    if (action === "detail") {
      showDetail(id);
    } else if (action === "delete") {
      var name = btn.dataset.name;
      var ok = await confirmDelete("确定要删除商品「" + name + "」吗？\n相关的别名、批发价和历史记录也会被一起删除。");
      if (ok) {
        await fetch(API + "/products/" + id, { method: "DELETE" });
        toast("商品已删除");
        loadProducts(currentPage);
      }
    }
    return;
  }

  // 单行利润点击
  var cell = e.target.closest(".profit-cell");
  if (cell && !showProfit) {
    var profit = cell.dataset.profit;
    if (profit && profit !== "None" && profit !== "") {
      var n = parseFloat(profit);
      cell.innerHTML = '<span class="' + (n >= 0 ? 'profit-pos' : 'profit-neg') + '">¥' + n + '</span>';
      setTimeout(function () {
        cell.innerHTML = '<span class="profit-hidden-text">点击查看</span>';
      }, 3000);
    }
  }
});

// ========== 搜索 ==========
document.getElementById("search-btn").addEventListener("click", search);
document.getElementById("search-input").addEventListener("keydown", function (e) {
  if (e.key === "Enter") search();
});

async function search() {
  var q = document.getElementById("search-input").value.trim();
  if (!q) { clearSearch(); return; }
  var res = await fetch(API + "/search?q=" + encodeURIComponent(q));
  var data = await res.json();
  var div = document.getElementById("search-results");
  div.classList.remove("hidden");
  var list = document.getElementById("search-list");
  if (data.items.length === 0) {
    list.innerHTML = '<p style="color:#9ca3af;padding:8px 0">未找到匹配商品</p>';
    return;
  }
  list.innerHTML = data.items.map(function (p) {
    return '<div class="item-row">' +
      '<div>' +
        '<a href="#" data-action="search-detail" data-id="' + p.id + '">' + esc(p.name) + '</a>' +
        (p.aliases.length ? '<span style="color:#9ca3af;font-size:12px;margin-left:6px">别名: ' + p.aliases.map(esc).join(", ") + '</span>' : "") +
      '</div>' +
      '<div style="font-size:13px;color:var(--text-secondary)">' +
        '零售: ' + (p.retail_price != null ? "¥" + p.retail_price : "-") +
        ' | 批发: ' + (p.min_wholesale_price != null ? "¥" + p.min_wholesale_price : "-") +
        (showProfit && p.profit != null ? ' | 利润: <span class="' + (p.profit >= 0 ? 'profit-pos' : 'profit-neg') + '">¥' + p.profit + '</span>' : "") +
      '</div>' +
      '</div>';
  }).join("");
}

document.getElementById("search-list").addEventListener("click", function (e) {
  var a = e.target.closest("a[data-action='search-detail']");
  if (a) { e.preventDefault(); showDetail(parseInt(a.dataset.id)); }
});

function clearSearch() {
  document.getElementById("search-results").classList.add("hidden");
  document.getElementById("search-input").value = "";
  loadProducts(currentPage);
}

// ========== 添加商品 ==========
document.getElementById("add-product-form").addEventListener("submit", async function (e) {
  e.preventDefault();
  var name = document.getElementById("add-name").value.trim();
  var retailPrice = document.getElementById("add-retail-price").value;
  var aliasesStr = document.getElementById("add-aliases").value.trim();
  var supplier = document.getElementById("add-supplier").value.trim();
  var wholesalePrice = document.getElementById("add-wholesale-price").value;

  var res = await fetch(API + "/products?name=" + encodeURIComponent(name) + "&retail_price=" + (retailPrice || ""), { method: "POST" });
  if (!res.ok) { toast("添加失败，请检查输入", "error"); return; }
  var product = await res.json();

  if (aliasesStr) {
    var aliases = aliasesStr.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
    for (var i = 0; i < aliases.length; i++) {
      await fetch(API + "/products/" + product.id + "/aliases?alias=" + encodeURIComponent(aliases[i]), { method: "POST" });
    }
  }

  if (supplier && wholesalePrice) {
    await fetch(API + "/products/" + product.id + "/wholesale?supplier=" + encodeURIComponent(supplier) + "&price=" + wholesalePrice, { method: "POST" });
  }

  e.target.reset();
  toast("商品添加成功！", "success");
  showTab("products");
});

// ========== 商品详情 ==========
async function showDetail(id) {
  detailProductId = id;
  showTab("detail");

  var res = await fetch(API + "/products/" + id);
  var p = await res.json();

  document.getElementById("detail-title").textContent = "商品详情 — " + p.name;
  document.getElementById("edit-name").value = p.name;
  document.getElementById("edit-retail-price").value = p.retail_price != null ? p.retail_price : "";

  renderAliases(p.aliases);
  renderWholesale(p.wholesale_prices);
  loadHistory();
}

document.getElementById("back-btn").addEventListener("click", function () { showTab("products"); });

// 编辑基本信息
document.getElementById("edit-product-form").addEventListener("submit", async function (e) {
  e.preventDefault();
  var name = document.getElementById("edit-name").value.trim();
  var retailPrice = document.getElementById("edit-retail-price").value;
  var params = new URLSearchParams();
  params.set("name", name);
  if (retailPrice !== "") params.set("retail_price", retailPrice);

  var res = await fetch(API + "/products/" + detailProductId + "?" + params, { method: "PUT" });
  if (!res.ok) { toast("保存失败", "error"); return; }
  toast("保存成功", "success");
  showDetail(detailProductId);
});

// 别名
function renderAliases(aliases) {
  var div = document.getElementById("aliases-list");
  if (aliases.length === 0) {
    div.innerHTML = '<p style="color:#9ca3af;font-size:13px">暂无别名</p>';
    return;
  }
  div.innerHTML = '<div class="tag-list">' + aliases.map(function (a) {
    return '<span class="tag">' + esc(a.alias) + ' <span class="remove" data-action="del-alias" data-id="' + a.id + '">&times;</span></span>';
  }).join("") + '</div>';
}

document.getElementById("aliases-list").addEventListener("click", async function (e) {
  var btn = e.target.closest("[data-action='del-alias']");
  if (btn) {
    await fetch(API + "/products/" + detailProductId + "/aliases/" + btn.dataset.id, { method: "DELETE" });
    toast("别名已删除");
    showDetail(detailProductId);
  }
});

document.getElementById("add-alias-btn").addEventListener("click", async function () {
  var input = document.getElementById("new-alias-input");
  var alias = input.value.trim();
  if (!alias) return;
  var res = await fetch(API + "/products/" + detailProductId + "/aliases?alias=" + encodeURIComponent(alias), { method: "POST" });
  if (!res.ok) { var err = await res.json(); toast(err.detail || "添加失败", "error"); return; }
  input.value = "";
  toast("别名已添加", "success");
  showDetail(detailProductId);
});

// 批发价
function renderWholesale(prices) {
  var div = document.getElementById("wholesale-list");
  if (prices.length === 0) {
    div.innerHTML = '<p style="color:#9ca3af;font-size:13px">暂无批发价</p>';
    return;
  }
  div.innerHTML = prices.map(function (wp) {
    return '<div class="item-row">' +
      '<span>' + esc(wp.supplier) + ' — <strong>¥' + wp.price + '</strong></span>' +
      '<span>' +
        '<button class="btn-small" data-action="edit-wp" data-id="' + wp.id + '" data-supplier="' + escAttr(wp.supplier) + '" data-price="' + wp.price + '">编辑</button> ' +
        '<button class="btn-danger btn-small" data-action="del-wp" data-id="' + wp.id + '">删除</button>' +
      '</span>' +
      '</div>';
  }).join("");
}

document.getElementById("wholesale-list").addEventListener("click", async function (e) {
  var btn = e.target.closest("[data-action]");
  if (!btn) return;
  var wpid = parseInt(btn.dataset.id);

  if (btn.dataset.action === "del-wp") {
    await fetch(API + "/products/" + detailProductId + "/wholesale/" + wpid, { method: "DELETE" });
    toast("批发价已删除");
    showDetail(detailProductId);
  } else if (btn.dataset.action === "edit-wp") {
    var newPrice = prompt("新批发价:", btn.dataset.price);
    if (newPrice === null) return;
    var newSupplier = prompt("新供应商:", btn.dataset.supplier);
    if (newSupplier === null) return;
    var params = new URLSearchParams();
    params.set("price", newPrice);
    params.set("supplier", newSupplier);
    await fetch(API + "/products/" + detailProductId + "/wholesale/" + wpid + "?" + params, { method: "PUT" });
    toast("批发价已更新", "success");
    showDetail(detailProductId);
  }
});

document.getElementById("add-wp-btn").addEventListener("click", async function () {
  var supplier = document.getElementById("new-wp-supplier").value.trim() || "默认供应商";
  var price = document.getElementById("new-wp-price").value;
  if (!price) return;
  await fetch(API + "/products/" + detailProductId + "/wholesale?supplier=" + encodeURIComponent(supplier) + "&price=" + price, { method: "POST" });
  document.getElementById("new-wp-supplier").value = "";
  document.getElementById("new-wp-price").value = "";
  toast("批发价已添加", "success");
  showDetail(detailProductId);
});

// 价格历史
async function loadHistory() {
  var res = await fetch(API + "/products/" + detailProductId + "/history");
  var data = await res.json();
  var div = document.getElementById("history-list");
  if (data.history.length === 0) {
    div.innerHTML = '<p style="color:#9ca3af;font-size:13px">暂无变动记录</p>';
    return;
  }
  div.innerHTML = data.history.map(function (h) {
    return '<div class="item-row">' +
      '<span style="color:var(--text-secondary);font-size:12px">' + (h.changed_at ? h.changed_at.slice(0, 19).replace("T", " ") : "") + '</span>' +
      '<span>' + (h.field === "retail_price" ? "零售价" : "批发价") + ': ¥' + (h.old_value != null ? h.old_value : "-") + ' → <strong>¥' + (h.new_value != null ? h.new_value : "-") + '</strong></span>' +
      '</div>';
  }).join("");
}

// ========== 统计 ==========
async function loadStats() {
  var statsShow = document.getElementById("toggle-profit-stats").checked;

  var res = await fetch(API + "/stats");
  var data = await res.json();

  document.getElementById("stats-cards").innerHTML =
    '<div class="stat-card"><div class="stat-icon">&#x1F4E6;</div><div class="stat-value">' + data.total_products + '</div><div class="stat-label">商品总数</div></div>' +
    '<div class="stat-card"><div class="stat-icon">&#x1F4CB;</div><div class="stat-value">' + data.total_wholesale_records + '</div><div class="stat-label">批发价记录</div></div>' +
    '<div class="stat-card"><div class="stat-icon">&#x1F3F7;</div><div class="stat-value">' + data.total_aliases + '</div><div class="stat-label">别名总数</div></div>' +
    '<div class="stat-card"><div class="stat-icon">&#x1F4C8;</div><div class="stat-value">' + data.avg_profit_pct + '%</div><div class="stat-label">平均利润率</div></div>';

  document.getElementById("profit-tbody").innerHTML = data.profit_ranking.map(function (p, i) {
    return '<tr>' +
      '<td>' + (i + 1) + '</td>' +
      '<td>' + esc(p.name) + '</td>' +
      '<td>¥' + p.retail_price + '</td>' +
      '<td>¥' + p.min_wholesale_price + '</td>' +
      '<td class="' + (statsShow ? (p.profit >= 0 ? 'profit-pos' : 'profit-neg') : 'profit-hidden-cell') + '">' +
        (statsShow ? "¥" + p.profit : "***") +
      '</td>' +
      '<td class="' + (statsShow ? (p.profit >= 0 ? 'profit-pos' : 'profit-neg') : 'profit-hidden-cell') + '">' +
        (statsShow ? p.profit_pct + "%" : "***") +
      '</td>' +
      '</tr>';
  }).join("");
}

// ========== 工具函数 ==========
function esc(str) {
  var div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escAttr(str) {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ========== 启动 ==========
loadProducts();
