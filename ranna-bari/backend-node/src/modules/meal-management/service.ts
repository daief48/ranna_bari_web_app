/**
 * Meal management, as operations.
 *
 * One import surface over the service modules under `service/`, so the route
 * file reads as `mm.setMeal(...)` throughout regardless of which file the rule
 * happens to live in. The split behind this barrel follows the specification's
 * own sections rather than any technical seam — mess, meals, bazar, money,
 * closing, reports, board, insights — because that is the axis along which
 * this feature actually changes.
 *
 * Nothing outside this module imports any of it. The route file is the only
 * consumer, and it is in this directory.
 */

export * from './service/context.js';
export * from './service/attachments.js';
export * from './service/mess.js';
export * from './service/meals.js';
export * from './service/bazar.js';
export * from './service/money.js';
export * from './service/closing.js';
export * from './service/reports.js';
export * from './service/board.js';
export * from './service/insights.js';
