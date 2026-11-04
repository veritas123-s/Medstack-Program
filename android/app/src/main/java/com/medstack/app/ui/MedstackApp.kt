package com.medstack.app.ui

import android.app.DatePickerDialog
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.consumeWindowInsets
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
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeCap
import com.medstack.app.R
import com.medstack.app.data.MedstackRepository
import com.medstack.app.data.MedstackUiState
import com.medstack.app.data.MobileTask
import com.medstack.app.data.ScheduleItem
import java.time.LocalDate
import java.time.LocalTime
import java.time.LocalDateTime
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.delay

private enum class MobilePage(val title: String) {
    Today("今日"), Tasks("任务"), Schedule("日程"), Focus("专注"), More("更多"),
    Assistant("Poseidon"), Campus("教务与学习通"), Connection("账号与设置")
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
    var page by rememberSaveable { mutableStateOf(MobilePage.Today) }
    val subpage = page in listOf(MobilePage.Assistant, MobilePage.Campus, MobilePage.Connection)
    BackHandler(subpage) { page = MobilePage.More }
    LaunchedEffect(ui.message) {
        if (ui.message.isNotBlank()) {
            delay(4000)
            repository.clearMessage()
        }
    }
    LaunchedEffect(ui.focusStartedAt) {
        if (ui.focusStartedAt != null) {
            repository.tick()
            while (repository.state.focusStartedAt != null) {
                delay(1000)
                repository.tick()
            }
        }
    }
    Scaffold(
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp) {
                listOf(MobilePage.Today, MobilePage.Tasks, MobilePage.Schedule, MobilePage.Focus, MobilePage.More).forEach { item ->
                    NavigationBarItem(
                        selected = page == item || (item == MobilePage.More && subpage),
                        onClick = { page = item },
                        icon = { NavigationIcon(item) },
                        label = { Text(item.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    )
                }
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).consumeWindowInsets(padding).imePadding()) {
            MobileHeader(ui, page, repository, if (subpage) ({ page = MobilePage.More }) else null)
            UpdateBanner(updateStatus){updateStatus.release?.let{updateStatus=updates.dismiss(it)}}
            when (page) {
                MobilePage.Today -> TodayScreen(ui, repository)
                MobilePage.Tasks -> TasksScreen(ui, repository)
                MobilePage.Schedule -> ScheduleScreen(ui, repository)
                MobilePage.Focus -> FocusScreen(ui, repository)
                MobilePage.More -> MoreScreen { page = it }
                MobilePage.Assistant -> AssistantScreen(repository)
                MobilePage.Campus -> MobileCampusScreen(ui)
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
            modifier = Modifier.widthIn(max = 440.dp).fillMaxWidth().verticalScroll(rememberScrollState()),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Image(painterResource(R.drawable.medstack_icon),contentDescription="Medstack",modifier=Modifier.size(48.dp))
                Text("医栈通 Medstack", style = MaterialTheme.typography.headlineLarge)
                Text("医栈事，一站通", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
            }
        }
    }
}

@Composable
private fun MobileHeader(ui: MedstackUiState, page: MobilePage, repository: MedstackRepository, back: (() -> Unit)?) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(page.title, style = MaterialTheme.typography.headlineMedium)
            if (ui.message.isNotBlank()) Text(ui.message, style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        if (back != null) TextButton(back) { Text("返回更多") }
        else TextButton(repository::syncNow, enabled = ui.syncPhase != "syncing") {
            Text(when (ui.syncPhase) { "synced" -> "已同步"; "syncing" -> "同步中"; "conflict" -> "有冲突"; else -> "同步" })
        }
    }
}

@Composable
private fun ChoiceChips(options: List<Pair<String, String>>, selected: String, select: (String) -> Unit) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val columns = (maxWidth / (78.dp * LocalDensity.current.fontScale)).toInt().coerceAtLeast(1)
        Column {
            for (row in options.chunked(columns)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { (id, label) ->
                        FilterChip(selected = selected == id, onClick = { select(id) }, label = { Text(label) })
                    }
                }
            }
        }
    }
}

@Composable
private fun TodayScreen(ui: MedstackUiState, repository: MedstackRepository) {
    val today = LocalDate.now(ZoneId.of("Asia/Shanghai")).toString()
    val due = ui.tasks.filter { !it.completed && it.due.isNotBlank() && it.due <= today }
    val courses = ui.schedule.filter { it.start.startsWith(today) }
    LazyColumn(contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer), shape = RoundedCornerShape(22.dp)) {
                Column(Modifier.padding(20.dp)) {
                    Text(today, style = MaterialTheme.typography.labelLarge)
                    Text(if (due.isEmpty()) "今天没有临近任务" else "${due.size} 项任务需要处理", style = MaterialTheme.typography.titleLarge)
                    Text("${courses.size} 项安排 · ${ui.tasks.count { !it.completed }} 项待办", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        item { SectionTitle("当日任务") }
        if (due.isEmpty()) item { EmptyCard("暂无到期任务") }
        items(due, key = { it.id }) { TaskRow(it, repository) }
        item { SectionTitle("今日课程与日程") }
        if (courses.isEmpty()) item { EmptyCard("暂无安排") }
        items(courses) { item -> ScheduleCard(item.title, item.start, item.end, item.location, item.kind) }
    }
}

@Composable
private fun TasksScreen(ui: MedstackUiState, repository: MedstackRepository) {
    var adding by remember { mutableStateOf(false) }
    var filter by rememberSaveable { mutableStateOf("active") }
    var editing by remember { mutableStateOf<MobileTask?>(null) }
    if (adding || editing != null) {
        TaskEditor(editing, onDismiss = { adding = false; editing = null }) { title, due, time, quadrant ->
            repository.saveTask(title, due, quadrant, editing?.id, time)
            adding = false
            editing = null
        }
        return
    }
    val today = LocalDate.now().toString()
    val visible = when (filter) {
        "completed" -> ui.tasks.filter { it.completed }
        "overdue" -> ui.tasks.filter { !it.completed && it.due.isNotBlank() && it.due < today }
        "trash" -> ui.deletedTasks
        "quadrants" -> ui.tasks.filter { !it.completed }
        else -> ui.tasks.filter { !it.completed }
    }
    LazyColumn(contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Button({ adding = true }, modifier = Modifier.fillMaxWidth()) { Text("添加任务") } }
        item {
            ChoiceChips(listOf("active" to "待办", "overdue" to "逾期", "quadrants" to "四象限",
                "completed" to "已完成", "trash" to "回收站"), filter) { filter = it }
        }
        if (filter == "quadrants") {
            for (quadrant in listOf("do", "plan", "delegate", "later")) {
                val group = visible.filter { it.quadrant == quadrant }
                item { SectionTitle("${quadrantName(quadrant)} · ${group.size}") }
                items(group, key = { it.id }) { task -> TaskRow(task, repository) { editing = task } }
            }
        } else items(visible, key = { it.id }) { task ->
            if (filter == "trash") Card(Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(task.title, Modifier.weight(1f))
                    TextButton({ repository.restoreTask(task.id) }) { Text("恢复") }
                }
            } else TaskRow(task, repository) { editing = task }
        }
        if (visible.isEmpty()) item { EmptyCard("暂无任务") }
    }
}

@Composable
private fun TaskRow(task: MobileTask, repository: MedstackRepository, edit: (() -> Unit)? = null) {
    Card(shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(horizontal = 8.dp, vertical = 6.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Checkbox(task.completed, { repository.toggleTask(task.id) })
                Column(Modifier.weight(1f).padding(end = 8.dp)) {
                    Text(task.title, style = MaterialTheme.typography.titleMedium)
                    Text(listOf(task.project, listOf(task.due, task.dueTime).filter(String::isNotBlank).joinToString(" "), quadrantName(task.quadrant)).filter(String::isNotBlank).joinToString(" · "), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                if (edit != null) TextButton(edit) { Text("编辑") }
                TextButton({ repository.deleteTask(task.id) }) { Text("删除", color = MaterialTheme.colorScheme.error) }
            }
        }
    }
}

@Composable
private fun WorkspaceEditor(title: String, close: () -> Unit, save: () -> Unit, valid: Boolean, content: @Composable () -> Unit) {
    BackHandler(onBack = close)
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(title, Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
                TextButton(close) { Text("取消") }
            }
            Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)) { content() }
            HorizontalDivider()
            Button(save, enabled = valid, modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) { Text("保存") }
        }
    }
}

@Composable
private fun TaskEditor(task: MobileTask?, onDismiss: () -> Unit, onSave: (String, String, String, String) -> Unit) {
    var title by rememberSaveable(task?.id) { mutableStateOf(task?.title.orEmpty()) }
    var due by rememberSaveable(task?.id) { mutableStateOf(task?.due.orEmpty()) }
    var time by rememberSaveable(task?.id) { mutableStateOf(task?.dueTime.orEmpty()) }
    var quadrant by rememberSaveable(task?.id) { mutableStateOf(task?.quadrant ?: "plan") }
    val valid = title.isNotBlank() && (due.isBlank() || runCatching { LocalDate.parse(due) }.isSuccess) &&
        (due.isBlank() || time.isBlank() || (time.length == 5 && runCatching { LocalTime.parse(time) }.isSuccess))
    WorkspaceEditor(if (task == null) "添加任务" else "编辑任务", onDismiss, { onSave(title, due, time, quadrant) }, valid) {
        OutlinedTextField(title, { title = it.take(240) }, label = { Text("任务名称") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(due, { due = it.take(10) }, label = { Text("截止日期 YYYY-MM-DD") },
            modifier = Modifier.fillMaxWidth().testTag("taskDueDate"), singleLine = true)
        OutlinedTextField(time, { time = it.take(5) }, label = { Text("截止时间 HH:MM") },
            modifier = Modifier.fillMaxWidth().testTag("taskDueTime"),
            enabled = due.isNotBlank(), singleLine = true)
        ChoiceChips(listOf("do" to "立即", "plan" to "规划", "delegate" to "处理", "later" to "以后"), quadrant) { quadrant = it }
    }
}

@Composable
private fun ScheduleScreen(ui: MedstackUiState, repository: MedstackRepository) {
    val today = LocalDate.now(ZoneId.of("Asia/Shanghai"))
    val context = LocalContext.current
    var dateKey by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf("all") }
    var adding by rememberSaveable { mutableStateOf(false) }
    var editing by remember { mutableStateOf<ScheduleItem?>(null) }
    val day = dateKey.ifBlank { today.toString() }
    if (adding || editing != null) {
        EventEditor(editing, day, repository) { adding = false; editing = null }
        return
    }
    val items = (ui.schedule + ui.tasks.filter { !it.completed && it.due.isNotBlank() }.map { task ->
        val at = task.due + task.dueTime.takeIf(String::isNotBlank)?.let { "T$it" }.orEmpty()
        ScheduleItem(task.title, at, at, task.project, "任务")
    }).filter { item ->
        (filter == "all" || item.kind == filter) &&
            if (dateKey.isBlank()) item.end.take(10) >= day
            else item.start.take(10) <= day && item.end.take(10) >= day
    }.sortedBy { it.start }
    LazyColumn(contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (dateKey.isBlank()) "近期安排" else dateKey, Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
                if (dateKey.isNotBlank()) TextButton({ dateKey = "" }) { Text("近期") }
                TextButton({
                    val selected = LocalDate.parse(day)
                    DatePickerDialog(context, { _, year, month, date ->
                        dateKey = LocalDate.of(year, month + 1, date).toString()
                    }, selected.year, selected.monthValue - 1, selected.dayOfMonth).show()
                }) { Text("选日期") }
            }
            ChoiceChips(listOf("all" to "全部", "课程" to "课程", "考试" to "考试", "任务" to "任务", "日程" to "日程"), filter) { filter = it }
        }
        item { OutlinedButton({ adding = true }) { Text("添加日程") } }
        items(items) { item ->
            ScheduleCard(item.title, item.start, item.end, item.location, item.kind,
                if (item.kind == "日程" && item.id.isNotBlank()) ({ editing = item }) else null)
        }
        if (items.isEmpty()) item { EmptyCard("暂无安排") }
    }
}

@Composable
private fun EventEditor(event: ScheduleItem?, day: String, repository: MedstackRepository, close: () -> Unit) {
    var title by rememberSaveable(event?.id) { mutableStateOf(event?.title.orEmpty()) }
    var start by rememberSaveable(event?.id) { mutableStateOf(event?.start?.take(16)?.replace('T', ' ') ?: "$day 09:00") }
    var end by rememberSaveable(event?.id) { mutableStateOf(event?.end?.take(16)?.replace('T', ' ') ?: "$day 10:00") }
    var location by rememberSaveable(event?.id) { mutableStateOf(event?.location.orEmpty()) }
    var notes by rememberSaveable(event?.id) { mutableStateOf(event?.notes.orEmpty()) }
    val startIso = start.replace(' ', 'T')
    val endIso = end.replace(' ', 'T')
    val begin = runCatching { LocalDateTime.parse(startIso) }.getOrNull()
    val finish = runCatching { LocalDateTime.parse(endIso) }.getOrNull()
    val valid = title.isNotBlank() && start.length == 16 && end.length == 16 &&
        begin != null && finish != null && finish > begin && finish <= begin.plusDays(366) &&
        begin.year in 2000..2099 && finish.year in 2000..2099 &&
        (event?.allDay != true || (begin.toLocalTime() == LocalTime.MIDNIGHT && finish.toLocalTime() == LocalTime.MIDNIGHT))
    WorkspaceEditor(if (event == null) "添加日程" else "编辑日程", close, {
        repository.saveEvent(event?.id.orEmpty(), title, startIso, endIso, location, notes, event?.allDay == true)
        close()
    }, valid) {
        OutlinedTextField(title, { title = it.take(240) }, label = { Text("日程名称") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        OutlinedTextField(start, { start = it.take(16) }, label = { Text("开始 YYYY-MM-DD HH:MM") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        OutlinedTextField(end, { end = it.take(16) }, label = { Text("结束 YYYY-MM-DD HH:MM") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        OutlinedTextField(location, { location = it.take(200) }, label = { Text("地点") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        OutlinedTextField(notes, { notes = it.take(5000) }, label = { Text("备注") }, modifier = Modifier.fillMaxWidth())
        if (event != null) TextButton({ repository.deleteEvent(event.id); close() }) {
            Text("删除日程", color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun ScheduleCard(title: String, start: String, end: String, location: String, kind: String, edit: (() -> Unit)? = null) {
    val startDay = start.take(10)
    val endDay = end.take(10)
    val startClock = start.substringAfter('T', "").take(5)
    val endClock = end.substringAfter('T', "").take(5)
    val timing = when {
        start == end -> listOf(startDay, startClock).filter(String::isNotBlank).joinToString(" ")
        startDay == endDay -> listOf(startDay, listOf(startClock, endClock).filter(String::isNotBlank).joinToString("–")).filter(String::isNotBlank).joinToString(" · ")
        else -> "$startDay $startClock – $endDay $endClock"
    }
    Card(shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.padding(14.dp)) {
            Text(kind, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
            Text(title, style = MaterialTheme.typography.titleMedium)
            if (timing.isNotBlank()) Text(timing, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (location.isNotBlank()) Text(location, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (edit != null) TextButton(edit) { Text("编辑日程") }
        }
    }
}

@Composable
private fun FocusScreen(ui: MedstackUiState, repository: MedstackRepository) {
    var minutes by remember { mutableIntStateOf(25) }
    var customMinutes by rememberSaveable { mutableStateOf("") }
    var addingLog by rememberSaveable { mutableStateOf(false) }
    var logMinutes by rememberSaveable { mutableStateOf("") }
    val focusManager = LocalFocusManager.current
    val inputMinutes = customMinutes.toIntOrNull() ?: minutes
    val remaining = if (ui.focusStartedAt == null) inputMinutes * 60L
        else ((ui.focusUntil ?: ui.clock) - ui.clock).coerceAtLeast(0) / 1000
    val records = remember(ui.document) {
        val entries = ui.document?.optJSONArray("logs")
        (0 until (entries?.length() ?: 0)).mapNotNull { entries?.optJSONObject(it) }
            .filter { it.isNull("deletedAt") }.sortedByDescending { it.optLong("startedAt") }
    }
    val dateFormat = remember { DateTimeFormatter.ofPattern("MM-dd HH:mm").withZone(ZoneId.of("Asia/Shanghai")) }
    Column(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Text(String.format("%02d:%02d", remaining / 60, remaining % 60), Modifier.fillMaxWidth(),
                    style = MaterialTheme.typography.displaySmall, color = MaterialTheme.colorScheme.primary, textAlign = TextAlign.Center)
            }
            if (ui.focusStartedAt == null) item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    ChoiceChips(listOf(15, 25, 45, 60, 90).map { it.toString() to "$it 分" }, if (customMinutes.isEmpty()) minutes.toString() else "") {
                        minutes = it.toInt()
                        customMinutes = ""
                    }
                    OutlinedTextField(customMinutes, { customMinutes = it.take(3).filter(Char::isDigit) },
                        label = { Text("自定义分钟（1–180）") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth())
                }
            }
            item {
                HorizontalDivider()
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("专注记录", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
                    TextButton({ addingLog = true }, enabled = ui.focusStartedAt == null) { Text("补记") }
                }
            }
            if (records.isEmpty()) item { EmptyCard("暂无专注记录") }
            items(records) { record ->
                val seconds = record.optLong("durationMs") / 1000
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(record.optString("title").ifBlank { "专注" }, style = MaterialTheme.typography.titleMedium)
                        Text(dateFormat.format(Instant.ofEpochMilli(record.optLong("startedAt"))), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text(if (seconds < 60) "$seconds 秒" else "${seconds / 60} 分钟")
                }
            }
        }
        Surface {
            val actionModifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)
            if (ui.focusStartedAt == null) {
                Button({
                    focusManager.clearFocus()
                    repository.startFocus(inputMinutes)
                }, enabled = inputMinutes in 1..180, modifier = actionModifier) { Text("开始专注") }
            } else {
                Button({ repository.finishFocus(false) }, modifier = actionModifier) { Text("结束并保存") }
            }
        }
    }
    if (addingLog) AlertDialog(
        onDismissRequest = { addingLog = false },
        title = { Text("补记最近一段专注") },
        text = {
            OutlinedTextField(logMinutes, { logMinutes = it.take(3).filter(Char::isDigit) },
                label = { Text("分钟（1–180）") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
        },
        confirmButton = {
            Button({ repository.addFocusMinutes(logMinutes.toInt()); addingLog = false; logMinutes = "" },
                enabled = logMinutes.toIntOrNull() in 1..180) { Text("保存") }
        },
        dismissButton = { TextButton({ addingLog = false }) { Text("取消") } },
    )
}

@Composable
private fun ConnectionScreen(ui: MedstackUiState, repository: MedstackRepository, updateStatus:com.medstack.app.data.UpdateStatus, checkUpdates:()->Unit, updates:MobileUpdates) {
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(Modifier.padding(horizontal = 14.dp, vertical = 8.dp)) {
                    Text(ui.nickname.ifBlank { "医栈通用户" }, style = MaterialTheme.typography.titleMedium)
                    Text(ui.email, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(when {
                            ui.conflictVersion != null -> "同步冲突"
                            ui.dirty -> "有更改待同步"
                            ui.syncPhase == "offline" -> "离线"
                            ui.syncPhase == "synced" -> "已同步"
                            else -> "云端同步"
                        }, Modifier.weight(1f), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        TextButton(repository::syncNow, enabled = ui.syncPhase != "syncing") { Text("立即同步") }
                    }
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
        item { TextButton(repository::logout) { Text("退出账号", color = MaterialTheme.colorScheme.error) } }
    }
}

@Composable
private fun SectionTitle(text: String) { Text(text, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 6.dp)) }

@Composable
private fun MoreScreen(open: (MobilePage) -> Unit) {
    LazyColumn(contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        items(listOf(MobilePage.Assistant, MobilePage.Campus, MobilePage.Connection)) { page ->
            Card(onClick = { open(page) }, modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    Text(page.title, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                    Text("›", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun MobileCampusScreen(ui: MedstackUiState) {
    val uri = LocalUriHandler.current
    val today = LocalDate.now(ZoneId.of("Asia/Shanghai")).toString()
    val exams = ui.schedule.filter { it.kind == "考试" && it.end.take(10) >= today }
    LazyColumn(contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { SectionTitle("考试安排") }
        items(exams) { exam -> ScheduleCard(exam.title, exam.start, exam.end, exam.location, exam.kind) }
        if (exams.isEmpty()) item { EmptyCard("暂无从电脑同步的考试") }
        item { SectionTitle("官方入口") }
        items(listOf(
            "医学院教务" to "https://jwstu.shsmu.edu.cn/",
            "超星学习通" to "https://i.chaoxing.com/",
            "Canvas" to "https://oc.sjtu.edu.cn/",
        )) { (name, url) ->
            OutlinedButton({ uri.openUri(url) }, modifier = Modifier.fillMaxWidth()) { Text(name) }
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
