package xyz.exclusivementorship.app

import android.os.Bundle
import android.view.WindowManager
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // FLAG_SECURE must be set before the window's content is attached
        // (i.e. before super.onCreate() inflates the WebView) so it covers
        // every frame from the first draw onward. It blocks screenshots,
        // screen recording, and screen mirroring for this window, and also
        // makes the OS show a blank thumbnail for this app in the
        // recent-apps switcher.
        //
        // Trade-off worth being explicit about: this whole app is a single
        // Activity showing the site in a WebView (there's no separate
        // "video screen" Activity to scope this to), so FLAG_SECURE applies
        // to the entire app, not just video/lesson pages. That's a stricter
        // requirement than #2 asked for literally, but there's no
        // per-screen version of FLAG_SECURE within one Activity/WebView —
        // splitting it out would need a second Activity just for playback,
        // which is a much bigger structural change for little benefit.
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)

        registerPlugin(DeviceIdentityPlugin::class.java)

        super.onCreate(savedInstanceState)
    }
}
