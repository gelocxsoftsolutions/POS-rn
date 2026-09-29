package com.nctseafoods.pos

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.os.Build
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.ByteArrayOutputStream
import java.util.UUID
import java.util.concurrent.Executors

class BluetoothPrinterModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  private val executor = Executors.newSingleThreadExecutor()

  override fun getName() = NAME

  private fun adapter(): BluetoothAdapter? {
    val manager = reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    return manager.adapter
  }

  private fun hasConnectPermission(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
      reactContext.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED

  private fun requireAdapter(promise: Promise): BluetoothAdapter? {
    if (!hasConnectPermission()) {
      promise.reject("BLUETOOTH_PERMISSION_REQUIRED", "Bluetooth permission has not been granted.")
      return null
    }
    val bluetoothAdapter = adapter()
    if (bluetoothAdapter == null) {
      promise.reject("BLUETOOTH_UNAVAILABLE", "This device does not support Bluetooth.")
      return null
    }
    if (!bluetoothAdapter.isEnabled) {
      promise.reject("BLUETOOTH_DISABLED", "Turn on Bluetooth, then try again.")
      return null
    }
    return bluetoothAdapter
  }

  @SuppressLint("MissingPermission")
  @ReactMethod
  fun getPairedDevices(promise: Promise) {
    val bluetoothAdapter = requireAdapter(promise) ?: return
    try {
      val devices = Arguments.createArray()
      bluetoothAdapter.bondedDevices
        .sortedWith(compareBy({ it.name.orEmpty().lowercase() }, { it.address }))
        .forEach { device ->
          val item = Arguments.createMap()
          item.putString("id", device.address)
          item.putString("address", device.address)
          item.putString("name", device.name ?: "Bluetooth device")
          item.putBoolean("connected", socket?.isConnected == true && connectedAddress == device.address)
          devices.pushMap(item)
        }
      promise.resolve(devices)
    } catch (error: Exception) {
      promise.reject("BLUETOOTH_LIST_FAILED", error.message ?: "Unable to list paired Bluetooth devices.", error)
    }
  }

  @SuppressLint("MissingPermission")
  @ReactMethod
  fun connect(address: String, promise: Promise) {
    val bluetoothAdapter = requireAdapter(promise) ?: return
    executor.execute {
      try {
        closeSocket()
        bluetoothAdapter.cancelDiscovery()
        val device = bluetoothAdapter.getRemoteDevice(address)
        val newSocket = device.createRfcommSocketToServiceRecord(SPP_UUID)
        newSocket.connect()
        socket = newSocket
        connectedAddress = address
        promise.resolve(true)
      } catch (error: Exception) {
        closeSocket()
        promise.reject("BLUETOOTH_CONNECT_FAILED", error.message ?: "Unable to connect to the printer.", error)
      }
    }
  }

  @ReactMethod
  fun disconnect(promise: Promise) {
    executor.execute {
      try {
        closeSocket()
        promise.resolve(true)
      } catch (error: Exception) {
        promise.reject("BLUETOOTH_DISCONNECT_FAILED", error.message ?: "Unable to disconnect the printer.", error)
      }
    }
  }

  @ReactMethod
  fun isConnected(address: String, promise: Promise) {
    promise.resolve(socket?.isConnected == true && connectedAddress == address)
  }

  @ReactMethod
  fun printTest(promise: Promise) {
    executor.execute {
      try {
        val activeSocket = socket
        if (activeSocket?.isConnected != true) {
          promise.reject("PRINTER_NOT_CONNECTED", "Connect a printer before printing a test slip.")
          return@execute
        }
        val output = ByteArrayOutputStream()
        output.write(byteArrayOf(0x1B, 0x40))
        output.write(byteArrayOf(0x1B, 0x61, 0x01))
        output.write(byteArrayOf(0x1B, 0x45, 0x01))
        output.write("NCT SEAFOODS POS\n".toByteArray(Charsets.US_ASCII))
        output.write(byteArrayOf(0x1B, 0x45, 0x00))
        output.write("Bluetooth printer connected\n".toByteArray(Charsets.US_ASCII))
        output.write("58mm ESC/POS test\n\n\n".toByteArray(Charsets.US_ASCII))
        activeSocket.outputStream.write(output.toByteArray())
        activeSocket.outputStream.flush()
        promise.resolve(true)
      } catch (error: Exception) {
        closeSocket()
        promise.reject("PRINTER_TEST_FAILED", error.message ?: "The test print failed.", error)
      }
    }
  }

  @ReactMethod
  fun printReceipt(content: String, logoDataUri: String?, barcodeValue: String?, qrMatrix: String?, openDrawer: Boolean, promise: Promise) {
    executor.execute {
      try {
        val activeSocket = socket
        if (activeSocket?.isConnected != true) {
          promise.reject("PRINTER_NOT_CONNECTED", "Connect a printer before printing a receipt.")
          return@execute
        }
        val output = ByteArrayOutputStream()
        output.write(byteArrayOf(0x1B, 0x40))
        output.write(byteArrayOf(0x1B, 0x61, 0x01))
        writeRasterLogo(output, logoDataUri)
        output.write("\n".toByteArray(Charsets.US_ASCII))
        output.write(byteArrayOf(0x1B, 0x61, 0x00))
        output.write(content.toByteArray(Charsets.US_ASCII))
        if (!barcodeValue.isNullOrBlank()) writeCode128(output, barcodeValue)
        if (!qrMatrix.isNullOrBlank()) writeQrMatrix(output, qrMatrix)
        output.write("\n\n\n".toByteArray(Charsets.US_ASCII))
        if (openDrawer) {
          output.write(byteArrayOf(0x1B, 0x70, 0x00, 0x32, 0xC8.toByte()))
        }
        activeSocket.outputStream.write(output.toByteArray())
        activeSocket.outputStream.flush()
        promise.resolve(true)
      } catch (error: Exception) {
        closeSocket()
        promise.reject("RECEIPT_PRINT_FAILED", error.message ?: "The receipt could not be printed.", error)
      }
    }
  }

  @ReactMethod
  fun printBarcode(label: String, value: String, promise: Promise) {
    executor.execute {
      try {
        val activeSocket = socket
        if (activeSocket?.isConnected != true) {
          promise.reject("PRINTER_NOT_CONNECTED", "Connect a printer before printing a barcode.")
          return@execute
        }
        val barcodeData = "{B$value".toByteArray(Charsets.US_ASCII)
        if (barcodeData.size > 255) {
          promise.reject("BARCODE_TOO_LONG", "This barcode is too long for the printer.")
          return@execute
        }
        val safeLabel = label.replace(Regex("[^\\x20-\\x7E]"), " ").take(32)
        val output = ByteArrayOutputStream()
        output.write(byteArrayOf(0x1B, 0x40, 0x1B, 0x61, 0x01))
        output.write(byteArrayOf(0x1B, 0x45, 0x01))
        output.write("$safeLabel\n".toByteArray(Charsets.US_ASCII))
        output.write(byteArrayOf(0x1B, 0x45, 0x00))
        writeCode128(output, value)
        output.write("\n\n\n".toByteArray(Charsets.US_ASCII))
        activeSocket.outputStream.write(output.toByteArray())
        activeSocket.outputStream.flush()
        promise.resolve(true)
      } catch (error: Exception) {
        closeSocket()
        promise.reject("BARCODE_PRINT_FAILED", error.message ?: "The barcode could not be printed.", error)
      }
    }
  }

  private fun writeCode128(output: ByteArrayOutputStream, value: String) {
    val data = "{B$value".toByteArray(Charsets.US_ASCII)
    if (data.size > 255) return
    output.write(byteArrayOf(0x1B, 0x61, 0x01))
    output.write(byteArrayOf(0x1D, 0x48, 0x02))
    output.write(byteArrayOf(0x1D, 0x68, 0x50))
    output.write(byteArrayOf(0x1D, 0x77, 0x02))
    output.write(byteArrayOf(0x1D, 0x6B, 0x49, data.size.toByte()))
    output.write(data)
    output.write('\n'.code)
    output.write(byteArrayOf(0x1B, 0x61, 0x00))
  }

  private fun writeRasterLogo(output: ByteArrayOutputStream, logoDataUri: String?) {
    if (logoDataUri.isNullOrBlank()) return
    val encoded = logoDataUri.substringAfter(',', logoDataUri)
    val decoded = Base64.decode(encoded, Base64.DEFAULT)
    val source = BitmapFactory.decodeByteArray(decoded, 0, decoded.size) ?: return
    val targetWidth = minOf(220, source.width)
    val targetHeight = maxOf(1, (source.height * (targetWidth.toFloat() / source.width)).toInt())
    val bitmap = Bitmap.createScaledBitmap(source, targetWidth, targetHeight, true)
    val widthBytes = (bitmap.width + 7) / 8
    val raster = ByteArray(widthBytes * bitmap.height)
    for (y in 0 until bitmap.height) {
      for (x in 0 until bitmap.width) {
        val pixel = bitmap.getPixel(x, y)
        val luminance = (Color.red(pixel) * 299 + Color.green(pixel) * 587 + Color.blue(pixel) * 114) / 1000
        if (Color.alpha(pixel) > 80 && luminance < 160) {
          val index = y * widthBytes + x / 8
          raster[index] = (raster[index].toInt() or (0x80 shr (x % 8))).toByte()
        }
      }
    }
    output.write(byteArrayOf(0x1D, 0x76, 0x30, 0x00))
    output.write(byteArrayOf(
      (widthBytes and 0xFF).toByte(),
      ((widthBytes shr 8) and 0xFF).toByte(),
      (bitmap.height and 0xFF).toByte(),
      ((bitmap.height shr 8) and 0xFF).toByte()
    ))
    output.write(raster)
    output.write('\n'.code)
    if (bitmap !== source) bitmap.recycle()
    source.recycle()
  }

  private fun writeQrMatrix(output: ByteArrayOutputStream, serialized: String) {
    val separator = serialized.indexOf('|')
    if (separator <= 0) return
    val matrixSize = serialized.substring(0, separator).toIntOrNull() ?: return
    val modules = serialized.substring(separator + 1)
    if (matrixSize <= 0 || modules.length != matrixSize * matrixSize) return
    val quietZone = 4
    val scale = minOf(9, maxOf(1, 360 / (matrixSize + quietZone * 2)))
    val rasterSize = (matrixSize + quietZone * 2) * scale
    val widthBytes = (rasterSize + 7) / 8
    val raster = ByteArray(widthBytes * rasterSize)
    for (row in 0 until matrixSize) {
      for (column in 0 until matrixSize) {
        if (modules[row * matrixSize + column] != '1') continue
        val startX = (column + quietZone) * scale
        val startY = (row + quietZone) * scale
        for (pixelY in startY until startY + scale) {
          for (pixelX in startX until startX + scale) {
            val index = pixelY * widthBytes + pixelX / 8
            raster[index] = (raster[index].toInt() or (0x80 shr (pixelX % 8))).toByte()
          }
        }
      }
    }
    output.write(byteArrayOf(0x1B, 0x61, 0x01))
    output.write(byteArrayOf(
      0x1D, 0x76, 0x30, 0x00,
      (widthBytes and 0xFF).toByte(),
      ((widthBytes shr 8) and 0xFF).toByte(),
      (rasterSize and 0xFF).toByte(),
      ((rasterSize shr 8) and 0xFF).toByte()
    ))
    output.write(raster)
    output.write('\n'.code)
    output.write(byteArrayOf(0x1B, 0x61, 0x00))
  }

  private fun closeSocket() {
    try {
      socket?.close()
    } finally {
      socket = null
      connectedAddress = null
    }
  }

  override fun invalidate() {
    closeSocket()
    executor.shutdownNow()
    super.invalidate()
  }

  companion object {
    const val NAME = "BluetoothPrinter"
    private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    @Volatile private var socket: BluetoothSocket? = null
    @Volatile private var connectedAddress: String? = null
  }
}
