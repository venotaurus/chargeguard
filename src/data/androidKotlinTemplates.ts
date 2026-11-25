export interface KotlinFileTemplate {
  id: string;
  filename: string;
  path: string;
  language: string;
  summary: string;
  getContent: (targetPercent: number) => string;
}

export const ANDROID_KOTLIN_FILES: KotlinFileTemplate[] = [
  {
    id: 'service',
    filename: 'BatteryAlarmService.kt',
    path: 'app/src/main/java/com/chargeguard/app/BatteryAlarmService.kt',
    language: 'kotlin',
    summary: 'Background ForegroundService with PARTIAL_WAKE_LOCK, custom audio URI playback, and hardware battery health readout.',
    getContent: (targetPercent: number) => `package com.chargeguard.app

import android.app.*
import android.content.*
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.*
import androidx.core.app.NotificationCompat

class BatteryAlarmService : Service() {

    companion object {
        const val CHANNEL_ID = "chargeguard_monitor_channel"
        const val ALARM_CHANNEL_ID = "chargeguard_alarm_channel"
        const val EXTRA_TARGET_PERCENT = "target_percent"
        const val EXTRA_CUSTOM_TONE_URI = "custom_tone_uri"
        const val ACTION_STOP_ALARM = "com.chargeguard.app.STOP_ALARM"
    }

    private var targetPercent: Int = ${targetPercent}
    private var customToneUri: Uri? = null
    private var alarmTriggered: Boolean = false
    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null

    private val batteryReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
            val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            val health = intent.getIntExtra(BatteryManager.EXTRA_HEALTH, BatteryManager.BATTERY_HEALTH_UNKNOWN)
            val tempC = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) / 10.0f

            val batteryPct = (level * 100) / scale
            val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL

            val healthLabel = when (health) {
                BatteryManager.BATTERY_HEALTH_GOOD -> "Good"
                BatteryManager.BATTERY_HEALTH_OVERHEAT -> "Overheat"
                BatteryManager.BATTERY_HEALTH_DEAD -> "Degraded"
                BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "Over Voltage"
                else -> "Normal"
            }

            updateMonitorNotification(batteryPct, isCharging, healthLabel, tempC)

            if (tempC > 40.0f) {
                notifyOverheatWarning(tempC)
            }

            if (isCharging && batteryPct >= targetPercent && !alarmTriggered) {
                alarmTriggered = true
                triggerAlarm(batteryPct)
            } else if (!isCharging) {
                if (alarmTriggered) stopAlarmSound()
                alarmTriggered = false
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP_ALARM) {
            stopAlarmSound()
            stopSelf()
            return START_NOT_STICKY
        }

        val prefs = getSharedPreferences("chargeguard_prefs", MODE_PRIVATE)
        targetPercent = intent?.getIntExtra(EXTRA_TARGET_PERCENT, prefs.getInt("target_pct", ${targetPercent}))
            ?: prefs.getInt("target_pct", ${targetPercent})

        val uriStr = intent?.getStringExtra(EXTRA_CUSTOM_TONE_URI) ?: prefs.getString("tone_uri", null)
        customToneUri = uriStr?.let { Uri.parse(it) }

        prefs.edit()
            .putInt("target_pct", targetPercent)
            .putString("tone_uri", uriStr)
            .putBoolean("armed", true)
            .apply()

        alarmTriggered = false
        acquirePartialWakeLock()
        createNotificationChannels()
        startForeground(1001, buildMonitorNotification(0, false, "Checking", 0f))
        registerReceiver(batteryReceiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        return START_STICKY
    }

    private fun acquirePartialWakeLock() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (wakeLock == null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ChargeGuard::BatteryMonitor").apply {
                setReferenceCounted(false)
                acquire(12 * 60 * 60 * 1000L)
            }
        }
    }

    private fun triggerAlarm(currentPct: Int) {
        val toneUri = customToneUri
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

        mediaPlayer?.release()
        mediaPlayer = MediaPlayer().apply {
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            setDataSource(applicationContext, toneUri)
            isLooping = true
            prepare()
            start()
        }

        vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }

        val pattern = longArrayOf(0, 500, 250, 500, 250, 700)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
        } else {
            @Suppress("DEPRECATION")
            vibrator?.vibrate(pattern, 0)
        }

        val stopIntent = Intent(this, BatteryAlarmService::class.java).apply {
            action = ACTION_STOP_ALARM
        }
        val stopPending = PendingIntent.getService(
            this, 0, stopIntent, PendingIntent.FLAG_IMMUTABLE
        )

        val alertNotification = NotificationCompat.Builder(this, ALARM_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_charging)
            .setContentTitle("Battery Reached \$currentPct%")
            .setContentText("Target of \$targetPercent% hit. Unplug your charger.")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setOngoing(true)
            .addAction(0, "Stop Alarm", stopPending)
            .build()

        getSystemService(NotificationManager::class.java).notify(1002, alertNotification)
    }

    private fun stopAlarmSound() {
        mediaPlayer?.let {
            if (it.isPlaying) it.stop()
            it.release()
        }
        mediaPlayer = null
        vibrator?.cancel()
        getSystemService(NotificationManager::class.java).cancel(1002)
    }

    private fun buildMonitorNotification(pct: Int, charging: Boolean, health: String, tempC: Float): Notification {
        val state = if (charging) "Charging" else "Waiting for charger"
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_charging)
            .setContentTitle("ChargeGuard Armed · Target \$targetPercent%")
            .setContentText("\$pct% (\$state) · Health: \$health · \${tempC}°C")
            .setSilent(true)
            .build()
    }

    private fun updateMonitorNotification(pct: Int, charging: Boolean, health: String, tempC: Float) {
        getSystemService(NotificationManager::class.java)
            .notify(1001, buildMonitorNotification(pct, charging, health, tempC))
    }

    private fun notifyOverheatWarning(tempC: Float) {
        val warning = NotificationCompat.Builder(this, ALARM_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setContentTitle("Battery Safety Warning (\${tempC}°C)")
            .setContentText("Battery exceeded 40°C. Unplug charger and let your phone cool down.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .build()
        getSystemService(NotificationManager::class.java).notify(1003, warning)
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Background Battery Monitor", NotificationManager.IMPORTANCE_LOW)
            )
            nm.createNotificationChannel(
                NotificationChannel(ALARM_CHANNEL_ID, "Charge Target Alarm", NotificationManager.IMPORTANCE_HIGH)
            )
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopAlarmSound()
        wakeLock?.let { if (it.isHeld) it.release() }
        getSharedPreferences("chargeguard_prefs", MODE_PRIVATE).edit().putBoolean("armed", false).apply()
        try {
            unregisterReceiver(batteryReceiver)
        } catch (_: IllegalArgumentException) {}
    }

    override fun onBind(intent: Intent?): IBinder? = null
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            val prefs = context.getSharedPreferences("chargeguard_prefs", Context.MODE_PRIVATE)
            if (prefs.getBoolean("armed", false)) {
                val serviceIntent = Intent(context, BatteryAlarmService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
            }
        }
    }
}
`,
  },
  {
    id: 'drain',
    filename: 'BatteryDrainMonitor.kt',
    path: 'app/src/main/java/com/chargeguard/app/BatteryDrainMonitor.kt',
    language: 'kotlin',
    summary: 'Uses Android UsageStatsManager + BatteryManager to rank apps & system processes draining battery while unplugged.',
    getContent: () => `package com.chargeguard.app

import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.pm.ApplicationInfo
import android.os.BatteryManager

data class AppDrainStats(
    val packageName: String,
    val appName: String,
    val isSystem: Boolean,
    val foregroundMinutes: Long,
    val estimatedDrainPct: Double
)

class BatteryDrainMonitor(private val context: Context) {

    fun getTopUnpluggedDrainers(
        windowHours: Long = 24L,
        totalUnpluggedDropPct: Double
    ): List<AppDrainStats> {
        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val pm = context.packageManager
        val endMs = System.currentTimeMillis()
        val startMs = endMs - windowHours * 60L * 60L * 1000L

        val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, startMs, endMs)
            .filter { it.totalTimeInForeground > 60_000L }

        val totalForegroundMs = stats.sumOf { it.totalTimeInForeground }.coerceAtLeast(1L)

        return stats
            .groupBy { it.packageName }
            .mapNotNull { (pkg, list) ->
                val fgMs = list.sumOf { it.totalTimeInForeground }
                val info = try {
                    pm.getApplicationInfo(pkg, 0)
                } catch (_: Exception) {
                    return@mapNotNull null
                }
                val label = pm.getApplicationLabel(info).toString()
                val isSystem = (info.flags and ApplicationInfo.FLAG_SYSTEM) != 0
                val share = fgMs.toDouble() / totalForegroundMs.toDouble()
                AppDrainStats(
                    packageName = pkg,
                    appName = label,
                    isSystem = isSystem,
                    foregroundMinutes = fgMs / 60_000L,
                    estimatedDrainPct = Math.round(totalUnpluggedDropPct * share * 10.0) / 10.0
                )
            }
            .sortedByDescending { it.estimatedDrainPct }
            .take(10)
    }

    fun getCurrentMicroAmpDraw(): Int {
        val bm = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        return bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW)
    }
}
`,
  },
  {
    id: 'activity',
    filename: 'MainActivity.kt',
    path: 'app/src/main/java/com/chargeguard/app/MainActivity.kt',
    language: 'kotlin',
    summary: 'Jetpack Compose UI with target slider, custom audio file picker from device storage, and background service toggle.',
    getContent: (targetPercent: number) => `package com.chargeguard.app

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import kotlin.math.roundToInt

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                100
            )
        }

        setContent {
            MaterialTheme {
                var targetPct by remember { mutableFloatStateOf(${targetPercent}f) }
                var armed by remember { mutableStateOf(false) }
                var customToneUri by remember { mutableStateOf<Uri?>(null) }

                val audioPicker = rememberLauncherForActivityResult(
                    contract = ActivityResultContracts.OpenDocument()
                ) { uri ->
                    if (uri != null) {
                        contentResolver.takePersistableUriPermission(
                            uri,
                            Intent.FLAG_GRANT_READ_URI_PERMISSION
                        )
                        customToneUri = uri
                    }
                }

                Surface(modifier = Modifier.fillMaxSize()) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("ChargeGuard", style = MaterialTheme.typography.headlineMedium)
                        Spacer(Modifier.height(16.dp))
                        Text(
                            text = "Alarm at \${targetPct.roundToInt()}%",
                            style = MaterialTheme.typography.displaySmall
                        )
                        Spacer(Modifier.height(16.dp))
                        Slider(
                            value = targetPct,
                            onValueChange = { targetPct = it },
                            valueRange = 10f..100f,
                            steps = 89
                        )
                        Spacer(Modifier.height(16.dp))
                        OutlinedButton(
                            onClick = { audioPicker.launch(arrayOf("audio/*")) },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(if (customToneUri != null) "Custom Sound Selected" else "Pick Sound from Device")
                        }
                        Spacer(Modifier.height(12.dp))
                        Button(
                            onClick = {
                                val serviceIntent = Intent(this@MainActivity, BatteryAlarmService::class.java)
                                if (!armed) {
                                    serviceIntent.putExtra(
                                        BatteryAlarmService.EXTRA_TARGET_PERCENT,
                                        targetPct.roundToInt()
                                    )
                                    customToneUri?.let {
                                        serviceIntent.putExtra(
                                            BatteryAlarmService.EXTRA_CUSTOM_TONE_URI,
                                            it.toString()
                                        )
                                    }
                                    ContextCompat.startForegroundService(this@MainActivity, serviceIntent)
                                    armed = true
                                } else {
                                    stopService(serviceIntent)
                                    armed = false
                                }
                            },
                            modifier = Modifier.fillMaxWidth().height(52.dp)
                        ) {
                            Text(if (armed) "Disarm Background Alarm" else "Arm Alarm at \${targetPct.roundToInt()}%")
                        }
                        Spacer(Modifier.height(12.dp))
                        TextButton(onClick = {
                            startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
                        }) {
                            Text("Grant App Drain Usage Access")
                        }
                    }
                }
            }
        }
    }
}
`,
  },
  {
    id: 'manifest',
    filename: 'AndroidManifest.xml',
    path: 'app/src/main/AndroidManifest.xml',
    language: 'xml',
    summary: 'Permissions for background foreground service, UsageStats drain tracking, wake lock, reboot auto-start, and notifications.',
    getContent: () => `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission
        android:name="android.permission.PACKAGE_USAGE_STATS"
        tools:ignore="ProtectedPermissions" />

    <application
        android:allowBackup="true"
        android:label="ChargeGuard"
        android:supportsRtl="true"
        android:theme="@style/Theme.Material3.DayNight.NoActionBar">

        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <service
            android:name=".BatteryAlarmService"
            android:enabled="true"
            android:exported="false"
            android:foregroundServiceType="specialUse" />

        <receiver
            android:name=".BootReceiver"
            android:enabled="true"
            android:exported="false">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
            </intent-filter>
        </receiver>

    </application>
</manifest>
`,
  },
];
