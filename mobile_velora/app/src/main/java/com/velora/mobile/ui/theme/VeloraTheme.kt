package com.velora.mobile.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

object VeloraColors {
    val Surface = Color(0xFFF4F0EA)
    val Card = Color(0xFFEAE1D8)
    val Ink = Color(0xFF201D1B)
    val Muted = Color(0xFF786E68)
    val Terracotta = Color(0xFFA97760)
    val Error = Color(0xFFA05F59)
}

private val VeloraScheme = lightColorScheme(
    primary = VeloraColors.Ink,
    onPrimary = VeloraColors.Surface,
    secondary = VeloraColors.Terracotta,
    background = VeloraColors.Surface,
    surface = VeloraColors.Surface,
    onBackground = VeloraColors.Ink,
    onSurface = VeloraColors.Ink,
    error = VeloraColors.Error
)

@Composable
fun VeloraTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = VeloraScheme,
        content = content
    )
}
