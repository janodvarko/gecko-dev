"use strict";

const { DOM: dom } = require("devtools/client/shared/vendor/react");
const { L10N } = require("../l10n");

function RequestListEmptyNotice(props) {
  return dom.div(
    {
      id: "requests-menu-empty-notice",
      className: "side-menu-widget-empty-text",
    },
    dom.div({ id: "notice-reload-message" },
      dom.span(null, L10N.getStr("netmonitor.reloadNotice1")),
      dom.button(
        {
          id: "requests-menu-reload-notice-button",
          className: "devtools-toolbarbutton",
          onClick: props.onReloadClick,
        },
        L10N.getStr("netmonitor.reloadNotice2")
      ),
      dom.span(null, L10N.getStr("netmonitor.reloadNotice3"))
    ),
    dom.div({ id: "notice-perf-message" },
      dom.span(null, L10N.getStr("netmonitor.perfNotice1")),
      dom.button({
        id: "requests-menu-perf-notice-button",
        title: L10N.getStr("netmonitor.perfNotice3"),
        className: "devtools-toolbarbutton",
        onClick: props.onPerfClick,
      }),
      dom.span(null, L10N.getStr("netmonitor.perfNotice2"))
    )
  );
}

module.exports = RequestListEmptyNotice;
