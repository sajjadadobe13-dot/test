package com.peerdesk.peerdesk_mobile

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel

/**
 * Hosts two platform channels used by PeerDesk "Share this phone" mode:
 *   - method channel  "peerdesk/screen"  : start/stop screen capture
 *   - event  channel  "peerdesk/frames"  : stream of {width,height,jpeg}
 *
 * Starting capture launches the system MediaProjection consent dialog. On
 * approval we start a foreground service (required on modern Android) that owns
 * the projection and pushes JPEG frames onto [FrameBus], which forwards them to
 * the Flutter event sink on the main thread.
 */
class MainActivity : FlutterActivity() {
    private val screenChannelName = "peerdesk/screen"
    private val frameChannelName = "peerdesk/frames"
    private val reqCapture = 4201

    private var pendingResult: MethodChannel.Result? = null
    private var requestedFps = 8

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val messenger = flutterEngine.dartExecutor.binaryMessenger

        MethodChannel(messenger, screenChannelName).setMethodCallHandler { call, result ->
            when (call.method) {
                "start" -> {
                    requestedFps = (call.argument<Int>("fps") ?: 8).coerceIn(1, 30)
                    pendingResult = result
                    val mpm = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
                    startActivityForResult(mpm.createScreenCaptureIntent(), reqCapture)
                }
                "stop" -> {
                    stopService(Intent(this, ScreenCaptureService::class.java))
                    FrameBus.sink = null
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        }

        EventChannel(messenger, frameChannelName).setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
                FrameBus.handler = Handler(Looper.getMainLooper())
                FrameBus.sink = events
            }

            override fun onCancel(arguments: Any?) {
                FrameBus.sink = null
            }
        })
    }

    @Deprecated("startActivityForResult result plumbing")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != reqCapture) return
        val result = pendingResult
        pendingResult = null
        if (resultCode == Activity.RESULT_OK && data != null) {
            val intent = Intent(this, ScreenCaptureService::class.java).apply {
                putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, resultCode)
                putExtra(ScreenCaptureService.EXTRA_RESULT_DATA, data)
                putExtra(ScreenCaptureService.EXTRA_FPS, requestedFps)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
            result?.success(true)
        } else {
            result?.success(false)
        }
    }
}
