package com.cammes.app

import android.content.Context
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import com.hoho.android.usbserial.driver.UsbSerialDriver
import com.hoho.android.usbserial.driver.UsbSerialPort
import com.hoho.android.usbserial.driver.UsbSerialProber
import com.hoho.android.usbserial.util.SerialInputOutputManager
import java.io.IOException
import java.util.concurrent.Executors

class UsbSerialManager(private val context: Context) {

    private var port: UsbSerialPort? = null
    private var ioManager: SerialInputOutputManager? = null
    var onDataReceived: ((String) -> Unit)? = null
    var onStatusChanged: ((Boolean, String) -> Unit)? = null

    private var buffer = StringBuilder()

    val isConnected: Boolean
        get() = port?.isOpen == true

    fun connect(): Boolean {
        val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
        val availableDrivers = UsbSerialProber.getDefaultProber().findAllDrivers(usbManager)

        if (availableDrivers.isEmpty()) {
            onStatusChanged?.invoke(false, "Nessun Arduino trovato")
            return false
        }

        val driver = availableDrivers[0]
        val connection = usbManager.openDevice(driver.device)
        if (connection == null) {
            onStatusChanged?.invoke(false, "Permesso USB negato")
            return false
        }

        port = driver.ports[0]
        try {
            port!!.open(connection)
            port!!.setParameters(9600, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE)

            // Start reading data
            ioManager = SerialInputOutputManager(port!!, object : SerialInputOutputManager.Listener {
                override fun onNewData(data: ByteArray) {
                    val str = String(data)
                    buffer.append(str)

                    // Parse complete messages (terminated by "*se")
                    while (true) {
                        val idx = buffer.indexOf("*se")
                        if (idx < 0) break
                        val message = buffer.substring(0, idx)
                        buffer.delete(0, idx + 3)
                        onDataReceived?.invoke(message.trim())
                    }
                }

                override fun onRunError(e: Exception) {
                    onStatusChanged?.invoke(false, "Errore: ${e.message}")
                }
            })
            ioManager!!.start()

            val deviceName = driver.device.productName ?: "Arduino"
            onStatusChanged?.invoke(true, "Connesso a $deviceName")
            return true

        } catch (e: IOException) {
            onStatusChanged?.invoke(false, "Errore connessione: ${e.message}")
            return false
        }
    }

    fun disconnect() {
        ioManager?.stop()
        ioManager = null
        try {
            port?.close()
        } catch (_: IOException) {}
        port = null
        onStatusChanged?.invoke(false, "Disconnesso")
    }

    fun send(data: String) {
        try {
            port?.write(data.toByteArray(), 1000)
        } catch (e: IOException) {
            onStatusChanged?.invoke(false, "Errore invio: ${e.message}")
        }
    }

    fun getDeviceInfo(): String {
        val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
        val drivers = UsbSerialProber.getDefaultProber().findAllDrivers(usbManager)
        if (drivers.isEmpty()) return "Nessun dispositivo"
        val d = drivers[0].device
        return "${d.productName ?: "Unknown"} (VID:${d.vendorId} PID:${d.productId})"
    }
}
