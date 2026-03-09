package com.cammes.app

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.*
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    companion object {
        private const val ACTION_USB_PERMISSION = "com.cammes.app.USB_PERMISSION"
    }

    private lateinit var webView: WebView
    private lateinit var serialManager: UsbSerialManager

    // USB permission receiver
    private val usbPermissionReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == ACTION_USB_PERMISSION) {
                val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                if (granted) {
                    serialManager.connect()
                } else {
                    runOnUiThread {
                        webView.evaluateJavascript(
                            "if(window.onSerialStatus) onSerialStatus(false, 'Permesso USB negato');",
                            null
                        )
                    }
                }
            }
        }
    }

    // USB detach receiver
    private val usbDetachReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == UsbManager.ACTION_USB_DEVICE_DETACHED) {
                serialManager.disconnect()
                runOnUiThread {
                    webView.evaluateJavascript(
                        "if(window.onSerialStatus) onSerialStatus(false, 'Arduino disconnesso');",
                        null
                    )
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        serialManager = UsbSerialManager(this)

        // Set up serial callbacks
        serialManager.onDataReceived = { data ->
            runOnUiThread {
                val escaped = data.replace("'", "\\'").replace("\n", "\\n")
                webView.evaluateJavascript(
                    "if(window.onArduinoData) onArduinoData('$escaped');",
                    null
                )
            }
        }

        serialManager.onStatusChanged = { connected, message ->
            runOnUiThread {
                val escaped = message.replace("'", "\\'")
                webView.evaluateJavascript(
                    "if(window.onSerialStatus) onSerialStatus($connected, '$escaped');",
                    null
                )
            }
        }

        // Register USB receivers
        val permFilter = IntentFilter(ACTION_USB_PERMISSION)
        val detachFilter = IntentFilter(UsbManager.ACTION_USB_DEVICE_DETACHED)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(usbPermissionReceiver, permFilter, RECEIVER_NOT_EXPORTED)
            registerReceiver(usbDetachReceiver, detachFilter, RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(usbPermissionReceiver, permFilter)
            registerReceiver(usbDetachReceiver, detachFilter)
        }

        setupWebView()
    }

    private fun setupWebView() {
        webView = findViewById(R.id.webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            setSupportZoom(true)
            builtInZoomControls = true
            displayZoomControls = false
            useWideViewPort = true
            loadWithOverviewMode = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }

        // Add JavaScript bridge for serial communication
        webView.addJavascriptInterface(SerialBridge(), "AndroidSerial")

        // Handle file chooser for <input type="file">
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = filePathCallback

                val intent = fileChooserParams.createIntent()
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST_CODE)
                } catch (e: Exception) {
                    fileChooserCallback = null
                    return false
                }
                return true
            }
        }

        // Handle navigation within WebView
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                // Keep internal navigation in WebView
                if (url.startsWith("file:///android_asset/")) return false
                return false
            }
        }

        // Load the main page
        webView.loadUrl("file:///android_asset/alzata.html")
    }

    // JavaScript bridge for serial communication
    inner class SerialBridge {
        @JavascriptInterface
        fun send(cmd: String) {
            serialManager.send(cmd)
        }

        @JavascriptInterface
        fun connect(): Boolean {
            val usbManager = getSystemService(USB_SERVICE) as UsbManager
            val drivers = com.hoho.android.usbserial.driver.UsbSerialProber
                .getDefaultProber().findAllDrivers(usbManager)

            if (drivers.isEmpty()) return false

            val device = drivers[0].device
            if (!usbManager.hasPermission(device)) {
                val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                    PendingIntent.FLAG_MUTABLE else 0
                val pi = PendingIntent.getBroadcast(
                    this@MainActivity, 0,
                    Intent(ACTION_USB_PERMISSION), flags
                )
                usbManager.requestPermission(device, pi)
                return false
            }

            return serialManager.connect()
        }

        @JavascriptInterface
        fun disconnect() {
            serialManager.disconnect()
        }

        @JavascriptInterface
        fun isConnected(): Boolean {
            return serialManager.isConnected
        }

        @JavascriptInterface
        fun getDeviceInfo(): String {
            return serialManager.getDeviceInfo()
        }
    }

    // File chooser handling
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private val FILE_CHOOSER_REQUEST_CODE = 1001

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            fileChooserCallback?.onReceiveValue(
                WebChromeClient.FileChooserParams.parseResult(resultCode, data)
            )
            fileChooserCallback = null
        }
    }

    // Handle back button navigation
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        serialManager.disconnect()
        unregisterReceiver(usbPermissionReceiver)
        unregisterReceiver(usbDetachReceiver)
        super.onDestroy()
    }
}
