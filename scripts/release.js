#!/usr/bin/env node
/**
 * Flexible release script for Stickut.
 *
 * Features:
 *  - Bump version using standard-version (CHANGELOG generated, tags created)
 *  - Push to GitLab (origin) and/or GitHub
 *  - Trigger CI which creates GitLab/GitHub releases from GITHUB_RELEASES.md
 *    and publishes the Docker image to Docker Hub
 *  - Dry-run support
 *
 * Usage:
 *   npm run release              # Standard release (GitLab only)
 *   npm run release:github       # Release to both GitLab and GitHub
 *   npm run release:deploy       # Release and trigger Docker deploy
 *   npm run release:full         # Release to both + Docker deploy
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Toujours s'exécuter depuis la racine du projet (parent de scripts/),
// pour que .versionrc.json, package.json et standard-version trouvent leurs
// fichiers même si l'utilisateur lance le script depuis un sous-dossier.
const PROJECT_ROOT = path.resolve(__dirname, "..");
process.chdir(PROJECT_ROOT);

const args = process.argv.slice(2);
const options = {
  github: args.includes("--github"),
  gitlab: !args.includes("--no-gitlab"),
  deploy: args.includes("--deploy"),
  dryRun: args.includes("--dry-run"),
  skipPush: args.includes("--skip-push"),
  skipRelease: args.includes("--skip-release"),
  releaseType: args.find((a) => ["patch", "minor", "major"].includes(a)) || null,
};

function getRemoteUrl(remote) {
  try {
    return execSync(`git remote get-url ${remote}`, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function exec(command, description) {
  console.log(`\n📦 ${description}...`);
  if (options.dryRun) {
    console.log(`   [DRY RUN] ${command}`);
    return "";
  }
  try {
    return execSync(command, { encoding: "utf8", stdio: "inherit" });
  } catch {
    console.error(`❌ Failed: ${description}`);
    process.exit(1);
  }
}

function getCurrentVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8"));
  return pkg.version;
}

async function main() {
  console.log("🚀 Stickut Release Script\n");
  console.log("Options:", options);

  // 1) Working directory must be clean.
  try {
    const status = execSync("git status --porcelain", { encoding: "utf8" });
    if (status && !options.dryRun) {
      console.error("❌ Working directory not clean. Commit or stash changes first.");
      process.exit(1);
    }
  } catch {
    console.error("❌ Failed to check git status");
    process.exit(1);
  }

  const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
  console.log(`\n📌 Current branch: ${currentBranch}`);

  const gitlabUrl = getRemoteUrl("origin");
  const githubUrl = getRemoteUrl("github");
  console.log(`\n🔗 Remotes:`);
  console.log(`   GitLab (origin): ${gitlabUrl || "not configured"}`);
  console.log(`   GitHub:          ${githubUrl || "not configured"}`);

  if (options.gitlab && !gitlabUrl) {
    console.error("❌ GitLab remote (origin) not configured");
    process.exit(1);
  }
  if (options.github && !githubUrl) {
    console.error("❌ GitHub remote not configured. Run: git remote add github <url>");
    process.exit(1);
  }

  const previous = getCurrentVersion();
  console.log(`\n🔢 Current version: ${previous}`);

  // 2) Bump version with standard-version (reads .versionrc.json).
  let versionCmd = "npx standard-version";
  if (options.releaseType) versionCmd += ` --release-as ${options.releaseType}`;
  if (options.dryRun) versionCmd += " --dry-run";
  exec(versionCmd, "Bumping version (standard-version)");

  if (!options.dryRun) {
    const next = getCurrentVersion();
    console.log(`\n🆕 New version: ${next}`);
  }

  // 3) Push branch + tags to selected remotes.
  if (!options.skipPush) {
    const pushArgs = [];
    if (options.gitlab && options.github) pushArgs.push("--all");
    else if (options.github) pushArgs.push("--github");
    // GitLab is default for push.js
    const cmd = `node ${JSON.stringify(path.join(__dirname, "push.js"))} ${pushArgs.join(" ")}`.trim();
    exec(cmd, "Pushing branch and tags");
  } else {
    console.log("\n⏭️  Skipping push (--skip-push)");
  }

  // 4) Trigger Docker deploy via CI variable DEPLOY=true.
  if (options.deploy) {
    if (!gitlabUrl) {
      console.warn("\n⚠️  Cannot trigger CI deploy: no GitLab remote.");
    } else {
      console.log("\n🐳 Docker deploy triggered via tag push.");
      console.log("    The .gitlab-ci.yml job runs when DEPLOY=true is set on the pipeline.");
      console.log("    Set DEPLOY=true in GitLab CI/CD variables (or run the pipeline manually with that var).");
    }
  }

  console.log("\n✅ Release completed.");
  console.log("\nNext steps:");
  console.log("  - Watch CI pipeline (GitLab) for the new tag.");
  console.log("  - Docker image will appear on Docker Hub once `deploy` job succeeds.");
  console.log("  - GitHub release is created automatically from GITHUB_RELEASES.md.");
}

main();
