/* globals window, document */

"use strict";

const { getWaterfallScale } = require("./selectors/index");

const HTML_NS = "http://www.w3.org/1999/xhtml";
// ms
const REQUESTS_WATERFALL_BACKGROUND_TICKS_MULTIPLE = 5;
const REQUESTS_WATERFALL_BACKGROUND_TICKS_SCALES = 3;
// px
const REQUESTS_WATERFALL_BACKGROUND_TICKS_SPACING_MIN = 10;
const REQUESTS_WATERFALL_BACKGROUND_TICKS_COLOR_RGB = [128, 136, 144];
const REQUESTS_WATERFALL_BACKGROUND_TICKS_OPACITY_MIN = 32;
// byte
const REQUESTS_WATERFALL_BACKGROUND_TICKS_OPACITY_ADD = 32;
const REQUESTS_WATERFALL_DOMCONTENTLOADED_TICKS_COLOR_RGBA = [255, 0, 0, 128];
const REQUESTS_WATERFALL_LOAD_TICKS_COLOR_RGBA = [0, 0, 255, 128];

/**
 * Creates the background displayed on each waterfall view in this container.
 */
function drawWaterfallBackground(state, existingBackground) {
  const { waterfallWidth,
          firstRequestStartedMillis,
          firstDocumentDOMContentLoadedTimestamp,
          firstDocumentLoadTimestamp } = state;
  const scale = getWaterfallScale(state);

  let canvas, ctx;
  if (existingBackground) {
    canvas = existingBackground.canvas;
    ctx = existingBackground.ctx;
  } else {
    canvas = document.createElementNS(HTML_NS, "canvas");
    ctx = canvas.getContext("2d");
  }

  // Nuke the context.
  let canvasWidth = canvas.width = waterfallWidth;
  // Awww yeah, 1px, repeats on Y axis.
  let canvasHeight = canvas.height = 1;

  // Start over.
  let imageData = ctx.createImageData(canvasWidth, canvasHeight);
  let pixelArray = imageData.data;

  let buf = new ArrayBuffer(pixelArray.length);
  let view8bit = new Uint8ClampedArray(buf);
  let view32bit = new Uint32Array(buf);

  // Build new millisecond tick lines...
  let timingStep = REQUESTS_WATERFALL_BACKGROUND_TICKS_MULTIPLE;
  let [r, g, b] = REQUESTS_WATERFALL_BACKGROUND_TICKS_COLOR_RGB;
  let alphaComponent = REQUESTS_WATERFALL_BACKGROUND_TICKS_OPACITY_MIN;
  let optimalTickIntervalFound = false;

  while (!optimalTickIntervalFound) {
    // Ignore any divisions that would end up being too close to each other.
    let scaledStep = scale * timingStep;
    if (scaledStep < REQUESTS_WATERFALL_BACKGROUND_TICKS_SPACING_MIN) {
      timingStep <<= 1;
      continue;
    }
    optimalTickIntervalFound = true;

    // Insert one pixel for each division on each scale.
    for (let i = 1; i <= REQUESTS_WATERFALL_BACKGROUND_TICKS_SCALES; i++) {
      let increment = scaledStep * Math.pow(2, i);
      for (let x = 0; x < canvasWidth; x += increment) {
        let position = (window.isRTL ? canvasWidth - x : x) | 0;
        view32bit[position] = (alphaComponent << 24) | (b << 16) | (g << 8) | r;
      }
      alphaComponent += REQUESTS_WATERFALL_BACKGROUND_TICKS_OPACITY_ADD;
    }
  }

  {
    let t = firstDocumentDOMContentLoadedTimestamp;

    let delta = Math.floor((t - firstRequestStartedMillis) * scale);
    let [r1, g1, b1, a1] = REQUESTS_WATERFALL_DOMCONTENTLOADED_TICKS_COLOR_RGBA;
    view32bit[delta] = (a1 << 24) | (r1 << 16) | (g1 << 8) | b1;
  }
  {
    let t = firstDocumentLoadTimestamp;

    let delta = Math.floor((t - firstRequestStartedMillis) * scale);
    let [r2, g2, b2, a2] = REQUESTS_WATERFALL_LOAD_TICKS_COLOR_RGBA;
    view32bit[delta] = (a2 << 24) | (r2 << 16) | (g2 << 8) | b2;
  }

  // Flush the image data and cache the waterfall background.
  pixelArray.set(view8bit);
  ctx.putImageData(imageData, 0, 0);

  return { canvas, ctx };
}

exports.drawWaterfallBackground = drawWaterfallBackground;
