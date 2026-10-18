allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

// Some Flutter plugins pin their own compileSdk (e.g. file_picker is built
// against android-34) while a transitive dependency
// (flutter_plugin_android_lifecycle) requires consumers to compile against
// android-36. Force every Android subproject to compileSdk 36. We set it
// reflectively so this works across Android Gradle Plugin versions (the newer
// DSL uses the `compileSdk` property setter; older ones a compileSdkVersion
// method).
subprojects {
    afterEvaluate {
        val android = project.extensions.findByName("android") ?: return@afterEvaluate
        val cls = android.javaClass
        val attempts: List<() -> Unit> = listOf(
            { cls.getMethod("setCompileSdk", java.lang.Integer::class.java).invoke(android, 36) },
            { cls.getMethod("compileSdkVersion", Int::class.javaPrimitiveType).invoke(android, 36) },
            { cls.getMethod("compileSdkVersion", String::class.java).invoke(android, "android-36") },
        )
        for (attempt in attempts) {
            try {
                attempt()
                println("[peerdesk] forced compileSdk=36 on :${project.name}")
                break
            } catch (_: Throwable) {
                // try the next shape
            }
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
