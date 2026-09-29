const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require("@expo/config-plugins");

const PACKAGE_NAME = "com.nctseafoods.pos";
const SOURCE_FILES = ["BluetoothPrinterModule.kt", "BluetoothPrinterPackage.kt"];

function addPermission(manifest, name, attributes = {}) {
  const permissions = manifest.manifest["uses-permission"] ?? [];
  const existing = permissions.find((entry) => entry.$?.["android:name"] === name);
  if (existing) {
    existing.$ = { ...existing.$, ...attributes };
  } else {
    permissions.push({ $: { "android:name": name, ...attributes } });
  }
  manifest.manifest["uses-permission"] = permissions;
}

function withBluetoothPermissions(config) {
  return withAndroidManifest(config, (result) => {
    addPermission(result.modResults, "android.permission.BLUETOOTH", { "android:maxSdkVersion": "30" });
    addPermission(result.modResults, "android.permission.BLUETOOTH_ADMIN", { "android:maxSdkVersion": "30" });
    addPermission(result.modResults, "android.permission.BLUETOOTH_CONNECT");
    addPermission(result.modResults, "android.permission.BLUETOOTH_SCAN", { "android:usesPermissionFlags": "neverForLocation" });

    const features = result.modResults.manifest["uses-feature"] ?? [];
    if (!features.some((entry) => entry.$?.["android:name"] === "android.hardware.bluetooth")) {
      features.push({ $: { "android:name": "android.hardware.bluetooth", "android:required": "false" } });
    }
    result.modResults.manifest["uses-feature"] = features;
    return result;
  });
}

function withBluetoothSources(config) {
  return withDangerousMod(config, ["android", async (result) => {
    const packagePath = PACKAGE_NAME.replaceAll(".", path.sep);
    const destination = path.join(result.modRequest.platformProjectRoot, "app", "src", "main", "java", packagePath);
    fs.mkdirSync(destination, { recursive: true });
    for (const file of SOURCE_FILES) {
      fs.copyFileSync(path.join(__dirname, "bluetooth-printer", file), path.join(destination, file));
    }
    return result;
  }]);
}

function withBluetoothPackageRegistration(config) {
  return withMainApplication(config, (result) => {
    if (!result.modResults.contents.includes("add(BluetoothPrinterPackage())")) {
      result.modResults.contents = result.modResults.contents.replace(
        /PackageList\(this\)\.packages\.apply \{\s*/,
        (match) => `${match}\n          add(BluetoothPrinterPackage())\n`
      );
    }
    return result;
  });
}

module.exports = function withBluetoothPrinter(config) {
  config = withBluetoothPermissions(config);
  config = withBluetoothSources(config);
  config = withBluetoothPackageRegistration(config);
  return config;
};
