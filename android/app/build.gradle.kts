import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// 署名は環境変数から読む（docs/ops/android-webview.md）。未設定でもビルドは通し、
// その場合 release は unsigned になる。
val keystorePassword: String? = System.getenv("DEJAWORD_KEYSTORE_PASSWORD")
val releaseKeyPassword: String? = System.getenv("DEJAWORD_KEY_PASSWORD") ?: keystorePassword

android {
    namespace = "io.github.ganzinn.dejaword"
    compileSdk = 36

    defaultConfig {
        applicationId = "io.github.ganzinn.dejaword"
        // Android 10+ 限定: WebView が Chrome から独立している（Trichrome）ことが
        // 本アプリの前提のため（docs/adr/0073-webview-android-app.md）
        minSdk = 29
        targetSdk = 35
        versionCode = 5
        versionName = "5"
    }

    signingConfigs {
        if (keystorePassword != null) {
            create("release") {
                storeFile = rootProject.file("android.keystore")
                storePassword = keystorePassword
                keyAlias = "android"
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.core:core-splashscreen:1.0.1")
}
