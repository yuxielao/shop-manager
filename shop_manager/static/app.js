const API = "/api";

// ========== 全局状态 ==========
let showProfit = false;
let currentPage = 1;
let detailProductId = null;
let categoriesCache = [];

// ========== 分类数据 ==========
async function loadCategories() {
  const res = await fetch(API + "/categories");
  categoriesCache = await res.json();
  return categoriesCache;
}

function populateSelect(selectId, selectedId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">无分类</option>' +
    categoriesCache.map(function(c) {
      return '<option value="' + c.id + '"' + (c.id === selectedId ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join("");
}

function populateFilterSelect() {
  const sel = document.getElementById("filter-category");
  if (!sel) return;
  sel.innerHTML = '<option value="">全部分类</option>' +
    categoriesCache.map(function(c) {
      return '<option value="' + c.id + '">' + esc(c.name) + '</option>';
    }).join("");
}

// ========== 顶部导航 ==========
document.querySelectorAll(".tab").forEach(function(tab) {
  tab.addEventListener("click", function() {
    document.querySelectorAll(".tab").forEach(function(t) { t.classList.remove("active"); });
    tab.classList.add("active");
    document.querySelectorAll(".tab-content").forEach(function(c) { c.classList.remove("active"); });
    var target = document.getElementById("tab-" + tab.dataset.tab);
    if (target) target.classList.add("active");
    if (tab.dataset.tab === "products") { loadCategories().then(populateFilterSelect); loadProducts(); }
    if (tab.dataset.tab === "add") loadCategories().then(function() { populateSelect("add-category"); });
    if (tab.dataset.tab === "categories") loadCategoryList();
    if (tab.dataset.tab === "stats") loadStats();
  });
});

function showTab(name) {
  document.querySelectorAll(".tab").forEach(function(t) { t.classList.remove("active"); });
  document.querySelectorAll(".tab-content").forEach(function(c) { c.classList.remove("active"); });
  if (name === "detail") {
    document.getElementById("tab-detail").classList.add("active");
  } else {
    var tab = document.querySelector('[data-tab="' + name + '"]');
    if (tab) tab.classList.add("active");
    document.getElementById("tab-" + name).classList.add("active");
    if (name === "products") { loadCategories().then(populateFilterSelect); loadProducts(); }
    if (name === "add") loadCategories().then(function() { populateSelect("add-category"); });
    if (name === "categories") loadCategoryList();
    if (name === "stats") loadStats();
  }
}

// ========== 利润开关 ==========
var toggleProfit = document.getElementById("toggle-profit");
toggleProfit.addEventListener("change", function() {
  showProfit = toggleProfit.checked;
  loadProducts(currentPage);
});

document.getElementById("toggle-profit-stats").addEventListener("change", function() {
  loadStats();
});

// ========== Toast ==========
function toast(msg, type) {
  type = type || "";
  var container = document.getElementById("toast-container");
  var el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(function() { el.remove(); }, 2500);
}

// ========== Modal 确认框 ==========
function confirmDelete(msg) {
  return new Promise(function(resolve) {
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
  var catId = document.getElementById("filter-category") ? document.getElementById("filter-category").value : "";
  var url = API + "/products?page=" + page + "&page_size=20";
  if (catId) url += "&category_id=" + catId;

  try {
    var res = await fetch(url);
  } catch (e) {
    toast("网络错误，无法加载商品列表", "error");
    return;
  }
  var data = await res.json();
  var tbody = document.getElementById("product-tbody");

  tbody.innerHTML = data.items.map(function(p) {
    var profitHtml;
    if (p.best_profit != null) {
      if (showProfit) {
        profitHtml = '<span class="' + (p.best_profit >= 0 ? 'profit-pos' : 'profit-neg') + '">¥' + p.best_profit + '</span>';
      } else {
        profitHtml = '<span class="profit-hidden-text">点击查看</span>';
      }
    } else {
      profitHtml = "-";
    }

    return '<tr>' +
      '<td>' + p.id + '</td>' +
      '<td><a href="#" data-action="detail" data-id="' + p.id + '">' + esc(p.name) + '</a></td>' +
      '<td>' + (p.category_name ? '<span class="cat-tag">' + esc(p.category_name) + '</span>' : '-') + '</td>' +
      '<td>' + (p.min_unit_cost != null ? "¥" + p.min_unit_cost : "-") + '</td>' +
      '<td class="profit-cell" data-profit="' + (p.best_profit != null ? p.best_profit : "") + '">' + profitHtml + '</td>' +
      '<td>' + p.variant_count + '</td>' +
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

// 事件委托：表格操作 + 利润点击
document.getElementById("product-tbody").addEventListener("click", async function(e) {
  var btn = e.target.closest("[data-action]");
  if (btn) {
    e.preventDefault();
    var action = btn.dataset.action;
    var id = parseInt(btn.dataset.id);
    if (action === "detail") {
      showDetail(id);
    } else if (action === "delete") {
      var name = btn.dataset.name;
      var ok = await confirmDelete("确定要删除商品「" + name + "」吗？\n相关的别名、变体和历史记录也会被一起删除。");
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
      setTimeout(function() {
        cell.innerHTML = '<span class="profit-hidden-text">点击查看</span>';
      }, 3000);
    }
  }
});

// 分类筛选联动
document.getElementById("filter-category").addEventListener("change", function() {
  loadProducts(1);
});

// ========== 搜索 ==========
document.getElementById("search-btn").addEventListener("click", search);
document.getElementById("search-input").addEventListener("keydown", function(e) {
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
  list.innerHTML = data.items.map(function(p) {
    return '<div class="item-row">' +
      '<div>' +
        '<a href="#" data-action="search-detail" data-id="' + p.id + '">' + esc(p.name) + '</a>' +
        (p.category_name ? '<span class="cat-tag" style="margin-left:6px">' + esc(p.category_name) + '</span>' : "") +
        (p.aliases && p.aliases.length ? '<span style="color:#9ca3af;font-size:12px;margin-left:6px">别名: ' + p.aliases.map(function(a){return esc(a.alias);}).join(", ") + '</span>' : "") +
      '</div>' +
      '<div style="font-size:13px;color:var(--text-secondary)">' +
        (p.min_unit_cost != null ? '进货: ¥' + p.min_unit_cost + '/件' : '') +
        (showProfit && p.best_profit != null ? ' | 利润: <span class="' + (p.best_profit >= 0 ? 'profit-pos' : 'profit-neg') + '">¥' + p.best_profit + '</span>' : "") +
      '</div>' +
      '</div>';
  }).join("");
}

document.getElementById("search-list").addEventListener("click", function(e) {
  var a = e.target.closest("a[data-action='search-detail']");
  if (a) { e.preventDefault(); showDetail(parseInt(a.dataset.id)); }
});

function clearSearch() {
  document.getElementById("search-results").classList.add("hidden");
  document.getElementById("search-input").value = "";
  loadProducts(currentPage);
}

// ========== 添加商品 ==========
document.getElementById("add-product-form").addEventListener("submit", async function(e) {
  e.preventDefault();
  var name = document.getElementById("add-name").value.trim();
  var categoryId = document.getElementById("add-category").value;
  var size = document.getElementById("add-size").value.trim();
  var caseSize = document.getElementById("add-case-size").value;
  var purchasePrice = document.getElementById("add-purchase-price").value;
  var wholesalePrice = document.getElementById("add-wholesale-price").value;
  var retailPrice = document.getElementById("add-retail-price").value;
  var aliasesStr = document.getElementById("add-aliases").value.trim();

  var params = new URLSearchParams();
  params.set("name", name);
  if (categoryId) params.set("category_id", categoryId);
  if (size) params.set("size", size);
  if (caseSize) params.set("case_size", caseSize);
  if (purchasePrice) params.set("purchase_price", purchasePrice);
  if (wholesalePrice) params.set("wholesale_price", wholesalePrice);
  if (retailPrice) params.set("retail_price", retailPrice);

  var res = await fetch(API + "/products?" + params, { method: "POST" });
  if (!res.ok) { toast("添加失败，请检查输入", "error"); return; }
  var product = await res.json();

  if (aliasesStr) {
    var aliases = aliasesStr.split(/[,，]/).map(function(s) { return s.trim(); }).filter(Boolean);
    for (var i = 0; i < aliases.length; i++) {
      await fetch(API + "/products/" + product.id + "/aliases?alias=" + encodeURIComponent(aliases[i]), { method: "POST" });
    }
  }

  e.target.reset();
  document.getElementById("add-case-size").value = "1";
  toast("商品添加成功！", "success");
  showTab("products");
});

// ========== 分类管理 ==========
async function loadCategoryList() {
  await loadCategories();
  var tbody = document.getElementById("category-tbody");
  tbody.innerHTML = categoriesCache.map(function(c) {
    return '<tr>' +
      '<td>' + c.id + '</td>' +
      '<td><input type="text" value="' + escAttr(c.name) + '" data-cat-id="' + c.id + '" class="cat-name-input"></td>' +
      '<td>' + c.sort_order + '</td>' +
      '<td>' +
        '<button class="btn-small btn-save-cat" data-cat-id="' + c.id + '">保存</button> ' +
        '<button class="btn-danger btn-small btn-del-cat" data-cat-id="' + c.id + '" data-cat-name="' + escAttr(c.name) + '">删除</button>' +
      '</td>' +
      '</tr>';
  }).join("");
}

document.getElementById("category-tbody").addEventListener("click", async function(e) {
  var btn = e.target.closest("button");
  if (!btn) return;
  var catId = parseInt(btn.dataset.catId);

  if (btn.classList.contains("btn-save-cat")) {
    var input = document.querySelector('.cat-name-input[data-cat-id="' + catId + '"]');
    var newName = input.value.trim();
    if (!newName) { toast("分类名不能为空", "error"); return; }
    var res = await fetch(API + "/categories/" + catId + "?name=" + encodeURIComponent(newName), { method: "PUT" });
    if (!res.ok) { var err = await res.json(); toast(err.detail || "保存失败", "error"); return; }
    toast("已保存");
    loadCategoryList();
  } else if (btn.classList.contains("btn-del-cat")) {
    var ok = await confirmDelete("确定要删除分类「" + btn.dataset.catName + "」吗？");
    if (!ok) return;
    var res = await fetch(API + "/categories/" + catId, { method: "DELETE" });
    if (!res.ok) { var err = await res.json(); toast(err.detail || "删除失败", "error"); return; }
    toast("分类已删除");
    loadCategoryList();
  }
});

document.getElementById("add-category-btn").addEventListener("click", async function() {
  var input = document.getElementById("new-category-name");
  var name = input.value.trim();
  if (!name) { toast("请输入分类名称", "error"); return; }
  var res = await fetch(API + "/categories?name=" + encodeURIComponent(name), { method: "POST" });
  if (!res.ok) { var err = await res.json(); toast(err.detail || "添加失败", "error"); return; }
  input.value = "";
  toast("分类已添加", "success");
  loadCategoryList();
});

// ========== 商品详情 ==========
async function showDetail(id) {
  detailProductId = id;
  await loadCategories();
  populateSelect("edit-category");
  showTab("detail");

  var res = await fetch(API + "/products/" + id);
  var p = await res.json();

  document.getElementById("detail-title").textContent = "商品详情 — " + p.name;
  document.getElementById("edit-name").value = p.name;
  populateSelect("edit-category", p.category_id);

  renderAliases(p.aliases);
  renderVariants(p.variants);
  loadHistory();
}

document.getElementById("back-btn").addEventListener("click", function() { showTab("products"); });

// 编辑基本信息
document.getElementById("edit-product-form").addEventListener("submit", async function(e) {
  e.preventDefault();
  var name = document.getElementById("edit-name").value.trim();
  var categoryId = document.getElementById("edit-category").value;
  var params = new URLSearchParams();
  params.set("name", name);
  params.set("category_id", categoryId);

  var res = await fetch(API + "/products/" + detailProductId + "?" + params, { method: "PUT" });
  if (!res.ok) { toast("保存失败", "error"); return; }
  toast("保存成功", "success");
  showDetail(detailProductId);
});

// 别名
function renderAliases(aliases) {
  var div = document.getElementById("aliases-list");
  if (!aliases || aliases.length === 0) {
    div.innerHTML = '<p style="color:#9ca3af;font-size:13px">暂无别名</p>';
    return;
  }
  div.innerHTML = '<div class="tag-list">' + aliases.map(function(a) {
    return '<span class="tag">' + esc(a.alias) + ' <span class="remove" data-action="del-alias" data-id="' + a.id + '">&times;</span></span>';
  }).join("") + '</div>';
}

document.getElementById("aliases-list").addEventListener("click", async function(e) {
  var btn = e.target.closest("[data-action='del-alias']");
  if (btn) {
    await fetch(API + "/products/" + detailProductId + "/aliases/" + btn.dataset.id, { method: "DELETE" });
    toast("别名已删除");
    showDetail(detailProductId);
  }
});

document.getElementById("add-alias-btn").addEventListener("click", async function() {
  var input = document.getElementById("new-alias-input");
  var alias = input.value.trim();
  if (!alias) return;
  var res = await fetch(API + "/products/" + detailProductId + "/aliases?alias=" + encodeURIComponent(alias), { method: "POST" });
  if (!res.ok) { var err = await res.json(); toast(err.detail || "添加失败", "error"); return; }
  input.value = "";
  toast("别名已添加", "success");
  showDetail(detailProductId);
});

// 变体
function renderVariants(variants) {
  var div = document.getElementById("variants-list");
  if (!variants || variants.length === 0) {
    div.innerHTML = '<p style="color:#9ca3af;font-size:13px">暂无变体，请在下方添加</p>';
    return;
  }
  div.innerHTML = variants.map(function(v) {
    var unitCost = v.unit_cost != null ? "¥" + v.unit_cost : "-";
    var unitProfit = v.unit_profit != null ? "¥" + v.unit_profit : "-";
    return '<div class="variant-card">' +
      '<div class="variant-header">' +
        '<strong>' + (v.size || "默认规格") + '</strong>' +
        '<span style="font-size:12px;color:var(--text-secondary)">' + v.case_size + '个/件</span>' +
        '<div style="margin-left:auto">' +
          '<button class="btn-small btn-edit-var" data-vid="' + v.id + '">编辑</button> ' +
          '<button class="btn-danger btn-small btn-del-var" data-vid="' + v.id + '">删除</button>' +
        '</div>' +
      '</div>' +
      '<div class="variant-prices">' +
        '<div class="vp-item"><span class="vp-label">进货价</span><span>¥' + (v.purchase_price != null ? v.purchase_price : "-") + ' /件</span></div>' +
        '<div class="vp-item"><span class="vp-label">批发价</span><span>¥' + (v.wholesale_price != null ? v.wholesale_price : "-") + ' /件</span></div>' +
        '<div class="vp-item"><span class="vp-label">零售价</span><span>¥' + (v.retail_price != null ? v.retail_price : "-") + ' /个</span></div>' +
        '<div class="vp-item"><span class="vp-label">单件成本</span><span>' + unitCost + '</span></div>' +
        '<div class="vp-item"><span class="vp-label">单件利润</span><span class="' + (v.unit_profit != null && v.unit_profit >= 0 ? 'profit-pos' : 'profit-neg') + '">' + unitProfit + '</span></div>' +
      '</div>' +
      '</div>';
  }).join("");
}

document.getElementById("variants-list").addEventListener("click", async function(e) {
  var btn = e.target.closest("button");
  if (!btn) return;
  var vid = parseInt(btn.dataset.vid);

  if (btn.classList.contains("btn-del-var")) {
    var ok = await confirmDelete("确定要删除此变体吗？");
    if (!ok) return;
    await fetch(API + "/products/" + detailProductId + "/variants/" + vid, { method: "DELETE" });
    toast("变体已删除");
    showDetail(detailProductId);
  } else if (btn.classList.contains("btn-edit-var")) {
    editalert_variant(vid);
  }
});

function editalert_variant(vid) {
  // 找到变体数据
  fetch(API + "/products/" + detailProductId).then(function(res) { return res.json(); }).then(function(p) {
    var v = p.variants.find(function(x) { return x.id === vid; });
    if (!v) return;
    var newSize = prompt("规格:", v.size || "");
    if (newSize === null) return;
    var newCase = prompt("整件数量:", v.case_size);
    if (newCase === null) return;
    var newPurchase = prompt("进货价:", v.purchase_price != null ? v.purchase_price : "");
    if (newPurchase === null) return;
    var newWholesale = prompt("批发价:", v.wholesale_price != null ? v.wholesale_price : "");
    if (newWholesale === null) return;
    var newRetail = prompt("零售价:", v.retail_price != null ? v.retail_price : "");
    if (newRetail === null) return;

    var params = new URLSearchParams();
    params.set("size", newSize);
    params.set("case_size", newCase);
    if (newPurchase !== "") params.set("purchase_price", newPurchase);
    if (newWholesale !== "") params.set("wholesale_price", newWholesale);
    if (newRetail !== "") params.set("retail_price", newRetail);

    fetch(API + "/products/" + detailProductId + "/variants/" + vid + "?" + params, { method: "PUT" })
      .then(function() {
        toast("变体已更新", "success");
        showDetail(detailProductId);
      });
  });
}

document.getElementById("add-variant-btn").addEventListener("click", async function() {
  var size = document.getElementById("new-var-size").value.trim();
  var caseSize = document.getElementById("new-var-case-size").value;
  var purchase = document.getElementById("new-var-purchase").value;
  var wholesale = document.getElementById("new-var-wholesale").value;
  var retail = document.getElementById("new-var-retail").value;

  var params = new URLSearchParams();
  if (size) params.set("size", size);
  if (caseSize) params.set("case_size", caseSize);
  if (purchase) params.set("purchase_price", purchase);
  if (wholesale) params.set("wholesale_price", wholesale);
  if (retail) params.set("retail_price", retail);

  var res = await fetch(API + "/products/" + detailProductId + "/variants?" + params, { method: "POST" });
  if (!res.ok) { toast("添加失败", "error"); return; }
  document.getElementById("new-var-size").value = "";
  document.getElementById("new-var-case-size").value = "1";
  document.getElementById("new-var-purchase").value = "";
  document.getElementById("new-var-wholesale").value = "";
  document.getElementById("new-var-retail").value = "";
  toast("变体已添加", "success");
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
  var fieldNames = { purchase_price: "进货价", wholesale_price: "批发价", retail_price: "零售价" };
  div.innerHTML = data.history.map(function(h) {
    return '<div class="item-row">' +
      '<span style="color:var(--text-secondary);font-size:12px">' + (h.changed_at ? h.changed_at.slice(0, 19).replace("T", " ") : "") + '</span>' +
      '<span>' + (fieldNames[h.field] || h.field) + ': ¥' + (h.old_value != null ? h.old_value : "-") + ' → <strong>¥' + (h.new_value != null ? h.new_value : "-") + '</strong></span>' +
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
    '<div class="stat-card"><div class="stat-icon">&#x1F4CB;</div><div class="stat-value">' + data.total_variants + '</div><div class="stat-label">变体总数</div></div>' +
    '<div class="stat-card"><div class="stat-icon">&#x1F3F7;</div><div class="stat-value">' + data.total_aliases + '</div><div class="stat-label">别名总数</div></div>' +
    '<div class="stat-card"><div class="stat-icon">&#x1F4C8;</div><div class="stat-value">' + data.avg_profit_pct + '%</div><div class="stat-label">平均利润率</div></div>';

  // 分类分布
  var catDistDiv = document.getElementById("category-distribution");
  if (data.category_distribution && data.category_distribution.length > 0) {
    catDistDiv.innerHTML = data.category_distribution.map(function(d) {
      return '<div class="stat-card"><div class="stat-icon">&#x1F4C1;</div><div class="stat-value">' + d.count + '</div><div class="stat-label">' + esc(d.name || "未分类") + '</div></div>';
    }).join("");
  } else {
    catDistDiv.innerHTML = "";
  }

  document.getElementById("profit-tbody").innerHTML = data.profit_ranking.map(function(p, i) {
    return '<tr>' +
      '<td>' + (i + 1) + '</td>' +
      '<td>' + esc(p.product_name) + '</td>' +
      '<td>' + (p.size || "-") + '</td>' +
      '<td>¥' + (p.retail_price != null ? p.retail_price : "-") + '</td>' +
      '<td>¥' + (p.unit_cost != null ? p.unit_cost : "-") + '</td>' +
      '<td class="' + (statsShow ? (p.unit_profit >= 0 ? 'profit-pos' : 'profit-neg') : 'profit-hidden-cell') + '">' +
        (statsShow ? "¥" + p.unit_profit : "***") +
      '</td>' +
      '<td class="' + (statsShow ? (p.unit_profit >= 0 ? 'profit-pos' : 'profit-neg') : 'profit-hidden-cell') + '">' +
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
loadCategories().then(function() {
  populateFilterSelect();
  loadProducts();
});
