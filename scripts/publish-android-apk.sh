#!/usr/bin/env bash
set -Eeuo pipefail

# Publish already-compiled GitHub Actions Android APK as a clearly labelled
# experimental pre-release. This is independent of emulator smoke status:
# a built APK is NOT proof that its runtime is working on real devices.
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY missing}"
SOURCE_RUN_ID="${SOURCE_RUN_ID:-}"
SOURCE_SHA="${SOURCE_SHA:-}"

find_run_artifact() {
  local id="$1"
  gh api "repos/$REPO/actions/runs/$id/artifacts" --jq \
    '.artifacts[] | select(.name == "mood-insight-android-apk" and (.expired | not)) | .id' \
    | head -n 1
}

if [[ -n "$SOURCE_RUN_ID" ]]; then
  # Never trust a workflow_run from outside this repo or an untrusted branch.
  info=$(gh api "repos/$REPO/actions/runs/$SOURCE_RUN_ID")
  repo_name=$(jq -r '.head_repository.full_name // ""' <<< "$info")
  branch=$(jq -r '.head_branch // ""' <<< "$info")
  event=$(jq -r '.event // ""' <<< "$info")
  if [[ "$repo_name" != "$REPO" || "$branch" != "main" || ! "$event" =~ ^(push|workflow_dispatch)$ ]]; then
    echo "Only Android APK builds from this repo's main branch may be published."
    exit 1
  fi
  SOURCE_SHA=$(jq -r '.head_sha' <<< "$info")
  asset_id=$(find_run_artifact "$SOURCE_RUN_ID")
  if [[ -z "$asset_id" ]]; then
    echo "Source run $SOURCE_RUN_ID contains no ready Android APK artifact; nothing to publish."
    exit 0
  fi
else
  echo "Searching recent main-branch Android builds for an available APK."
  while read -r run sha; do
    [[ -n "$run" ]] || continue
    asset_id=$(find_run_artifact "$run" || true)
    if [[ -n "$asset_id" ]]; then
      SOURCE_RUN_ID="$run"
      SOURCE_SHA="$sha"
      break
    fi
  done < <(gh api "repos/$REPO/actions/runs?branch=main&per_page=30" --jq \
    '.workflow_runs[] | select(.name == "Native Android APK and emulator smoke") | "\(.id) \(.head_sha)"')
fi

if [[ -z "$SOURCE_RUN_ID" || -z "$SOURCE_SHA" ]]; then
  echo "No available Android APK in recent main-branch Actions runs."
  exit 1
fi

mkdir -p release-apk
gh run download "$SOURCE_RUN_ID" --repo "$REPO" \
  --name mood-insight-android-apk --dir release-apk

apk=$(find release-apk -type f -name '*.apk' | head -n 1)
if [[ -z "$apk" || ! -s "$apk" ]]; then
  echo "Downloaded workflow artifact does not contain an APK."
  exit 1
fi

cp "$apk" ./Mood-Insight-AI.apk
sha256sum Mood-Insight-AI.apk | tee apk-sha256.txt
tag="android-experimental-${SOURCE_SHA:0:12}"

cat > release-notes.md <<EOF
## Mood Insight AI — experimental Android APK

**Download:** Open **Assets** below and choose **Mood-Insight-AI.apk**.

This APK is a native React Native Android test build, built from commit
\`$SOURCE_SHA\` in [GitHub Actions run #$SOURCE_RUN_ID](https://github.com/$REPO/actions/runs/$SOURCE_RUN_ID).

**IMPORTANT:** This is an **experimental pre-release**, not a verified production app.
A successful APK compilation does not guarantee the app launches or works on every
Android handset. Emulator smoke tests may fail independently. Use fictional test
data only until startup, encryption and save/reopen are independently validated.

The on-device ML demo was trained on synthetic data only. It is not a clinical
or validated mental-health prediction tool.

**Install:** Download the APK on an Android device, open it from Files/Downloads,
and approve installation from that source if Android asks. Do not bypass Android
security warnings. It does not install on an iPhone.
EOF

if gh release view "$tag" --repo "$REPO" >/dev/null 2>&1; then
  echo "Release $tag already exists; updating its APK asset."
  gh release upload "$tag" ./Mood-Insight-AI.apk --repo "$REPO" --clobber
else
  gh release create "$tag" ./Mood-Insight-AI.apk \
    --repo "$REPO" \
    --target "$SOURCE_SHA" \
    --title "Android experimental APK — ${SOURCE_SHA:0:12}" \
    --notes-file release-notes.md \
    --prerelease
fi

echo "APK AVAILABLE: https://github.com/$REPO/releases/tag/$tag"
