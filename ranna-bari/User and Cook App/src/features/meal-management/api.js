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
 */

const withMonth = (path, month) =>
  month ? `${path}${path.includes('?') ? '&' : '?'}month=${encodeURIComponent(month)}` : path;

/* ------------------------------------------------------------------ *
 * reads
 * ------------------------------------------------------------------ */

export const fetchDashboard = (token, month) =>
  call(withMonth('/meal-management/dashboard', month), { token });

export const fetchMeals = (token, month) =>
  call(withMonth('/meal-management/meals', month), { token });

export const fetchProfile = (token) => call('/meal-management/profile', { token });

export const fetchSummary = (token, month) =>
  call(withMonth('/meal-management/monthly-summary', month), { token });

export const fetchRate = (token, month) => call(withMonth('/meal-management/rate', month), { token });

export const fetchExpenses = (token, month) =>
  call(withMonth('/meal-management/expenses', month), { token });

export const fetchCategories = (token) => call('/meal-management/categories', { token });

export const fetchPlan = (token, month) =>
  call(withMonth('/meal-management/smart-plan', month), { token });

export const fetchAlternatives = (token, month, index) =>
  call(
    `/meal-management/smart-plan/alternatives?month=${encodeURIComponent(month)}&index=${index}`,
    { token },
  );

export const fetchRecommendations = (token, month) =>
  call(withMonth('/meal-management/recommendations', month), { token });

export const fetchForecast = (token) => call('/meal-management/forecast', { token });

export const fetchInsights = (token, month) =>
  call(withMonth('/meal-management/insights', month), { token });

export const fetchRecipes = (token, slot) =>
  call(slot ? `/meal-management/recipes?slot=${encodeURIComponent(slot)}` : '/meal-management/recipes', {
    token,
  });

export const fetchFoods = (token) => call('/meal-management/foods', { token });

export const fetchMonths = (token) => call('/meal-management/months', { token });

export const fetchNotices = (token) => call('/meal-management/notices', { token });

/* ------------------------------------------------------------------ *
 * writes
 * ------------------------------------------------------------------ */

export const saveMeal = (token, body) =>
  call('/meal-management/meals', { method: 'POST', token, body });

export const saveMealsBulk = (token, body) =>
  call('/meal-management/meals/bulk', { method: 'POST', token, body });

export const saveProfile = (token, body) =>
  call('/meal-management/profile', { method: 'POST', token, body });

export const addExpense = (token, body) =>
  call('/meal-management/expenses', { method: 'POST', token, body });

export const removeExpense = (token, id) =>
  call(`/meal-management/expenses/${encodeURIComponent(id)}/remove`, {
    method: 'POST',
    token,
    /* A bodyless POST still has to carry `{}` — Fastify rejects a JSON
       content-type with nothing behind it before the handler ever runs. */
    body: {},
  });

export const saveCategories = (token, categories) =>
  call('/meal-management/settings/categories', { method: 'POST', token, body: { categories } });

export const closeMonth = (token, month) =>
  call('/meal-management/month/close', { method: 'POST', token, body: { month } });

export const generatePlan = (token, body) =>
  call('/meal-management/smart-plan/generate', { method: 'POST', token, body });

export const replacePlanItem = (token, body) =>
  call('/meal-management/smart-plan/replace', { method: 'POST', token, body });

export const rejectSuggestion = (token, body) =>
  call('/meal-management/smart-plan/reject', { method: 'POST', token, body });

export const readNotices = (token) =>
  call('/meal-management/notices/read', { method: 'POST', token, body: {} });
