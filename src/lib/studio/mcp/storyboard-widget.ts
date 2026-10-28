import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

/**
 * The storyboard gallery: an MCP Apps view (ui:// resource) that chat clients
 * which support it — claude.ai, Claude Desktop — draw in place of the JSON a
 * tool returns. Frames show as a grid and clips play inline, which an image
 * content block cannot do for video.
 *
 * Clients without MCP Apps ignore the `_meta` and read the text content as
 * before, so every tool that points here still answers in words.
 *
 * The page is self-contained: no bundler, no CDN. It talks to the host over
 * postMessage JSON-RPC (ui/initialize, then ui/notifications/tool-result).
 */
export const STORYBOARD_WIDGET_URI = "ui://creator-studio/storyboard-gallery.html"
const MCP_APP_MIME = "text/html;profile=mcp-app"

/** Key in a tool result's `_meta` that carries what the view draws. */
export const STORYBOARD_VIEW_META_KEY = "creator-studio/view"

/** Tool `_meta` that tells the host to render the gallery. Both keys, for hosts on the older spelling. */
export const storyboardWidgetToolMeta = { ui: { resourceUri: STORYBOARD_WIDGET_URI }, "ui/resourceUri": STORYBOARD_WIDGET_URI }

/**
 * Where the page may load images and video from. Signed URLs live on the
 * Supabase project's origin; nothing else is allowed in, and the page makes no
 * network requests of its own.
 */
function mediaOrigins() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  try { return raw ? [new URL(raw).origin] : [] } catch { return [] }
}

export function registerStoryboardWidget(server: McpServer) {
  const ui = { csp: { resourceDomains: mediaOrigins(), connectDomains: [] }, prefersBorder: true }
  server.registerResource("Storyboard gallery", STORYBOARD_WIDGET_URI, {
    title: "Storyboard gallery", description: "Shows a project's storyboard frames, clips, cast and final cut.",
    mimeType: MCP_APP_MIME, _meta: { ui },
  }, async () => ({ contents: [{ uri: STORYBOARD_WIDGET_URI, mimeType: MCP_APP_MIME, text: STORYBOARD_WIDGET_HTML, _meta: { ui } }] }))
}

export const STORYBOARD_WIDGET_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Storyboard</title>
<style>
:root { --bg: #ffffff; --card: #f6f6f4; --line: #e3e2de; --text: #1d1d1b; --muted: #6f6e69; --accent: #c4622d; --chip: #ecebe7; }
:root[data-theme="dark"] { --bg: #1f1f1e; --card: #2a2a28; --line: #3a3a37; --text: #eeede9; --muted: #a3a29c; --accent: #e08752; --chip: #34342f; }
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
main { padding: 14px; }
header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
h1 { font-size: 16px; margin: 0; font-weight: 600; }
.sub { color: var(--muted); font-size: 12px; }
h2 { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 18px 0 8px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
.cast { grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
.media { position: relative; background: #000; aspect-ratio: var(--aspect, 16 / 9); cursor: pointer; }
.cast .media { aspect-ratio: 1; background: var(--chip); }
.media img, .media video { width: 100%; height: 100%; object-fit: cover; display: block; }
.cast .media img { object-fit: contain; }
.empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted); background: var(--chip); font-size: 12px; text-align: center; padding: 8px; }
.badge { position: absolute; top: 6px; left: 6px; background: rgba(0,0,0,.62); color: #fff; font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 99px; }
.play { position: absolute; bottom: 6px; right: 6px; background: rgba(0,0,0,.62); color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 99px; }
.body { padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 4px; }
.title { font-weight: 600; font-size: 13px; }
.desc { color: var(--muted); font-size: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.tabs { display: flex; gap: 4px; }
.tabs button, .bar button { font: inherit; font-size: 11px; border: 1px solid var(--line); background: var(--bg); color: var(--text); border-radius: 99px; padding: 2px 9px; cursor: pointer; }
.tabs button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
.bar { display: flex; gap: 6px; align-items: center; }
.final video { width: 100%; max-height: 420px; background: #000; border-radius: 10px; display: block; }
.single img, .single video { width: 100%; max-height: 560px; object-fit: contain; background: #000; border-radius: 10px; display: block; }
.single audio { width: 100%; }
.note { color: var(--muted); font-size: 12px; padding: 24px 0; text-align: center; }
dialog { border: 0; padding: 0; background: transparent; max-width: 96vw; }
dialog::backdrop { background: rgba(0,0,0,.8); }
dialog img, dialog video { max-width: 94vw; max-height: 86vh; display: block; border-radius: 8px; }
</style>
</head>
<body>
<main id="app"><p class="note">Loading storyboard…</p></main>
<dialog id="viewer"></dialog>
<script>
(function () {
  var app = document.getElementById("app");
  var viewer = document.getElementById("viewer");
  var nextId = 1, pending = {}, lastArgs = null, toolName = null, data = null, refreshing = false;

  function send(message) { window.parent.postMessage(Object.assign({ jsonrpc: "2.0" }, message), "*"); }
  function request(method, params) {
    var id = nextId++;
    return new Promise(function (resolve, reject) { pending[id] = { resolve: resolve, reject: reject }; send({ id: id, method: method, params: params }); });
  }
  function notify(method, params) { send({ method: method, params: params || {} }); }

  function applyContext(context) {
    if (!context) return;
    if (context.theme) document.documentElement.setAttribute("data-theme", context.theme);
    if (context.toolInfo && context.toolInfo.tool && context.toolInfo.tool.name) toolName = context.toolInfo.tool.name;
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var message = event.data;
    if (!message || message.jsonrpc !== "2.0") return;
    if (message.id !== undefined && (message.result !== undefined || message.error !== undefined) && pending[message.id]) {
      var waiter = pending[message.id]; delete pending[message.id];
      if (message.error) waiter.reject(message.error); else waiter.resolve(message.result);
      return;
    }
    if (message.method === "ui/notifications/tool-input") { lastArgs = (message.params && message.params.arguments) || null; return; }
    if (message.method === "ui/notifications/tool-result") { show(message.params); return; }
    if (message.method === "ui/notifications/host-context-changed") { applyContext(message.params); return; }
    if (message.method === "ui/notifications/tool-cancelled") { app.innerHTML = '<p class="note">Cancelled.</p>'; return; }
    // Requests from the host (teardown, ping) only need an answer.
    if (message.id !== undefined && message.method) send({ id: message.id, result: {} });
  });

  function show(result) {
    var content = result && ((result._meta && result._meta["creator-studio/view"]) || result.structuredContent);
    if (result && result.isError) { app.innerHTML = ""; app.appendChild(note(textOf(result) || "The studio could not load this.")); return; }
    if (!content || !content.view) { app.innerHTML = ""; app.appendChild(note("Nothing to show.")); return; }
    // The server names the call that made this view, for hosts that send
    // neither tool-input nor toolInfo.
    if (content.refresh) { toolName = content.refresh.tool || toolName; lastArgs = content.refresh.arguments || lastArgs; }
    data = content;
    render();
  }
  function textOf(result) {
    var block = (result.content || []).filter(function (item) { return item.type === "text"; })[0];
    if (!block) return "";
    try { var parsed = JSON.parse(block.text); return parsed.error || ""; } catch (e) { return block.text; }
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === "text") node.textContent = attrs[key];
      else if (key.slice(0, 2) === "on") node.addEventListener(key.slice(2), attrs[key]);
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) { if (child) node.appendChild(child); });
    return node;
  }
  function note(text) { return el("p", { class: "note", text: text }); }
  function count(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

  function openLink(url) { request("ui/open-link", { url: url }).catch(function () {}); }
  function enlarge(kind, url) {
    viewer.innerHTML = "";
    var media = kind === "video" ? el("video", { src: url, controls: "", autoplay: "", playsinline: "" }) : el("img", { src: url, alt: "" });
    viewer.appendChild(media);
    viewer.showModal();
  }
  viewer.addEventListener("click", function (event) { if (event.target === viewer) { viewer.close(); viewer.innerHTML = ""; } });

  // Signed links last an hour. A gallery reopened later asks the server for
  // fresh ones once, instead of showing a wall of broken pictures.
  function expired() {
    if (refreshing || !toolName || !lastArgs) return;
    refreshing = true;
    request("tools/call", { name: toolName, arguments: lastArgs })
      .then(function (result) { show(result); })
      .catch(function () {})
      .then(function () { setTimeout(function () { refreshing = false; }, 30000); });
  }

  function mediaBox(kind, url, label, emptyText) {
    var box = el("div", { class: "media" });
    if (!url) { box.appendChild(el("div", { class: "empty", text: emptyText })); }
    else if (kind === "video") {
      var video = el("video", { src: url + "#t=0.1", preload: "metadata", playsinline: "", muted: "" });
      video.addEventListener("error", expired);
      box.appendChild(video);
      box.appendChild(el("span", { class: "play", text: "▶ Play" }));
      box.addEventListener("click", function () { enlarge("video", url); });
    } else {
      var image = el("img", { src: url, alt: label || "", loading: "lazy" });
      image.addEventListener("error", expired);
      box.appendChild(image);
      box.addEventListener("click", function () { enlarge("image", url); });
    }
    return box;
  }

  function shotCard(shot) {
    var showing = shot.video ? "video" : "image";
    var card = el("div", { class: "card" });
    var holder = el("div");
    function draw() {
      holder.innerHTML = "";
      var box = showing === "video"
        ? mediaBox("video", shot.video, shot.title, "No clip yet")
        : mediaBox("image", shot.image, shot.title, "No frame yet");
      box.appendChild(el("span", { class: "badge", text: String(shot.number) }));
      holder.appendChild(box);
      Array.prototype.forEach.call(tabs.children, function (button) { button.setAttribute("aria-pressed", String(button.dataset.kind === showing)); });
    }
    var tabs = el("div", { class: "tabs" });
    if (shot.image && shot.video) {
      ["image", "video"].forEach(function (kind) {
        var button = el("button", { type: "button", text: kind === "image" ? "Frame" : "Clip", onclick: function () { showing = kind; draw(); } });
        button.dataset.kind = kind;
        tabs.appendChild(button);
      });
    }
    var status = shot.video ? (shot.durationSeconds ? shot.durationSeconds + "s clip" : "Clip ready")
      : shot.videoStatus && shot.videoStatus !== "completed" && shot.videoStatus !== "none" ? "Clip " + shot.videoStatus : "";
    card.appendChild(holder);
    card.appendChild(el("div", { class: "body" }, [
      el("div", { class: "title", text: shot.title || "Shot " + shot.number }),
      shot.description ? el("div", { class: "desc", text: shot.description }) : null,
      el("div", { class: "bar" }, [tabs.children.length ? tabs : null, status ? el("span", { class: "sub", text: status }) : null]),
    ]));
    draw();
    return card;
  }

  function render() {
    app.innerHTML = "";
    if (data.view === "media") return renderSingle();
    var aspect = (data.project && data.project.aspect || "16:9").split(":");
    if (aspect.length === 2) app.style.setProperty("--aspect", aspect[0] + " / " + aspect[1]);
    var frames = data.shots.filter(function (shot) { return shot.image; }).length;
    var clips = data.shots.filter(function (shot) { return shot.video; }).length;
    app.appendChild(el("header", {}, [
      el("div", {}, [
        el("h1", { text: (data.project && data.project.name) || "Storyboard" }),
        el("div", { class: "sub", text: [data.episode && data.episode.name, count(data.shots.length, "shot"), count(frames, "frame"), count(clips, "clip"), data.project && data.project.style].filter(Boolean).join(" · ") }),
      ]),
      data.studioUrl ? el("div", { class: "bar" }, [el("button", { type: "button", text: "Open in studio", onclick: function () { openLink(data.studioUrl); } })]) : null,
    ]));
    if (data.finalCut && data.finalCut.url) {
      var video = el("video", { src: data.finalCut.url, controls: "", preload: "metadata", playsinline: "" });
      video.addEventListener("error", expired);
      app.appendChild(el("h2", { text: "Final cut" }));
      app.appendChild(el("div", { class: "final" }, [video]));
    }
    app.appendChild(el("h2", { text: "Storyboard" }));
    if (!data.shots.length) app.appendChild(note("This episode has no shots yet."));
    else app.appendChild(el("div", { class: "grid" }, data.shots.map(shotCard)));
    if (data.cast && data.cast.length) {
      app.appendChild(el("h2", { text: "Cast & assets" }));
      app.appendChild(el("div", { class: "grid cast" }, data.cast.map(function (member) {
        return el("div", { class: "card" }, [
          mediaBox("image", member.image, member.name, "No art yet"),
          el("div", { class: "body" }, [el("div", { class: "title", text: member.name }), el("div", { class: "sub", text: member.kind || "" })]),
        ]);
      })));
    }
  }

  function renderSingle() {
    var url = data.url, kind = data.kind;
    var media = kind === "video" ? el("video", { src: url, controls: "", preload: "metadata", playsinline: "" })
      : kind === "audio" ? el("audio", { src: url, controls: "", preload: "metadata" })
      : el("img", { src: url, alt: "" });
    media.addEventListener("error", expired);
    app.appendChild(el("div", { class: "single" }, [media]));
    app.appendChild(el("div", { class: "bar", style: "margin-top:8px" }, [
      el("span", { class: "sub", text: (data.path || "").split("/").pop() }),
      el("button", { type: "button", text: "Open", onclick: function () { openLink(url); } }),
    ]));
  }

  // Tell the host how tall the gallery is, so it is not clipped or padded.
  var lastHeight = 0;
  new ResizeObserver(function () {
    var height = Math.ceil(document.documentElement.scrollHeight);
    if (height !== lastHeight) { lastHeight = height; notify("ui/notifications/size-changed", { height: height }); }
  }).observe(document.body);

  request("ui/initialize", { appInfo: { name: "creator-studio-storyboard", version: "1.0.0" }, appCapabilities: {}, protocolVersion: "2026-01-26" })
    .then(function (result) { applyContext(result && result.hostContext); notify("ui/notifications/initialized"); })
    .catch(function () { notify("ui/notifications/initialized"); });
})();
</script>
</body>
</html>`
