package com.medstack.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import kotlin.math.cos
import kotlin.math.sin

internal enum class WorkspaceMotif { Notebook, Orbit }

internal val HeroInk = Color(0xFFF3FCF4)
internal val HeroMuted = Color(0xFFB7D9CB)

@Composable
internal fun WorkspaceHero(
    motif: WorkspaceMotif,
    modifier: Modifier = Modifier,
    progress: Float? = null,
    content: @Composable () -> Unit,
) {
    BoxWithConstraints(
        modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF112B28), Color(0xFF16473C)))),
    ) {
        val artWidth = (maxWidth / (2.8f * LocalDensity.current.fontScale)).coerceIn(50.dp, 120.dp)
        Canvas(Modifier.matchParentSize()) {
            val spacing = 11.dp.toPx()
            for (x in 0..(size.width / spacing).toInt()) {
                for (y in 0..(size.height / spacing).toInt()) {
                    drawCircle(HeroMuted.copy(alpha = .17f * x / (size.width / spacing)), 0.65.dp.toPx(),
                        Offset(x * spacing + spacing / 2, y * spacing + spacing / 2))
                }
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(start = 17.dp, top = 12.dp, end = 10.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f).padding(end = 5.dp)) {
                CompositionLocalProvider(LocalContentColor provides HeroInk, content = content)
            }
            WorkspaceArt(motif, Modifier.size(artWidth), progress)
        }
    }
}

@Composable
internal fun WorkspaceArt(motif: WorkspaceMotif, modifier: Modifier, progress: Float? = null) {
    Canvas(modifier) {
        val unit = size.minDimension / 120f
        withTransform({
            translate((size.width - 120f * unit) / 2, (size.height - 120f * unit) / 2)
            scale(unit, unit, pivot = Offset.Zero)
        }) {
            when (motif) {
                WorkspaceMotif.Notebook -> drawNotebook()
                WorkspaceMotif.Orbit -> drawOrbit(progress)
            }
        }
    }
}

private val Mint = Color(0xFFA8E7C7)
private val Leaf = Color(0xFF61C4A2)
private val Paper = Color(0xFFF9F0D5)
private val Deep = Color(0xFF16473C)

private fun DrawScope.drawNotebook() {
    drawCircle(Leaf.copy(alpha = .17f), 48f, Offset(62f, 60f))
    drawCircle(Mint.copy(alpha = .38f), 49f, Offset(62f, 60f), style = Stroke(1f))
    rotate(-16f, Offset(58f, 64f)) {
        drawRoundRect(Leaf, Offset(22f, 31f), Size(63f, 72f), CornerRadius(10f))
        drawLine(Deep.copy(alpha = .5f), Offset(32f, 42f), Offset(32f, 91f), 1.3f)
    }
    rotate(12f, Offset(65f, 61f)) {
        drawRoundRect(Deep, Offset(40f, 25f), Size(61f, 77f), CornerRadius(9f))
        drawRoundRect(Paper, Offset(35f, 20f), Size(61f, 77f), CornerRadius(9f))
        drawRoundRect(Mint, Offset(44f, 31f), Size(43f, 17f), CornerRadius(5f))
        for (y in listOf(60f, 72f, 84f)) {
            drawCircle(Deep.copy(alpha = .55f), 2f, Offset(49f, y))
            drawLine(Deep.copy(alpha = .38f), Offset(58f, y), Offset(if (y == 84f) 73f else 82f, y), 1.8f, StrokeCap.Round)
        }
        drawLine(Deep, Offset(52f, 39f), Offset(56f, 43f), 2.3f, StrokeCap.Round)
        drawLine(Deep, Offset(56f, 43f), Offset(63f, 35f), 2.3f, StrokeCap.Round)
    }
    sparkle(Offset(101f, 24f), 7f, Paper)
    sparkle(Offset(16f, 87f), 5f, Mint)
    drawCircle(Mint, 2.5f, Offset(108f, 77f))
}

private fun DrawScope.drawOrbit(progress: Float?) {
    val center = Offset(60f, 60f)
    val ring = Offset(22f, 22f)
    val diameter = Size(76f, 76f)
    drawCircle(Leaf.copy(alpha = .18f), 45f, center)
    drawCircle(Mint.copy(alpha = .34f), 38f, center, style = Stroke(3f))
    drawArc(Mint, -90f, 360f * (progress ?: .72f).coerceIn(0f, 1f), false, ring, diameter,
        style = Stroke(4f, cap = StrokeCap.Round))
    for (tick in 0 until 12) {
        val angle = tick * Math.PI / 6.0
        val direction = Offset(cos(angle).toFloat(), sin(angle).toFloat())
        drawLine(Mint.copy(alpha = .7f), center + direction * 27f, center + direction * 31f, 1.5f, StrokeCap.Round)
    }
    drawLine(Paper, center, Offset(60f, 43f), 2.6f, StrokeCap.Round)
    drawLine(Paper, center, Offset(72f, 65f), 2.6f, StrokeCap.Round)
    drawCircle(Paper, 3f, center)
    sparkle(Offset(101f, 28f), 6f, Paper)
    drawCircle(Mint, 2.4f, Offset(16f, 82f))
}

private fun DrawScope.sparkle(center: Offset, radius: Float, color: Color) {
    drawLine(color, center - Offset(radius, 0f), center + Offset(radius, 0f), 1.7f, StrokeCap.Round)
    drawLine(color, center - Offset(0f, radius), center + Offset(0f, radius), 1.7f, StrokeCap.Round)
}
