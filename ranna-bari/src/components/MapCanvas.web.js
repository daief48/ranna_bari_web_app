import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

/**
 * The map surface, web side: a plain iframe.
 *
 * react-native-webview has no web build, so this stands in. The document
 * itself is unchanged -- it posts through `window.parent` when the
 * ReactNativeWebView bridge is absent, and listens for `message` either way.
 */
const MapCanvas = forwardRef(function MapCanvas(
  { html, onMessage, style },
  ref,
) {
  const frame = useRef(null);

  useImperativeHandle(ref, () => ({
    post: (msg) => frame.current?.contentWindow?.postMessage(JSON.stringify(msg), '*'),
  }));

  useEffect(() => {
    if (!onMessage) return undefined;

    const handler = (event) => {
      // Only listen to our own frame, and only to the string payloads the
      // document sends -- React DevTools and friends share this channel.
      if (frame.current && event.source !== frame.current.contentWindow) return;
      if (typeof event.data !== 'string') return;

      // Shaped like a WebView event so the caller needs no platform branch.
      onMessage({ nativeEvent: { data: event.data } });
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onMessage]);

  const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style || {};

  return (
    <iframe
      ref={frame}
      srcDoc={html}
      title="Kitchen map"
      style={{
        border: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        backgroundColor: flat.backgroundColor,
        flex: flat.flex,
      }}
    />
  );
});

export default MapCanvas;
