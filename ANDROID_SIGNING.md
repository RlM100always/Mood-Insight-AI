# Stable Android APK signing and updates

An Android APK cannot be installed as an update when the signing certificate has changed. GitHub Actions experimental builds may use temporary signing keys.

To support safe in-place upgrades, privately configure all four GitHub Actions repository secrets in Settings > Secrets and variables > Actions:

- ANDROID_KEYSTORE_BASE64: base64-encoded private JKS file
- ANDROID_KEYSTORE_PASSWORD: private keystore password
- ANDROID_KEY_ALIAS: key alias
- ANDROID_KEY_PASSWORD: private signing key password

Create and secure a signing key using Android Studio's Generate Signed Bundle/APK wizard or the JDK keytool command. Never commit the key, base64 string or passwords to GitHub; store a secure backup.

The native build workflow decodes the key in a temporary GitHub runner and patches the Expo-generated Gradle release signing block. Without secrets, the workflow builds a temporary experimental APK with a warning. It fails if only some secrets are configured.

Existing users: older APKs can be signed by a different certificate. If update installation fails, DO NOT uninstall when your local journal matters. There is no encrypted export/import implemented; uninstalling can permanently erase all private records. VersionCode increases alone do not resolve a signing mismatch.

The Android emulator E2E tests a fresh install, not the upgrade path from older builds.
