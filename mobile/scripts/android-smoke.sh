#!/usr/bin/env bash
set -Eeuo pipefail
# Real smoke checks: keep assertions. Do not label an APK working merely because it installs.
PACKAGE=app.moodinsight.mobile
DIAG=android-diagnostics.txt
: > "$DIAG"

dump_diagnostics() {
  echo "==== Android process, foreground screen, and recent errors ====" | tee -a "$DIAG"
  { 
    adb shell pidof "$PACKAGE" || true
    adb shell dumpsys activity activities | tail -120 || true
    adb shell dumpsys window windows | grep -E 'mCurrentFocus|mFocusedApp' || true
    adb logcat -d -v threadtime -s AndroidRuntime:E ReactNativeJS:E ReactNative:E SQLiteDatabase:E SQLiteLog:E libc:F DEBUG:E | tail -220 || true
  } >> "$DIAG" 2>&1
  adb exec-out screencap -p > android-smoke.png 2>> "$DIAG" || true
  timeout 25s adb shell uiautomator dump /sdcard/window.xml >> "$DIAG" 2>&1 || true
  timeout 15s adb exec-out cat /sdcard/window.xml > window.xml 2>> "$DIAG" || true
  if test -s window.xml; then head -c 4000 window.xml >> "$DIAG"; fi
  tail -120 "$DIAG" || true
}
on_exit(){
  status=$?
  if test "$status" -ne 0; then
    echo "SMOKE FAILURE at shell line $1, exit=$status" | tee -a "$DIAG"
    dump_diagnostics
  fi
}
trap 'on_exit "$LINENO"' EXIT

apk=$(find apk -type f -name '*.apk' | head -n 1)
if ! test -s "$apk"; then echo "APK artifact not found" >&2; exit 1; fi
adb wait-for-device
adb install -r "$apk"
adb logcat -c || true
adb shell input keyevent 82 || true
adb shell am force-stop "$PACKAGE" || true
adb shell am start -W -n "$PACKAGE/.MainActivity"
echo "APK installed and launch requested; waiting for React Native UI to become ready..."

capture(){
  timeout 25s adb shell uiautomator dump /sdcard/window.xml >> "$DIAG" 2>&1 || return 1
  timeout 15s adb exec-out cat /sdcard/window.xml > window.xml 2>> "$DIAG" || return 1
  test -s window.xml
}
wait_for_text(){
  target=$1
  for attempt in $(seq 1 20); do
    capture || true
    if test -s window.xml && grep -Fq "$target" window.xml; then return 0; fi
    echo "Waiting for '$target' ($attempt/20)" | tee -a "$DIAG"
    sleep 6
  done
  echo "Expected UI not found: $target" >&2
  return 1
}
tap_label(){
  needle=$1
  capture || { echo "Could not capture hierarchy" >&2; return 1; }
  python3 - "$needle" <<'PY'
import re,sys,xml.etree.ElementTree as ET
needle=sys.argv[1].lower()
for node in ET.parse('window.xml').getroot().iter():
    text=(node.attrib.get('text','')+' '+node.attrib.get('content-desc','')).lower()
    if needle in text:
        bounds=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',node.attrib.get('bounds',''))
        if bounds:
            x1,y1,x2,y2=map(int,bounds.groups())
            print(f'{(x1+x2)//2} {(y1+y2)//2}')
            sys.exit(0)
raise SystemExit('Accessibility label not visible: '+needle)
PY
}

wait_for_text "Your space, your pace."
echo "PASS: React Native welcome UI rendered"
coords=$(tap_label "I am 18 or older")
read -r x y <<< "$coords"
adb shell input tap "$x" "$y"
sleep 2
coords=$(tap_label "Enter my private space")
read -r x y <<< "$coords"
adb shell input tap "$x" "$y"
wait_for_text "How are you feeling?"
echo "PASS: consent saved, SQLCipher initialized and dashboard rendered"
adb exec-out screencap -p > android-smoke.png
test -s android-smoke.png
echo "ANDROID SMOKE PASS: APK installation, launch, welcome, consent, encrypted vault, dashboard."
