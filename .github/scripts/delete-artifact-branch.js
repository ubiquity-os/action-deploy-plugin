const github = require("@actions/github");
const {
  deriveArtifactRef,
  normalizeBranchName,
  normalizeArtifactPrefix,
} = require("./push-changes.js");

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function deleteArtifactBranch() {
  const githubToken = getRequiredEnv("GITHUB_TOKEN");
  const sourceRef = process.env.SOURCE_REF || process.env.GITHUB_REF_NAME;
  if (!sourceRef || !sourceRef.trim()) {
    throw new Error("Missing SOURCE_REF or GITHUB_REF_NAME environment variable");
  }
  const artifactPrefix = process.env.ARTIFACT_PREFIX || "dist/";

  const octokit = github.getOctokit(githubToken);
  const context = github.context;
  const owner = context.repo.owner;
  const repo = context.repo.repo;

  const normalizedSourceRef = normalizeBranchName(sourceRef);
  const normalizedPrefix = normalizeArtifactPrefix(artifactPrefix);
  const artifactRef = deriveArtifactRef(normalizedSourceRef, normalizedPrefix);

  console.log(`Source branch: ${normalizedSourceRef}`);
  console.log(`Artifact branch: ${artifactRef}`);

  try {
    await octokit.rest.git.deleteRef({
      owner,
      repo,
      ref: `heads/${artifactRef}`,
    });
    console.log(`Deleted artifact branch ${artifactRef}`);
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && Number(error.status) === 404) {
      console.log(`Artifact branch ${artifactRef} does not exist; skipping delete.`);
      return;
    }
    throw error;
  }
}

if (require.main === module) {
  deleteArtifactBranch().catch((error) => {
    console.error("Error deleting artifact branch:", error);
    process.exit(1);
  });
}
