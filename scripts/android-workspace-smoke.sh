#!/usr/bin/env bash
set -euo pipefail
mkdir -p test-results/android-workspace
trap 'adb pull /sdcard/Android/data/com.medstack.app.debug/files/ui-evidence test-results/android-workspace/ || true' EXIT
adb shell wm size 720x1440
adb shell wm density 360
adb shell settings put system font_scale 1.15
# Retain only the isolated emulator app until its screenshot evidence is exported.
(cd android && ./gradlew --no-daemon -Pandroid.injected.androidTest.leaveApksInstalledAfterRun=true :app:connectedDebugAndroidTest)
adb pull /sdcard/Android/data/com.medstack.app.debug/files/ui-evidence test-results/android-workspace/
for screen in today tasks schedule focus assistant settings logout; do
  test -s "test-results/android-workspace/ui-evidence/$screen.png"
done
