package com.nous.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DownloadNotificationModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    companion object {
        private const val CHANNEL_ID = "nous_download"
        private const val NOTIF_ID = 8742
    }

    private val manager = NotificationManagerCompat.from(ctx)

    override fun getName() = "DownloadNotification"

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_ID,
                "Download progress",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                enableVibration(false)
                setShowBadge(false)
            }
            (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(ch)
        }
    }

    private fun builder() = NotificationCompat.Builder(ctx, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_download)
        .setOnlyAlertOnce(true)

    @ReactMethod
    fun start() {
        ensureChannel()
        manager.notify(NOTIF_ID, builder()
            .setContentTitle("Nous")
            .setContentText("Downloading library…")
            .setProgress(100, 0, true)
            .setOngoing(true)
            .build())
    }

    @ReactMethod
    fun update(done: Int, total: Int) {
        manager.notify(NOTIF_ID, builder()
            .setContentTitle("Nous")
            .setContentText("$done / $total articles")
            .setProgress(total, done, false)
            .setOngoing(true)
            .build())
    }

    @ReactMethod
    fun finish(total: Int) {
        manager.notify(NOTIF_ID, builder()
            .setContentTitle("Nous")
            .setContentText("Library ready — $total articles")
            .setAutoCancel(true)
            .build())
    }

    @ReactMethod
    fun dismiss() {
        manager.cancel(NOTIF_ID)
    }
}
