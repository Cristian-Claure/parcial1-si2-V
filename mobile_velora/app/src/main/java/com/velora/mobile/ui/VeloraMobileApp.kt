package com.velora.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.velora.mobile.data.MobileOrder
import com.velora.mobile.data.MobileProduct
import com.velora.mobile.ui.theme.VeloraColors

private enum class AuthScreen {
    LOGIN,
    REGISTER
}

private enum class CustomerScreen {
    HOME,
    CATALOG,
    PRODUCT_DETAIL,
    FAVORITES,
    CART,
    ACCOUNT,
    ORDERS,
    CHECKOUT,
    PAYMENT
}

@Composable
fun VeloraMobileApp(viewModel: AuthViewModel = viewModel()) {
    val state by viewModel.state.collectAsState()
    var screen by remember { mutableStateOf(AuthScreen.LOGIN) }

    if (state.authenticated) {
        CustomerHome(
            firstName = state.firstName,
            email = state.email,
            onLogout = viewModel::logout
        )
        return
    }

    when (screen) {
        AuthScreen.LOGIN -> LoginScreen(
            loading = state.loading,
            error = state.error,
            onLogin = viewModel::login,
            onRegister = {
                viewModel.clearError()
                screen = AuthScreen.REGISTER
            }
        )

        AuthScreen.REGISTER -> RegisterScreen(
            loading = state.loading,
            error = state.error,
            onRegister = viewModel::register,
            onBack = {
                viewModel.clearError()
                screen = AuthScreen.LOGIN
            }
        )
    }
}

@Composable
private fun BrandHeader() {
    Column {
        Text(
            text = "VÉLORA",
            color = VeloraColors.Ink,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = "MODA QUE TE DEFINE.",
            color = VeloraColors.Muted,
            style = MaterialTheme.typography.labelSmall
        )
    }
}

@Composable
private fun LoginScreen(
    loading: Boolean,
    error: String,
    onLogin: (String, String) -> Unit,
    onRegister: () -> Unit
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    AuthCanvas {
        BrandHeader()
        Spacer(Modifier.height(56.dp))
        Text("ACCESO PERSONAL", color = VeloraColors.Terracotta)
        Text(
            "Bienvenido de nuevo.",
            color = VeloraColors.Ink,
            fontStyle = FontStyle.Italic,
            style = MaterialTheme.typography.headlineLarge
        )
        Spacer(Modifier.height(28.dp))

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Correo electrónico") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)
        )

        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Contraseña") },
            visualTransformation = PasswordVisualTransformation()
        )

        if (error.isNotBlank()) {
            Spacer(Modifier.height(12.dp))
            Text(error, color = VeloraColors.Error)
        }

        Spacer(Modifier.height(20.dp))

        PrimaryButton(
            text = if (loading) "INGRESANDO..." else "INICIAR SESIÓN",
            enabled = !loading,
            onClick = { onLogin(email, password) }
        )

        Spacer(Modifier.height(18.dp))

        TextButton(onClick = onRegister) {
            Text("CREAR CUENTA", color = VeloraColors.Ink)
        }
    }
}

@Composable
private fun RegisterScreen(
    loading: Boolean,
    error: String,
    onRegister: (String, String, String, String) -> Unit,
    onBack: () -> Unit
) {
    var firstName by remember { mutableStateOf("") }
    var lastName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    AuthCanvas {
        BrandHeader()
        Spacer(Modifier.height(42.dp))
        Text("NUEVA CUENTA", color = VeloraColors.Terracotta)
        Text(
            "Su experiencia comienza aquí.",
            color = VeloraColors.Ink,
            style = MaterialTheme.typography.headlineMedium
        )
        Spacer(Modifier.height(24.dp))

        OutlinedTextField(
            value = firstName,
            onValueChange = { firstName = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Nombre") }
        )
        Spacer(Modifier.height(10.dp))

        OutlinedTextField(
            value = lastName,
            onValueChange = { lastName = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Apellido") }
        )
        Spacer(Modifier.height(10.dp))

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Correo") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)
        )
        Spacer(Modifier.height(10.dp))

        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Contraseña") },
            visualTransformation = PasswordVisualTransformation()
        )

        if (error.isNotBlank()) {
            Spacer(Modifier.height(12.dp))
            Text(error, color = VeloraColors.Error)
        }

        Spacer(Modifier.height(18.dp))

        PrimaryButton(
            text = if (loading) "CREANDO..." else "CREAR CUENTA",
            enabled = !loading,
            onClick = { onRegister(firstName, lastName, email, password) }
        )

        Spacer(Modifier.height(12.dp))

        TextButton(onClick = onBack) {
            Text("VOLVER A INICIAR SESIÓN", color = VeloraColors.Ink)
        }
    }
}

@Composable
private fun CustomerHome(
    firstName: String,
    email: String,
    onLogout: () -> Unit,
    cartViewModel: CartViewModel = viewModel(),
    checkoutViewModel: CheckoutViewModel = viewModel(),
    ordersViewModel: OrdersViewModel = viewModel()
) {
    val cartState by
        cartViewModel.state.collectAsState()

    var customerScreen by remember {
        mutableStateOf(
            CustomerScreen.HOME
        )
    }

    var selectedProduct by remember {
        mutableStateOf<MobileProduct?>(
            null
        )
    }

    var selectedOrder by remember {
        mutableStateOf<MobileOrder?>(
            null
        )
    }

    /*
     * Cuando cambia la sesión customer,
     * sincronizamos nuevamente la bolsa
     * con el usuario autenticado actual.
     */
    LaunchedEffect(email) {
        cartViewModel.load()
    }

    Scaffold(
        containerColor =
            VeloraColors.Surface,
        bottomBar = {
            when (customerScreen) {
                CustomerScreen.HOME,
                CustomerScreen.CATALOG,
                CustomerScreen.FAVORITES,
                CustomerScreen.CART,
                CustomerScreen.ACCOUNT -> {
                    CustomerBottomNavigation(
                        currentScreen =
                            customerScreen,
                        cartCount =
                            cartState.cart.totalItems,
                        onSelect = {
                            destination ->

                            if (
                                destination ==
                                    CustomerScreen.CART
                            ) {
                                cartViewModel.load()
                            }

                            customerScreen =
                                destination
                        }
                    )
                }

                else -> Unit
            }
        }
    ) { innerPadding ->

        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(
                        innerPadding
                    )
                    .padding(
                        horizontal =
                            24.dp,
                        vertical =
                            18.dp
                    )
                    .verticalScroll(
                        rememberScrollState()
                    )
        ) {
            BrandHeader()

        Spacer(
            Modifier.height(28.dp)
        )

        Text(
            text = "MI EXPERIENCIA",
            color =
                VeloraColors.Terracotta
        )

        Text(
            text = "Hola, $firstName.",
            color =
                VeloraColors.Ink,
            style =
                MaterialTheme
                    .typography
                    .headlineLarge
        )

        Spacer(
            Modifier.height(8.dp)
        )

        Text(
            text = email,
            color =
                VeloraColors.Muted
        )

        Spacer(
            Modifier.height(26.dp)
        )

        when (customerScreen) {

            CustomerScreen.HOME -> {

                Text(
                    text =
                        "VÉLORA PARA USTED",
                    color =
                        VeloraColors.Terracotta,
                    fontWeight =
                        FontWeight.Bold,
                    style =
                        MaterialTheme
                            .typography
                            .labelMedium
                )

                Spacer(
                    Modifier.height(8.dp)
                )

                Text(
                    text =
                        "Hola, $firstName.",
                    color =
                        VeloraColors.Ink,
                    style =
                        MaterialTheme
                            .typography
                            .displaySmall
                )

                Spacer(
                    Modifier.height(8.dp)
                )

                Text(
                    text =
                        "Descubra piezas para cada momento y continúe su experiencia donde la dejó.",
                    color =
                        VeloraColors.Muted,
                    style =
                        MaterialTheme
                            .typography
                            .bodyLarge
                )

                Spacer(
                    Modifier.height(24.dp)
                )

                Card(
                    modifier =
                        Modifier.fillMaxWidth(),
                    shape =
                        MaterialTheme
                            .shapes
                            .large,
                    colors =
                        CardDefaults.cardColors(
                            containerColor =
                                VeloraColors.Ink
                        )
                ) {

                    Column(
                        modifier =
                            Modifier.padding(
                                24.dp
                            )
                    ) {

                        Text(
                            text =
                                "NUEVA COLECCIÓN",
                            color =
                                VeloraColors.Champagne,
                            fontWeight =
                                FontWeight.Bold,
                            style =
                                MaterialTheme
                                    .typography
                                    .labelMedium
                        )

                        Spacer(
                            Modifier.height(10.dp)
                        )

                        Text(
                            text =
                                "Encuentre la pieza que define su estilo.",
                            color =
                                VeloraColors.Ivory,
                            style =
                                MaterialTheme
                                    .typography
                                    .headlineMedium
                        )

                        Spacer(
                            Modifier.height(10.dp)
                        )

                        Text(
                            text =
                                "Prendas, calzado y accesorios seleccionados para acompañarla.",
                            color =
                                VeloraColors.MutedLight,
                            style =
                                MaterialTheme
                                    .typography
                                    .bodyMedium
                        )

                        Spacer(
                            Modifier.height(20.dp)
                        )

                        Button(
                            modifier =
                                Modifier.fillMaxWidth(),
                            onClick = {
                                customerScreen =
                                    CustomerScreen.CATALOG
                            },
                            colors =
                                ButtonDefaults
                                    .buttonColors(
                                        containerColor =
                                            VeloraColors.Ivory,
                                        contentColor =
                                            VeloraColors.Ink
                                    )
                        ) {
                            Text(
                                "EXPLORAR COLECCIÓN"
                            )
                        }
                    }
                }

                Spacer(
                    Modifier.height(28.dp)
                )

                Text(
                    text =
                        "CONTINÚE SU EXPERIENCIA",
                    color =
                        VeloraColors.Terracotta,
                    fontWeight =
                        FontWeight.Bold,
                    style =
                        MaterialTheme
                            .typography
                            .labelMedium
                )

                Spacer(
                    Modifier.height(12.dp)
                )

                CustomerTile(
                    title =
                        "MI BOLSA",
                    subtitle =
                        if (
                            cartState.cart.totalItems ==
                                0
                        ) {
                            "Su próxima elección comienza aquí"
                        }
                        else {
                            "${cartState.cart.totalItems} producto(s) esperando por usted"
                        },
                    modifier =
                        Modifier.fillMaxWidth(),
                    onClick = {
                        cartViewModel.load()

                        customerScreen =
                            CustomerScreen.CART
                    }
                )

                Spacer(
                    Modifier.height(12.dp)
                )

                Row(
                    modifier =
                        Modifier.fillMaxWidth(),
                    horizontalArrangement =
                        Arrangement.spacedBy(
                            12.dp
                        )
                ) {

                    CustomerTile(
                        title =
                            "PEDIDOS",
                        subtitle =
                            "Estado e historial",
                        modifier =
                            Modifier.weight(1f),
                        onClick = {
                            ordersViewModel.load()

                            customerScreen =
                                CustomerScreen.ORDERS
                        }
                    )

                    CustomerTile(
                        title =
                            "FAVORITOS",
                        subtitle =
                            "Sus piezas guardadas",
                        modifier =
                            Modifier.weight(1f),
                        onClick = {
                            customerScreen =
                                CustomerScreen.FAVORITES
                        }
                    )
                }

                Spacer(
                    Modifier.height(12.dp)
                )

                CustomerTile(
                    title =
                        "MI CUENTA",
                    subtitle =
                        "Perfil, pedidos y preferencias",
                    modifier =
                        Modifier.fillMaxWidth(),
                    onClick = {
                        customerScreen =
                            CustomerScreen.ACCOUNT
                    }
                )

                Spacer(
                    Modifier.height(28.dp)
                )

                Surface(
                    modifier =
                        Modifier.fillMaxWidth(),
                    shape =
                        MaterialTheme
                            .shapes
                            .medium,
                    color =
                        VeloraColors.SurfaceSoft
                ) {

                    Column(
                        modifier =
                            Modifier.padding(
                                20.dp
                            )
                    ) {

                        Text(
                            text =
                                "PRÓXIMAMENTE",
                            color =
                                VeloraColors.RoseGold,
                            fontWeight =
                                FontWeight.Bold,
                            style =
                                MaterialTheme
                                    .typography
                                    .labelSmall
                        )

                        Spacer(
                            Modifier.height(6.dp)
                        )

                        Text(
                            text =
                                "Probador virtual VÉLORA",
                            color =
                                VeloraColors.Ink,
                            style =
                                MaterialTheme
                                    .typography
                                    .titleMedium
                        )

                        Text(
                            text =
                                "Experiencia de cámara, realidad aumentada y visualización digital.",
                            color =
                                VeloraColors.Muted,
                            style =
                                MaterialTheme
                                    .typography
                                    .bodyMedium
                        )
                    }
                }
            }

            CustomerScreen.FAVORITES -> {

                Text(
                    text =
                        "FAVORITOS",
                    color =
                        VeloraColors.Terracotta,
                    fontWeight =
                        FontWeight.Bold
                )

                Spacer(
                    Modifier.height(8.dp)
                )

                Text(
                    text =
                        "Las piezas que inspiran su estilo.",
                    color =
                        VeloraColors.Ink,
                    style =
                        MaterialTheme
                            .typography
                            .headlineMedium
                )

                Spacer(
                    Modifier.height(12.dp)
                )

                Text(
                    text =
                        "Aquí podrá reunir las prendas que desea volver a encontrar fácilmente.",
                    color =
                        VeloraColors.Muted
                )
            }

            CustomerScreen.ACCOUNT -> {

                Text(
                    text =
                        "MI CUENTA",
                    color =
                        VeloraColors.Terracotta,
                    fontWeight =
                        FontWeight.Bold
                )

                Spacer(
                    Modifier.height(8.dp)
                )

                Text(
                    text =
                        firstName,
                    color =
                        VeloraColors.Ink,
                    style =
                        MaterialTheme
                            .typography
                            .headlineMedium
                )

                Text(
                    text =
                        email,
                    color =
                        VeloraColors.Muted
                )

                Spacer(
                    Modifier.height(24.dp)
                )

                CustomerTile(
                    title =
                        "MIS PEDIDOS",
                    subtitle =
                        "Historial, estados y pagos",
                    modifier =
                        Modifier.fillMaxWidth(),
                    onClick = {
                        ordersViewModel.load()

                        customerScreen =
                            CustomerScreen.ORDERS
                    }
                )

                Spacer(
                    Modifier.height(12.dp)
                )

                OutlinedButton(
                    modifier =
                        Modifier.fillMaxWidth(),
                    onClick = {
                        selectedOrder = null
                        onLogout()
                    }
                ) {
                    Text(
                        "CERRAR SESIÓN"
                    )
                }
            }

            CustomerScreen.CATALOG -> {

                Row(
                    modifier =
                        Modifier.fillMaxWidth(),
                    horizontalArrangement =
                        Arrangement.spacedBy(
                            12.dp
                        )
                ) {
                    CustomerTile(
                        title = "PEDIDOS",
                        subtitle =
                            "Ver historial y estado",
                        modifier =
                            Modifier.weight(1f),
                        onClick = {
                            ordersViewModel.load()

                            customerScreen =
                                CustomerScreen.ORDERS
                        }
                    )

                    CustomerTile(
                        title = "FAVORITOS",
                        subtitle =
                            "Disponible próximamente",
                        modifier =
                            Modifier.weight(1f)
                    )
                }

                Spacer(
                    Modifier.height(24.dp)
                )

                CustomerCatalogSection(
                    onAddToCart =
                        cartViewModel::addVariant,

                    onOpenProduct = {
                        product ->

                        selectedProduct =
                            product

                        customerScreen =
                            CustomerScreen
                                .PRODUCT_DETAIL
                    },

                    addingVariantId =
                        cartState.busyVariantId
                )

                Spacer(
                    Modifier.height(16.dp)
                )

                Button(
                    modifier =
                        Modifier.fillMaxWidth(),
                    onClick = {
                        cartViewModel.load()

                        customerScreen =
                            CustomerScreen.CART
                    },
                    colors =
                        ButtonDefaults.buttonColors(
                            containerColor =
                                VeloraColors.Ink,
                            contentColor =
                                VeloraColors.Surface
                        )
                ) {
                    Text(
                        text =
                            "VER BOLSA (${cartState.cart.totalItems})"
                    )
                }
            }

            CustomerScreen.PRODUCT_DETAIL -> {

                val product =
                    selectedProduct

                if (
                    product == null
                ) {
                    Text(
                        text =
                            "No existe un producto seleccionado.",
                        color =
                            VeloraColors.Error
                    )

                    Spacer(
                        Modifier.height(
                            12.dp
                        )
                    )

                    OutlinedButton(
                        modifier =
                            Modifier.fillMaxWidth(),
                        onClick = {
                            customerScreen =
                                CustomerScreen
                                    .CATALOG
                        }
                    ) {
                        Text(
                            "VOLVER AL CATÁLOGO"
                        )
                    }
                }
                else {
                    CustomerProductDetail(
                        product =
                            product,

                        addingVariantId =
                            cartState.busyVariantId,

                        onAddToCart =
                            cartViewModel::addVariant,

                        onBackToCatalog = {
                            selectedProduct =
                                null

                            customerScreen =
                                CustomerScreen
                                    .CATALOG
                        },

                        onOpenCart = {
                            selectedProduct =
                                null

                            cartViewModel.load()

                            customerScreen =
                                CustomerScreen
                                    .CART
                        }
                    )
                }
            }

            CustomerScreen.ORDERS -> {

                CustomerOrdersSection(
                    viewModel =
                        ordersViewModel,
                    onBackToCatalog = {
                        customerScreen =
                            CustomerScreen.CATALOG
                    }
                )
            }

            CustomerScreen.CART -> {

                CustomerCartSection(
                    viewModel =
                        cartViewModel,
                    onCheckout = {
                        /*
                         * Las sucursales válidas dependen
                         * del contenido actual de la bolsa,
                         * por eso se actualizan justo antes
                         * de entrar al checkout.
                         */
                        checkoutViewModel.load()

                        customerScreen =
                            CustomerScreen.CHECKOUT
                    }
                )

                Spacer(
                    Modifier.height(16.dp)
                )

                OutlinedButton(
                    modifier =
                        Modifier.fillMaxWidth(),
                    onClick = {
                        customerScreen =
                            CustomerScreen.CATALOG
                    }
                ) {
                    Text(
                        "VOLVER AL CATÁLOGO"
                    )
                }
            }

            CustomerScreen.CHECKOUT -> {

                CustomerCheckoutSection(
                    viewModel =
                        checkoutViewModel,

                    onBackToCart = {
                        cartViewModel.load()

                        customerScreen =
                            CustomerScreen.CART
                    },

                    onContinueToPayment = {
                        order ->

                        selectedOrder =
                            order

                        /*
                         * El backend convierte el carrito
                         * original a CONVERTED cuando crea
                         * el pedido RESERVED.
                         */
                        cartViewModel.load()

                        customerScreen =
                            CustomerScreen.PAYMENT
                    }
                )
            }

            CustomerScreen.PAYMENT -> {

                val order =
                    selectedOrder

                if (order == null) {

                    Text(
                        text =
                            "No existe un pedido seleccionado para pagar.",
                        color =
                            VeloraColors.Error
                    )

                    Spacer(
                        Modifier.height(12.dp)
                    )

                    OutlinedButton(
                        modifier =
                            Modifier.fillMaxWidth(),
                        onClick = {
                            customerScreen =
                                CustomerScreen.CHECKOUT
                        }
                    ) {
                        Text(
                            "VOLVER AL CHECKOUT"
                        )
                    }

                } else {

                    /*
                     * Cada pedido obtiene su propio
                     * PaymentViewModel. Así un pago
                     * anterior no contamina una compra
                     * nueva.
                     */
                    val paymentViewModel:
                        PaymentViewModel =
                            viewModel(
                                key =
                                    "payment-${order.id}"
                            )

                    CustomerPaymentSection(
                        order =
                            order,

                        viewModel =
                            paymentViewModel,

                        onBackToOrder = {
                            customerScreen =
                                CustomerScreen.CHECKOUT
                        },

                        onPaymentCompleted = {
                            /*
                             * El pago queda PAID,
                             * mientras el pedido sigue
                             * RESERVED hasta su entrega.
                             */
                            selectedOrder =
                                null

                            cartViewModel.load()
                            ordersViewModel.load()

                            customerScreen =
                                CustomerScreen.ORDERS
                        }
                    )
                }
            }
        }

        Spacer(
            Modifier.height(24.dp)
        )
        }
    }
}

@Composable
private fun CustomerBottomNavigation(
    currentScreen:
        CustomerScreen,
    cartCount:
        Int,
    onSelect:
        (CustomerScreen) -> Unit
) {

    Surface(
        color =
            VeloraColors.Card,
        tonalElevation =
            8.dp,
        shadowElevation =
            10.dp
    ) {

        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(
                        horizontal =
                            4.dp,
                        vertical =
                            6.dp
                    ),
            horizontalArrangement =
                Arrangement.SpaceEvenly
        ) {

            CustomerNavAction(
                label =
                    "Inicio",
                marker =
                    "⌂",
                selected =
                    currentScreen ==
                        CustomerScreen.HOME,
                modifier =
                    Modifier.weight(1f),
                onClick = {
                    onSelect(
                        CustomerScreen.HOME
                    )
                }
            )

            CustomerNavAction(
                label =
                    "Explorar",
                marker =
                    "◇",
                selected =
                    currentScreen ==
                        CustomerScreen.CATALOG,
                modifier =
                    Modifier.weight(1f),
                onClick = {
                    onSelect(
                        CustomerScreen.CATALOG
                    )
                }
            )

            CustomerNavAction(
                label =
                    "Favoritos",
                marker =
                    "♡",
                selected =
                    currentScreen ==
                        CustomerScreen.FAVORITES,
                modifier =
                    Modifier.weight(1f),
                onClick = {
                    onSelect(
                        CustomerScreen.FAVORITES
                    )
                }
            )

            CustomerNavAction(
                label =
                    if (cartCount > 0) {
                        "Bolsa $cartCount"
                    }
                    else {
                        "Bolsa"
                    },
                marker =
                    "▱",
                selected =
                    currentScreen ==
                        CustomerScreen.CART,
                modifier =
                    Modifier.weight(1f),
                onClick = {
                    onSelect(
                        CustomerScreen.CART
                    )
                }
            )

            CustomerNavAction(
                label =
                    "Cuenta",
                marker =
                    "○",
                selected =
                    currentScreen ==
                        CustomerScreen.ACCOUNT,
                modifier =
                    Modifier.weight(1f),
                onClick = {
                    onSelect(
                        CustomerScreen.ACCOUNT
                    )
                }
            )
        }
    }
}

@Composable
private fun CustomerNavAction(
    label:
        String,
    marker:
        String,
    selected:
        Boolean,
    modifier:
        Modifier = Modifier,
    onClick:
        () -> Unit
) {

    TextButton(
        modifier =
            modifier,
        onClick =
            onClick,
        colors =
            ButtonDefaults
                .textButtonColors(
                    contentColor =
                        if (selected) {
                            VeloraColors
                                .Terracotta
                        }
                        else {
                            VeloraColors
                                .Muted
                        }
                )
    ) {

        Column(
            horizontalAlignment =
                Alignment.CenterHorizontally
        ) {

            Text(
                text =
                    marker,
                style =
                    MaterialTheme
                        .typography
                        .titleMedium
            )

            Text(
                text =
                    label,
                style =
                    MaterialTheme
                        .typography
                        .labelSmall,
                maxLines =
                    1
            )
        }
    }
}

@Composable
private fun CustomerTile(
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null
) {

    val interactionModifier =
        if (onClick == null) {
            Modifier
        }
        else {
            Modifier.clickable(
                onClick = onClick
            )
        }

    Card(
        modifier =
            modifier.then(
                interactionModifier
            ),
        shape =
            MaterialTheme
                .shapes
                .medium,
        colors =
            CardDefaults.cardColors(
                containerColor =
                    VeloraColors.Card
            ),
        border =
            CardDefaults.outlinedCardBorder()
    ) {

        Column(
            modifier =
                Modifier.padding(
                    horizontal =
                        18.dp,
                    vertical =
                        20.dp
                )
        ) {

            Text(
                text =
                    title,
                color =
                    VeloraColors.Ink,
                fontWeight =
                    FontWeight.Bold,
                style =
                    MaterialTheme
                        .typography
                        .titleSmall
            )

            Spacer(
                Modifier.height(
                    6.dp
                )
            )

            Text(
                text =
                    subtitle,
                color =
                    VeloraColors.Muted,
                style =
                    MaterialTheme
                        .typography
                        .bodySmall
            )

            if (onClick != null) {

                Spacer(
                    Modifier.height(
                        12.dp
                    )
                )

                Text(
                    text =
                        "VER →",
                    color =
                        VeloraColors.Terracotta,
                    fontWeight =
                        FontWeight.Bold,
                    style =
                        MaterialTheme
                            .typography
                            .labelSmall
                )
            }
        }
    }
}

@Composable
private fun PrimaryButton(
    text: String,
    enabled: Boolean,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth(),
        colors = ButtonDefaults.buttonColors(
            containerColor = VeloraColors.Ink,
            contentColor = VeloraColors.Surface
        )
    ) {
        Text(text)
    }
}

@Composable
private fun AuthCanvas(content: @Composable ColumnScope.() -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(VeloraColors.Surface)
            .padding(24.dp),
        contentAlignment = Alignment.TopCenter
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(
                    rememberScrollState()
                ),
            content = content
        )
    }
}
