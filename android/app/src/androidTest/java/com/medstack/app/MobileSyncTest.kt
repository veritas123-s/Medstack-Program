package com.medstack.app

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.medstack.app.data.*
import com.medstack.app.security.SecureStore
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

@RunWith(AndroidJUnit4::class)
class MobileSyncTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private val uid = "synthetic-sync-race"
    private lateinit var repo: MedstackRepository
    private fun main(action: () -> Unit) = instrumentation.runOnMainSync(action)
    private fun seed(transport: MobileSyncTransport) = main {
        val secure = SecureStore(context); secure.clearSession()
        repo = MedstackRepository(context, transport)
        secure.put("user", JSONObject().put("id", uid).toString())
        val document = JSONObject(context.assets.open("default-cloud-document.json").bufferedReader().use { it.readText() })
        val base = MedstackUiState(loading = false, authenticated = true, document = document)
        val parse = MedstackRepository::class.java.getDeclaredMethod("documentState", MedstackUiState::class.java, JSONObject::class.java).apply { isAccessible = true }
        val emit = MedstackRepository::class.java.getDeclaredMethod("emit", MedstackUiState::class.java).apply { isAccessible = true }
        emit.invoke(repo, parse.invoke(repo, base, document))
    }
    private fun waitFor(condition: () -> Boolean) {
        val until = System.currentTimeMillis() + 8000
        while (System.currentTimeMillis() < until) {
            var done = false; main { done = condition() }; if (done) return
            Thread.sleep(40)
        }
        fail("Synthetic sync did not reach expected state")
    }
    @Test fun editsDuringUploadAndFailureKeepLatestEncryptedSnapshot() {
        val entered = CountDownLatch(1); val release = CountDownLatch(1); val calls = AtomicInteger()
        seed(object : MobileSyncTransport {
            override fun pull() = throw ApiException("unused", 503)
            override fun push(version: Int, document: JSONObject): JSONObject {
                if (calls.incrementAndGet() > 1) throw ApiException("synthetic offline", 503)
                entered.countDown(); check(release.await(8, TimeUnit.SECONDS))
                return JSONObject().put("version", 1)
            }
        })
        try {
            main { repo.saveTask("合成任务一", "", "plan") }
            assertTrue(entered.await(8, TimeUnit.SECONDS))
            main { repo.saveTask("合成任务二", "", "do"); repo.syncNow() }
            assertEquals(1, calls.get())
            release.countDown()
            waitFor { repo.state.syncPhase == "offline" }
            main {
                assertEquals(2, repo.state.tasks.size); assertTrue(repo.state.dirty)
                assertEquals(1, repo.state.remoteVersion)
                val cached = JSONObject(SecureStore(context).get("document:$uid")!!)
                assertEquals(2, cached.getJSONArray("tasks").length())
            }
        } finally { release.countDown(); main { repo.close(); SecureStore(context).clearSession() } }
    }
    @Test fun editsDuringDownloadBecomeConflictAndLateResponseCannotUnlockLogout() {
        val entered = CountDownLatch(1); val release = CountDownLatch(1)
        seed(object : MobileSyncTransport {
            override fun pull(): JSONObject {
                entered.countDown(); check(release.await(8, TimeUnit.SECONDS))
                return JSONObject().put("version", 2).put("document", JSONObject.NULL)
            }
            override fun push(version: Int, document: JSONObject) = throw ApiException("unused", 503)
        })
        try {
            main { repo.syncNow() }; assertTrue(entered.await(8, TimeUnit.SECONDS))
            main { repo.saveTask("下载期间的新修改", "", "plan") }; release.countDown()
            waitFor { repo.state.syncPhase == "conflict" }
            main {
                assertEquals("下载期间的新修改", repo.state.tasks.single().title)
                assertTrue(repo.state.dirty); assertEquals(2, repo.state.conflictVersion)
                val logout = MedstackRepository::class.java.getDeclaredMethod("logoutLocal").apply { isAccessible = true }; logout.invoke(repo)
                repo.startFocus(25); assertNull(repo.state.focusStartedAt)
                assertFalse(repo.state.authenticated); assertTrue(repo.state.tasks.isEmpty())
            }
        } finally { release.countDown(); main { repo.close(); SecureStore(context).clearSession() } }
    }
}
