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
nodes=list(ET.parse('window.xml').getroot().iter())
# Prefer the actual clickable Android accessibility node (e.g. Button content-desc="Edit")
# over its child TextView, which can have a different hit area in React Native.
for clickable_pass in (True,False):
    for node in nodes:
        text=(node.attrib.get('text','')+' '+node.attrib.get('content-desc','')).lower()
        if needle not in text:
            continue
        is_clickable=node.attrib.get('clickable')=='true'
        if is_clickable != clickable_pass:
            continue
        bounds=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',node.attrib.get('bounds',''))
        if bounds:
            x1,y1,x2,y2=map(int,bounds.groups())
            # React Native can expose off-screen controls with zero-sized bounds.
            # Do not tap (0, 0); let find_and_tap scroll until the control is visible.
            if x2 > x1 and y2 > y1:
                print(f'{(x1+x2)//2} {(y1+y2)//2}')
                sys.exit(0)
raise SystemExit('Accessibility label not visible: '+needle)
PY
}

wait_for_text "Your space, your pace."
echo "PASS: React Native welcome UI rendered"
find_and_tap(){
  local label="$1"
  local coords
  for attempt in 1 2 3 4; do
    if coords=$(tap_label "$label" 2>> "$DIAG"); then
      local x y
      read -r x y <<< "$coords"
      adb shell input tap "$x" "$y"
      return 0
    fi
    echo "Scroll to look for: $label (attempt $attempt)" >> "$DIAG"
    adb shell input swipe 470 1500 470 630 450 || true
    sleep 2
  done
  echo "Required control not found after scrolling: $label" >&2
  return 1
}
find_and_tap "I am 18 or older"
sleep 2
find_and_tap "Enter my private space"
wait_for_text "How are you feeling?"
echo "PASS: consent saved, SQLCipher initialized and dashboard rendered"
adb exec-out screencap -p > android-smoke.png
test -s android-smoke.png
echo "ANDROID SMOKE PASS: APK installation, launch, welcome, consent, encrypted vault, dashboard."

# End-to-end feature checks on a fresh disposable emulator.
# These assertions create only a synthetic entry inside the temporary test device.
# Mood is the only required field; optional measurements may be skipped in this E2E.
find_and_tap "Okay"
find_and_tap "Save private check-in"
wait_for_text "Saved on your device"
echo "PASS: new mood entry was accepted by the encrypted database"
# Android's Alert.alert has an explicit OK button. The back key may leave
# this modal open; previous CI failures occurred with the confirmation dialog
# still occupying the entire accessibility hierarchy.
find_and_tap "OK"
sleep 2
capture
if grep -Fq 'Saved on your device' window.xml; then
  echo "FAILED: Save confirmation alert did not dismiss" >&2
  exit 1
fi
echo "PASS: save confirmation dismissed cleanly"

find_and_tap "Journal tab"
wait_for_text "Your story, your words"
# New check-in means the journal list must contain a nonempty record, not the empty state.
capture
if grep -Fq 'No entries match' window.xml; then
  echo "FAILED: journal is empty after saving a mood entry" >&2
  exit 1
fi
echo "PASS: journal navigation and saved entry rendered"

find_and_tap "Edit"
wait_for_text "How are you feeling?"
echo "PASS: previously saved check-in is editable"

# Verify SQLCipher persistence after the native process is fully stopped.
adb shell am force-stop "$PACKAGE"
adb shell am start -W -n "$PACKAGE/.MainActivity"
wait_for_text "How are you feeling?"
find_and_tap "Journal tab"
wait_for_text "Your story, your words"
capture
if grep -Fq 'No entries match' window.xml; then
  echo "FAILED: saved check-in was lost after app restart" >&2
  exit 1
fi
echo "PASS: encrypted journal survives a full app process restart"

# Exercise a real guided activity and feedback workflow.
find_and_tap "Activities tab"
wait_for_text "Your three recommended activities"
find_and_tap "See guided steps"
wait_for_text "A simple step-by-step guide"
find_and_tap "I completed or tried this"
wait_for_text "Saved locally"
find_and_tap "OK"
echo "PASS: guided activity completion was stored"
find_and_tap "👍 Helpful"
sleep 2
echo "PASS: activity feedback control accepted a tap"

find_and_tap "Progress tab"
wait_for_text "Your wellbeing journey"
echo "PASS: Progress screen and activity goals rendered"

find_and_tap "Privacy tab"
wait_for_text "Your data. Your choice."
find_and_tap "Check app features"
# Health output may appear below the fold after encryption/storage checks.
for attempt in $(seq 1 8); do
  capture || true
  if test -s window.xml && grep -Fq 'PASS:' window.xml; then break; fi
  adb shell input swipe 490 1530 490 720 350 || true
  sleep 3
done
grep -Fq 'PASS:' window.xml || { echo "FAILED: local database health check did not report PASS" >&2; exit 1; }
echo "PASS: in-app SQLCipher read/write, journal, activity and preferences diagnostics"

adb exec-out screencap -p > android-smoke.png
echo "ANDROID FEATURE E2E PASS: save, dialog dismiss, encrypted restart persistence, journal edit, guided activity, feedback, progress and storage diagnostics."

# Verify the encrypted backup/restore controls are present without exporting user data
# or invoking the system file picker on the CI emulator.
for attempt in $(seq 1 8); do
  capture || true
  if test -s window.xml && grep -Fq 'Export encrypted backup' window.xml; then break; fi
  adb shell input swipe 490 1530 490 720 350 || true
  sleep 2
done
grep -Fq 'Export encrypted backup' window.xml || { echo "FAILED: encrypted backup export control not visible" >&2; exit 1; }
grep -Fq 'Choose backup file to restore' window.xml || { echo "FAILED: encrypted backup restore control not visible" >&2; exit 1; }
echo "PASS: encrypted backup and restore controls rendered"
