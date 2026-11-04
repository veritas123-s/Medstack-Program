package com.medstack.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.Shapes
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp

private val MedstackColors = lightColorScheme(
    primary = Color(0xFF106452),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDCEFE5),
    onPrimaryContainer = Color(0xFF173C32),
    secondary = Color(0xFF5A6E63),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFDCEFE5),
    onSecondaryContainer = Color(0xFF1C473B),
    background = Color(0xFFF5F6F1),
    surface = Color(0xFFFFFFFC),
    surfaceVariant = Color(0xFFEDF0E9),
    onBackground = Color(0xFF172A24),
    onSurface = Color(0xFF172A24),
    onSurfaceVariant = Color(0xFF51635A),
    outline = Color(0xFF718479),
    outlineVariant = Color(0xFFDCE4D9),
    error = Color(0xFFB3261E),
)

private val MedstackShapes = Shapes(
    extraSmall = RoundedCornerShape(7.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(14.dp),
    large = RoundedCornerShape(20.dp),
)

private val MedstackTypography = Typography(
    displaySmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 40.sp, lineHeight = 46.sp, fontFeatureSettings = "tnum"),
    headlineLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 24.sp, lineHeight = 32.sp),
    headlineMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 30.sp),
    titleLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 18.sp, lineHeight = 26.sp),
    titleMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 23.sp),
    bodyLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 15.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 14.sp, lineHeight = 20.sp),
    labelLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 20.sp),
    labelMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 12.sp, lineHeight = 17.sp),
)

@Composable
fun MedstackTheme(content: @Composable () -> Unit) {
    val colors = if (isSystemInDarkTheme()) darkColorScheme(
        primary = Color(0xFF9AE2C3), onPrimary = Color(0xFF103B30),
        primaryContainer = Color(0xFF213E34), onPrimaryContainer = Color(0xFFD2F4E2),
        secondaryContainer = Color(0xFF243F34), onSecondaryContainer = Color(0xFFD2F4E2),
        background = Color(0xFF121D19), onBackground = Color(0xFFEAF2EC),
        surface = Color(0xFF1A2822), surfaceVariant = Color(0xFF24342C),
        onSurface = Color(0xFFEAF2EC), onSurfaceVariant = Color(0xFFB8CBBE),
        outline = Color(0xFF899F92), outlineVariant = Color(0xFF36473E),
    ) else MedstackColors
    MaterialTheme(colorScheme = colors, typography = MedstackTypography, shapes = MedstackShapes, content = content)
}
