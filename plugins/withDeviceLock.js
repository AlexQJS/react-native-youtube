const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withMainApplication,
  withMainActivity,
  withDangerousMod,
} = require('expo/config-plugins');

const DEVICE_ADMIN_XML = `<?xml version="1.0" encoding="utf-8"?>
<device-admin xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-policies>
    <force-lock />
  </uses-policies>
</device-admin>
`;

const SLEEP_DEVICE_ADMIN_RECEIVER_KT = `package com.youtubefeed.app

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent

class SleepDeviceAdminReceiver : DeviceAdminReceiver() {
  override fun onEnabled(context: Context, intent: Intent) {
    super.onEnabled(context, intent)
  }

  override fun onDisabled(context: Context, intent: Intent) {
    super.onDisabled(context, intent)
  }
}
`;

const BACKGROUND_PLAYBACK_SERVICE_KT = `package com.youtubefeed.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

class BackgroundPlaybackService : Service() {
  companion object {
    const val CHANNEL_ID = "yt_feed_lockscreen_playback"
    const val NOTIFICATION_ID = 4102
    const val EXTRA_TITLE = "extra_video_title"
  }

  private var wakeLock: PowerManager.WakeLock? = null
  private var wifiLock: WifiManager.WifiLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    acquireLocks()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val videoTitle = intent?.getStringExtra(EXTRA_TITLE)?.takeIf { it.isNotBlank() }
      ?: "Reproduciendo vídeo con pantalla bloqueada"

    acquireLocks()
    val notification = buildNotification(videoTitle)

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(
          NOTIFICATION_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
        )
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (_: Exception) {
      // Ignorar restricciones de inicio de servicio en segundo plano en versiones recientes de Android
    }

    return START_STICKY
  }

  override fun onDestroy() {
    releaseLocks()
    super.onDestroy()
  }

  private fun acquireLocks() {
    try {
      if (wakeLock == null) {
        val pm = applicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
        wakeLock = pm?.newWakeLock(
          PowerManager.PARTIAL_WAKE_LOCK,
          "YouTubeFeed::LockScreenPlaybackWakeLock"
        )?.apply {
          setReferenceCounted(false)
        }
      }
      if (wakeLock?.isHeld == false) {
        wakeLock?.acquire(6 * 60 * 60 * 1000L)
      }
    } catch (_: Exception) {}

    try {
      if (wifiLock == null) {
        val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        val lockMode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          WifiManager.WIFI_MODE_FULL_LOW_LATENCY
        } else {
          @Suppress("DEPRECATION")
          WifiManager.WIFI_MODE_FULL_HIGH_PERF
        }
        wifiLock = wm?.createWifiLock(lockMode, "YouTubeFeed::LockScreenWifiLock")?.apply {
          setReferenceCounted(false)
        }
      }
      if (wifiLock?.isHeld == false) {
        wifiLock?.acquire()
      }
    } catch (_: Exception) {}
  }

  private fun releaseLocks() {
    try {
      if (wakeLock?.isHeld == true) {
        wakeLock?.release()
      }
    } catch (_: Exception) {}
    wakeLock = null

    try {
      if (wifiLock?.isHeld == true) {
        wifiLock?.release()
      }
    } catch (_: Exception) {}
    wifiLock = null
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
      val existing = manager?.getNotificationChannel(CHANNEL_ID)
      if (existing == null) {
        val channel = NotificationChannel(
          CHANNEL_ID,
          "Reproducción con pantalla bloqueada",
          NotificationManager.IMPORTANCE_LOW
        ).apply {
          description = "Mantiene el audio del vídeo activo cuando la pantalla del móvil está bloqueada"
          setShowBadge(false)
          setSound(null, null)
        }
        manager?.createNotificationChannel(channel)
      }
    }
  }

  private fun buildNotification(title: String): Notification {
    val launchIntent = Intent(this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val pendingFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }
    val pendingIntent = PendingIntent.getActivity(this, 0, launchIntent, pendingFlags)

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    return builder
      .setContentTitle("Video Feed")
      .setContentText(title)
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setContentIntent(pendingIntent)
      .setOngoing(true)
      .build()
  }
}
`;

const DEVICE_LOCK_MODULE_KT = `package com.youtubefeed.app

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = DeviceLockModule.NAME)
class DeviceLockModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME = "DeviceLockModule"
    private const val WEBVIEW_HOOK_TAG_KEY = 0x7f0b9901

    @Volatile
    var lockScreenPlaybackEnabled: Boolean = false

    @Volatile
    var isVideoPlaying: Boolean = false

    @Volatile
    var currentVideoTitle: String = ""

    fun isLockScreenPlaybackActive(): Boolean {
      return lockScreenPlaybackEnabled
    }

    private val LOCK_SCREEN_DOC_START_SCRIPT = """
      (function() {
        try {
          Object.defineProperty(document, 'hidden', {
            configurable: true,
            get: function() { return false; }
          });
          Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: function() { return 'visible'; }
          });
          Object.defineProperty(document, 'webkitHidden', {
            configurable: true,
            get: function() { return false; }
          });
          Object.defineProperty(document, 'webkitVisibilityState', {
            configurable: true,
            get: function() { return 'visible'; }
          });
          var stopVis = function(e) {
            if (window.__ytAllowLockScreenPlayback !== false) {
              e.stopImmediatePropagation();
              e.stopPropagation();
            }
          };
          document.addEventListener('visibilitychange', stopVis, true);
          document.addEventListener('webkitvisibilitychange', stopVis, true);
          window.addEventListener('visibilitychange', stopVis, true);
          window.addEventListener('pagehide', stopVis, true);
          window.addEventListener('freeze', stopVis, true);
          window.addEventListener('blur', stopVis, true);
        } catch (err) {}
      })();
    """.trimIndent()

    fun configureWebViewsRecursive(view: View?) {
      if (view == null) return
      if (view is WebView) {
        try {
          if (view.getTag(WEBVIEW_HOOK_TAG_KEY) != true) {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
              WebViewCompat.addDocumentStartJavaScript(
                view,
                LOCK_SCREEN_DOC_START_SCRIPT,
                setOf("*")
              )
            }
            view.setTag(WEBVIEW_HOOK_TAG_KEY, true)
          }
          if (lockScreenPlaybackEnabled) {
            view.onResume()
            view.resumeTimers()
          }
        } catch (_: Exception) {}
      }
      if (view is ViewGroup) {
        for (i in 0 until view.childCount) {
          configureWebViewsRecursive(view.getChildAt(i))
        }
      }
    }

    fun keepWebViewsActiveOnLock(view: View?) {
      if (!lockScreenPlaybackEnabled || view == null) return
      if (view is WebView) {
        try {
          view.onResume()
          view.resumeTimers()
          if (isVideoPlaying) {
            view.evaluateJavascript(
              "window.__ytScreenLockedOrBackground = true; window.__ytAllowLockScreenPlayback = true; if (typeof window.playFromUser === 'function') { window.playFromUser(); } else if (typeof player !== 'undefined' && player && player.playVideo) { player.playVideo(); } document.querySelectorAll('video').forEach(function(v){ try { if (v.paused) { v.play(); } } catch(e){} }); true;",
              null
            )
          }
        } catch (_: Exception) {}
      }
      if (view is ViewGroup) {
        for (i in 0 until view.childCount) {
          keepWebViewsActiveOnLock(view.getChildAt(i))
        }
      }
    }
  }

  override fun getName(): String = NAME

  private fun getAdminComponent(): ComponentName {
    return ComponentName(reactApplicationContext, SleepDeviceAdminReceiver::class.java)
  }

  private fun getDevicePolicyManager(): DevicePolicyManager? {
    return reactApplicationContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
  }

  private fun clearKeepScreenOnRecursive(view: View?) {
    if (view == null) return
    view.keepScreenOn = false
    if (view is ViewGroup) {
      for (i in 0 until view.childCount) {
        clearKeepScreenOnRecursive(view.getChildAt(i))
      }
    }
  }

  private fun syncBackgroundPlaybackService() {
    try {
      val context = reactApplicationContext.applicationContext
      val serviceIntent = Intent(context, BackgroundPlaybackService::class.java).apply {
        putExtra(BackgroundPlaybackService.EXTRA_TITLE, currentVideoTitle)
      }
      if (lockScreenPlaybackEnabled && isVideoPlaying) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(serviceIntent)
        } else {
          context.startService(serviceIntent)
        }
      } else {
        context.stopService(serviceIntent)
      }
    } catch (_: Exception) {
      // Ignorar restricciones de servicio en segundo plano del sistema operativo
    }
  }

  @ReactMethod
  fun setLockScreenPlaybackEnabled(enabled: Boolean, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        lockScreenPlaybackEnabled = enabled
        val activity = reactApplicationContext.currentActivity
        activity?.window?.decorView?.let { decorView ->
          configureWebViewsRecursive(decorView)
        }
        syncBackgroundPlaybackService()
        promise.resolve(true)
      } catch (_: Exception) {
        promise.resolve(false)
      }
    }
  }

  @ReactMethod
  fun setPlaybackActiveState(isPlaying: Boolean, title: String?, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        isVideoPlaying = isPlaying
        if (!title.isNullOrBlank()) {
          currentVideoTitle = title
        }
        val activity = reactApplicationContext.currentActivity
        activity?.window?.decorView?.let { decorView ->
          configureWebViewsRecursive(decorView)
        }
        syncBackgroundPlaybackService()
        promise.resolve(true)
      } catch (_: Exception) {
        promise.resolve(false)
      }
    }
  }

  @ReactMethod
  fun isDeviceAdminActive(promise: Promise) {
    try {
      val dpm = getDevicePolicyManager()
      val isActive = dpm?.isAdminActive(getAdminComponent()) == true
      promise.resolve(isActive)
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun requestDeviceAdmin(promise: Promise) {
    try {
      val dpm = getDevicePolicyManager()
      val adminComponent = getAdminComponent()
      if (dpm != null && dpm.isAdminActive(adminComponent)) {
        promise.resolve(true)
        return
      }

      val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
        putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
        putExtra(
          DevicePolicyManager.EXTRA_ADD_EXPLANATION,
          "Permite que la aplicación bloquee la pantalla del móvil automáticamente cuando finalice el temporizador de Sleep Mode."
        )
      }

      val activity = reactApplicationContext.currentActivity
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactApplicationContext.startActivity(intent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun lockDevice(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        isVideoPlaying = false
        syncBackgroundPlaybackService()

        val activity = reactApplicationContext.currentActivity
        activity?.window?.let { window ->
          window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
          clearKeepScreenOnRecursive(window.decorView)
          val params = window.attributes
          params.screenBrightness = 0.0f
          window.attributes = params
        }

        val dpm = getDevicePolicyManager()
        val adminComponent = getAdminComponent()

        if (dpm != null && dpm.isAdminActive(adminComponent)) {
          dpm.lockNow()
          promise.resolve("LOCKED_ADMIN")
        } else {
          activity?.moveTaskToBack(true)
          promise.resolve("LOCKED_FALLBACK")
        }
      } catch (e: Exception) {
        promise.reject("LOCK_ERROR", e.message, e)
      }
    }
  }

  @ReactMethod
  fun restoreScreenState(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        val activity = reactApplicationContext.currentActivity
        activity?.window?.let { window ->
          val params = window.attributes
          params.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
          window.attributes = params
        }
        promise.resolve(true)
      } catch (e: Exception) {
        promise.resolve(false)
      }
    }
  }
}
`;

const DEVICE_LOCK_PACKAGE_KT = `package com.youtubefeed.app

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class DeviceLockPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(DeviceLockModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;

const LOCK_SCREEN_CONTAINER_KT_SNIPPET = `class LockScreenPlaybackContainer(context: Context) : FrameLayout(context) {
  override fun dispatchWindowVisibilityChanged(visibility: Int) {
    if (DeviceLockModule.isLockScreenPlaybackActive() && visibility != View.VISIBLE) {
      super.dispatchWindowVisibilityChanged(View.VISIBLE)
      return
    }
    super.dispatchWindowVisibilityChanged(visibility)
  }

  override fun onWindowVisibilityChanged(visibility: Int) {
    if (DeviceLockModule.isLockScreenPlaybackActive() && visibility != View.VISIBLE) {
      super.onWindowVisibilityChanged(View.VISIBLE)
      return
    }
    super.onWindowVisibilityChanged(visibility)
  }

  override fun dispatchVisibilityChanged(changedView: View, visibility: Int) {
    if (DeviceLockModule.isLockScreenPlaybackActive() && visibility != View.VISIBLE) {
      super.dispatchVisibilityChanged(changedView, View.VISIBLE)
      return
    }
    super.dispatchVisibilityChanged(changedView, visibility)
  }
}

class MainActivity : ReactActivity() {`;

function withDeviceLockFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.platformProjectRoot;
      const xmlDir = path.join(projectRoot, 'app', 'src', 'main', 'res', 'xml');
      const javaDir = path.join(
        projectRoot,
        'app',
        'src',
        'main',
        'java',
        'com',
        'youtubefeed',
        'app'
      );

      fs.mkdirSync(xmlDir, { recursive: true });
      fs.mkdirSync(javaDir, { recursive: true });

      fs.writeFileSync(
        path.join(xmlDir, 'device_admin_receiver.xml'),
        DEVICE_ADMIN_XML,
        'utf8'
      );
      fs.writeFileSync(
        path.join(javaDir, 'SleepDeviceAdminReceiver.kt'),
        SLEEP_DEVICE_ADMIN_RECEIVER_KT,
        'utf8'
      );
      fs.writeFileSync(
        path.join(javaDir, 'BackgroundPlaybackService.kt'),
        BACKGROUND_PLAYBACK_SERVICE_KT,
        'utf8'
      );
      fs.writeFileSync(
        path.join(javaDir, 'DeviceLockModule.kt'),
        DEVICE_LOCK_MODULE_KT,
        'utf8'
      );
      fs.writeFileSync(
        path.join(javaDir, 'DeviceLockPackage.kt'),
        DEVICE_LOCK_PACKAGE_KT,
        'utf8'
      );

      return modConfig;
    },
  ]);
}

function withDeviceLockManifest(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    manifest['uses-permission'] = manifest['uses-permission'] || [];

    const requiredPermissions = [
      'android.permission.WAKE_LOCK',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
    ];

    for (const permName of requiredPermissions) {
      const exists = manifest['uses-permission'].some(
        (p) => p.$?.['android:name'] === permName
      );
      if (!exists) {
        manifest['uses-permission'].push({
          $: { 'android:name': permName },
        });
      }
    }

    const mainApp = manifest.application?.[0];
    if (!mainApp) return modConfig;

    mainApp.service = mainApp.service || [];
    const serviceExists = mainApp.service.some(
      (s) => s.$?.['android:name'] === '.BackgroundPlaybackService'
    );
    if (!serviceExists) {
      mainApp.service.push({
        $: {
          'android:name': '.BackgroundPlaybackService',
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:foregroundServiceType': 'mediaPlayback',
        },
      });
    }

    mainApp.receiver = mainApp.receiver || [];
    const alreadyExists = mainApp.receiver.some(
      (r) => r.$?.['android:name'] === '.SleepDeviceAdminReceiver'
    );

    if (!alreadyExists) {
      mainApp.receiver.push({
        $: {
          'android:name': '.SleepDeviceAdminReceiver',
          'android:permission': 'android.permission.BIND_DEVICE_ADMIN',
          'android:exported': 'true',
        },
        'meta-data': [
          {
            $: {
              'android:name': 'android.app.device_admin',
              'android:resource': '@xml/device_admin_receiver',
            },
          },
        ],
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name': 'android.app.action.DEVICE_ADMIN_ENABLED',
                },
              },
            ],
          },
        ],
      });
    }

    return modConfig;
  });
}

function withDeviceLockMainApplication(config) {
  return withMainApplication(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    if (!contents.includes('DeviceLockPackage()')) {
      contents = contents.replace(
        /PackageList\(this\)\.packages\.apply\s*\{/,
        'PackageList(this).packages.apply {\n          add(DeviceLockPackage())'
      );
      modConfig.modResults.contents = contents;
    }
    return modConfig;
  });
}

function withDeviceLockMainActivity(config) {
  return withMainActivity(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    if (!contents.includes('import android.view.WindowManager')) {
      contents = contents.replace(
        'import android.os.Bundle',
        'import android.content.Context\nimport android.os.Bundle\nimport android.view.View\nimport android.view.ViewGroup\nimport android.view.WindowManager\nimport android.widget.FrameLayout'
      );
    }
    if (!contents.includes('class LockScreenPlaybackContainer')) {
      contents = contents.replace(
        'class MainActivity : ReactActivity() {',
        LOCK_SCREEN_CONTAINER_KT_SNIPPET
      );
    }
    if (!contents.includes('override fun onResume()')) {
      contents = contents.replace(
        'super.onCreate(null)\n  }',
        `super.onCreate(null)\n  }\n\n  override fun setContentView(view: View?) {\n    if (view == null || view is LockScreenPlaybackContainer) {\n      super.setContentView(view)\n      return\n    }\n    val container = LockScreenPlaybackContainer(this).apply {\n      layoutParams = ViewGroup.LayoutParams(\n        ViewGroup.LayoutParams.MATCH_PARENT,\n        ViewGroup.LayoutParams.MATCH_PARENT\n      )\n      addView(\n        view,\n        FrameLayout.LayoutParams(\n          ViewGroup.LayoutParams.MATCH_PARENT,\n          ViewGroup.LayoutParams.MATCH_PARENT\n        )\n      )\n    }\n    super.setContentView(container)\n  }\n\n  override fun setContentView(view: View?, params: ViewGroup.LayoutParams?) {\n    if (view == null || view is LockScreenPlaybackContainer) {\n      super.setContentView(view, params)\n      return\n    }\n    val container = LockScreenPlaybackContainer(this).apply {\n      layoutParams = params ?: ViewGroup.LayoutParams(\n        ViewGroup.LayoutParams.MATCH_PARENT,\n        ViewGroup.LayoutParams.MATCH_PARENT\n      )\n      addView(\n        view,\n        FrameLayout.LayoutParams(\n          ViewGroup.LayoutParams.MATCH_PARENT,\n          ViewGroup.LayoutParams.MATCH_PARENT\n        )\n      )\n    }\n    super.setContentView(container, container.layoutParams)\n  }\n\n  override fun onResume() {\n    super.onResume()\n    window?.let { win ->\n      val params = win.attributes\n      if (params.screenBrightness == 0.0f) {\n        params.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE\n        win.attributes = params\n      }\n    }\n  }\n\n  override fun onPause() {\n    super.onPause()\n    if (DeviceLockModule.isLockScreenPlaybackActive()) {\n      DeviceLockModule.keepWebViewsActiveOnLock(window?.decorView)\n    }\n  }\n\n  override fun onStop() {\n    super.onStop()\n    if (DeviceLockModule.isLockScreenPlaybackActive()) {\n      DeviceLockModule.keepWebViewsActiveOnLock(window?.decorView)\n    }\n  }`
      );
    }
    modConfig.modResults.contents = contents;
    return modConfig;
  });
}

module.exports = function withDeviceLock(config) {
  config = withDeviceLockFiles(config);
  config = withDeviceLockManifest(config);
  config = withDeviceLockMainApplication(config);
  config = withDeviceLockMainActivity(config);
  return config;
};
