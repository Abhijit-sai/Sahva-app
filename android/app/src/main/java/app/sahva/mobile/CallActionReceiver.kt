package app.sahva.mobile

import android.content.*
import okhttp3.Request

class CallActionReceiver:BroadcastReceiver(){
    override fun onReceive(context:Context,intent:Intent) {
        val id=intent.getStringExtra("id")?:return
        if(CallStore.current(context)?.optString("callSessionId")!=id)return
        context.startService(Intent(context,SahvaCallListenerService::class.java).setAction("silence").putExtra("id",id))
        val result=goAsync()
        Thread{
            try{
                val p=CallStore.prefs(context)
                val request=Request.Builder().url(CallStore.endpoint(p,"/api/calls/"+id+"/decline"))
                    .header("Authorization","Bearer "+CallStore.token(p)).post(CallStore.emptyJson).build()
                CallStore.http.newCall(request).execute().use { if(!it.isSuccessful)android.util.Log.w("Sahva","Decline returned "+it.code) }
            }catch(e:Exception){android.util.Log.w("Sahva","Decline delivery failed")}
            finally{result.finish()}
        }.start()
    }
}

