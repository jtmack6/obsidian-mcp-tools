import packageJson from "../../../../../package.json" with { type: "json" };

export function getVersion() {
  return packageJson.version;
}
