package app.sahva.mobile

import android.content.Intent
import android.content.pm.PackageManager
import android.Manifest
import android.os.Bundle
import android.webkit.PermissionRequest
import androidx.activity.result.contract.ActivityResultContracts
import com.getcapacitor.BridgeActivity
import com.getcapacitor.BridgeWebChromeClient

class MainActivity : BridgeActivity() {
    companion object {
        @Volatile var visible = false
            private set
    }
    override fun onStart() { super.onStart(); visible = true }
    override fun onStop() { visible = false; super.onStop() }
    private var pending:PermissionRequest?=null
    private val microphone=registerForActivityResult(ActivityResultContracts.RequestPermission()){ allowed ->
        pending?.let { if(allowed) it.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else it.deny() }
        pending=null
    }
    override fun onCreate(savedInstanceState:Bundle?) {
        registerPlugin(SahvaCallBridgePlugin::class.java)
        super.onCreate(savedInstanceState)
        bridge.webView.webChromeClient=object:BridgeWebChromeClient(bridge) {
            override fun onPermissionRequest(req:PermissionRequest) {
                if(req.origin.toString().trimEnd('/')!="https://localhost" || PermissionRequest.RESOURCE_AUDIO_CAPTURE !in req.resources){req.deny();return}
                if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED) req.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                else {pending?.deny();pending=req;microphone.launch(Manifest.permission.RECORD_AUDIO)}
            }
            override fun onPermissionRequestCanceled(req:PermissionRequest){if(pending===req)pending=null}
        }
        accept(intent)
    }
    override fun onNewIntent(intent:Intent) {accept(intent);super.onNewIntent(intent)}
    private fun accept(intent:Intent?) {
        val uri=intent?.data ?: return
        if(uri.scheme!="sahva" || uri.host!="call-answer")return
        val ring=CallStore.current(this) ?: return
        if(ring.optString("callSessionId")!=uri.getQueryParameter("callSessionId"))return
        CallStore.prefs(this).edit().putString("action",ring.put("action","answer").toString()).commit()
        startService(Intent(this,SahvaCallListenerService::class.java).setAction("silence").putExtra("id",ring.getString("callSessionId")))
    }
}

