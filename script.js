// ===== QR Studio — app logic (vanilla JavaScript) =====

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);

const PRESETS = {
  classic: { fg: "#182620", bg: "#ffffff" },
  ocean: { fg: "#116477", bg: "#f0fbfa" },
  purple: { fg: "#6448a8", bg: "#faf7ff" },
  dark: { fg: "#f4f3ea", bg: "#202628" },
};
const TYPE_LABELS = { url: "URL", text: "Text", email: "Email", phone: "Phone", wifi: "Wi-Fi" };
const FIELD_IDS = ["url", "text", "email", "subject", "message", "phone", "ssid", "password", "security"];
const RECENT_KEY = "qr-studio-recent";
const THEME_KEY = "qr-studio-theme";

let currentType = "url";
let currentContent = ""; // the text encoded in the QR (empty = nothing valid yet)

// ---------- Build QR content from the form (with validation) ----------
// Returns { content, error }. If error is set, we must NOT generate a QR.
function buildContent() {
  const v = (id) => $(id).value.trim();

  if (currentType === "url") {
    const raw = v("url");
    if (!raw) return { error: "Please enter a URL." };
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : "https://" + raw;
    try {
      const u = new URL(withProtocol);
      if (!u.hostname.includes(".") || u.hostname.startsWith(".") || u.hostname.endsWith(".")) throw new Error();
      return { content: u.href };
    } catch {
      return { error: "Please enter a valid URL." };
    }
  }

  if (currentType === "text") {
    const t = $("text").value;
    if (!t.trim()) return { error: "Please enter some text." };
    return { content: t };
  }

  if (currentType === "email") {
    const email = v("email");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Please enter a valid email address." };
    const params = [];
    if (v("subject")) params.push("subject=" + encodeURIComponent(v("subject")));
    if (v("message")) params.push("body=" + encodeURIComponent(v("message")));
    return { content: "mailto:" + email + (params.length ? "?" + params.join("&") : "") };
  }

  if (currentType === "phone") {
    const phone = v("phone");
    const digits = phone.replace(/\D/g, "");
    if (!/^\+?[\d\s\-().]+$/.test(phone) || digits.length < 6 || digits.length > 15) {
      return { error: "Please enter a valid phone number." };
    }
    return { content: "tel:" + phone.replace(/[\s\-().]/g, "") };
  }

  if (currentType === "wifi") {
    const ssid = v("ssid");
    if (!ssid) return { error: "Please enter the network name." };
    // Special characters must be escaped in the Wi-Fi QR format
    const esc = (s) => s.replace(/([\\;,:"])/g, "\\$1");
    const sec = $("security").value;
    const pass = sec === "nopass" ? "" : esc($("password").value);
    return { content: `WIFI:T:${sec};S:${esc(ssid)};P:${pass};;` };
  }
  return { error: "" };
}

// ---------- Draw the QR on the canvas ----------
function drawQR(content) {
  const qr = qrcode(0, $("ecc").value); // 0 = pick size automatically
  qr.addData(unescape(encodeURIComponent(content))); // UTF-8 safe
  qr.make();

  const modules = qr.getModuleCount();
  const pad = Number($("padding").value);
  const size = Number($("size").value);
  const total = modules + pad * 2;
  const cell = Math.max(1, Math.floor(size / total));
  const px = cell * total;

  const canvas = $("qrCanvas");
  canvas.width = px;
  canvas.height = px;
  canvas.style.width = size + "px";
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = $("bg").value;
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = $("fg").value;
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + pad) * cell, (r + pad) * cell, cell, cell);
    }
  }
}

// ---------- Contrast check (WCAG luminance) ----------
function luminance(hex) {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
function contrastRatio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// ---------- Main update: runs on every change ----------
function update() {
  $("sizeOut").textContent = $("size").value + "px";
  $("padOut").textContent = $("padding").value;
  $("infoType").textContent = TYPE_LABELS[currentType];

  const { content, error } = buildContent();
  const hasAnyInput = FIELD_IDS.some((id) => id !== "security" && $(id).value.trim());
  $("validation").textContent = error && hasAnyInput ? error : "";

  currentContent = error ? "" : content;
  const ok = Boolean(currentContent);

  if (ok) {
    try { drawQR(currentContent); }
    catch { $("validation").textContent = "That content is too long for a QR code."; currentContent = ""; }
  }
  const show = Boolean(currentContent);
  $("qrCanvas").hidden = !show;
  $("empty").hidden = show;
  $("downloadBtn").disabled = !show;
  $("copyBtn").disabled = !show;
  $("infoContent").textContent = show ? currentContent : "—";

  // Warn about poor contrast — QR is still generated
  $("contrast").hidden = contrastRatio($("fg").value, $("bg").value) >= 3;
}

// ---------- Tabs ----------
function setType(type, focus) {
  currentType = type;
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.type === type;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active);
    tab.tabIndex = active ? 0 : -1;
    if (active && focus) tab.focus();
  });
  document.querySelectorAll(".fields").forEach((f) => (f.hidden = f.dataset.fields !== type));
  update();
}

document.querySelectorAll(".tab").forEach((tab, i, tabs) => {
  tab.addEventListener("click", () => setType(tab.dataset.type));
  // Arrow keys move between tabs (keyboard accessibility)
  tab.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    setType(tabs[next].dataset.type, true);
  });
});

// ---------- Presets ----------
function selectPreset(name) {
  document.querySelectorAll(".preset").forEach((p) => p.classList.toggle("is-selected", p.dataset.preset === name));
}
document.querySelectorAll(".preset").forEach((btn) => {
  btn.addEventListener("click", () => {
    const p = PRESETS[btn.dataset.preset];
    $("fg").value = p.fg;
    $("bg").value = p.bg;
    selectPreset(btn.dataset.preset);
    update();
  });
});
// Changing a color manually un-selects the preset
["fg", "bg"].forEach((id) => $(id).addEventListener("input", () => { selectPreset(null); update(); }));

// Live updates for every other input
FIELD_IDS.concat(["size", "padding", "ecc"]).forEach((id) => $(id).addEventListener("input", update));
$("security").addEventListener("change", update);
$("ecc").addEventListener("change", update);

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2500);
}

// ---------- Recent codes (localStorage) ----------
function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; }
}
function saveRecent() {
  const fields = {};
  FIELD_IDS.forEach((id) => (fields[id] = $(id).value));
  const item = { type: currentType, fields, content: currentContent };
  const list = loadRecent().filter((r) => !(r.type === item.type && r.content === item.content));
  list.unshift(item);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6)));
  renderRecent();
}
function describe(item) {
  const f = item.fields;
  return { url: f.url, text: f.text, email: f.email, phone: f.phone, wifi: f.ssid }[item.type] || item.content;
}
function renderRecent() {
  const list = loadRecent();
  const ul = $("recentList");
  ul.innerHTML = "";
  $("recentEmpty").hidden = list.length > 0;
  $("clearBtn").hidden = list.length === 0;
  list.forEach((item) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "recent-item";
    btn.setAttribute("aria-label", `Load ${TYPE_LABELS[item.type]} code: ${describe(item)}`);
    const label = document.createElement("span");
    label.textContent = TYPE_LABELS[item.type].toUpperCase();
    const desc = document.createElement("b");
    desc.textContent = describe(item);
    btn.append(label, desc);
    btn.addEventListener("click", () => {
      FIELD_IDS.forEach((id) => ($(id).value = item.fields[id] ?? $(id).value));
      setType(item.type);
      toast("Loaded from recent codes");
    });
    li.appendChild(btn);
    ul.appendChild(li);
  });
}
$("clearBtn").addEventListener("click", () => {
  localStorage.removeItem(RECENT_KEY);
  renderRecent();
  toast("History cleared");
});

// ---------- Download & Copy ----------
$("downloadBtn").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = $("qrCanvas").toDataURL("image/png");
  a.download = `qr-studio-${currentType}.png`;
  a.click();
  saveRecent();
  toast("PNG downloaded ✓");
});

$("copyBtn").addEventListener("click", async () => {
  try {
    // Try copying the image itself
    const blob = await new Promise((res) => $("qrCanvas").toBlob(res, "image/png"));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast("QR image copied ✓");
  } catch {
    // Fallback: copy the text content of the QR
    try {
      await navigator.clipboard.writeText(currentContent);
      toast("Image copy not supported — QR content copied instead ✓");
    } catch {
      toast("Copy is not available in this browser.");
      return;
    }
  }
  saveRecent();
});

// ---------- Dark / light theme ----------
function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  $("themeToggle").textContent = theme === "dark" ? "☀️" : "🌙";
  $("themeToggle").setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
}
$("themeToggle").addEventListener("click", () => {
  const next = document.body.classList.contains("dark") ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

// ---------- Start ----------
applyTheme(localStorage.getItem(THEME_KEY) || "light");
renderRecent();
update();
