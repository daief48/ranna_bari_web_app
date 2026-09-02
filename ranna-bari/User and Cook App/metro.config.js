const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/* Material Symbols is 940 KB of font this app never draws. See
   src/lib/noMaterialSymbols.js for why it is safe to leave out. */
const STUB = require.resolve('./src/lib/noMaterialSymbols.js');
const DROP = '@expo-google-fonts/material-symbols';

const inherited = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === DROP || moduleName.startsWith(DROP + '/')) {
    return { type: 'sourceFile', filePath: STUB };
  }
  return (inherited ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
