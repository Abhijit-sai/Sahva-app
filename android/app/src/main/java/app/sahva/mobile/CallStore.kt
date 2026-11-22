package app.sahva.mobile

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object CallStore {
    private var storage: SharedPreferences? = null
    @Synchronized fun prefs(context: Context): SharedPreferences {
        storage?.let { return it }
        val app = context.applicationContext
        val master = MasterKey.Builder(app).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        return EncryptedSharedPreferences.create(app, "sahva-calls", master,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM).also { storage = it }
    }
    val http = OkHttpClient.Builder().pingInterval(20, TimeUnit.SECONDS).followRedirects(false).build()
    val emptyJson = "{}".toRequestBody("application/json".toMediaType())
    fun endpoint(p: SharedPreferences, path: String): String {
        val uri = android.net.Uri.parse(p.getString("wsUrl", null))
        require(uri.scheme == "wss" && uri.encodedAuthority != null)
        return "https://" + uri.encodedAuthority + path
    }
    @Synchronized fun token(p: SharedPreferences): String {
        val token = p.getString("token", "") ?: ""
        val expiry = runCatching {
            val payload = android.util.Base64.decode(token.split('.')[1], android.util.Base64.URL_SAFE)
            JSONObject(String(payload)).getLong("exp") * 1000
        }.getOrDefault(0L)
        if (expiry > System.currentTimeMillis()+15000) return token
        val grant = requireNotNull(p.getString("grant", null))
        val req = Request.Builder().url(endpoint(p,"/native/listener-token"))
            .header("Authorization","Bearer " + grant).post(emptyJson).build()
        return http.newCall(req).execute().use {
            check(it.isSuccessful)
            val fresh = JSONObject(it.body!!.string()).getString("authToken")
            if (p.getString("grant",null) != grant) error("Session changed")
            p.edit().putString("token",fresh).apply()
            fresh
        }
    }
    fun current(context: Context): JSONObject? =
        prefs(context).getString("ring",null)?.let { runCatching { JSONObject(it) }.getOrNull() }
    const val DISMISS = "app.sahva.mobile.DISMISS"
}

