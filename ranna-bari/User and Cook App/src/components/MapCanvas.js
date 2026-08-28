import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Platform } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * The map surface, native side: a real WebView.
 *
 * `MapCanvas.web.js` sits beside this file and Metro picks it for the web
 * bundle, because react-native-webview ships no web implementation -- its
 * fallback renders the words "React Native WebView does not support this
 * platform" in red instead of a map.
 *
 * Both sides expose the same imperative handle: `post(obj)`.
 */
const MapCanvas = forwardRef(function MapCanvas(
  { html, onMessage, style, scrollEnabled = true },
  ref,
) {
  const web = useRef(null);

  useImperativeHandle(ref, () => ({
    post: (msg) => web.current?.postMessage(JSON.stringify(msg)),
  }));

  return (
    <WebView
      ref={web}
      originWhitelist={['*']}
      // An https base URL gives the document a secure origin, which Android
      // needs before it will load the remote Leaflet bundle and the tiles.
      source={{ html, baseUrl: 'https://localhost/' }}
      onMessage={onMessage}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={scrollEnabled}
      setSupportMultipleWindows={false}
      allowsInlineMediaPlayback
      androidLayerType={Platform.OS === 'android' ? 'hardware' : undefined}
      style={style}
    />
  );
});

export default MapCanvas;
