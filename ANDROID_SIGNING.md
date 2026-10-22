# Stable Android signing and production releases

Android requires the same signing certificate for an in-place update. The experimental CI workflow may use a temporary signing key; that APK is for testing only.

## Create the signing key on Windows

Use a trusted JDK. Run the following in PowerShell and answer the interactive prompts; do not put passwords directly in the command line:

~~~powershell
keytool -genkeypair -v -keystore mood-insight-upload.jks -alias mood-insight-upload -keyalg RSA -keysize 4096 -validity 10000
~~~

Make at least two secure offline copies of the keystore. If the keystore or password is lost, you may not be able to publish updates signed with the same identity. Never commit the keystore or passwords.

Encode the keystore locally:

~~~powershell
$bytes = [IO.File]::ReadAllBytes(".\mood-insight-upload.jks")
$base64 = [Convert]::ToBase64String($bytes)
Set-Clipboard $base64
~~~

## Configure private GitHub Actions secrets

Open the repository Settings → Secrets and variables → Actions → New repository secret. Add all four secrets; use the alias and passwords from the key you created:

- ANDROID_KEYSTORE_BASE64 — the base64 value copied from PowerShell
- ANDROID_KEYSTORE_PASSWORD — keystore password
- ANDROID_KEY_ALIAS — usually mood-insight-upload
- ANDROID_KEY_PASSWORD — private key password

Do not paste these values into chat, an issue, a workflow file or a commit. The repository owner must perform this step; workflow code cannot safely invent or configure the private signing credentials for you.

## Production release gate

Use Actions → Production Android release → Run workflow on the main branch and enter a version tag such as v0.5.0. The production workflow refuses to start if any stable signing secret is missing. It runs source checks, builds a stable-signed APK, verifies the APK certificate, runs Android emulator feature tests and only then creates the release.

The regular Native Android workflow remains an experimental CI build. A successful compile is not a production release, and an emulator run is not physical-device verification.

## Back up before upgrading

Version 0.5.0 provides a portable passphrase-encrypted backup. Export it and verify you can restore it before changing devices or uninstalling an app. Keep the backup file and its 12+ character passphrase separately. Losing the passphrase makes that backup unrecoverable.

Do not uninstall an existing installation just because an APK update fails with INSTALL_FAILED_UPDATE_INCOMPATIBLE; the local database and its device-only key may be lost on uninstall. Resolve the signing mismatch or restore a verified encrypted backup first.
