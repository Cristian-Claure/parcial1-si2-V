package com.velora.mobile.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.velora.mobile.data.CatalogApi
import com.velora.mobile.data.MobileProduct
import com.velora.mobile.data.MobileTryOnJob
import com.velora.mobile.data.SessionStore
import com.velora.mobile.data.TryOnApi
import com.velora.mobile.ui.theme.VeloraColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.InputStream

private const val MAX_TRY_ON_PERSON_BYTES = 5 * 1024 * 1024

private data class TryOnPersonSelection(
    val bytes: ByteArray,
    val filename: String,
    val contentType: String,
    val preview: ImageBitmap
)

@Composable
fun CustomerTryOnSection(
    initialProduct: MobileProduct?,
    initialVariantId: String?,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val sessionStore = remember(context) {
        SessionStore(context.applicationContext)
    }
    val tryOnApi = remember(context) {
        TryOnApi(tokenProvider = sessionStore::token)
    }
    val catalogApi = remember { CatalogApi() }

    var products by remember {
        mutableStateOf(
            initialProduct
                ?.takeIf {
                    it.status == "ACTIVE" &&
                        it.tryOnEnabled &&
                        it.tryOnReady
                }
                ?.let { listOf(it) }
                ?: emptyList()
        )
    }
    var loadingCatalog by remember { mutableStateOf(true) }
    var selectedProductId by rememberSaveable(initialProduct?.id) {
        mutableStateOf(initialProduct?.id.orEmpty())
    }
    var selectedVariantId by rememberSaveable(
        initialProduct?.id,
        initialVariantId
    ) {
        mutableStateOf(initialVariantId.orEmpty())
    }
    var person by remember {
        mutableStateOf<TryOnPersonSelection?>(null)
    }
    var job by remember {
        mutableStateOf<MobileTryOnJob?>(null)
    }
    var resultImage by remember {
        mutableStateOf<ImageBitmap?>(null)
    }
    var loadingImage by remember { mutableStateOf(false) }
    var running by remember { mutableStateOf(false) }
    var cancellationRequested by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }

    fun clearGeneration() {
        job = null
        resultImage = null
        error = ""
    }

    val galleryLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null) {
            scope.launch {
                loadingImage = true
                error = ""
                runCatching {
                    withContext(Dispatchers.IO) {
                        readTryOnGallerySelection(context, uri)
                    }
                }.onSuccess {
                    person = it
                    clearGeneration()
                }.onFailure {
                    error = it.message
                        ?: "No se pudo leer la fotografía."
                }
                loadingImage = false
            }
        }
    }

    val cameraLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicturePreview()
    ) { bitmap ->
        if (bitmap != null) {
            scope.launch {
                loadingImage = true
                error = ""
                runCatching {
                    withContext(Dispatchers.Default) {
                        createTryOnCameraSelection(bitmap)
                    }
                }.onSuccess {
                    person = it
                    clearGeneration()
                }.onFailure {
                    error = it.message
                        ?: "No se pudo preparar la fotografía."
                }
                loadingImage = false
            }
        }
    }

    LaunchedEffect(Unit) {
        if (!isTryOnOnline(context)) {
            loadingCatalog = false
            if (products.isEmpty()) {
                error =
                    "El probador virtual requiere conexión a internet."
            }
            return@LaunchedEffect
        }

        runCatching {
            withContext(Dispatchers.IO) {
                catalogApi.products().filter {
                    it.status == "ACTIVE" &&
                        it.tryOnEnabled &&
                        it.tryOnReady
                }
            }
        }.onSuccess { fetched ->
            val initial = initialProduct?.takeIf {
                it.status == "ACTIVE" &&
                    it.tryOnEnabled &&
                    it.tryOnReady
            }
            products = buildList {
                if (
                    initial != null &&
                    fetched.none { it.id == initial.id }
                ) {
                    add(initial)
                }
                addAll(fetched)
            }
            if (selectedProductId.isBlank()) {
                selectedProductId =
                    products.firstOrNull()?.id.orEmpty()
            }
            loadingCatalog = false
        }.onFailure {
            loadingCatalog = false
            if (products.isEmpty()) {
                error = it.message
                    ?: "No se pudo cargar el catálogo del probador."
            }
        }
    }

    val selectedProduct = products.firstOrNull {
        it.id == selectedProductId
    }
    val activeVariants =
        selectedProduct?.variants?.filter { it.active }.orEmpty()

    LaunchedEffect(selectedProductId, products) {
        val variants = products
            .firstOrNull { it.id == selectedProductId }
            ?.variants
            ?.filter { it.active }
            .orEmpty()

        if (variants.none { it.id == selectedVariantId }) {
            val preferred = if (
                selectedProductId == initialProduct?.id
            ) {
                variants.firstOrNull {
                    it.id == initialVariantId
                }
            } else {
                null
            }
            selectedVariantId =
                (preferred ?: variants.firstOrNull())
                    ?.id
                    .orEmpty()
        }
    }

    Column(modifier = Modifier.fillMaxWidth()) {
        OutlinedButton(onClick = onBack) {
            Text("← VOLVER")
        }

        Spacer(Modifier.height(18.dp))
        Text(
            "EXPERIENCIA VÉLORA",
            color = VeloraColors.Terracotta,
            fontWeight = FontWeight.Bold
        )
        Text(
            "Probador virtual",
            color = VeloraColors.Ink,
            style = MaterialTheme.typography.headlineLarge
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "Elija una prenda compatible y use una fotografía clara " +
                "de cuerpo completo.",
            color = VeloraColors.Muted
        )

        Spacer(Modifier.height(24.dp))
        TryOnSectionTitle("01 · PRENDA")

        when {
            loadingCatalog -> CircularProgressIndicator(
                modifier = Modifier.size(28.dp)
            )
            products.isEmpty() -> Text(
                "Aún no hay prendas listas para el probador.",
                color = VeloraColors.Muted
            )
            else -> Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                products.forEach { product ->
                    FilterChip(
                        selected = selectedProductId == product.id,
                        onClick = {
                            if (!running) {
                                selectedProductId = product.id
                                selectedVariantId = ""
                                clearGeneration()
                            }
                        },
                        label = { Text(product.name) }
                    )
                }
            }
        }

        selectedProduct?.let { product ->
            Spacer(Modifier.height(12.dp))
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = VeloraColors.SurfaceSoft
                )
            ) {
                Column(Modifier.padding(16.dp)) {
                    Text(
                        product.categoryName.uppercase(),
                        color = VeloraColors.Terracotta,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        product.name,
                        color = VeloraColors.Ink,
                        style = MaterialTheme.typography.titleLarge
                    )
                    Text(
                        "Categoría Try-On: " +
                            (
                                product.tryOnCategory
                                    ?: product.categoryName
                            ),
                        color = VeloraColors.Muted
                    )
                }
            }

            Spacer(Modifier.height(12.dp))
            Text(
                "Color y talla",
                color = VeloraColors.Ink,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                activeVariants.forEach { variant ->
                    FilterChip(
                        selected = selectedVariantId == variant.id,
                        onClick = {
                            if (!running) {
                                selectedVariantId = variant.id
                                clearGeneration()
                            }
                        },
                        label = {
                            Text(
                                "${variant.color} · ${variant.size}"
                            )
                        }
                    )
                }
            }
        }

        Spacer(Modifier.height(24.dp))
        TryOnSectionTitle("02 · SU FOTO")

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            OutlinedButton(
                modifier = Modifier.weight(1f),
                enabled = !running && !loadingImage,
                onClick = {
                    galleryLauncher.launch("image/*")
                }
            ) {
                Text("GALERÍA")
            }
            OutlinedButton(
                modifier = Modifier.weight(1f),
                enabled = !running && !loadingImage,
                onClick = {
                    cameraLauncher.launch(null)
                }
            ) {
                Text("CÁMARA")
            }
        }

        if (loadingImage) {
            Spacer(Modifier.height(12.dp))
            CircularProgressIndicator(
                modifier = Modifier.size(28.dp)
            )
        }

        person?.let { selection ->
            Spacer(Modifier.height(14.dp))
            Card(modifier = Modifier.fillMaxWidth()) {
                Image(
                    bitmap = selection.preview,
                    contentDescription =
                        "Fotografía seleccionada para el probador",
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(360.dp),
                    contentScale = ContentScale.Fit
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "${selection.contentType} · " +
                    "${selection.bytes.size / 1024} KB",
                color = VeloraColors.Muted,
                style = MaterialTheme.typography.bodySmall
            )
        }

        Spacer(Modifier.height(14.dp))
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = VeloraColors.SurfaceSoft
            )
        ) {
            Column(Modifier.padding(16.dp)) {
                Text(
                    "PRIVACIDAD POR DISEÑO",
                    color = VeloraColors.Terracotta,
                    fontWeight = FontWeight.Bold
                )
                Spacer(Modifier.height(5.dp))
                Text(
                    "La app mantiene la foto seleccionada en memoria " +
                        "durante esta experiencia y no la escribe en " +
                        "archivos propios. El resultado generado sí " +
                        "puede conservarse en VÉLORA para mostrárselo.",
                    color = VeloraColors.Muted
                )
            }
        }

        if (error.isNotBlank()) {
            Spacer(Modifier.height(12.dp))
            Text(error, color = VeloraColors.Error)
        }

        Spacer(Modifier.height(16.dp))
        Button(
            modifier = Modifier.fillMaxWidth(),
            enabled = !running &&
                !loadingCatalog &&
                !loadingImage &&
                selectedProduct != null &&
                selectedVariantId.isNotBlank() &&
                person != null,
            onClick = {
                val product = selectedProduct
                val selection = person

                if (
                    product != null &&
                    selection != null &&
                    selectedVariantId.isNotBlank()
                ) {
                    if (!isTryOnOnline(context)) {
                        error =
                            "El probador virtual requiere conexión a internet."
                    } else if (
                        sessionStore.token().isNullOrBlank()
                    ) {
                        error =
                            "La sesión expiró. Inicie sesión nuevamente."
                    } else {
                        running = true
                        cancellationRequested = false
                        clearGeneration()

                        scope.launch {
                            try {
                                var current = withContext(
                                    Dispatchers.IO
                                ) {
                                    tryOnApi.createJob(
                                        productId = product.id,
                                        variantId =
                                            selectedVariantId,
                                        personBytes =
                                            selection.bytes,
                                        filename =
                                            selection.filename,
                                        contentType =
                                            selection.contentType
                                    )
                                }
                                job = current

                                while (
                                    !cancellationRequested &&
                                    current.status !in setOf(
                                        "SUCCEEDED",
                                        "FAILED",
                                        "CANCELLED"
                                    )
                                ) {
                                    delay(1_500)
                                    current = withContext(
                                        Dispatchers.IO
                                    ) {
                                        tryOnApi.getJob(
                                            current.id
                                        )
                                    }
                                    job = current
                                }

                                when (current.status) {
                                    "SUCCEEDED" -> {
                                        val bytes =
                                            withContext(
                                                Dispatchers.IO
                                            ) {
                                                tryOnApi.result(
                                                    current.id
                                                )
                                            }
                                        resultImage =
                                            decodeTryOnImage(bytes)
                                        error = ""
                                    }
                                    "FAILED" -> {
                                        error =
                                            current.errorMessage
                                                ?: "No se pudo generar " +
                                                "la prueba virtual."
                                    }
                                    "CANCELLED" -> {
                                        error =
                                            "La generación fue cancelada."
                                    }
                                }
                            } catch (failure: Exception) {
                                if (!cancellationRequested) {
                                    error =
                                        failure.message
                                            ?: "No se pudo completar " +
                                            "el probador virtual."
                                }
                            } finally {
                                running = false
                            }
                        }
                    }
                }
            }
        ) {
            Text(
                if (running) {
                    "GENERANDO..."
                } else {
                    "PROBAR ESTA PRENDA"
                }
            )
        }

        if (running && job != null) {
            Spacer(Modifier.height(10.dp))
            OutlinedButton(
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    val current = job
                    if (current != null) {
                        cancellationRequested = true
                        scope.launch {
                            runCatching {
                                withContext(Dispatchers.IO) {
                                    tryOnApi.cancelJob(
                                        current.id
                                    )
                                }
                            }.onSuccess {
                                job = it
                            }.onFailure {
                                error =
                                    it.message
                                        ?: "No se pudo cancelar " +
                                        "la generación."
                            }
                            running = false
                        }
                    }
                }
            ) {
                Text("CANCELAR GENERACIÓN")
            }
        }

        job?.let { current ->
            Spacer(Modifier.height(14.dp))
            Text(
                tryOnStatusLabel(current.status),
                color = if (current.status == "FAILED") {
                    VeloraColors.Error
                } else {
                    VeloraColors.Muted
                }
            )
        }

        resultImage?.let { image ->
            Spacer(Modifier.height(24.dp))
            TryOnSectionTitle("03 · RESULTADO")
            Card(modifier = Modifier.fillMaxWidth()) {
                Image(
                    bitmap = image,
                    contentDescription =
                        "Resultado del probador virtual VÉLORA",
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(520.dp),
                    contentScale = ContentScale.Fit
                )
            }
            job?.durationMs?.let { duration ->
                Spacer(Modifier.height(8.dp))
                Text(
                    "Generación: $duration ms",
                    color = VeloraColors.Muted,
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }

        Spacer(Modifier.height(28.dp))
    }
}

@Composable
private fun TryOnSectionTitle(text: String) {
    Text(
        text,
        color = VeloraColors.Terracotta,
        fontWeight = FontWeight.Bold
    )
    Spacer(Modifier.height(10.dp))
}

private fun tryOnStatusLabel(status: String): String =
    when (status) {
        "QUEUED" -> "Preparando experiencia..."
        "PROCESSING" -> "Creando su prueba virtual..."
        "SUCCEEDED" -> "Resultado listo"
        "FAILED" -> "No se pudo generar el resultado"
        "CANCELLED" -> "Generación cancelada"
        else -> status
    }

private fun readTryOnGallerySelection(
    context: Context,
    uri: Uri
): TryOnPersonSelection {
    val resolver = context.contentResolver
    var filename: String? = null
    var declaredSize: Long? = null

    resolver.query(
        uri,
        arrayOf(
            OpenableColumns.DISPLAY_NAME,
            OpenableColumns.SIZE
        ),
        null,
        null,
        null
    )?.use { cursor ->
        if (cursor.moveToFirst()) {
            val nameIndex =
                cursor.getColumnIndex(
                    OpenableColumns.DISPLAY_NAME
                )
            val sizeIndex =
                cursor.getColumnIndex(
                    OpenableColumns.SIZE
                )

            if (nameIndex >= 0) {
                filename =
                    cursor.getString(nameIndex)
            }
            if (
                sizeIndex >= 0 &&
                !cursor.isNull(sizeIndex)
            ) {
                declaredSize =
                    cursor.getLong(sizeIndex)
            }
        }
    }

    declaredSize?.let { size ->
        if (size > MAX_TRY_ON_PERSON_BYTES) {
            throw IllegalArgumentException(
                "La fotografía debe pesar como máximo 5 MB."
            )
        }
    }

    val bytes = resolver.openInputStream(uri)?.use {
        readTryOnLimited(
            it,
            MAX_TRY_ON_PERSON_BYTES
        )
    } ?: throw IllegalArgumentException(
        "No se pudo abrir la fotografía."
    )

    val contentType = detectTryOnImageType(bytes)
        ?: throw IllegalArgumentException(
            "Use una fotografía PNG, JPEG o WEBP."
        )

    return TryOnPersonSelection(
        bytes = bytes,
        filename = filename
            ?.takeIf { it.isNotBlank() }
            ?: defaultTryOnFilename(contentType),
        contentType = contentType,
        preview = decodeTryOnImage(bytes)
    )
}

private fun createTryOnCameraSelection(
    bitmap: Bitmap
): TryOnPersonSelection {
    val bytes = ByteArrayOutputStream().use { output ->
        if (
            !bitmap.compress(
                Bitmap.CompressFormat.JPEG,
                95,
                output
            )
        ) {
            throw IllegalArgumentException(
                "No se pudo preparar la fotografía de cámara."
            )
        }
        output.toByteArray()
    }

    if (bytes.size > MAX_TRY_ON_PERSON_BYTES) {
        throw IllegalArgumentException(
            "La fotografía de cámara supera 5 MB."
        )
    }

    return TryOnPersonSelection(
        bytes = bytes,
        filename = "velora-camera.jpg",
        contentType = "image/jpeg",
        preview = decodeTryOnImage(bytes)
    )
}

private fun decodeTryOnImage(
    bytes: ByteArray
): ImageBitmap {
    val bitmap = BitmapFactory.decodeByteArray(
        bytes,
        0,
        bytes.size
    ) ?: throw IllegalArgumentException(
        "La imagen seleccionada no es válida."
    )
    return bitmap.asImageBitmap()
}

private fun readTryOnLimited(
    stream: InputStream,
    maxBytes: Int
): ByteArray {
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(8 * 1024)
    var total = 0

    while (true) {
        val read = stream.read(buffer)
        if (read < 0) {
            break
        }
        total += read
        if (total > maxBytes) {
            throw IllegalArgumentException(
                "La fotografía debe pesar como máximo 5 MB."
            )
        }
        output.write(buffer, 0, read)
    }

    return output.toByteArray()
}

private fun detectTryOnImageType(
    bytes: ByteArray
): String? {
    if (
        bytes.size >= 3 &&
        bytes[0] == 0xFF.toByte() &&
        bytes[1] == 0xD8.toByte() &&
        bytes[2] == 0xFF.toByte()
    ) {
        return "image/jpeg"
    }

    if (
        bytes.size >= 8 &&
        bytes[0] == 0x89.toByte() &&
        bytes[1] == 0x50.toByte() &&
        bytes[2] == 0x4E.toByte() &&
        bytes[3] == 0x47.toByte() &&
        bytes[4] == 0x0D.toByte() &&
        bytes[5] == 0x0A.toByte() &&
        bytes[6] == 0x1A.toByte() &&
        bytes[7] == 0x0A.toByte()
    ) {
        return "image/png"
    }

    if (
        bytes.size >= 12 &&
        String(
            bytes,
            0,
            4,
            Charsets.US_ASCII
        ) == "RIFF" &&
        String(
            bytes,
            8,
            4,
            Charsets.US_ASCII
        ) == "WEBP"
    ) {
        return "image/webp"
    }

    return null
}

private fun defaultTryOnFilename(
    contentType: String
): String =
    when (contentType) {
        "image/png" ->
            "velora-person.png"
        "image/webp" ->
            "velora-person.webp"
        else ->
            "velora-person.jpg"
    }

private fun isTryOnOnline(
    context: Context
): Boolean {
    val manager = context.getSystemService(
        ConnectivityManager::class.java
    ) ?: return false

    val network =
        manager.activeNetwork
            ?: return false

    val capabilities =
        manager.getNetworkCapabilities(network)
            ?: return false

    return capabilities.hasCapability(
        NetworkCapabilities.NET_CAPABILITY_INTERNET
    )
}
