plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val portalUrl = providers.gradleProperty("PORTAL_URL").orElse("https://example.edu").get()
require(portalUrl.startsWith("https://")) { "PORTAL_URL must use HTTPS" }

android {
    namespace = "com.campushub.portal"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.campushub.portal"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "PORTAL_URL", "\"$portalUrl\"")
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
