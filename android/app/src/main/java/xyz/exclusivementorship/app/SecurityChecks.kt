package xyz.exclusivementorship.app

import android.content.Context
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.os.Build
import java.io.File
import java.security.MessageDigest

/**
 * Best-effort checks for "is this a normal, unmodified install of our app on
 * a normal, non-rooted device". None of these are unbeatable — a
 * sufficiently motivated attacker with root can hide root (Magisk's
 * DenyList/Zygisk hooks specifically exist to defeat exactly these checks),
 * and can patch this very file out of a repackaged APK. This raises the bar
 * for casual tampering/piracy; it is not a substitute for real attestation.
 * Phase 3 replacing this with Play Integrity is the real fix — see the
 * comment on POST /auth/app/login in src/worker/routes/auth.ts.
 */
object SecurityChecks {

    fun isTrusted(context: Context): Boolean {
        return !isDebuggable(context) &&
            !hasRootIndicators() &&
            !hasRootManagementApp(context) &&
            isSignatureValid(context)
    }

    private fun isDebuggable(context: Context): Boolean {
        return (context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0
    }

    private val SU_PATHS = arrayOf(
        "/sbin/su", "/system/bin/su", "/system/xbin/su", "/data/local/xbin/su",
        "/data/local/bin/su", "/system/sd/xbin/su", "/system/bin/failsafe/su",
        "/data/local/su", "/su/bin/su"
    )

    private val ROOT_PACKAGES = arrayOf(
        "com.topjohnwu.magisk",
        "eu.chainfire.supersu",
        "com.noshufou.android.su",
        "com.koushikdutta.superuser",
        "com.zachspong.temprootremovejb",
        "com.ramdroid.appquarantine"
    )

    private fun hasRootIndicators(): Boolean {
        if (Build.TAGS != null && Build.TAGS.contains("test-keys")) return true
        if (SU_PATHS.any { File(it).exists() }) return true
        if (File("/system/app/Superuser.apk").exists()) return true
        return false
    }

    private fun isPackageInstalled(context: Context, pkg: String): Boolean {
        return try {
            context.packageManager.getPackageInfo(pkg, 0)
            true
        } catch (e: PackageManager.NameNotFoundException) {
            false
        }
    }

    private fun hasRootManagementApp(context: Context): Boolean {
        return ROOT_PACKAGES.any { isPackageInstalled(context, it) }
    }

    /**
     * Compares the running APK's signing certificate against the expected
     * release fingerprint baked in at build time (BuildConfig field, set
     * from your release keystore — see app/build.gradle). This catches a
     * repackaged/resigned APK even on a non-rooted device.
     *
     * Left as a pass-through until EXPECTED_SIGNATURE_SHA256 is actually
     * configured (still the placeholder value), so local/dev builds aren't
     * permanently locked out before you've generated a release keystore.
     * Make sure this is filled in before shipping — an unset check here
     * means this specific line of defense is not actually active.
     */
    private fun isSignatureValid(context: Context): Boolean {
        val expected = BuildConfig.EXPECTED_SIGNATURE_SHA256
        if (expected.isBlank() || expected == "REPLACE_WITH_RELEASE_CERT_SHA256") {
            return true
        }
        return try {
            val signatures = getSignatures(context)
            signatures.any { sha256Hex(it.toByteArray()).equals(expected, ignoreCase = true) }
        } catch (e: Exception) {
            // Fail closed: if we can't read the signature at all, treat it
            // as untrusted rather than silently letting it through.
            false
        }
    }

    @Suppress("DEPRECATION")
    private fun getSignatures(context: Context): Array<Signature> {
        val pm = context.packageManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val info = pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
            info.signingInfo?.apkContentsSigners ?: arrayOf()
        } else {
            val info = pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES)
            info.signatures ?: arrayOf()
        }
    }

    private fun sha256Hex(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        return digest.joinToString("") { "%02x".format(it) }
    }
}
