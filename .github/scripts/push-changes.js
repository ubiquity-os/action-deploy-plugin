const fs = require("fs");
const path = require("path");
const github = require("@actions/github");
const glob = require("glob");

const manifestPathInput = process.env.MANIFEST_PATH;
const commitMessage = process.env.COMMIT_MESSAGE;
const githubToken = process.env.GITHUB_TOKEN;
const githubWorkspace = process.env.GITHUB_WORKSPACE;
const githubRefName = process.env.GITHUB_REF_NAME;

const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB

if (
  !manifestPathInput ||
  !commitMessage ||
  !githubToken ||
  !githubWorkspace ||
  !githubRefName
) {
  console.error(
    "Missing required environment variables (MANIFEST_PATH, COMMIT_MESSAGE, GITHUB_TOKEN, GITHUB_WORKSPACE, GITHUB_REF_NAME)",
  );
  process.exit(1);
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

async function pushChanges() {
  const octokit = github.getOctokit(githubToken);

  const context = github.context;
  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const ref = `heads/${githubRefName}`;

  try {
    console.log(`Getting current commit for ref: ${ref}`);
    const currentCommit = await octokit.rest.git.getRef({
      owner,
      repo,
      ref,
    });
    console.log(`Current commit SHA: ${currentCommit.data.object.sha}`);

    const manifestFullPath = path.resolve(githubWorkspace, manifestPathInput);
    const manifestRelativePath = path.relative(
      githubWorkspace,
      manifestFullPath,
    );

    let parentCommitSha = currentCommit.data.object.sha;
    const treeEntries = [];

    console.log("Processing manifest file:", manifestRelativePath);
    treeEntries.push({
      path: manifestRelativePath,
      mode: "100644",
      type: "blob",
      content: fs.readFileSync(manifestFullPath, "utf8"),
    });

    const distPath = path.join(githubWorkspace, "dist/");
    const distFiles = glob.sync(distPath + "**/*.{js,cjs,map,json}");
    console.log(`Processing ${distFiles.length} dist files...`);

    for (const file of distFiles) {
      const relativePath = path.relative(githubWorkspace, file);
      const fileStats = fs.statSync(file);
      console.log(`Processing file: ${relativePath} (${fileStats.size} bytes)`);

      if (fileStats.size > MAX_FILE_SIZE) {
        console.log(
          `Large file detected: ${relativePath}. Will split into chunked parts.`,
        );
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
        console.log(
          `Split ${relativePath} into ${chunks.length} files: ${relativePath}.part1 ... .part${chunks.length}`,
        );
      } else {
        treeEntries.push({
          path: relativePath,
          mode: "100644",
          type: "blob",
          content: fs.readFileSync(file, "utf8"),
        });
      }
    }

    const blobs = [];
    for (const entry of treeEntries) {
      let blob;
      if (entry.encoding === "base64") {
        blob = await octokit.rest.git.createBlob({
          owner,
          repo,
          content: entry.content,
          encoding: "base64",
        });
      } else {
        blob = await octokit.rest.git.createBlob({
          owner,
          repo,
          content: entry.content,
          encoding: "utf-8",
        });
      }
      blobs.push({
        path: entry.path,
        mode: entry.mode,
        type: entry.type,
        sha: blob.data.sha,
      });
    }

    const newTree = await octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: parentCommitSha,
      tree: blobs,
    });

    const newCommit = await octokit.rest.git.createCommit({
      owner,
      repo,
      message: commitMessage,
      tree: newTree.data.sha,
      parents: [parentCommitSha],
    });

    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref,
      sha: newCommit.data.sha,
      force: true,
    });

    console.log(`Commit ${newCommit.data.sha} pushed successfully!`);
  } catch (error) {
    console.error("Error pushing changes:", error);
    process.exit(1);
  }
}

pushChanges();
