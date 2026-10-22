# Novel Hub for Android

This Android wrapper bundles the static Novel Hub site and serves it in a secure Android WebView. It is a native Android package, not a PWA shortcut. Novel catalog requests continue to use the existing Novel API.

## Build a debug APK

From the repository root, with Android SDK Platform 35 installed:

```sh
cd android
./sync-web-assets.sh
./gradlew assembleDebug
```

The installable, debug-signed APK is written to `app/build/outputs/apk/debug/app-debug.apk`. It can be installed directly on Android devices after allowing installs from the chosen file manager/browser. Debug signing is suitable for testing and direct installation, not for Play Store publication.

The Android PDF action uses Android's native print sheet. Choose **Save as PDF** there to save the generated reading edition.
