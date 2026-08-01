package io.github.ganzinn.dejaword

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/**
 * 本番サイトを表示する WebView シェル（docs/adr/0073-webview-android-app.md）。
 * TWA と違い Chrome に依存しないため、ファミリーリンクで Chrome を制限しても動作する。
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var ttsBridge: TtsBridge

    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            // キャンセル時は parseResult が null を返す。null を渡して選択待ちを解除しないと
            // 以後の <input type="file"> が無反応になる
            fileChooserCallback?.onReceiveValue(
                WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data),
            )
            fileChooserCallback = null
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)

        // targetSdk 35 の edge-to-edge: システムバー・IME の分だけ root に padding を入れて
        // WebView を安全領域内に収める（WebView 自身への padding は描画に反映されないため
        // 親側で処理する。Web 側も viewport-fit=cover 非対応）。padding で見える帯は
        // サイト背景と同色の page_background（DayNight 連動）
        val root = FrameLayout(this).apply {
            setBackgroundColor(getColor(R.color.page_background))
        }
        webView = buildWebView()
        root.addView(
            webView,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime(),
            )
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        setContentView(root)

        // 端末の戻る操作は WebView 履歴へ流す。クイズ中断ガード（quiz-flow.tsx の
        // popstate ダミー履歴 + window.confirm）はこの経路でそのまま機能する
        onBackPressedDispatcher.addCallback(this) {
            if (webView.canGoBack()) {
                webView.goBack()
            } else {
                isEnabled = false
                onBackPressedDispatcher.onBackPressed()
                isEnabled = true
            }
        }

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(APP_URL)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildWebView(): WebView = WebView(this).apply {
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        // クイズの発音自動再生（ADR-0047）はユーザージェスチャなしの audio.play()
        settings.mediaPlaybackRequiresUserGesture = false
        // Better Auth のセッション cookie を保持する（既定 true だが前提なので明示）
        CookieManager.getInstance().setAcceptCookie(true)

        // WebView は speechSynthesis 非対応のため、ネイティブ TTS を src/lib/speech.ts へ
        // 橋渡しする。loadUrl より前に注入すること（初回ページから参照される）
        ttsBridge = TtsBridge(this@MainActivity) { script ->
            runOnUiThread { evaluateJavascript(script, null) }
        }
        addJavascriptInterface(ttsBridge, "DejaWordTts")

        webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
                val url = request.url
                if (url.host == APP_HOST && url.scheme == "https") return false
                // 外部リンクは OS へ委譲する。Chrome 制限端末ではハンドラ不在があり得る
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                    true
                } catch (_: ActivityNotFoundException) {
                    Toast.makeText(
                        this@MainActivity,
                        getString(R.string.no_link_handler),
                        Toast.LENGTH_SHORT,
                    ).show()
                    true
                }
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError,
            ) {
                if (request.isForMainFrame) {
                    view.loadDataWithBaseURL(APP_URL, OFFLINE_HTML, "text/html", "utf-8", null)
                }
            }

            override fun onRenderProcessGone(
                view: WebView,
                detail: RenderProcessGoneDetail,
            ): Boolean {
                // レンダラ死亡でプロセスごと落とさず、Activity を作り直して復帰する
                (view.parent as? ViewGroup)?.removeView(view)
                view.destroy()
                recreate()
                return true
            }
        }

        // WebChromeClient を設定することで window.confirm / alert の既定ダイアログが有効になる
        // （クイズ中断ガードが依存。実機で出ない場合は onJsConfirm を明示実装する）
        webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams,
            ): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = filePathCallback
                return try {
                    fileChooserLauncher.launch(fileChooserParams.createIntent())
                    true
                } catch (_: ActivityNotFoundException) {
                    fileChooserCallback = null
                    false
                }
            }
        }

        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }
    }

    override fun onPause() {
        super.onPause()
        // セッション cookie をディスクへ確定させる（強制終了後もサインイン状態を維持）
        CookieManager.getInstance().flush()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        // 画面回転・プロセス kill 復帰用（configChanges で回避しないのは、uiMode を
        // 固定するとダークモード追従が壊れるため）
        webView.saveState(outState)
    }

    override fun onDestroy() {
        ttsBridge.shutdown()
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val APP_HOST = "deja-word.su-dx.com"
        private const val APP_URL = "https://$APP_HOST/"
        private const val BACKGROUND_COLOR = "#18181B"

        // メインフレームのロード失敗（オフライン等）時の最小フォールバック
        private val OFFLINE_HTML = """
            <!doctype html>
            <html lang="ja">
            <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>DejaWord</title>
            <style>
            body { background: $BACKGROUND_COLOR; color: #fafafa; font-family: sans-serif;
                   display: grid; place-items: center; min-height: 100vh; margin: 0; }
            a { color: #a1a1aa; }
            </style>
            </head>
            <body>
            <div style="text-align:center">
            <p>接続できませんでした。</p>
            <p><a href="$APP_URL">再読み込み</a></p>
            </div>
            </body>
            </html>
        """.trimIndent()
    }
}
