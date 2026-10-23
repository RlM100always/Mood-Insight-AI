#!/usr/bin/env bash
set -Eeuo pipefail
# Real smoke checks: keep assertions. Do not label an APK working merely because it installs.
PACKAGE=app.moodinsight.mobile
DIAG=android-diagnostics.txt
# Pin every adb command to the emulator selected by android-emulator-runner.
export ANDROID_SERIAL="${ANDROID_SERIAL:-emulator-5554}"
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

wait_for_device_ready(){
  local state boot
  for attempt in $(seq 1 45); do
    adb start-server >/dev/null 2>&1 || true
    state=$(adb get-state 2>/dev/null || true)
    if [[ "$state" == "device" ]]; then
      boot=$(adb shell getprop sys.boot_completed 2>/dev/null || true)
      if [[ "$boot" == "1" ]]; then return 0; fi
    fi
    adb reconnect offline >/dev/null 2>&1 || true
    echo "Waiting for Android emulator readiness ($attempt/45)" >> "$DIAG"
    sleep 2
  done
  echo "Android emulator did not become ready after 90 seconds" >&2
  return 1
}

apk=$(find apk -type f -name '*.apk' | head -n 1)
if ! test -s "$apk"; then echo "APK artifact not found" >&2; exit 1; fi
wait_for_device_ready
test -s mobile/e2e-restore-fixture.mibak || { echo "Encrypted E2E restore fixture is missing" >&2; exit 1; }
test -s mobile/e2e-restore-fixture-tampered.mibak || { echo "Encrypted E2E integrity fixture is missing" >&2; exit 1; }

# android-emulator-runner can report sys.boot_completed before credential-encrypted
# shared storage is ready. Do not misclassify that emulator race as an app failure.
prepare_shared_downloads(){
  local marker="/storage/emulated/0/Download/.mood-insight-ci-write-test"
  for attempt in $(seq 1 30); do
    adb shell input keyevent 82 >/dev/null 2>&1 || true
    adb shell mkdir -p /storage/emulated/0/Download >> "$DIAG" 2>&1 || true
    if adb shell "echo ready > '$marker'" >> "$DIAG" 2>&1; then
      adb shell rm -f "$marker" >> "$DIAG" 2>&1 || true
      echo "Shared Downloads storage is writable (attempt $attempt)." >> "$DIAG"
      return 0
    fi
    echo "Waiting for writable shared Downloads storage ($attempt/30)" >> "$DIAG"
    sleep 2
  done
  echo "Android shared Downloads storage never became writable." >&2
  return 1
}
push_download_fixture(){
  local source="$1" target="$2"
  for attempt in 1 2 3 4 5; do
    if adb push "$source" "$target" >> "$DIAG" 2>&1; then return 0; fi
    echo "Retrying fixture push to shared Downloads ($attempt/5): $target" >> "$DIAG"
    sleep 2
  done
  echo "Could not stage encrypted backup fixture in Android Downloads: $target" >&2
  return 1
}
prepare_shared_downloads
push_download_fixture mobile/e2e-restore-fixture.mibak /storage/emulated/0/Download/mood-insight-e2e-backup.mibak
push_download_fixture mobile/e2e-restore-fixture-tampered.mibak /storage/emulated/0/Download/mood-insight-e2e-backup-tampered.mibak
adb shell ls -l /storage/emulated/0/Download/mood-insight-e2e-backup*.mibak >> "$DIAG" 2>&1
adb install -r "$apk"
adb logcat -c || true
adb shell input keyevent 82 || true
adb shell am force-stop "$PACKAGE" || true
adb shell am start -W -n "$PACKAGE/.MainActivity"
echo "APK installed and launch requested; waiting for React Native UI to become ready..."

capture(){
  # Never let a failed hierarchy dump reuse a stale local XML snapshot.
  rm -f window.xml
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

# A React Native ScrollView can contain the correct heading below the visible
# viewport. Search the real accessibility tree while scrolling instead of
# failing merely because the heading is off-screen.
wait_for_text_while_scrolling(){
  target=$1
  for attempt in $(seq 1 12); do
    capture || true
    if test -s window.xml && grep -Fq "$target" window.xml; then return 0; fi
    echo "Scrolling to locate '$target' ($attempt/12)" | tee -a "$DIAG"
    adb shell input swipe 490 1500 490 650 400 || true
    sleep 2
  done
  echo "Expected UI not found after scrolling: $target" >&2
  return 1
}

# Screens share a native viewport in the test harness. Reset it after switching
# tabs so a previous screen's scroll position cannot hide the next screen title.
scroll_to_top(){
  for attempt in 1 2 3; do
    adb shell input swipe 490 650 490 1550 350 || true
    sleep 1
  done
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

enter_backup_passphrase(){
  local value="$1"
  find_and_tap "Backup passphrase"
  adb shell input text "$value"
  adb shell input keyevent 4 || true
  sleep 1
}

open_download_fixture(){
  local filename="$1"
  find_and_tap "Choose backup file to restore"
  sleep 2
  local coords
  if coords=$(tap_label "Show roots" 2>> "$DIAG"); then
    local x y
    read -r x y <<< "$coords"
    adb shell input tap "$x" "$y"
  else
    # Android DocumentsUI normally puts its navigation drawer at this location.
    adb shell input tap 55 100
  fi
  sleep 2
  find_and_tap "Downloads"
  sleep 2
  find_and_tap "$filename"
  sleep 3
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

find_and_tap "Edit journal entry"
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
# A tab may retain the previous ScrollView offset. Return to the top before
# asserting the activity screen, then allow the native view tree to settle.
for attempt in 1 2 3; do
  adb shell input swipe 490 680 490 1550 350 || true
  sleep 2
done
wait_for_text "Small actions, real choices"
wait_for_text_while_scrolling "Three suggestions for right now"
find_and_tap "See guided steps"
wait_for_text "A simple step-by-step guide"
find_and_tap "I completed or tried this"
wait_for_text "Saved locally"
find_and_tap "OK"
echo "PASS: guided activity completion was stored"
find_and_tap "👍 Helpful"
sleep 2
echo "PASS: activity feedback control accepted a tap"

find_and_tap "More tab"
scroll_to_top
wait_for_text "More control, less clutter"
find_and_tap "Open Progress & goals"
scroll_to_top
wait_for_text_while_scrolling "Your wellbeing journey"
echo "PASS: More hub and Progress screen rendered"

find_and_tap "More tab"
scroll_to_top
wait_for_text "More control, less clutter"
find_and_tap "Open Privacy & data"
scroll_to_top
wait_for_text_while_scrolling "Your data. Your choice."
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

# Exercise export and restore with synthetic records only on this disposable emulator.
# The fixture includes one new day and a same-day conflict to verify local data wins.
BACKUP_PASSPHRASE='MoodInsightE2EBackupPassphrase2026'
for attempt in $(seq 1 8); do
  capture || true
  if test -s window.xml && grep -Fq 'Export encrypted backup' window.xml; then break; fi
  adb shell input swipe 490 1530 490 720 350 || true
  sleep 2
done
grep -Fq 'Export encrypted backup' window.xml || { echo "FAILED: encrypted backup export control not visible" >&2; exit 1; }
grep -Fq 'Choose backup file to restore' window.xml || { echo "FAILED: encrypted backup restore control not visible" >&2; exit 1; }

find_and_tap "Backup passphrase"
adb shell input text "$BACKUP_PASSPHRASE"
adb shell input keyevent 4 || true
find_and_tap "Confirm backup passphrase"
adb shell input text "$BACKUP_PASSPHRASE"
adb shell input keyevent 4 || true
find_and_tap "Export encrypted backup"
sleep 4
# expo-sharing uses an Android system activity. On the AOSP CI image, cancelling
# that activity can leave Launcher in front even though the RN process is alive.
# Bring the existing task back explicitly, then assert the app's post-share status.
adb shell input keyevent 4 || true
sleep 2
adb shell am start -W -n "$PACKAGE/.MainActivity" >> "$DIAG" 2>&1
sleep 3
capture || true
if ! grep -Fq 'Your data. Your choice.' window.xml; then
  find_and_tap "More tab"
  scroll_to_top
  wait_for_text "More control, less clutter"
  find_and_tap "Open Privacy & data"
  scroll_to_top
  wait_for_text_while_scrolling "Your data. Your choice."
fi
wait_for_text_while_scrolling "Encrypted backup prepared"
echo "PASS: encrypted backup export completed through the native share sheet and returned to app"

# Wrong passphrase must fail before a restore confirmation or any database change.
enter_backup_passphrase "WrongPasswordForE2E2026"
open_download_fixture "mood-insight-e2e-backup.mibak"
wait_for_text "Backup could not be restored"
find_and_tap "OK"
sleep 2
echo "PASS: wrong backup passphrase was rejected"

# A valid fixture adds yesterday's record but must not overwrite today's existing check-in.
enter_backup_passphrase "$BACKUP_PASSPHRASE"
open_download_fixture "mood-insight-e2e-backup.mibak"
wait_for_text "Restore encrypted backup?"
find_and_tap "Merge backup"
wait_for_text_while_scrolling "Restore complete: added 1 check-ins and 1 activity records"
echo "PASS: encrypted backup restored and same-day local entry preserved"

find_and_tap "Journal tab"
scroll_to_top
capture
if grep -Fq 'E2E_SHOULD_NOT_OVERWRITE_LOCAL_ENTRY' window.xml; then
  echo "FAILED: restore overwrote the existing same-day local journal entry" >&2
  exit 1
fi
wait_for_text_while_scrolling "E2E_RESTORED_ENTRY_CHECK"
echo "PASS: restored journal record is readable after decrypting on-device"

# Authenticated ciphertext corruption must be rejected without removing the restored record.
find_and_tap "More tab"
scroll_to_top
wait_for_text "More control, less clutter"
find_and_tap "Open Privacy & data"
scroll_to_top
wait_for_text_while_scrolling "Your data. Your choice."
enter_backup_passphrase "$BACKUP_PASSPHRASE"
open_download_fixture "mood-insight-e2e-backup-tampered.mibak"
wait_for_text "Backup could not be restored"
find_and_tap "OK"
sleep 2
find_and_tap "Journal tab"
scroll_to_top
wait_for_text_while_scrolling "E2E_RESTORED_ENTRY_CHECK"
echo "PASS: corrupted encrypted backup rejected and existing restored data remained"
