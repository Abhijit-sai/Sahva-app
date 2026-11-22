package app.sahva.mobile

import android.app.*
import android.content.Intent
import android.media.AudioManager
import android.os.IBinder

class ActiveCallService:Service(){
    private lateinit var audio:AudioManager
    private var mode=AudioManager.MODE_NORMAL
    private var speaker=false
    override fun onCreate(){super.onCreate();audio=requireNotNull(getSystemService(AudioManager::class.java));mode=audio.mode;speaker=audio.isSpeakerphoneOn}
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
        requireNotNull(getSystemService(NotificationManager::class.java)).createNotificationChannel(NotificationChannel("sahva_active","Active calls",NotificationManager.IMPORTANCE_LOW))
        val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE)
        startForeground(103,Notification.Builder(this,"sahva_active").setSmallIcon(android.R.drawable.sym_call_outgoing).setContentTitle("Sahva • Active call").setContentText(intent?.getStringExtra("name")).setContentIntent(open).setOngoing(true).build())
        audio.mode=AudioManager.MODE_IN_COMMUNICATION
        audio.isSpeakerphoneOn=true
        return START_NOT_STICKY
    }
    override fun onDestroy(){audio.isSpeakerphoneOn=speaker;audio.mode=mode;super.onDestroy()}
    override fun onBind(intent:Intent?):IBinder?=null
}

