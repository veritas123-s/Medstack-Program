#!/usr/bin/env bash
set -euo pipefail
mkdir -p test-results/android-workspace
trap 'adb pull /sdcard/Android/data/com.medstack.app.debug/files/ui-evidence test-results/android-workspace/ || true' EXIT
# Retain only the isolated emulator app until its screenshot evidence is exported.
(cd android && ./gradlew --no-daemon -Pandroid.injected.androidTest.leaveApksInstalledAfterRun=true :app:connectedDebugAndroidTest)
adb pull /sdcard/Android/data/com.medstack.app.debug/files/ui-evidence test-results/android-workspace/
for screen in today tasks schedule focus assistant settings logout; do
  test -s "test-results/android-workspace/ui-evidence/$screen.png"
done
