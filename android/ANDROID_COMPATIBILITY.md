# Android WebView compatibility notes

Android WebView adapts content through the CSS viewport, density, and responsive media queries. Android recommends a `width=device-width` viewport and flexible breakpoints; the bundled page already has the viewport tag, and the Android-only stylesheet tunes narrow phones and landscape mode. [Android WebView screen guidance](https://developer.android.com/develop/ui/views/layout/webapps/targeting)

Because this app targets API 35, Android 15 and newer enforce edge-to-edge layout. The activity now applies system-bar and display-cutout insets to its WebView host so controls remain clear of status and navigation areas. [Android edge-to-edge guidance](https://developer.android.com/develop/ui/views/layout/edge-to-edge)

For HTML printing, Android requires the native flow: load the print HTML, wait for `onPageFinished`, keep the WebView alive, create a print adapter, then hand it to `PrintManager`. JavaScript in the print HTML cannot initiate printing. The PDF action now sends the prepared HTML to the Android app through an origin-restricted WebMessageListener, which opens Android's print sheet; older WebViews have a public annotated bridge fallback. [Android HTML printing guidance](https://developer.android.com/training/printing/html-docs) [Android JavaScript bridge guidance](https://developer.android.com/develop/ui/views/layout/webapps/native-api-access-jsbridge)

The app loads its bundled HTML/CSS/JS through `WebViewAssetLoader` on an HTTPS-style app-assets origin, not `file://`. Site UI and code are stored in the APK; novel catalogue/chapter data still comes from the Novel API and requires an internet connection. [Android local WebView content guidance](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)
