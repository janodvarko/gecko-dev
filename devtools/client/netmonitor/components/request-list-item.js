/* globals window */

"use strict";

const NetworkHelper = require("devtools/shared/webconsole/network-helper");
const { DOM: dom } = require("devtools/client/shared/vendor/react");
const { L10N } = require("../l10n");
const { getAbbreviatedMimeType,
        getUriNameWithQuery,
        getUriHost,
        getUriHostPort } = require("../request-utils");

// Constants for formatting bytes.
const BYTES_IN_KB = 1024;
const BYTES_IN_MB = Math.pow(BYTES_IN_KB, 2);
const BYTES_IN_GB = Math.pow(BYTES_IN_KB, 3);
const MAX_BYTES_SIZE = 1000;
const MAX_KB_SIZE = 1000 * BYTES_IN_KB;
const MAX_MB_SIZE = 1000 * BYTES_IN_MB;

const CONTENT_SIZE_DECIMALS = 2;

/**
 * Get a human-readable string from a number of bytes, with the B, KB, MB, or
 * GB value. Note that the transition between abbreviations is by 1000 rather
 * than 1024 in order to keep the displayed digits smaller as "1016 KB" is
 * more awkward than 0.99 MB"
 */
function getFormattedSize(bytes) {
  if (bytes < MAX_BYTES_SIZE) {
    return L10N.getFormatStr("networkMenu.sizeB", bytes);
  } else if (bytes < MAX_KB_SIZE) {
    let kb = bytes / BYTES_IN_KB;
    let size = L10N.numberWithDecimals(kb, CONTENT_SIZE_DECIMALS);
    return L10N.getFormatStr("networkMenu.sizeKB", size);
  } else if (bytes < MAX_MB_SIZE) {
    let mb = bytes / BYTES_IN_MB;
    let size = L10N.numberWithDecimals(mb, CONTENT_SIZE_DECIMALS);
    return L10N.getFormatStr("networkMenu.sizeMB", size);
  }
  let gb = bytes / BYTES_IN_GB;
  let size = L10N.numberWithDecimals(gb, CONTENT_SIZE_DECIMALS);
  return L10N.getFormatStr("networkMenu.sizeGB", size);
}

function StatusColumn(item) {
  const { status, statusText, fromCache, fromServiceWorker } = item.data;

  let code, title;

  if (status) {
    if (fromCache) {
      code = "cached";
    } else if (fromServiceWorker) {
      code = "service worker";
    } else {
      code = status;
    }

    if (statusText) {
      title = `${status} ${statusText}`;
      if (fromCache) {
        title += " (cached)";
      }
      if (fromServiceWorker) {
        title += " (service worker)";
      }
    }
  }

  return dom.div({ className: "requests-menu-subitem requests-menu-status", title },
    dom.div({ className: "requests-menu-status-icon", "data-code": code }),
    dom.span({ className: "requests-menu-status-code" }, status)
  );
}

function MethodColumn(item) {
  return dom.div({ className: "requests-menu-subitem requests-menu-method-box" },
    dom.span({ className: "requests-menu-method" }, item.data.method)
  );
}

function FileColumn(item, urlInfo) {
  const { responseContentDataUri } = item.data;
  const { unicodeUrl, nameWithQuery } = urlInfo;

  return dom.div({ className: "requests-menu-subitem requests-menu-icon-and-file" },
    dom.img({
      className: "requests-menu-icon",
      src: responseContentDataUri,
      hidden: !responseContentDataUri,
      "data-type": responseContentDataUri ? "thumbnail" : undefined
    }),
    dom.div({ className: "requests-menu-file", title: unicodeUrl }, nameWithQuery)
  );
}

function DomainColumn(item, urlInfo, onSecurityIconClick) {
  const { remoteAddress, securityState } = item.data;
  const { hostPort, isLocal } = urlInfo;

  let iconClassList = [ "requests-security-state-icon", `jarda-${item.id.slice(-10)}` ];
  let iconTitle;
  if (isLocal) {
    iconClassList.push("security-state-local");
    iconTitle = L10N.getStr("netmonitor.security.state.secure");
  } else if (securityState) {
    iconClassList.push(`security-state-${securityState}`);
    iconTitle = L10N.getStr(`netmonitor.security.state.${securityState}`);
  }

  let title = hostPort + (remoteAddress ? ` (${remoteAddress})` : "");

  return dom.div(
    { className: "requests-menu-subitem requests-menu-security-and-domain" },
    dom.div({
      className: iconClassList.join(" "),
      title: iconTitle,
      onClick: onSecurityIconClick,
    }),
    dom.span({ className: "requests-menu-domain", title }, hostPort)
  );
}

function CauseColumn(item) {
  const { cause } = item.data;

  let causeType = "";
  let causeUri = undefined;
  let causeHasStack = false;

  if (cause) {
    causeType = cause.type;
    causeUri = cause.loadingDocumentUri;
    causeHasStack = cause.stacktrace && cause.stacktrace.length > 0;
  }

  return dom.div({ className: "requests-menu-subitem requests-menu-cause" },
    dom.span({ className: "requests-menu-cause-stack", hidden: !causeHasStack }, "JS"),
    dom.span({ className: "requests-menu-cause-label", title: causeUri }, causeType)
  );
}

const CONTENT_MIME_TYPE_ABBREVIATIONS = {
  "ecmascript": "js",
  "javascript": "js",
  "x-javascript": "js"
};

function TypeColumn(item) {
  let { mimeType } = item.data;
  let abbrevType;
  if (mimeType) {
    abbrevType = getAbbreviatedMimeType(mimeType);
    abbrevType = CONTENT_MIME_TYPE_ABBREVIATIONS[abbrevType] || abbrevType;
  }

  return dom.div(
    { className: "requests-menu-subitem requests-menu-type", title: mimeType },
    abbrevType
  );
}

function TransferredSizeColumn(item) {
  const { transferredSize, fromCache, fromServiceWorker } = item.data;

  let text;
  let className = "requests-menu-subitem requests-menu-transferred";
  if (fromCache) {
    text = L10N.getStr("networkMenu.sizeCached");
    className += " theme-comment";
  } else if (fromServiceWorker) {
    text = L10N.getStr("networkMenu.sizeServiceWorker");
    className += " theme-comment";
  } else if (typeof transferredSize == "number") {
    text = getFormattedSize(transferredSize);
  } else if (transferredSize === null) {
    text = L10N.getStr("networkMenu.sizeUnavailable");
  }

  return dom.div({ className, title: text }, text);
}

function ContentSizeColumn(item) {
  const { contentSize } = item.data;

  let text;
  if (typeof contentSize == "number") {
    text = getFormattedSize(contentSize);
  }

  return dom.div(
    { className: "requests-menu-subitem requests-menu-size", title: text },
    text
  );
}

function timingBoxes(item, scale) {
  const { eventTimings, totalTime, fromCache, fromServiceWorker } = item.data;
  let boxes = [];

  if (fromCache || fromServiceWorker) {
    return boxes;
  }

  if (eventTimings) {
    // Add a set of boxes representing timing information.
    for (let key of ["blocked", "dns", "connect", "send", "wait", "receive"]) {
      let width = eventTimings.timings[key];

      // Don't render anything if it surely won't be visible.
      // One millisecond == one unscaled pixel.
      if (width > 0) {
        boxes.push(dom.div({
          className: "requests-menu-timings-box " + key,
          style: { width }
        }));
      }
    }
  }

  if (typeof totalTime == "number") {
    // Certain nodes should not be scaled, even if they're children of
    // another scaled node. In this case, apply a reversed transformation.
    let revScaleX = "scaleX(" + (1 / scale) + ")";

    let text = L10N.getFormatStr("networkMenu.totalMS", totalTime);
    boxes.push(dom.div({
      className: "requests-menu-timings-total",
      style: { transform: revScaleX },
      title: text
    }, text));
  }

  return boxes;
}

function WaterfallColumn(item, scale) {
  let direction = window.isRTL ? -1 : 1;
  let { startedDeltaMillis } = item.data;

  // Render the timing information at a specific horizontal translation
  // based on the delta to the first monitored event network.
  let translateX = "translateX(" + (direction * startedDeltaMillis) + "px)";

  // Based on the total time passed until the last request, rescale
  // all the waterfalls to a reasonable size.
  let scaleX = "scaleX(" + scale + ")";

  return dom.div({ className: "requests-menu-subitem requests-menu-waterfall" },
    dom.div({
      className: "requests-menu-timings",
      style: { transform: scaleX + translateX }
    }, timingBoxes(item, scale))
  );
}

function extractUrlInfo(url) {
  let uri;
  try {
    uri = NetworkHelper.nsIURL(url);
  } catch (e) {
    // User input may not make a well-formed url yet.
    return {};
  }

  let nameWithQuery = getUriNameWithQuery(uri);
  let hostPort = getUriHostPort(uri);
  let host = getUriHost(uri);
  let unicodeUrl = NetworkHelper.convertToUnicode(unescape(uri.spec));

  // Mark local hosts specially, where "local" is  as defined in the W3C
  // spec for secure contexts.
  // http://www.w3.org/TR/powerful-features/
  //
  //  * If the name falls under 'localhost'
  //  * If the name is an IPv4 address within 127.0.0.0/8
  //  * If the name is an IPv6 address within ::1/128
  //
  // IPv6 parsing is a little sloppy; it assumes that the address has
  // been validated before it gets here.
  let isLocal = host.match(/(.+\.)?localhost$/) ||
                host.match(/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}/) ||
                host.match(/\[[0:]+1\]/);

  return {
    nameWithQuery,
    hostPort,
    unicodeUrl,
    isLocal
  };
}

function FocusButton(isSelected) {
  function ref(button) {
    if (button) {
      // TODO: focus must be smarter than this - it steals focus from the custom form
      // isSelected ? button.focus() : button.blur();
    }
  }

  return dom.button({
    ref,
    style: {
      opacity: 0,
      width: "0 !important",
      height: "0 !important",
      padding: "0 !important",
      outline: "none",
      MozAppearance: "none",
    }
  });
}

function RequestListItem(props) {
  const { item, scale, index, isSelected, onContextMenu, onMouseDown,
          onSecurityIconClick } = props;
  const urlInfo = extractUrlInfo(item.data.url);

  let classList = [ "side-menu-widget-item", "side-menu-widget-item-contents" ];
  if (isSelected) {
    classList.push("selected");
  }
  classList.push(index % 2 ? "odd" : "even");

  return dom.div(
    {
      className: classList.join(" "),
      "data-id": item.id,
      tabIndex: 0,
      onContextMenu,
      onMouseDown,
    },
    StatusColumn(item),
    MethodColumn(item),
    FileColumn(item, urlInfo),
    DomainColumn(item, urlInfo, onSecurityIconClick),
    CauseColumn(item),
    TypeColumn(item),
    TransferredSizeColumn(item),
    ContentSizeColumn(item),
    WaterfallColumn(item, scale),
    FocusButton(isSelected)
  );
}

module.exports = RequestListItem;
