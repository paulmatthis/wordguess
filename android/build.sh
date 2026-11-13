#!/usr/bin/env bash
# Builds wordguess.apk from docs/ using the Android SDK tools directly (no Gradle).
# Needs: ANDROID_HOME, Java, and a signing key in KEYSTORE_FILE / KEYSTORE_PASS.
# Normally run by GitHub (.github/workflows/apk.yml), not by hand.
set -euo pipefail
cd "$(dirname "$0")"

BT=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)
JAR=$(ls -d "$ANDROID_HOME"/platforms/android-* | sort -V | tail -1)/android.jar
VERSION=${VERSION:-1}

rm -rf build
mkdir -p build/res/mipmap-xxxhdpi build/assets/www build/classes build/dex
cp ../docs/icons/icon-192.png build/res/mipmap-xxxhdpi/ic_launcher.png
cp -R ../docs/. build/assets/www/
rm -f build/assets/www/sw.js   # browser-only offline support; the app is already offline
echo "const APP_VERSION = $VERSION;" > build/assets/www/version.js   # for "Check for updates"

"$BT/aapt2" compile --dir build/res -o build/res.zip
"$BT/aapt2" link -o build/unaligned.apk -I "$JAR" --manifest AndroidManifest.xml \
  -A build/assets --min-sdk-version 24 --target-sdk-version 34 \
  --version-code "$VERSION" --version-name "1.$VERSION" build/res.zip

javac -source 8 -target 8 -bootclasspath "$JAR" -d build/classes src/app/wordguess/*.java
"$BT/d8" --lib "$JAR" --min-api 24 --output build/dex $(find build/classes -name '*.class')
(cd build/dex && zip -q ../unaligned.apk classes.dex)

"$BT/zipalign" -f 4 build/unaligned.apk build/aligned.apk
"$BT/apksigner" sign --ks "$KEYSTORE_FILE" --ks-type pkcs12 --ks-pass env:KEYSTORE_PASS \
  --ks-key-alias wordguess --out build/wordguess.apk build/aligned.apk
"$BT/apksigner" verify build/wordguess.apk
ls -la build/wordguess.apk
