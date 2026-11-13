package app.wordguess;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.HashMap;

/**
 * Shows the game (the files from docs/, packed into the app) in a full-screen
 * web view. The game itself is never loaded from the internet; the only time
 * the app goes online is when "Check for updates" is tapped. The made-up
 * address below only exists so the page has a normal https origin, which
 * keeps saved games and statistics working.
 */
public class MainActivity extends Activity {
    private static final String BASE = "https://wordguess.invalid/";
    private static final int BACKGROUND = 0xFF2B2D31;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BACKGROUND);
        getWindow().setNavigationBarColor(BACKGROUND);

        WebView web = new WebView(this);
        web.setBackgroundColor(BACKGROUND);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);

        web.setWebViewClient(new WebViewClient() {
            // Links that leave the game (the update download) open in the browser.
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request.getUrl().toString().startsWith(BASE)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl()));
                } catch (RuntimeException e) { /* no browser installed */ }
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (!url.startsWith(BASE)) return null;
                String path = url.substring(BASE.length());
                int cut = path.indexOf('?');
                if (cut >= 0) path = path.substring(0, cut);
                cut = path.indexOf('#');
                if (cut >= 0) path = path.substring(0, cut);
                if (path.isEmpty()) path = "index.html";
                try {
                    return new WebResourceResponse(mime(path), encoding(path), getAssets().open("www/" + path));
                } catch (IOException e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                            new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
                }
            }
        });

        setContentView(web);
        web.loadUrl(BASE + "index.html");
    }

    private static String mime(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".txt")) return "text/plain";
        if (path.endsWith(".webmanifest")) return "application/manifest+json";
        return "application/octet-stream";
    }

    private static String encoding(String path) {
        return path.endsWith(".png") ? null : "utf-8";
    }
}
