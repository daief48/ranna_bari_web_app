/**
 * Stands in for `@expo-google-fonts/material-symbols`.
 *
 * `expo-router` reaches for Material Symbols through `expo-symbols` so that a
 * *native* tab bar can draw a Material icon by name. Neither bar in this app
 * is native — the customer bar and the cook bar are both custom `tabBar`
 * components drawing the app's own SVG icons — so nothing ever asks for one.
 * Metro bundled the 940 KB font anyway, because the import chain is static and
 * Metro does not tree-shake.
 *
 * The consumer only holds the reference:
 *
 *     const weight = { name: 'MaterialSymbols_400Regular', font: <this> };
 *
 * so an empty module leaves `font` undefined and nothing evaluates it. It
 * would only matter if `unstable_getMaterialSymbolSourceAsync` were called,
 * which needs a native tab to call it.
 *
 * Remove this, and the mapping in `metro.config.js`, the day this app adopts
 * native tabs.
 */
module.exports = {};
