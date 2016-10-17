/* globals $, gNetwork, NetMonitorController */
"use strict";

const {Task} = require("devtools/shared/task");
const { DOM: dom, createClass, createFactory } = require("devtools/client/shared/vendor/react");
const RequestListHeader = createFactory(require("./request-list-header"));
const RequestListItem = createFactory(require("./request-list-item"));
const RequestListEmptyNotice = createFactory(require("./request-list-empty"));
const {formDataURI} = require("../request-utils");
const {WEBCONSOLE_L10N} = require("../l10n");
const {HTMLTooltip} = require("devtools/client/shared/widgets/tooltip/HTMLTooltip");
const {setImageTooltip, getImageDimensions} = require("devtools/client/shared/widgets/tooltip/ImageTooltipHelper");
const {getDisplayedRequests, getRequestById, getWaterfallScale} = require("../selectors/index");

// tooltip show/hide delay in ms
const REQUESTS_TOOLTIP_TOGGLE_DELAY = 500;
// px
const REQUESTS_TOOLTIP_IMAGE_MAX_DIM = 400;
// px
const REQUESTS_TOOLTIP_STACK_TRACE_WIDTH = 600;

const HTML_NS = "http://www.w3.org/1999/xhtml";

const setTooltipImageContent = Task.async(function* (tooltip, itemEl, requestItem) {
  let { mimeType, text, encoding } = requestItem.data.responseContent.content;

  if (!mimeType || !mimeType.includes("image/")) {
    return false;
  }

  let string = yield gNetwork.getString(text);
  let src = formDataURI(mimeType, encoding, string);
  let maxDim = REQUESTS_TOOLTIP_IMAGE_MAX_DIM;
  let { naturalWidth, naturalHeight } = yield getImageDimensions(tooltip.doc, src);
  let options = { maxDim, naturalWidth, naturalHeight };
  setImageTooltip(tooltip, tooltip.doc, src, options);

  return $(".requests-menu-icon", itemEl);
});

const setTooltipStackTraceContent = Task.async(function* (tooltip, requestItem) {
  let {stacktrace} = requestItem.data.cause;

  if (!stacktrace || stacktrace.length == 0) {
    return false;
  }

  let doc = tooltip.doc;
  let el = doc.createElementNS(HTML_NS, "div");
  el.className = "stack-trace-tooltip devtools-monospace";

  for (let f of stacktrace) {
    let { functionName, filename, lineNumber, columnNumber, asyncCause } = f;

    if (asyncCause) {
      // if there is asyncCause, append a "divider" row into the trace
      let asyncFrameEl = doc.createElementNS(HTML_NS, "div");
      asyncFrameEl.className = "stack-frame stack-frame-async";
      asyncFrameEl.textContent =
        WEBCONSOLE_L10N.getFormatStr("stacktrace.asyncStack", asyncCause);
      el.appendChild(asyncFrameEl);
    }

    // Parse a source name in format "url -> url"
    let sourceUrl = filename.split(" -> ").pop();

    let frameEl = doc.createElementNS(HTML_NS, "div");
    frameEl.className = "stack-frame stack-frame-call";

    let funcEl = doc.createElementNS(HTML_NS, "span");
    funcEl.className = "stack-frame-function-name";
    funcEl.textContent =
      functionName || WEBCONSOLE_L10N.getStr("stacktrace.anonymousFunction");
    frameEl.appendChild(funcEl);

    let sourceEl = doc.createElementNS(HTML_NS, "span");
    sourceEl.className = "stack-frame-source-name";
    frameEl.appendChild(sourceEl);

    let sourceInnerEl = doc.createElementNS(HTML_NS, "span");
    sourceInnerEl.className = "stack-frame-source-name-inner";
    sourceEl.appendChild(sourceInnerEl);

    sourceInnerEl.textContent = sourceUrl;
    sourceInnerEl.title = sourceUrl;

    let lineEl = doc.createElementNS(HTML_NS, "span");
    lineEl.className = "stack-frame-line";
    lineEl.textContent = `:${lineNumber}:${columnNumber}`;
    sourceInnerEl.appendChild(lineEl);

    frameEl.addEventListener("click", () => {
      // hide the tooltip immediately, not after delay
      tooltip.hide();
      NetMonitorController.viewSourceInDebugger(filename, lineNumber);
    }, false);

    el.appendChild(frameEl);
  }

  tooltip.setContent(el, {width: REQUESTS_TOOLTIP_STACK_TRACE_WIDTH});

  return true;
});

function isScrolledToBottom(list) {
  let child = list.lastElementChild;
  if (!child) {
    return false;
  }

  let childRect = child.getBoundingClientRect();
  let listRect = list.getBoundingClientRect();

  return (childRect.height + childRect.top) <= listRect.bottom;
}

const RequestListContent = createFactory(createClass({
  componentDidMount() {
    // Create a tooltip for the newly appended network request item.
    this.tooltip = new HTMLTooltip(NetMonitorController._toolbox.doc, { type: "arrow" });
    this.tooltip.startTogglingOnHover(this.refs.contentsEl, this._onHover, {
      toggleDelay: REQUESTS_TOOLTIP_TOGGLE_DELAY,
      interactive: true
    });
    this.refs.contentsEl.addEventListener("scroll", this._onScroll, true);
  },

  componentWillUpdate() {
    this.shouldScrollBottom = isScrolledToBottom(this.refs.contentsEl);
  },

  componentDidUpdate() {
    if (this.shouldScrollBottom) {
      let node = this.refs.contentsEl;
      node.scrollTop = node.scrollHeight;
    }
  },

  componentWillUnmount() {
    /* Destroy the tooltip */
    this.refs.contentsEl.removeEventListener("scroll", this._onScroll, true);
    this.tooltip.stopTogglingOnHover();
    this.tooltip.destroy();
  },

  /**
   * The predicate used when deciding whether a popup should be shown
   * over a request item or not.
   *
   * @param nsIDOMNode target
   *        The element node currently being hovered.
   * @param object tooltip
   *        The current tooltip instance.
   * @return {Promise}
   */
  _onHover: Task.async(function* (target, tooltip) {
    let itemEl = target.closest(".side-menu-widget-item");
    if (!itemEl) {
      return false;
    }
    let itemId = itemEl.dataset.id;
    if (!itemId) {
      return false;
    }
    let requestItem = getRequestById(this.props.state, itemId);
    if (!requestItem) {
      return false;
    }

    let hovered = requestItem.data;
    if (hovered.responseContent && target.closest(".requests-menu-icon-and-file")) {
      return setTooltipImageContent(tooltip, itemEl, requestItem);
    } else if (hovered.cause && target.closest(".requests-menu-cause-stack")) {
      return setTooltipStackTraceContent(tooltip, requestItem);
    }

    return false;
  }),

  /**
   * Scroll listener for the requests menu view.
   */
  _onScroll: function () {
    this.tooltip.hide();
  },

  render() {
    const { state,
            onKeyDown,
            onItemMouseDown,
            onItemContextMenu,
            onSecurityIconClick } = this.props;
    const { selectedItem } = state;
    const displayedRequests = getDisplayedRequests(state);
    const scale = getWaterfallScale(state);

    return dom.div(
      {
        ref: "contentsEl",
        className: "requests-menu-contents",
        tabIndex: 0,
        onKeyDown,
      },
      displayedRequests.map((item, index) => RequestListItem({
        key: item.id,
        item,
        index,
        scale,
        isSelected: item.id == selectedItem,
        onMouseDown: e => onItemMouseDown(e, item.id),
        onContextMenu: e => onItemContextMenu(e, item.id),
        onSecurityIconClick: e => onSecurityIconClick(e, item),
      }))
    );
  },
}));

const RequestList = function (props) {
  let children = props.state.requests.isEmpty()
    ? [ RequestListEmptyNotice(props) ]
    : [ RequestListHeader(props), RequestListContent(props) ];

  return dom.div({ className: "requests-menu-container" }, children);
};

module.exports = RequestList;
