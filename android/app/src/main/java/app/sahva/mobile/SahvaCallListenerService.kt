package app.sahva.mobile

import android.app.*
import android.content.*
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.*
import android.net.Uri
import okhttp3.*
import org.json.JSONObject
import java.time.Instant
import java.util.concurrent.Executors

class SahvaCallListenerService:Service() {
    private val handler=Handler(Looper.getMainLooper())
    private val network=Executors.newSingleThreadExecutor()
    private var ws:WebSocket?=null
    private var retry=2000L
    private var connecting=false
    @Volatile private var stopped=false
    private var tone:Ringtone?=null
    private var currentId:String?=null
    private val nm by lazy {requireNotNull(getSystemService(NotificationManager::class.java))}
    private val vibrator by lazy {getSystemService(VIBRATOR_SERVICE) as Vibrator}
    private val reconnect=Runnable{connect()}
    private val timeout=Runnable{clearRing()}
    private val repeatTone=object:Runnable {
        override fun run(){if(currentId!=null){if(tone?.isPlaying==false) tone?.play();handler.postDelayed(this,1800)}}
    }
    override fun onCreate(){
        super.onCreate()
        instance = this
        nm.createNotificationChannel(NotificationChannel("sahva_ready","Call availability",NotificationManager.IMPORTANCE_LOW).apply{setSound(null,null)})
        nm.createNotificationChannel(NotificationChannel("sahva_messages","Messages",NotificationManager.IMPORTANCE_DEFAULT).apply { enableVibration(true); vibrationPattern = longArrayOf(0,55,45,80) })
        nm.createNotificationChannel(NotificationChannel("sahva_incoming_calls","Incoming calls",NotificationManager.IMPORTANCE_HIGH).apply{setSound(null,null);enableVibration(false);lockscreenVisibility=Notification.VISIBILITY_PUBLIC})
    }
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
        val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE)
        startForeground(101,Notification.Builder(this,"sahva_ready").setSmallIcon(android.R.drawable.sym_call_incoming)
            .setContentTitle("Sahva • Ready for translated calls").setContentIntent(open).setOngoing(true).build())
        if(CallStore.prefs(this).getString("wsUrl",null)==null){stopSelf();return START_NOT_STICKY}
        if(intent?.action=="silence" && currentId==intent.getStringExtra("id"))clearRing()
        connect()
        return START_STICKY
    }
    private fun connect(){
        if(stopped || connecting || ws!=null)return
        connecting=true
        network.execute{
            try {
                val p=CallStore.prefs(this)
                val token=CallStore.token(p)
                val url=requireNotNull(p.getString("wsUrl",null))+"?platform=android-service"
                val request=Request.Builder().url(url).header("Sec-WebSocket-Protocol","sahva, jwt."+token).build()
                handler.post{
                    connecting=false
                    if(!stopped)ws=CallStore.http.newWebSocket(request,object:WebSocketListener(){
                        override fun onOpen(webSocket:WebSocket,response:Response){handler.post{retry=2000}}
                        override fun onMessage(webSocket:WebSocket,text:String){handler.post{
                            if(ws===webSocket && !stopped)runCatching { val event=JSONObject(text)
                                when(event.optString("type")){
                                    "conversation:changed" -> if(event.optBoolean("notifyMessage") && !MainActivity.visible) messageAlert(event)
                                    "call:incoming"->ring(event)
                                    "call:cancelled","call:ended","call:declined","call:missed","call:answered_elsewhere"->if(currentId==event.optString("callSessionId"))clearRing()
                                }
                            }
                        }}
                        override fun onClosed(webSocket:WebSocket,code:Int,reason:String)=lost(webSocket)
                        override fun onClosing(webSocket:WebSocket,code:Int,reason:String){webSocket.close(code,reason)}
                        override fun onFailure(webSocket:WebSocket,t:Throwable,response:Response?)=lost(webSocket)
                    })
                }
            } catch(e:Exception){handler.post{connecting=false;schedule()}}
        }
    }
    private fun lost(socket:WebSocket){handler.post{if(ws===socket){ws=null;schedule()}}}
    private fun messageAlert(event: JSONObject) {
        if (!nm.areNotificationsEnabled()) return
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val notice = Notification.Builder(this, "sahva_messages")
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setContentTitle("New Sahva message").setContentText(event.optString("senderName", "Open your workspace to read it."))
            .setCategory(Notification.CATEGORY_MESSAGE).setAutoCancel(true).setContentIntent(open).build()
        nm.notify(event.optString("roomId"), 104, notice)
    }
    private fun schedule(){if(!stopped){handler.removeCallbacks(reconnect);handler.postDelayed(reconnect,retry);retry=(retry*2).coerceAtMost(30000)}}
    fun dismiss(id: String?) { if (currentId == id) clearRing() }
    fun ring(event:JSONObject){
        val id=event.getString("callSessionId")
        val remaining=Instant.parse(event.getString("expiresAt")).toEpochMilli()-System.currentTimeMillis()
        if(remaining<=0 || currentId==id)return
        clearRing();currentId=id
        CallStore.prefs(this).edit().putString("ring",event.toString()).apply()
        val name=event.getJSONObject("caller").getString("name")
        val wake=requireNotNull(getSystemService(PowerManager::class.java)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"Sahva:IncomingCall")
        wake.acquire(4000)
        val full=PendingIntent.getActivity(this,id.hashCode(),Intent(this,IncomingCallActivity::class.java).putExtra("id",id),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val answer=PendingIntent.getActivity(this,id.hashCode(),answerIntent(this,event),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val decline=PendingIntent.getBroadcast(this,id.hashCode(),Intent(this,CallActionReceiver::class.java).putExtra("id",id),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n=Notification.Builder(this,"sahva_incoming_calls").setSmallIcon(android.R.drawable.sym_call_incoming)
            .setContentTitle(name).setContentText("Incoming translated call").setCategory(Notification.CATEGORY_CALL)
            .setVisibility(Notification.VISIBILITY_PUBLIC).setFullScreenIntent(full,true).setContentIntent(full).setOngoing(true).setTimeoutAfter(remaining)
        if(Build.VERSION.SDK_INT>=31)n.setStyle(Notification.CallStyle.forIncomingCall(Person.Builder().setName(name).build(),decline,answer))
        else n.addAction(Notification.Action.Builder(null,"Decline",decline).build()).addAction(Notification.Action.Builder(null,"Answer",answer).build())
        if (nm.areNotificationsEnabled()) nm.notify(102,n.build())
        val mode = requireNotNull(getSystemService(android.media.AudioManager::class.java)).ringerMode
        if (mode == android.media.AudioManager.RINGER_MODE_NORMAL) {
        tone=RingtoneManager.getRingtone(this,RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))?.apply{
            audioAttributes=AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build()
            if(Build.VERSION.SDK_INT>=28)isLooping=true
            play()
        }
        if(Build.VERSION.SDK_INT<28)handler.postDelayed(repeatTone,1800)
        }
        if (mode != android.media.AudioManager.RINGER_MODE_SILENT) vibrator.vibrate(VibrationEffect.createWaveform(longArrayOf(0,450,450,450,1400),0),AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build())
        handler.postDelayed(timeout,remaining)
    }
    private fun clearRing(){
        handler.removeCallbacks(timeout);handler.removeCallbacks(repeatTone)
        tone?.stop();tone=null;vibrator.cancel();nm.cancel(102)
        CallStore.prefs(this).edit().remove("ring").apply()
        if(currentId!=null)sendBroadcast(Intent(CallStore.DISMISS).setPackage(packageName).putExtra("id",currentId))
        currentId=null
    }
    override fun onDestroy(){instance=null;stopped=true;handler.removeCallbacksAndMessages(null);ws?.cancel();ws=null;network.shutdownNow();clearRing();super.onDestroy()}
    override fun onBind(intent:Intent?):IBinder?=null
    companion object{
        var instance: SahvaCallListenerService? = null
            private set
        fun answerIntent(c:Context,e:JSONObject)=Intent(c,MainActivity::class.java).setAction(Intent.ACTION_VIEW)
            .setData(Uri.Builder().scheme("sahva").authority("call-answer").appendQueryParameter("roomId",e.getString("roomId")).appendQueryParameter("callSessionId",e.getString("callSessionId")).build())
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
}

