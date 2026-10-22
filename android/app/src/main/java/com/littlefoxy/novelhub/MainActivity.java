package com.littlefoxy.novelhub;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Collections;

public final class MainActivity extends Activity {
    private static final String APP_ORIGIN = "https://appassets.androidplatform.net";
    private static final int MAX_PRINT_HTML_CHARS = 25_000_000;

    private FrameLayout root;
    private WebView webView;
    private WebView printWebView;
    private final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        if (Build.VERSION.SDK_INT < 35) WindowCompat.setDecorFitsSystemWindows(window, true);
        window.setStatusBarColor(Color.rgb(7, 8, 13));
        window.setNavigationBarColor(Color.rgb(7, 8, 13));

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(7, 8, 13));
        if (Build.VERSION.SDK_INT >= 35) {
            ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
                Insets safe = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                        | WindowInsetsCompat.Type.displayCutout());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return insets;
            });
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(7, 8, 13));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUserAgentString(settings.getUserAgentString() + " NovelHubAndroidApp/1");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!APP_ORIGIN.equals(uri.getScheme() + "://" + uri.getHost())) return null;
                String path = uri.getPath();
                if (path == null || path.isEmpty() || path.equals("/") || isSpaRoute(path)) {
                    path = "/index.html";
                }
                return assetLoader.shouldInterceptRequest(Uri.parse(APP_ORIGIN + "/assets" + path));
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (APP_ORIGIN.equals(uri.getScheme() + "://" + uri.getHost())) return false;
                String scheme = uri.getScheme();
                if ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (Exception ignored) { Toast.makeText(MainActivity.this, "No app can open this link", Toast.LENGTH_SHORT).show(); }
                }
                return true;
            }
        });
        installPrintBridge();
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        WindowCompat.getInsetsController(window, root).setAppearanceLightStatusBars(false);
        WindowCompat.getInsetsController(window, root).setAppearanceLightNavigationBars(false);
        if (Build.VERSION.SDK_INT >= 35) ViewCompat.requestApplyInsets(root);
        webView.loadUrl(APP_ORIGIN + "/");
    }

    private void installPrintBridge() {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, "NovelHubAndroid",
                    Collections.singleton(APP_ORIGIN), (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                        if (!isMainFrame || sourceOrigin == null || !APP_ORIGIN.equals(sourceOrigin.toString())) return;
                        handlePrintMessage(message);
                    });
        } else {
            webView.addJavascriptInterface(new AndroidPrintBridge(), "NovelHubAndroid");
        }
    }

    private void handlePrintMessage(WebMessageCompat message) {
        if (message == null || message.getData() == null || message.getData().length() > MAX_PRINT_HTML_CHARS + 4096) {
            showPrintError("This book is too large to print at once");
            return;
        }
        try {
            JSONObject request = new JSONObject(message.getData());
            if (!"printHtml".equals(request.optString("action"))) return;
            openPrintSheet(request.optString("html"), request.optString("title"));
        } catch (JSONException exception) {
            showPrintError("The reading copy could not be prepared. Please try again.");
        }
    }

    private boolean isSpaRoute(String path) {
        return path.matches("^/(novel|chapter|search|genres|shelf)(/.*)?$");
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) webView.destroy();
        if (printWebView != null) printWebView.destroy();
        super.onDestroy();
    }

    private void showPrintError(String message) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show());
    }

    public final class AndroidPrintBridge {
        @JavascriptInterface
        public void printHtml(String html, String requestedTitle) {
            if (html == null || html.length() > MAX_PRINT_HTML_CHARS) {
                showPrintError("This book is too large to print at once");
                return;
            }
            runOnUiThread(() -> openPrintSheet(html, requestedTitle));
        }
    }

    private void openPrintSheet(String html, String requestedTitle) {
        if (isFinishing() || isDestroyed()) return;
        if (html == null || html.isEmpty() || html.length() > MAX_PRINT_HTML_CHARS) {
            showPrintError("The reading copy is empty or too large to print");
            return;
        }
        try {
            if (printWebView != null) {
                root.removeView(printWebView);
                printWebView.destroy();
            }
            printWebView = new WebView(this);
            printWebView.setVisibility(View.INVISIBLE);
            printWebView.getSettings().setJavaScriptEnabled(false);
            root.addView(printWebView, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            final String title = requestedTitle == null || requestedTitle.trim().isEmpty()
                    ? "Novel Hub reading copy" : requestedTitle.replaceAll("[\\r\\n]", " ").trim();
            printWebView.setWebViewClient(new WebViewClient() {
                private boolean submitted;

                @Override
                public void onPageFinished(WebView view, String url) {
                    if (submitted) return;
                    submitted = true;
                    PrintManager manager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                    if (manager == null) {
                        showPrintError("Android printing is unavailable on this device");
                        return;
                    }
                    try {
                        PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(title);
                        PrintAttributes attributes = new PrintAttributes.Builder()
                                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                .build();
                        manager.print(title, adapter, attributes);
                    } catch (RuntimeException exception) {
                        showPrintError("Could not open Android printing. Please try again.");
                    }
                }
            });
            printWebView.loadDataWithBaseURL(APP_ORIGIN + "/", html, "text/html", "UTF-8", null);
        } catch (RuntimeException exception) {
            showPrintError("Could not open Android printing. Please try again.");
        }
    }
}
