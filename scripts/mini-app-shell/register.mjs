// Inline-Snippet für die SW-Registrierung. Lädt bei einem Update einmal neu — nur direkt nach dem Start
// (Update-Loader im Splash, reloadWindowMs), nie mitten in einer Sitzung und nicht bei der Erstinstallation.
// exposeRegistration: setzt window.__swRegistration und feuert 'sw-update-available' (Settings-/Banner-UI der Fitness-Apps).
const START = "<!-- vos-sw-register:start -->";
const END = "<!-- vos-sw-register:end -->";

export function registerSnippet({ swUrl = "./sw.js", exposeRegistration = false, reloadWindowMs = 0 } = {}) {
  const expose = exposeRegistration
    ? `.then(function (reg) {
            window.__swRegistration = reg
            var notify = function () { window.dispatchEvent(new CustomEvent('sw-update-available')) }
            if (reg.waiting) notify()
            reg.addEventListener('updatefound', function () {
              var nw = reg.installing
              if (!nw) return
              nw.addEventListener('statechange', function () { if (nw.state === 'installed' && navigator.serviceWorker.controller) notify() })
            })
          })`
    : "";
  return `${START}
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          var hadController = !!navigator.serviceWorker.controller
          var t0 = Date.now()
          navigator.serviceWorker.register(${JSON.stringify(swUrl)})${expose}.catch(function () {})
          var reloading = false
          navigator.serviceWorker.addEventListener('controllerchange', function () {
            if (!hadController || reloading || Date.now() - t0 > ${Number(reloadWindowMs)}) return
            reloading = true
            window.location.reload()
          })
        })
      }
    </script>
    ${END}`;
}

export function injectRegister(html, opts) {
  const block = new RegExp(`${START}[\\s\\S]*?${END}`);
  const snippet = registerSnippet(opts);
  if (block.test(html)) return html.replace(block, () => snippet.trim());
  return html.replace(/<\/body>/i, () => `    ${snippet}\n  </body>`);
}
