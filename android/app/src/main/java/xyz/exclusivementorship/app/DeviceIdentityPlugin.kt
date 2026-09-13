package xyz.exclusivementorship.app

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.spec.ECGenParameterSpec
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties

// Exposes one method to JS: getDeviceId(). See the long comment on
// checkAndRegisterAppDevice in src/worker/lib/deviceLock.ts and the comment
// above POST /auth/app/login in src/worker/routes/auth.ts for what this
// value is used for server-side, and its known limitations.
@CapacitorPlugin(name = "DeviceIdentity")
class DeviceIdentityPlugin : Plugin() {

    companion object {
        private const val KEYSTORE_ALIAS = "xyz.exclusivementorship.app.device_identity"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    }

    @PluginMethod
    fun getDeviceId(call: PluginCall) {
        try {
            val deviceId = getOrCreateDeviceId()
            val trusted = SecurityChecks.isTrusted(context)

            val result = JSObject()
            result.put("deviceId", deviceId)
            result.put("isTrusted", trusted)
            call.resolve(result)
        } catch (e: Exception) {
            call.reject("Failed to read device identity", e)
        }
    }

    /**
     * Returns a stable identifier for this app install: SHA-256 of the
     * public key of an EC keypair generated on first call and kept in the
     * Android Keystore from then on (hardware-backed / StrongBox-backed
     * when the device supports it, software-backed KeyStore otherwise —
     * either way the private key material never leaves secure storage and
     * is never exposed to this plugin, let alone to JS).
     *
     * Because the private key can't be read out, and the keystore entry is
     * scoped to this app's UID, this is meaningfully harder to spoof than a
     * client-supplied string picked out of thin air — but it is still not a
     * hardware attestation of the *app binary or OS integrity*; a rooted
     * device with a patched app could still ask the Keystore to sign
     * something or fabricate a similarly-shaped value. That's exactly why
     * this plugin also reports `isTrusted` (see SecurityChecks) and why the
     * next phase's plan is to move to Play Integrity, per the comment in
     * deviceLock.ts.
     */
    private fun getOrCreateDeviceId(): String {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
        keyStore.load(null)

        if (!keyStore.containsAlias(KEYSTORE_ALIAS)) {
            generateKey()
        }

        val publicKey = keyStore.getCertificate(KEYSTORE_ALIAS).publicKey
        val digest = MessageDigest.getInstance("SHA-256").digest(publicKey.encoded)
        return digest.joinToString("") { "%02x".format(it) }
    }

    private fun generateKey() {
        val purpose = KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
        val builder = KeyGenParameterSpec.Builder(KEYSTORE_ALIAS, purpose)
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            // Not tied to biometric/device-credential auth — this key just
            // needs to exist and be stable, not gate a user action.
            .setUserAuthenticationRequired(false)

        val generator = KeyPairGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_EC,
            ANDROID_KEYSTORE
        )

        // Prefer StrongBox (a separate secure-element chip) when available;
        // silently fall back to the regular Keystore (TEE-backed on most
        // modern devices, software-backed as a last resort on very old/
        // emulator devices) since StrongBox support is inconsistent across
        // manufacturers.
        try {
            builder.setIsStrongBoxBacked(true)
            generator.initialize(builder.build())
        } catch (e: Exception) {
            builder.setIsStrongBoxBacked(false)
            generator.initialize(builder.build())
        }

        generator.generateKeyPair()
    }
}
