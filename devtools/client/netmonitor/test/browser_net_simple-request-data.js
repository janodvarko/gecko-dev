/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Tests if requests render correct information in the menu UI.
 */

function test() {
  let { L10N } = require("devtools/client/netmonitor/l10n");

  initNetMonitor(SIMPLE_SJS).then(({ tab, monitor }) => {
    info("Starting test... ");

    let { NetMonitorView } = monitor.panelWin;
    let { RequestsMenu } = NetMonitorView;

    RequestsMenu.lazyUpdate = false;

    waitForNetworkEvents(monitor, 1)
      .then(() => teardown(monitor))
      .then(finish);

    monitor.panelWin.once(monitor.panelWin.EVENTS.NETWORK_EVENT, () => {
      is(RequestsMenu.selectedItem, null,
        "There shouldn't be any selected item in the requests menu.");
      is(RequestsMenu.itemCount, 1,
        "The requests menu should not be empty after the first request.");
      is(NetMonitorView.detailsPaneHidden, true,
        "The details pane should still be hidden after the first request.");

      let requestItem = RequestsMenu.getItemAtIndex(0);

      is(typeof requestItem.id, "string",
        "The attached request id is incorrect.");
      isnot(requestItem.id, "",
        "The attached request id should not be empty.");

      is(typeof requestItem.data.startedDeltaMillis, "number",
        "The attached startedDeltaMillis is incorrect.");
      is(requestItem.data.startedDeltaMillis, 0,
        "The attached startedDeltaMillis should be zero.");

      is(typeof requestItem.data.startedMillis, "number",
        "The attached startedMillis is incorrect.");
      isnot(requestItem.data.startedMillis, 0,
        "The attached startedMillis should not be zero.");

      is(requestItem.data.requestHeaders, undefined,
        "The requestHeaders should not yet be set.");
      is(requestItem.data.requestCookies, undefined,
        "The requestCookies should not yet be set.");
      is(requestItem.data.requestPostData, undefined,
        "The requestPostData should not yet be set.");

      is(requestItem.data.responseHeaders, undefined,
        "The responseHeaders should not yet be set.");
      is(requestItem.data.responseCookies, undefined,
        "The responseCookies should not yet be set.");

      is(requestItem.data.httpVersion, undefined,
        "The httpVersion should not yet be set.");
      is(requestItem.data.status, undefined,
        "The status should not yet be set.");
      is(requestItem.data.statusText, undefined,
        "The statusText should not yet be set.");

      is(requestItem.data.headersSize, undefined,
        "The headersSize should not yet be set.");
      is(requestItem.data.transferredSize, undefined,
        "The transferredSize should not yet be set.");
      is(requestItem.data.contentSize, undefined,
        "The contentSize should not yet be set.");

      is(requestItem.data.mimeType, undefined,
        "The mimeType should not yet be set.");
      is(requestItem.data.responseContent, undefined,
        "The responseContent should not yet be set.");

      is(requestItem.data.totalTime, undefined,
        "The totalTime should not yet be set.");
      is(requestItem.data.eventTimings, undefined,
        "The eventTimings should not yet be set.");

      verifyRequestItemTarget(RequestsMenu, requestItem, "GET", SIMPLE_SJS);
    });

    monitor.panelWin.once(monitor.panelWin.EVENTS.RECEIVED_REQUEST_HEADERS, () => {
      let requestItem = RequestsMenu.getItemAtIndex(0);
      ok(requestItem.data.requestHeaders,
        "There should be a requestHeaders data available.");
      is(requestItem.data.requestHeaders.headers.length, 10,
        "The requestHeaders data has an incorrect |headers| property.");
      isnot(requestItem.data.requestHeaders.headersSize, 0,
        "The requestHeaders data has an incorrect |headersSize| property.");
      // Can't test for the exact request headers size because the value may
      // vary across platforms ("User-Agent" header differs).

      verifyRequestItemTarget(requestItem, "GET", SIMPLE_SJS);
    });

    monitor.panelWin.once(monitor.panelWin.EVENTS.RECEIVED_REQUEST_COOKIES, () => {
      let requestItem = RequestsMenu.getItemAtIndex(0);

      ok(requestItem.data.requestCookies,
        "There should be a requestCookies data available.");
      is(requestItem.data.requestCookies.cookies.length, 2,
        "The requestCookies data has an incorrect |cookies| property.");

      verifyRequestItemTarget(RequestsMenu, requestItem, "GET", SIMPLE_SJS);
    });

    monitor.panelWin.once(monitor.panelWin.EVENTS.RECEIVED_REQUEST_POST_DATA, () => {
      ok(false, "Trap listener: this request doesn't have any post data.");
    });

    monitor.panelWin.once(monitor.panelWin.EVENTS.RECEIVED_RESPONSE_HEADERS, () => {
      let requestItem = RequestsMenu.getItemAtIndex(0);

      ok(requestItem.data.responseHeaders,
        "There should be a responseHeaders data available.");
      is(requestItem.data.responseHeaders.headers.length, 10,
        "The responseHeaders data has an incorrect |headers| property.");
      is(requestItem.data.responseHeaders.headersSize, 330,
        "The responseHeaders data has an incorrect |headersSize| property.");

      verifyRequestItemTarget(RequestsMenu, requestItem, "GET", SIMPLE_SJS);
    });

    monitor.panelWin.once(monitor.panelWin.EVENTS.RECEIVED_RESPONSE_COOKIES, () => {
      let requestItem = RequestsMenu.getItemAtIndex(0);

      ok(requestItem.data.responseCookies,
        "There should be a responseCookies data available.");
      is(requestItem.data.responseCookies.cookies.length, 2,
        "The responseCookies data has an incorrect |cookies| property.");

      verifyRequestItemTarget(RequestsMenu, requestItem, "GET", SIMPLE_SJS);
    });

    monitor.panelWin.once(monitor.panelWin.EVENTS.STARTED_RECEIVING_RESPONSE, () => {
      let requestItem = RequestsMenu.getItemAtIndex(0);

      is(requestItem.data.httpVersion, "HTTP/1.1",
        "The httpVersion data has an incorrect value.");
      is(requestItem.data.status, "200",
        "The status data has an incorrect value.");
      is(requestItem.data.statusText, "Och Aye",
        "The statusText data has an incorrect value.");
      is(requestItem.data.headersSize, 330,
        "The headersSize data has an incorrect value.");

      verifyRequestItemTarget(RequestsMenu, requestItem, "GET", SIMPLE_SJS, {
        status: "200",
        statusText: "Och Aye"
      });
    });

    monitor.panelWin.once(monitor.panelWin.EVENTS.UPDATING_RESPONSE_CONTENT, () => {
      let requestItem = RequestsMenu.getItemAtIndex(0);

      is(requestItem.data.transferredSize, "12",
        "The transferredSize data has an incorrect value.");
      is(requestItem.data.contentSize, "12",
        "The contentSize data has an incorrect value.");
      is(requestItem.data.mimeType, "text/plain; charset=utf-8",
        "The mimeType data has an incorrect value.");

      verifyRequestItemTarget(RequestsMenu, requestItem, "GET", SIMPLE_SJS, {
        type: "plain",
        fullMimeType: "text/plain; charset=utf-8",
        transferred: L10N.getFormatStrWithNumbers("networkMenu.sizeB", 12),
        size: L10N.getFormatStrWithNumbers("networkMenu.sizeB", 12),
      });
    });

    monitor.panelWin.once(monitor.panelWin.EVENTS.RECEIVED_RESPONSE_CONTENT, () => {
      let requestItem = RequestsMenu.getItemAtIndex(0);

      ok(requestItem.data.responseContent,
        "There should be a responseContent data available.");
      is(requestItem.data.responseContent.content.mimeType,
        "text/plain; charset=utf-8",
        "The responseContent data has an incorrect |content.mimeType| property.");
      is(requestItem.data.responseContent.content.text,
        "Hello world!",
        "The responseContent data has an incorrect |content.text| property.");
      is(requestItem.data.responseContent.content.size,
        12,
        "The responseContent data has an incorrect |content.size| property.");

      verifyRequestItemTarget(RequestsMenu, requestItem, "GET", SIMPLE_SJS, {
        type: "plain",
        fullMimeType: "text/plain; charset=utf-8",
        transferred: L10N.getFormatStrWithNumbers("networkMenu.sizeB", 12),
        size: L10N.getFormatStrWithNumbers("networkMenu.sizeB", 12),
      });
    });

    monitor.panelWin.once(monitor.panelWin.EVENTS.UPDATING_EVENT_TIMINGS, () => {
      let requestItem = RequestsMenu.getItemAtIndex(0);

      is(typeof requestItem.data.totalTime, "number",
        "The attached totalTime is incorrect.");
      ok(requestItem.data.totalTime >= 0,
        "The attached totalTime should be positive.");

      is(typeof requestItem.data.endedMillis, "number",
        "The attached endedMillis is incorrect.");
      ok(requestItem.data.endedMillis >= 0,
        "The attached endedMillis should be positive.");

      verifyRequestItemTarget(RequestsMenu, requestItem, "GET", SIMPLE_SJS, {
        time: true
      });
    });

    monitor.panelWin.once(monitor.panelWin.EVENTS.RECEIVED_EVENT_TIMINGS, () => {
      let requestItem = RequestsMenu.getItemAtIndex(0);

      ok(requestItem.data.eventTimings,
        "There should be a eventTimings data available.");
      is(typeof requestItem.data.eventTimings.timings.blocked, "number",
        "The eventTimings data has an incorrect |timings.blocked| property.");
      is(typeof requestItem.data.eventTimings.timings.dns, "number",
        "The eventTimings data has an incorrect |timings.dns| property.");
      is(typeof requestItem.data.eventTimings.timings.connect, "number",
        "The eventTimings data has an incorrect |timings.connect| property.");
      is(typeof requestItem.data.eventTimings.timings.send, "number",
        "The eventTimings data has an incorrect |timings.send| property.");
      is(typeof requestItem.data.eventTimings.timings.wait, "number",
        "The eventTimings data has an incorrect |timings.wait| property.");
      is(typeof requestItem.data.eventTimings.timings.receive, "number",
        "The eventTimings data has an incorrect |timings.receive| property.");
      is(typeof requestItem.data.eventTimings.totalTime, "number",
        "The eventTimings data has an incorrect |totalTime| property.");

      verifyRequestItemTarget(RequestsMenu, requestItem, "GET", SIMPLE_SJS, {
        time: true
      });
    });

    tab.linkedBrowser.reload();
  });
}
