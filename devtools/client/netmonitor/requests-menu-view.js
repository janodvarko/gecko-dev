/* globals document, window, dumpn, $, $all, gNetwork, EVENTS, Prefs,
           NetMonitorController, NetMonitorView */
"use strict";
/* eslint-disable mozilla/reject-some-requires */
const { Cc, Ci, Cu } = require("chrome");
const Services = require("Services");
const {Task} = require("devtools/shared/task");
const {DeferredTask} = Cu.import("resource://gre/modules/DeferredTask.jsm", {});
const {setNamedTimeout} = require("devtools/client/shared/widgets/view-helpers");
const {Curl, CurlUtils} = require("devtools/client/shared/curl");
const {gDevTools} = require("devtools/client/framework/devtools");
const {PluralForm} = require("devtools/shared/plural-form");
const {Filters} = require("./filter-predicates");
const {L10N} = require("./l10n");
const {KeyCodes} = require("devtools/client/shared/keycodes");
const {getFormDataSections,
       formDataURI,
       writeHeaderText,
       getKeyWithEvent,
       loadCauseString} = require("./request-utils");
const {EVENTS} = require("./events");
const { createElement } = require("devtools/client/shared/vendor/react");
const ReactDOM = require("devtools/client/shared/vendor/react-dom");
const { createStore, applyMiddleware } = require("devtools/client/shared/vendor/redux");
const { connect, Provider } = require("devtools/client/shared/vendor/react-redux");
const { thunk } = require("devtools/client/shared/redux/middleware/thunk");
const RequestList = require("./components/request-list");
const Actions = require("./actions/index");
const reducer = require("./reducers/index");
const {getSortedRequests,
       getDisplayedRequests,
       getDisplayedRequestsSummary,
       getRequestById,
       getRequestIndexById,
       getSelectedRequest} = require("./selectors/index");

loader.lazyServiceGetter(this, "clipboardHelper",
  "@mozilla.org/widget/clipboardhelper;1", "nsIClipboardHelper");

loader.lazyRequireGetter(this, "HarExporter",
  "devtools/client/netmonitor/har/har-exporter", true);

loader.lazyRequireGetter(this, "NetworkHelper",
  "devtools/shared/webconsole/network-helper");

const EPSILON = 0.001;
// ms
const RESIZE_REFRESH_RATE = 50;
// ms
const REQUESTS_REFRESH_RATE = 50;

const REQUEST_TIME_DECIMALS = 2;
const CONTENT_SIZE_DECIMALS = 2;

// ms
const FREETEXT_FILTER_SEARCH_DELAY = 200;

function mapStateToProps(state) {
  const { firstRequestStartedMillis, lastRequestEndedMillis, waterfallWidth } = state;
  let longestWidth = lastRequestEndedMillis - firstRequestStartedMillis;
  let scale = Math.min(Math.max(waterfallWidth / longestWidth, EPSILON), 1);

  return Object.assign({}, state, {
    isEmpty: state.requests.length == 0,
    scale,
    requests: getDisplayedRequests(state),
  });
}

function mapDispatchToProps(dispatch) {
  return {
    onHeaderClick: type => dispatch(Actions.sortBy(type)),
    onItemMouseDown: (e, item) => dispatch(Actions.selectItem(item)),
    onItemContextMenu: (e, item) => {
      let menu = document.getElementById("network-request-popup");
      menu.openPopupAtScreen(e.screenX, e.screenY, true);
    },
    onKeyDown: (e) => {
      let action;

      switch (e.keyCode) {
        case KeyCodes.DOM_VK_UP:
        case KeyCodes.DOM_VK_LEFT:
          action = Actions.selectDelta(-1);
          break;
        case KeyCodes.DOM_VK_DOWN:
        case KeyCodes.DOM_VK_RIGHT:
          action = Actions.selectDelta(+1);
          break;
        case KeyCodes.DOM_VK_PAGE_UP:
          action = Actions.selectDelta("PAGE_UP");
          break;
        case KeyCodes.DOM_VK_PAGE_DOWN:
          action = Actions.selectDelta("PAGE_DOWN");
          break;
        case KeyCodes.DOM_VK_HOME:
          action = Actions.selectDelta(-Infinity);
          break;
        case KeyCodes.DOM_VK_END:
          action = Actions.selectDelta(+Infinity);
          break;
      }

      if (action) {
        // Prevent scrolling when pressing navigation keys.
        e.preventDefault();
        e.stopPropagation();
        dispatch(action);
      }
    },
    /**
     * A handler that opens the security tab in the details view if secure or
     * broken security indicator is clicked.
     */
    onSecurityIconClick: (e, item) => {
      const { securityState } = item.data;
      if (securityState && securityState !== "insecure") {
        // Choose the security tab.
        NetMonitorView.NetworkDetails.widget.selectedIndex = 5;
      }
    },
    onPerfClick: e => NetMonitorView.toggleFrontendMode(),
    onReloadClick: e => NetMonitorView.reloadPage(),
  };
}

const ConnectedRequestList = connect(mapStateToProps, mapDispatchToProps)(RequestList);

function stringFetcher(store) {
  return next => action => {
    next(action);

    if (action.type == "UPDATE_REQUEST") {
      if (action.data.responseContent) {
        let request = getRequestById(store.getState(), action.id);
        if (request) {
          let { mimeType } = request.data;
          if (mimeType.includes("image/")) {
            let { text, encoding } = action.data.responseContent.content;
            gNetwork.getString(text).then(responseBody => {
              const dataUri = formDataURI(mimeType, encoding, responseBody);
              store.dispatch(Actions.updateRequest(action.id, {
                responseContentDataUri: dataUri
              }));
              window.emit(EVENTS.RESPONSE_IMAGE_THUMBNAIL_DISPLAYED);
            });
          }
        }
      }

      if (action.data.requestPostData) {
        // Search the POST data upload stream for request headers and add
        // them as a separate property, different from the classic headers.
        let { text } = action.data.requestPostData.postData;
        gNetwork.getString(text).then(postData => {
          const headers = CurlUtils.getHeadersFromMultipartText(postData);
          const headersSize = headers.reduce((acc, { name, value }) => {
            return acc + name.length + value.length + 2;
          }, 0);
          store.dispatch(Actions.updateRequest(action.id, {
            requestHeadersFromUploadStream: { headers, headersSize }
          }));
        });
      }
    }
  };
}

function storeWatcher(initialValue, reduceValue, onChange) {
  let currentValue = initialValue;

  return () => {
    const newValue = reduceValue(currentValue);
    if (newValue !== currentValue) {
      onChange(newValue, currentValue);
      currentValue = newValue;
    }
  };
}

/**
 * Functions handling the requests menu (containing details about each request,
 * like status, method, file, domain, as well as a waterfall representing
 * timing imformation).
 */
function RequestsMenuView() {
  dumpn("RequestsMenuView was instantiated");
}

RequestsMenuView.prototype = {
  /**
   * Initialization function, called when the network monitor is started.
   */
  initialize() {
    dumpn("Initializing the RequestsMenuView");

    // this.allowFocusOnRightClick = true;
    // this.maintainSelectionVisible = true;

    const enhancer = applyMiddleware(thunk, stringFetcher);
    this.store = createStore(reducer(this), enhancer);

    // Watch selection changes
    this.store.subscribe(storeWatcher(
      null,
      () => this.selectedItem,
      (newSelected, oldSelected) => {
        if (newSelected && oldSelected && newSelected.id == oldSelected.id) {
          // The same item is still selected, it only got updated
          this.onSelectChange(newSelected);
        } else {
          // Selection has actually changed
          this.onSelect(newSelected);
        }
      }
    ));

    // Watch request count - disable sidebar when the list is empty
    this.store.subscribe(storeWatcher(
      0,
      () => this.store.getState().requests.length,
      count => this._onCountUpdate(count)
    ));

    // Watch the filter bits - update buttons on change
    this.store.subscribe(storeWatcher(
      ["all"],
      () => this.store.getState().filter.enabled,
      filter => this._onFilterUpdate(filter)
    ));

    // Watch the request stats and update on change
    this.store.subscribe(storeWatcher(
      { count: 0, bytes: 0, millis: 0 },
      summary => {
        const newSummary = getDisplayedRequestsSummary(this.store.getState());
        const hasChanged = (summary.count !== newSummary.count ||
                            summary.bytes !== newSummary.bytes ||
                            summary.millis !== newSummary.millis);
        return hasChanged ? newSummary : summary;
      },
      summary => this._onSummaryUpdate(summary)
    ));

    // Retrieve filters from preferences, restore the saved state
    Prefs.filters.forEach(type => this.filterOn(type));

    this._addQueue = [];
    this._updateQueue = [];
    this.flushRequestsTask = new DeferredTask(
      this.flushRequests.bind(this), REQUESTS_REFRESH_RATE);

    this.userInputTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);

    this.clearEvent = this.clear.bind(this);
    this.filterEvent = getKeyWithEvent(this.filterOn.bind(this));
    this.filterKeyboardEvent = getKeyWithEvent(this.filterOn.bind(this), true);

    this.onContextShowing = this.onContextShowing.bind(this);
    this._onContextCopyUrlCommand = this.copyUrl.bind(this);
    this._onContextCopyImageAsDataUriCommand = this.copyImageAsDataUri.bind(this);
    this._onContextCopyResponseCommand = this.copyResponse.bind(this);
    this._onContextNewTabCommand = this.openRequestInTab.bind(this);
    this._onContextResendCommand = this.cloneSelectedRequest.bind(this);
    this._onContextToggleRawHeadersCommand = this.toggleRawHeaders.bind(this);
    this._onContextPerfCommand = () => NetMonitorView.toggleFrontendMode();

    this.sendCustomRequestEvent = this.sendCustomRequest.bind(this);
    this.closeCustomRequestEvent = this.closeCustomRequest.bind(this);
    this.cloneSelectedRequestEvent = this.cloneSelectedRequest.bind(this);
    this.toggleRawHeadersEvent = this.toggleRawHeaders.bind(this);

    this.freetextFilterEvent = this.freetextFilterEvent.bind(this);
    this.freetextFilterBox = $("#requests-menu-filter-freetext-text");
    this.freetextFilterBox.addEventListener("input", this.freetextFilterEvent, false);
    this.freetextFilterBox.addEventListener("command", this.freetextFilterEvent, false);

    $("#network-request-popup")
      .addEventListener("popupshowing", this.onContextShowing, false);
    $("#requests-menu-clear-button")
      .addEventListener("click", this.clearEvent, false);
    $("#requests-menu-filter-buttons")
      .addEventListener("click", this.filterEvent, false);
    $("#requests-menu-filter-buttons")
      .addEventListener("keydown", this.filterKeyboardEvent, false);
    $("#toggle-raw-headers")
      .addEventListener("click", this.toggleRawHeadersEvent, false);

    $("#request-menu-context-copy-url")
      .addEventListener("command", this._onContextCopyUrlCommand, false);
    $("#request-menu-context-copy-response")
      .addEventListener("command", this._onContextCopyResponseCommand, false);
    $("#request-menu-context-copy-image-as-data-uri")
      .addEventListener("command", this._onContextCopyImageAsDataUriCommand, false);
    $("#request-menu-context-newtab")
      .addEventListener("command", this._onContextNewTabCommand, false);

    this._summary = $("#requests-menu-network-summary-button");
    this._summary.setAttribute("label", L10N.getStr("networkMenu.empty"));

    this.onResize = this.onResize.bind(this);
    this._splitter = $("#network-inspector-view-splitter");
    this._splitter.addEventListener("mousemove", this.onResize, false);
    window.addEventListener("resize", this.onResize, false);

    this.mountPoint = document.getElementById("network-table");
    ReactDOM.render(createElement(Provider,
      { store: this.store },
      createElement(ConnectedRequestList)
    ), this.mountPoint);

    window.once("connected", this._onConnect.bind(this));
  },

  _onConnect() {
    if (NetMonitorController.supportsCustomRequest) {
      $("#request-menu-context-resend")
        .addEventListener("command", this._onContextResendCommand, false);
      $("#custom-request-send-button")
        .addEventListener("click", this.sendCustomRequestEvent, false);
      $("#custom-request-close-button")
        .addEventListener("click", this.closeCustomRequestEvent, false);
      $("#headers-summary-resend")
        .addEventListener("click", this.cloneSelectedRequestEvent, false);
    } else {
      $("#request-menu-context-resend").hidden = true;
      $("#headers-summary-resend").hidden = true;
    }

    $("#request-menu-context-perf")
      .addEventListener("command", this._onContextPerfCommand, false);
    $("#requests-menu-network-summary-button")
      .addEventListener("command", this._onContextPerfCommand, false);
    $("#network-statistics-back-button")
      .addEventListener("command", this._onContextPerfCommand, false);
  },

  /**
   * Destruction function, called when the network monitor is closed.
   */
  destroy() {
    dumpn("Destroying the RequestsMenuView");

    Prefs.filters = this.store.getState().filter.enabled;

    this.flushRequestsTask.disarm();
    this.userInputTimer.cancel();

    this.freetextFilterBox.removeEventListener("input",
      this.freetextFilterEvent, false);
    this.freetextFilterBox.removeEventListener("command",
      this.freetextFilterEvent, false);

    $("#network-request-popup")
      .removeEventListener("popupshowing", this.onContextShowing, false);
    $("#requests-menu-clear-button")
      .removeEventListener("click", this.clearEvent, false);
    $("#requests-menu-filter-buttons")
      .removeEventListener("click", this.filterEvent, false);
    $("#requests-menu-filter-buttons")
      .removeEventListener("keydown", this.filterKeyboardEvent, false);

    $("#custom-request-send-button")
      .removeEventListener("click", this.sendCustomRequestEvent, false);
    $("#custom-request-close-button")
      .removeEventListener("click", this.closeCustomRequestEvent, false);
    $("#headers-summary-resend")
      .removeEventListener("click", this.cloneSelectedRequestEvent, false);
    $("#toggle-raw-headers")
      .removeEventListener("click", this.toggleRawHeadersEvent, false);

    $("#request-menu-context-copy-url")
      .removeEventListener("command", this._onContextCopyUrlCommand, false);
    $("#request-menu-context-copy-response")
      .removeEventListener("command", this._onContextCopyResponseCommand, false);
    $("#request-menu-context-copy-image-as-data-uri")
      .removeEventListener("command", this._onContextCopyImageAsDataUriCommand, false);
    $("#request-menu-context-newtab")
      .removeEventListener("command", this._onContextNewTabCommand, false);
    $("#request-menu-context-resend")
      .removeEventListener("command", this._onContextResendCommand, false);
    $("#request-menu-context-perf")
      .removeEventListener("command", this._onContextPerfCommand, false);
    $("#requests-menu-network-summary-button")
      .removeEventListener("command", this._onContextPerfCommand, false);
    $("#network-statistics-back-button")
      .removeEventListener("command", this._onContextPerfCommand, false);

    this._splitter.removeEventListener("mousemove", this.onResize, false);
    window.removeEventListener("resize", this.onResize, false);

    ReactDOM.unmountComponentAtNode(this.mountPoint);
  },

  /**
   * Resets this container (removes all the networking information).
   */
  reset() {
    this.empty();
    this._addQueue = [];
    this._updateQueue = [];
  },

  /**
   * Removes all network requests and closes the sidebar if open.
   */
  clear() {
    this.empty();
  },

  empty() {
    this.store.dispatch(Actions.clearRequests());
  },

  addRequest(id, data) {
    let { method, url, isXHR, cause, startedDateTime, fromCache,
          fromServiceWorker } = data;

    // Convert the received date/time string to a unix timestamp.
    let startedMillis = Date.parse(startedDateTime);

    // Convert the cause from a Ci.nsIContentPolicy constant to a string
    if (cause) {
      let type = loadCauseString(cause.type);
      cause = Object.assign({}, cause, { type });
    }

    let reqData = {
      startedMillis,
      method,
      url,
      isXHR,
      cause,
      fromCache,
      fromServiceWorker
    };

    this._addQueue.push(Actions.addRequest(id, reqData));

    // Lazy updating is disabled in some tests.
    if (!this.lazyUpdate) {
      this.flushRequests();
    } else {
      this.flushRequestsTask.arm();
    }
  },

  updateRequest(id, data, callback) {
    this._updateQueue.push([Actions.updateRequest(id, data), callback]);

    // Lazy updating is disabled in some tests.
    if (!this.lazyUpdate) {
      this.flushRequests();
    } else {
      this.flushRequestsTask.arm();
    }
  },

  /**
   * Specifies if this view may be updated lazily.
   */
  _lazyUpdate: true,

  get lazyUpdate() {
    return this._lazyUpdate;
  },

  set lazyUpdate(value) {
    this._lazyUpdate = value;
    if (!value) {
      this.flushRequests();
    }
  },

  flushRequests() {
    // Prevent displaying any updates received after the target closed.
    if (NetMonitorView._isDestroyed) {
      return;
    }

    const addLen = this._addQueue.length;
    const updateLen = this._updateQueue.length;
    console.log(`Flushing requests: ${addLen} adds, ${updateLen} updates`);
    for (let action of this._addQueue) {
      this.store.dispatch(action);
      window.emit(EVENTS.REQUEST_ADDED, action.id);
    }

    for (let [action, callback] of this._updateQueue) {
      this.store.dispatch(action);
      if (callback) {
        callback();
      }
    }

    this._addQueue = [];
    this._updateQueue = [];
  },

  addTimingMarker(marker) {
    this.store.dispatch(Actions.addTimingMarker(marker));
  },

  sortBy(type = "waterfall") {
    this.store.dispatch(Actions.sortBy(type));
  },

  filterOn(type = "all") {
    this.store.dispatch(Actions.filterOn(type));
  },

  filterOnlyOn(type) {
    this.store.dispatch(Actions.filterOnlyOn(type));
  },

  get items() {
    return getSortedRequests(this.store.getState());
  },

  get visibleItems() {
    return getDisplayedRequests(this.store.getState());
  },

  get itemCount() {
    return this.store.getState().requests.length;
  },

  getItemAtIndex(index) {
    return getSortedRequests(this.store.getState())[index];
  },

  indexOfItem(item) {
    return getRequestIndexById(this.store.getState(), item.id);
  },

  get selectedIndex() {
    const state = this.store.getState();
    if (!state.selectedItem) {
      return -1;
    }
    return getSortedRequests(state).findIndex(r => r.id == state.selectedItem);
  },

  set selectedIndex(index) {
    const requests = getSortedRequests(this.store.getState());
    this.selectedItem = requests[index];
  },

  get selectedItem() {
    return getSelectedRequest(this.store.getState());
  },

  set selectedItem(item) {
    const { selectedItem } = this.store.getState();
    if (item != selectedItem) {
      this.store.dispatch(Actions.selectItem(item ? item.id : null));
    }
  },

  /**
   * Focuses the first visible item in this container.
   */
  focusFirstVisibleItem: function () {
    this.store.dispatch(Actions.selectDelta(-Infinity));
  },

  /**
   * Focuses the last visible item in this container.
   */
  focusLastVisibleItem: function () {
    this.store.dispatch(Actions.selectDelta(+Infinity));
  },

  /**
   * Focuses the next item in this container.
   */
  focusNextItem: function () {
    this.store.dispatch(Actions.selectDelta(+1));
  },

  /**
   * Focuses the previous item in this container.
   */
  focusPrevItem: function () {
    this.store.dispatch(Actions.selectDelta(-1));
  },

  /**
   * Focuses another item in this container based on the index distance
   * from the currently focused item.
   *
   * @param number delta
   *        A scalar specifying by how many items should the selection change.
   */
  focusItemAtDelta(delta) {
    this.store.dispatch(Actions.selectDelta(delta));
  },

  ensureSelectedItemIsVisible() {
    // TODO: scroll selected element into view
  },

  _flushWaterfallViews(reset) {
    // TODO: resize the waterfall, by setting state
  },

  /**
   * The selection listener for this container.
   */
  onSelect(item) {
    if (item) {
      NetMonitorView.Sidebar.populate(item.data);
      NetMonitorView.Sidebar.toggle(true);
    } else {
      NetMonitorView.Sidebar.toggle(false);
    }
  },

  onSelectChange(item) {
    NetMonitorView.NetworkDetails.populate(item.data);
  },

  _onFilterUpdate(filter) {
    for (let f of Object.keys(Filters)) {
      const el = $(`#requests-menu-filter-${f}-button`);
      if (filter.includes(f)) {
        el.setAttribute("checked", true);
      } else {
        el.removeAttribute("checked");
      }
    }
  },

  _onCountUpdate(count) {
    const isEmpty = (count == 0);
    $("#details-pane-toggle").disabled = isEmpty;
    if (isEmpty) {
      NetMonitorView.Sidebar.toggle(false);
    }
  },

  /**
   * Refreshes the status displayed in this container's toolbar, providing
   * concise information about all requests.
   */
  _onSummaryUpdate(summary) {
    const { count, bytes, millis } = summary;

    if (!count) {
      this._summary.setAttribute("label", L10N.getStr("networkMenu.empty"));
      return;
    }

    // https://developer.mozilla.org/en-US/docs/Localization_and_Plurals
    let str = PluralForm.get(summary.count, L10N.getStr("networkMenu.summary"));

    this._summary.setAttribute("label", str
      .replace("#1", count)
      .replace("#2", L10N.numberWithDecimals(bytes / 1024, CONTENT_SIZE_DECIMALS))
      .replace("#3", L10N.numberWithDecimals(millis / 1000, REQUEST_TIME_DECIMALS))
    );
  },

  /**
   * Handles the timeout on the freetext filter textbox
   */
  freetextFilterEvent: function () {
    this.userInputTimer.cancel();

    let freetextFilter = this.freetextFilterBox.value || "";

    if (freetextFilter.length === 0) {
      this.freetextFilterBox.removeAttribute("filled");
    } else {
      this.freetextFilterBox.setAttribute("filled", true);
    }

    this.userInputTimer.initWithCallback(
      () => this.store.dispatch(Actions.filterFreetext(freetextFilter)),
      FREETEXT_FILTER_SEARCH_DELAY,
      Ci.nsITimer.TYPE_ONE_SHOT);
  },

  /**
   * The resize listener for this container's window.
   */
  onResize() {
    // Allow requests to settle down first.
    setNamedTimeout("resize-events", RESIZE_REFRESH_RATE, () => {
      let container = $("#requests-menu-toolbar");
      let waterfall = $("#requests-menu-waterfall-header-box");
      if (!container || !waterfall) {
        return;
      }

      let containerBounds = container.getBoundingClientRect();
      let waterfallBounds = waterfall.getBoundingClientRect();

      let waterfallWidth;
      if (!window.isRTL) {
        waterfallWidth = containerBounds.width - waterfallBounds.left;
      } else {
        waterfallWidth = waterfallBounds.right;
      }

      this.store.dispatch(Actions.resizeWaterfall(waterfallWidth));
    });
  },

  /**
   * Copy the request url from the currently selected item.
   */
  copyUrl: function () {
    let { url } = this.selectedItem.data;
    clipboardHelper.copyString(url);
  },

  /**
   * Copy the request url query string parameters from the currently
   * selected item.
   */
  copyUrlParams: function () {
    let { url } = this.selectedItem.data;
    let params = NetworkHelper.nsIURL(url).query.split("&");
    let string = params.join(Services.appinfo.OS === "WINNT" ? "\r\n" : "\n");
    clipboardHelper.copyString(string);
  },

  /**
   * Copy the request form data parameters (or raw payload) from
   * the currently selected item.
   */
  copyPostData: Task.async(function* () {
    let selected = this.selectedItem.data;

    // Try to extract any form data parameters.
    let formDataSections = yield getFormDataSections(
      selected.requestHeaders,
      selected.requestHeadersFromUploadStream,
      selected.requestPostData,
      gNetwork.getString.bind(gNetwork));

    let params = [];
    formDataSections.forEach(section => {
      let paramsArray = NetworkHelper.parseQueryString(section);
      if (paramsArray) {
        params = [...params, ...paramsArray];
      }
    });

    let string = params
      .map(param => param.name + (param.value ? "=" + param.value : ""))
      .join(Services.appinfo.OS === "WINNT" ? "\r\n" : "\n");

    // Fall back to raw payload.
    if (!string) {
      let postData = selected.requestPostData.postData.text;
      string = yield gNetwork.getString(postData);
      if (Services.appinfo.OS !== "WINNT") {
        string = string.replace(/\r/g, "");
      }
    }

    clipboardHelper.copyString(string);
  }),

  /**
   * Copy a cURL command from the currently selected item.
   */
  copyAsCurl() {
    let selected = this.selectedItem.data;

    Task.spawn(function* () {
      // Create a sanitized object for the Curl command generator.
      let data = {
        url: selected.url,
        method: selected.method,
        headers: [],
        httpVersion: selected.httpVersion,
        postDataText: null
      };

      // Fetch header values.
      for (let { name, value } of selected.requestHeaders.headers) {
        let text = yield gNetwork.getString(value);
        data.headers.push({ name, value: text });
      }

      // Fetch the request payload.
      if (selected.requestPostData) {
        let postData = selected.requestPostData.postData.text;
        data.postDataText = yield gNetwork.getString(postData);
      }

      clipboardHelper.copyString(Curl.generateCommand(data));
    });
  },

  /**
   * Copy the raw request headers from the currently selected item.
   */
  copyRequestHeaders() {
    let selected = this.selectedItem.data;
    let rawHeaders = selected.requestHeaders.rawHeaders.trim();
    if (Services.appinfo.OS !== "WINNT") {
      rawHeaders = rawHeaders.replace(/\r/g, "");
    }
    clipboardHelper.copyString(rawHeaders);
  },

  /**
   * Copy the raw response headers from the currently selected item.
   */
  copyResponseHeaders() {
    let selected = this.selectedItem.data;
    let rawHeaders = selected.responseHeaders.rawHeaders.trim();
    if (Services.appinfo.OS !== "WINNT") {
      rawHeaders = rawHeaders.replace(/\r/g, "");
    }
    clipboardHelper.copyString(rawHeaders);
  },

  /**
   * Copy image as data uri.
   */
  copyImageAsDataUri() {
    let selected = this.selectedItem.data;
    let { mimeType, text, encoding } = selected.responseContent.content;

    gNetwork.getString(text).then(string => {
      let data = formDataURI(mimeType, encoding, string);
      clipboardHelper.copyString(data);
    });
  },

  /**
   * Copy response data as a string.
   */
  copyResponse() {
    let selected = this.selectedItem.data;
    let text = selected.responseContent.content.text;

    gNetwork.getString(text).then(string => {
      clipboardHelper.copyString(string);
    });
  },

  /**
   * Copy HAR from the network panel content to the clipboard.
   */
  copyAllAsHar: function () {
    let options = this.getDefaultHarOptions();
    return HarExporter.copy(options);
  },

  /**
   * Save HAR from the network panel content to a file.
   */
  saveAllAsHar: function () {
    let options = this.getDefaultHarOptions();
    return HarExporter.save(options);
  },

  getDefaultHarOptions: function () {
    let form = NetMonitorController._target.form;
    let title = form.title || form.url;

    return {
      getString: gNetwork.getString.bind(gNetwork),
      // view: this,
      items: this.store.getState().requests,
      title
    };
  },

  /**
   * Handle the context menu opening. Hide items if no request is selected.
   */
  onContextShowing() {
    let selectedItem = this.selectedItem;

    let resendElement = $("#request-menu-context-resend");
    resendElement.hidden = !NetMonitorController.supportsCustomRequest ||
      !selectedItem || selectedItem.data.isCustom;

    let copyUrlElement = $("#request-menu-context-copy-url");
    copyUrlElement.hidden = !selectedItem;

    let copyUrlParamsElement = $("#request-menu-context-copy-url-params");
    copyUrlParamsElement.hidden = !selectedItem ||
      !NetworkHelper.nsIURL(selectedItem.data.url).query;

    let copyPostDataElement = $("#request-menu-context-copy-post-data");
    copyPostDataElement.hidden = !selectedItem || !selectedItem.data.requestPostData;

    let copyAsCurlElement = $("#request-menu-context-copy-as-curl");
    copyAsCurlElement.hidden = !selectedItem;

    let copyRequestHeadersElement = $("#request-menu-context-copy-request-headers");
    copyRequestHeadersElement.hidden = !selectedItem || !selectedItem.data.requestHeaders;

    let copyResponseHeadersElement = $("#response-menu-context-copy-response-headers");
    copyResponseHeadersElement.hidden = !selectedItem ||
      !selectedItem.data.responseHeaders;

    let copyResponse = $("#request-menu-context-copy-response");
    copyResponse.hidden = !selectedItem ||
      !selectedItem.data.responseContent ||
      !selectedItem.data.responseContent.content.text ||
      selectedItem.data.responseContent.content.text.length === 0;

    let copyImageAsDataUriElement = $("#request-menu-context-copy-image-as-data-uri");
    copyImageAsDataUriElement.hidden = !selectedItem ||
      !selectedItem.data.responseContent ||
      !selectedItem.data.responseContent.content.mimeType.includes("image/");

    let separators = $all(".request-menu-context-separator");
    Array.forEach(separators, separator => {
      separator.hidden = !selectedItem;
    });

    let copyAsHar = $("#request-menu-context-copy-all-as-har");
    copyAsHar.hidden = !NetMonitorView.RequestsMenu.items.length;

    let saveAsHar = $("#request-menu-context-save-all-as-har");
    saveAsHar.hidden = !NetMonitorView.RequestsMenu.items.length;

    let newTabElement = $("#request-menu-context-newtab");
    newTabElement.hidden = !selectedItem;
  },

  /**
   * Create a new custom request form populated with the data from
   * the currently selected request.
   */
  cloneSelectedRequest() {
    let selected = this.selectedItem;

    this.store.dispatch(Actions.cloneRequest(selected.id));
  },

  /**
   * Shows raw request/response headers in textboxes.
   */
  toggleRawHeaders: function () {
    let requestTextarea = $("#raw-request-headers-textarea");
    let responseTextarea = $("#raw-response-headers-textarea");
    let rawHeadersHidden = $("#raw-headers").getAttribute("hidden");

    if (rawHeadersHidden) {
      let selected = this.selectedItem.data;
      let selectedRequestHeaders = selected.requestHeaders.headers;
      let selectedResponseHeaders = selected.responseHeaders.headers;
      requestTextarea.value = writeHeaderText(selectedRequestHeaders);
      responseTextarea.value = writeHeaderText(selectedResponseHeaders);
      $("#raw-headers").hidden = false;
    } else {
      requestTextarea.value = null;
      responseTextarea.value = null;
      $("#raw-headers").hidden = true;
    }
  },

  /**
   * Send a new HTTP request using the data in the custom request form.
   */
  sendCustomRequest: function () {
    let selected = this.selectedItem.data;

    let data = {
      url: selected.url,
      method: selected.method,
      httpVersion: selected.httpVersion,
    };
    if (selected.requestHeaders) {
      data.headers = selected.requestHeaders.headers;
    }
    if (selected.requestPostData) {
      data.body = selected.requestPostData.postData.text;
    }

    NetMonitorController.webConsoleClient.sendHTTPRequest(data, response => {
      let id = response.eventActor.actor;
      this.store.dispatch(Actions.preselectItem(id));
    });

    this.closeCustomRequest();
  },

  /**
   * Remove the currently selected custom request.
   */
  closeCustomRequest() {
    this.store.dispatch(Actions.removeSelectedCustomRequest());
  },

  /**
   * Opens selected item in a new tab.
   */
  openRequestInTab: function () {
    let win = Services.wm.getMostRecentWindow(gDevTools.chromeWindowType);
    let { url } = this.selectedItem.data;
    win.openUILinkIn(url, "tab", { relatedToCurrent: true });
  },
};

exports.RequestsMenuView = RequestsMenuView;
