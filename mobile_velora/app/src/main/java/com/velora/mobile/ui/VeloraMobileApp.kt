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
import com.velora.mobile.ui.theme.VeloraColors

private enum class AuthScreen {
    LOGIN,
    REGISTER
}

private enum class CustomerScreen {
    CATALOG,
    ORDERS,
    CART,
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
            CustomerScreen.CATALOG
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

    AuthCanvas {
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

        Button(
            modifier =
                Modifier.fillMaxWidth(),
            onClick = {
                selectedOrder = null

                customerScreen =
                    CustomerScreen.CATALOG

                onLogout()
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
                "CERRAR SESIÓN"
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

    val tileModifier =
        if (onClick == null) {
            modifier
                .background(
                    VeloraColors.Card
                )
                .padding(
                    18.dp
                )
        } else {
            modifier
                .background(
                    VeloraColors.Card
                )
                .clickable(
                    onClick = onClick
                )
                .padding(
                    18.dp
                )
        }

    Box(
        modifier =
            tileModifier
    ) {
        Column {
            Text(
                title,
                color =
                    VeloraColors.Ink,
                fontWeight =
                    FontWeight.Bold
            )

            Spacer(
                Modifier.height(
                    6.dp
                )
            )

            Text(
                subtitle,
                color =
                    VeloraColors.Muted
            )
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
