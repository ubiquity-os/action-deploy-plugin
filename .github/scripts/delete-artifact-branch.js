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

function isBranchNotFoundError(error) {
  if (!error || typeof error !== "object") {
    return false;
  }

  if ("status" in error && Number(error.status) === 404) {
    return true;
  }

  if (!("status" in error) || Number(error.status) !== 422) {
    return false;
  }

  const response = "response" in error && error.response && typeof error.response === "object" ? error.response : null;
  const data = response && "data" in response && response.data && typeof response.data === "object" ? response.data : null;
  const message =
    (data && "message" in data && typeof data.message === "string" ? data.message : "") ||
    ("message" in error && typeof error.message === "string" ? error.message : "");

  return /reference .*does not exist/i.test(message);
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
    if (isBranchNotFoundError(error)) {
      console.log(`::warning::Branch '${artifactRef}' could not be deleted because it was not found.`);
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
