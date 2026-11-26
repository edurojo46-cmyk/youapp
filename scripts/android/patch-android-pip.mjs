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

// 1. Habilitar supportsPictureInPicture y resizeableActivity en MainActivity
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
                <data android:mimeType="text/plain" />
            </intent-filter>
        </activity>`;
  manifest = manifest.replace('</activity>', shareFilter);
}

fs.writeFileSync(manifestPath, manifest, 'utf8');
console.log('[patch-android-pip] AndroidManifest.xml actualizado con PiP nativo + Share Target.');

// 3. Escribir MainActivity.java con PiP automático (16:9), puente JS y recepción de enlaces compartidos
const mainActivityJava = `package com.youapptv.app;

import android.app.PictureInPictureParams;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setupWebViewBridge();
        handleShareIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleShareIntent(intent);
    }

    private void setupWebViewBridge() {
        if (this.bridge == null || this.bridge.getWebView() == null) return;
        WebView webView = this.bridge.getWebView();
        WebSettings settings = webView.getSettings();
        settings.setMediaPlaybackRequiresUserGesture(false);
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public boolean isSupported() {
                return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    && getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
            }

            @JavascriptInterface
            public void enterPiP() {
                runOnUiThread(() -> triggerNativePiP());
            }
        }, "YouAppAndroidPiP");
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
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        // Al salir de YOUAPP (ej. tocar Inicio o cambiar a Infobae/WhatsApp), entra automáticamente en Picture-in-Picture 16:9
        triggerNativePiP();
    }

    private void handleShareIntent(Intent intent) {
        if (intent == null) return;
        if (Intent.ACTION_SEND.equals(intent.getAction()) && "text/plain".equals(intent.getType())) {
            String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (sharedText != null && !sharedText.trim().isEmpty() && this.bridge != null && this.bridge.getWebView() != null) {
                String targetUrl = "https://youapptv.com/share?text=" + Uri.encode(sharedText.trim());
                this.bridge.getWebView().post(() -> this.bridge.getWebView().loadUrl(targetUrl));
            }
        }
    }
}
`;

fs.mkdirSync(path.dirname(mainActivityPath), { recursive: true });
fs.writeFileSync(mainActivityPath, mainActivityJava, 'utf8');
console.log('[patch-android-pip] MainActivity.java actualizado con PiP nativo 16:9 y puente JS.');
