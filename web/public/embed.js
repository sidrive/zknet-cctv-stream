/*!
 * ZKNet CCTV — loader mini-app.
 * Pakai di aplikasi lain:
 *   <script src="https://cctv.example.com/embed.js"
 *           data-cluster="lobby"        (atau data-camera="ID")
 *           data-grant="..."            (opsional: grant dari backend host)
 *           data-height="480"></script>
 * atau manual: ZKNetCCTV.mount(element, { origin, cluster, camera, grant, height })
 */
;(function () {
  var script = document.currentScript
  var defaultOrigin = script && script.src ? new URL(script.src).origin : location.origin

  function mount(el, opts) {
    opts = opts || {}
    var origin = opts.origin || defaultOrigin
    var q = new URLSearchParams()
    if (opts.cluster) q.set('cluster', opts.cluster)
    if (opts.camera) q.set('camera', opts.camera)
    if (opts.grant) q.set('grant', opts.grant)
    if (opts.theme) q.set('theme', opts.theme)
    var f = document.createElement('iframe')
    f.src = origin + '/embed?' + q.toString()
    f.title = 'CCTV'
    f.allow = 'fullscreen; autoplay'
    f.allowFullscreen = true
    f.loading = 'lazy'
    f.style.cssText = 'border:0;width:100%;display:block;border-radius:' + (opts.radius || '12px') + ';height:' + (opts.height || 480) + 'px'
    window.addEventListener('message', function (e) {
      if (e.origin !== origin || e.source !== f.contentWindow) return
      var d = e.data || {}
      if (d.type === 'zknet-cctv:resize' && opts.autoHeight !== false && d.height) f.style.height = d.height + 'px'
      if (typeof opts.onEvent === 'function' && d.type && String(d.type).indexOf('zknet-cctv:') === 0) opts.onEvent(d)
    })
    el.appendChild(f)
    return f
  }

  window.ZKNetCCTV = { mount: mount }

  if (script && (script.dataset.cluster || script.dataset.camera)) {
    var holder = script.dataset.target ? document.querySelector(script.dataset.target) : null
    if (!holder) {
      holder = document.createElement('div')
      script.parentNode.insertBefore(holder, script)
    }
    mount(holder, {
      cluster: script.dataset.cluster,
      camera: script.dataset.camera,
      grant: script.dataset.grant,
      theme: script.dataset.theme,
      height: script.dataset.height,
      autoHeight: script.dataset.autoHeight !== 'false',
    })
  }
})()
