/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const { getDisplayedRequests } = require("../selectors/index");

exports.addRequest = (id, data) => {
  return {
    type: "ADD_REQUEST",
    id,
    data
  };
};

exports.updateRequest = (id, data) => {
  return {
    type: "UPDATE_REQUEST",
    id,
    data
  };
};

/**
 * Clone a request, set a "isCustom" attribute. Used by the "Edit and Resend" feature.
 */
exports.cloneRequest = (id) => {
  return {
    type: "CLONE_REQUEST",
    id
  };
};

/**
 * Remove a request from the list. Supports removing only cloned requests with a
 * "isCustom" attribute. Other requests never need to be removed.
 */
exports.removeSelectedCustomRequest = () => {
  return {
    type: "REMOVE_SELECTED_CUSTOM_REQUEST"
  };
};

exports.clearRequests = () => {
  return {
    type: "CLEAR_REQUESTS"
  };
};

exports.addTimingMarker = (marker) => {
  return {
    type: "ADD_TIMING_MARKER",
    marker
  };
};

exports.sortBy = (sortType) => {
  return {
    type: "SORT_BY",
    sortType
  };
};

exports.filterOn = (filterType) => {
  return {
    type: "FILTER_ON",
    filterType
  };
};

exports.filterOnlyOn = (filterType) => {
  return {
    type: "FILTER_ONLY_ON",
    filterType
  };
};

exports.filterFreetext = (text) => {
  return {
    type: "FILTER_FREETEXT",
    text
  };
};

/**
 * When a new request with a given id is added in future, select it immediately.
 * Used by the "Edit and Resend" feature, where we know in advance the ID of the
 * request, at a time when it wasn't sent yet.
 */
exports.preselectItem = (id) => {
  return {
    type: "PRESELECT_ITEM",
    id
  };
};

exports.selectItem = (id) => {
  return {
    type: "SELECT_ITEM",
    id
  };
};

const PAGE_SIZE_ITEM_COUNT_RATIO = 5;

exports.selectDelta = (delta) => {
  return (dispatch, getState) => {
    const state = getState();
    const requests = getDisplayedRequests(state);
    const itemCount = requests.size;
    const selIndex = state.selectedItem
      ? requests.findIndex(r => r.id == state.selectedItem)
      : -1;

    if (delta == "PAGE_DOWN") {
      delta = Math.ceil(itemCount / PAGE_SIZE_ITEM_COUNT_RATIO);
    } else if (delta == "PAGE_UP") {
      delta = -Math.ceil(itemCount / PAGE_SIZE_ITEM_COUNT_RATIO);
    }

    const newIndex = Math.min(Math.max(0, selIndex + delta), itemCount - 1);
    const newItem = requests.get(newIndex);
    dispatch(exports.selectItem(newItem ? newItem.id : null));
  };
};

exports.resizeWaterfall = (width) => {
  return {
    type: "WATERFALL_RESIZE",
    width
  };
};
