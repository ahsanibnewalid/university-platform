package com.campushub.portal

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView

/**
 * Interim Android host for the existing, authenticated CampusHub website.
 * All authorization remains on the Next.js server. Do not treat this shell
 * as a replacement for a native API or mobile security review.
 */
class MainActivity : Activity() {
    private lateinit var webView: WebView
    private val portal = Uri.parse(BuildConfig.PORTAL_URL)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (portal.host == "example.edu") {
            val message = TextView(this).apply {
                text = "Set PORTAL_URL to your deployed HTTPS CampusHub website before running the Android app."
                textSize = 18f
                setPadding(36, 60, 36, 36)
            }
            setContentView(message)
            return
        }
        val container = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { isIndeterminate = true }
        webView = WebView(this)
        webView.settings.javaScriptEnabled = true // Next.js client navigation requires JS
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        webView.settings.setSupportMultipleWindows(false)
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)
        webView.setBackgroundColor(Color.WHITE)
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.scheme == "https" && uri.host.equals(portal.host, ignoreCase = true) &&
                    uri.port == portal.port) return false
                if (uri.scheme == "https" || uri.scheme == "mailto" || uri.scheme == "tel") {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                }
                return true
            }
            override fun onPageFinished(view: WebView, url: String) {
                progress.visibility = ProgressBar.GONE
            }
        }
        container.addView(progress, LinearLayout.LayoutParams(-1, 4))
        container.addView(webView, LinearLayout.LayoutParams(-1, 0, 1f))
        setContentView(container)
        webView.loadUrl(BuildConfig.PORTAL_URL)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack()
        else super.onBackPressed()
    }

    override fun onDestroy() {
        if (::webView.isInitialized) {
            webView.destroy()
        }
        super.onDestroy()
    }
}
