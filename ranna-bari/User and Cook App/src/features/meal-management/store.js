import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useSession } from '../../store/SessionContext';
import * as api from './api';
import { thisMonth } from './format';

/**
 * Meal management — the module's own state.
 *
 * Deliberately not part of `CommerceContext`. That provider is mounted for the
 * whole app and refreshes on every foreground, sign-in and socket event; a
 * feature living behind a profile menu has no business adding six requests to
 * that. This provider is mounted by `app/meal-management/_layout.js`, which
 * means it exists only while somebody is actually inside the feature and is
 * torn down when they leave.
 *
 * What it borrows from the app is one thing: the session token, because the
 * specification asks for one account rather than a second login.
 *
 * Loading is per-slice on purpose. The dashboard is one request that the
 * landing screen awaits; everything else is fetched by the screen that needs
 * it, so opening Preferences does not pull a month of expenses.
 */

const MealManagementContext = createContext(null);

export function MealManagementProvider({ children }) {
  const { token } = useSession();

  const [month, setMonth] = useState(thisMonth);
  const [dashboard, setDashboard] = useState(null);
  const [profile, setProfile] = useState(null);
  const [meals, setMeals] = useState(null);
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState(null);
  const [plan, setPlan] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [recipes, setRecipes] = useState(null);
  const [months, setMonths] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* Which month each slice was fetched for, so a month change refetches rather
     than showing September's figures under an October heading. */
  const fetchedFor = useRef({});

  const reset = useCallback(() => {
    fetchedFor.current = {};
    setMeals(null);
    setSummary(null);
    setExpenses(null);
    setPlan(null);
    setRecommendations(null);
  }, []);

  /* ---------------------------------------------------------------- *
   * loaders
   * ---------------------------------------------------------------- */

  const loadDashboard = useCallback(
    async (forMonth = month) => {
      if (!token) return;
      setLoading(true);
      const out = await api.fetchDashboard(token, forMonth);
      if (out.ok) {
        setDashboard(out.result);
        setError(null);
      } else {
        setError(out.error);
      }
      setLoading(false);
    },
    [token, month],
  );

  const loadProfile = useCallback(async () => {
    if (!token) return null;
    const out = await api.fetchProfile(token);
    if (out.ok) setProfile(out.result);
    return out;
  }, [token]);

  const loadMeals = useCallback(
    async (forMonth = month) => {
      if (!token) return null;
      const out = await api.fetchMeals(token, forMonth);
      if (out.ok) {
        setMeals(out.result);
        fetchedFor.current.meals = forMonth;
      }
      return out;
    },
    [token, month],
  );

  const loadSummary = useCallback(
    async (forMonth = month) => {
      if (!token) return null;
      const out = await api.fetchSummary(token, forMonth);
      if (out.ok) {
        setSummary(out.result);
        fetchedFor.current.summary = forMonth;
      }
      return out;
    },
    [token, month],
  );

  const loadExpenses = useCallback(
    async (forMonth = month) => {
      if (!token) return null;
      const out = await api.fetchExpenses(token, forMonth);
      if (out.ok) {
        setExpenses(out.result);
        fetchedFor.current.expenses = forMonth;
      }
      return out;
    },
    [token, month],
  );

  const loadPlan = useCallback(
    async (forMonth = month) => {
      if (!token) return null;
      const out = await api.fetchPlan(token, forMonth);
      if (out.ok) {
        setPlan(out.result.plan);
        fetchedFor.current.plan = forMonth;
      }
      return out;
    },
    [token, month],
  );

  const loadRecommendations = useCallback(
    async (forMonth = month) => {
      if (!token) return null;
      const out = await api.fetchRecommendations(token, forMonth);
      if (out.ok) setRecommendations(out.result);
      return out;
    },
    [token, month],
  );

  const loadForecast = useCallback(async () => {
    if (!token) return null;
    const out = await api.fetchForecast(token);
    if (out.ok) setForecast(out.result);
    return out;
  }, [token]);

  const loadRecipes = useCallback(async () => {
    if (!token) return null;
    const out = await api.fetchRecipes(token);
    if (out.ok) setRecipes(out.result.recipes);
    return out;
  }, [token]);

  const loadMonths = useCallback(async () => {
    if (!token) return null;
    const out = await api.fetchMonths(token);
    if (out.ok) setMonths(out.result.months);
    return out;
  }, [token]);

  /* The landing screen's one request, plus the month list the picker needs. */
  useEffect(() => {
    if (!token) return;
    loadDashboard();
    loadMonths();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [token, month]);

  /* ---------------------------------------------------------------- *
   * writes
   *
   * Each returns the verdict shape unchanged so a screen can hand it to
   * `useAction()`, and refreshes only the slices its change can have moved.
   * ---------------------------------------------------------------- */

  const setMeal = useCallback(
    async (date, patch) => {
      const out = await api.saveMeal(token, { date, ...patch });
      if (out.ok) await Promise.all([loadMeals(), loadDashboard()]);
      return out;
    },
    [token, loadMeals, loadDashboard],
  );

  const setMealsBulk = useCallback(
    async (body) => {
      const out = await api.saveMealsBulk(token, body);
      if (out.ok) await Promise.all([loadMeals(), loadDashboard()]);
      return out;
    },
    [token, loadMeals, loadDashboard],
  );

  const updateProfile = useCallback(
    async (patch) => {
      const out = await api.saveProfile(token, patch);
      if (out.ok) {
        setProfile(out.result);
        await loadDashboard();
      }
      return out;
    },
    [token, loadDashboard],
  );

  const createExpense = useCallback(
    async (body) => {
      const out = await api.addExpense(token, body);
      if (out.ok) await Promise.all([loadExpenses(), loadDashboard()]);
      return out;
    },
    [token, loadExpenses, loadDashboard],
  );

  const deleteExpense = useCallback(
    async (id) => {
      const out = await api.removeExpense(token, id);
      if (out.ok) await Promise.all([loadExpenses(), loadDashboard()]);
      return out;
    },
    [token, loadExpenses, loadDashboard],
  );

  const updateCategories = useCallback(
    async (categories) => {
      const out = await api.saveCategories(token, categories);
      if (out.ok) await Promise.all([loadExpenses(), loadDashboard()]);
      return out;
    },
    [token, loadExpenses, loadDashboard],
  );

  const settleMonth = useCallback(
    async (forMonth) => {
      const out = await api.closeMonth(token, forMonth);
      if (out.ok) await Promise.all([loadSummary(forMonth), loadDashboard(), loadMonths()]);
      return out;
    },
    [token, loadSummary, loadDashboard, loadMonths],
  );

  const buildPlan = useCallback(
    async (body) => {
      const out = await api.generatePlan(token, body);
      if (out.ok) {
        setPlan(out.result.plan);
        await loadDashboard();
      }
      return out;
    },
    [token, loadDashboard],
  );

  const swapPlanItem = useCallback(
    async (body) => {
      const out = await api.replacePlanItem(token, body);
      if (out.ok) {
        setPlan(out.result.plan);
        await loadDashboard();
      }
      return out;
    },
    [token, loadDashboard],
  );

  const declineSuggestion = useCallback(
    (body) => api.rejectSuggestion(token, body),
    [token],
  );

  const alternativesFor = useCallback(
    (forMonth, index) => api.fetchAlternatives(token, forMonth, index),
    [token],
  );

  const changeMonth = useCallback(
    (next) => {
      setMonth(next);
      reset();
    },
    [reset],
  );

  const value = useMemo(
    () => ({
      /* state */
      month,
      months,
      dashboard,
      profile,
      meals,
      summary,
      expenses,
      plan,
      recommendations,
      forecast,
      recipes,
      loading,
      error,
      signedIn: !!token,

      /* loaders */
      loadDashboard,
      loadProfile,
      loadMeals,
      loadSummary,
      loadExpenses,
      loadPlan,
      loadRecommendations,
      loadForecast,
      loadRecipes,
      loadMonths,

      /* writes */
      setMeal,
      setMealsBulk,
      updateProfile,
      createExpense,
      deleteExpense,
      updateCategories,
      settleMonth,
      buildPlan,
      swapPlanItem,
      declineSuggestion,
      alternativesFor,
      changeMonth,
    }),
    [
      month,
      months,
      dashboard,
      profile,
      meals,
      summary,
      expenses,
      plan,
      recommendations,
      forecast,
      recipes,
      loading,
      error,
      token,
      loadDashboard,
      loadProfile,
      loadMeals,
      loadSummary,
      loadExpenses,
      loadPlan,
      loadRecommendations,
      loadForecast,
      loadRecipes,
      loadMonths,
      setMeal,
      setMealsBulk,
      updateProfile,
      createExpense,
      deleteExpense,
      updateCategories,
      settleMonth,
      buildPlan,
      swapPlanItem,
      declineSuggestion,
      alternativesFor,
      changeMonth,
    ],
  );

  return (
    <MealManagementContext.Provider value={value}>{children}</MealManagementContext.Provider>
  );
}

export function useMealManagement() {
  const ctx = useContext(MealManagementContext);
  if (!ctx) {
    throw new Error('useMealManagement must be used inside the meal-management stack');
  }
  return ctx;
}
