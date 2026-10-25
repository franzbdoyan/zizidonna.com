// zizidonna.com dashboard: the manager and Zizi work through the brand list together.
// Two views over the same `brands` documents: Brands (Zizi's 0–5 question) and
// Pipeline (outreach status and contacts; manager edits, Zizi watches).
//
// Static page, no build step. Firebase (Google sign-in + Firestore) is loaded from
// gstatic only when needed, so ?mock=1 runs without any Firebase project at all.
// Access is enforced by firestore.rules; the allowlist below only shapes the UI.
// No brand data lives in this file: the real list is imported from the private
// tracker CSV into Firestore by the manager. The mock rows are made up.

const SDK = "https://www.gstatic.com/firebasejs/12.19.0";
const MANAGER = "franzbdoyan@gmail.com";
const ZIZI = "zizidonnastyle@gmail.com";
const TEAM = [MANAGER, ZIZI];

// Brand description columns: refreshed from the tracker on every import.
const FIELDS = ["rank", "brand", "category", "score", "verdict", "route_in", "template", "url", "notes"];
// Pipeline fields: all strings; dates are yyyy-mm-dd or empty. An import only fills them where empty.
const CRM_FIELDS = ["status", "contact_name", "contact_title", "contact_email", "date_sent", "follow_up_due", "last_touch", "fee_quoted", "next_action"];
const DATE_FIELDS = ["date_sent", "follow_up_due", "last_touch"];
const EXPORT_FIELDS = [...FIELDS, ...CRM_FIELDS, "zizi_w", "zizi_owns", "zizi_note", "zizi_answered_at", "manager_note", "updated_at", "updated_by"];
const SCALE_LABELS = { 0: "Never", 3: "Maybe", 5: "Already do" };
const STATUSES = [
  ["new", "New"],
  ["researching", "Researching"],
  ["pitched", "Pitched"],
  ["followed_up", "Followed up"],
  ["in_talks", "In talks"],
  ["contract", "Contract"],
  ["live", "Live"],
  ["hold", "Hold"],
  ["declined", "Declined"],
  ["dropped", "Dropped"],
];
const STATUS_LABEL = Object.fromEntries(STATUSES);
const STATUS_ORDER = Object.fromEntries(STATUSES.map(([k], i) => [k, i]));
const CLOSED = new Set(["declined", "dropped"]); // hidden under "All" unless "Show all" is on
const DONE = new Set(["live", "declined", "dropped"]); // a past follow-up date is not overdue for these
// The tracker's final_status column (Zizi's verdict) -> pipeline status, used only when `status` is empty.
const FINAL_STATUS = { go: "new", "hold (zizi 3)": "hold", "drop (zizi)": "dropped", "drop (zizi note)": "dropped", "explain to zizi": "new", "no answer": "new" };
const NOW = Symbol("now"); // replaced by the backend with a server (or local) timestamp

const params = new URLSearchParams(location.search);
const MOCK = params.get("mock") === "1";
const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Line\/|TikTok|musical_ly|Bytedance|Snapchat|LinkedInApp|Twitter|Pinterest\/|; wv\)/i.test(navigator.userAgent);

const $ = (id) => document.getElementById(id);

const state = {
  email: "",
  role: null, // "manager" | "zizi"
  view: "brands", // "brands" | "pipeline"
  rows: new Map(), // doc id ("001") -> data
  loaded: false,
  category: "All",
  unansweredOnly: false,
  query: "",
  keep: new Set(), // answered during this visit; stay visible under "Unanswered only" until a filter changes
};
const pipe = {
  status: "all",
  showAll: false,
  query: "",
  sort: "rank", // "rank" | "due" | "status"
  order: [], // current row order; recomputed only when filters, sort or the set of brands change
  keep: new Set(), // edited during this visit; stay visible until a filter changes
};
const cards = new Map(); // doc id -> Brands card refs
const prows = new Map(); // doc id -> Pipeline row refs
const failed = new Map(); // doc id -> patch that did not save (resent with the next save or Retry)
let inflight = 0;
let backend = null; // { save(id, patch), importDocs(docs), signOut() }
let chipSig = "";
let orderSig = "";

// ---------- small helpers ----------

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

function show(view) {
  for (const v of ["loading", "problem", "signin", "board"]) $(`view-${v}`).hidden = v !== view;
}

function note(el, text) {
  el.textContent = text || "";
  el.hidden = !text;
}

const isAnswered = (d) => typeof d.zizi_w === "number";
const mainCategory = (c) => String(c || "Other").split("·")[0].trim() || "Other";
const pad2 = (n) => String(n ?? "").padStart(2, "0");
const docId = (rank) => String(rank).padStart(3, "0");
const whoIs = (email) => {
  const e = String(email || "").toLowerCase();
  return e === MANAGER ? "Manager" : e === ZIZI ? "Zizi" : e;
};
const statusOf = (d) => (STATUS_LABEL[d.status] ? d.status : "new");
const isBlank = (v) => v === undefined || v === null || v === "";
const isoDay = (t = new Date()) => `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
const isOverdue = (d) => !!d.follow_up_due && d.follow_up_due < isoDay() && !DONE.has(statusOf(d));

function safeUrl(u) {
  const s = String(u || "").trim();
  return /^https?:\/\/[^\s]+$/i.test(s) ? s : "";
}

function scoreText(s) {
  if (s === "" || s == null) return "";
  return typeof s === "number" || /^\d+(\.\d+)?$/.test(String(s)) ? `Score ${s}/30` : `Score: ${s}`;
}

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === "function") return v.toDate();
  return null;
}

function fmtDay(v) {
  const d = toDate(v);
  return d ? d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
}

// "2026-10-30" -> "30 Oct" (with the year when it isn't this year).
function fmtIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return s || "";
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
}

// ---------- problems ----------

function problem(kind, err) {
  if (err) console.error(err);
  const body = $("problem-body");
  const mockLink = h("a", { href: "?mock=1" }, "the mock preview");
  if (kind === "config") {
    $("problem-title").textContent = "Not connected yet.";
    body.replaceChildren(
      h("p", {}, "The dashboard needs its Firebase settings. Paste the web app config into ", h("code", { text: "dashboard/firebase-config.js" }), " (step 8 of setup-dashboard.md), then upload that file to GitHub."),
      h("p", {}, "To look at the layout with sample data, open ", mockLink, "."),
    );
  } else if (kind === "sdk") {
    $("problem-title").textContent = "Couldn’t load sign-in.";
    body.replaceChildren(
      h("p", { text: "The Google/Firebase library didn’t load. Check the connection, allow this page in any content blocker, and reload." }),
    );
  } else {
    $("problem-title").textContent = "Something went wrong.";
    body.replaceChildren(h("p", { text: `The dashboard hit an unexpected error${err && err.message ? `: ${err.message}` : ""}. Reload the page; if it keeps happening, check the browser console.` }));
  }
  show("problem");
}

// ---------- signed-in board ----------

function enterBoard(email) {
  state.email = email;
  state.role = email.toLowerCase() === MANAGER ? "manager" : "zizi";
  state.unansweredOnly = state.role === "zizi";
  state.category = "All";
  state.query = "";
  state.keep.clear();
  Object.assign(pipe, { status: "all", showAll: false, query: "", sort: "rank" });
  pipe.keep.clear();
  $("who-email").textContent = email;
  $("who-role").textContent = state.role === "manager" ? "Manager" : "Zizi";
  $("manager-tools").hidden = state.role !== "manager";
  $("unanswered-only").checked = state.unansweredOnly;
  $("search").value = "";
  $("p-search").value = "";
  $("p-showall").checked = false;
  $("p-readonly").hidden = state.role === "manager";
  note($("tools-msg"), "");
  note($("board-msg"), "");
  clearCards();
  show("board");
  setView(location.hash === "#pipeline" ? "pipeline" : "brands");
}

function clearCards() {
  cards.clear();
  prows.clear();
  failed.clear();
  chipSig = "";
  orderSig = "";
  pipe.order = [];
  $("brand-list").replaceChildren();
  $("chips").replaceChildren();
  $("p-list").replaceChildren();
}

function leaveBoard() {
  state.rows.clear();
  state.loaded = false;
  state.email = "";
  state.role = null;
  clearCards();
}

function setView(view) {
  state.view = view;
  for (const b of document.querySelectorAll("[data-view]")) b.setAttribute("aria-pressed", String(b.dataset.view === view));
  $("pane-brands").hidden = view !== "brands";
  $("pane-pipeline").hidden = view !== "pipeline";
  $("view-board").classList.toggle("is-pipeline", view === "pipeline");
  const url = new URL(location.href);
  url.hash = view === "pipeline" ? "pipeline" : "";
  history.replaceState(null, "", url);
  render();
  if (view === "pipeline") renderPipeline(true);
}

// Re-render after data changes (snapshots, saves, imports).
function renderAll() {
  render();
  if (state.view === "pipeline") renderPipeline();
}

function sortedIds() {
  return [...state.rows.keys()].sort((a, b) => (Number(state.rows.get(a).rank) || 0) - (Number(state.rows.get(b).rank) || 0) || a.localeCompare(b));
}

function render() {
  if (!state.role) return;
  const ids = sortedIds();
  const list = $("brand-list");

  // Cards: create, update, remove; reorder only when the set or order changes.
  for (const id of ids) {
    if (!cards.has(id)) cards.set(id, buildCard(id));
    updateCard(id, state.rows.get(id));
  }
  for (const id of [...cards.keys()]) {
    if (!state.rows.has(id)) {
      cards.get(id).el.remove();
      cards.delete(id);
    }
  }
  const sig = ids.join(",");
  if (sig !== orderSig) {
    orderSig = sig;
    list.append(...ids.map((id) => cards.get(id).el));
  }

  renderChips(ids);

  // Progress
  const total = ids.length;
  const answered = ids.filter((id) => isAnswered(state.rows.get(id))).length;
  $("progress-line").textContent = `Answered ${answered} of ${total}`;
  $("progress-fill").style.width = total ? `${(answered / total) * 100}%` : "0";

  // Filters
  const terms = state.query.toLowerCase().split(/\s+/).filter(Boolean);
  let shown = 0;
  for (const id of ids) {
    const d = state.rows.get(id);
    const ok = matches(id, d, terms);
    cards.get(id).el.hidden = !ok;
    if (ok) shown++;
  }
  $("count-line").textContent = total ? `Showing ${shown} of ${total}` : "";
  renderEmpty(total, shown);
}

function matches(id, d, terms) {
  if (state.category !== "All" && mainCategory(d.category) !== state.category) return false;
  if (state.unansweredOnly && isAnswered(d) && !state.keep.has(id)) return false;
  if (!terms.length) return true;
  const hay = [d.brand, d.category, d.verdict, d.route_in, d.notes, d.url, d.zizi_note, state.role === "manager" ? d.manager_note : ""]
    .join(" ")
    .toLowerCase();
  return terms.every((t) => hay.includes(t));
}

function renderChips(ids) {
  const counts = new Map();
  for (const id of ids) {
    const c = mainCategory(state.rows.get(id).category);
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  if (state.category !== "All" && !counts.has(state.category)) state.category = "All";
  const cats = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const sig = JSON.stringify(cats);
  if (sig !== chipSig) {
    chipSig = sig;
    const chip = (name, n) =>
      h("button", { type: "button", class: "chip", "data-cat": name, onclick: () => setFilter({ category: name }) }, name, h("span", { class: "n", text: String(n) }));
    $("chips").replaceChildren(...(ids.length ? [chip("All", ids.length), ...cats.map(([c, n]) => chip(c, n))] : []));
  }
  for (const b of $("chips").children) b.setAttribute("aria-pressed", String(b.dataset.cat === state.category));
}

// The "nothing loaded yet" message both views share; null once there are rows.
function noDataMessage(total) {
  if (!state.loaded) return [h("p", { class: "fine", text: "Loading the list…" })];
  if (total) return null;
  return state.role === "manager"
    ? [
        h("p", {}, h("strong", { text: "No brands yet." })),
        h("p", { text: "Tap Import tracker CSV and choose outreach-tracker.csv from your computer. The file stays on your machine; only the rows go into the private database." }),
      ]
    : [h("p", {}, h("strong", { text: "The list isn’t loaded yet." })), h("p", { text: "Ask your manager to import it, then reload this page." })];
}

function renderEmpty(total, shown) {
  const box = $("empty");
  const none = noDataMessage(total);
  if (none) {
    box.replaceChildren(...none);
    box.hidden = false;
    return;
  }
  if (!shown) {
    const allDone = state.unansweredOnly && sortedIds().every((id) => isAnswered(state.rows.get(id)));
    const clear = h("button", { type: "button", class: "btn small", onclick: () => setFilter({ category: "All", query: "", unansweredOnly: false }) }, "Show everything");
    box.replaceChildren(
      h("p", { text: allDone ? "Every brand has an answer. Turn off Unanswered only to look back over them." : "Nothing matches these filters." }),
      h("p", {}, clear),
    );
    box.hidden = false;
    return;
  }
  box.hidden = true;
}

function setFilter(change) {
  Object.assign(state, change);
  if ("query" in change) $("search").value = change.query;
  if ("unansweredOnly" in change) $("unanswered-only").checked = change.unansweredOnly;
  state.keep.clear();
  render();
}

// ---------- Brands cards ----------

function buildCard(id) {
  const r = { id, sig: "" };
  r.top = h("div", { class: "brand-top" });

  r.buttons = [0, 1, 2, 3, 4, 5].map((i) =>
    h("button", { type: "button", "aria-pressed": "false", "aria-label": SCALE_LABELS[i] ? `${i}, ${SCALE_LABELS[i]}` : String(i), onclick: () => onScore(id, i) }, String(i)),
  );
  const ask = h(
    "fieldset",
    { class: "ask" },
    h("legend", {}, state.role === "manager" ? h("span", { class: "for", text: "Zizi’s answer" }) : null, "Would you buy or use this with your own money?"),
    h("div", { class: "scale" }, r.buttons),
    h("div", { class: "scale-labels", "aria-hidden": "true" }, h("span", { class: "l0", text: "Never" }), h("span", { class: "l3", text: "Maybe" }), h("span", { class: "l5", text: "Already do" })),
  );

  r.owns = h("input", { type: "checkbox", id: `o-${id}`, onchange: () => save(id, { zizi_owns: r.owns.checked }) });
  const owns = h("label", { class: "owns", for: `o-${id}` }, r.owns, h("span", { text: "I already own or use something from them" }));

  r.note = textField(id, "zizi_note", h("input", { type: "text", id: `n-${id}`, placeholder: "Anything I should know?", autocomplete: "off", enterkeyhint: "done" }));
  const noteField = h("label", { class: "field", for: `n-${id}` }, h("span", { class: "sr-only", text: "Zizi’s note" }), r.note);

  let managerField = null;
  if (state.role === "manager") {
    r.mnote = textField(id, "manager_note", h("textarea", { id: `m-${id}`, rows: "2" }));
    managerField = h("label", { class: "field manager", for: `m-${id}` }, h("span", { text: "Manager note" }), r.mnote);
  }

  r.lastEdit = h("span", { class: "last-edit" });
  r.status = h("span", { class: "save", "aria-live": "polite" });
  const foot = h("div", { class: "card-foot" }, r.lastEdit, r.status);

  r.el = h("article", { class: "card brand", id: `b-${id}`, "aria-labelledby": `t-${id}` }, r.top, ask, owns, noteField, managerField, foot);
  return r;
}

// Text fields save on change/blur, on Enter, after a pause in typing, and when the tab is hidden.
function textField(id, key, el) {
  let timer = 0;
  el.dataset.synced = ""; // last value known to be in the database
  el.dataset.sent = ""; // last value handed to save()
  const commit = () => {
    clearTimeout(timer);
    if (el.value === el.dataset.sent) return;
    el.dataset.sent = el.value;
    save(id, { [key]: el.value });
  };
  el._commit = commit;
  el.addEventListener("change", commit);
  el.addEventListener("blur", commit);
  el.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(commit, 1500);
  });
  if (el.tagName === "INPUT")
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        el.blur();
      }
    });
  return el;
}

function syncField(el, value) {
  if (!el) return;
  const v = value ?? "";
  if (document.activeElement === el) return; // never overwrite while someone types
  if (el.value !== el.dataset.synced) return; // an unsaved local edit wins until it saves
  el.value = v;
  el.dataset.synced = v;
  el.dataset.sent = v;
}

function updateCard(id, d) {
  const r = cards.get(id);
  const sig = JSON.stringify(FIELDS.map((f) => d[f] ?? ""));
  if (sig !== r.sig) {
    r.sig = sig;
    fillTop(r, d);
  }
  r.buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(d.zizi_w === i)));
  r.owns.checked = !!d.zizi_owns;
  syncField(r.note, d.zizi_note);
  syncField(r.mnote, d.manager_note);
  r.el.classList.toggle("answered", isAnswered(d));
  r.lastEdit.textContent = d.updated_by ? `Last edit: ${whoIs(d.updated_by)}${d.updated_at ? ` · ${fmtDay(d.updated_at)}` : ""}` : "";
}

function fillTop(r, d) {
  const name = d.brand || "(no name)";
  const url = safeUrl(d.url);
  const title = url
    ? h("a", { href: url, target: "_blank", rel: "noopener" }, name, h("span", { class: "ext", "aria-hidden": "true", text: "↗" }), h("span", { class: "sr-only", text: " (opens in a new tab)" }))
    : name;
  const why = h(
    "dl",
    {},
    d.route_in ? [h("dt", { text: "Route in" }), h("dd", { text: d.route_in })] : null,
    d.notes ? [h("dt", { text: "Notes" }), h("dd", { text: d.notes })] : null,
    !d.route_in && !d.notes ? h("dd", { text: "Nothing written down yet." }) : null,
  );
  r.top.replaceChildren(
    h("div", { class: "brand-head" }, h("span", { class: "rank", text: pad2(d.rank) }), h("h2", { id: `t-${r.id}` }, title)),
    h("p", { class: "meta" }, d.category ? h("span", { text: d.category }) : null, scoreText(d.score) ? h("span", { text: scoreText(d.score) }) : null, d.verdict ? h("span", { class: "verdict", text: d.verdict }) : null),
    h("details", {}, h("summary", { text: "Why it’s on the list" }), why),
  );
}

function onScore(id, i) {
  const d = state.rows.get(id);
  if (!d) return;
  const v = d.zizi_w === i ? null : i; // tapping the chosen number again clears it
  if (state.unansweredOnly) state.keep.add(id);
  // Optimistic: show it now; the database snapshot confirms or reverts it.
  state.rows.set(id, { ...d, zizi_w: v });
  render();
  save(id, { zizi_w: v, zizi_answered_at: v === null ? null : NOW });
}

// ---------- Pipeline ----------

// Row cells after rank, brand, category and Zizi's score: [field, label, input kind, class].
const P_ROW = [
  ["status", "Status", "select", "pc-status"],
  ["contact_name", "Contact", "text", "pc-name"],
  ["contact_email", "Email", "email", "pc-email"],
  ["follow_up_due", "Follow-up", "date", "pc-due"],
];
// Expanded panel: context (read-only for everyone) and pipeline details (editable by the manager).
const P_CONTEXT = [
  ["route_in", "Route in"],
  ["notes", "Notes"],
  ["zizi_note", "Zizi’s note"],
];
const P_DETAIL = [
  ["contact_title", "Contact title", "text"],
  ["date_sent", "Date sent", "date"],
  ["last_touch", "Last touch", "date"],
  ["fee_quoted", "Fee quoted", "text"],
  ["next_action", "Next action", "text"],
  ["manager_note", "Manager note", "area"], // manager only, as in Brands
];

function setPipe(change) {
  Object.assign(pipe, change);
  if ("query" in change) $("p-search").value = change.query;
  if ("showAll" in change) $("p-showall").checked = change.showAll;
  pipe.keep.clear();
  renderPipeline(true);
}

function sortPipeline(ids) {
  const get = (id) => state.rows.get(id);
  const by = {
    rank: () => 0,
    due: (a, b) => (get(a).follow_up_due || "9999").localeCompare(get(b).follow_up_due || "9999"),
    status: (a, b) => STATUS_ORDER[statusOf(get(a))] - STATUS_ORDER[statusOf(get(b))],
  }[pipe.sort];
  return [...ids].sort((a, b) => by(a, b) || (Number(get(a).rank) || 0) - (Number(get(b).rank) || 0));
}

function pMatches(id, d, terms) {
  if (pipe.keep.has(id)) return true;
  const s = statusOf(d);
  if (pipe.status === "all" ? !pipe.showAll && CLOSED.has(s) : s !== pipe.status) return false;
  if (!terms.length) return true;
  const hay = [d.brand, d.category, d.contact_name, d.contact_title, d.contact_email, d.route_in, d.notes, d.next_action, d.zizi_note, state.role === "manager" ? d.manager_note : ""]
    .join(" ")
    .toLowerCase();
  return terms.every((t) => hay.includes(t));
}

function renderPipeline(reorder = false) {
  if (!state.role) return;
  const ids = sortedIds();
  let changed = false;
  for (const id of ids) {
    if (!prows.has(id)) {
      prows.set(id, buildPRow(id));
      changed = true;
    }
    updatePRow(id, state.rows.get(id));
  }
  for (const id of [...prows.keys()]) {
    if (!state.rows.has(id)) {
      prows.get(id).el.remove();
      prows.delete(id);
      changed = true;
    }
  }
  if (reorder || changed) {
    pipe.order = sortPipeline(ids);
    $("p-list").append(...pipe.order.map((id) => prows.get(id).el));
  }

  const counts = Object.fromEntries(STATUSES.map(([k]) => [k, 0]));
  for (const id of ids) counts[statusOf(state.rows.get(id))]++;
  counts.all = pipe.showAll ? ids.length : ids.length - counts.declined - counts.dropped;
  for (const b of $("p-chips").children) {
    b.setAttribute("aria-pressed", String(b.dataset.status === pipe.status));
    b.lastChild.textContent = String(counts[b.dataset.status]);
  }
  for (const b of document.querySelectorAll("[data-sort]")) b.setAttribute("aria-pressed", String(b.dataset.sort === pipe.sort));

  const terms = pipe.query.toLowerCase().split(/\s+/).filter(Boolean);
  let shown = 0;
  for (const id of pipe.order) {
    const ok = pMatches(id, state.rows.get(id), terms);
    prows.get(id).el.hidden = !ok;
    if (ok) shown++;
  }
  $("p-count").textContent = ids.length ? `Showing ${shown} of ${ids.length}` : "";
  $("p-head").hidden = !shown;

  const box = $("p-empty");
  const none = noDataMessage(ids.length);
  if (none) box.replaceChildren(...none);
  else if (!shown)
    box.replaceChildren(
      h("p", { text: "Nothing matches these filters." }),
      h("p", {}, h("button", { type: "button", class: "btn small", onclick: () => setPipe({ status: "all", showAll: true, query: "" }) }, "Show everything")),
    );
  box.hidden = !none && !!shown;
}

// One editable control for the manager. Saves on blur, Enter or (select, date) change; Escape undoes.
function pControl(r, key, kind) {
  let el;
  if (kind === "select") el = h("select", { class: "pin" }, STATUSES.map(([k, l]) => h("option", { value: k, text: l })));
  else if (kind === "area") el = h("textarea", { class: "pin", rows: "2", placeholder: "—" });
  else
    el = h("input", {
      class: "pin",
      type: kind,
      placeholder: kind === "date" ? null : "—",
      autocomplete: "off",
      enterkeyhint: "done",
      autocapitalize: kind === "email" ? "off" : null,
      spellcheck: kind === "email" ? "false" : null,
    });
  el.dataset.synced = el.value;
  el.dataset.sent = el.value;
  const commit = () => {
    if (kind === "text" || kind === "email" || kind === "area") {
      const t = el.value.trim();
      if (t !== el.value) el.value = t;
    }
    if (el.value === el.dataset.sent) return;
    el.dataset.sent = el.value;
    pipe.keep.add(r.id);
    persist(r, r.id, { [key]: el.value });
  };
  el._commit = commit;
  el.addEventListener("change", commit);
  el.addEventListener("blur", commit);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      el.value = el.dataset.sent;
      el.blur();
    } else if (e.key === "Enter" && el.tagName === "INPUT") {
      e.preventDefault();
      el.blur();
    }
  });
  if (kind === "date") el.addEventListener("input", () => el.classList.toggle("is-empty", !el.value));
  r.fields[key] = el;
  return el;
}

// A labelled cell: an editable control for the manager, plain text for Zizi.
function pCell(r, key, label, kind, cls) {
  if (state.role === "manager") return h("label", { class: `pc ${cls}` }, h("span", { class: "lab", text: label }), pControl(r, key, kind));
  const v = h("span", { class: "pval" });
  r.vals[key] = { el: v, kind };
  return h("div", { class: `pc ${cls}` }, h("span", { class: "lab", text: label }), v);
}

function buildPRow(id) {
  const r = { id, sig: "", fields: {}, vals: {}, ctx: {} };
  r.tw = h("span", { class: "tw", "aria-hidden": "true", text: "+" });
  r.rankText = h("span", {});
  r.toggle = h("button", { type: "button", class: "pc-rank", "aria-expanded": "false", "aria-controls": `pd-${id}`, onclick: () => togglePRow(r) }, r.tw, r.rankText);
  r.brand = h("div", { class: "pc-brand" });
  r.cat = h("div", { class: "pc-cat" });
  r.zizi = h("span", { class: "pz" });
  const zizi = h("div", { class: "pc pc-zizi" }, h("span", { class: "lab", text: "Zizi" }), r.zizi);
  const cells = P_ROW.map(([key, label, kind, cls]) => pCell(r, key, label, kind, cls));
  r.dueCell = cells[P_ROW.findIndex(([key]) => key === "follow_up_due")];
  const main = h("div", { class: "pmain" }, r.toggle, r.brand, r.cat, zizi, ...cells);
  main.addEventListener("click", (e) => {
    if (!e.target.closest("a, button, input, select, textarea, label")) togglePRow(r);
  });

  const context = P_CONTEXT.map(([key, label]) => {
    r.ctx[key] = h("p", { class: "pd-text" });
    return h("div", { class: "pd-item" }, h("span", { class: "lab", text: label }), r.ctx[key]);
  });
  const details = P_DETAIL.filter(([key]) => state.role === "manager" || key !== "manager_note").map(([key, label, kind]) => pCell(r, key, label, kind, "pd-item"));
  r.lastEdit = h("p", { class: "pd-meta" });
  r.detail = h("div", { class: "pdetail", id: `pd-${id}`, hidden: true }, h("div", { class: "pd-col" }, context), h("div", { class: "pd-col" }, details), r.lastEdit);

  r.status = h("span", { class: "save pc-save", "aria-live": "polite" });
  r.el = h("li", { class: "prow", id: `p-${id}` }, main, r.detail, r.status);
  return r;
}

function togglePRow(r) {
  const open = r.detail.hidden;
  r.detail.hidden = !open;
  r.toggle.setAttribute("aria-expanded", String(open));
  r.tw.textContent = open ? "−" : "+";
  r.el.classList.toggle("open", open);
}

function updatePRow(id, d) {
  const r = prows.get(id);
  const sig = JSON.stringify([d.rank, d.brand, d.url, d.category]);
  if (sig !== r.sig) {
    r.sig = sig;
    const name = d.brand || "(no name)";
    const url = safeUrl(d.url);
    r.brand.replaceChildren(
      url ? h("a", { href: url, target: "_blank", rel: "noopener" }, name, h("span", { class: "ext", "aria-hidden": "true", text: "↗" }), h("span", { class: "sr-only", text: " (opens in a new tab)" })) : name,
    );
    r.rankText.textContent = pad2(d.rank);
    r.toggle.setAttribute("aria-label", `Details for ${name}`);
    r.cat.textContent = d.category || "";
  }
  const st = statusOf(d);
  r.zizi.textContent = isAnswered(d) ? String(d.zizi_w) : "—";
  for (const [key, el] of Object.entries(r.fields)) {
    syncField(el, key === "status" ? st : d[key]);
    if (el.type === "date") el.classList.toggle("is-empty", !el.value);
  }
  for (const [key, { el, kind }] of Object.entries(r.vals)) {
    const v = key === "status" ? STATUS_LABEL[st] : kind === "date" ? fmtIso(d[key]) : d[key];
    el.textContent = v || "—";
  }
  for (const [key, el] of Object.entries(r.ctx)) el.textContent = d[key] || "—";
  r.dueCell.classList.toggle("overdue", isOverdue(d));
  r.el.classList.toggle("closed", CLOSED.has(st));
  r.lastEdit.textContent = d.updated_by ? `Last edit: ${whoIs(d.updated_by)}${d.updated_at ? ` · ${fmtDay(d.updated_at)}` : ""}` : "";
}

// ---------- saving ----------

function setStatus(r, kind, retry) {
  clearTimeout(r.statusTimer);
  r.status.className = r.status.className.replace(/\s*\b(ok|err)\b/g, "");
  if (kind === "saving") r.status.textContent = "Saving…";
  else if (kind === "slow") r.status.textContent = "Still saving… check the connection";
  else if (kind === "ok") {
    r.status.classList.add("ok");
    r.status.textContent = "Saved";
    r.statusTimer = setTimeout(() => (r.status.textContent = ""), 2500);
  } else if (kind === "err") {
    r.status.classList.add("err");
    r.status.replaceChildren("Not saved. ", h("button", { type: "button", class: "linkish", onclick: retry }, "Retry"));
  } else r.status.textContent = "";
}

// After a save, mark every control that shows the saved value as in sync (Brands and Pipeline).
function markSynced(id, saved) {
  const c = cards.get(id);
  const p = prows.get(id);
  const els = [...(c ? [["zizi_note", c.note], ["manager_note", c.mnote]] : []), ...(p ? Object.entries(p.fields) : [])];
  for (const [k, el] of els) if (el && k in saved && el.value === String(saved[k] ?? "")) el.dataset.synced = el.value;
}

// Brands cards report save state on their own card; Pipeline rows on their row.
function save(id, patch) {
  return persist(cards.get(id), id, patch);
}

async function persist(r, id, patch) {
  if (!r || !backend) return;
  const merged = { ...(failed.get(id) || {}), ...patch };
  failed.delete(id);
  const seq = (r.seq = (r.seq || 0) + 1);
  setStatus(r, "saving");
  const slow = setTimeout(() => r.seq === seq && setStatus(r, "slow"), 8000);
  inflight++;
  try {
    await backend.save(id, merged);
    markSynced(id, merged);
    if (failed.has(id)) setStatus(r, "err", () => persist(r, id, {}));
    else if (r.seq === seq) setStatus(r, "ok");
  } catch (err) {
    console.error("Save failed", id, err);
    failed.set(id, { ...merged, ...(failed.get(id) || {}) });
    setStatus(r, "err", () => persist(r, id, {}));
  } finally {
    clearTimeout(slow);
    inflight--;
  }
}

addEventListener("beforeunload", (e) => {
  if (!inflight && !failed.size) return;
  e.preventDefault();
  e.returnValue = "";
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) document.activeElement?._commit?.();
});

// ---------- CSV ----------

function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

// "followed_up", "Followed up", "in-talks" -> status key; null if unknown.
function parseStatus(v) {
  const s = v.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return STATUS_LABEL[s] ? s : null;
}

function finalToStatus(v) {
  const s = v.trim().toLowerCase();
  if (s in FINAL_STATUS) return FINAL_STATUS[s];
  if (s.startsWith("drop")) return "dropped";
  if (s.startsWith("hold")) return "hold";
  return "new";
}

// yyyy-mm-dd, yyyy/m/d, an ISO timestamp, or US m/d/yy(yy) -> yyyy-mm-dd; null if not a date.
function parseDay(v) {
  let y, m, d;
  let x = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ].*)?$/.exec(v);
  if (x) [, y, m, d] = x;
  else if ((x = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(v))) [, m, d, y] = x;
  else return null;
  if (y.length === 2) y = `20${y}`;
  const t = new Date(+y, +m - 1, +d);
  return t.getFullYear() === +y && t.getMonth() === +m - 1 && t.getDate() === +d ? isoDay(t) : null;
}

function parseBool(v) {
  const s = v.trim().toLowerCase();
  if (["yes", "y", "true", "1", "x"].includes(s)) return true;
  if (["no", "n", "false", "0"].includes(s)) return false;
  return null;
}

// Tracker or dashboard-export CSV -> { docs: [{ id, base, fill }], errors: [] }.
// `base` is the brand description (written every import, only for columns present in the file);
// `fill` holds pipeline fields, notes and Zizi's answers, which an import only writes where empty.
function trackerToDocs(text) {
  const rows = parseCSV(text);
  const errors = [];
  if (!rows.length) return { docs: [], errors: ["The file is empty."] };
  const header = rows[0].map((s) => s.trim().toLowerCase());
  if (!header.includes("rank") || !header.includes("brand")) return { docs: [], errors: ["The header row needs at least “rank” and “brand” columns."] };
  const seen = new Set();
  const docs = [];
  rows.slice(1).forEach((cells, n) => {
    const line = n + 2;
    const cell = (name) => {
      const i = header.indexOf(name);
      return i < 0 ? undefined : String(cells[i] ?? "").trim();
    };
    const bad = (what, v, want) => errors.push(`Line ${line}: ${what} “${v}” ${want}.`);
    const rank = Number(cell("rank"));
    if (!Number.isInteger(rank) || rank < 1 || rank > 999) return bad("rank", cell("rank"), "is not a whole number from 1 to 999");
    const id = docId(rank);
    if (seen.has(id)) return errors.push(`Line ${line}: rank ${rank} appears twice.`);
    seen.add(id);

    const base = { rank };
    for (const f of FIELDS) {
      const v = cell(f);
      if (f === "rank" || v === undefined) continue;
      if (f === "score") base.score = /^\d+(\.\d+)?$/.test(v) ? Number(v) : v;
      else if (f === "url") base.url = safeUrl(v);
      else base[f] = v;
    }

    const fill = {};
    for (const f of ["contact_name", "contact_title", "contact_email", "fee_quoted", "next_action", "manager_note", "zizi_note"]) {
      const v = cell(f);
      if (v) fill[f] = v;
    }
    for (const f of DATE_FIELDS) {
      const v = cell(f);
      if (!v) continue;
      const day = parseDay(v);
      if (day) fill[f] = day;
      else bad(f, v, "isn’t a date (use yyyy-mm-dd)");
    }
    const st = cell("status");
    const fin = cell("final_status");
    if (st) {
      const s = parseStatus(st);
      if (s) fill.status = s;
      else bad("status", st, `isn’t one of: ${STATUSES.map(([k]) => k).join(", ")}`);
    } else if (fin) fill.status = finalToStatus(fin);
    const w = cell("zizi_w") || cell("zizi_score");
    if (w) {
      if (/^[0-5]$/.test(w)) fill.zizi_w = Number(w);
      else bad("Zizi’s answer", w, "isn’t a whole number from 0 to 5");
    }
    const owns = cell("zizi_owns");
    if (owns) {
      const b = parseBool(owns);
      if (b === null) bad("zizi_owns", owns, "isn’t yes or no");
      else fill.zizi_owns = b;
    }
    const at = cell("zizi_answered_at");
    if (at && !Number.isNaN(Date.parse(at))) fill.zizi_answered_at = new Date(at);
    docs.push({ id, base, fill });
  });
  return { docs, errors };
}

// Against what is already in the database: description always, everything else only where empty.
function planImport(docs) {
  let filled = 0;
  const writes = docs.map(({ id, base, fill }) => {
    const cur = state.rows.get(id) || {};
    const data = { ...base };
    for (const [k, v] of Object.entries(fill)) {
      if (k === "zizi_answered_at" || !isBlank(cur[k])) continue;
      data[k] = v;
      filled++;
    }
    if ("zizi_w" in data && isBlank(cur.zizi_answered_at)) data.zizi_answered_at = fill.zizi_answered_at || NOW;
    if (isBlank(cur.status) && !("status" in data)) data.status = "new";
    return { id, data };
  });
  return { writes, filled };
}

function toCSV(ids) {
  const cell = (v) => {
    if (v == null) return "";
    const d = toDate(v);
    let s = d ? d.toISOString() : String(v);
    return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [EXPORT_FIELDS.join(",")];
  for (const id of ids) {
    const d = { ...state.rows.get(id) };
    d.status = statusOf(d);
    lines.push(EXPORT_FIELDS.map((f) => cell(d[f])).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

function download(name, text) {
  const blob = new Blob(["﻿", text], { type: "text/csv;charset=utf-8" });
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

async function onImportFile(e) {
  const input = e.target;
  const file = input.files && input.files[0];
  input.value = "";
  if (!file || !backend) return;
  const msg = $("tools-msg");
  if (!state.loaded) return note(msg, "The list is still loading. Try the import again in a moment.");
  let parsed;
  try {
    parsed = trackerToDocs(await file.text());
  } catch (err) {
    console.error(err);
    return note(msg, "Couldn’t read that file. Choose the tracker CSV (UTF-8, header row first).");
  }
  const { docs, errors } = parsed;
  if (errors.length) return note(msg, `Not imported. ${errors.slice(0, 3).join(" ")}${errors.length > 3 ? ` (+${errors.length - 3} more)` : ""}`);
  if (!docs.length) return note(msg, "No rows found under the header.");
  const fresh = docs.filter((d) => !state.rows.has(d.id)).length;
  const { writes, filled } = planImport(docs);
  const ok = confirm(
    `Import ${docs.length} brands from ${file.name}?\n\n${fresh} new, ${docs.length - fresh} already here. Brand details are refreshed from the file. Status, contacts, dates, notes and Zizi's answers are only filled where they are empty (${filled} empty fields); nothing already entered is overwritten.${MOCK ? "\n\nMock mode: this only changes this page, nothing is saved." : ""}`,
  );
  if (!ok) return note(msg, "Import cancelled.");
  note(msg, "Importing…");
  try {
    await backend.importDocs(writes);
    note(msg, `Imported ${docs.length} brands (${fresh} new, ${filled} empty fields filled).${MOCK ? " Mock mode: in this page only, nothing saved." : ""}`);
  } catch (err) {
    console.error(err);
    note(msg, `Import failed: ${err.code || err.message}. Nothing was half-written in a batch that failed; try again.`);
  }
}

function onExport() {
  const ids = sortedIds();
  if (!ids.length) return note($("tools-msg"), "Nothing to export yet.");
  download(`zizi-brands-${isoDay()}.csv`, toCSV(ids));
  note($("tools-msg"), `Exported ${ids.length} brands with every field, including Zizi’s answers and the pipeline.`);
}

// ---------- wiring shared by both modes ----------

function wireBoard() {
  for (const b of document.querySelectorAll("[data-view]"))
    b.addEventListener("click", () => {
      document.activeElement?._commit?.();
      setView(b.dataset.view);
    });
  addEventListener("hashchange", () => state.role && setView(location.hash === "#pipeline" ? "pipeline" : "brands"));

  $("unanswered-only").addEventListener("change", (e) => setFilter({ unansweredOnly: e.target.checked }));
  let t = 0;
  $("search").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => setFilter({ query: e.target.value.trim() }), 120);
  });

  $("p-chips").replaceChildren(
    ...[["all", "All"], ...STATUSES].map(([k, label]) =>
      h("button", { type: "button", class: "p-chip", "data-status": k, "aria-pressed": "false", onclick: () => setPipe({ status: k }) }, label, h("span", { class: "n" })),
    ),
  );
  $("p-showall").addEventListener("change", (e) => setPipe({ showAll: e.target.checked }));
  let pt = 0;
  $("p-search").addEventListener("input", (e) => {
    clearTimeout(pt);
    pt = setTimeout(() => setPipe({ query: e.target.value.trim() }), 120);
  });
  for (const b of document.querySelectorAll("[data-sort]")) b.addEventListener("click", () => setPipe({ sort: b.dataset.sort }));

  $("import-file").addEventListener("change", onImportFile);
  $("export-btn").addEventListener("click", onExport);
  $("signout-btn").addEventListener("click", () => {
    document.activeElement?._commit?.();
    backend?.signOut();
  });
  if (IN_APP) $("inapp-hint").hidden = false;
}

// ---------- Firebase mode ----------

async function startFirebase() {
  let cfg;
  try {
    ({ firebaseConfig: cfg } = await import("./firebase-config.js"));
  } catch (err) {
    return problem("config", err);
  }
  const placeholder = !cfg || ["apiKey", "authDomain", "projectId", "appId"].some((k) => typeof cfg[k] !== "string" || !cfg[k] || cfg[k].includes("PASTE_"));
  if (placeholder) {
    console.error("Firebase config placeholder: paste the web app config into /dashboard/firebase-config.js (see setup-dashboard.md).");
    return problem("config");
  }

  let A, F, S;
  try {
    [A, F, S] = await Promise.all([import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-firestore.js`)]);
  } catch (err) {
    return problem("sdk", err);
  }

  const app = A.initializeApp(cfg);
  const auth = F.getAuth(app);
  const db = S.getFirestore(app);
  const provider = new F.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  let unsub = null;

  const stamp = (data) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === NOW ? S.serverTimestamp() : v]));
  backend = {
    save: (id, patch) => S.updateDoc(S.doc(db, "brands", id), { ...stamp(patch), updated_at: S.serverTimestamp(), updated_by: state.email }),
    importDocs: async (docs) => {
      for (let i = 0; i < docs.length; i += 400) {
        const batch = S.writeBatch(db);
        for (const { id, data } of docs.slice(i, i + 400))
          batch.set(S.doc(db, "brands", id), { ...stamp(data), updated_at: S.serverTimestamp(), updated_by: state.email }, { merge: true });
        await batch.commit();
      }
    },
    signOut: () => F.signOut(auth),
  };

  const signinMsg = $("signin-msg");
  const authError = (err) => {
    console.error(err);
    const code = err && err.code;
    const text =
      code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request" || code === "auth/user-cancelled"
        ? "Sign-in was closed before it finished. Try again."
        : code === "auth/unauthorized-domain"
          ? `This address (${location.hostname}) isn’t authorised in Firebase yet. Add it under Authentication → Settings → Authorized domains.`
          : code === "auth/network-request-failed"
            ? "No connection to Google. Check the network and try again."
            : code === "auth/operation-not-allowed"
              ? "Google sign-in isn’t switched on in Firebase yet (Authentication → Sign-in method → Google)."
              : `Sign-in didn’t work (${code || err.message || "unknown error"}).${IN_APP ? " Open this page in Safari or Chrome and try again." : ""}`;
    note(signinMsg, text);
  };

  // Popup first: it works on desktop and on mobile Safari/Chrome when started straight from the tap.
  // In-app browsers usually can't open popups, so they go straight to a full-page redirect;
  // anywhere a popup is blocked we fall back to the redirect too.
  $("signin-btn").addEventListener("click", () => {
    note(signinMsg, "");
    if (IN_APP) return void F.signInWithRedirect(auth, provider).catch(authError);
    F.signInWithPopup(auth, provider).catch((err) => {
      if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"].includes(err.code)) return F.signInWithRedirect(auth, provider).catch(authError);
      authError(err);
    });
  });
  F.getRedirectResult(auth).catch(authError);

  F.onAuthStateChanged(auth, async (user) => {
    if (unsub) {
      unsub();
      unsub = null;
    }
    leaveBoard();
    if (!user) return show("signin");
    const email = String(user.email || "");
    if (!user.emailVerified || !TEAM.includes(email.toLowerCase())) {
      await F.signOut(auth).catch(() => {});
      note(signinMsg, `${user.email || "That account"} isn’t one of the two accounts for this dashboard, so it was signed out. Sign in with the right Google account.`);
      return show("signin");
    }
    enterBoard(email);
    unsub = S.onSnapshot(
      S.collection(db, "brands"),
      (snap) => {
        for (const ch of snap.docChanges()) {
          if (ch.type === "removed") state.rows.delete(ch.doc.id);
          else state.rows.set(ch.doc.id, ch.doc.data({ serverTimestamps: "estimate" }));
        }
        state.loaded = true;
        note($("board-msg"), "");
        renderAll();
      },
      (err) => {
        console.error(err);
        state.loaded = true;
        note(
          $("board-msg"),
          err.code === "permission-denied"
            ? "The database refused access. Check that the rules from firestore.rules are published (Firestore Database → Rules) and that you’re signed in with an allowed account."
            : `Couldn’t load the list (${err.code || err.message}). Reload to try again.`,
        );
        renderAll();
      },
    );
  });
}

// ---------- Mock mode (?mock=1): made-up rows, answers kept in memory only ----------

const MOCK_ROWS = [
  { rank: 1, brand: "Sample Linen Co.", category: "Clothing", score: 26, verdict: "Accept", route_in: "Partnerships email", notes: "Example row for layout checks", url: "https://example.com/" },
  { rank: 2, brand: "Sample Loafer Studio", category: "Footwear", score: 24, verdict: "Accept (warm)", route_in: "Affiliate program, then ambassador slot", notes: "", url: "https://example.org/" },
  { rank: 3, brand: "Sample Resale Market", category: "Resale", score: 23, verdict: "Accept", route_in: "Creator partnerships team", notes: "Long note to check wrapping: secondhand without apology, kept for years, tailored and worn on camera more than once.", url: "https://example.net/" },
  { rank: 4, brand: "Sample Silver Hair Care", category: "Hair", score: 21, verdict: "Counter", route_in: "", notes: "Check the formulas and the language first", url: "" },
  { rank: 5, brand: "Sample Gold Studio", category: "Jewelry", score: 25, verdict: "Accept", route_in: "Direct email; gifting first", notes: "", url: "https://example.com/jewelry" },
  { rank: 6, brand: "Sample Steam & Care", category: "Garment care", score: 22, verdict: "Accept", route_in: "Affiliate, then partnerships email", notes: "", url: "https://example.com/care" },
  { rank: 7, brand: "Sample Detailing Supply", category: "Car care", score: 22, verdict: "Accept (local)", route_in: "Direct email to marketing", notes: "Black car in the rain", url: "https://example.com/detail" },
  { rank: 8, brand: "Sample Press Fleet Program", category: "Automotive · press loan", score: "enabler", verdict: "Apply now", route_in: "Online application with media kit", notes: "", url: "https://example.org/loan" },
  { rank: 9, brand: "Sample Regional Motor Museum and Events Hall", category: "Automotive · event + media", score: 27, verdict: "Accept (local)", route_in: "Events team", notes: "Year-round events", url: "https://example.org/museum" },
  { rank: 10, brand: "Sample Driving Gloves", category: "Driving gear · gifting", score: 24, verdict: "Accept", route_in: "", notes: "", url: "https://example.net/gloves" },
  { rank: 11, brand: "Sample Camera Mounts", category: "Filming gear · paid + gifting", score: 23, verdict: "Accept", route_in: "Creator program", notes: "", url: "https://example.net/camera" },
  { rank: 12, brand: "Sample Makeup Studio", category: "Makeup", score: 20, verdict: "Counter", route_in: "Creator page application", notes: "", url: "https://example.com/makeup" },
];
const MOCK_ANSWERS = {
  1: { zizi_w: 5, zizi_owns: true, zizi_note: "Wear the trousers weekly" },
  2: { zizi_w: 4, zizi_owns: false, zizi_note: "" },
  7: { zizi_w: 2, zizi_owns: false, zizi_note: "" },
};
// Pipeline sample: day offsets from today, so one follow-up is always overdue.
function mockPipeline() {
  const day = (n) => isoDay(new Date(Date.now() + n * 864e5));
  return {
    1: { status: "in_talks", contact_name: "Alex Sample", contact_title: "Partnerships lead", contact_email: "alex@example.com", date_sent: day(-12), follow_up_due: day(-2), last_touch: day(-5), fee_quoted: "$1,500 + 30-day usage", next_action: "Send the revised deck" },
    2: { status: "pitched", contact_name: "Sam Example", contact_email: "sam@example.org", date_sent: day(-6), follow_up_due: day(3) },
    3: { status: "followed_up", contact_email: "creators@example.net", date_sent: day(-14), follow_up_due: day(-1), last_touch: day(-7) },
    5: { status: "researching", next_action: "Find the studio manager’s name" },
    7: { status: "contract", contact_name: "Jo Placeholder", contact_title: "Marketing manager", contact_email: "jo@example.com", fee_quoted: "$900", follow_up_due: day(7) },
    8: { status: "pitched", contact_name: "Online form", date_sent: day(-3), follow_up_due: day(4) },
    9: { status: "live", contact_name: "Riley Test", contact_email: "events@example.org", fee_quoted: "Hosted evening, $1,200", follow_up_due: day(-20) },
    10: { status: "hold", next_action: "Revisit in spring" },
    11: { status: "declined", contact_email: "creators@example.net", last_touch: day(-9) },
    12: { status: "dropped", next_action: "" },
  };
}

function startMock() {
  $("mockbar").hidden = false;
  document.title = `Mock · ${document.title}`;
  const yesterday = new Date(Date.now() - 864e5);
  const crm = mockPipeline();
  for (const row of MOCK_ROWS) {
    const a = MOCK_ANSWERS[row.rank];
    state.rows.set(docId(row.rank), {
      template: "1",
      ...row,
      status: "new",
      ...crm[row.rank],
      zizi_w: null,
      zizi_owns: false,
      zizi_note: "",
      manager_note: "",
      ...(a ? { ...a, zizi_answered_at: yesterday, updated_at: yesterday, updated_by: ZIZI } : {}),
    });
  }
  state.loaded = true;
  const failEveryOther = params.get("fail") === "1"; // ?mock=1&fail=1 exercises the retry path
  let attempts = 0;
  const local = (data) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === NOW ? new Date() : v]));

  backend = {
    save: (id, patch) =>
      new Promise((resolve, reject) =>
        setTimeout(() => {
          if (failEveryOther && attempts++ % 2 === 0) return reject(new Error("Mock failure (fail=1)"));
          state.rows.set(id, { ...state.rows.get(id), ...local(patch), updated_at: new Date(), updated_by: state.email });
          renderAll();
          resolve();
        }, 300),
      ),
    importDocs: async (docs) => {
      for (const { id, data } of docs) state.rows.set(id, { ...(state.rows.get(id) || {}), ...local(data), updated_at: new Date(), updated_by: state.email });
      renderAll();
    },
    signOut: () => {
      leaveRole();
      show("signin");
    },
  };

  const asButtons = document.querySelectorAll("[data-mock-as]");
  const enterAs = (who) => {
    for (const b of asButtons) b.setAttribute("aria-pressed", String(b.dataset.mockAs === who));
    const url = new URL(location.href);
    url.searchParams.set("as", who);
    history.replaceState(null, "", url);
    enterBoard(who === "zizi" ? ZIZI : MANAGER);
  };
  const leaveRole = () => {
    state.role = null;
    clearCards();
  };
  for (const b of asButtons) b.addEventListener("click", () => enterAs(b.dataset.mockAs));
  $("signin-btn").addEventListener("click", () => enterAs(new URL(location.href).searchParams.get("as") === "zizi" ? "zizi" : "manager"));
  enterAs(params.get("as") === "zizi" ? "zizi" : "manager");
}

// ---------- start ----------

wireBoard();
if (MOCK) startMock();
else startFirebase().catch((err) => problem("unexpected", err));
