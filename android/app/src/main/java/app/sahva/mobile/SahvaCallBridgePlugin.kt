package app.sahva.mobile

import android.Manifest
import android.content.Intent
import android.media.AudioManager
import android.net.Uri
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission

@CapacitorPlugin(name="SahvaCallBridge",permissions=[
    Permission(alias="microphone",strings=[Manifest.permission.RECORD_AUDIO]),
    Permission(alias="notifications",strings=[Manifest.permission.POST_NOTIFICATIONS])
])
class SahvaCallBridgePlugin : Plugin() {
    @PluginMethod fun startCallListener(call: PluginCall) {
        val url = call.getString("wsUrl") ?: return call.reject("Missing signaling URL.")
        val uri = Uri.parse(url)
        if(uri.scheme != "wss" || uri.path != "/ws/user" || uri.userInfo != null) return call.reject("An HTTPS deployment is required.")
        val p = CallStore.prefs(context)
        val userId = call.getString("userId") ?: return call.reject("Missing user.")
        if(p.getString("userId",null) != userId) p.edit().clear().commit()
        p.edit().putString("wsUrl",url).putString("token",call.getString("authToken"))
            .putString("userId",userId).putString("grant",call.getString("grant"))
            .putString("language",call.getString("language")).apply()
        try { ContextCompat.startForegroundService(context, Intent(context,SahvaCallListenerService::class.java));call.resolve() }
        catch(e:Exception) {call.reject("Open Sahva to enable background listening.",e)}
    }
    @PluginMethod fun stopCallListener(call:PluginCall) {
        context.stopService(Intent(context,SahvaCallListenerService::class.java))
        context.stopService(Intent(context,ActiveCallService::class.java))
        CallStore.prefs(context).edit().clear().commit()
        call.resolve()
    }
    @PluginMethod fun refreshAuthToken(call:PluginCall) {
        CallStore.prefs(context).edit().putString("token",call.getString("authToken")).apply()
        call.resolve()
    }
    @PluginMethod fun startActiveCallForegroundService(call:PluginCall) {
        try {ContextCompat.startForegroundService(context,Intent(context,ActiveCallService::class.java).putExtra("name",call.getString("callerName")));call.resolve()}
        catch(e:Exception){call.reject("Allow microphone access before joining a call.",e)}
    }
    @PluginMethod fun stopActiveCallForegroundService(call:PluginCall) {
        context.stopService(Intent(context,ActiveCallService::class.java));call.resolve()
    }
    @PluginMethod fun setSpeakerphone(call:PluginCall) {
        val audio=requireNotNull(context.getSystemService(AudioManager::class.java))
        audio.isSpeakerphoneOn=call.getBoolean("enabled",true) == true
        call.resolve()
    }
    @PluginMethod fun downloadRecording(call:PluginCall) {
        val url=Uri.parse(call.getString("url") ?: return call.reject("Missing recording URL."))
        if(url.scheme!="https")return call.reject("Invalid recording URL.")
        val filename="sahva-call-"+System.currentTimeMillis()+".wav"
        val req=android.app.DownloadManager.Request(url).setTitle(filename).setMimeType("audio/wav")
            .setDestinationInExternalFilesDir(context,android.os.Environment.DIRECTORY_DOWNLOADS,filename)
            .setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        try{requireNotNull(context.getSystemService(android.app.DownloadManager::class.java)).enqueue(req);call.resolve()}
        catch(e:Exception){call.reject("Download failed.",e)}
    }
    @PluginMethod fun requestBatteryOptimizationExemption(call:PluginCall) {
        try {activity.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,Uri.parse("package:"+context.packageName)));call.resolve()}
        catch(e:Exception){call.reject("Battery settings are unavailable.",e)}
    }
    @PluginMethod fun consumePendingCallAction(call:PluginCall) {
        val p=CallStore.prefs(context)
        val value=p.getString("action",null)
        p.edit().remove("action").commit()
        call.resolve(if(value==null) JSObject() else JSObject(value))
    }
}

