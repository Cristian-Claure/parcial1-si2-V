package com.velora.mobile.ui

import android.graphics.Bitmap
import android.graphics.Color
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.MultiFormatWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel

@Composable
fun QrCodeImage(
    payload: String,
    modifier: Modifier = Modifier
) {

    val bitmap =
        remember(payload) {
            generateQrBitmap(
                payload = payload,
                size = 768
            )
        }

    Image(
        bitmap =
            bitmap.asImageBitmap(),
        contentDescription =
            "Código QR de pago",
        modifier =
            modifier
                .fillMaxWidth()
                .aspectRatio(1f)
    )
}

private fun generateQrBitmap(
    payload: String,
    size: Int
): Bitmap {

    require(
        payload.isNotBlank()
    ) {
        "El contenido QR no puede estar vacío."
    }

    require(
        size > 0
    ) {
        "El tamaño del QR debe ser positivo."
    }

    val hints =
        mapOf(
            EncodeHintType.CHARACTER_SET to
                "UTF-8",

            EncodeHintType.ERROR_CORRECTION to
                ErrorCorrectionLevel.M,

            /*
             * ZXing añade la zona blanca
             * necesaria alrededor del QR.
             */
            EncodeHintType.MARGIN to
                2
        )

    val matrix =
        MultiFormatWriter()
            .encode(
                payload,
                BarcodeFormat.QR_CODE,
                size,
                size,
                hints
            )

    val pixels =
        IntArray(
            size * size
        )

    for (
        y in 0 until size
    ) {
        val rowOffset =
            y * size

        for (
            x in 0 until size
        ) {
            pixels[
                rowOffset + x
            ] =
                if (
                    matrix[x, y]
                ) {
                    Color.BLACK
                } else {
                    Color.WHITE
                }
        }
    }

    return Bitmap
        .createBitmap(
            pixels,
            size,
            size,
            Bitmap.Config.ARGB_8888
        )
}