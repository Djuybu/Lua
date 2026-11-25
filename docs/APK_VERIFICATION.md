# APK verification — 14 November 2026

## HONOR update 0.5.1 (versionCode 6)

Built and installed 0.5.1 on HONOR VKP-NX9 using `adb install -r`. Installation returned Success, package versionCode 6/versionName 0.5.1 was confirmed, and firstInstallTime remained 2026-11-13 07:41:54. Opened the native app and verified the new crawl control UI and previously confirmed needs. No FATAL EXCEPTION/ReactNativeJS Error was found in the inspected application log window.

During verification the LAN had changed: the API host moved from 172.20.10.4 to 192.168.2.190, and HONOR was at 192.168.3.52 on the same /23 subnet. The original 0.5.1 installed APK still used the old IP and did not load catalog data. A corrected APK is ready at `artifacts/android/lua-adviser-0.5.1-ab9a18951eb9.apk`, SHA-256 `ab9a18951eb9e9a66601baee37373138a0ea859e0be3da050daf8563d1d197d9`. Its embedded API URL is `http://192.168.2.190:8080`; matching signing certificate and absence of configured server secrets were verified. Gradle release build succeeded.

The corrected APK was NOT installed: the HONOR USB serial disappeared before the final install; another ADB device is unauthorized and was not operated. LAN data access also remains blocked on the new Public-profile Wi-Fi. A narrowly scoped persistent firewall rule for HONOR TCP 8080 requires explicit user approval: automatic approval review rejected opening UAC because the initial APK-update request did not specifically authorize that persistent security-setting change. No firewall rule was applied. Final machine-readable status: `artifacts/android/honor-0.5.1-verification.json`. Reconnect the HONOR and resolve firewall approval before claiming successful data loading from the corrected APK.

## Earlier 0.5.0 verification

Lựa 0.5.0, version code 5. APK: `artifacts/android/lua-adviser-0.5.0-f4f51c9fa063.apk`.

SHA-256: `f4f51c9fa0637435d9c11f5f674c0c5842a6037995733764d2f88b6d0f006cbc`.

Build: Gradle `:app:assembleRelease`, successful. ARM64 + x86_64, embedded Hermes bundle, min SDK 24, target SDK 36. APK Signature Scheme v2 verified; Android Debug certificate for internal installation. ZIP alignment including 16 KB native pages passed. Checked every uncompressed APK entry for the configured API key and DB password: absent.

Installed the exact APK onto Android 17 x86_64 emulator-5554 by upgrading the prior version code 4, without uninstalling or clearing data. Loaded the two PostgreSQL catalog variants through `http://172.20.10.4:8080`, opened a variant detail and rendered a selected variant in comparison. A chat request sent from this native APK returned a provider response from OpenAI gpt-4.1-mini, with both catalog product specifications and source links. Created a named empty QA cart and verified restoration after force-stop/relaunch. No FATAL EXCEPTION or ReactNativeJS Error appeared in the inspected log window. The prior turn separately verified full needs confirmation and a cart containing a variant in the Expo web runtime; this APK run did not repeat that whole intake journey.

Native evidence, screenshots and machine-readable results are under `artifacts/android/`. Backend runs separately with PostgreSQL/Qdrant and server-side AI credentials. No Metro or Expo Go is needed by the release APK. LAN IP is embedded; the host must be running and reachable. Physical ARM64 device behavior, operation outside this LAN and Play Store production signing remain unverified.

Build fixes are preserved in the Expo config plugin: CMake object paths capped at 240 characters for Windows, and explicit per-domain network security with includeSubdomains=false. Rebuild using `tools/Build-Apk.ps1`; start backend using `tools/Start-Backend.ps1`. See [APK setup](APK_LOCAL.md).

## Physical phone data connection — 14 November 2026

Verified the installed version 0.5.0 (versionCode 5) on the connected HONOR VKP-NX9 phone. Phone Wi-Fi 172.20.10.2 and API host 172.20.10.4 are on the same LAN. PostgreSQL/Qdrant health returned ok; the native app displayed both catalog products and observed prices. Searching HP from the native phone returned one catalog configuration. Clearing the test query restored two configurations. Existing confirmed needs were preserved. This verifies physical phone access to the data backend; physical AI inference was not re-tested in this connection check.
