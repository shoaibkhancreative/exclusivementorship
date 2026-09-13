# Capacitor loads plugins and their @PluginMethod-annotated methods via
# reflection, so plugin classes and their public methods must survive
# R8's obfuscation/shrinking pass or the bridge can't find them at runtime.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.PluginMethod <methods>;
}

# Our own native plugin and its data classes (PluginCall/JSObject use
# reflection to serialize fields back to JS).
-keep class xyz.exclusivementorship.app.DeviceIdentityPlugin { *; }
-keep class xyz.exclusivementorship.app.SecurityChecks { *; }

# Keep everything else obfuscated/shrunk as aggressively as R8's defaults
# allow — deliberately no blanket -dontobfuscate / -dontshrink here, since
# leaving those off is most of the point of turning minifyEnabled on.
-repackageclasses ''
-allowaccessmodification
