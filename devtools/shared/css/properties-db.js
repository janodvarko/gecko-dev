/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * This file contains static lists of CSS properties and values. Some of the small lists
 * are edited manually, while the larger ones are generated by a script. The comments
 * above each list indicates how it should be updated.
 */

let db;

// Allow this require to fail in case it's been deleted in the process of running
// `mach devtools-css-db` to regenerate the database.
try {
  db = require("devtools/shared/css/generated/properties-db");
} catch (error) {
  console.error(`If this error is being displayed and "mach devtools-css-db" is not ` +
                `being run, then it needs to be fixed.`, error);
  db = {
    CSS_PROPERTIES: {},
    PSEUDO_ELEMENTS: []
  };
}

/**
 * All CSS types that properties can support. This list can be manually edited.
 */
exports.CSS_TYPES = {
  "ANGLE": 1,
  "COLOR": 2,
  "FREQUENCY": 3,
  "GRADIENT": 4,
  "IMAGE_RECT": 5,
  "LENGTH": 6,
  "NUMBER": 7,
  "PERCENTAGE": 8,
  "TIME": 9,
  "TIMING_FUNCTION": 10,
  "URL": 11,
};

/**
 * All cubic-bezier CSS timing-function names. This list can be manually edited.
 */
exports.BEZIER_KEYWORDS = ["linear", "ease-in-out", "ease-in", "ease-out", "ease"];

/**
 * Functions that accept a color argument. This list can be manually edited.
 */
exports.COLOR_TAKING_FUNCTIONS = ["linear-gradient", "-moz-linear-gradient",
                                  "repeating-linear-gradient",
                                  "-moz-repeating-linear-gradient", "radial-gradient",
                                  "-moz-radial-gradient", "repeating-radial-gradient",
                                  "-moz-repeating-radial-gradient", "drop-shadow"];

/**
 * Functions that accept an angle argument. This list can be manually edited.
 */
exports.ANGLE_TAKING_FUNCTIONS = ["linear-gradient", "-moz-linear-gradient",
                                  "repeating-linear-gradient",
                                  "-moz-repeating-linear-gradient", "rotate", "rotateX",
                                  "rotateY", "rotateZ", "rotate3d", "skew", "skewX",
                                  "skewY", "hue-rotate"];

/**
 * The list of all CSS Pseudo Elements.
 *
 * This list can be updated with `mach devtools-css-db`.
 */
exports.PSEUDO_ELEMENTS = db.PSEUDO_ELEMENTS;

/**
 * A list of CSS Properties and their various characteristics. This is used on the
 * client-side when the CssPropertiesActor is not found, or when the client and server
 * are the same version. A single property takes the form:
 *
 *  "animation": {
 *    "isInherited": false,
 *    "supports": [ 7, 9, 10 ]
 *  }
 */
exports.CSS_PROPERTIES = db.CSS_PROPERTIES;

exports.CSS_PROPERTIES_DB = {
  properties: db.CSS_PROPERTIES,
  pseudoElements: db.PSEUDO_ELEMENTS
};
