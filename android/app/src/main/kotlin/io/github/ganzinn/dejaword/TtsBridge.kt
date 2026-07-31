package io.github.ganzinn.dejaword

import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.webkit.JavascriptInterface
import org.json.JSONObject
import java.util.Locale

/**
 * Android TextToSpeech を JS へ橋渡しする。WebView は window.speechSynthesis 非対応
 * （crbug 40468168）のため、Web 側 `src/lib/speech.ts` が `window.DejaWordTts` として
 * このブリッジを優先利用する。
 *
 * JS 側との契約（変更時は speech.ts と同時に更新し、アプリ再配布が必要）:
 * - speak(text, id) / cancel() / isAvailable() を公開する。
 * - イベントは `window.__dejaWordTtsDispatch(id, "start"|"end"|"error", detail)` で返す。
 * - 意図的な中断（cancel / QUEUE_FLUSH による差し替え）は "error" ではなく "end" で返す
 *   （speech.ts の「cancel では onError を呼ばない」契約をネイティブ側で保証する）。
 */
class TtsBridge(context: Context, private val evalJs: (String) -> Unit) {

    private enum class State { INITIALIZING, READY, UNAVAILABLE }

    @Volatile
    private var state = State.INITIALIZING

    // エンジン初期化（非同期・数百 ms）前に届いた speak の最新 1 件。起動直後の
    // クイズ自動読み上げを取りこぼさないために保留し、init 完了時に発話する
    private var pending: Pair<String, String>? = null

    private val tts: TextToSpeech

    init {
        tts = TextToSpeech(context) { status -> onTtsInit(status) }
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = dispatch(utteranceId, "start", "")

            override fun onDone(utteranceId: String?) = dispatch(utteranceId, "end", "")

            override fun onStop(utteranceId: String?, interrupted: Boolean) =
                dispatch(utteranceId, "end", "")

            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) =
                dispatch(utteranceId, "error", "synthesis-failed")

            override fun onError(utteranceId: String?, errorCode: Int) =
                dispatch(utteranceId, "error", "synthesis-failed:$errorCode")
        })
    }

    private fun onTtsInit(status: Int) {
        synchronized(this) {
            // LANG_MISSING_DATA / LANG_NOT_SUPPORTED は負値（LANG_AVAILABLE = 0）
            val ready = status == TextToSpeech.SUCCESS &&
                tts.setLanguage(Locale.US) >= TextToSpeech.LANG_AVAILABLE
            state = if (ready) State.READY else State.UNAVAILABLE
            pending?.let { (text, id) ->
                if (state == State.READY) doSpeak(text, id) else dispatch(id, "error", "tts-unavailable")
            }
            pending = null
        }
    }

    /** 端末 TTS が利用可能か。false のとき Web 側は再生ボタンを出さない（Web 版と同じ縮退）。 */
    @JavascriptInterface
    fun isAvailable(): Boolean = state != State.UNAVAILABLE

    @JavascriptInterface
    fun speak(text: String, utteranceId: String) {
        synchronized(this) {
            when (state) {
                State.INITIALIZING -> {
                    pending?.let { dispatch(it.second, "end", "") }
                    pending = text to utteranceId
                }
                State.UNAVAILABLE -> dispatch(utteranceId, "error", "tts-unavailable")
                State.READY -> doSpeak(text, utteranceId)
            }
        }
    }

    @JavascriptInterface
    fun cancel() {
        // 実行中の発話は onStop → "end" dispatch で閉じる
        if (state == State.READY) tts.stop()
    }

    private fun doSpeak(text: String, utteranceId: String) {
        // QUEUE_FLUSH: 実行中の発話を止めてから話す（speech.ts の cancel → speak と同義。
        // 中断された側は onStop → "end" で閉じる）
        if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId) != TextToSpeech.SUCCESS) {
            dispatch(utteranceId, "error", "speak-failed")
        }
    }

    fun shutdown() {
        tts.shutdown()
    }

    private fun dispatch(utteranceId: String?, event: String, detail: String) {
        if (utteranceId == null) return
        // UtteranceProgressListener は非 main スレッドから呼ばれる。evalJs 側で
        // runOnUiThread + evaluateJavascript することを前提とする。
        // 文字列は必ず quote してから埋め込む（' や改行を含んでも壊さない）
        evalJs(
            "window.__dejaWordTtsDispatch && window.__dejaWordTtsDispatch(" +
                "${JSONObject.quote(utteranceId)}, ${JSONObject.quote(event)}, ${JSONObject.quote(detail)})",
        )
    }
}
