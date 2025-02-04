/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const { createSelector } = require("devtools/client/shared/vendor/reselect");
const { Filters, isFreetextMatch } = require("../filter-predicates");
const { Sorters } = require("../sort-predicates");

/**
 * Check if the given requests is a clone, find and return the original request if it is.
 * Cloned requests are sorted by comparing the original ones.
 */
function getOrigRequest(requests, req) {
  if (!req.id.endsWith("-clone")) {
    return req;
  }

  const origId = req.id.replace(/-clone$/, "");
  return requests.find(r => r.id === origId);
}

const getFilterFn = createSelector(
  state => state.filter,
  filter => {
    return r => filter.enabled.some(p => Filters[p] && Filters[p](r.data)) &&
                isFreetextMatch(r.data, filter.text);
  }
);

const getSortFn = createSelector(
  state => state.requests,
  state => state.sortBy,
  (requests, sortBy) => {
    let dataSorter = Sorters[sortBy.type || "waterfall"];

    function sortWithClones(a, b) {
      // If one request is a clone of the other, sort them next to each other
      if (a.id == b.id + "-clone") {
        return +1;
      } else if (a.id + "-clone" == b.id) {
        return -1;
      }

      // Otherwise, get the original requests and compare them
      return dataSorter(
        getOrigRequest(requests, a).data,
        getOrigRequest(requests, b).data
      );
    }

    const ascending = sortBy.ascending ? +1 : -1;
    return (a, b) => ascending * sortWithClones(a, b, dataSorter);
  }
);

const getSortedRequests = createSelector(
  state => state.requests,
  getSortFn,
  (requests, sortFn) => requests.sort(sortFn)
);

const getDisplayedRequests = createSelector(
  state => state.requests,
  getFilterFn,
  getSortFn,
  (requests, filterFn, sortFn) => requests.filter(filterFn).sort(sortFn)
);

const getDisplayedRequestsSummary = createSelector(
  getDisplayedRequests,
  (requests) => {
    if (requests.size == 0) {
      return { count: 0, bytes: 0, millis: 0 };
    }

    const totalBytes = requests.reduce((total, item) => {
      let size = item.data.contentSize;
      return total + (typeof size == "number" ? size : 0);
    }, 0);

    const oldestRequest = requests.reduce(
      (prev, curr) => prev.data.startedMillis < curr.data.startedMillis ? prev : curr);
    const newestRequest = requests.reduce(
      (prev, curr) => prev.data.startedMillis > curr.data.startedMillis ? prev : curr);

    return {
      count: requests.size,
      bytes: totalBytes,
      millis: newestRequest.data.endedMillis - oldestRequest.data.startedMillis,
    };
  }
);

function getRequestById(state, id) {
  return state.requests.find(r => r.id === id);
}

function getRequestIndexById(state, id) {
  return state.requests.findIndex(r => r.id === id);
}

function getSelectedRequest(state) {
  if (!state.selectedItem) {
    return null;
  }

  return getRequestById(state, state.selectedItem);
}

function getSelectedRequestIndex(state) {
  if (!state.selectedItem) {
    return -1;
  }

  return getRequestIndexById(state, state.selectedItem);
}

function getActiveFilters(state) {
  return state.filter.enabled;
}

const EPSILON = 0.001;

function getWaterfallScale(state) {
  let longestWidth = state.lastRequestEndedMillis - state.firstRequestStartedMillis;
  return Math.min(Math.max(state.waterfallWidth / longestWidth, EPSILON), 1);
}

exports.getSortedRequests = getSortedRequests;
exports.getDisplayedRequests = getDisplayedRequests;
exports.getDisplayedRequestsSummary = getDisplayedRequestsSummary;
exports.getRequestById = getRequestById;
exports.getRequestIndexById = getRequestIndexById;
exports.getSelectedRequest = getSelectedRequest;
exports.getSelectedRequestIndex = getSelectedRequestIndex;
exports.getActiveFilters = getActiveFilters;
exports.getWaterfallScale = getWaterfallScale;
