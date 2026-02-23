const fs = require("fs");
const path = require("path");

const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB

function normalizeBranchName(value) {
  const branch = String(value || "")
    .trim()
    .replace(/^refs\/heads\//, "");
  if (!branch) {
    throw new Error("Branch name cannot be empty");
  }
  return branch;
}

function normalizeArtifactPrefix(value) {
  const prefix = String(value || "dist/")
    .trim()
    .replace(/^refs\/heads\//, "");
  if (!prefix) {
    return "dist/";
  }
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

function deriveArtifactRef(sourceRef, artifactPrefix) {
  const normalizedSourceRef = normalizeBranchName(sourceRef);
  const normalizedPrefix = normalizeArtifactPrefix(artifactPrefix);
  if (normalizedSourceRef.startsWith(normalizedPrefix)) {
    return normalizedSourceRef;
  }
  return `${normalizedPrefix}${normalizedSourceRef}`;
}

function splitContentIntoChunks(content, maxChunkSize) {
  const chunks = [];
  let position = 0;
  while (position < content.length) {
    chunks.push(content.slice(position, position + maxChunkSize));
    position += maxChunkSize;
  }
  return chunks;
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function getRefSha(octokit, owner, repo, ref) {
  try {
    const result = await octokit.rest.git.getRef({
      owner,
      repo,
      ref,
    });
    return result.data.object.sha;
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && Number(error.status) === 404) {
      return null;
    }
    throw error;
  }
}

async function resolveSourceSha(octokit, owner, repo, sourceRef, fallbackSha) {
  const ref = `heads/${normalizeBranchName(sourceRef)}`;
  const sourceSha = await getRefSha(octokit, owner, repo, ref);
  if (sourceSha) {
    return sourceSha;
  }
  if (fallbackSha) {
    return fallbackSha;
  }
  throw new Error(`Could not resolve source branch SHA for ${ref}`);
}

function collectTreeEntries({ githubWorkspace, manifestPathInput }) {
  const glob = require("glob");
  const treeEntries = [];
  const manifestFullPath = path.resolve(githubWorkspace, manifestPathInput);
  if (!fs.existsSync(manifestFullPath)) {
    throw new Error(`Manifest file does not exist at ${manifestFullPath}`);
  }

  treeEntries.push({
    path: "manifest.json",
    mode: "100644",
    type: "blob",
    content: fs.readFileSync(manifestFullPath, "utf8"),
  });

  const distFiles = glob.sync("dist/**/*.{js,cjs,map,json}", {
    cwd: githubWorkspace,
    absolute: true,
    nodir: true,
  });

  for (const file of distFiles) {
    const relativePath = path.relative(githubWorkspace, file).replaceAll("\\", "/");
    const fileStats = fs.statSync(file);
    if (fileStats.size > MAX_FILE_SIZE) {
      const fileContent = fs.readFileSync(file);
      const chunks = splitContentIntoChunks(fileContent, MAX_FILE_SIZE);
      for (let i = 0; i < chunks.length; i++) {
        treeEntries.push({
          path: `${relativePath}.part${i + 1}`,
          mode: "100644",
          type: "blob",
          content: chunks[i].toString("base64"),
          encoding: "base64",
        });
      }
    } else {
      treeEntries.push({
        path: relativePath,
        mode: "100644",
        type: "blob",
        content: fs.readFileSync(file, "utf8"),
      });
    }
  }

  return treeEntries;
}

async function createTreeFromEntries(octokit, owner, repo, treeEntries) {
  const blobs = [];
  for (const entry of treeEntries) {
    const blob = await octokit.rest.git.createBlob({
      owner,
      repo,
      content: entry.content,
      encoding: entry.encoding === "base64" ? "base64" : "utf-8",
    });
    blobs.push({
      path: entry.path,
      mode: entry.mode,
      type: entry.type,
      sha: blob.data.sha,
    });
  }

  const tree = await octokit.rest.git.createTree({
    owner,
    repo,
    tree: blobs,
  });

  return tree.data.sha;
}

async function pushChanges() {
  const github = require("@actions/github");
  const manifestPathInput = getRequiredEnv("MANIFEST_PATH");
  const commitMessage = getRequiredEnv("COMMIT_MESSAGE");
  const githubToken = getRequiredEnv("GITHUB_TOKEN");
  const githubWorkspace = getRequiredEnv("GITHUB_WORKSPACE");
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
  const artifactRef = deriveArtifactRef(normalizedSourceRef, artifactPrefix);
  const artifactHeadRef = `heads/${artifactRef}`;

  console.log(`Source branch: ${normalizedSourceRef}`);
  console.log(`Artifact branch: ${artifactRef}`);

  const sourceSha = await resolveSourceSha(octokit, owner, repo, normalizedSourceRef, context.sha);
  const artifactSha = await getRefSha(octokit, owner, repo, artifactHeadRef);
  const parentCommitSha = artifactSha || sourceSha;

  const parentCommit = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: parentCommitSha,
  });

  const treeEntries = collectTreeEntries({
    githubWorkspace,
    manifestPathInput,
  });
  const newTreeSha = await createTreeFromEntries(
    octokit,
    owner,
    repo,
    treeEntries
  );

  if (newTreeSha === parentCommit.data.tree.sha) {
    console.log("No generated changes to publish on artifact branch.");
    return;
  }

  const newCommit = await octokit.rest.git.createCommit({
    owner,
    repo,
    message: commitMessage,
    tree: newTreeSha,
    parents: [parentCommitSha],
  });

  if (artifactSha) {
    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: artifactHeadRef,
      sha: newCommit.data.sha,
      force: false,
    });
  } else {
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${artifactRef}`,
      sha: newCommit.data.sha,
    });
  }

  console.log(`Published artifact commit ${newCommit.data.sha} to ${artifactRef}`);
}

module.exports = {
  deriveArtifactRef,
  normalizeArtifactPrefix,
  normalizeBranchName,
};

if (require.main === module) {
  pushChanges().catch((error) => {
    console.error("Error pushing artifact changes:", error);
    process.exit(1);
  });
}
