(function () {
  "use strict";

  const STORAGE_KEY = "travel-checklist-v1";
  const SOLO_STORAGE_KEY = "travel-checklist-solo-v1";
  const MEMBER_KEY = "travel-checklist-member";
  const config = window.TRAVEL_CONFIG || {};

  const DEFAULT_STATE = {
    settings: {
      destination: "",
      startDate: "",
      endDate: "",
      members: [
        { id: "a", name: "小猫", avatar: "🐱" },
        { id: "b", name: "小熊", avatar: "🐻" }
      ]
    },
    categories: [
      { id: "documents", name: "证件与财物", emoji: "🪪", sortOrder: 0, deleted: false, updatedAt: new Date().toISOString() },
      { id: "clothes", name: "衣物穿搭", emoji: "👕", sortOrder: 1, deleted: false, updatedAt: new Date().toISOString() },
      { id: "care", name: "洗漱与护理", emoji: "🫧", sortOrder: 2, deleted: false, updatedAt: new Date().toISOString() },
      { id: "electronics", name: "电子设备", emoji: "🎧", sortOrder: 3, deleted: false, updatedAt: new Date().toISOString() },
      { id: "daily", name: "药品与日用", emoji: "🌷", sortOrder: 4, deleted: false, updatedAt: new Date().toISOString() }
    ],
    items: [
      { id: "item-01", categoryId: "documents", name: "身份证", noteA: "出门前确认放进包里", noteB: "", doneA: false, doneB: false, sortOrder: 0, deleted: false, updatedAt: new Date().toISOString() },
      { id: "item-02", categoryId: "documents", name: "学生证 / 优惠证件", noteA: "", noteB: "", doneA: false, doneB: false, sortOrder: 1, deleted: false, updatedAt: new Date().toISOString() },
      { id: "item-03", categoryId: "documents", name: "车票、酒店订单", noteA: "提前保存电子凭证", noteB: "", doneA: false, doneB: false, sortOrder: 2, deleted: false, updatedAt: new Date().toISOString() },
      { id: "item-04", categoryId: "documents", name: "钱包 / 银行卡", noteA: "", noteB: "", doneA: false, doneB: false, sortOrder: 3, deleted: false, updatedAt: new Date().toISOString() },
      { id: "item-05", categoryId: "clothes", name: "换洗上衣", noteA: "按天数准备", noteB: "可以多带一件", doneA: false, doneB: false, sortOrder: 0, deleted: false, updatedAt: new Date().toISOString() },
      { id: "item-06", categoryId: "clothes", name: "裤子 / 裙子", noteA: "", noteB: "", doneA: false, doneB: false, sortOrder: 1, deleted: false, updatedAt: new Date().toISOString() },
      { id: "item-07", categoryId: "clothes", name: "内衣、袜子", noteA: "", noteB: "", doneA: false, doneB: false, sortOrder: 2, deleted: false, updatedAt: new Date().toISOString() },
      { id: "item-08", categoryId: "clothes", name: "睡衣 / 舒适家居服", noteA: "", noteB: "", doneA: false, doneB: false, sortOrder: 3, deleted: false, updatedAt: new Date().toISOString() },
      { id: "item-09", categoryId: "care", name: "牙刷、牙膏", noteA: "", noteB: "", doneA: false, doneB: false, sortOrder: 0, deleted: false, updatedAt: new Date().toISOString() },
      { id: "item-10", categoryId: "care", name: "洗面奶 / 护肤品", noteA: "分装小瓶更省空间", noteB: "", doneA: false, doneB: false, sortOrder: 1, deleted: false, updatedAt: new Date().toISOString() },
      { id: "item-11", categoryId: "care", name: "防晒用品", noteA: "", noteB: "", doneA: false, doneB: false, sortOrder: 2, deleted: false, updatedAt: new Date().toISOString() },
      { id: "item-12", categoryId: "electronics", name: "手机充电器", noteA: "", noteB: "", doneA: false, doneB: false, sortOrder: 0, deleted: false, updatedAt: new Date().toISOString() },
      { id: "item-13", categoryId: "electronics", name: "充电宝", noteA: "出发前充满电", noteB: "", doneA: false, doneB: false, sortOrder: 1, deleted: false, updatedAt: new Date().toISOString() },
      { id: "item-14", categoryId: "electronics", name: "耳机 / 相机", noteA: "", noteB: "", doneA: false, doneB: false, sortOrder: 2, deleted: false, updatedAt: new Date().toISOString() },
      { id: "item-15", categoryId: "daily", name: "常用药品", noteA: "按个人需要准备", noteB: "", doneA: false, doneB: false, sortOrder: 0, deleted: false, updatedAt: new Date().toISOString() },
      { id: "item-16", categoryId: "daily", name: "纸巾、湿巾", noteA: "", noteB: "", doneA: false, doneB: false, sortOrder: 1, deleted: false, updatedAt: new Date().toISOString() },
      { id: "item-17", categoryId: "daily", name: "口罩 / 收纳袋", noteA: "", noteB: "", doneA: false, doneB: false, sortOrder: 2, deleted: false, updatedAt: new Date().toISOString() }
    ]
  };

  let appMode = "home";
  let state = loadLocalState();
  let activeMember = localStorage.getItem(MEMBER_KEY) || "a";
  let editingItemId = null;
  let collapsedCategories = new Set();
  let room = null;
  let supabaseClient = null;
  let realtimeChannel = null;
  let cloudRevision = 0;
  let localVersion = 0;
  let lastSyncedVersion = 0;
  let saveTimer = null;
  let saveInFlight = false;
  let saveAgain = false;
  let toastTimer = null;

  const $ = (id) => document.getElementById(id);
  const activeCategories = () => state.categories.filter((category) => !category.deleted).sort((a, b) => a.sortOrder - b.sortOrder);
  const activeItems = () => state.items.filter((item) => !item.deleted);
  const member = (id) => state.settings.members.find((person) => person.id === id) || state.settings.members[0];

  function loadLocalState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && saved.settings && Array.isArray(saved.items) && Array.isArray(saved.categories)) return saved;
    } catch (error) {
      console.warn("Could not read saved checklist", error);
    }
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  function loadSoloState() {
    let solo = null;
    try {
      const saved = JSON.parse(localStorage.getItem(SOLO_STORAGE_KEY) || "null");
      if (saved && saved.settings && Array.isArray(saved.items) && Array.isArray(saved.categories)) solo = saved;
    } catch (error) {
      console.warn("Could not read solo checklist", error);
    }
    const savedName = solo && solo.settings.members && solo.settings.members[0]
      ? solo.settings.members[0].name
      : "我";
    solo = solo || JSON.parse(JSON.stringify(DEFAULT_STATE));
    solo.settings.members = [{ id: "a", name: savedName || "我", avatar: "🧳" }];
    solo.items = solo.items.map((item) => ({ ...item, noteB: "", doneB: false }));
    return solo;
  }

  function saveLocalState() {
    try {
      const storageKey = appMode === "solo" ? SOLO_STORAGE_KEY : STORAGE_KEY;
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      console.warn("Could not save checklist locally", error);
      showToast("本机存储空间不足，建议先保存图片。");
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function updateState(mutator, shouldRender) {
    const next = clone(state);
    mutator(next);
    state = next;
    localVersion += 1;
    saveLocalState();
    if (shouldRender !== false) render();
    queueCloudSave();
    $("saveHint").textContent = room ? "正在同步更改…" : "已保存在这台设备";
  }

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2400);
  }

  function setSyncStatus(mode, label) {
    const badge = $("syncBadge");
    badge.className = "sync-badge" + (mode === "cloud" ? " is-cloud" : mode === "error" ? " is-error" : "");
    badge.innerHTML = '<span class="status-dot"></span>' + escapeHtml(label);
  }

  function openDialog(id) {
    const dialog = $(id);
    if (dialog && typeof dialog.showModal === "function") dialog.showModal();
  }

  function closeDialog(id) {
    const dialog = $(id);
    if (dialog && dialog.open) dialog.close();
  }

  function render() {
    $("destination").value = state.settings.destination || "";
    $("startDate").value = state.settings.startDate || "";
    $("endDate").value = state.settings.endDate || "";
    $("workspaceTitle").textContent = appMode === "solo" ? "我的行李清单" : "我们的行李清单";
    $("heroSubtitle").innerHTML = appMode === "solo"
      ? '一个人的行李，也要准备得刚刚好 <span>♡</span>'
      : '两个人的小行李，一张清单就够啦 <span>♡</span>';
    $("inviteBtn").hidden = appMode === "solo";
    renderProgress();
    renderIdentity();
    renderCategories();
    $("itemCount").textContent = activeItems().length + " 件物品";
  }

  function renderPreservingReplyFocus() {
    const active = document.activeElement;
    const focusInfo = active && active.matches && active.matches("[data-item-reply]")
      ? {
          itemId: active.dataset.itemReply,
          memberId: active.dataset.member,
          start: active.selectionStart,
          end: active.selectionEnd
        }
      : null;
    render();
    if (!focusInfo) return;
    const target = Array.from($("categoryList").querySelectorAll("[data-item-reply]")).find((input) =>
      input.dataset.itemReply === focusInfo.itemId && input.dataset.member === focusInfo.memberId
    );
    if (!target) return;
    target.focus({ preventScroll: true });
    if (typeof focusInfo.start === "number" && typeof focusInfo.end === "number") {
      try { target.setSelectionRange(focusInfo.start, focusInfo.end); } catch (error) { /* input may not support selection */ }
    }
  }

  function renderProgress() {
    const items = activeItems();
    const people = appMode === "solo" ? state.settings.members.slice(0, 1) : state.settings.members;
    const total = items.length * people.length;
    const done = items.reduce((sum, item) => sum + (item.doneA ? 1 : 0) + (appMode === "solo" ? 0 : (item.doneB ? 1 : 0)), 0);
    const percent = total ? Math.round(done / total * 100) : 0;
    $("overallProgress").textContent = percent + "%";
    $("overallBar").style.width = percent + "%";
    $("progressCaption").textContent = total && done === total
      ? "全部准备好啦！接下来就期待出发吧。♡"
      : done
        ? "已经完成 " + done + " / " + total + " 项小准备，继续加油。"
        : "每完成一件小事，离出发就更近一点。";

    $("memberProgress").innerHTML = people.map((person) => {
      const count = items.filter((item) => person.id === "a" ? item.doneA : item.doneB).length;
      const rate = items.length ? Math.round(count / items.length * 100) : 0;
      return '<div class="member-card">' +
        '<div class="member-avatar">' + escapeHtml(person.avatar) + '</div>' +
        '<div class="member-info"><div class="member-info-top">' +
        '<button class="member-name" type="button" data-rename-member="' + person.id + '" title="点击修改称呼">' + escapeHtml(person.name) + '</button>' +
        '<span class="member-count">' + count + ' / ' + items.length + ' 件</span>' +
        '</div><div class="member-mini-track"><span style="width:' + rate + '%"></span></div></div></div>';
    }).join("");
  }

  function renderIdentity() {
    $("identityLabel").innerHTML = appMode === "solo"
      ? '<span class="identity-sparkle">✦</span> 正在整理自己的行李'
      : '<span class="identity-sparkle">✦</span> 现在以谁的身份打勾？';
    $("identityButtons").innerHTML = state.settings.members.map((person) => {
      return '<button type="button" class="identity-button ' + (activeMember === person.id ? "active" : "") + '" data-select-member="' + person.id + '">' +
        escapeHtml(person.avatar) + " " + escapeHtml(person.name) + (activeMember === person.id ? " · 正在使用" : "") + "</button>";
    }).join("");
  }

  function renderCategories() {
    const query = $("searchInput").value.trim().toLowerCase();
    const categories = activeCategories();
    const visibleCategoryHtml = [];

    categories.forEach((category) => {
      const allCategoryItems = activeItems().filter((item) => item.categoryId === category.id).sort((a, b) => a.sortOrder - b.sortOrder);
      const matchingItems = allCategoryItems.filter((item) => {
        if (!query) return true;
        return (item.name + " " + (item.noteA || "") + " " + (item.noteB || "")).toLowerCase().includes(query);
      });
      if (query && !matchingItems.length) return;

      const doneCount = allCategoryItems.reduce((sum, item) => sum + (item.doneA ? 1 : 0) + (appMode === "solo" ? 0 : (item.doneB ? 1 : 0)), 0);
      const categoryTotal = allCategoryItems.length * (appMode === "solo" ? 1 : 2);
      const isCollapsed = collapsedCategories.has(category.id);
      const itemHtml = matchingItems.map(renderItem).join("");
      visibleCategoryHtml.push(
        '<section class="category-card" data-category="' + escapeHtml(category.id) + '">' +
          '<div class="category-header" data-toggle-category="' + escapeHtml(category.id) + '" role="button" tabindex="0">' +
            '<div class="category-emoji">' + escapeHtml(category.emoji) + '</div>' +
            '<div class="category-title-wrap"><h3 class="category-title">' + escapeHtml(category.name) + '</h3>' +
              '<div class="category-subtitle">' + allCategoryItems.length + ' 件小物品 · ' + (appMode === "solo" ? "准备好一件就勾选一件" : "每个人都可以独立打勾") + '</div></div>' +
            '<span class="category-progress">' + doneCount + ' / ' + categoryTotal + '</span>' +
            '<button class="category-toggle" type="button" aria-label="折叠或展开">' + (isCollapsed ? "+" : "−") + '</button>' +
          '</div>' +
          (isCollapsed ? "" : '<div class="category-items">' + (itemHtml || '<div class="empty-state"><div class="empty-emoji">🌱</div><strong>这个分类还空空的</strong><p>把需要带的小东西加进来吧。</p></div>') + '</div>') +
        '</section>'
      );
    });

    if (!visibleCategoryHtml.length) {
      $("categoryList").innerHTML = '<div class="empty-state"><div class="empty-emoji">' + (query ? "🔎" : "🧺") + '</div><strong>' + (query ? "没有找到这件东西" : "清单还是空的") + '</strong><p>' + (query ? "换个关键词试试看。" : "添加几件旅行必需品，让准备慢慢变完整。") + '</p></div>';
    } else {
      $("categoryList").innerHTML = visibleCategoryHtml.join("");
    }
  }

  function renderItem(item) {
    const personA = member("a");
    const personB = appMode === "solo" ? null : member("b");
    const bothDone = item.doneA && (appMode === "solo" || item.doneB);
    const itemId = escapeHtml(item.id);
    const replyA =
      '<label class="item-reply reply-a">' +
        '<span class="reply-person"><span class="tiny-avatar">' + escapeHtml(personA.avatar) + '</span><span>' + escapeHtml(personA.name) + ' 的回复</span></span>' +
        '<input type="text" maxlength="120" data-item-reply="' + itemId + '" data-member="a" value="' + escapeHtml(item.noteA || "") + '" placeholder="写下你的回复，例如：带上啦" aria-label="' + escapeHtml(personA.name) + ' 对 ' + escapeHtml(item.name) + ' 的回复">' +
      '</label>';
    const replyB = personB
      ? '<label class="item-reply reply-b">' +
          '<span class="reply-person"><span class="tiny-avatar">' + escapeHtml(personB.avatar) + '</span><span>' + escapeHtml(personB.name) + ' 的回复</span></span>' +
          '<input type="text" maxlength="120" data-item-reply="' + itemId + '" data-member="b" value="' + escapeHtml(item.noteB || "") + '" placeholder="写下你的回复，例如：还没准备" aria-label="' + escapeHtml(personB.name) + ' 对 ' + escapeHtml(item.name) + ' 的回复">' +
        '</label>'
      : "";
    const checkA =
      '<label class="person-check ' + (item.doneA ? "checked-a" : "") + '">' +
        '<input type="checkbox" data-item-check="' + itemId + '" data-member="a" ' + (item.doneA ? "checked" : "") + '>' +
        '<span class="tiny-avatar">' + escapeHtml(personA.avatar) + '</span><span>' + escapeHtml(personA.name) + (item.doneA ? " 已收好" : " 待准备") + '</span>' +
      '</label>';
    const checkB = personB
      ? '<label class="person-check ' + (item.doneB ? "checked-b" : "") + '">' +
          '<input type="checkbox" data-item-check="' + itemId + '" data-member="b" ' + (item.doneB ? "checked" : "") + '>' +
          '<span class="tiny-avatar">' + escapeHtml(personB.avatar) + '</span><span>' + escapeHtml(personB.name) + (item.doneB ? " 已收好" : " 待准备") + '</span>' +
        '</label>'
      : "";
    return '<article class="item-card" data-item="' + itemId + '">' +
      '<div class="item-topline"><p class="item-name ' + (bothDone ? "done-both" : "") + '">' + escapeHtml(item.name) + '</p>' +
        '<div class="item-tools">' +
          '<button type="button" class="item-tool" data-edit-item="' + itemId + '" title="编辑">✎</button>' +
          '<button type="button" class="item-tool" data-delete-item="' + itemId + '" title="删除">×</button>' +
        '</div></div>' +
      '<div class="item-replies ' + (appMode === "solo" ? "solo-replies" : "") + '">' + replyA + replyB + '</div>' +
      '<div class="check-row">' + checkA + checkB + '</div></article>';
  }

  function populateCategorySelect(selectedId) {
    $("itemCategory").innerHTML = activeCategories().map((category) =>
      '<option value="' + escapeHtml(category.id) + '" ' + (category.id === selectedId ? "selected" : "") + '>' +
      escapeHtml(category.emoji + " " + category.name) + "</option>"
    ).join("");
  }

  function openItemEditor(itemId) {
    const item = itemId ? state.items.find((entry) => entry.id === itemId && !entry.deleted) : null;
    editingItemId = item ? item.id : null;
    $("itemDialogTitle").textContent = item ? "编辑这件物品" : "添加一件物品";
    $("itemName").value = item ? item.name : "";
    populateCategorySelect(item ? item.categoryId : (activeCategories()[0] || {}).id);
    $("itemNoteA").value = item ? item.noteA || "" : "";
    $("itemNoteB").value = item ? item.noteB || "" : "";
    $("itemNoteBField").hidden = appMode === "solo";
    $("notesHeading").textContent = appMode === "solo" ? "我的回复" : "两个人各自的回复";
    openDialog("itemDialog");
    window.setTimeout(() => $("itemName").focus(), 50);
  }

  function saveItemFromForm(event) {
    event.preventDefault();
    const name = $("itemName").value.trim();
    const categoryId = $("itemCategory").value;
    if (!name || !categoryId) {
      showToast("先填写物品名称，并选择一个分类。");
      return;
    }
    const noteA = $("itemNoteA").value.trim();
    const noteB = $("itemNoteB").value.trim();
    updateState((next) => {
      const existing = next.items.find((item) => item.id === editingItemId);
      const now = new Date().toISOString();
      if (existing) {
        existing.name = name;
        existing.categoryId = categoryId;
        if ((existing.noteA || "") !== noteA) existing.noteAUpdatedAt = now;
        if ((existing.noteB || "") !== noteB) existing.noteBUpdatedAt = now;
        existing.noteA = noteA;
        existing.noteB = noteB;
        existing.updatedAt = now;
      } else {
        const categoryItems = next.items.filter((item) => !item.deleted && item.categoryId === categoryId);
        next.items.push({
          id: makeId(), categoryId: categoryId, name: name, noteA: noteA, noteB: noteB,
          noteAUpdatedAt: now, noteBUpdatedAt: now,
          doneA: false, doneB: false, doneAUpdatedAt: now, doneBUpdatedAt: now,
          sortOrder: categoryItems.length, deleted: false, updatedAt: now
        });
      }
    });
    closeDialog("itemDialog");
    showToast(editingItemId ? "这件物品更新好啦。" : "已经放进清单啦。");
  }

  function createCategory(event) {
    event.preventDefault();
    const name = $("categoryName").value.trim();
    const emoji = $("categoryEmoji").value.trim() || "🌷";
    if (!name) return;
    if (activeCategories().some((category) => category.name.toLowerCase() === name.toLowerCase())) {
      showToast("这个分类已经有啦。");
      return;
    }
    updateState((next) => {
      next.categories.push({ id: makeId(), name: name, emoji: emoji, sortOrder: next.categories.length, deleted: false, updatedAt: new Date().toISOString() });
    });
    closeDialog("categoryDialog");
    $("categoryForm").reset();
    $("categoryEmoji").value = "🌷";
    showToast("新分类创建好啦。");
  }

  function renameMember(memberId) {
    const person = member(memberId);
    const nextName = window.prompt("给这位同行伙伴起个称呼：", person.name);
    if (nextName === null) return;
    const cleanName = nextName.trim().slice(0, 12);
    if (!cleanName) {
      showToast("称呼不能为空哦。");
      return;
    }
    updateState((next) => {
      const target = next.settings.members.find((entry) => entry.id === memberId);
      if (target) target.name = cleanName;
    });
  }

  function toggleCategory(categoryId) {
    if (collapsedCategories.has(categoryId)) collapsedCategories.delete(categoryId);
    else collapsedCategories.add(categoryId);
    renderCategories();
  }

  function deleteItem(itemId) {
    const item = state.items.find((entry) => entry.id === itemId);
    if (!item || !window.confirm("确定把「" + item.name + "」从清单里移除吗？")) return;
    updateState((next) => {
      const target = next.items.find((entry) => entry.id === itemId);
      if (target) {
        target.deleted = true;
        target.updatedAt = new Date().toISOString();
      }
    });
    showToast("已从清单移除。");
  }

  function resetChecks() {
    const message = appMode === "solo"
      ? "要重置这份清单的勾选状态吗？物品和回复会保留。"
      : "要把两个人的勾选状态都重置吗？物品和备注会保留。";
    if (!window.confirm(message)) return;
    updateState((next) => {
      next.items.forEach((item) => {
        if (!item.deleted) {
          item.doneA = false;
          if (appMode !== "solo") item.doneB = false;
          item.updatedAt = new Date().toISOString();
        }
      });
    });
    showToast("勾选状态已重置，清单和回复都保留着。");
  }

  function updateTripField(field, value) {
    updateState((next) => { next.settings[field] = value; }, false);
    $("saveHint").textContent = room ? "正在同步更改…" : "已保存在这台设备";
  }

  function getRoomFromUrl() {
    const hash = location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const id = params.get("room");
    const key = params.get("key");
    const who = params.get("member");
    if (id && key) return { id: id, key: key, member: who === "b" ? "b" : "a" };
    return null;
  }

  function hasCloudConfig() {
    return Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase && typeof window.supabase.createClient === "function");
  }

  function getSupabaseClient() {
    if (!hasCloudConfig()) return null;
    if (!supabaseClient) {
      supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    }
    return supabaseClient;
  }

  async function connectToRoom() {
    if (!hasCloudConfig()) {
      setSyncStatus("error", "需要配置云同步");
      $("saveHint").textContent = "邀请链接已识别，等待配置 Supabase";
      return;
    }
    try {
      const client = getSupabaseClient();
      const response = await client.rpc("get_trip_room", { p_trip_id: room.id, p_invite_code: room.key });
      if (response.error) throw response.error;
      state = response.data.state;
      cloudRevision = Number(response.data.revision || 1);
      localVersion = 0;
      lastSyncedVersion = 0;
      saveLocalState();
      renderPreservingReplyFocus();
      await subscribeToRoom();
      setSyncStatus("cloud", "双人实时同步");
      $("saveHint").textContent = "已连接共享清单";
      showToast("共享清单连接成功，欢迎一起准备出发。");
    } catch (error) {
      console.error(error);
      setSyncStatus("error", "共享空间连接失败");
      $("saveHint").textContent = "请检查邀请链接或 Supabase 配置";
      showToast("暂时无法连接共享清单，请检查邀请链接。");
    }
  }

  async function subscribeToRoom() {
    if (!room || !supabaseClient) return;
    if (realtimeChannel) {
      try { await supabaseClient.removeChannel(realtimeChannel); } catch (error) { console.warn(error); }
    }
    realtimeChannel = supabaseClient.channel("travel-room-" + room.id, {
      config: { broadcast: { self: false } }
    });
    realtimeChannel.on("broadcast", { event: "refresh" }, () => refreshFromCloud());
    realtimeChannel.subscribe((status) => {
      if (status === "SUBSCRIBED") setSyncStatus("cloud", "双人实时同步");
    });
  }

  async function refreshFromCloud() {
    if (!room || !supabaseClient) return;
    if (localVersion > lastSyncedVersion) {
      queueCloudSave();
      return;
    }
    try {
      const response = await supabaseClient.rpc("get_trip_room", { p_trip_id: room.id, p_invite_code: room.key });
      if (response.error) throw response.error;
      state = response.data.state;
      cloudRevision = Number(response.data.revision || cloudRevision);
      localVersion += 1;
      lastSyncedVersion = localVersion;
      saveLocalState();
      renderPreservingReplyFocus();
      $("saveHint").textContent = "刚刚同步完成";
      setSyncStatus("cloud", "双人实时同步");
    } catch (error) {
      console.warn("Could not refresh shared checklist", error);
    }
  }

  function queueCloudSave() {
    if (!room || !hasCloudConfig()) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(flushCloudSave, 420);
  }

  async function flushCloudSave() {
    if (!room || !hasCloudConfig()) return;
    if (saveInFlight) {
      saveAgain = true;
      return;
    }
    saveInFlight = true;
    saveAgain = false;
    const sentVersion = localVersion;
    const snapshot = clone(state);
    try {
      const response = await getSupabaseClient().rpc("save_trip_room", {
        p_trip_id: room.id,
        p_invite_code: room.key,
        p_state: snapshot
      });
      if (response.error) throw response.error;
      cloudRevision = Number(response.data.revision || cloudRevision + 1);
      lastSyncedVersion = sentVersion;
      if (localVersion === sentVersion) {
        state = response.data.state;
        saveLocalState();
        renderPreservingReplyFocus();
        $("saveHint").textContent = "所有更改都已同步";
      } else {
        saveAgain = true;
      }
      setSyncStatus("cloud", "双人实时同步");
      if (realtimeChannel) {
        realtimeChannel.send({ type: "broadcast", event: "refresh", payload: { revision: cloudRevision } });
      }
    } catch (error) {
      console.error(error);
      setSyncStatus("error", "同步暂时失败");
      $("saveHint").textContent = "本机已保存，云端同步失败";
      showToast("本机内容已保存，但云端同步失败。");
    } finally {
      saveInFlight = false;
      if (saveAgain || localVersion > lastSyncedVersion) queueCloudSave();
    }
  }

  async function createSharedRoom() {
    if (!hasCloudConfig()) {
      openDialog("syncDialog");
      return;
    }
    try {
      const response = await getSupabaseClient().rpc("create_trip_room", { p_state: state });
      if (response.error) throw response.error;
      room = { id: response.data.trip_id, key: response.data.invite_code };
      state = response.data.state || state;
      cloudRevision = Number(response.data.revision || 1);
      localVersion = 0;
      lastSyncedVersion = 0;
      saveLocalState();
      const params = new URLSearchParams({ room: room.id, key: room.key, member: activeMember });
      history.replaceState(null, "", location.pathname + location.search + "#" + params.toString());
      await subscribeToRoom();
      setSyncStatus("cloud", "双人实时同步");
      $("saveHint").textContent = "共享空间已创建";
      render();
      showInviteDialog();
      showToast("共享空间创建成功啦。");
    } catch (error) {
      console.error("createSharedRoom failed:", error);
      const detail = error && (error.message || error.details || error.hint)
        ? String(error.message || error.details || error.hint)
        : String(error || "未知错误");
      setSyncStatus("error", "创建共享空间失败");
      $("saveHint").textContent = detail.slice(0, 120);
      showToast("创建失败：" + detail.slice(0, 110));
    }
  }

  function showInviteDialog() {
    if (!room) {
      if (!hasCloudConfig()) openDialog("syncDialog");
      else createSharedRoom();
      return;
    }
    const url = location.origin + location.pathname + location.search + "#room=" +
      encodeURIComponent(room.id) + "&key=" + encodeURIComponent(room.key) + "&member=b";
    $("inviteContent").innerHTML =
      '<div class="invite-card"><p>把这条专属邀请链接发给同行的人。打开后就能看到同一份清单，双方的修改会实时同步。</p>' +
      '<span class="invite-url" id="inviteUrl">' + escapeHtml(url) + '</span>' +
      '<div class="invite-actions"><button type="button" class="button button-primary" id="copyInviteBtn">复制邀请链接</button>' +
      '<button type="button" class="button button-outline" id="nativeShareBtn">分享</button></div></div>' +
      '<p class="security-note">这条链接包含共享空间的访问凭据，只发给你信任的同行伙伴。</p>';
    openDialog("inviteDialog");
    $("copyInviteBtn").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(url);
        showToast("邀请链接已复制。");
      } catch (error) {
        fallbackCopy(url);
      }
    });
    $("nativeShareBtn").addEventListener("click", async () => {
      if (navigator.share) {
        try { await navigator.share({ title: "出行带什么 🧳", text: "一起准备这次旅行吧。", url: url }); }
        catch (error) { if (error.name !== "AbortError") fallbackCopy(url); }
      } else {
        fallbackCopy(url);
      }
    });
  }

  function fallbackCopy(text) {
    const input = document.createElement("textarea");
    input.value = text;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    try {
      document.execCommand("copy");
      showToast("邀请链接已复制。");
    } catch (error) {
      showToast("复制失败，请长按链接手动复制。");
    }
    input.remove();
  }

  async function exportImage() {
    if (typeof window.html2canvas !== "function") {
      window.print();
      showToast("已打开打印页面，也可以选择保存为 PDF。");
      return;
    }
    const button = $("exportBtn");
    button.disabled = true;
    button.textContent = "…";
    const exportTarget = $("appMain");
    exportTarget.classList.add("is-exporting");
    try {
      const canvas = await window.html2canvas(exportTarget, {
        backgroundColor: "#fff8f6",
        scale: Math.min(2, window.devicePixelRatio || 1),
        useCORS: true
      });
      const link = document.createElement("a");
      link.download = "出行带什么-旅行清单.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
      showToast("清单图片已经保存好啦。");
    } catch (error) {
      console.error(error);
      window.print();
      showToast("图片生成失败，已为你打开打印页面。");
    } finally {
      exportTarget.classList.remove("is-exporting");
      button.disabled = false;
      button.textContent = "▧";
    }
  }

  function bindEvents() {
    $("startSoloBtn").addEventListener("click", startSoloMode);
    $("startSharedBtn").addEventListener("click", startSharedMode);
    $("homeBtn").addEventListener("click", returnToHome);
    $("addItemBtn").addEventListener("click", () => {
      if (!activeCategories().length) {
        showToast("先创建一个分类吧。");
        openDialog("categoryDialog");
        return;
      }
      openItemEditor(null);
    });
    $("addCategoryBtn").addEventListener("click", () => openDialog("categoryDialog"));
    $("inviteBtn").addEventListener("click", () => showInviteDialog());
    $("exportBtn").addEventListener("click", exportImage);
    $("resetBtn").addEventListener("click", resetChecks);
    $("itemForm").addEventListener("submit", saveItemFromForm);
    $("categoryForm").addEventListener("submit", createCategory);
    $("searchInput").addEventListener("input", renderCategories);

    ["destination", "startDate", "endDate"].forEach((id) => {
      $(id).addEventListener("change", (event) => {
        const field = id === "destination" ? "destination" : id;
        updateTripField(field, event.target.value);
      });
    });

    $("categoryList").addEventListener("input", (event) => {
      const replyInput = event.target.closest("[data-item-reply]");
      if (!replyInput) return;
      const itemId = replyInput.dataset.itemReply;
      const memberId = replyInput.dataset.member;
      const field = memberId === "a" ? "noteA" : "noteB";
      const stampField = field + "UpdatedAt";
      const value = replyInput.value;
      const now = new Date().toISOString();
      updateState((next) => {
        const item = next.items.find((entry) => entry.id === itemId);
        if (item) {
          item[field] = value;
          item[stampField] = now;
          item.updatedAt = now;
        }
      }, false);
    });

    $("categoryList").addEventListener("change", (event) => {
      const checkbox = event.target.closest("[data-item-check]");
      if (!checkbox) return;
      const itemId = checkbox.dataset.itemCheck;
      const memberId = checkbox.dataset.member;
      const now = new Date().toISOString();
      updateState((next) => {
        const item = next.items.find((entry) => entry.id === itemId);
        if (item) {
          if (memberId === "a") {
            item.doneA = checkbox.checked;
            item.doneAUpdatedAt = now;
          } else {
            item.doneB = checkbox.checked;
            item.doneBUpdatedAt = now;
          }
          item.updatedAt = now;
        }
      });
    });

    $("categoryList").addEventListener("click", (event) => {
      const editButton = event.target.closest("[data-edit-item]");
      const deleteButton = event.target.closest("[data-delete-item]");
      const toggle = event.target.closest("[data-toggle-category]");
      if (editButton) {
        event.stopPropagation();
        openItemEditor(editButton.dataset.editItem);
      } else if (deleteButton) {
        event.stopPropagation();
        deleteItem(deleteButton.dataset.deleteItem);
      } else if (toggle) {
        toggleCategory(toggle.dataset.toggleCategory);
      }
    });

    $("categoryList").addEventListener("keydown", (event) => {
      const toggle = event.target.closest("[data-toggle-category]");
      if (toggle && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        toggleCategory(toggle.dataset.toggleCategory);
      }
    });

    $("identityButtons").addEventListener("click", (event) => {
      const button = event.target.closest("[data-select-member]");
      if (!button) return;
      activeMember = button.dataset.selectMember;
      localStorage.setItem(MEMBER_KEY, activeMember);
      renderIdentity();
    });

    $("memberProgress").addEventListener("click", (event) => {
      const button = event.target.closest("[data-rename-member]");
      if (button) renameMember(button.dataset.renameMember);
    });

    document.querySelectorAll("[data-close]").forEach((button) => {
      button.addEventListener("click", () => closeDialog(button.dataset.close));
    });

    document.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        $("searchInput").focus();
      }
    });
  }

  function showAppScreen() {
    $("homeScreen").hidden = true;
    $("appMain").hidden = false;
    $("appFooter").hidden = false;
    $("homeBtn").hidden = false;
    $("syncBadge").hidden = false;
  }

  function showHomeScreen() {
    $("homeScreen").hidden = false;
    $("appMain").hidden = true;
    $("appFooter").hidden = true;
    $("homeBtn").hidden = true;
    $("syncBadge").hidden = true;
  }

  async function returnToHome() {
    if (room && localVersion > lastSyncedVersion) {
      window.clearTimeout(saveTimer);
      await flushCloudSave();
    }
    if (realtimeChannel && supabaseClient) {
      try { await supabaseClient.removeChannel(realtimeChannel); } catch (error) { console.warn(error); }
    }
    realtimeChannel = null;
    room = null;
    appMode = "home";
    history.replaceState(null, "", location.pathname + location.search);
    showHomeScreen();
    window.scrollTo(0, 0);
  }

  function startSoloMode() {
    appMode = "solo";
    room = null;
    state = loadSoloState();
    activeMember = "a";
    localStorage.setItem(MEMBER_KEY, activeMember);
    history.replaceState(null, "", location.pathname + location.search);
    showAppScreen();
    render();
    setSyncStatus("local", "单人 · 本机保存");
    $("saveHint").textContent = "自动保存在当前浏览器 · 可导出图片";
    window.scrollTo(0, 0);
  }

  function startSharedMode() {
    appMode = "shared";
    room = null;
    state = clone(DEFAULT_STATE);
    activeMember = "a";
    localStorage.setItem(MEMBER_KEY, activeMember);
    showAppScreen();
    render();
    setSyncStatus("local", "正在创建共享清单");
    createSharedRoom();
    window.scrollTo(0, 0);
  }

  function init() {
    bindEvents();
    const urlRoom = getRoomFromUrl();
    if (urlRoom) {
      appMode = "shared";
      room = { id: urlRoom.id, key: urlRoom.key };
      activeMember = urlRoom.member;
      localStorage.setItem(MEMBER_KEY, activeMember);
      showAppScreen();
      render();
      connectToRoom();
    } else {
      appMode = "home";
      showHomeScreen();
    }
  }

  init();
})();