/**
 * Parchea el proyecto Android generado por Capacitor para habilitar:
 * 1. Picture-in-Picture nativo de Android (supportsPictureInPicture="true" + 16:9 onUserLeaveHint + puente JS window.YouAppAndroidPiP.enterPiP())
 * 2. Share Target nativo de Android (ACTION_SEND text/plain -> https://youapptv.com/share?text=...)
 * 3. Cast nativo de Android (openCastSettings) + soporte universal Android TV / Google TV (Leanback)
 * 4. TextToSpeech nativo de Android (speak / stopSpeak -> voz Google Español HD dentro del APK)
 * 5. AlarmManager nativo (scheduleAlarm / cancelAlarm -> despierta la pantalla apagada y abre /youmusic?alarmTrigger=1)
 */
import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve('android/app/src/main/AndroidManifest.xml');
const mainActivityPath = path.resolve('android/app/src/main/java/com/youapptv/app/MainActivity.java');
const alarmReceiverPath = path.resolve('android/app/src/main/java/com/youapptv/app/YouAppAlarmReceiver.java');

if (!fs.existsSync(manifestPath)) {
  throw new Error(`No se encontró ${manifestPath}`);
}

let manifest = fs.readFileSync(manifestPath, 'utf8');

// 0. Permisos nativos para Despertador con pantalla apagada (WakeLock + Exact Alarm + Full-Screen Intent)
const requiredPermissions = [
  'android.permission.WAKE_LOCK',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.USE_EXACT_ALARM',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.USE_FULL_SCREEN_INTENT'
];
for (const perm of requiredPermissions) {
  if (!manifest.includes(perm)) {
    manifest = manifest.replace(
      '<application',
      `<uses-permission android:name="${perm}" />\n    <application`
    );
  }
}

// 1. Soporte universal Android TV / Google TV / Fire TV (Leanback + sin requerir pantalla táctil)
if (!manifest.includes('android.software.leanback')) {
  manifest = manifest.replace(
    '<application',
    `<uses-feature android:name="android.hardware.touchscreen" android:required="false" />
    <uses-feature android:name="android.software.leanback" android:required="false" />

    <application`
  );
}
if (!manifest.includes('android:banner=')) {
  manifest = manifest.replace(
    '<application',
    '<application\n        android:banner="@mipmap/ic_launcher"'
  );
}
if (!manifest.includes('android.intent.category.LEANBACK_LAUNCHER')) {
  manifest = manifest.replace(
    '<category android:name="android.intent.category.LAUNCHER" />',
    `<category android:name="android.intent.category.LAUNCHER" />
                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />`
  );
}

// 2. Habilitar supportsPictureInPicture, resizeableActivity, showWhenLocked y turnScreenOn en MainActivity
manifest = manifest.replace(
  /<activity([^>]*android:name="\.MainActivity"[^>]*)>/,
  (full, attrs) => {
    let next = attrs;
    if (!next.includes('android:supportsPictureInPicture')) {
      next += '\n            android:supportsPictureInPicture="true"';
    }
    if (!next.includes('android:resizeableActivity')) {
      next += '\n            android:resizeableActivity="true"';
    }
    if (!next.includes('android:showWhenLocked')) {
      next += '\n            android:showWhenLocked="true"';
    }
    if (!next.includes('android:turnScreenOn')) {
      next += '\n            android:turnScreenOn="true"';
    }
    if (!next.includes('smallestScreenSize')) {
      next = next.replace(
        /android:configChanges="([^"]*)"/,
        'android:configChanges="$1|smallestScreenSize|screenLayout|uiMode"'
      );
    }
    return `<activity${next}>`;
  }
);

// 3. Agregar intent-filter nativo para Compartir enlaces hacia YOUAPP
if (!manifest.includes('android.intent.action.SEND')) {
  const shareFilter = `
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/*" />
            </intent-filter>
        </activity>`;
  manifest = manifest.replace('</activity>', shareFilter);
}

// 4. Registrar YouAppAlarmReceiver para despertar el dispositivo cuando suena la alarma
if (!manifest.includes('YouAppAlarmReceiver')) {
  manifest = manifest.replace(
    '</application>',
    `        <receiver
            android:name=".YouAppAlarmReceiver"
            android:exported="false" />
    </application>`
  );
}

fs.writeFileSync(manifestPath, manifest, 'utf8');
console.log('[patch-android-pip] AndroidManifest.xml actualizado con PiP, Share, Leanback y AlarmManager.');

// 5. Escribir YouAppAlarmReceiver.java (despierta el teléfono y abre MainActivity en /youmusic?alarmTrigger=1)
const alarmReceiverJava = `package com.youapptv.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;

public class YouAppAlarmReceiver extends BroadcastReceiver {
    public static final String EXTRA_ALARM_TRIGGER = "youapp_alarm_trigger";
    private static final String CHANNEL_ID = "youapp_alarm_channel_v1";
    private static final int NOTIFICATION_ID = 7701;

    @Override
    public void onReceive(Context context, Intent intent) {
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wakeLock = null;
        try {
            if (pm != null) {
                int flags = PowerManager.PARTIAL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP;
                wakeLock = pm.newWakeLock(flags, "YOUAPP:AlarmWakeLock");
                wakeLock.acquire(15_000L);
            }
        } catch (Exception ignored) {
            // Continuar aunque el fabricante restrinja flags de WakeLock
        }

        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
        );
        launchIntent.putExtra(EXTRA_ALARM_TRIGGER, true);

        // En Android 10+ las actividades desde segundo plano requieren FullScreenIntent para despertar pantalla bloqueada
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    NotificationChannel ch = new NotificationChannel(
                        CHANNEL_ID,
                        "Despertador YOUAPP",
                        NotificationManager.IMPORTANCE_HIGH
                    );
                    ch.setDescription("Despertador musical e inteligente de YOUAPP");
                    ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
                    ch.enableVibration(true);
                    nm.createNotificationChannel(ch);
                }

                int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    piFlags |= PendingIntent.FLAG_IMMUTABLE;
                }
                PendingIntent fullScreenPi = PendingIntent.getActivity(context, 7702, launchIntent, piFlags);

                NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                    .setContentTitle("Despertador YOUAPP")
                    .setContentText("Iniciando tu música y resumen matutino…")
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setCategory(NotificationCompat.CATEGORY_ALARM)
                    .setAutoCancel(true)
                    .setFullScreenIntent(fullScreenPi, true)
                    .setContentIntent(fullScreenPi);

                nm.notify(NOTIFICATION_ID, builder.build());
            }
        } catch (Exception ignored) {
            // Si falta permiso de notificación, intentar abrir la actividad directamente
        }

        try {
            context.startActivity(launchIntent);
        } catch (Exception ignored) {
            // En Android 12+ el FullScreenIntent se encarga de abrir MainActivity
        } finally {
            try {
                if (wakeLock != null && wakeLock.isHeld()) {
                    wakeLock.release();
                }
            } catch (Exception ignored) {
                // ignore
            }
        }
    }
}
`;

fs.mkdirSync(path.dirname(alarmReceiverPath), { recursive: true });
fs.writeFileSync(alarmReceiverPath, alarmReceiverJava, 'utf8');
console.log('[patch-android-pip] YouAppAlarmReceiver.java creado.');

// 6. Escribir MainActivity.java con PiP 16:9, Share, Cast, TextToSpeech nativo HD y AlarmManager
const mainActivityJava = `package com.youapptv.app;

import android.app.AlarmManager;
import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Rational;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import java.util.Calendar;
import java.util.Locale;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final int ALARM_REQ_CODE = 7700;
    private String pendingTargetUrl = null;
    private boolean jsBridgeRegistered = false;
    private boolean suppressNextPiP = false;
    private TextToSpeech nativeTts = null;
    private boolean ttsReady = false;

    public class YouAppNativeBridge {
        @JavascriptInterface
        public boolean isSupported() {
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
        }

        @JavascriptInterface
        public void enterPiP() {
            runOnUiThread(() -> triggerNativePiP());
        }

        @JavascriptInterface
        public void share(String title, String text, String url) {
            runOnUiThread(() -> {
                StringBuilder body = new StringBuilder();
                if (text != null && !text.trim().isEmpty()) body.append(text.trim());
                if (url != null && !url.trim().isEmpty()) {
                    if (body.length() > 0) body.append(" ");
                    body.append(url.trim());
                }
                Intent sendIntent = new Intent(Intent.ACTION_SEND);
                sendIntent.setType("text/plain");
                if (title != null && !title.trim().isEmpty()) {
                    sendIntent.putExtra(Intent.EXTRA_SUBJECT, title.trim());
                }
                sendIntent.putExtra(Intent.EXTRA_TEXT, body.toString());
                Intent chooser = Intent.createChooser(sendIntent, title != null && !title.trim().isEmpty() ? title : "Compartir");
                suppressNextPiP = true;
                startActivity(chooser);
            });
        }

        @JavascriptInterface
        public void openCastSettings() {
            runOnUiThread(() -> {
                suppressNextPiP = true;
                try {
                    startActivity(new Intent(Settings.ACTION_CAST_SETTINGS));
                } catch (Exception e) {
                    try {
                        startActivity(new Intent(Settings.ACTION_WIRELESS_SETTINGS));
                    } catch (Exception ignored) {
                        // Dispositivo sin pantalla directa de Cast
                    }
                }
            });
        }

        @JavascriptInterface
        public boolean hasNativeTts() {
            return ttsReady && nativeTts != null;
        }

        @JavascriptInterface
        public void speak(String text, String langTag, float rate, float pitch) {
            runOnUiThread(() -> speakNative(text, langTag, rate, pitch));
        }

        @JavascriptInterface
        public void stopSpeak() {
            runOnUiThread(() -> {
                try {
                    if (nativeTts != null) nativeTts.stop();
                } catch (Exception ignored) {
                    // ignore
                }
            });
        }

        @JavascriptInterface
        public void scheduleAlarm(String configJson) {
            runOnUiThread(() -> scheduleNativeAlarm(configJson));
        }

        @JavascriptInterface
        public void cancelAlarm() {
            runOnUiThread(() -> cancelNativeAlarm());
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        initNativeTts();
        setupWebViewBridge();
        captureIncomingIntent(getIntent());
    }

    @Override
    public void onStart() {
        super.onStart();
        setupWebViewBridge();
        flushPendingTargetUrl();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureIncomingIntent(intent);
        flushPendingTargetUrl();
    }

    @Override
    public void onDestroy() {
        try {
            if (nativeTts != null) {
                nativeTts.stop();
                nativeTts.shutdown();
            }
        } catch (Exception ignored) {
            // ignore
        }
        super.onDestroy();
    }

    private void initNativeTts() {
        try {
            nativeTts = new TextToSpeech(this, status -> {
                if (status == TextToSpeech.SUCCESS && nativeTts != null) {
                    int res = nativeTts.setLanguage(new Locale("es", "AR"));
                    if (res == TextToSpeech.LANG_MISSING_DATA || res == TextToSpeech.LANG_NOT_SUPPORTED) {
                        nativeTts.setLanguage(new Locale("es", "ES"));
                    }
                    nativeTts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override
                        public void onStart(String utteranceId) {}

                        @Override
                        public void onDone(String utteranceId) {
                            notifyTtsFinished();
                        }

                        @Override
                        public void onError(String utteranceId) {
                            notifyTtsFinished();
                        }
                    });
                    ttsReady = true;
                }
            });
        } catch (Exception ignored) {
            ttsReady = false;
        }
    }

    private void notifyTtsFinished() {
        runOnUiThread(() -> {
            try {
                if (this.bridge != null && this.bridge.getWebView() != null) {
                    this.bridge.getWebView().evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('youapp-native-tts-done'));",
                        null
                    );
                }
            } catch (Exception ignored) {
                // ignore
            }
        });
    }

    private void speakNative(String text, String langTag, float rate, float pitch) {
        if (!ttsReady || nativeTts == null || text == null || text.trim().isEmpty()) {
            notifyTtsFinished();
            return;
        }
        try {
            if (langTag != null && !langTag.trim().isEmpty()) {
                Locale loc = Locale.forLanguageTag(langTag.replace('_', '-'));
                int res = nativeTts.setLanguage(loc);
                if (res == TextToSpeech.LANG_MISSING_DATA || res == TextToSpeech.LANG_NOT_SUPPORTED) {
                    nativeTts.setLanguage(new Locale("es", "AR"));
                }
            }
            float safeRate = Math.max(0.6f, Math.min(1.4f, rate > 0 ? rate : 0.96f));
            float safePitch = Math.max(0.6f, Math.min(1.4f, pitch > 0 ? pitch : 1.0f));
            nativeTts.setSpeechRate(safeRate);
            nativeTts.setPitch(safePitch);
            Bundle params = new Bundle();
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f);
            nativeTts.speak(text.trim(), TextToSpeech.QUEUE_FLUSH, params, "youapp_alarm_utt");
        } catch (Exception ignored) {
            notifyTtsFinished();
        }
    }

    private void scheduleNativeAlarm(String configJson) {
        try {
            JSONObject obj = new JSONObject(configJson);
            boolean enabled = obj.optBoolean("enabled", false);
            if (!enabled) {
                cancelNativeAlarm();
                return;
            }
            String timeStr = obj.optString("time", "07:30");
            String repeat = obj.optString("repeat", "weekdays");
            String[] parts = timeStr.split(":");
            if (parts.length != 2) return;
            int hour = Integer.parseInt(parts[0]);
            int minute = Integer.parseInt(parts[1]);

            Calendar cal = Calendar.getInstance();
            cal.set(Calendar.HOUR_OF_DAY, hour);
            cal.set(Calendar.MINUTE, minute);
            cal.set(Calendar.SECOND, 0);
            cal.set(Calendar.MILLISECOND, 0);

            if (cal.getTimeInMillis() <= System.currentTimeMillis() + 2000L) {
                cal.add(Calendar.DAY_OF_YEAR, 1);
            }
            if ("weekdays".equals(repeat)) {
                while (cal.get(Calendar.DAY_OF_WEEK) == Calendar.SATURDAY
                    || cal.get(Calendar.DAY_OF_WEEK) == Calendar.SUNDAY) {
                    cal.add(Calendar.DAY_OF_YEAR, 1);
                }
            }

            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;

            Intent intent = new Intent(this, YouAppAlarmReceiver.class);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getBroadcast(this, ALARM_REQ_CODE, intent, flags);

            Intent showIntent = new Intent(this, MainActivity.class);
            PendingIntent showPi = PendingIntent.getActivity(this, ALARM_REQ_CODE + 1, showIntent, flags);

            long triggerAt = cal.getTimeInMillis();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                try {
                    AlarmManager.AlarmClockInfo info = new AlarmManager.AlarmClockInfo(triggerAt, showPi);
                    am.setAlarmClock(info, pi);
                    return;
                } catch (SecurityException ignored) {
                    // Fallback si el sistema restringe exact alarm
                }
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            } else {
                am.set(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            }
        } catch (Exception ignored) {
            // ignore malformed JSON
        }
    }

    private void cancelNativeAlarm() {
        try {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent intent = new Intent(this, YouAppAlarmReceiver.class);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getBroadcast(this, ALARM_REQ_CODE, intent, flags);
            am.cancel(pi);
        } catch (Exception ignored) {
            // ignore
        }
    }

    private void wakeScreenForAlarm() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                setShowWhenLocked(true);
                setTurnScreenOn(true);
                KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
                if (km != null) {
                    km.requestDismissKeyguard(this, null);
                }
            } else {
                getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                        | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                        | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
                );
            }
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(7701);
        } catch (Exception ignored) {
            // ignore
        }
    }

    private void setupWebViewBridge() {
        if (jsBridgeRegistered || this.bridge == null || this.bridge.getWebView() == null) return;
        WebView webView = this.bridge.getWebView();
        WebSettings settings = webView.getSettings();
        settings.setMediaPlaybackRequiresUserGesture(false);
        webView.addJavascriptInterface(new YouAppNativeBridge(), "YouAppAndroidPiP");
        jsBridgeRegistered = true;
    }

    private void triggerNativePiP() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (!getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) return;
        try {
            PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder()
                .setAspectRatio(new Rational(16, 9));
            enterPictureInPictureMode(builder.build());
        } catch (Exception ignored) {
            // Ignorar si la actividad no permite PiP en este instante
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        suppressNextPiP = false;
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (suppressNextPiP) {
            suppressNextPiP = false;
            return;
        }
        triggerNativePiP();
    }

    private void captureIncomingIntent(Intent intent) {
        if (intent == null) return;
        if (intent.getBooleanExtra(YouAppAlarmReceiver.EXTRA_ALARM_TRIGGER, false)) {
            intent.removeExtra(YouAppAlarmReceiver.EXTRA_ALARM_TRIGGER);
            wakeScreenForAlarm();
            pendingTargetUrl = "https://youapptv.com/youmusic?alarmTrigger=1";
            return;
        }
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            String sharedTitle = intent.getStringExtra(Intent.EXTRA_SUBJECT);
            if (sharedText != null && !sharedText.trim().isEmpty()) {
                String url = "https://youapptv.com/share?text=" + Uri.encode(sharedText.trim());
                if (sharedTitle != null && !sharedTitle.trim().isEmpty()) {
                    url += "&title=" + Uri.encode(sharedTitle.trim());
                }
                pendingTargetUrl = url;
            }
        }
    }

    private void flushPendingTargetUrl() {
        if (pendingTargetUrl == null || this.bridge == null || this.bridge.getWebView() == null) return;
        final String targetUrl = pendingTargetUrl;
        pendingTargetUrl = null;
        WebView webView = this.bridge.getWebView();
        webView.postDelayed(() -> webView.loadUrl(targetUrl), 650);
    }
}
`;

fs.mkdirSync(path.dirname(mainActivityPath), { recursive: true });
fs.writeFileSync(mainActivityPath, mainActivityJava, 'utf8');
console.log('[patch-android-pip] MainActivity.java actualizado con PiP, Share, Cast, TTS nativo HD y AlarmManager.');
