// Owner UI fix item 5: keep the previous page's frame on screen until this page draws
// its own. A classic, self-contained script so it runs before the game bundle loads
// (Vite merges module entries into one). It consumes the snapshot saved by
// @orchard/engine/gateway-handoff and paints it onto #game unless the loading screen
// has already started. Any failure silently leaves today's backdrop.
// Contract between builds: the key and attribute names match the GATEWAY_* exports of
// @orchard/engine/gateway-handoff (checked by gateway-handoff-boot.test.ts).
/* global window, document, Image */
(function paintGatewayHandoff() {
  'use strict';
  var KEY = 'orchard.gateway-handoff';
  var MAX_AGE_MS = 15000;
  var DATA_PATTERN = /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/=]+$/;
  var FRAME_STARTED = 'data-gateway-frame';
  var PAINTED_ATTRIBUTE = 'data-gateway-handoff';
  var raw;
  try {
    raw = window.sessionStorage.getItem(KEY);
    if (raw !== null) window.sessionStorage.removeItem(KEY);
  } catch { return; }
  if (raw === null) return;
  var handoff;
  try { handoff = JSON.parse(raw); } catch { return; }
  if (!handoff || typeof handoff.data !== 'string' || !DATA_PATTERN.test(handoff.data) || typeof handoff.savedAt !== 'number') return;
  var age = Date.now() - handoff.savedAt;
  if (!(age >= 0 && age <= MAX_AGE_MS)) return;
  var canvas = document.getElementById('game');
  if (!canvas || !canvas.getContext) return;
  var started = function () { return document.documentElement.hasAttribute(FRAME_STARTED); };
  var image = new Image();
  image.onload = function () {
    try {
      if (started()) return;
      var host = canvas.parentElement;
      var cssWidth = host ? host.clientWidth : window.innerWidth;
      var cssHeight = host ? host.clientHeight : window.innerHeight;
      var dpr = Math.max(1, window.devicePixelRatio || 1);
      var width = Math.round(cssWidth * dpr), height = Math.round(cssHeight * dpr);
      var sourceWidth = image.naturalWidth, sourceHeight = image.naturalHeight;
      if (width <= 0 || height <= 0 || sourceWidth <= 0 || sourceHeight <= 0) return;
      // Cover-fit, and never put a portrait snapshot on a landscape screen or back.
      if ((sourceWidth >= sourceHeight) !== (width >= height)) return;
      var scale = Math.max(width / sourceWidth, height / sourceHeight);
      var drawWidth = sourceWidth * scale, drawHeight = sourceHeight * scale;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      canvas.style.width = cssWidth + 'px';
      canvas.style.height = cssHeight + 'px';
      var context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.imageSmoothingEnabled = true;
      context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
      canvas.setAttribute(PAINTED_ATTRIBUTE, 'painted');
    } catch { /* keep the backdrop */ }
  };
  image.src = handoff.data;
})();
