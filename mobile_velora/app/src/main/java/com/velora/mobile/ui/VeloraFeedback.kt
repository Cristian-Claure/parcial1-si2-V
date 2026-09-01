package com.velora.mobile.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.velora.mobile.ui.theme.VeloraColors

enum class VeloraFeedbackTone {
    Success,
    Error,
    Warning,
    Info
}

@Composable
fun VeloraFeedbackCard(
    message: String,
    tone: VeloraFeedbackTone,
    modifier: Modifier = Modifier
) {

    val accent: Color =
        when (tone) {
            VeloraFeedbackTone.Success ->
                VeloraColors.Success

            VeloraFeedbackTone.Error ->
                VeloraColors.Error

            VeloraFeedbackTone.Warning ->
                VeloraColors.Warning

            VeloraFeedbackTone.Info ->
                VeloraColors.Terracotta
        }

    val symbol =
        when (tone) {
            VeloraFeedbackTone.Success ->
                "✓"

            VeloraFeedbackTone.Error ->
                "!"

            VeloraFeedbackTone.Warning ->
                "!"

            VeloraFeedbackTone.Info ->
                "i"
        }

    Surface(
        modifier = modifier,
        shape =
            MaterialTheme.shapes.medium,
        color =
            accent.copy(alpha = .08f),
        border =
            BorderStroke(
                1.dp,
                accent.copy(alpha = .30f)
            )
    ) {

        Row(
            modifier =
                Modifier.padding(14.dp),
            verticalAlignment =
                Alignment.Top
        ) {

            Surface(
                modifier =
                    Modifier.size(26.dp),
                shape =
                    MaterialTheme.shapes.large,
                color =
                    accent.copy(alpha = .10f),
                border =
                    BorderStroke(
                        1.dp,
                        accent.copy(alpha = .42f)
                    )
            ) {
                Text(
                    text = symbol,
                    modifier =
                        Modifier.padding(
                            top = 2.dp
                        ),
                    color = accent,
                    fontWeight =
                        FontWeight.Bold,
                    style =
                        MaterialTheme
                            .typography
                            .labelMedium
                )
            }

            Spacer(
                Modifier.width(10.dp)
            )

            Text(
                text = message,
                color =
                    VeloraColors.InkSoft,
                style =
                    MaterialTheme
                        .typography
                        .bodySmall
            )
        }
    }
}