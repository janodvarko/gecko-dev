/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const { getRequestIndexById, getSelectedRequest } = require("../selectors/index");
const { Filters } = require("../filter-predicates");

const UPDATE_PROPS = [
  "method",
  "url",
  "remotePort",
  "remoteAddress",
  "status",
  "statusText",
  "httpVersion",
  "securityState",
  "securityInfo",
  "mimeType",
  "contentSize",
  "transferredSize",
  "totalTime",
  "eventTimings",
  "headersSize",
  "requestHeaders",
  "requestHeadersFromUploadStream",
  "requestCookies",
  "requestPostData",
  "responseHeaders",
  "responseCookies",
  "responseContent",
  "responseContentDataUri"
];

// Safe bounds for waterfall width (px)
const REQUESTS_WATERFALL_SAFE_BOUNDS = 90;

const initialState = {
  requests: [],
  firstRequestStartedMillis: -1,
  lastRequestEndedMillis: -1,
  firstDocumentDOMContentLoadedTimestamp: -1,
  firstDocumentLoadTimestamp: -1,
  selectedItem: null,
  preselectedItem: null,
  filter: {
    enabled: [ "all" ],
    text: "",
  },
  sortBy: {
    // null means: sort by "waterfall", but don't highlight the table header
    type: null,
    ascending: true,
  },
  waterfallWidth: 300,
};

// The ownerView param is a hack to satisfy tests - TODO: make it go away
const reducer = ownerView => (state = initialState, action) => {
  switch (action.type) {
    case "ADD_REQUEST": {
      let { startedMillis } = action.data;
      let { firstRequestStartedMillis, lastRequestEndedMillis,
            selectedItem, preselectedItem } = state;

      // Update the first/last timestamps
      if (firstRequestStartedMillis == -1) {
        firstRequestStartedMillis = startedMillis;
      }
      if (startedMillis > lastRequestEndedMillis) {
        lastRequestEndedMillis = startedMillis;
      }

      let startedDeltaMillis = startedMillis - firstRequestStartedMillis;

      let newRequest = {
        id: action.id,
        data: Object.assign({}, action.data, { startedDeltaMillis }),
        ownerView
      };

      return Object.assign({}, state, {
        requests: [ ...state.requests, newRequest ],
        firstRequestStartedMillis,
        lastRequestEndedMillis,
        selectedItem: preselectedItem || selectedItem,
        preselectedItem: null,
      });
    }

    case "UPDATE_REQUEST": {
      let { requests, lastRequestEndedMillis } = state;

      requests = requests.map(request => {
        if (request.id !== action.id) {
          return request;
        }

        for (let [key, value] of Object.entries(action.data)) {
          if (UPDATE_PROPS.includes(key)) {
            let newData;
            switch (key) {
              case "responseContent":
                newData = { [key]: value };

                // If there's no mime type available when the response content
                // is received, assume text/plain as a fallback.
                if (!request.data.mimeType) {
                  newData.mimeType = "text/plain";
                }
                break;
              case "totalTime":
                let endedMillis = request.data.startedMillis + value;
                newData = {
                  [key]: value,
                  endedMillis,
                };
                lastRequestEndedMillis = Math.max(lastRequestEndedMillis, endedMillis);
                break;
              case "requestPostData":
                newData = {
                  [key]: value,
                  requestHeadersFromUploadStream: { headers: [], headersSize: 0 },
                };
                break;
              default:
                newData = { [key]: value };
                break;
            }

            request = Object.assign({}, request, {
              data: Object.assign({}, request.data, newData)
            });
          }
        }

        return request;
      });

      return Object.assign({}, state, {
        requests,
        lastRequestEndedMillis,
      });
    }
    case "CLONE_REQUEST": {
      let clonedIdx = getRequestIndexById(state, action.id);
      if (clonedIdx == -1) {
        return state;
      }

      let clonedRequest = state.requests[clonedIdx];
      let newRequest = Object.assign({}, clonedRequest, {
        id: clonedRequest.id + "-clone",
        data: {
          method: clonedRequest.data.method,
          url: clonedRequest.data.url,
          requestHeaders: clonedRequest.data.requestHeaders,
          requestPostData: clonedRequest.data.requestPostData,
          isCustom: true
        }
      });

      // Insert the clone right after the original. This ensures that the requests
      // are always sorted next to each other, even when multiple requests are
      // equal according to the sorting criteria.
      let newRequests = state.requests.slice();
      newRequests.splice(clonedIdx + 1, 0, newRequest);

      return Object.assign({}, state, {
        requests: newRequests,
        selectedItem: newRequest.id,
      });
    }
    case "REMOVE_SELECTED_CUSTOM_REQUEST": {
      let selectedRequest = getSelectedRequest(state);
      if (!selectedRequest) {
        return state;
      }

      // Only custom requests can be removed
      if (!selectedRequest.data.isCustom) {
        return state;
      }

      return Object.assign({}, state, {
        requests: state.requests.filter(r => r !== selectedRequest),
        selectedItem: null,
      });
    }
    case "CLEAR_REQUESTS": {
      return Object.assign({}, state, {
        requests: [],
        selectedItem: null,
        firstRequestStartedMillis: -1,
        lastRequestEndedMillis: -1,
        firstDocumentDOMContentLoadedTimestamp: -1,
        firstDocumentLoadTimestamp: -1,
      });
    }
    case "ADD_TIMING_MARKER": {
      if (action.marker.name == "document::DOMContentLoaded" &&
          state.firstDocumentDOMContentLoadedTimestamp == -1) {
        return Object.assign({}, state, {
          firstDocumentDOMContentLoadedTimestamp: action.marker.unixTime / 1000
        });
      }
      if (action.marker.name == "document::Load" &&
          state.firstDocumentLoadTimestamp == -1) {
        return Object.assign({}, state, {
          firstDocumentLoadTimestamp: action.marker.unixTime / 1000
        });
      }
      return state;
    }
    case "SORT_BY": {
      let { type, ascending } = state.sortBy;
      return Object.assign({}, state, {
        sortBy: Object.assign({}, state.sortBy, {
          type: action.sortType,
          ascending: type == action.sortType ? !ascending : true
        })
      });
    }
    case "FILTER_ON": {
      // Ignore unknown filters
      if (!Object.keys(Filters).includes(action.filterType)) {
        return state;
      }

      let { enabled } = state.filter;
      let newEnabled;

      if (action.filterType == "all") {
        newEnabled = ["all"];
      } else if (enabled.includes(action.filterType)) {
        newEnabled = enabled.filter(f => f !== action.filterType);
        if (newEnabled.length == 0) {
          newEnabled = ["all"];
        }
      } else {
        newEnabled = [...enabled.filter(f => f !== "all"), action.filterType];
      }

      return Object.assign({}, state, {
        filter: Object.assign({}, state.filter, { enabled: newEnabled })
      });
    }
    case "FILTER_ONLY_ON": {
      // Ignore unknown filters
      if (!Object.keys(Filters).includes(action.filterType)) {
        return state;
      }

      return Object.assign({}, state, {
        filter: Object.assign({}, state.filter, { enabled: [ action.filterType ] })
      });
    }
    case "FILTER_FREETEXT": {
      return Object.assign({}, state, {
        filter: Object.assign({}, state.filter, { text: action.text })
      });
    }
    case "PRESELECT_ITEM": {
      return Object.assign({}, state, {
        preselectedItem: action.id
      });
    }
    case "SELECT_ITEM": {
      return Object.assign({}, state, {
        selectedItem: action.id
      });
    }
    case "WATERFALL_RESIZE": {
      return Object.assign({}, state, {
        waterfallWidth: action.width - REQUESTS_WATERFALL_SAFE_BOUNDS
      });
    }
    default:
      return state;
  }
};

module.exports = reducer;
