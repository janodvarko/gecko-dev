/* globals document */

"use strict";

const { DOM: dom, createClass } = require("devtools/client/shared/vendor/react");
const { L10N } = require("../l10n");
const { drawWaterfallBackground } = require("../waterfall-background");

// ms
const REQUESTS_WATERFALL_HEADER_TICKS_MULTIPLE = 5;
// px
const REQUESTS_WATERFALL_HEADER_TICKS_SPACING_MIN = 60;

const REQUEST_TIME_DECIMALS = 2;

const HEADERS = [
  { name: "status", label: "status3" },
  { name: "method" },
  { name: "file", boxName: "icon-and-file" },
  { name: "domain", boxName: "security-and-domain" },
  { name: "cause" },
  { name: "type" },
  { name: "transferred" },
  { name: "size" },
  { name: "waterfall" }
];

const RequestListHeader = createClass({
  componentDidMount() {
    this.background = drawWaterfallBackground(this.props);
    document.mozSetImageElement("waterfall-background", this.background.canvas);
  },

  componentDidUpdate() {
    drawWaterfallBackground(this.props, this.background);
  },

  componentWillUnmount() {
    document.mozSetImageElement("waterfall-background", null);
  },

  render() {
    const { sortBy, waterfallWidth, scale } = this.props;

    return dom.div(
      { id: "requests-menu-toolbar", className: "devtools-toolbar" },
      dom.div({ id: "toolbar-labels" },
        HEADERS.map(header => {
          const name = header.name;
          const boxName = header.boxName || name;
          const label = header.label || name;
          // netmonitorUI.toolbar.${label}

          let sorted, sortedTitle;
          const active = sortBy.type == name ? true : undefined;
          if (active) {
            sorted = sortBy.ascending ? "ascending" : "descending";
            sortedTitle = L10N.getStr(sortBy.ascending
              ? "networkMenu.sortedAsc"
              : "networkMenu.sortedDesc");
          }

          return dom.div(
            {
              id: `requests-menu-${boxName}-header-box`,
              className: `requests-menu-header requests-menu-${boxName}`,
              // Used to style the next column.
              "data-active": active,
            },
            dom.button(
              {
                id: `requests-menu-${name}-button`,
                className: `requests-menu-header-button requests-menu-${name}`,
                "data-sorted": sorted,
                title: sortedTitle,
                onClick: () => this.props.onHeaderClick(name),
              },
              name == "waterfall" ? WaterfallLabel(waterfallWidth, scale, label) : label,
              dom.div({ className: "button-icon" })
            )
          );
        })
      )
    );
  }
});

function waterfallDivisionLabels(waterfallWidth, scale) {
  let labels = [];

  // Build new millisecond tick labels...
  let timingStep = REQUESTS_WATERFALL_HEADER_TICKS_MULTIPLE;
  let scaledStep = scale * timingStep;

  // Ignore any divisions that would end up being too close to each other.
  while (scaledStep < REQUESTS_WATERFALL_HEADER_TICKS_SPACING_MIN) {
    scaledStep *= 2;
  }

  // Insert one label for each division on the current scale.
  // let direction = window.isRTL ? -1 : 1;

  for (let x = 0; x < waterfallWidth; x += scaledStep) {
    // let translateX = "translateX(" + ((direction * x) | 0) + "px)";
    let millisecondTime = x / scale;

    let normalizedTime = millisecondTime;
    let divisionScale = "millisecond";

    // If the division is greater than 1 minute.
    if (normalizedTime > 60000) {
      normalizedTime /= 60000;
      divisionScale = "minute";
    } else if (normalizedTime > 1000) {
      // If the division is greater than 1 second.
      normalizedTime /= 1000;
      divisionScale = "second";
    }

    // Showing too many decimals is bad UX.
    if (divisionScale == "millisecond") {
      normalizedTime |= 0;
    } else {
      normalizedTime = L10N.numberWithDecimals(normalizedTime, REQUEST_TIME_DECIMALS);
    }

    let width = (x + scaledStep | 0) - (x | 0);
    if (x == 0) {
      // Adjust the first marker for the borders
      width -= 2;
    }

    labels.push(dom.div(
      {
        className: "requests-menu-timings-division",
        "data-division-scale": divisionScale,
        style: { width }
      },
      L10N.getFormatStr("networkMenu." + divisionScale, normalizedTime)
    ));
  }

  return labels;
  // container.className = "requests-menu-waterfall-visible";
}

function WaterfallLabel(waterfallWidth, scale, label) {
  return dom.div(
    { className: "requests-menu-waterfall-label-wrapper" },
    scale == null ? `${label} @ ${scale}` : waterfallDivisionLabels(waterfallWidth, scale)
  );
}

// <div id="requests-menu-waterfall-header-box" class="requests-menu-header requests-menu-waterfall">
//   <button id="requests-menu-waterfall-button" class="requests-menu-header-button requests-menu-waterfall" data-key="waterfall">
//     <img id="requests-menu-waterfall-image"/>
//     <div id="requests-menu-waterfall-label-wrapper">
//       <span id="requests-menu-waterfall-label" class="plain requests-menu-waterfall">
//         &netmonitorUI.toolbar.waterfall;
//       </span>
//     </div>
//   </button>
// </div>

module.exports = RequestListHeader;
