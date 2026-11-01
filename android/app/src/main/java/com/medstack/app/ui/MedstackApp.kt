package com.medstack.app.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.Image
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.material3.FilterChip
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import com.medstack.app.data.MobileUpdates
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeCap
import com.medstack.app.R
import com.medstack.app.BuildConfig
import com.medstack.app.data.MedstackRepository
import com.medstack.app.data.MedstackUiState
import com.medstack.app.data.MobileTask
import java.time.LocalDate
import kotlinx.coroutines.delay

private enum class MobilePage(val title: String) {
    Today("今日"), Tasks("任务"), Schedule("日程"), Focus("专注"), More("更多"), Assistant("Poseidon"), Connection("账号与设置")
}

@Composable
fun MedstackApp(ui: MedstackUiState, repository: MedstackRepository) {
    val context=LocalContext.current
    val updates=remember {MobileUpdates(context)}
    var updateStatus by remember {mutableStateOf(updates.cached())}
    val updateScope=rememberCoroutineScope()
    val checkUpdates:()->Unit={updateScope.launch{updateStatus=withContext(Dispatchers.IO){updates.check()}};Unit}
    LaunchedEffect(Unit){updateStatus=withContext(Dispatchers.IO){updates.check()}}
    if (!ui.authenticated) {
        AuthScreen(ui, repository)
        return
    }
    var page by remember { mutableStateOf(MobilePage.Today) }
    Scaffold(
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp) {
                listOf(MobilePage.Today, MobilePage.Tasks, MobilePage.Schedule, MobilePage.Focus, MobilePage.More).forEach { item ->
                    NavigationBarItem(
                        selected = page == item || (item == MobilePage.More && page in listOf(MobilePage.Assistant, MobilePage.Connection)),
                        onClick = { page = item },
                        icon = { NavigationIcon(item) },
                        label = { Text(item.title) },
                    )
                }
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            MobileHeader(ui, page, repository)
            if (page in listOf(MobilePage.Assistant, MobilePage.Connection)) {
                TextButton({ page = MobilePage.More }, modifier = Modifier.padding(horizontal = 12.dp)) { Text("返回更多") }
            }
            UpdateBanner(updateStatus){updateStatus.release?.let{updateStatus=updates.dismiss(it)}}
            if (ui.message.isNotBlank()) {
                Surface(
                    color = MaterialTheme.colorScheme.primaryContainer,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 8.dp),
                    shape = RoundedCornerShape(14.dp),
                    onClick = repository::clearMessage,
                ) { Text(ui.message, Modifier.padding(13.dp), color = MaterialTheme.colorScheme.onPrimaryContainer) }
            }
            when (page) {
                MobilePage.Today -> TodayScreen(ui, repository)
                MobilePage.Tasks -> TasksScreen(ui, repository)
                MobilePage.Schedule -> ScheduleScreen(ui)
                MobilePage.Focus -> FocusScreen(ui, repository)
                MobilePage.More -> MoreScreen { page = it }
                MobilePage.Assistant -> AssistantScreen(repository)
                MobilePage.Connection -> ConnectionScreen(ui, repository, updateStatus, checkUpdates, updates)
            }
        }
    }
}

@Composable
private fun AuthScreen(ui: MedstackUiState, repository: MedstackRepository) {
    var register by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf(ui.pendingEmail) }
    var password by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    Box(Modifier.fillMaxSize().safeDrawingPadding().imePadding().padding(24.dp), contentAlignment = Alignment.Center) {
        Card(
            modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Image(painterResource(R.drawable.medstack_icon),contentDescription="Medstack",modifier=Modifier.size(48.dp))
                Text("医栈通 Medstack", style = MaterialTheme.typography.headlineLarge)
                Text("医栈事，一站通", color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (ui.needsVerification) {
                    Text(ui.pendingEmail, fontWeight = FontWeight.SemiBold)
                    OutlinedTextField(code, { code = it.take(10) }, label = { Text("邮箱验证码") }, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                    Button({ repository.verify(code) }, modifier = Modifier.fillMaxWidth(), enabled = !ui.loading) { Text("完成验证并登录") }
                    TextButton({ repository.clearMessage(); register = true }) { Text("返回注册") }
                } else {
                    OutlinedTextField(email, { email = it.take(254) }, label = { Text("邮箱") }, modifier = Modifier.fillMaxWidth(), singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
                    OutlinedTextField(password, { password = it.take(128) }, label = { Text("密码") }, modifier = Modifier.fillMaxWidth(), singleLine = true, visualTransformation = PasswordVisualTransformation())
                    Button(
                        { if (register) repository.register(email, password) else repository.login(email, password) },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !ui.loading,
                    ) { Text(if (register) "发送验证码" else "登录") }
                    TextButton({ register = !register; repository.clearMessage() }) { Text(if (register) "已有账号，直接登录" else "第一次使用，注册账号") }
                }
                if (ui.loading) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) { CircularProgressIndicator(Modifier.size(22.dp)); Text("正在连接…") }
                if (ui.message.isNotBlank()) Text(ui.message, color = MaterialTheme.colorScheme.error)
                HorizontalDivider()
                Image(painterResource(R.drawable.medtrix_wordmark_transparent), contentDescription = "Medtrix 团队", modifier = Modifier.width(160.dp).height(54.dp), contentScale = ContentScale.Fit)
                Text("登录后查看个人任务、日程与专注记录。", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun MobileHeader(ui: MedstackUiState, page: MobilePage, repository: MedstackRepository) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 14.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column { Text(page.title, style = MaterialTheme.typography.headlineMedium); Text("医栈通 V${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        TextButton(repository::syncNow, enabled = ui.syncPhase != "syncing") { Text(when (ui.syncPhase) { "synced" -> "已同步"; "syncing" -> "同步中"; "conflict" -> "有冲突"; else -> "同步" }) }
    }
}

@Composable
private fun TodayScreen(ui: MedstackUiState, repository: MedstackRepository) {
    val today = LocalDate.now().toString()
    val due = ui.tasks.filter { !it.completed && it.due.isNotBlank() && it.due <= today }
    val courses = ui.schedule.filter { it.start.startsWith(today) }
    LazyColumn(contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer), shape = RoundedCornerShape(22.dp)) {
                Column(Modifier.padding(20.dp)) {
                    Text(LocalDate.now().toString(), style = MaterialTheme.typography.labelLarge)
                    Text(if (due.isEmpty()) "今天没有临近任务" else "${due.size} 项任务需要处理", style = MaterialTheme.typography.titleLarge)
                    Text("${courses.size} 节课程 · ${ui.tasks.count { !it.completed }} 项待办", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        item { SectionTitle("当日任务") }
        if (due.isEmpty()) item { EmptyCard("任务完成后，可到专注页记录投入时间。") }
        items(due, key = { it.id }) { TaskRow(it, repository) }
        item { SectionTitle("今日课程与日程") }
        if (courses.isEmpty()) item { EmptyCard("暂无同步到今天的课程或日程。") }
        items(courses) { item -> ScheduleCard(item.title, item.start, item.end, item.location, item.kind) }
    }
}

@Composable
private fun TasksScreen(ui: MedstackUiState, repository: MedstackRepository) {
    var adding by remember { mutableStateOf(false) }
    var filter by rememberSaveable { mutableStateOf("active") }
    val today = LocalDate.now().toString()
    val visible = when (filter) {
        "completed" -> ui.tasks.filter { it.completed }
        "overdue" -> ui.tasks.filter { !it.completed && it.due.isNotBlank() && it.due < today }
        "trash" -> ui.deletedTasks
        else -> ui.tasks.filter { !it.completed }
    }
    LazyColumn(contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Button({ adding = true }, modifier = Modifier.fillMaxWidth()) { Text("添加任务") } }
        item {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("active" to "待办", "overdue" to "逾期", "completed" to "已完成", "trash" to "回收站").forEach { (id, label) ->
                    FilterChip(selected = filter == id, onClick = { filter = id }, label = { Text(label) })
                }
            }
        }
        items(visible, key = { it.id }) { task ->
            if (filter == "trash") Card(Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(task.title, Modifier.weight(1f))
                    TextButton({ repository.restoreTask(task.id) }) { Text("恢复") }
                }
            } else TaskRow(task, repository)
        }
        if (visible.isEmpty()) item { EmptyCard("暂无任务") }
    }
    if (adding) AddTaskDialog(onDismiss = { adding = false }) { title, due, quadrant ->
        repository.saveTask(title, due, quadrant)
        adding = false
    }
}

@Composable
private fun TaskRow(task: MobileTask, repository: MedstackRepository) {
    Card(shape = RoundedCornerShape(18.dp), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Checkbox(task.completed, { repository.toggleTask(task.id) })
            Column(Modifier.weight(1f).padding(horizontal = 8.dp)) {
                Text(task.title, style = MaterialTheme.typography.titleMedium)
                Text(listOf(task.project, task.due, quadrantName(task.quadrant)).filter { it.isNotBlank() }.joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            TextButton({ repository.deleteTask(task.id) }) { Text("删除", color = MaterialTheme.colorScheme.error) }
        }
    }
}

@Composable
private fun AddTaskDialog(onDismiss: () -> Unit, onSave: (String, String, String) -> Unit) {
    var title by remember { mutableStateOf("") }
    var due by remember { mutableStateOf("") }
    var quadrant by remember { mutableStateOf("plan") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("添加任务") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(title, { title = it }, label = { Text("任务名称") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(due, { due = it.take(10) }, label = { Text("截止日期 YYYY-MM-DD") }, modifier = Modifier.fillMaxWidth())
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("do" to "立即", "plan" to "规划", "delegate" to "处理", "later" to "以后").forEach { (id, label) ->
                        if (quadrant == id) Button({ quadrant = id }) { Text(label) }
                        else OutlinedButton({ quadrant = id }) { Text(label) }
                    }
                }
            }
        },
        confirmButton = { Button({ onSave(title, due, quadrant) }, enabled = title.isNotBlank() && (due.isBlank() || runCatching { LocalDate.parse(due) }.isSuccess)) { Text("保存") } },
        dismissButton = { TextButton(onDismiss) { Text("取消") } },
    )
}

@Composable
private fun ScheduleScreen(ui: MedstackUiState) {
    val today = LocalDate.now().toString()
    var examsOnly by rememberSaveable { mutableStateOf(false) }
    val items = ui.schedule.filter { it.end >= today && (!examsOnly || it.title.startsWith("考试 · ")) }.take(60)
    LazyColumn(contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = !examsOnly, onClick = { examsOnly = false }, label = { Text("全部安排") })
            FilterChip(selected = examsOnly, onClick = { examsOnly = true }, label = { Text("考试") })
        } }
        if (examsOnly) item { Text("电脑教务模块同步后，通过账号同步到手机。", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        items(items) { item -> ScheduleCard(item.title, item.start, item.end, item.location, item.kind) }
        if (items.isEmpty()) item { EmptyCard("未来暂无已同步的课程或日程。") }
    }
}

@Composable
private fun ScheduleCard(title: String, start: String, end: String, location: String, kind: String) {
    Card(shape = RoundedCornerShape(18.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(17.dp)) {
            Text(kind, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text("$start — $end", color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (location.isNotBlank()) Text(location, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun FocusScreen(ui: MedstackUiState, repository: MedstackRepository) {
    var minutes by remember { mutableIntStateOf(25) }
    var customMinutes by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(ui.focusStartedAt) {
        while (ui.focusStartedAt != null) {
            delay(1000)
            repository.tick()
        }
    }
    val remaining = ((ui.focusUntil ?: ui.clock) - ui.clock).coerceAtLeast(0) / 1000
    Column(Modifier.fillMaxSize().padding(22.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text(if (ui.focusStartedAt == null) "准备专注" else "正在专注", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(18.dp))
        Text(String.format("%02d:%02d", remaining / 60, remaining % 60), style = MaterialTheme.typography.displaySmall, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(24.dp))
        if (ui.focusStartedAt == null) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(15, 25, 45, 60, 90).forEach { value ->
                    if (minutes == value) Button({ minutes = value }) { Text("$value 分") }
                    else OutlinedButton({ minutes = value }) { Text("$value 分") }
                }
            }
            Spacer(Modifier.height(20.dp))
            OutlinedTextField(customMinutes, { customMinutes = it.take(3).filter(Char::isDigit) }, label = { Text("自定义分钟（1–180）") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            Button({ repository.startFocus(customMinutes.toIntOrNull() ?: minutes) }, enabled = customMinutes.isBlank() || customMinutes.toIntOrNull() in 1..180, modifier = Modifier.fillMaxWidth()) { Text("开始专注") }
        } else {
            Button({ repository.finishFocus(false) }, modifier = Modifier.fillMaxWidth()) { Text("结束并保存") }
        }
        Spacer(Modifier.height(18.dp))
        Text("保存后会与电脑端专注记录合并。", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ConnectionScreen(ui: MedstackUiState, repository: MedstackRepository, updateStatus:com.medstack.app.data.UpdateStatus, checkUpdates:()->Unit, updates:MobileUpdates) {
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Card(shape = RoundedCornerShape(22.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                Column(Modifier.padding(20.dp)) {
                    Text(ui.nickname.ifBlank { "医栈通 用户" }, style = MaterialTheme.typography.titleLarge)
                    Text(ui.email)
                    Text("云端版本 ${ui.remoteVersion} · ${if (ui.dirty) "手机有待同步更改" else "本地已对齐"}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (ui.conflictVersion != null) item {
            Card(shape = RoundedCornerShape(18.dp)) {
                Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("发现同步冲突", style = MaterialTheme.typography.titleMedium)
                    Text("电脑端和手机端都发生了修改。请选择要保留的数据版本。")
                    Button(repository::keepCloudVersion, modifier = Modifier.fillMaxWidth()) { Text("使用云端版本") }
                    OutlinedButton(repository::keepPhoneVersion, modifier = Modifier.fillMaxWidth()) { Text("用手机版本覆盖云端") }
                }
            }
        }
        item {UpdatePanel(updateStatus,checkUpdates,updates,repository)}
        item { Button(repository::syncNow, modifier = Modifier.fillMaxWidth(), enabled = ui.syncPhase != "syncing") { Text("立即同步") } }
        item {
            Card(shape = RoundedCornerShape(18.dp)) {
                Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("隐私保护", style = MaterialTheme.typography.titleMedium)
                    Text("• 只同步账号、任务、日程、课表摘要和专注记录\n• 学校登录会话与模型密钥不进入手机云同步\n• 会话令牌与离线缓存使用 Android KeyStore 加密\n• 手机不监听局域网端口，也不读取电脑文件")
                }
            }
        }
        item { OutlinedButton(repository::logout, modifier = Modifier.fillMaxWidth()) { Text("退出账号") } }
    }
}

@Composable
private fun SectionTitle(text: String) { Text(text, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 6.dp)) }

@Composable
private fun MoreScreen(open: (MobilePage) -> Unit) {
    LazyColumn(contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Card(onClick = { open(MobilePage.Assistant) }, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Poseidon", style = MaterialTheme.typography.titleLarge)
                    Text("任务草稿与学习问答", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        item {
            Card(onClick = { open(MobilePage.Connection) }, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("账号与设置", style = MaterialTheme.typography.titleLarge)
                    Text("同步与版本更新", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun NavigationIcon(page: MobilePage) {
    val color = MaterialTheme.colorScheme.onSurfaceVariant
    Canvas(Modifier.size(24.dp)) {
        val unit = size.width / 24f
        val stroke = Stroke(1.7f * unit, cap = StrokeCap.Round)
        fun line(x1: Float, y1: Float, x2: Float, y2: Float) = drawLine(color, Offset(x1 * unit, y1 * unit), Offset(x2 * unit, y2 * unit), 1.7f * unit, StrokeCap.Round)
        when (page) {
            MobilePage.Today -> {
                drawCircle(color, 4f * unit, style = stroke)
                for (i in 0..7) {
                    val angle = Math.PI * i / 4
                    line(12 + (7 * kotlin.math.cos(angle)).toFloat(), 12 + (7 * kotlin.math.sin(angle)).toFloat(), 12 + (9 * kotlin.math.cos(angle)).toFloat(), 12 + (9 * kotlin.math.sin(angle)).toFloat())
                }
            }
            MobilePage.Tasks -> for (y in listOf(6f, 12f, 18f)) { line(4f, y, 5.5f, y + 1.5f); line(5.5f, y + 1.5f, 8f, y - 1.5f); line(12f, y, 21f, y) }
            MobilePage.Schedule -> {
                drawRoundRect(color, Offset(3f * unit, 5f * unit), Size(18f * unit, 16f * unit), androidx.compose.ui.geometry.CornerRadius(2f * unit), style = stroke)
                line(3f, 10f, 21f, 10f); line(8f, 3f, 8f, 7f); line(16f, 3f, 16f, 7f)
            }
            MobilePage.Focus -> { drawCircle(color, 9f * unit, style = stroke); line(12f, 6f, 12f, 12f); line(12f, 12f, 16f, 14f) }
            else -> for (x in listOf(6f, 18f)) for (y in listOf(6f, 18f)) drawCircle(color, 2f * unit, Offset(x * unit, y * unit), style = stroke)
        }
    }
}

@Composable
private fun EmptyCard(text: String) {
    Card(shape = RoundedCornerShape(18.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Text(text, Modifier.fillMaxWidth().padding(18.dp), textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private fun quadrantName(value: String) = when (value) {
    "do" -> "重要紧急"
    "plan" -> "重要不紧急"
    "delegate" -> "紧急不重要"
    else -> "以后处理"
}
