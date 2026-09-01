package com.velora.mobile.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

object VeloraColors {
    val Ivory = Color(0xFFF8F4EF)
    val Surface = Color(0xFFF4F0EA)
    val SurfaceSoft = Color(0xFFEFE7DF)
    val Card = Color(0xFFFFFDFA)
    val CardMuted = Color(0xFFEAE1D8)

    val Ink = Color(0xFF201D1B)
    val InkSoft = Color(0xFF403A36)
    val Muted = Color(0xFF786E68)
    val MutedLight = Color(0xFF9B8F87)

    val Champagne = Color(0xFFC7A989)
    val Terracotta = Color(0xFFA97760)
    val DustyRose = Color(0xFFC79A98)
    val RoseGold = Color(0xFFB98273)

    val Success = Color(0xFF66825F)
    val Warning = Color(0xFFA47A3E)
    val Error = Color(0xFFA05F59)
    val Info = Color(0xFF6E7887)

    val Border = Color(0x1F201D1B)
    val BorderStrong = Color(0x38201D1B)
}

private val VeloraScheme =
    lightColorScheme(
        primary =
            VeloraColors.Ink,
        onPrimary =
            VeloraColors.Ivory,

        primaryContainer =
            VeloraColors.CardMuted,
        onPrimaryContainer =
            VeloraColors.Ink,

        secondary =
            VeloraColors.Terracotta,
        onSecondary =
            VeloraColors.Ivory,

        secondaryContainer =
            VeloraColors.SurfaceSoft,
        onSecondaryContainer =
            VeloraColors.Ink,

        tertiary =
            VeloraColors.RoseGold,

        background =
            VeloraColors.Surface,
        onBackground =
            VeloraColors.Ink,

        surface =
            VeloraColors.Card,
        onSurface =
            VeloraColors.Ink,

        surfaceVariant =
            VeloraColors.CardMuted,
        onSurfaceVariant =
            VeloraColors.Muted,

        outline =
            VeloraColors.MutedLight,

        error =
            VeloraColors.Error,
        onError =
            VeloraColors.Ivory
    )

private val VeloraTypography =
    Typography(
        displayLarge =
            TextStyle(
                fontFamily =
                    FontFamily.Serif,
                fontWeight =
                    FontWeight.Normal,
                fontSize =
                    54.sp,
                lineHeight =
                    58.sp
            ),

        headlineLarge =
            TextStyle(
                fontFamily =
                    FontFamily.Serif,
                fontWeight =
                    FontWeight.Normal,
                fontSize =
                    36.sp,
                lineHeight =
                    40.sp
            ),

        headlineMedium =
            TextStyle(
                fontFamily =
                    FontFamily.Serif,
                fontWeight =
                    FontWeight.Normal,
                fontSize =
                    30.sp,
                lineHeight =
                    34.sp
            ),

        titleLarge =
            TextStyle(
                fontFamily =
                    FontFamily.Serif,
                fontWeight =
                    FontWeight.Normal,
                fontSize =
                    24.sp,
                lineHeight =
                    30.sp
            ),

        titleMedium =
            TextStyle(
                fontFamily =
                    FontFamily.Default,
                fontWeight =
                    FontWeight.SemiBold,
                fontSize =
                    17.sp,
                lineHeight =
                    23.sp
            ),

        bodyLarge =
            TextStyle(
                fontFamily =
                    FontFamily.Default,
                fontWeight =
                    FontWeight.Normal,
                fontSize =
                    16.sp,
                lineHeight =
                    25.sp
            ),

        bodyMedium =
            TextStyle(
                fontFamily =
                    FontFamily.Default,
                fontWeight =
                    FontWeight.Normal,
                fontSize =
                    14.sp,
                lineHeight =
                    22.sp
            ),

        labelLarge =
            TextStyle(
                fontFamily =
                    FontFamily.Default,
                fontWeight =
                    FontWeight.SemiBold,
                fontSize =
                    13.sp,
                lineHeight =
                    18.sp
            )
    )

private val VeloraShapes =
    Shapes(
        small =
            androidx.compose.foundation.shape
                .RoundedCornerShape(
                    10.dp
                ),

        medium =
            androidx.compose.foundation.shape
                .RoundedCornerShape(
                    16.dp
                ),

        large =
            androidx.compose.foundation.shape
                .RoundedCornerShape(
                    24.dp
                )
    )

@Composable
fun VeloraTheme(
    content:
        @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme =
            VeloraScheme,
        typography =
            VeloraTypography,
        shapes =
            VeloraShapes,
        content =
            content
    )
}