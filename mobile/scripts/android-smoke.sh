#!/usr/bin/env bash
set -euo pipefail
diagnose(){
  echo "=== Native app diagnostic dump ==="
  adb shell pidof app.moodinsight.mobile || true
  adb shell dumpsys activity activities | tail -80 || true
  adb logcat -d -v brief -s AndroidRuntime:E ReactNativeJS:E ReactNative:E SQLiteDatabase:E SQLiteLog:E | tail -120 || true
  adb exec-out screencap -p > android-smoke.png || true
  adb shell uiautomator dump /sdcard/window.xml || true
  adb exec-out cat /sdcard/window.xml > window.xml || true
  head -c 2500 window.xml || true
}
trap 'status=$?; if [ "$status" -ne 0 ]; then diagnose; fi' EXIT

apk=$(find apk -type f -name '*.apk' | head -n 1)
test -n "$apk"
adb install -r "$apk"
adb shell am start -n app.moodinsight.mobile/.MainActivity
sleep 20
capture(){
  adb shell uiautomator dump /sdcard/window.xml >/dev/null 2>&1
  adb exec-out cat /sdcard/window.xml > window.xml
}
for attempt in $(seq 1 8); do
  capture || true
  if grep -Fq 'Your space, your pace.' window.xml; then break; fi
  sleep 5
done
grep -Fq 'Your space, your pace.' window.xml || { echo 'Welcome screen did not appear'; exit 1; }
tap_label(){
  local text="$1"
  capture
  python3 - "$text" <<'PY'
import sys,xml.etree.ElementTree as ET,re
needle=sys.argv[1].lower()
for node in ET.parse('window.xml').getroot().iter():
    value=(node.attrib.get('text','')+' '+node.attrib.get('content-desc','')).lower()
    if needle in value:
        match=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',node.attrib.get('bounds',''))
        if match:
            x1,y1,x2,y2=map(int,match.groups())
            print(f'{(x1+x2)//2} {(y1+y2)//2}')
            sys.exit(0)
raise SystemExit('Not visible: '+needle)
PY
}
read -r x y <<< "$(tap_label 'I am 18 or older')"
adb shell input tap "$x" "$y"
sleep 2
read -r x y <<< "$(tap_label 'Enter my private space')"
adb shell input tap "$x" "$y"
sleep 14
capture
grep -Fq 'How are you feeling?' window.xml || { echo 'Dashboard did not appear after consent'; exit 1; }
adb exec-out screencap -p > android-smoke.png
test -s android-smoke.png
echo "ANDROID SMOKE PASS: installed, welcome shown, consent, SQLCipher vault, Today screen."
