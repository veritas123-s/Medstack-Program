package com.medstack.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import com.medstack.app.BuildConfig
import com.medstack.app.data.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun UpdateBanner(status:UpdateStatus,onDismiss:()->Unit) {
    val notice=status.release?:return
    if(!status.available||status.dismissed)return
    val uri=LocalUriHandler.current
    Card(Modifier.fillMaxWidth().padding(horizontal=18.dp,vertical=4.dp)){
        Column(Modifier.padding(horizontal=12.dp,vertical=6.dp)){
            Text((if(notice.urgent)"重要更新 · " else "")+notice.title,style=MaterialTheme.typography.labelLarge)
            Row {
                TextButton({uri.openUri(notice.url)}, modifier = Modifier.weight(1f)) {Text("下载 V${notice.version}")}
                TextButton(onDismiss, modifier = Modifier.weight(1f)) {Text("稍后")}
            }
        }
    }
}
@Composable
fun UpdatePanel(status:UpdateStatus,check:()->Unit,service:MobileUpdates,repository:MedstackRepository) {
    val scope=rememberCoroutineScope();val uid=repository.currentUserId();val uri=LocalUriHandler.current
    var email by remember(uid){mutableStateOf<Boolean?>(null)};var error by remember(uid){mutableStateOf("")};var saving by remember{mutableStateOf(false)}
    val notice = status.release
    var showNotes by rememberSaveable(notice?.version) { mutableStateOf(false) }
    LaunchedEffect(uid){if(uid.isNotBlank())try{val value=withContext(Dispatchers.IO){service.emailPreferences()};if(repository.currentUserId()==uid)email=value}catch(_:Exception){error="服务器尚未开通邮件订阅"}}
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("版本更新", style = MaterialTheme.typography.titleMedium)
                    Text("V${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                TextButton(check) { Text("检查更新") }
            }
            if (status.message.isNotBlank()) Text(status.message, style = MaterialTheme.typography.labelMedium)
            if (notice != null) {
                TextButton({ showNotes = !showNotes }) {
                    Text(if (showNotes) "收起公告" else "查看公告 V${notice.version}")
                }
                if (showNotes) {
                    notice.notes.forEach { Text(it, Modifier.padding(vertical = 3.dp), style = MaterialTheme.typography.bodyMedium) }
                    TextButton({ uri.openUri(notice.url) }) { Text("下载安装包") }
                }
            }
            HorizontalDivider()
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("接收更新邮件", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                Switch(checked = email == true, enabled = email != null && !saving, onCheckedChange = { enabled ->
                    saving = true
                    scope.launch {
                        try {
                            val value = withContext(Dispatchers.IO) { service.emailPreferences(enabled) }
                            if (repository.currentUserId() == uid) { email = value; error = "" }
                        } catch (_: Exception) {
                            error = "订阅未保存，请稍后重试"
                        } finally {
                            saving = false
                        }
                    }
                })
            }
            if (error.isNotBlank()) Text(error, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.error)
        }
    }
}
