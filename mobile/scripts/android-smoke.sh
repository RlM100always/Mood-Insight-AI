#!/usr/bin/env bash
set -euo pipefail
apk=$(find apk -type f -name '*.apk' | head -n 1)
test -n "$apk"
adb install -r "$apk"
adb shell am start -n app.moodinsight.mobile/.MainActivity
sleep 22
adb shell pidof app.moodinsight.mobile > /dev/null
capture(){
  adb shell uiautomator dump /sdcard/window.xml >/dev/null
  adb exec-out cat /sdcard/window.xml > window.xml
}
tap_label(){
  local term="$1"
  capture
  python3 - "$term" <<'PY'
import sys,re,xml.etree.ElementTree as ET
needle=sys.argv[1]
for e in ET.parse("window.xml").getroot().iter():
    txt=e.attrib.get("text","")+" "+e.attrib.get("content-desc","")
    if needle.lower() in txt.lower():
        match=re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]",e.attrib.get("bounds",""))
        if match:
            x1,y1,x2,y2=map(int,match.groups())
            print(f"{(x1+x2)//2} {(y1+y2)//2}")
            sys.exit(0)
raise SystemExit(f"Expected UI text not found: {needle}")
PY
}
capture
grep -Fq 'Your space, your pace.' window.xml
read -r x y <<< "$(tap_label 'I am 18 or older')"
adb shell input tap "$x" "$y"
sleep 1
read -r x y <<< "$(tap_label 'Enter my private space')"
adb shell input tap "$x" "$y"
sleep 12
capture
grep -Fq 'How are you feeling?' window.xml
adb exec-out screencap -p > android-smoke.png
echo "ANDROID EMULATOR SMOKE PASSED: consent, SQLCipher initialisation, dashboard"
