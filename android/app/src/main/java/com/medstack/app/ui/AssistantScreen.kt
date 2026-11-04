package com.medstack.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.medstack.app.agent.MobilePiEngine
import com.medstack.app.data.MedstackRepository
import org.json.JSONArray
import org.json.JSONObject

@Composable
fun AssistantScreen(repository: MedstackRepository) {
    val context=LocalContext.current
    val uid=repository.currentUserId()
    var result by remember(uid) { mutableStateOf<JSONObject?>(null) }
    var busy by remember(uid) { mutableStateOf(false) }
    var error by remember(uid) { mutableStateOf("") }
    var saved by remember(uid) { mutableStateOf(false) }
    val engine=remember(uid) { MobilePiEngine(context,uid,{ repository.state.authenticated && repository.currentUserId()==uid }) { result=it;busy=false;error=it.optString("error") } }
    DisposableEffect(engine) { onDispose { engine.close() } }
    val config=remember(engine) { engine.configuration() }
    var endpoint by remember(uid) { mutableStateOf(config.optString("endpoint")) }
    var model by remember(uid) { mutableStateOf(config.optString("model")) }
    var key by remember(uid) { mutableStateOf("") }
    var configuring by remember(uid) { mutableStateOf(config.optString("key").isBlank()) }
    var text by remember(uid) { mutableStateOf("") }
    var includeContext by remember(uid) { mutableStateOf(false) }
    LazyColumn(contentPadding=PaddingValues(18.dp),verticalArrangement=Arrangement.spacedBy(14.dp)) {
        item { TextButton({ configuring=!configuring },enabled=!busy) { Text(if(configuring) "收起连接设置" else "连接设置") } }
        if(configuring) item {
            Card { Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(endpoint,{endpoint=it.take(2048)},label={Text("API Base URL")},modifier=Modifier.fillMaxWidth(),singleLine=true,enabled=!busy)
                OutlinedTextField(model,{model=it.take(200)},label={Text("默认模型")},modifier=Modifier.fillMaxWidth(),singleLine=true,enabled=!busy)
                OutlinedTextField(key,{key=it.take(4096)},label={Text("自己的 API 密钥")},modifier=Modifier.fillMaxWidth(),singleLine=true,visualTransformation=PasswordVisualTransformation(),enabled=!busy)
                Button({ try { engine.configure(endpoint,model,key);key="";configuring=false;error="" } catch(e:Exception) {error=e.message ?: "保存失败"} },enabled=!busy) { Text("保存连接") }
            } }
        }
        item { OutlinedTextField(text,{text=it.take(4000)},label={Text("说出你的安排")},modifier=Modifier.fillMaxWidth(),minLines=3,enabled=!busy) }
        item { Row { Checkbox(includeContext,{includeContext=it},enabled=!busy); Text("附带任务与日程摘要",Modifier.padding(top=12.dp)) } }
        item { Row(horizontalArrangement=Arrangement.spacedBy(10.dp)) {
            Button({ try { result=null;saved=false;error="";engine.run(text,repository.assistantWorkspace(),includeContext);busy=true } catch(e:Exception) {busy=false;error=e.message ?: "请求未完成"} },enabled=!busy && text.isNotBlank()) { Text(if(busy) "处理中…" else "发送") }
            if(busy) OutlinedButton({engine.cancel();busy=false}) { Text("停止") }
        } }
        if(error.isNotBlank()) item { Text(error,color=MaterialTheme.colorScheme.error) }
        result?.takeIf { !it.has("error") }?.let { response ->
            item { Card { Text(response.optString("reply"),Modifier.padding(16.dp)) } }
            val drafts=response.optJSONArray("tasks") ?: JSONArray()
            for(index in 0 until drafts.length()) {
                val draft=drafts.getJSONObject(index)
                item { Card { Column(Modifier.padding(16.dp)) { Text(draft.optString("title"),style=MaterialTheme.typography.titleMedium); Text(draft.optString("due")+" "+draft.optString("dueTime")) } } }
            }
            if(drafts.length()>0) item { Button({repository.importAssistantDrafts(drafts);saved=true},enabled=!saved) { Text(if(saved) "已添加" else "核对并添加任务") } }
        }
    }
}
