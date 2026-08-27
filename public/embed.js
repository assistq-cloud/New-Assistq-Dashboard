/*
 * ASSISTQ chat bubble — one-line install for clients who already have
 * their own website.
 *
 * Usage (paste once, right before </body> on the client's site):
 *
 *   <script src="https://app.assistq.in/embed.js"
 *           data-client="abc-realty"></script>
 *
 * Optional attributes on the same tag:
 *   data-dashboard="https://app.assistq.in"   (defaults to where this script is hosted)
 *   data-accent="#c9573f"                     (matches the widget's accent color to the client's brand)
 *   data-ink="#150f04"
 *
 * This is the ONLY thing a "has a website" client needs to add. It does
 * not touch anything else on their page — it just drops a small floating
 * button in the corner that expands into the AssistQ chat panel.
 */
(function () {
  var thisScript = document.currentScript;
  if (!thisScript) return;

  var clientId = thisScript.getAttribute("data-client") || "";
  if (!clientId) {
    console.warn("ASSISTQ embed.js: add data-client=\"your-client-id\" to the <script> tag.");
    return;
  }

  // Default dashboard URL = wherever this embed.js file itself is hosted,
  // so a client never has to type the URL twice.
  var scriptOrigin = new URL(thisScript.src).origin;
  var dashboardUrl = thisScript.getAttribute("data-dashboard") || scriptOrigin;
  var accent = thisScript.getAttribute("data-accent") || "";
  var ink = thisScript.getAttribute("data-ink") || "";

  // Forward the HOST page's UTM params (if any) into the widget, since the
  // widget lives in its own iframe and can't read the parent URL directly.
  var hostParams;
  try { hostParams = new URLSearchParams(window.top.location.search); }
  catch (e) { hostParams = new URLSearchParams(window.location.search); }

  var widgetParams = new URLSearchParams();
  widgetParams.set("clientId", clientId);
  widgetParams.set("dashboardUrl", dashboardUrl);
  if (accent) widgetParams.set("accent", accent);
  if (ink) widgetParams.set("ink", ink);
  ["utm_source", "utm_medium", "utm_campaign"].forEach(function (k) {
    var v = hostParams.get(k);
    if (v) widgetParams.set(k, v);
  });

  var CLOSED_SIZE = { width: "90px", height: "90px" };
  var OPEN_SIZE_DESKTOP = { width: "380px", height: "660px" };

  var iframe = document.createElement("iframe");
  iframe.src = dashboardUrl.replace(/\/$/, "") + "/widget.html?" + widgetParams.toString();
  iframe.title = "Chat with us";
  iframe.setAttribute("scrolling", "no");
  iframe.style.position = "fixed";
  iframe.style.bottom = "0";
  iframe.style.right = "0";
  iframe.style.border = "none";
  iframe.style.background = "transparent";
  iframe.style.zIndex = "2147483000"; // stay above virtually anything on the host page
  iframe.style.colorScheme = "light";
  iframe.style.width = CLOSED_SIZE.width;
  iframe.style.height = CLOSED_SIZE.height;

  function applyOpenSize() {
    var isNarrow = window.innerWidth <= 480;
    if (isNarrow) {
      iframe.style.width = "100vw";
      iframe.style.height = "100vh";
    } else {
      iframe.style.width = OPEN_SIZE_DESKTOP.width;
      iframe.style.height = OPEN_SIZE_DESKTOP.height;
    }
  }

  window.addEventListener("message", function (event) {
    if (!event.data || event.data.assistqWidget !== true) return;
    if (event.data.open) applyOpenSize();
    else { iframe.style.width = CLOSED_SIZE.width; iframe.style.height = CLOSED_SIZE.height; }
  });

  function mount() {
    document.body.appendChild(iframe);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
