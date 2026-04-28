/**
 * Custom version updater for Python pyproject.toml.
 * Used by standard-version (via .versionrc.json bumpFiles) to bump the
 * `version = "x.y.z"` line at the top of the [project] table.
 */

const versionRegex = /^version\s*=\s*"([^"]+)"\s*$/m;

module.exports.readVersion = function (contents) {
  const match = contents.match(versionRegex);
  if (match) {
    return match[1];
  }
  throw new Error('Could not find `version = "..."` line in pyproject.toml');
};

module.exports.writeVersion = function (contents, version) {
  return contents.replace(versionRegex, `version = "${version}"`);
};
