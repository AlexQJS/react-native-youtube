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

const DEVICE_LOCK_MODULE_KT = `package com.youtubefeed.app

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
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
    const mainApp = modConfig.modResults.manifest.application?.[0];
    if (!mainApp) return modConfig;

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
        'import android.os.Bundle\nimport android.view.WindowManager'
      );
    }
    if (!contents.includes('override fun onResume()')) {
      contents = contents.replace(
        'super.onCreate(null)\n  }',
        `super.onCreate(null)\n  }\n\n  override fun onResume() {\n    super.onResume()\n    window?.let { win ->\n      val params = win.attributes\n      if (params.screenBrightness == 0.0f) {\n        params.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE\n        win.attributes = params\n      }\n    }\n  }`
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
