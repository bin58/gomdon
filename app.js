// GomĐơn — Logic tách đơn hàng từ tin nhắn tiếng Việt & xuất Excel

const STORAGE_KEYS = {
  ORDERS: "gomdon_orders_v1",
  THEME: "gomdon_theme_v1",
  TRIAL_USED: "gomdon_trial_used_v1",
  LICENSE: "gomdon_license_v1",
  USED_CODES: "gomdon_used_codes_v1",
};

const FREE_TRIAL_LIMIT = 5;
const OWNER_CODE_HASH = "7952b3";
const LICENSE_SALT = "GD_PLAN_2026_V1";

const SAMPLES = {
  food: `Chị Lan 0912 345 678 giao 2 trà sữa trân châu đường đen + 1 bánh tráng trộn tới 45 Nguyễn Trãi, Thanh Xuân, HN. Tổng 95k ship trước 5h nhé

Anh Minh - 0987.654.321 - 12 Lê Lợi, Q1, TP.HCM - 3 cơm tấm sườn bì chả 150k, ko hành gọi trc khi giao

Tên: Bé Thảo
SĐT: 0356789123
ĐC: ngõ 68 Cầu Giấy, Hà Nội
Món: 1 mẹt bún đậu đầy đủ 65k
Ghi chú: đã ck

Chị Hương đặt 2 hộp chân gà sả tắc 120k ship qua tòa nhà Landmark 81 giúp chị nha`,

  shop: `Nguyễn Thị Mai - 0909123456 - 245 Võ Văn Ngân, Thủ Đức, HCM - 1 váy hoa nhí sz M + 1 túi cói - COD 420k - giao giờ hành chính

Anh Tuấn 0978.111.222 lấy 2 áo polo nam đen trắng size XL giá 380k gửi về 88 Trần Phú, Hải Châu, Đà Nẵng

Tên: Em Linh
SĐT: 0868999888
ĐC: số 15 ngõ 20 Hồ Tùng Mậu, Nam Từ Liêm, HN
SP: 1 set đồ ngủ lụa hồng 195k
Note: gói kín giúp em

Chị Phương 0915666777 lấy 1 quần jean ống rộng size S 260k (chưa có địa chỉ)`,
};

let orders = [];

// DOM elements
const els =
  typeof document !== "undefined"
    ? {
        rawInput: document.getElementById("rawInput"),
        btnPasteClipboard: document.getElementById("btnPasteClipboard"),
        btnParse: document.getElementById("btnParse"),
        resultSection: document.getElementById("resultSection"),
        ordersBody: document.getElementById("ordersBody"),
        tableStatusText: document.getElementById("tableStatusText"),
        statOrders: document.getElementById("statOrders"),
        statRevenue: document.getElementById("statRevenue"),
        statComplete: document.getElementById("statComplete"),
        statWarning: document.getElementById("statWarning"),
        btnAddRow: document.getElementById("btnAddRow"),
        btnCopyResult: document.getElementById("btnCopyResult"),
        btnClearOrders: document.getElementById("btnClearOrders"),
        btnCopySheet: document.getElementById("btnCopySheet"),
        btnCopyShipper: document.getElementById("btnCopyShipper"),
        btnExportExcel: document.getElementById("btnExportExcel"),
        btnSampleFood: document.getElementById("btnSampleFood"),
        btnSampleShop: document.getElementById("btnSampleShop"),
        btnClearInput: document.getElementById("btnClearInput"),
        btnThemeToggle: document.getElementById("btnThemeToggle"),
        btnUpgrade: document.getElementById("btnUpgrade"),
        step2Badge: document.getElementById("step2Badge"),
        step3Badge: document.getElementById("step3Badge"),
        upgradeModal: document.getElementById("upgradeModal"),
        trialStatusTip: document.getElementById("trialStatusTip"),
        licenseStatusBox: document.getElementById("licenseStatusBox"),
        licenseCodeInput: document.getElementById("licenseCodeInput"),
        btnActivateLicense: document.getElementById("btnActivateLicense"),
        ownerToolsBox: document.getElementById("ownerToolsBox"),
        btnGen1M: document.getElementById("btnGen1M"),
        btnGen2M: document.getElementById("btnGen2M"),
        generatedCodeOutput: document.getElementById("generatedCodeOutput"),
        toast: document.getElementById("toast"),
      }
    : {};

// ===== SAFE STORAGE HELPERS =====
function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Bỏ qua nếu trình duyệt chặn localStorage (chế độ ẩn danh/sandbox)
  }
}

// ===== INIT =====
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    loadSavedState();
    bindEvents();
    renderTable();
    updateTrialAndPlanUI();
  });
}

function initTheme() {
  const saved = safeStorageGet(STORAGE_KEYS.THEME);
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (prefersDark ? "dark" : "light"));
}

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  if (els.btnThemeToggle) {
    els.btnThemeToggle.innerHTML = isDark
      ? '☀️ <span class="hide-mobile">Chế độ sáng</span>'
      : '🌙 <span class="hide-mobile">Chế độ tối</span>';
  }
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  safeStorageSet(STORAGE_KEYS.THEME, next);
  showToast(next === "dark" ? "🌙 Đã bật Chế độ tối dịu mắt" : "☀️ Đã chuyển về Chế độ sáng");
}

function normalizeOrder(item) {
  if (!item || typeof item !== "object") return createEmptyOrder();
  return {
    name: String(item.name ?? "").trim(),
    phone: String(item.phone ?? "").replace(/\D/g, ""),
    address: String(item.address ?? "").trim(),
    items: String(item.items ?? "").trim(),
    qty: Math.max(1, parseInt(item.qty, 10) || 1),
    total: Math.max(0, parseInt(item.total, 10) || 0),
    note: String(item.note ?? "").trim(),
  };
}

function loadSavedState() {
  try {
    const savedOrders = safeStorageGet(STORAGE_KEYS.ORDERS);
    if (!savedOrders) {
      orders = [];
      return;
    }
    const parsed = JSON.parse(savedOrders);
    orders = Array.isArray(parsed) ? parsed.map(normalizeOrder) : [];
  } catch {
    orders = [];
  }
}

function saveOrders() {
  safeStorageSet(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
}

function bindEvents() {
  els.btnPasteClipboard.addEventListener("click", handlePasteClipboard);

  els.btnSampleFood.addEventListener("click", () => {
    els.rawInput.value = SAMPLES.food;
    showToast("Đã điền mẫu quán ăn. Bấm nút xanh '✨ Tách thành danh sách đơn' nhé!");
  });

  els.btnSampleShop.addEventListener("click", () => {
    els.rawInput.value = SAMPLES.shop;
    showToast("Đã điền mẫu shop áo quần. Bấm nút xanh '✨ Tách thành danh sách đơn' nhé!");
  });

  els.btnClearInput.addEventListener("click", () => {
    els.rawInput.value = "";
    els.rawInput.focus();
  });

  els.btnParse.addEventListener("click", handleParse);
  els.btnAddRow.addEventListener("click", () => {
    orders.push(createEmptyOrder());
    saveOrders();
    renderTable();
  });

  els.btnClearOrders.addEventListener("click", () => {
    if (!orders.length) return;
    if (confirm("Bạn có chắc muốn xóa toàn bộ bảng đơn hàng hiện tại không?")) {
      orders = [];
      saveOrders();
      renderTable();
      showToast("Đã xóa toàn bộ bảng đơn hàng.");
    }
  });

  els.btnCopyResult.addEventListener("click", copyResultText);
  els.btnCopySheet.addEventListener("click", copyForGoogleSheets);
  els.btnCopyShipper.addEventListener("click", copyForShipper);
  els.btnExportExcel.addEventListener("click", exportExcel);
  els.btnThemeToggle.addEventListener("click", toggleTheme);

  // Modal Gói Chủ Shop + hỗ trợ phím Escape
  els.btnUpgrade.addEventListener("click", () => openModal("upgradeModal"));
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
  });
  els.upgradeModal.addEventListener("click", (e) => {
    if (e.target === els.upgradeModal) closeModal("upgradeModal");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.upgradeModal.classList.contains("hidden")) {
      closeModal("upgradeModal");
    }
  });

  els.btnActivateLicense?.addEventListener("click", handleActivateLicense);
  els.licenseCodeInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleActivateLicense();
    }
  });
  els.btnGen1M?.addEventListener("click", () => handleGenerateCustomerCode("1m"));
  els.btnGen2M?.addEventListener("click", () => handleGenerateCustomerCode("2m"));
  els.generatedCodeOutput?.addEventListener("click", () => {
    const code = els.generatedCodeOutput.dataset.code || "";
    if (code) copyText(code, `Đã copy mã: ${code}`);
  });
}

async function handlePasteClipboard() {
  if (!navigator.clipboard?.readText) {
    els.rawInput.focus();
    showToast("Trình duyệt không hỗ trợ nút dán nhanh — hãy bấm chuột phải chọn Dán (hoặc Ctrl+V).");
    return;
  }
  try {
    const text = (await navigator.clipboard.readText()).trim();
    if (!text) {
      showToast("Bộ nhớ tạm đang trống. Hãy copy tin nhắn trên Zalo/Facebook trước nhé!");
      return;
    }
    els.rawInput.value = els.rawInput.value.trim()
      ? `${els.rawInput.value.trim()}\n\n${text}`
      : text;
    showToast("📋 Đã dán tin nhắn! Bấm '✨ Tách thành danh sách đơn' để xem bảng.");
  } catch {
    els.rawInput.focus();
    showToast("Vui lòng bấm Ctrl+V (hoặc giữ tay chọn Dán) vào ô tin nhắn.");
  }
}

function openModal(id) {
  document.getElementById(id)?.classList.remove("hidden");
}

function closeModal(id) {
  document.getElementById(id)?.classList.add("hidden");
}

function createEmptyOrder() {
  return {
    name: "",
    phone: "",
    address: "",
    items: "",
    qty: 1,
    total: 0,
    note: "",
  };
}

// ===== TRIAL & LICENSE MANAGEMENT =====
function fnv1aHash(str) {
  let x = 2166136261;
  for (let i = 0; i < str.length; i++) {
    x ^= str.charCodeAt(i);
    x = Math.imul(x, 16777619);
  }
  return (x >>> 0).toString(16);
}

function getLicenseState() {
  try {
    const raw = safeStorageGet(STORAGE_KEYS.LICENSE);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    if (data.plan === "owner") return data;
    if ((data.plan === "1m" || data.plan === "2m") && typeof data.expiresAt === "number") {
      if (Date.now() < data.expiresAt) return data;
    }
    return null;
  } catch {
    return null;
  }
}

function getTrialUsed() {
  const n = parseInt(safeStorageGet(STORAGE_KEYS.TRIAL_USED) || "0", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function getRemainingTrials() {
  return Math.max(0, FREE_TRIAL_LIMIT - getTrialUsed());
}

function hasActiveAccess() {
  return Boolean(getLicenseState()) || getRemainingTrials() > 0;
}

function consumeTrialUse() {
  if (getLicenseState()) return;
  const next = Math.min(FREE_TRIAL_LIMIT, getTrialUsed() + 1);
  safeStorageSet(STORAGE_KEYS.TRIAL_USED, String(next));
  updateTrialAndPlanUI();
}

function getCodeChecksum(prefix, token) {
  return fnv1aHash(`${LICENSE_SALT}:${prefix}-${token}`).slice(0, 2).toUpperCase();
}

function getUsedCodes() {
  try {
    const raw = safeStorageGet(STORAGE_KEYS.USED_CODES);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveUsedCode(code) {
  const used = getUsedCodes();
  if (!used.includes(code)) {
    used.push(code);
    safeStorageSet(STORAGE_KEYS.USED_CODES, JSON.stringify(used));
  }
}

function activateLicenseCode(rawCode) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return { ok: false, message: "Vui lòng nhập mã kích hoạt." };

  if (fnv1aHash(`GD_OWNER_SALT_2026:${code}`) === OWNER_CODE_HASH) {
    const lic = { plan: "owner", expiresAt: null, activatedAt: Date.now() };
    safeStorageSet(STORAGE_KEYS.LICENSE, JSON.stringify(lic));
    updateTrialAndPlanUI();
    return { ok: true, plan: "owner", message: "👑 Đã bật chế độ Chủ sở hữu — miễn phí không giới hạn!" };
  }

  const m = code.match(/^(GD1M|GD2M)-([A-Z0-9]{4})-([A-Z0-9]{2})$/);
  if (!m) {
    return { ok: false, message: "Mã không hợp lệ. Vui lòng kiểm tra lại (VD: GD1M-XXXX-XX)." };
  }

  const [, prefix, token, cs] = m;
  if (getCodeChecksum(prefix, token) !== cs) {
    return { ok: false, message: "Mã kích hoạt không đúng. Vui lòng liên hệ Zalo shop." };
  }

  if (getUsedCodes().includes(code)) {
    return { ok: false, message: "Mã này đã được sử dụng trên thiết bị này rồi." };
  }

  const days = prefix === "GD2M" ? 60 : 30;
  const newPlan = prefix === "GD2M" ? "2m" : "1m";
  const existing = getLicenseState();
  if (existing?.plan === "owner") {
    return {
      ok: false,
      message: "Bạn đang ở chế độ Chủ sở hữu (miễn phí vĩnh viễn), không cần kích hoạt thêm mã gói!",
    };
  }
  const baseTime =
    existing && (existing.plan === "1m" || existing.plan === "2m") && existing.expiresAt > Date.now()
      ? existing.expiresAt
      : Date.now();
  const expiresAt = baseTime + days * 86400000;
  const plan = existing?.plan === "2m" || newPlan === "2m" ? "2m" : "1m";

  saveUsedCode(code);
  safeStorageSet(STORAGE_KEYS.LICENSE, JSON.stringify({ plan, expiresAt, code, activatedAt: Date.now() }));
  updateTrialAndPlanUI();
  return {
    ok: true,
    plan,
    message: `⭐ Kích hoạt thành công gói ${prefix === "GD2M" ? "2 tháng (50k)" : "1 tháng (30k)"}!`,
  };
}

function handleActivateLicense() {
  const res = activateLicenseCode(els.licenseCodeInput?.value);
  showToast(res.message);
  if (res.ok && els.licenseCodeInput) {
    els.licenseCodeInput.value = "";
  }
}

function generateCustomerCode(plan) {
  const prefix = plan === "2m" ? "GD2M" : "GD1M";
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let token = "";
  for (let i = 0; i < 4; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}-${token}-${getCodeChecksum(prefix, token)}`;
}

function handleGenerateCustomerCode(plan) {
  if (getLicenseState()?.plan !== "owner") return;
  const code = generateCustomerCode(plan);
  if (els.generatedCodeOutput) {
    els.generatedCodeOutput.dataset.code = code;
    els.generatedCodeOutput.textContent = `${code}  (Bấm vào để copy)`;
    els.generatedCodeOutput.classList.remove("hidden");
  }
  copyText(code, `Đã tạo & copy mã ${plan === "2m" ? "2 tháng" : "1 tháng"}: ${code}`);
}

function updateTrialAndPlanUI() {
  const lic = getLicenseState();
  const remaining = getRemainingTrials();

  if (els.trialStatusTip) {
    if (lic?.plan === "owner") {
      els.trialStatusTip.innerHTML =
        "👑 <strong>Chế độ Chủ sở hữu</strong> — Miễn phí không giới hạn lượt tách đơn";
    } else if (lic) {
      const daysLeft = Math.max(1, Math.ceil((lic.expiresAt - Date.now()) / 86400000));
      els.trialStatusTip.innerHTML = `⭐ <strong>Gói Chủ Shop đang bật</strong> — Còn ${daysLeft} ngày sử dụng không giới hạn`;
    } else if (remaining > 0) {
      els.trialStatusTip.innerHTML = `🎁 Dùng thử miễn phí: còn <strong>${remaining}/${FREE_TRIAL_LIMIT}</strong> lần tách đơn — Sau đó 30k/tháng hoặc 50k/2 tháng`;
    } else {
      els.trialStatusTip.innerHTML =
        '🔒 Đã hết 5 lần miễn phí — <a href="#" id="linkOpenUpgrade" style="color:inherit;font-weight:700;text-decoration:underline;">Chọn gói 30k/tháng hoặc 50k/2 tháng</a>';
      document.getElementById("linkOpenUpgrade")?.addEventListener("click", (e) => {
        e.preventDefault();
        openModal("upgradeModal");
      });
    }
  }

  if (els.btnUpgrade) {
    if (lic?.plan === "owner") {
      els.btnUpgrade.textContent = "👑 Chủ sở hữu";
    } else if (lic) {
      const daysLeft = Math.max(1, Math.ceil((lic.expiresAt - Date.now()) / 86400000));
      els.btnUpgrade.textContent = `⭐ Pro (${daysLeft} ngày)`;
    } else {
      els.btnUpgrade.textContent = "⭐ Gói Chủ Shop";
    }
  }

  if (els.licenseStatusBox) {
    if (lic?.plan === "owner") {
      els.licenseStatusBox.textContent = "👑 Trạng thái: Chủ sở hữu (Miễn phí vĩnh viễn)";
      els.licenseStatusBox.classList.remove("hidden");
    } else if (lic) {
      const daysLeft = Math.max(1, Math.ceil((lic.expiresAt - Date.now()) / 86400000));
      els.licenseStatusBox.textContent = `⭐ Trạng thái: Đang dùng gói ${lic.plan === "2m" ? "2 tháng" : "1 tháng"} (còn ${daysLeft} ngày)`;
      els.licenseStatusBox.classList.remove("hidden");
    } else {
      els.licenseStatusBox.classList.add("hidden");
    }
  }

  if (els.ownerToolsBox) {
    els.ownerToolsBox.classList.toggle("hidden", lic?.plan !== "owner");
  }
}

// ===== MAIN PARSE HANDLER =====
let lastParsedRawText = "";

function handleParse() {
  if (!hasActiveAccess()) {
    showToast("Bạn đã dùng hết 5 lần miễn phí. Chọn gói 30k/tháng hoặc 50k/2 tháng để tiếp tục nhé!");
    openModal("upgradeModal");
    return;
  }

  const rawText = els.rawInput.value.trim();
  if (!rawText) {
    showToast("Vui lòng dán ít nhất 1 tin nhắn đặt hàng trước!");
    els.rawInput.focus();
    return;
  }

  const parsed = parseLocallyVietnamese(rawText);
  const hasRealOrderData = parsed.some((o) => Boolean(o.phone || o.address || o.total > 0));
  if (!parsed.length || !hasRealOrderData) {
    showToast("Không nhận diện được đơn hàng nào (cần có SĐT, địa chỉ hoặc giá tiền) — chưa trừ lượt dùng thử.");
    return;
  }

  const isSampleText = rawText === SAMPLES.food.trim() || rawText === SAMPLES.shop.trim();
  const isSameAsLast = rawText === lastParsedRawText;

  orders = parsed;
  saveOrders();
  if (!isSampleText && !isSameAsLast) {
    consumeTrialUse();
    lastParsedRawText = rawText;
  }
  renderTable();
  showToast(
    isSampleText
      ? `✅ Đã tách thử ${orders.length} đơn mẫu (không trừ lượt dùng thử)!`
      : `✅ Đã tách thành công ${orders.length} đơn hàng!`
  );
  els.resultSection?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ===== SMART VIETNAMESE ORDER PARSER (OFFLINE, FREE) =====
const VN_UPPER =
  "A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝĂĐĨŨƠƯẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴỶỸ";
const VN_LOWER =
  "a-zàáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ";
const PHONE_CORE_PATTERN =
  "(?:\\+84|84|0)(?:[\\s.\\-]*[35789](?:[\\s.\\-]*\\d){8}|[\\s.\\-]*2(?:[\\s.\\-]*\\d){8}\\d)";
const MONEY_BODY_PATTERN =
  "(?:(\\d+)\\s*(tr|triệu|k)(\\d{1,3})|(\\d+(?:[.,]\\d{1,3})*)\\s*(tr|triệu|k|nghìn|ngàn)|(\\d{1,3}(?:[.,]\\d{3})+|\\d{4,9})\\s*(đ|d|vnđ|vnd)|(\\d{1,3}(?:[.,]\\d{3})+))";
const ITEM_HEAD_KEYWORDS =
  "(?:áo|quần|váy|đầm|chân|sơ\\s+mi|hộp|ly|cốc|set|combo|cơm|trà|bánh|mẹt|túi|giày|dép|mũ|nón|kính|ví|khăn|dây|đồng\\s+hồ|son|kem|phấn|sữa|nước|bún|phở|mì|mỳ|xôi|cháo|gà|thịt|cá|tôm|cua|bò|heo|vịt|ốc|lẩu|gỏi|chả|nem|kẹo|đồ\\s+(?:ngủ|bộ|ăn|uống|chơi|lót|bơi|tập|dùng)|cafe|cà\\s+(?:phê|chua|rốt|tím)|máy|chai|lon|bịch|gói|chiếc|cái|đôi|bộ|kg|ký|lít|suất|phần|tô|bát|ổ|cây|cục|thanh|tờ|tấm|thùng|lốc|vỉ|hũ|size|sz|cỡ|màu)";
const INLINE_PRICE_MARKER = "\uFFF0";

function parseLocallyVietnamese(rawText) {
  const normalized = String(rawText || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const secondaryLabelRe =
    /^(?:(?:sđt|sdt|đt|dt|số|điện thoại|phone)\s*(?:phụ|thứ\s*2|2|khác|người\s*nhận|nhận\s*hàng|nhận)(?![0-9a-zA-ZÀ-ỹ])|(?:sđt|sdt|đt|dt|điện thoại|phone|địa chỉ|đc|đ\/c|món|sản phẩm|sp|đơn hàng|đặt món|order|ghi chú|note|lưu ý)\s*[:\-])/i;
  const callInstructionLineRe = /^(?:gọi|liên hệ|lh)(?![0-9a-zA-ZÀ-ỹ])/i;
  const phoneStripForLineCheckRe = new RegExp(
    `(?:^|[^0-9a-zA-ZÀ-ỹ])(?:(?:sđt|sdt|đt|dt|điện thoại|phone)\\s*[:\\-]?\\s*)?${PHONE_CORE_PATTERN}(?![0-9])`,
    "gi"
  );
  const isIndependentOrderLine = (line) => {
    if (secondaryLabelRe.test(line) || callInstructionLineRe.test(line)) return false;
    if (!extractPhone(line)) return false;
    const remainder = line
      .replace(phoneStripForLineCheckRe, " ")
      .replace(/[\s,.;:\-–|/]+/g, "")
      .trim();
    return remainder.length > 0;
  };

  const blocks = normalized
    .split(/\n\s*\n+|^\s*---+\s*$/gm)
    .map((b) => b.trim())
    .filter(Boolean)
    .flatMap((block) => {
      if (!block.includes("\n")) return [block];
      const lines = block
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.some((l) => secondaryLabelRe.test(l))) {
        return [block];
      }
      const independentOrderLines = lines.filter(isIndependentOrderLine).length;
      if (independentOrderLines >= 2) {
        return lines;
      }
      const isStandaloneNoPhoneOrderLine = (line) => {
        if (secondaryLabelRe.test(line) || callInstructionLineRe.test(line)) return false;
        if (extractPhone(line)) return false;
        const parsedLine = parseSingleBlockLocal(line);
        return Boolean(parsedLine.items && (parsedLine.name || parsedLine.address));
      };
      const standaloneTotal =
        independentOrderLines + lines.filter(isStandaloneNoPhoneOrderLine).length;
      if (standaloneTotal === lines.length && lines.length >= 2) {
        return lines;
      }
      return [block];
    });

  return blocks.map((block) => parseSingleBlockLocal(block));
}

function splitTrailingItemFromAddress(candidate) {
  const cleanCandidate = cleanAddress(String(candidate || "").replace(/\uFFF0/g, ""));
  const trailingRe = new RegExp(
    `\\s+(\\d+\\s+${ITEM_HEAD_KEYWORDS}(?![0-9a-zA-ZÀ-ỹ]).*)$`,
    "i"
  );
  let m = cleanCandidate.match(trailingRe);
  if (m) {
    const addrPart = cleanAddress(cleanCandidate.slice(0, m.index));
    const itemPart = cleanSegment(m[1]);
    if (addrPart && itemPart && looksLikeAddress(addrPart)) {
      return { addrPart, itemPart };
    }
  }

  const trailingLowerItemRe = new RegExp(
    `^(.*?[${VN_UPPER}][${VN_LOWER}]+)\\s+(\\d+\\s+(?!(?:tháng|ngõ|ngách|hẻm|đường|phố|phường|xã|quận|huyện|tỉnh|ấp|thôn|tổ|khu|lô|tầng|lầu|phòng|căn|km|giúp|dùm|nha|nhé|ạ|nhá|nhỉ)(?![0-9a-zA-ZÀ-ỹ]))[${VN_LOWER}].*)$`
  );
  m = cleanCandidate.match(trailingLowerItemRe);
  if (m && !/(?:^|[^0-9a-zA-ZÀ-ỹ])(?:landmark|chung cư|tòa nhà|cc|kđt)$/i.test(m[1])) {
    const addrPart = cleanAddress(m[1]);
    const itemPart = cleanSegment(m[2]);
    if (addrPart && itemPart && looksLikeAddress(addrPart)) {
      return { addrPart, itemPart };
    }
  }
  return null;
}

function extractAddressPrefixFromCommaCandidate(candidate) {
  const segs = String(candidate || "")
    .split(",")
    .map((s) => ({
      text: cleanSegment(s),
      hasInlinePrice: s.includes(INLINE_PRICE_MARKER),
    }))
    .filter((s) => s.text);
  if (segs.length <= 1) {
    const splitTrailing = splitTrailingItemFromAddress(candidate);
    if (splitTrailing) {
      return { addressPart: splitTrailing.addrPart, restPart: splitTrailing.itemPart };
    }
    return { addressPart: cleanAddress(candidate), restPart: "" };
  }
  const addrSegs = [];
  const restSegs = [];
  let hitItem = false;
  for (const seg of segs) {
    if (!hitItem && !(looksLikeItem(seg.text) && !looksLikeAddress(seg.text, !seg.hasInlinePrice))) {
      addrSegs.push(seg.text);
    } else {
      hitItem = true;
      restSegs.push(seg.hasInlinePrice ? `${seg.text}${INLINE_PRICE_MARKER}` : seg.text);
    }
  }
  if (!addrSegs.length) {
    return { addressPart: cleanAddress(candidate), restPart: "" };
  }
  let addressPart = cleanAddress(addrSegs.join(", "));
  const splitTrailing = splitTrailingItemFromAddress(addressPart);
  if (splitTrailing) {
    addressPart = splitTrailing.addrPart;
    restSegs.unshift(splitTrailing.itemPart);
  }
  return { addressPart, restPart: restSegs.join(", ") };
}

function splitCommaSegmentsSmart(part, hasName) {
  const rawPart = String(part || "");
  if (!rawPart.includes(",")) {
    const text = cleanSegment(rawPart);
    return text ? [{ text, hasInlinePrice: rawPart.includes(INLINE_PRICE_MARKER) }] : [];
  }
  const rawSegs = rawPart
    .split(",")
    .map((s) => ({
      text: cleanSegment(s),
      hasInlinePrice: s.includes(INLINE_PRICE_MARKER),
    }))
    .filter((s) => s.text);
  if (rawSegs.length <= 1) return rawSegs;

  const out = [];
  let addrGroup = [];
  const flushAddrGroup = () => {
    if (addrGroup.length) {
      out.push({
        text: addrGroup.map((s) => s.text).join(", "),
        hasInlinePrice: addrGroup.some((s) => s.hasInlinePrice),
      });
      addrGroup = [];
    }
  };

  for (let i = 0; i < rawSegs.length; i++) {
    const seg = rawSegs[i];
    const isAddr = looksLikeAddress(seg.text, !seg.hasInlinePrice);
    const isClearlyItem = looksLikeItem(seg.text) && !isAddr;
    const isLeadingName = i === 0 && !hasName && looksLikeName(seg.text) && !isAddr;
    if (isClearlyItem || isLeadingName) {
      flushAddrGroup();
      out.push(seg);
    } else {
      addrGroup.push(seg);
    }
  }
  flushAddrGroup();
  return out;
}

function parseSingleBlockLocal(text) {
  let cleanedText = text.replace(/^(?:đơn\s*\d+\s*[:.\-]?|#?\d+[.)]\s+)/i, "").trim();

  let name = "";
  let address = "";
  let items = "";
  const notes = [];

  // Hỗ trợ copy trực tiếp từ Zalo PC / Messenger: "[14:30 24/11/2026] Nguyễn Lan: ..."
  const zaloPrefixMatch = cleanedText.match(
    /^\[(?:\d{1,2}:\d{2}(?:\s+\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)?|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\s+\d{1,2}:\d{2})\]\s*([^:\n|]{2,45}?)\s*:\s*/
  );
  if (zaloPrefixMatch) {
    name = cleanName(zaloPrefixMatch[1]);
    cleanedText = cleanedText.slice(zaloPrefixMatch[0].length).trim();
  }

  let working = cleanedText
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" | ");

  const addNote = (val) => {
    const cleaned = cleanSegment(val);
    if (cleaned && !notes.includes(cleaned)) notes.push(cleaned);
  };

  // 1. Trích xuất SĐT Việt Nam hợp lệ (không cắt nhầm từ chuỗi số dài như mã vận đơn)
  const phone = extractPhone(working);
  if (phone) {
    // Tách SĐT phụ / SĐT người nhận vào ghi chú trước khi xóa SĐT chính
    const secondaryPhoneRe = new RegExp(
      `(^|[^0-9a-zA-ZÀ-ỹ])((?:sđt|sdt|đt|dt|số|điện thoại|phone)\\s*(?:phụ|thứ\\s*2|2|khác|người\\s*nhận|nhận\\s*hàng|nhận)\\s*[:\\-]?\\s*${PHONE_CORE_PATTERN})(?![0-9])`,
      "gi"
    );
    working = working.replace(secondaryPhoneRe, (_match, prefix, secPhrase) => {
      addNote(secPhrase);
      return `${prefix} | `;
    });

    // Xử lý cụm gọi điện kèm SĐT lặp lại hoặc SĐT phụ (vd: "gọi 0912345678 khi tới", "LH 0987... nếu không gọi được")
    const callPhraseRe = new RegExp(
      `(^|[^0-9a-zA-ZÀ-ỹ])((?:gọi|liên hệ|lh)\\s*(?:lại\\s*)?(?:sđt|sdt|số)?\\s*[:\\-]?\\s*(?:${PHONE_CORE_PATTERN})(?:\\s*(?:(?:trước|trc)\\s*(?:khi|lúc)|khi|lúc|nếu)\\s*(?:tới(?:\\s*nơi)?|đến(?:\\s*nơi)?|giao(?:\\s*hàng)?|[^,.\n|]+))?(?:\\s*(?:nhé|nha|ạ|nhá))?)(?![0-9a-zA-ZÀ-ỹ])`,
      "gi"
    );
    working = working.replace(callPhraseRe, (match, prefix, phrase) => {
      const phrasePhone = extractPhone(phrase);
      if (!phrasePhone) return match;
      if (phrasePhone === phone) {
        const strippedPhonePhrase = cleanSegment(
          phrase
            .replace(new RegExp(PHONE_CORE_PATTERN, "g"), " ")
            .replace(/^(?:gọi|liên hệ|lh)\s*(?:lại\s*)?(?:sđt|sdt|số)?\s*[:\-]?\s*/i, "")
            .replace(/\s+/g, " ")
        );
        if (/^(?:(?:trước|trc)\s*(?:khi|lúc)|khi|lúc|nếu)\s+/i.test(strippedPhonePhrase)) {
          addNote(`gọi ${strippedPhonePhrase}`);
        }
      } else {
        addNote(phrase);
      }
      return `${prefix} | `;
    });

    const phonePattern = phone.split("").join("[\\s.\\-]*");
    working = working.replace(
      new RegExp(
        `(^|[^0-9a-zA-ZÀ-ỹ])(?:(?:sđt|sdt|đt|dt|điện thoại|phone)\\s*[:\\-]?\\s*)?(?:\\+84|84)?${phonePattern.replace(
          /^0/,
          "0?"
        )}(?![0-9])`,
        "gi"
      ),
      "$1 | "
    );
  }

  // 2. Trích xuất tiền cọc TRƯỚC khi tách tổng tiền (tránh bắt nhầm "cọc 50k" hoặc "cọc 1tr2" làm tổng tiền đơn)
  working = working.replace(
    /(^|[^0-9a-zA-ZÀ-ỹ])((?:đã\s+)?cọc\s*[:\-]?\s*(?:\d+\s*(?:tr|triệu|k)\d{1,3}|\d+(?:[.,]\d{1,3})*\s*(?:tr|triệu|k|nghìn|ngàn|đ|d|vnđ|vnd)?))(?![0-9a-zA-ZÀ-ỹ])/gi,
    (_match, prefix, deposit) => {
      addNote(deposit);
      return `${prefix} | `;
    }
  );

  // 2b. Trích xuất phí ship (vd: "ship 30k", "+ ship 30k", "phí ship 30k") trước khi tách tiền món để không sót "ship" trong cột Món
  let shipFee = 0;
  const shipFeeRe = new RegExp(
    `(^|[^0-9a-zA-ZÀ-ỹ])(?:[+&]\\s*)?((?:phí\\s+ship|tiền\\s+ship|ship)\\s*[:\\-]?\\s*${MONEY_BODY_PATTERN})(?![0-9a-zA-ZÀ-ỹ])`,
    "gi"
  );
  working = working.replace(shipFeeRe, (match, prefix, shipPhrase, shInt, shUnit, shFrac, uNum, uUnit, dNum, dUnit, plainNum) => {
    let fee = 0;
    if (shInt && shUnit && shFrac) {
      fee = parseShorthandMoneyValue(shInt, shUnit, shFrac);
    } else if (uNum && uUnit) {
      fee = parseMoneyValue(uNum, uUnit);
    } else if (dNum && dUnit) {
      fee = parseMoneyValue(dNum, dUnit);
    } else if (plainNum) {
      fee = parseMoneyValue(plainNum, "");
    }
    if (fee >= 1000) {
      shipFee += fee;
      addNote(shipPhrase);
      return `${prefix} | `;
    }
    return match;
  });

  // 3. Trích xuất Tổng tiền (ưu tiên từ khóa tổng/cod, cộng dồn nếu có nhiều giá riêng lẻ + phí ship khi chưa có tổng)
  const { amount, hasExplicitTotal, workingAfterMoney } = extractMoneyFromText(working);
  working = workingAfterMoney;
  const totalAmount = hasExplicitTotal ? amount : amount + shipFee;

  // 4. Trích xuất các trường có nhãn rõ ràng (hỗ trợ lặp nhãn nhiều lần, ví dụ nhiều dòng "Món:")
  const labelRules = [
    { key: "name", regex: /(?:^|\|\s*)(?:tên khách|tên|khách hàng|người nhận|khách)\s*[:\-]\s*([^|]+)/gi },
    { key: "address", regex: /(?:^|\|\s*)(?:địa chỉ giao|địa chỉ|đc|đ\/c)\s*[:\-]\s*([^|]+)/gi },
    { key: "items", regex: /(?:^|\|\s*)(?:món|sản phẩm|sp|đơn hàng|đặt món|order)\s*[:\-]\s*([^|]+)/gi },
    { key: "note", regex: /(?:^|\|\s*)(?:ghi chú|note|lưu ý)\s*[:\-]\s*([^|]+)/gi },
  ];

  for (const rule of labelRules) {
    working = working.replace(rule.regex, (_match, valRaw) => {
      const val = cleanSegment(valRaw);
      if (val) {
        if (rule.key === "name" && !name) name = val;
        if (rule.key === "address" && !address) address = cleanAddress(val);
        if (rule.key === "items") items = items ? `${items}, ${val}` : val;
        if (rule.key === "note") addNote(val);
      }
      return " | ";
    });
  }

  // 5. Trích xuất Ghi chú phổ biến & viết tắt tiếng Việt (dùng ranh giới Unicode thay cho \b, không dùng lookbehind)
  const itemAttrToken =
    "(?:\\d+\\s*)?(?:xs|s|m|l|xl|xxl|xxxl|2xl|3xl|freesize|free\\s*size|\\d{2}(?:\\s*-\\s*\\d{2})?(?:\\s*kg)?|đỏ|đen|trắng|xanh|vàng|hồng|tím|nâu|xám|ghi|be|kem|cam)";
  const itemAttrParenRe = new RegExp(
    `^(?:(?:size|sz|cỡ|màu|loại|vị|hương|mùi|bản|phiên\\s*bản|combo|set|sl|số\\s*lượng)\\b|${itemAttrToken}(?:\\s*[,\\/&\\-+]\\s*${itemAttrToken})*$)`,
    "i"
  );
  working = working.replace(/\(([^)]+)\)/g, (match, inner) => {
    const trimmedInner = cleanSegment(inner);
    if (trimmedInner && itemAttrParenRe.test(trimmedInner)) {
      return `(${trimmedInner})`;
    }
    addNote(inner);
    return " | ";
  });

  working = working.replace(
    /(^|[^0-9a-zA-ZÀ-ỹ])((?:giao|ship|nhận)\s+(?:vào\s+)?(?:(?:ngày\s+)?\d{1,2}(?:[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|\s+tháng\s+\d{1,2}(?:\s+năm\s+\d{2,4})?)|hôm\s+nay|ngày\s+mai|cuối\s+tuần|thứ\s+[2-7]|chủ\s+nhật|lúc\s+\d{1,2}(?:h\d{0,2}|:\d{2}|\s*giờ(?:\s*\d{1,2})?))(?:\s*(?:sáng|chiều|tối|trưa|nhé|nha|ạ|nhá))?|ngày\s+\d{1,2}(?:[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|\s+tháng\s+\d{1,2}(?:\s+năm\s+\d{2,4})?)|ship trước [^,.\n|]+|giao trước [^,.\n|]+|giao giờ hành chính|giao sáng|giao chiều|giao tối|ship\s+(?:nhanh|hỏa tốc|hoả tốc|gấp|thường|tiết kiệm|cod|liền|ngay)|giao\s+(?:nhanh|hỏa tốc|hoả tốc|gấp|liền|ngay)|gọi trc[^,.\n|]*|gọi trước[^,.\n|]*|đã chuyển khoản|đã ck|ck rồi|freeship|fs|ko hành|không hành|k hành|ko đá|k đá|ít đá|ít đường|ít ngọt|gói kín[^,.\n|]*)(?![0-9a-zA-ZÀ-ỹ])/gi,
    (_match, prefix, noteText) => {
      addNote(noteText);
      return `${prefix} | `;
    }
  );

  // 6. Trích xuất Địa chỉ theo từ khóa dẫn đường (ưu tiên từ khóa rõ như "địa chỉ/tới/giao tới" trước "giao")
  if (!address) {
    const strongAddr = working.match(
      /(?:^|[^0-9a-zA-ZÀ-ỹ])((?:địa chỉ|đc|đ\/c|giao tới|giao về|giao qua|ship qua|gửi về|tới|đến)\s*[:\-]?\s*([^|\n]+))/i
    );
    if (strongAddr) {
      const { addressPart, restPart } = extractAddressPrefixFromCommaCandidate(strongAddr[2]);
      address = addressPart;
      working = working.replace(strongAddr[1], restPart ? ` | ${restPart} | ` : " | ");
    } else {
      const giaoAddr = working.match(/(?:^|[^0-9a-zA-ZÀ-ỹ])((?:giao(?:\s+(?:ở|tại|bên))?|ở|tại|bên)\s*[:\-]?\s*([^|\n]+))/i);
      if (giaoAddr) {
        const { addressPart, restPart } = extractAddressPrefixFromCommaCandidate(giaoAddr[2]);
        if (looksLikeAddress(addressPart)) {
          address = addressPart;
          working = working.replace(giaoAddr[1], restPart ? ` | ${restPart} | ` : " | ");
        }
      }
    }
  }

  // 7. Tách phần còn lại theo dấu | , dấu gạch ngang " - " , dấu chấm kết câu, hoặc dấu phẩy tách món khỏi địa chỉ
  const rawParts = working
    .split(/\s*\|\s*|\s+-\s+|\.\s+/)
    .map((s) => s.trim())
    .filter((s) => cleanSegment(s));

  const parts = [];
  for (const rawPart of rawParts) {
    const splitComma = splitCommaSegmentsSmart(rawPart, !!name);
    for (const segObj of splitComma) {
      if (!address && looksLikeAddress(segObj.text, !segObj.hasInlinePrice)) {
        const splitTrailing = splitTrailingItemFromAddress(segObj.text);
        if (splitTrailing) {
          parts.push(
            { text: splitTrailing.addrPart, hasInlinePrice: false },
            { text: splitTrailing.itemPart, hasInlinePrice: segObj.hasInlinePrice }
          );
          continue;
        }
      }
      parts.push(segObj);
    }
  }

  for (const segObj of parts) {
    const part = segObj.text;
    if (!address && looksLikeAddress(part, !segObj.hasInlinePrice)) {
      address = cleanAddress(part);
    } else if (!name && looksLikeName(part)) {
      name = cleanName(part);
    } else if (!items && looksLikeItem(part)) {
      items = cleanItem(part);
    } else if (!name && part.length <= 35 && !/\d/.test(part)) {
      name = cleanName(part);
    } else {
      const cleaned = cleanItem(part);
      if (cleaned) items = items ? `${items}, ${cleaned}` : cleaned;
    }
  }

  // Tách trường hợp tên dính vào món (vd: "Chị Lan giao 2 trà sữa" hoặc "Anh Minh 2 quần")
  if (!name && items) {
    const splitNameItem =
      items.match(
        /^((?:chị|anh|em|bé|cô|chú|bạn|mr|ms|mrs)?\s*[A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+){0,3})\s+(?:đặt|lấy|mua|giao|order|cho)\s+(.+)$/i
      ) ||
      items.match(
        /^((?:chị|anh|em|bé|cô|chú|bạn|mr|ms|mrs)\s+[A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+){0,2})\s+(\d+\s+.+)$/i
      );
    if (splitNameItem) {
      name = splitNameItem[1].trim();
      items = splitNameItem[2].trim();
    }
  }

  if (name && /(?:^|[^0-9a-zA-ZÀ-ỹ])(?:đặt|lấy|mua|giao|order)(?![0-9a-zA-ZÀ-ỹ])/i.test(name)) {
    const m = name.match(/^(.*?)\s+(?:đặt|lấy|mua|giao|order)\s+(.+)$/i);
    if (m) {
      name = m[1].trim();
      items = items ? `${m[2].trim()}, ${items}` : m[2].trim();
    }
  } else if (name) {
    const mNameQty = name.match(
      /^((?:chị|anh|em|bé|cô|chú|bạn|mr|ms|mrs)\s+[A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+){0,2})\s+(\d+\s+[a-zA-ZÀ-ỹ].+)$/i
    );
    if (mNameQty) {
      name = cleanName(mNameQty[1]);
      const extraItem = cleanItem(mNameQty[2]);
      if (extraItem) items = items ? `${extraItem}, ${items}` : extraItem;
    }
  }

  const qty = estimateQuantity(items);

  return {
    name: name || "",
    phone: phone || "",
    address: cleanAddress(address || ""),
    items: items || "",
    qty,
    total: totalAmount || 0,
    note: notes.join("; "),
  };
}

function isValidPhone(phone) {
  return /^0(?:[35789]\d{8}|2\d{9})$/.test(String(phone || ""));
}

function extractPhone(str) {
  // Ranh giới không đứng liền sau chữ số/chữ cái (tránh cắt nhầm từ mã vận đơn 120912345678 hoặc nuốt số lượng theo sau)
  const re = new RegExp(`(?:^|[^0-9a-zA-ZÀ-ỹ])(${PHONE_CORE_PATTERN})(?![0-9])`, "g");
  for (const m of String(str || "").matchAll(re)) {
    let digits = m[1].replace(/\D/g, "");
    if (digits.startsWith("84") && (digits.length === 11 || digits.length === 12)) {
      digits = "0" + digits.slice(2);
    }
    if (isValidPhone(digits)) {
      return digits;
    }
  }
  return "";
}

function parseShorthandMoneyValue(intPart, unit, fracPart) {
  const u = (unit || "").toLowerCase();
  const val = parseFloat(`${intPart}.${fracPart}`);
  if (u === "tr" || u === "triệu") {
    return Math.round(val * 1000000);
  }
  if (u === "k") {
    return Math.round(val * 1000);
  }
  return 0;
}

function parseMoneyValue(rawNum, unit) {
  const u = (unit || "").toLowerCase();
  if (u === "tr" || u === "triệu") {
    return Math.round(parseFloat(rawNum.replace(",", ".")) * 1000000);
  }
  if (u === "k" || u === "nghìn" || u === "ngàn") {
    // Phân biệt "1.500k" (1.500 * 1000 = 1.500.000) với "1.5k" (1.5 * 1000 = 1.500)
    if (/^\d{1,3}(?:[.,]\d{3})+$/.test(rawNum)) {
      return parseInt(rawNum.replace(/[.,]/g, ""), 10) * 1000;
    }
    return Math.round(parseFloat(rawNum.replace(",", ".")) * 1000);
  }
  // Đơn vị đ / vnđ / vnd hoặc chuỗi phân cách hàng nghìn
  return parseInt(rawNum.replace(/[.,]/g, ""), 10);
}

function extractMoneyFromText(str) {
  // Khớp cụm tiền (1tr2, 1k5, tr/triệu, k/nghìn/ngàn, 500000đ, 120.000đ), kèm "còn ...", "x 150k", "50k/hộp"
  const moneyRegex = new RegExp(
    `(^|[^0-9a-zA-ZÀ-ỹ])((?:tổng cộng|tổng|cod|thu hộ|thành tiền|còn lại|còn|thu thêm|phải thu|giá|tiền)\\s*[:\\-]?\\s*|[x×*]\\s*)?${MONEY_BODY_PATTERN}(\\s*\\/\\s*(?:\\d+\\s*)?[a-zA-ZÀ-ỹ]+)?(?![0-9a-zA-ZÀ-ỹ])`,
    "gi"
  );

  const matches = [];
  for (const m of str.matchAll(moneyRegex)) {
    const prefixLen = m[1] ? m[1].length : 0;
    const rawPrefixKw = (m[2] || "").trim().toLowerCase();
    const isMultiplyPrefix = /^[x×*]/.test(rawPrefixKw);
    const hasPerUnitSuffix = Boolean(m[11]);
    let amount = 0;
    if (m[3] && m[4] && m[5]) {
      amount = parseShorthandMoneyValue(m[3], m[4], m[5]);
    } else if (m[6] && m[7]) {
      amount = parseMoneyValue(m[6], m[7]);
    } else if (m[8] && m[9]) {
      amount = parseMoneyValue(m[8], m[9]);
    } else if (m[10]) {
      amount = parseMoneyValue(m[10], "");
    }

    if (amount >= 1000) {
      const isTotalKeyword = /^(tổng|cod|thu hộ|thành tiền|còn|thu thêm|phải thu)/.test(rawPrefixKw);
      if (!isTotalKeyword && (isMultiplyPrefix || hasPerUnitSuffix)) {
        const beforeText = str.slice(0, m.index + prefixLen);
        const segStart = Math.max(
          beforeText.lastIndexOf(","),
          beforeText.lastIndexOf("+"),
          beforeText.lastIndexOf("|"),
          beforeText.lastIndexOf("\n"),
          beforeText.lastIndexOf(";")
        );
        const itemSeg = beforeText.slice(segStart + 1);
        const segQty = estimateQuantity(itemSeg);
        if (segQty > 1 && segQty < 500) {
          amount = amount * segQty;
        }
      }
      matches.push({
        index: m.index + prefixLen,
        length: m[0].length - prefixLen,
        amount,
        isTotalKeyword,
      });
    }
  }

  if (!matches.length) {
    return { amount: 0, hasExplicitTotal: false, workingAfterMoney: str };
  }

  // Nếu có từ khóa tổng / cod / thu hộ -> ưu tiên lấy số tiền đó (ưu tiên xuất hiện cuối cùng nếu có nhiều)
  const explicitTotals = matches.filter((m) => m.isTotalKeyword);
  const hasExplicitTotal = explicitTotals.length > 0;
  const totalAmount = hasExplicitTotal
    ? explicitTotals[explicitTotals.length - 1].amount
    : matches.reduce((sum, m) => sum + m.amount, 0);

  // Loại bỏ toàn bộ cụm tiền đã khớp khỏi chuỗi working (từ cuối về đầu để giữ đúng index)
  let workingAfterMoney = str;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const replacement = m.isTotalKeyword ? " | " : `${INLINE_PRICE_MARKER} | `;
    workingAfterMoney =
      workingAfterMoney.slice(0, m.index) + replacement + workingAfterMoney.slice(m.index + m.length);
  }

  return { amount: totalAmount, hasExplicitTotal, workingAfterMoney };
}

const STREET_CAPITALIZED_RE = new RegExp(
  `(?:^|[^0-9a-zA-ZÀ-ỹ])\\d{1,4}(?:\\/\\d{1,4})*[A-Za-z]?\\s+([${VN_UPPER}][${VN_LOWER}0-9]*(?:\\s+[${VN_UPPER}][${VN_LOWER}0-9]*)+)(?![0-9a-zA-ZÀ-ỹ])`,
  "g"
);
const ITEM_HEAD_RE = new RegExp(`^${ITEM_HEAD_KEYWORDS}(?![0-9a-zA-ZÀ-ỹ])`, "i");

function hasCapitalizedStreetPattern(str) {
  for (const m of str.matchAll(STREET_CAPITALIZED_RE)) {
    if (!ITEM_HEAD_RE.test(m[1])) {
      return true;
    }
  }
  return false;
}

const EXPLICIT_ADDRESS_KEYWORD_RE =
  /(?:^|[^0-9a-zA-ZÀ-ỹ])(ngõ|ngách|hẻm|đường|phố|phường|xã|quận|huyện|tỉnh|ấp|thôn|khu phố|tp\.?\s*hcm|hcm|sg|sài gòn|hà nội|hn|đà nẵng|đn|thủ đức|tòa nhà|chung cư|cc|kđt|landmark|số \d+|q\.?\s*\d+|p\.?\s*\d+|bình thạnh|gò vấp|tân bình|cầu giấy|thanh xuân|đống đa|hai bà trưng|nam từ liêm|võ thị sáu|nguyễn thị minh khai|nguyễn trãi|lê lợi|trần phú)(?![0-9a-zA-ZÀ-ỹ])/i;

function looksLikeAddress(s, allowCapitalizedStreet = true) {
  const str = String(s || "");
  if (EXPLICIT_ADDRESS_KEYWORD_RE.test(str)) {
    return true;
  }
  return allowCapitalizedStreet ? hasCapitalizedStreetPattern(str) : false;
}

function looksLikeName(s) {
  return (
    /^(?:chị|anh|em|bé|cô|chú|bạn|tên|khách)(?![0-9a-zA-ZÀ-ỹ])/i.test(s) ||
    new RegExp(`^[${VN_UPPER}][${VN_LOWER}]+(?:\\s+[${VN_UPPER}][${VN_LOWER}]+){1,3}$`).test(s)
  );
}

const ITEM_KEYWORD_LOOKS_RE = new RegExp(
  `(?:^|[^0-9a-zA-ZÀ-ỹ])${ITEM_HEAD_KEYWORDS}(?![0-9a-zA-ZÀ-ỹ])`,
  "i"
);

function looksLikeItem(s) {
  return (
    /(?:^|[^0-9a-zA-ZÀ-ỹ])\d+\s*[a-zA-ZÀ-ỹ]/i.test(s) ||
    ITEM_KEYWORD_LOOKS_RE.test(s)
  );
}

function cleanSegment(s) {
  return String(s || "")
    .replace(/\uFFF0/g, "")
    .replace(/^[,;:\-–.|\s]+|[,;:\-–.|\s]+$/g, "")
    .replace(/^[+&]+(?:\s+|$)|(?:^|\s+)[+&]+$/g, "")
    .replace(/^[,;:\-–.|\s]+|[,;:\-–.|\s]+$/g, "")
    .trim();
}

function cleanAddress(s) {
  return cleanSegment(
    String(s || "").replace(
      /(?:[\s,]*(?:giúp\s+(?:chị|anh|em|mình|shop)|dùm\s+(?:chị|anh|em|mình)|nha|nhé|ạ|nhá|nhỉ))+\s*[.!?]*\s*$/gi,
      ""
    )
  );
}

function cleanName(s) {
  return cleanSegment(s.replace(/^(?:tên|khách hàng|người nhận)\s*[:\-]?\s*/i, ""));
}

function cleanItem(s) {
  return cleanSegment(
    s.replace(
      /^(?:cho\s+(?:chị|anh|em|mình|shop)\s+|(?:chị|anh|em|mình)\s+(?:đặt|lấy|mua|order)\s+|đặt|lấy|mua|giao|order|cho|món|sp|sản phẩm)\s*[:\-]?\s*/i,
      ""
    )
  );
}

function estimateQuantity(itemsStr) {
  if (!itemsStr) return 1;
  // Loại bỏ số đo/size, ngày/giờ, và số lượng quy cách đóng gói (vd: "1 thùng 24 lon" -> tính 1 thùng)
  let cleaned = itemsStr
    .replace(
      /(^|[^0-9a-zA-ZÀ-ỹ])(?:size|sz|cỡ)\s*[:\-]?\s*\d+(?:[.,]\d+)?(?![0-9a-zA-ZÀ-ỹ])/gi,
      "$1 "
    )
    .replace(
      /(^|[^0-9a-zA-ZÀ-ỹ])(?:ngày\s+\d{1,2}(?:\s+tháng\s+\d{1,2})?|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|\d{1,2}h\d{0,2})(?![0-9a-zA-ZÀ-ỹ])/gi,
      "$1 "
    )
    .replace(
      /(\d+\s*(?:thùng|lốc|vỉ|hộp|túi|bịch|gói|set|combo|bó|chục|tá|cây)\s+)\d+(?=\s*[a-zA-ZÀ-ỹ])/gi,
      "$1"
    );

  // Nếu ngoài ngoặc đã có số lượng (vd: "2 áo thun (1 đen, 1 trắng)"), bỏ ngoặc để tránh cộng trùng
  const withoutParens = cleaned.replace(/\([^)]*\)/g, " ");
  const hasOutsideQty =
    /(?:^|[+,&]\s*|\s)(\d+)\s*(?=[a-zA-ZÀ-ỹ])/i.test(withoutParens) ||
    /(?:^|[^0-9a-zA-ZÀ-ỹ])(?:x|sl\s*[:\-]?)\s*(\d+)(?![0-9a-zA-ZÀ-ỹ])/i.test(withoutParens);
  if (hasOutsideQty) {
    cleaned = withoutParens;
  }

  const prefixMatches = [...cleaned.matchAll(/(?:^|[+,&]\s*|\s)(\d+)\s*(?=[a-zA-ZÀ-ỹ])/gi)];
  const suffixMatches = [...cleaned.matchAll(/(?:^|[^0-9a-zA-ZÀ-ỹ])(?:x|sl\s*[:\-]?)\s*(\d+)(?![0-9a-zA-ZÀ-ỹ])/gi)];
  const allNums = [...prefixMatches, ...suffixMatches]
    .map((m) => parseInt(m[1], 10))
    .filter((n) => Number.isFinite(n) && n > 0 && n < 500);

  if (!allNums.length) return 1;
  const sum = allNums.reduce((acc, n) => acc + n, 0);
  return sum > 0 ? sum : 1;
}

// ===== RENDER TABLE & STATS =====
function getOrderStatusHtml(order) {
  const missingPhone = !isValidPhone(order.phone);
  const missingAddress = !order.address;
  const hasWarning = missingPhone || missingAddress;

  const statusHtml = hasWarning
    ? `<span class="status-badge status-warn">⚠️ ${
        missingPhone && missingAddress
          ? "Thiếu SĐT & ĐC"
          : missingPhone
          ? !order.phone
            ? "Thiếu SĐT"
            : "SĐT chưa đủ"
          : "Thiếu địa chỉ"
      }</span>`
    : `<span class="status-badge status-ok">✅ Đủ thông tin</span>`;

  return { missingPhone, missingAddress, hasWarning, statusHtml };
}

function updateRowVisualState(tr, order) {
  const { missingPhone, missingAddress, hasWarning, statusHtml } = getOrderStatusHtml(order);
  tr.classList.toggle("row-warning", hasWarning);
  tr.querySelector('[data-field="phone"]')?.classList.toggle("is-missing", missingPhone);
  tr.querySelector('[data-field="address"]')?.classList.toggle("is-missing", missingAddress);
  const statusCell = tr.querySelector(".col-status-cell");
  if (statusCell) statusCell.innerHTML = statusHtml;
}

function renderTable() {
  const hasOrders = orders.length > 0;
  els.btnCopyResult.disabled = !hasOrders;
  els.btnCopySheet.disabled = !hasOrders;
  els.btnCopyShipper.disabled = !hasOrders;
  els.btnExportExcel.disabled = !hasOrders;
  els.btnClearOrders.classList.toggle("hidden", !hasOrders);
  els.step2Badge.classList.toggle("active", hasOrders);
  els.step3Badge.classList.toggle("active", hasOrders);

  if (!hasOrders) {
    els.ordersBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="10">
          <div class="empty-state">
            <div class="empty-icon">📋</div>
            <p>Chưa có đơn hàng nào.</p>
            <p class="muted">Hãy bấm <strong>🍜 Thử mẫu quán ăn</strong> ở trên rồi bấm nút màu xanh để xem máy tách đơn tự động!</p>
          </div>
        </td>
      </tr>`;
    els.tableStatusText.textContent = "Bấm trực tiếp vào ô bất kỳ để sửa nếu khách nhắn thiếu.";
    updateStats();
    return;
  }

  els.tableStatusText.textContent = `Đã tách ${orders.length} đơn. Bấm vào ô bất kỳ để sửa trước khi xuất Excel.`;

  els.ordersBody.innerHTML = orders
    .map((order, idx) => {
      const { missingPhone, missingAddress, hasWarning, statusHtml } = getOrderStatusHtml(order);

      return `
        <tr class="${hasWarning ? "row-warning" : ""}" data-index="${idx}">
          <td class="col-stt">${idx + 1}</td>
          <td><input class="cell-input" data-field="name" value="${escapeAttr(order.name)}" placeholder="Tên khách..." /></td>
          <td><input class="cell-input ${missingPhone ? "is-missing" : ""}" data-field="phone" value="${escapeAttr(order.phone)}" placeholder="09xxxxxxxx" /></td>
          <td><input class="cell-input ${missingAddress ? "is-missing" : ""}" data-field="address" value="${escapeAttr(order.address)}" placeholder="Địa chỉ..." /></td>
          <td><input class="cell-input" data-field="items" value="${escapeAttr(order.items)}" placeholder="Món / Sản phẩm..." /></td>
          <td><input class="cell-input cell-number" type="number" min="1" data-field="qty" value="${order.qty || 1}" /></td>
          <td><input class="cell-input cell-number" type="number" min="0" step="1000" data-field="total" value="${order.total || 0}" /></td>
          <td><input class="cell-input" data-field="note" value="${escapeAttr(order.note)}" placeholder="Ghi chú..." /></td>
          <td class="col-status-cell">${statusHtml}</td>
          <td class="col-action">
            <div class="row-actions">
              <button class="btn-copy-row" data-copy="${idx}" title="Copy đơn này" type="button">📋</button>
              <button class="btn-delete-row" data-delete="${idx}" title="Xóa dòng này" type="button">🗑️</button>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  // Cập nhật trực tiếp tại chỗ (không vẽ lại toàn bộ bảng) để giữ nguyên focus / phím Tab / click nút kế tiếp
  els.ordersBody.querySelectorAll(".cell-input").forEach((input) => {
    const syncField = (e, normalizeInputValue) => {
      const tr = e.target.closest("tr");
      const index = Number(tr.dataset.index);
      const field = e.target.dataset.field;
      let val = e.target.value;

      if (field === "qty") val = Math.max(1, parseInt(val, 10) || 1);
      if (field === "total") val = Math.max(0, parseInt(val, 10) || 0);
      if (field === "phone") val = val.replace(/\D/g, "");
      if (field === "name" || field === "address" || field === "items" || field === "note") {
        val = normalizeInputValue ? val.trim() : val;
      }

      if (normalizeInputValue && (field === "phone" || field === "qty" || field === "total")) {
        e.target.value = String(val);
      }

      orders[index][field] = val;
      saveOrders();
      updateRowVisualState(tr, orders[index]);
      updateStats();
    };

    input.addEventListener("input", (e) => syncField(e, false));
    input.addEventListener("change", (e) => syncField(e, true));
    input.addEventListener("blur", (e) => syncField(e, true));
  });

  els.ordersBody.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.copy);
      copySingleOrder(idx);
    });
  });

  els.ordersBody.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.delete);
      orders.splice(idx, 1);
      saveOrders();
      renderTable();
      showToast("Đã xóa 1 dòng đơn hàng.");
    });
  });

  updateStats();
}

function updateStats() {
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const warningCount = orders.filter((o) => !isValidPhone(o.phone) || !o.address).length;
  const completeCount = totalOrders - warningCount;

  els.statOrders.textContent = `${totalOrders} đơn`;
  els.statRevenue.textContent = formatVnd(totalRevenue);
  els.statComplete.textContent = completeCount;
  els.statWarning.textContent = warningCount;
}

// ===== EXPORT & COPY =====
function neutralizeFormula(val) {
  const s = String(val ?? "");
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function getExportRows(options = {}) {
  const shouldNeutralize = options.neutralize !== false;
  const sourceOrders = Array.isArray(options.orders) ? options.orders : orders;
  const formatText = (val) => (shouldNeutralize ? neutralizeFormula(val) : String(val ?? ""));
  return sourceOrders.map((o, idx) => ({
    STT: idx + 1,
    "Tên khách hàng": formatText(o.name),
    "Số điện thoại": String(o.phone ?? ""),
    "Địa chỉ giao hàng": formatText(o.address),
    "Món / Sản phẩm": formatText(o.items),
    "Số lượng": Number(o.qty) || 1,
    "Tổng tiền (VNĐ)": Number(o.total) || 0,
    "Ghi chú": formatText(o.note),
  }));
}

function exportExcel() {
  if (!orders.length) return;
  const rows = getExportRows({ neutralize: false });
  const fileName = `GomDon_${getDateStamp()}.xlsx`;

  if (typeof XLSX !== "undefined") {
    const ws = XLSX.utils.json_to_sheet(rows);
    const range = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
    if (range) {
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const cell = ws[addr];
          if (!cell) continue;
          // Bảo đảm không ô nào chứa công thức thực thi (.f); cột chữ luôn là Text "@" không kèm dấu '
          delete cell.f;
          if (r === 0 || cell.t === "s" || c === 1 || c === 2 || c === 3 || c === 4 || c === 7) {
            cell.t = "s";
            cell.v = String(cell.v ?? "");
            cell.z = "@";
          }
        }
      }
    }
    ws["!cols"] = [
      { wch: 5 },
      { wch: 20 },
      { wch: 15 },
      { wch: 35 },
      { wch: 32 },
      { wch: 10 },
      { wch: 16 },
      { wch: 24 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DonHang");
    XLSX.writeFile(wb, fileName);
    showToast(`📊 Đã tải xuống ${fileName}`);
  } else {
    exportCsvFallback();
    showToast("Đang không có mạng — đã tải file bảng tính chuẩn tiếng Việt mở bằng Excel!");
  }
}

function exportCsvFallback() {
  if (!orders.length) return;
  const rows = getExportRows();
  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const val = String(r[h] ?? "");
          // Giữ số 0 đầu SĐT khi mở CSV bằng Excel
          if (h === "Số điện thoại" && /^0\d+$/.test(val)) {
            return `"=""${val}"""`;
          }
          return `"${val.replace(/"/g, '""')}"`;
        })
        .join(",")
    ),
  ];

  const blob = new Blob(["\uFEFF" + csvLines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `GomDon_${getDateStamp()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Trì hoãn revokeObjectURL để tránh hủy tải trên Firefox/Safari
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copySingleOrder(idx) {
  const o = orders[idx];
  if (!o) return;
  const parts = [
    o.name || "Chưa có tên",
    o.phone || "Chưa có SĐT",
    o.address || "Chưa có địa chỉ",
    `${o.items || "Chưa ghi món"} (SL: ${Number(o.qty) || 1})`,
    formatVnd(o.total || 0),
  ];
  if (o.note) parts.push(`Ghi chú: ${o.note}`);

  try {
    await navigator.clipboard.writeText(parts.join(" | "));
    showToast(`📋 Đã copy đơn #${idx + 1}${o.name ? ` (${o.name})` : ""}!`);
  } catch {
    showToast("Không thể copy tự động trên trình duyệt này.");
  }
}

async function copyResultText() {
  if (!orders.length) return;
  const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  const lines = [
    `KẾT QUẢ TÁCH ĐƠN (${orders.length} đơn | Tổng: ${formatVnd(totalRevenue)})`,
    ...orders.map((o, idx) => {
      const parts = [
        `${idx + 1}. ${o.name || "Chưa có tên"}`,
        o.phone || "Chưa có SĐT",
        o.address || "Chưa có địa chỉ",
        `${o.items || "Chưa ghi món"} (SL: ${Number(o.qty) || 1})`,
        formatVnd(o.total || 0),
      ];
      if (o.note) parts.push(`Ghi chú: ${o.note}`);
      return parts.join(" | ");
    }),
  ];

  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    showToast("📄 Đã copy kết quả! Bạn có thể dán ngay vào Zalo, Ghi chú hoặc Messenger.");
  } catch {
    showToast("Không thể copy tự động. Hãy dùng nút Tải file Excel nhé!");
  }
}

async function copyForShipper() {
  if (!orders.length) return;
  const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  const lines = [
    `📦 DANH SÁCH ĐƠN GIAO (${orders.length} đơn - Tổng ${formatVnd(totalRevenue)})`,
    "",
  ];

  orders.forEach((o, idx) => {
    const name = o.name || "Chưa có tên";
    const phone = o.phone || "Chưa có SĐT";
    const address = o.address || "Chưa có địa chỉ";
    const items = o.items || "Chưa ghi món";
    const qty = Number(o.qty) || 1;
    const totalText = o.total > 0 ? formatVnd(o.total) : "0 đ (kiểm tra lại)";

    lines.push(`${idx + 1}. ${name} - ${phone}`);
    lines.push(`   📍 ${address}`);
    lines.push(`   🛍️ ${items} (SL: ${qty})`);
    lines.push(`   💰 Thu hộ: ${totalText}`);
    if (o.note) {
      lines.push(`   📝 Ghi chú: ${o.note}`);
    }
    lines.push("");
  });

  try {
    await navigator.clipboard.writeText(lines.join("\n").trim());
    showToast("🛵 Đã copy danh sách đơn! Mở Zalo dán gửi cho Shipper nhé.");
  } catch {
    showToast("Không thể copy tự động. Hãy dùng nút Tải file Excel nhé!");
  }
}

async function copyForGoogleSheets() {
  if (!orders.length) return;
  const rows = getExportRows({ neutralize: true });
  const headers = Object.keys(rows[0]);
  const tsv = [
    headers.join("\t"),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const val = String(r[h] ?? "").replace(/[\t\r\n]/g, " ");
          if (h === "Số điện thoại" && /^0\d+$/.test(val)) {
            return `="${val}"`;
          }
          return val;
        })
        .join("\t")
    ),
  ].join("\n");

  try {
    await navigator.clipboard.writeText(tsv);
    showToast("📋 Đã copy! Mở Google Sheets hoặc Excel rồi bấm Ctrl+V để dán.");
  } catch {
    showToast("Không thể copy tự động. Hãy dùng nút Tải file Excel nhé!");
  }
}

// ===== HELPERS =====
function formatVnd(num) {
  return new Intl.NumberFormat("vi-VN").format(num || 0) + " đ";
}

function getDateStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(
    d.getMinutes()
  )}`;
}

function escapeAttr(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

let toastTimer = null;
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.add("hidden");
  }, 3200);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseLocallyVietnamese,
    isValidPhone,
    SAMPLES,
    neutralizeFormula,
    getExportRows,
    normalizeOrder,
  };
}
