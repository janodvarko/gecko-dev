"use strict";

const { DOM: dom } = require("devtools/client/shared/vendor/react");

function RequestListEmptyNotice(props) {
  return dom.div(
    {
      id: "requests-menu-empty-notice",
      className: "side-menu-widget-empty-text",
    },
    dom.div({ id: "notice-reload-message" },
      dom.span({}, "netmonitorUI.reloadNotice1"),
      dom.button(
        {
          id: "requests-menu-reload-notice-button",
          className: "devtools-toolbarbutton",
          onClick: props.onReloadClick,
        },
        "netmonitorUI.reloadNotice2"
      ),
      dom.span({}, "netmonitorUI.reloadNotice3")
    ),
    dom.div({ id: "notice-perf-message" },
      dom.span({}, "netmonitorUI.perfNotice1"),
      dom.button({
        id: "requests-menu-perf-notice-button",
        title: "netmonitorUI.perfNotice3",
        className: "devtools-toolbarbutton",
        onClick: props.onPerfClick,
      }),
      dom.span({}, "netmonitorUI.perfNotice2")
    )
  );
}

module.exports = RequestListEmptyNotice;
