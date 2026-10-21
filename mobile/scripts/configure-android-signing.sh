#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
GRADLE=android/app/build.gradle
KEYSTORE=android/app/mood-insight-upload.jks

if [[ -z "$ANDROID_KEYSTORE_BASE64" && -z "$ANDROID_KEYSTORE_PASSWORD" && -z "$ANDROID_KEY_ALIAS" && -z "$ANDROID_KEY_PASSWORD" ]]; then
  echo "::warning::Stable signing secrets not provided. Experimental APKs may be incompatible with future in-place upgrades."
  exit 0
fi
if [[ -z "$ANDROID_KEYSTORE_BASE64" || -z "$ANDROID_KEYSTORE_PASSWORD" || -z "$ANDROID_KEY_ALIAS" || -z "$ANDROID_KEY_PASSWORD" ]]; then
  echo "::error::Four Android signing secrets are required together; a partial configuration is unsafe."
  exit 1
fi

umask 077
printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 --decode > "$KEYSTORE"
test -s "$KEYSTORE"
python3 - "$GRADLE" <<'PY'
from pathlib import Path
import sys
path=Path(sys.argv[1])
source=path.read_text(encoding="utf8")
marker="signingConfigs {"
if marker not in source:
    raise SystemExit("Missing Gradle signingConfigs block")
addition="""signingConfigs {
        moodInsightUpload {
            storeFile file('mood-insight-upload.jks')
            storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
            keyAlias System.getenv('ANDROID_KEY_ALIAS')
            keyPassword System.getenv('ANDROID_KEY_PASSWORD')
        }"""
source=source.replace(marker,addition,1)
debug="signingConfig signingConfigs.debug"
if source.count(debug)<2:
    raise SystemExit("Could not identify release signing configuration")
position=source.rfind(debug)
source=source[:position]+source[position:].replace(debug,"signingConfig signingConfigs.moodInsightUpload",1)
path.write_text(source,encoding="utf8")
PY
echo "Private stable Android signing configured on the temporary runner."
