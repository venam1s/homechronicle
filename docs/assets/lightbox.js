/*
 * lightbox.js — click any screenshot to see it full-size; click again to zoom.
 *
 * Shared by index.html and screenshots.html. Applies to every <img> whose src
 * points into screenshots/ (event delegation, so images swapped in later — the
 * palette picker — work too). Screenshots are captured at 2x, so "fit" shows
 * the whole image and "zoom" shows it at its native CSS size, which is
 * readable even when the page renders it as a small card.
 *
 * Keyboard: screenshots are focusable; Enter/Space opens, Esc closes, focus
 * returns to the image that opened it.
 */
(function () {
  var SELECTOR = 'img[src*="screenshots/"]';

  var css = [
    SELECTOR + '{cursor:zoom-in}',
    '.hc-lb{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.88);display:none;overflow:auto;-webkit-overflow-scrolling:touch}',
    '.hc-lb.open{display:block}',
    '.hc-lb-stage{min-height:100%;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:56px 16px 24px}',
    '.hc-lb.zoomed .hc-lb-stage{display:block;padding:56px 24px 24px}',
    '.hc-lb img{display:block;max-width:min(94vw,100%);max-height:calc(100vh - 120px);border-radius:10px;box-shadow:0 25px 80px rgba(0,0,0,.5);cursor:zoom-in;background:#fff}',
    '.hc-lb.zoomed img{max-width:none;max-height:none;margin:0 auto;cursor:zoom-out}',
    '.hc-lb-caption{color:#e5e7eb;font:14px/1.4 system-ui,-apple-system,sans-serif;text-align:center;margin-top:14px;max-width:800px}',
    '.hc-lb-caption small{display:block;color:#9ca3af;margin-top:4px}',
    '.hc-lb.zoomed .hc-lb-caption{display:none}',
    '.hc-lb-close{position:fixed;top:14px;right:16px;width:40px;height:40px;border-radius:50%;border:0;background:rgba(255,255,255,.18);color:#fff;font-size:24px;line-height:40px;cursor:pointer;z-index:1}',
    '.hc-lb-close:hover,.hc-lb-close:focus-visible{background:rgba(255,255,255,.32);outline:2px solid #fff;outline-offset:2px}',
  ].join('\n');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var overlay = document.createElement('div');
  overlay.className = 'hc-lb';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Screenshot');
  overlay.innerHTML =
    '<button type="button" class="hc-lb-close" aria-label="Close">&times;</button>' +
    '<div class="hc-lb-stage"><img alt=""><div class="hc-lb-caption"></div></div>';
  document.body.appendChild(overlay);

  var img = overlay.querySelector('img');
  var caption = overlay.querySelector('.hc-lb-caption');
  var closeBtn = overlay.querySelector('.hc-lb-close');
  var opener = null;

  function setZoom(on, clickX, clickY) {
    if (!on) {
      overlay.classList.remove('zoomed');
      img.style.width = '';
      return;
    }
    var shown = img.getBoundingClientRect();
    // Native CSS size of a 2x capture; never smaller than 1.75x what fits.
    var target = Math.max(img.naturalWidth / 2, shown.width * 1.75);
    target = Math.min(target, img.naturalWidth);
    var fx = shown.width ? (clickX - shown.left) / shown.width : 0.5;
    var fy = shown.height ? (clickY - shown.top) / shown.height : 0.5;
    overlay.classList.add('zoomed');
    img.style.width = target + 'px';
    // Keep the clicked point under the pointer.
    var after = img.getBoundingClientRect();
    overlay.scrollLeft += after.left + fx * after.width - clickX;
    overlay.scrollTop += after.top + fy * after.height - clickY;
  }

  function open(source) {
    opener = source;
    setZoom(false);
    img.src = source.currentSrc || source.src;
    img.alt = source.alt || '';
    caption.innerHTML = '';
    if (source.alt) caption.appendChild(document.createTextNode(source.alt));
    var hint = document.createElement('small');
    hint.textContent = 'Click the image to zoom · Esc to close';
    caption.appendChild(hint);
    overlay.classList.add('open');
    overlay.scrollTop = 0;
    overlay.scrollLeft = 0;
    document.documentElement.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function close() {
    if (!overlay.classList.contains('open')) return;
    overlay.classList.remove('open');
    setZoom(false);
    img.removeAttribute('src');
    document.documentElement.style.overflow = '';
    if (opener && typeof opener.focus === 'function') opener.focus();
    opener = null;
  }

  // Make screenshots reachable by keyboard and announce what they do.
  function prepare(el) {
    if (el.dataset.lbReady) return;
    el.dataset.lbReady = '1';
    if (el.closest('a, button')) return; // already interactive — leave alone
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'View full size' + (el.alt ? ': ' + el.alt : ''));
  }
  function prepareAll() {
    var all = document.querySelectorAll(SELECTOR);
    for (var i = 0; i < all.length; i++) prepare(all[i]);
  }
  prepareAll();
  if (window.MutationObserver) {
    new MutationObserver(prepareAll).observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener('click', function (e) {
    var target = e.target.closest ? e.target.closest(SELECTOR) : null;
    if (!target || overlay.contains(target) || target.closest('a, button')) return;
    e.preventDefault();
    open(target);
  });

  document.addEventListener('keydown', function (e) {
    if (overlay.classList.contains('open')) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') { e.preventDefault(); closeBtn.focus(); } // keep focus in the dialog
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches(SELECTOR) && !e.target.closest('a, button')) {
      e.preventDefault();
      open(e.target);
    }
  });

  img.addEventListener('click', function (e) {
    e.stopPropagation();
    setZoom(!overlay.classList.contains('zoomed'), e.clientX, e.clientY);
  });
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay || e.target.classList.contains('hc-lb-stage')) close();
  });
})();
