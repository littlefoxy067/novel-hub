package com.littlefoxy.novelhub;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.print.PrintDocumentAdapter;
import android.print.PrintJob;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

public final class MainActivity extends Activity {
    private static final String APP_ORIGIN = "https://appassets.androidplatform.net";
    private FrameLayout root;
    private WebView webView;
    private WebView printWebView;
    private final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        root = new FrameLayout(this);
        webView = new WebView(this);
        webView.setBackgroundColor(0xFF07080D);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        webView.addJavascriptInterface(new AndroidPrintBridge(), "NovelHubAndroid");
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
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        webView.loadUrl(APP_ORIGIN + "/");
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

    private final class AndroidPrintBridge {
        @JavascriptInterface
        public void printHtml(String html, String requestedTitle) {
            if (html == null || html.length() > 25_000_000) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "This book is too large to print at once", Toast.LENGTH_LONG).show());
                return;
            }
            runOnUiThread(() -> openPrintSheet(html, requestedTitle));
        }
    }

    private void openPrintSheet(String html, String requestedTitle) {
        if (isFinishing() || isDestroyed()) return;
        if (printWebView != null) {
            root.removeView(printWebView);
            printWebView.destroy();
        }
        printWebView = new WebView(this);
        printWebView.setVisibility(View.INVISIBLE);
        printWebView.getSettings().setJavaScriptEnabled(false);
        root.addView(printWebView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.TOP));
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
                    Toast.makeText(MainActivity.this, "Android printing is unavailable on this device", Toast.LENGTH_LONG).show();
                    return;
                }
                PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(title);
                PrintAttributes attributes = new PrintAttributes.Builder()
                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                        .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                        .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                        .build();
                PrintJob job = manager.print(title, adapter, attributes);
                if (job == null) Toast.makeText(MainActivity.this, "Could not open the Android print sheet", Toast.LENGTH_LONG).show();
            }
        });
        printWebView.loadDataWithBaseURL(APP_ORIGIN + "/", html, "text/html", "UTF-8", null);
    }
}
