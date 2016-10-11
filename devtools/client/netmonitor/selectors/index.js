/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const { Filters, isFreetextMatch } = require("../filter-predicates");
const { Sorters } = require("../sort-predicates");

/**
 * Check if the given requests is a clone, find and return the original request if it is.
 * Cloned requests are sorted by comparing the original ones.
 */
function getOrigRequest(state, req) {
  if (!req.id.endsWith("-clone")) {
    return req;
  }

  const origId = req.id.replace(/-clone$/, "");
  return getRequestById(state, origId);
}

function getFilter(state) {
  const { enabled, text } = state.filter;
  return r => enabled.some(p => Filters[p] && Filters[p](r.data)) &&
              isFreetextMatch(r.data, text);
}

function getSorter(state) {
  const { sortBy } = state;

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
      getOrigRequest(state, a).data,
      getOrigRequest(state, b).data
    );
  }

  const ascending = sortBy.ascending ? +1 : -1;
  return (a, b) => ascending * sortWithClones(a, b, dataSorter);
}

function getSortedRequests(state) {
  const { requests } = state;
  const sortFn = getSorter(state);
  return requests.slice().sort(sortFn);
}

function getDisplayedRequests(state) {
  const { requests } = state;
  const filterFn = getFilter(state);
  const sortFn = getSorter(state);
  return requests.filter(filterFn).sort(sortFn);
}

function getDisplayedRequestsSummary(state) {
  const requests = getDisplayedRequests(state);

  if (requests.length == 0) {
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
    count: requests.length,
    bytes: totalBytes,
    millis: newestRequest.data.endedMillis - oldestRequest.data.startedMillis,
  };
}

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

exports.getSortedRequests = getSortedRequests;
exports.getDisplayedRequests = getDisplayedRequests;
exports.getDisplayedRequestsSummary = getDisplayedRequestsSummary;
exports.getRequestById = getRequestById;
exports.getRequestIndexById = getRequestIndexById;
exports.getSelectedRequest = getSelectedRequest;
exports.getSelectedRequestIndex = getSelectedRequestIndex;
exports.getActiveFilters = getActiveFilters;
