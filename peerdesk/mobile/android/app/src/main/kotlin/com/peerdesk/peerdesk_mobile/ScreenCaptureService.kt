package com.peerdesk.peerdesk_mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.util.DisplayMetrics
import android.view.WindowManager
import io.flutter.plugin.common.EventChannel
import java.io.ByteArrayOutputStream

/** Bridges frames produced on a background thread to the Flutter event sink. */
object FrameBus {
    @Volatile var sink: EventChannel.EventSink? = null
    @Volatile var handler: Handler? = null

    fun emit(width: Int, height: Int, jpeg: ByteArray) {
        val s = sink ?: return
        val h = handler ?: return
        h.post {
            try {
                s.success(mapOf("width" to width, "height" to height, "jpeg" to jpeg))
            } catch (_: Throwable) {
            }
        }
    }
}

/**
 * Foreground service that captures the screen via MediaProjection and streams
 * downscaled JPEG frames through [FrameBus]. A foreground service with the
 * mediaProjection type is mandatory on modern Android before a projection may
 * start.
 */
class ScreenCaptureService : Service() {
    companion object {
        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_RESULT_DATA = "result_data"
        const val EXTRA_FPS = "fps"
        private const val CHANNEL_ID = "peerdesk_capture"
        private const val NOTIF_ID = 42
        private const val MAX_WIDTH = 1280
    }

    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var thread: HandlerThread? = null
    private var handler: Handler? = null
    private var lastEmit = 0L
    private var intervalMs = 125L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startInForeground()
        if (intent == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
        val data: Intent? = if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(EXTRA_RESULT_DATA)
        }
        val fps = intent.getIntExtra(EXTRA_FPS, 8).coerceIn(1, 30)
        intervalMs = (1000L / fps)
        if (data == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        startCapture(resultCode, data)
        return START_STICKY
    }

    private fun startInForeground() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channel = NotificationChannel(
                CHANNEL_ID, "PeerDesk screen sharing",
                NotificationManager.IMPORTANCE_LOW
            )
            nm.createNotificationChannel(channel)
        }
        val notification: Notification =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Notification.Builder(this, CHANNEL_ID)
                    .setContentTitle("PeerDesk")
                    .setContentText("Your screen is being shared")
                    .setSmallIcon(android.R.drawable.ic_menu_view)
                    .build()
            } else {
                @Suppress("DEPRECATION")
                Notification.Builder(this)
                    .setContentTitle("PeerDesk")
                    .setContentText("Your screen is being shared")
                    .setSmallIcon(android.R.drawable.ic_menu_view)
                    .build()
            }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIF_ID, notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            )
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    private fun startCapture(resultCode: Int, data: Intent) {
        val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val mp = mpm.getMediaProjection(resultCode, data) ?: run {
            stopSelf(); return
        }
        projection = mp

        val metrics = DisplayMetrics()
        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getRealMetrics(metrics)
        var width = metrics.widthPixels
        var height = metrics.heightPixels
        val density = metrics.densityDpi
        // Downscale to keep bandwidth reasonable.
        if (width > MAX_WIDTH) {
            val scale = MAX_WIDTH.toFloat() / width
            width = MAX_WIDTH
            height = (height * scale).toInt()
        }

        thread = HandlerThread("pd-capture").also { it.start() }
        handler = Handler(thread!!.looper)

        mp.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                teardown()
            }
        }, handler)

        val reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
        imageReader = reader
        virtualDisplay = mp.createVirtualDisplay(
            "pd-vd", width, height, density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            reader.surface, null, handler
        )

        reader.setOnImageAvailableListener({ r ->
            val image = r.acquireLatestImage() ?: return@setOnImageAvailableListener
            try {
                val now = System.currentTimeMillis()
                if (now - lastEmit < intervalMs) return@setOnImageAvailableListener
                lastEmit = now
                val plane = image.planes[0]
                val buffer = plane.buffer
                val pixelStride = plane.pixelStride
                val rowStride = plane.rowStride
                val rowPadding = rowStride - pixelStride * width
                val bmpWidth = width + rowPadding / pixelStride
                val bmp = Bitmap.createBitmap(bmpWidth, height, Bitmap.Config.ARGB_8888)
                bmp.copyPixelsFromBuffer(buffer)
                val cropped = if (bmpWidth != width) {
                    Bitmap.createBitmap(bmp, 0, 0, width, height)
                } else {
                    bmp
                }
                val out = ByteArrayOutputStream()
                cropped.compress(Bitmap.CompressFormat.JPEG, 55, out)
                FrameBus.emit(width, height, out.toByteArray())
                if (cropped !== bmp) cropped.recycle()
                bmp.recycle()
            } catch (_: Throwable) {
                // skip this frame
            } finally {
                image.close()
            }
        }, handler)
    }

    private fun teardown() {
        try { virtualDisplay?.release() } catch (_: Throwable) {}
        try { imageReader?.close() } catch (_: Throwable) {}
        try { projection?.stop() } catch (_: Throwable) {}
        virtualDisplay = null
        imageReader = null
        projection = null
        thread?.quitSafely()
        thread = null
    }

    override fun onDestroy() {
        teardown()
        super.onDestroy()
    }
}
