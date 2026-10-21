'use strict';
const TARGETS = [require('./claude'), require('./codex'), require('./cursor'), require('./gemini'), require('./opencode')];
const byId = (id) => TARGETS.find((t) => t.id === id);
module.exports = { TARGETS, byId };
