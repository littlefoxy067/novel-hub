# Novel Hub for Android

This APK contains its own HTML, CSS, and JavaScript interface and serves it from Android app assets using `WebViewAssetLoader`. It does not load the site from GitHub or from the hosted website. The Android bundle removes the website-install prompt, PWA manifest/service-worker setup, and remote Google Fonts import; it adds Android phone/landscape touch refinements. JavaScript assets are minified and release bytecode is minimized and obfuscated with R8.

Novel listings, covers, and chapter text still come from the existing Novel API, so current catalogue content requires an internet connection. The APK does not download all novels into itself. Minification/obfuscation makes casual inspection harder, but does not make client-side code secret.

## Build a directly installable APK

With Android SDK Platform 35, Java 21, Node.js/npm, and an internet connection available for build dependencies:

```sh
cd android
./sync-web-assets.sh
./gradlew assembleRelease
```

The directly installable APK is written to `app/build/outputs/apk/release/app-release.apk`. It is signed with the Android debug key for direct testing/installation, not for Google Play distribution. A production Play Store release needs a private production signing key.

The PDF action opens Android's native print sheet. Select **Save as PDF**, then select the destination in Android's file picker. The app waits for the print WebView to finish loading and invokes Android's native print API.
