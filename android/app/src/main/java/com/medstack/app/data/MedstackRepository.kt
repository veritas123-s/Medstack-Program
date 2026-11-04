package com.medstack.app.data

import android.content.Context
import com.medstack.app.security.SecureStore
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

data class MobileTask(
    val id: String,
    val title: String,
    val project: String,
    val due: String,
    val dueTime: String,
    val quadrant: String,
    val completed: Boolean,
)

data class ScheduleItem(
    val title: String,
    val start: String,
    val end: String,
    val location: String,
    val kind: String,
)

data class MedstackUiState(
    val loading: Boolean = true,
    val authenticated: Boolean = false,
    val email: String = "",
    val nickname: String = "",
    val needsVerification: Boolean = false,
    val pendingEmail: String = "",
    val document: JSONObject? = null,
    val tasks: List<MobileTask> = emptyList(),
    val deletedTasks: List<MobileTask> = emptyList(),
    val schedule: List<ScheduleItem> = emptyList(),
    val remoteVersion: Int = 0,
    val syncPhase: String = "idle",
    val message: String = "",
    val dirty: Boolean = false,
    val conflictVersion: Int? = null,
    val focusStartedAt: Long? = null,
    val focusUntil: Long? = null,
    val clock: Long = System.currentTimeMillis(),
    val news: JSONObject? = null,
    val newsReceivedElapsed: Long? = null,
    val newsBusy: Boolean = false,
    val newsError: String = "",
)

interface MobileSyncTransport {
    fun pull(): JSONObject
    fun push(version: Int, document: JSONObject): JSONObject
}

class MedstackRepository(context: Context, private val syncTransport: MobileSyncTransport? = null) {
    private val appContext = context.applicationContext
    private val secureStore = SecureStore(appContext)
    private val api = AccountApi(secureStore)
    private val newsCache = MobileNewsCache(appContext)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var syncJob: Job? = null
    private var sessionEpoch = 0L
    private var editRevision = 0L
    private val defaultDocument by lazy {
        appContext.assets.open("default-cloud-document.json").bufferedReader().use {
            JSONObject(it.readText())
        }
    }

    var state: MedstackUiState = MedstackUiState()
        private set

    var onStateChanged: ((MedstackUiState) -> Unit)? = null
        set(value) {
            field = value
            value?.invoke(state)
        }

    init {
        restore()
    }

    private fun emit(next: MedstackUiState) {
        state = next
        onStateChanged?.invoke(next)
    }

    private fun restore() {
        if (!api.hasSession()) {
            emit(MedstackUiState(loading = false))
            return
        }
        val storedUser = secureStore.get("user")?.let { runCatching { JSONObject(it) }.getOrNull() }
        if (storedUser != null) {
            val uid = storedUser.optString("id")
            val cached = secureStore.get("document:$uid")?.let { runCatching { JSONObject(it) }.getOrNull() }
            emit(
                documentState(
                    state.copy(
                        loading = false,
                        authenticated = true,
                        email = storedUser.optString("email"),
                        nickname = storedUser.optString("name", "医栈通 用户"),
                        document = cached,
                        news = newsCache.read(uid),
                        remoteVersion = secureStore.get("version:$uid")?.toIntOrNull() ?: 0,
                        dirty = secureStore.get("dirty:$uid") == "1",
                        syncPhase = "offline",
                    ),
                    cached,
                ),
            )
        }
        scope.launch { resumeSession() }
    }

    private suspend fun resumeSession() {
        try {
            val response = withContext(Dispatchers.IO) { api.current() }
            acceptUser(response)
            syncNow()
        } catch (error: ApiException) {
            if (error.status == 401) logoutLocal()
            else emit(state.copy(loading = false, syncPhase = "offline", message = error.message.orEmpty()))
        } catch (_: Exception) {
            emit(state.copy(loading = false, syncPhase = "offline", message = "当前离线，显示上次同步内容"))
        }
    }

    fun login(email: String, password: String) {
        if (email.isBlank() || password.length < 8) {
            emit(state.copy(message = "请输入邮箱和至少 8 位密码"))
            return
        }
        emit(state.copy(loading = true, message = ""))
        scope.launch {
            try {
                val response = withContext(Dispatchers.IO) { api.signIn(email.trim(), password) }
                acceptUser(response)
                pullFromCloud()
            } catch (error: Exception) {
                emit(MedstackUiState(loading = false, message = error.message ?: "登录失败"))
            }
        }
    }

    fun register(email: String, password: String) {
        if (email.isBlank() || password.length !in 8..128) {
            emit(state.copy(message = "请输入邮箱和 8–128 位密码"))
            return
        }
        emit(state.copy(loading = true, message = ""))
        scope.launch {
            try {
                withContext(Dispatchers.IO) { api.signUp(email.trim(), password) }
                emit(
                    MedstackUiState(
                        loading = false,
                        needsVerification = true,
                        pendingEmail = email.trim(),
                        message = "验证码已发送，请在 10 分钟内完成验证",
                    ),
                )
            } catch (error: Exception) {
                emit(MedstackUiState(loading = false, message = error.message ?: "验证码发送失败"))
            }
        }
    }

    fun verify(code: String) {
        if (code.length !in 4..10 || state.pendingEmail.isBlank()) {
            emit(state.copy(message = "请输入邮件中的验证码"))
            return
        }
        emit(state.copy(loading = true, message = ""))
        scope.launch {
            try {
                val response = withContext(Dispatchers.IO) { api.verify(state.pendingEmail, code.trim()) }
                acceptUser(response)
                pullFromCloud()
            } catch (error: Exception) {
                emit(state.copy(loading = false, message = error.message ?: "验证失败"))
            }
        }
    }

    private fun userObject(response: JSONObject): JSONObject? {
        val user = response.optJSONObject("user") ?: return null
        if (user.optString("id").isBlank()) return null
        return user
    }

    private fun acceptUser(response: JSONObject) {
        sessionEpoch++
        val user = userObject(response) ?: throw ApiException("账号信息无效", 502)
        val publicUser = JSONObject()
            .put("id", user.optString("id"))
            .put("email", user.optString("email"))
            .put("name", user.optString("name", "医栈通 用户"))
        secureStore.put("user", publicUser.toString())
        emit(
            state.copy(
                loading = false,
                authenticated = true,
                needsVerification = false,
                pendingEmail = "",
                email = publicUser.optString("email"),
                nickname = publicUser.optString("name"),
                news = newsCache.read(publicUser.optString("id")),
                newsReceivedElapsed = null,
                message = "",
            ),
        )
    }

    private fun userId(): String = secureStore.get("user")
        ?.let { runCatching { JSONObject(it).optString("id") }.getOrDefault("") }
        .orEmpty()

    fun syncSharedNews() {} // Campus news retired; do not request the server.

    private fun cache(document: JSONObject, version: Int, dirty: Boolean) {
        val uid = userId()
        if (uid.isBlank()) return
        secureStore.put("document:$uid", document.toString())
        secureStore.put("version:$uid", version.toString())
        secureStore.put("dirty:$uid", if (dirty) "1" else "0")
    }

    private suspend fun pullFromCloud() {
        val uid = currentUserId()
        if (uid.isBlank()) return
        val epoch = sessionEpoch
        val revision = editRevision
        emit(state.copy(syncPhase = "syncing", message = ""))
        try {
            val result = withContext(Dispatchers.IO) { syncTransport?.pull() ?: api.pull() }
            if (epoch != sessionEpoch || currentUserId() != uid) return
            val version = result.optInt("version", 0)
            if (revision != editRevision) {
                emit(state.copy(syncPhase = "conflict", conflictVersion = version, dirty = true, message = "同步期间有新修改，请选择保留版本"))
                return
            }
            val document = if (result.isNull("document")) JSONObject(defaultDocument.toString())
            else JSONObject(result.getJSONObject("document").toString())
            cache(document, version, false)
            emit(
                documentState(
                    state.copy(
                        loading = false,
                        document = document,
                        remoteVersion = version,
                        dirty = false,
                        conflictVersion = null,
                        syncPhase = "synced",
                        message = if (version == 0) "云端空间已就绪" else "已与电脑端同步",
                    ),
                    document,
                ),
            )
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            if (epoch != sessionEpoch || currentUserId() != uid) return
            if (error is ApiException && error.status == 401) { logoutLocal(); return }
            emit(state.copy(loading = false, syncPhase = "offline", message = error.message ?: "同步失败"))
        }
    }

    fun syncNow() {
        if (!state.authenticated || syncJob?.isActive == true) return
        syncJob = scope.launch {
            val current = state
            val document = current.document
            if (current.dirty && document != null) pushDocument(document) else pullFromCloud()
            while (state.authenticated && state.dirty && state.syncPhase == "pending") {
                val latest = state.document ?: break
                pushDocument(latest)
            }
        }
    }

    private suspend fun pushDocument(document: JSONObject, version: Int = state.remoteVersion) {
        val uid = currentUserId()
        if (uid.isBlank()) return
        val epoch = sessionEpoch
        val revision = editRevision
        val snapshot = JSONObject(document.toString())
        emit(state.copy(syncPhase = "syncing", message = ""))
        try {
            val result = withContext(Dispatchers.IO) { syncTransport?.push(version, snapshot) ?: api.push(version, snapshot) }
            if (epoch != sessionEpoch || currentUserId() != uid) return
            if (result.optBoolean("conflict")) {
                val conflict = result.optInt("version", version)
                emit(state.copy(syncPhase = "conflict", conflictVersion = conflict, dirty = true, message = "云端已有更新，请选择保留版本"))
                return
            }
            val nextVersion = result.getInt("version")
            val changed = revision != editRevision
            cache(state.document ?: snapshot, nextVersion, changed)
            emit(state.copy(remoteVersion = nextVersion, dirty = changed, conflictVersion = null, syncPhase = if (changed) "pending" else "synced", message = if (changed) "正在同步新修改" else "已同步到电脑端"))
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            if (epoch != sessionEpoch || currentUserId() != uid) return
            if (error is ApiException && error.status == 401) { logoutLocal(); return }
            cache(state.document ?: snapshot, state.remoteVersion, true)
            emit(state.copy(dirty = true, syncPhase = "offline", message = "已保存在手机，联网后可重试同步"))
        }
    }

    fun keepCloudVersion() {
        if (!state.authenticated || syncJob?.isActive == true) return
        syncJob = scope.launch { pullFromCloud() }
    }

    fun keepPhoneVersion() {
        if (!state.authenticated || syncJob?.isActive == true) return
        val document = state.document ?: return
        val version = state.conflictVersion ?: return
        syncJob = scope.launch {
            pushDocument(document, version)
            while (state.authenticated && state.dirty && state.syncPhase == "pending") pushDocument(state.document ?: break)
        }
    }

    fun saveTask(title: String, due: String, quadrant: String, id: String? = null, dueTime: String = "") {
        if (!state.authenticated) { emit(state.copy(message = "请先登录")); return }
        val cleanTitle = title.trim().take(240)
        val cleanDue = due.trim()
        if (cleanTitle.isBlank()) {
            emit(state.copy(message = "请填写任务名称"))
            return
        }
        if (cleanDue.isNotBlank() && runCatching { LocalDate.parse(cleanDue) }.isFailure) {
            emit(state.copy(message = "截止日期请使用 YYYY-MM-DD"))
            return
        }
        val cleanTime = dueTime.takeIf { cleanDue.isNotBlank() }.orEmpty()
        if (cleanTime.isNotBlank() && (!cleanTime.matches(Regex("\\d{2}:\\d{2}")) ||
                    runCatching { LocalTime.parse(cleanTime) }.isFailure)) {
            emit(state.copy(message = "截止时间请使用 HH:MM"))
            return
        }
        val cleanQuadrant = quadrant.takeIf { it in setOf("do", "plan", "delegate", "later") } ?: "plan"
        if (id != null) {
            mutateTask(id) { task ->
                if (task.isNull("deletedAt")) task
                    .put("title", cleanTitle)
                    .put("quadrant", cleanQuadrant)
                    .put("due", cleanDue)
                    .put("dueTime", cleanTime)
            }
            return
        }
        val document = JSONObject((state.document ?: defaultDocument).toString())
        val task = JSONObject()
            .put("id", "mobile:${UUID.randomUUID()}")
            .put("title", cleanTitle)
            .put("quadrant", cleanQuadrant)
            .put("project", "收集箱")
            .put("due", cleanDue)
            .put("dueTime", cleanTime)
            .put("reminder", "")
            .put("repeat", "none")
            .put("estimate", 0)
            .put("notes", "")
            .put("subtasks", JSONArray())
            .put("createdAt", System.currentTimeMillis())
            .put("completedAt", JSONObject.NULL)
            .put("deletedAt", JSONObject.NULL)
            .put("remindedFor", "")
        document.getJSONArray("tasks").put(task)
        updateAndPush(document)
    }

    fun toggleTask(id: String) = mutateTask(id) { task ->
        if (task.isNull("completedAt")) task.put("completedAt", System.currentTimeMillis())
        else task.put("completedAt", JSONObject.NULL)
    }

    fun deleteTask(id: String) = mutateTask(id) { task ->
        task.put("deletedAt", System.currentTimeMillis())
    }

    fun restoreTask(id: String) = mutateTask(id) { task -> task.put("deletedAt", JSONObject.NULL) }

    private fun mutateTask(id: String, action: (JSONObject) -> Unit) {
        if (!state.authenticated) return
        val document = state.document?.let { JSONObject(it.toString()) } ?: return
        val tasks = document.getJSONArray("tasks")
        for (index in 0 until tasks.length()) {
            val task = tasks.getJSONObject(index)
            if (task.optString("id") == id) {
                action(task)
                updateAndPush(document)
                return
            }
        }
    }

    fun startFocus(minutes: Int) {
        if (!state.authenticated || state.focusStartedAt != null) return
        if (minutes !in 1..180) { emit(state.copy(message = "专注时长为 1–180 分钟")); return }
        val duration = minutes * 60_000L
        val now = System.currentTimeMillis()
        emit(state.copy(focusStartedAt = now, focusUntil = now + duration, clock = now, message = "专注已开始"))
    }

    fun tick() {
        val now = System.currentTimeMillis()
        emit(state.copy(clock = now))
        val focusUntil = state.focusUntil
        if (focusUntil != null && now >= focusUntil) finishFocus(true)
    }

    fun finishFocus(completed: Boolean = false) {
        val start = state.focusStartedAt ?: return
        val end = minOf(System.currentTimeMillis(), state.focusUntil ?: Long.MAX_VALUE)
        if (end - start < 1000) {
            emit(state.copy(focusStartedAt = null, focusUntil = null, message = "专注时间太短，未保存"))
            return
        }
        emit(state.copy(focusStartedAt = null, focusUntil = null))
        saveFocusInterval(start, end, completed)
    }

    fun addFocusMinutes(minutes: Int) {
        if (!state.authenticated || state.focusStartedAt != null || minutes !in 1..180) return
        val end = System.currentTimeMillis()
        val start = end - minutes * 60_000L
        val logs = state.document?.optJSONArray("logs") ?: JSONArray()
        for (index in 0 until logs.length()) {
            val record = logs.optJSONObject(index) ?: continue
            if (!record.isNull("deletedAt")) continue
            val segments = record.optJSONArray("segments")
            val overlaps = if (segments == null || segments.length() == 0) {
                start < record.optLong("endedAt") && end > record.optLong("startedAt")
            } else (0 until segments.length()).any {
                val segment = segments.optJSONObject(it)
                segment != null && start < segment.optLong("end") && end > segment.optLong("start")
            }
            if (overlaps) {
                emit(state.copy(message = "这段时间已有专注记录"))
                return
            }
        }
        saveFocusInterval(start, end, true, "手动补记")
    }

    private fun saveFocusInterval(start: Long, end: Long, completed: Boolean, title: String = "手机专注") {
        val document = JSONObject((state.document ?: defaultDocument).toString())
        document.getJSONArray("logs").put(
            JSONObject()
                .put("id", "mobile:${UUID.randomUUID()}")
                .put("taskId", "")
                .put("title", title)
                .put("project", "未分类")
                .put("mode", "focus")
                .put("startedAt", start)
                .put("endedAt", end)
                .put("durationMs", end - start)
                .put("completed", completed)
                .put("segments", JSONArray().put(JSONObject().put("start", start).put("end", end)))
                .put("deletedAt", JSONObject.NULL),
        )
        updateAndPush(document)
    }

    private fun updateAndPush(document: JSONObject) {
        if (!state.authenticated) return
        editRevision++
        cache(document, state.remoteVersion, true)
        emit(documentState(state.copy(document = document, dirty = true, message = ""), document))
        if (state.conflictVersion == null) syncNow()
    }

    private fun documentState(base: MedstackUiState, document: JSONObject?): MedstackUiState {
        if (document == null) return base.copy(tasks = emptyList(), deletedTasks = emptyList(), schedule = emptyList())
        val deleted = mutableListOf<MobileTask>()
        val tasks = buildList {
            val array = document.optJSONArray("tasks") ?: JSONArray()
            for (index in 0 until array.length()) {
                val task = array.optJSONObject(index) ?: continue
                if (!task.isNull("deletedAt")) {
                    deleted.add(MobileTask(task.optString("id"), task.optString("title"), task.optString("project"), task.optString("due"), task.optString("dueTime"), task.optString("quadrant", "plan"), !task.isNull("completedAt")))
                    continue
                }
                add(
                    MobileTask(
                        id = task.optString("id"),
                        title = task.optString("title"),
                        project = task.optString("project", "收集箱"),
                        due = task.optString("due"),
                        dueTime = task.optString("dueTime"),
                        quadrant = task.optString("quadrant", "plan"),
                        completed = !task.isNull("completedAt"),
                    ),
                )
            }
        }.sortedWith(compareBy<MobileTask> { it.completed }.thenBy { it.due.ifBlank { "9999-99-99" } })
        val schedule = buildList {
            val courses = document.optJSONArray("courses") ?: JSONArray()
            for (index in 0 until courses.length()) {
                val course = courses.optJSONObject(index) ?: continue
                add(ScheduleItem(course.optString("title"), course.optString("start"), course.optString("end"), course.optString("location"), "课程"))
            }
            val events = document.optJSONArray("events") ?: JSONArray()
            for (index in 0 until events.length()) {
                val event = events.optJSONObject(index) ?: continue
                if (!event.isNull("deletedAt")) continue
                val kind = if (event.optString("calendarUid").startsWith("school-exam:") ||
                    event.optString("id").startsWith("school-exam:") ||
                    event.optString("title").startsWith("考试 · ")) "考试" else "日程"
                add(ScheduleItem(event.optString("title"), event.optString("start"), event.optString("end"), event.optString("location"), kind))
            }
        }.sortedBy { it.start }
        return base.copy(tasks = tasks, deletedTasks = deleted, schedule = schedule)
    }

    fun currentUserId(): String = if (state.authenticated) userId() else ""

    fun assistantWorkspace(): JSONObject = JSONObject()
        .put("tasks", JSONArray(state.tasks.filter { !it.completed }.take(40).map { JSONObject().put("title",it.title).put("due",it.due).put("quadrant",it.quadrant) }))
        .put("schedule", JSONArray(state.schedule.filter { it.start.take(10)>=LocalDate.now().toString() }.take(40).map { JSONObject().put("title",it.title).put("start",it.start).put("end",it.end) }))

    fun importAssistantDrafts(drafts: JSONArray) {
        try {
            check(state.authenticated) { "请先登录" }
            require(drafts.length() in 1..12) { "任务草稿数量无效" }
            val document=JSONObject((state.document ?: defaultDocument).toString())
            for(index in 0 until drafts.length()) {
                val item=drafts.getJSONObject(index)
                val title=item.optString("title").trim(); val due=item.optString("due"); val time=item.optString("dueTime")
                require(title.isNotBlank() && title.length<=300) { "任务名称无效" }
                require(due.isBlank() || runCatching { LocalDate.parse(due) }.isSuccess) { "截止日期无效" }
                require(time.isBlank() || time.matches(Regex("([01][0-9]|2[0-3]):[0-5][0-9]"))) { "截止时间无效" }
                require(item.optString("quadrant") in setOf("do","plan","delegate","later")) { "四象限字段无效" }
                document.getJSONArray("tasks").put(JSONObject(item.toString())
                    .put("id","mobile-ai:${UUID.randomUUID()}").put("title",title).put("project","收集箱")
                    .put("createdAt",System.currentTimeMillis()).put("completedAt",JSONObject.NULL).put("deletedAt",JSONObject.NULL)
                    .put("reminder","").put("remindedFor",""))
            }
            updateAndPush(document)
        } catch(e:Exception) { emit(state.copy(message=e.message ?: "草稿未添加")) }
    }

    fun logout() {
        scope.launch {
            withContext(Dispatchers.IO) { runCatching { api.signOut() } }
            logoutLocal()
        }
    }

    private fun logoutLocal() {
        sessionEpoch++
        syncJob?.cancel()
        secureStore.clearSession()
        emit(MedstackUiState(loading = false))
    }

    fun clearMessage() = emit(state.copy(message = ""))

    fun close() {
        scope.cancel()
    }
}
