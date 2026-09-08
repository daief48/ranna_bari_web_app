import { call } from '../../lib/server';

/**
 * Meal management — the module's own wire layer.
 *
 * Every path here is a leaf of `/meal-management`, and nothing else in the app
 * calls them. The only thing borrowed from the rest of the codebase is
 * `call()`, which is the shared HTTP client and stays exactly as it is: it
 * already handles the bearer header, the bodyless-POST content-type rule that
 * Fastify insists on, and the `{ ok, result } | { ok: false, error }` verdict
 * shape every screen in this app branches on.
 *
 * Reusing it is deliberate. A second HTTP client would mean a second place for
 * the session-expiry broadcast and the offline distinction to be got right.
 *
 * Every call carries the mess id, because a person can keep more than one set
 * of books (§4.1 does not cap it) and the server refuses anything it cannot
 * prove the caller belongs to. It rides the query on a read and the body on a
 * write, so no caller has to remember which.
 */

/** A query string from whatever was actually given. */
const query = (params = {}) => {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

const get = (token, path, params) => call(`${path}${query(params)}`, { token });

/* A bodyless POST still has to carry `{}` — Fastify rejects a JSON
   content-type with nothing behind it before the handler ever runs. */
const post = (token, path, body) => call(path, { method: 'POST', token, body: body ?? {} });

const id = (value) => encodeURIComponent(String(value));

/* ================================================================== *
 * §4.1 — messes, members, settings
 * ================================================================== */

export const fetchMesses = (token) => get(token, '/meal-management/messes');

export const createMess = (token, body) => post(token, '/meal-management/messes', body);

export const joinMess = (token, code) => post(token, '/meal-management/messes/join', { code });

export const cancelJoin = (token, messId) =>
  post(token, '/meal-management/messes/join/cancel', { messId });

export const fetchMembers = (token, messId) => get(token, '/meal-management/members', { messId });

export const fetchMemberHistory = (token, messId) =>
  get(token, '/meal-management/members/history', { messId });

export const addGhostMember = (token, messId, body) =>
  post(token, '/meal-management/members/ghost', { ...body, messId });

export const updateMember = (token, messId, memberId, body) =>
  post(token, `/meal-management/members/${id(memberId)}`, { ...body, messId });

export const transferOwnership = (token, messId, memberId) =>
  post(token, `/meal-management/members/${id(memberId)}/transfer`, { messId });

export const leaveMess = (token, messId) => post(token, '/meal-management/leave-mess', { messId });

export const fetchInvites = (token, messId) => get(token, '/meal-management/invites', { messId });

export const createInvite = (token, messId, body) =>
  post(token, '/meal-management/invites', { ...body, messId });

export const revokeInvite = (token, messId, inviteId) =>
  post(token, `/meal-management/invites/${id(inviteId)}/revoke`, { messId });

export const fetchJoinRequests = (token, messId) =>
  get(token, '/meal-management/join-requests', { messId });

export const decideJoinRequest = (token, messId, requestId, approve) =>
  post(token, `/meal-management/join-requests/${id(requestId)}/decide`, { messId, approve });

export const fetchSettings = (token, messId) => get(token, '/meal-management/settings', { messId });

export const saveSettings = (token, messId, body) =>
  post(token, '/meal-management/settings', { ...body, messId });

export const saveMealType = (token, messId, body) =>
  post(token, '/meal-management/settings/meal-types', { ...body, messId });

export const removeMealType = (token, messId, key) =>
  post(token, `/meal-management/settings/meal-types/${id(key)}/remove`, { messId });

export const archiveMess = (token, messId) =>
  post(token, '/meal-management/settings/archive', { messId });

export const saveProfile = (token, messId, body) =>
  post(token, '/meal-management/profile', { ...body, messId });

/* ================================================================== *
 * §4.2 — meals
 * ================================================================== */

export const fetchMeals = (token, messId, month, memberId) =>
  get(token, '/meal-management/meals', { messId, month, memberId });

export const fetchToday = (token, messId) => get(token, '/meal-management/meals/today', { messId });

export const fetchDay = (token, messId, date) =>
  get(token, '/meal-management/meals/day', { messId, date });

export const fetchMealHistory = (token, messId, params) =>
  get(token, '/meal-management/meals/history', { messId, ...params });

export const setMeal = (token, messId, body) =>
  post(token, '/meal-management/meals', { ...body, messId });

export const setMealsBulk = (token, messId, body) =>
  post(token, '/meal-management/meals/bulk', { ...body, messId });

export const fetchCorrections = (token, messId, status) =>
  get(token, '/meal-management/meals/requests', { messId, status });

export const requestCorrection = (token, messId, body) =>
  post(token, '/meal-management/meals/requests', { ...body, messId });

export const decideCorrection = (token, messId, requestId, approve, note) =>
  post(token, `/meal-management/meals/requests/${id(requestId)}/decide`, { messId, approve, note });

export const fetchLeaves = (token, messId, memberId) =>
  get(token, '/meal-management/leaves', { messId, memberId });

export const addLeave = (token, messId, body) =>
  post(token, '/meal-management/leaves', { ...body, messId });

export const cancelLeave = (token, messId, leaveId) =>
  post(token, `/meal-management/leaves/${id(leaveId)}/cancel`, { messId });

/* ================================================================== *
 * §4.3 — bazar
 * ================================================================== */

export const fetchBazars = (token, messId, params) =>
  get(token, '/meal-management/bazar', { messId, ...params });

export const fetchBazar = (token, messId, bazarId) =>
  get(token, `/meal-management/bazar/${id(bazarId)}`, { messId });

export const createBazar = (token, messId, body) =>
  post(token, '/meal-management/bazar', { ...body, messId });

export const updateBazar = (token, messId, bazarId, body) =>
  post(token, `/meal-management/bazar/${id(bazarId)}`, { ...body, messId });

export const submitBazar = (token, messId, bazarId) =>
  post(token, `/meal-management/bazar/${id(bazarId)}/submit`, { messId });

export const decideBazar = (token, messId, bazarId, approve, note) =>
  post(token, `/meal-management/bazar/${id(bazarId)}/decide`, { messId, approve, note });

export const removeBazar = (token, messId, bazarId) =>
  post(token, `/meal-management/bazar/${id(bazarId)}/remove`, { messId });

export const fetchDuties = (token, messId, params) =>
  get(token, '/meal-management/bazar/duty', { messId, ...params });

export const assignDuty = (token, messId, body) =>
  post(token, '/meal-management/bazar/duty', { ...body, messId });

export const rotateDuty = (token, messId, body) =>
  post(token, '/meal-management/bazar/duty/rotate', { ...body, messId });

export const updateDuty = (token, messId, dutyId, body) =>
  post(token, `/meal-management/bazar/duty/${id(dutyId)}`, { ...body, messId });

export const removeDuty = (token, messId, dutyId) =>
  post(token, `/meal-management/bazar/duty/${id(dutyId)}/remove`, { messId });

export const fetchBazarSummary = (token, messId, month) =>
  get(token, '/meal-management/bazar/summary', { messId, month });

export const fetchBazarSuggestions = (token, messId) =>
  get(token, '/meal-management/bazar/suggestions', { messId });

/* ================================================================== *
 * §4.4, §4.5 — money
 * ================================================================== */

export const fetchCategories = (token, messId) =>
  get(token, '/meal-management/categories', { messId });

export const saveCategory = (token, messId, body) =>
  post(token, '/meal-management/categories', { ...body, messId });

export const removeCategory = (token, messId, key) =>
  post(token, `/meal-management/categories/${id(key)}/remove`, { messId });

export const fetchExpenses = (token, messId, params) =>
  get(token, '/meal-management/expenses', { messId, ...params });

export const fetchExpense = (token, messId, expenseId) =>
  get(token, `/meal-management/expenses/${id(expenseId)}`, { messId });

export const createExpense = (token, messId, body) =>
  post(token, '/meal-management/expenses', { ...body, messId });

export const updateExpense = (token, messId, expenseId, body) =>
  post(token, `/meal-management/expenses/${id(expenseId)}`, { ...body, messId });

export const submitExpense = (token, messId, expenseId) =>
  post(token, `/meal-management/expenses/${id(expenseId)}/submit`, { messId });

export const decideExpense = (token, messId, expenseId, approve, note) =>
  post(token, `/meal-management/expenses/${id(expenseId)}/decide`, { messId, approve, note });

export const removeExpense = (token, messId, expenseId) =>
  post(token, `/meal-management/expenses/${id(expenseId)}/remove`, { messId });

export const fetchDeposits = (token, messId, params) =>
  get(token, '/meal-management/deposits', { messId, ...params });

export const addDeposit = (token, messId, body) =>
  post(token, '/meal-management/deposits', { ...body, messId });

export const decideDeposit = (token, messId, depositId, approve, note) =>
  post(token, `/meal-management/deposits/${id(depositId)}/decide`, { messId, approve, note });

export const removeDeposit = (token, messId, depositId) =>
  post(token, `/meal-management/deposits/${id(depositId)}/remove`, { messId });

export const fetchBalance = (token, messId, month) =>
  get(token, '/meal-management/balance', { messId, month });

/* ================================================================== *
 * §4.6, §4.8 — the month
 * ================================================================== */

export const fetchMonths = (token, messId) => get(token, '/meal-management/months', { messId });

export const fetchSummary = (token, messId, month) =>
  get(token, '/meal-management/summary', { messId, month });

export const fetchClosingReview = (token, messId, month) =>
  get(token, '/meal-management/month/review', { messId, month });

export const openMonth = (token, messId, month) =>
  post(token, '/meal-management/month/open', { messId, month });

export const closeMonth = (token, messId, month) =>
  post(token, '/meal-management/month/close', { messId, month });

export const archiveMonth = (token, messId, month) =>
  post(token, '/meal-management/month/archive', { messId, month });

export const fetchAdjustments = (token, messId, month) =>
  get(token, '/meal-management/month/adjustments', { messId, month });

export const postAdjustment = (token, messId, body) =>
  post(token, '/meal-management/month/adjustments', { ...body, messId });

/* ================================================================== *
 * §4.9 — reports
 * ================================================================== */

const report = (name) => (token, messId, month) =>
  get(token, `/meal-management/reports/${name}`, { messId, month });

export const fetchMealReport = report('meals');
export const fetchExpenseReport = report('expenses');
export const fetchBazarReport = report('bazar');
export const fetchDepositReport = report('deposits');
export const fetchBills = report('bills');
export const fetchRateReport = report('rate');
export const fetchSettlement = report('settlement');
export const fetchMessStatement = report('mess');

export const fetchMemberStatement = (token, messId, month, memberId) =>
  get(token, '/meal-management/reports/statement', { messId, month, memberId });

export const fetchActivity = (token, messId, params) =>
  get(token, '/meal-management/reports/activity', { messId, ...params });

export const fetchExport = (token, messId, kind, month) =>
  get(token, '/meal-management/reports/export', { messId, kind, month });

export const fetchPrintable = (token, messId, month) =>
  get(token, '/meal-management/reports/print', { messId, month });

/* ================================================================== *
 * §4.10 – §4.14 — notifications, board, menu, cook
 * ================================================================== */

export const fetchNotifications = (token, messId, limit) =>
  get(token, '/meal-management/notifications', { messId, limit });

export const readNotifications = (token, messId, ids) =>
  post(token, '/meal-management/notifications/read', { messId, ids });

export const fetchNotices = (token, messId) => get(token, '/meal-management/notices', { messId });

export const saveNotice = (token, messId, body) =>
  post(token, '/meal-management/notices', { ...body, messId });

export const readNotice = (token, messId, noticeId) =>
  post(token, `/meal-management/notices/${id(noticeId)}/read`, { messId });

export const removeNotice = (token, messId, noticeId) =>
  post(token, `/meal-management/notices/${id(noticeId)}/remove`, { messId });

export const fetchPolls = (token, messId) => get(token, '/meal-management/polls', { messId });

export const createPoll = (token, messId, body) =>
  post(token, '/meal-management/polls', { ...body, messId });

export const votePoll = (token, messId, pollId, optionIds) =>
  post(token, `/meal-management/polls/${id(pollId)}/vote`, { messId, optionIds });

export const closePoll = (token, messId, pollId) =>
  post(token, `/meal-management/polls/${id(pollId)}/close`, { messId });

export const removePoll = (token, messId, pollId) =>
  post(token, `/meal-management/polls/${id(pollId)}/remove`, { messId });

export const fetchMenu = (token, messId, params) =>
  get(token, '/meal-management/menu', { messId, ...params });

export const saveMenu = (token, messId, body) =>
  post(token, '/meal-management/menu', { ...body, messId });

export const rateMenu = (token, messId, menuId, rating, comment) =>
  post(token, `/meal-management/menu/${id(menuId)}/rate`, { messId, rating, comment });

export const removeMenu = (token, messId, menuId) =>
  post(token, `/meal-management/menu/${id(menuId)}/remove`, { messId });

export const fetchSuggestions = (token, messId) =>
  get(token, '/meal-management/menu/suggestions', { messId });

export const addSuggestion = (token, messId, body) =>
  post(token, '/meal-management/menu/suggestions', { ...body, messId });

export const backSuggestion = (token, messId, suggestionId) =>
  post(token, `/meal-management/menu/suggestions/${id(suggestionId)}/back`, { messId });

export const fetchCooks = (token, messId) => get(token, '/meal-management/cooks', { messId });

export const saveCook = (token, messId, body) =>
  post(token, '/meal-management/cooks', { ...body, messId });

export const fetchCookMonth = (token, messId, cookId, month) =>
  get(token, `/meal-management/cooks/${id(cookId)}`, { messId, month });

export const recordCookDay = (token, messId, body) =>
  post(token, '/meal-management/cooks/attendance', { ...body, messId });

export const payCook = (token, messId, body) =>
  post(token, '/meal-management/cooks/pay', { ...body, messId });

/* ================================================================== *
 * §4.7, §4.15, §4.16 — dashboard, assistant, analytics
 * ================================================================== */

export const fetchDashboard = (token, messId, month) =>
  get(token, '/meal-management/dashboard', { messId, month });

export const fetchAnalytics = (token, messId, month) =>
  get(token, '/meal-management/analytics', { messId, month });

export const fetchExpenseInsights = (token, messId, month) =>
  get(token, '/meal-management/insights/expenses', { messId, month });

export const fetchPrediction = (token, messId, date) =>
  get(token, '/meal-management/insights/prediction', { messId, date });

export const fetchWaste = (token, messId, month) =>
  get(token, '/meal-management/insights/waste', { messId, month });

export const fetchAssistant = (token, messId) =>
  get(token, '/meal-management/assistant', { messId });

export const askAssistant = (token, messId, text) =>
  post(token, '/meal-management/assistant', { messId, text });

export const confirmAssistant = (token, messId, proposalId) =>
  post(token, '/meal-management/assistant/confirm', { messId, proposalId });

/* ================================================================== *
 * the mess room
 * ================================================================== */

export const fetchMessages = (token, messId, params) =>
  get(token, '/meal-management/messages', { messId, ...params });

export const sendMessage = (token, messId, body) =>
  post(token, '/meal-management/messages', { ...body, messId });

export const readMessages = (token, messId) =>
  post(token, '/meal-management/messages/read', { messId });

export const hideMessage = (token, messId, messageId) =>
  post(token, `/meal-management/messages/${id(messageId)}/hide`, { messId });

/* ================================================================== *
 * attachments
 * ================================================================== */

export const fetchAttachment = (token, messId, attachmentId) =>
  get(token, `/meal-management/attachments/${id(attachmentId)}`, { messId });
