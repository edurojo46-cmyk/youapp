/**
 * Parchea el proyecto Android generado por Capacitor para habilitar:
 * 1. Picture-in-Picture nativo de Android (supportsPictureInPicture="true" + 16:9 onUserLeaveHint + puente JS window.YouAppAndroidPiP.enterPiP())
 * 2. Share Target nativo de Android (ACTION_SEND text/plain -> https://youapptv.com/share?text=...)
 */
import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve('android/app/src/main/AndroidManifest.xml');
const mainActivityPath = path.resolve('android/app/src/main/java/com/youapptv/app/MainActivity.java');

if (!fs.existsSync(manifestPath)) {
  throw new Error(`No se encontró ${manifestPath}`);
}

let manifest = fs.readFileSync(manifestPath, 'utf8');

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

// 2. Habilitar supportsPictureInPicture y resizeableActivity en MainActivity
if (!manifest.includes('android:supportsPictureInPicture')) {
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
      if (!next.includes('smallestScreenSize')) {
        next = next.replace(
          /android:configChanges="([^"]*)"/,
          'android:configChanges="$1|smallestScreenSize|screenLayout|uiMode"'
        );
      }
      return `<activity${next}>`;
    }
  );
}

// 2. Agregar intent-filter nativo para Compartir enlaces hacia YOUAPP
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

fs.writeFileSync(manifestPath, manifest, 'utf8');
console.log('[patch-android-pip] AndroidManifest.xml actualizado con PiP nativo + Share Target.');

// 3. Escribir MainActivity.java con PiP automático (16:9), puente JS (PiP + Share OUT) y recepción robusta de Share IN
const mainActivityJava = `package com.youapptv.app;

import android.app.PictureInPictureParams;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Rational;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private String pendingShareUrl = null;
    private boolean jsBridgeRegistered = false;
    private boolean suppressNextPiP = false;

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
                // No achicar la app a PiP al abrir la hoja nativa de Compartir
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
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setupWebViewBridge();
        captureShareIntent(getIntent());
    }

    @Override
    public void onStart() {
        super.onStart();
        setupWebViewBridge();
        flushPendingShare();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureShareIntent(intent);
        flushPendingShare();
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
        // Al salir de YOUAPP (ej. tocar Inicio o cambiar a Infobae/WhatsApp), entra automáticamente en Picture-in-Picture 16:9
        triggerNativePiP();
    }

    private void captureShareIntent(Intent intent) {
        if (intent == null) return;
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            String sharedTitle = intent.getStringExtra(Intent.EXTRA_SUBJECT);
            if (sharedText != null && !sharedText.trim().isEmpty()) {
                String url = "https://youapptv.com/share?text=" + Uri.encode(sharedText.trim());
                if (sharedTitle != null && !sharedTitle.trim().isEmpty()) {
                    url += "&title=" + Uri.encode(sharedTitle.trim());
                }
                pendingShareUrl = url;
            }
        }
    }

    private void flushPendingShare() {
        if (pendingShareUrl == null || this.bridge == null || this.bridge.getWebView() == null) return;
        final String targetUrl = pendingShareUrl;
        pendingShareUrl = null;
        WebView webView = this.bridge.getWebView();
        // Espera breve para que Capacitor termine su carga inicial antes de navegar a /share
        webView.postDelayed(() -> webView.loadUrl(targetUrl), 700);
    }
}
`;

fs.mkdirSync(path.dirname(mainActivityPath), { recursive: true });
fs.writeFileSync(mainActivityPath, mainActivityJava, 'utf8');
console.log('[patch-android-pip] MainActivity.java actualizado con PiP nativo 16:9 y puente JS.');
