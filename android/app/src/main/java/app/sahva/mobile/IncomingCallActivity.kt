package app.sahva.mobile

import android.app.Activity
import android.content.*
import android.graphics.Typeface
import android.graphics.Color
import android.os.Bundle
import android.os.Build
import android.view.Gravity
import android.view.WindowManager
import android.widget.*
import androidx.core.content.ContextCompat

class IncomingCallActivity:Activity(){
    private var id:String?=null
    private val dismiss=object:BroadcastReceiver(){override fun onReceive(context:Context,intent:Intent){if(intent.getStringExtra("id")==id)finish()}}
    override fun onCreate(state:Bundle?){
        super.onCreate(state)
        if(Build.VERSION.SDK_INT>=27){setShowWhenLocked(true);setTurnScreenOn(true)}
        else window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        ContextCompat.registerReceiver(this,dismiss,IntentFilter(CallStore.DISMISS),ContextCompat.RECEIVER_NOT_EXPORTED)
        render(intent)
    }
    override fun onNewIntent(intent:Intent){super.onNewIntent(intent);render(intent)}
    private fun render(intent:Intent){
        val e=CallStore.current(this)
        id=intent.getStringExtra("id")
        if(e==null || e.optString("callSessionId")!=id){finish();return}
        CallStore.prefs(this).edit().putString("action",org.json.JSONObject(e.toString()).put("action","incoming").toString()).apply()
        val caller=e.getJSONObject("caller")
        val layout=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;setBackgroundColor(Color.rgb(15,23,42));setPadding(40,32,40,32)}
        fun font(family: String, weight: Int): Typeface =
            Typeface.Builder(assets, "public/fonts/$family/regular.ttf")
                .setFontVariationSettings("'wght' $weight").build()
        val body = font("dm-sans", 400)
        val heading = font("plus-jakarta-sans", 600)
        val pair = font("jetbrains-mono", 500)
        val buttonFace = font("dm-sans", 600)
        fun label(value: String, size: Float, face: Typeface) {
            layout.addView(TextView(this).apply {
                text = value
                textSize = size
                typeface = face
                gravity = Gravity.CENTER
                setTextColor(Color.WHITE)
                setPadding(4, 12, 4, 12)
            })
        }
        fun button(title: String, color: Int, click: () -> Unit) {
            layout.addView(Button(this).apply {
                text = title
                isAllCaps = false
                typeface = buttonFace
                backgroundTintList = android.content.res.ColorStateList.valueOf(color)
                setTextColor(Color.WHITE)
                setOnClickListener { click() }
            })
        }
        label("Incoming Sahva call", 16f, body)
        label(caller.getString("name"), 32f, heading)
        label(caller.getString("languageName")+" ↔ "+CallStore.prefs(this).getString("language",""), 18f, pair)
        button("Join Call",Color.rgb(21,128,61)){startActivity(SahvaCallListenerService.answerIntent(this,e));finish()}
        button("Decline",Color.rgb(185,28,28)){sendBroadcast(Intent(this,CallActionReceiver::class.java).putExtra("id",id));finish()}
        setContentView(layout)
    }
    override fun onDestroy(){unregisterReceiver(dismiss);super.onDestroy()}
}

