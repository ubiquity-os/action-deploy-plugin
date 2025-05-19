const fs = require("fs");
const path = require("path");
const github = require("@actions/github");
const glob = require("glob");

const manifestPathInput = process.env.MANIFEST_PATH;
const commitMessage = process.env.COMMIT_MESSAGE;
const githubToken = process.env.GITHUB_TOKEN;
const githubWorkspace = process.env.GITHUB_WORKSPACE;
const githubRefName = process.env.GITHUB_REF_NAME;

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
    const allFilesToCommit = [];

    console.log("Processing manifest file:", manifestRelativePath);
    allFilesToCommit.push({
      path: manifestRelativePath,
      content: fs.readFileSync(manifestFullPath, "utf8"),
    });

    const distPath = path.join(githubWorkspace, "dist/");
    const distFiles = glob.sync(distPath + "**/*.{js,cjs,map,json}");
    console.log(`Processing ${distFiles.length} dist files...`);
    for (const file of distFiles) {
      const relativePath = path.relative(githubWorkspace, file);
      console.log(`Processing file: ${relativePath}`);
      allFilesToCommit.push({
        path: relativePath,
        content: fs.readFileSync(file, "utf8"),
      });
    }

    const commitShas = [];
    for (const fileInfo of allFilesToCommit) {
      const newTree = await octokit.rest.git.createTree({
        owner,
        repo,
        base_tree: parentCommitSha,
        tree: [
          {
            path: fileInfo.path,
            mode: "100644",
            type: "blob",
            content: fileInfo.content,
          },
        ],
      });

      const newCommit = await octokit.rest.git.createCommit({
        owner,
        repo,
        message: commitMessage + `\n\n${fileInfo.path}`,
        tree: newTree.data.sha,
        parents: [parentCommitSha],
      });

      commitShas.push(newCommit.data.sha);
      parentCommitSha = newCommit.data.sha;
      console.log(`Created commit for ${fileInfo.path}: ${newCommit.data.sha}`);
    }

    if (commitShas.length > 0) {
      await octokit.rest.git.updateRef({
        owner,
        repo,
        ref,
        sha: commitShas[commitShas.length - 1],
        force: true,
      });

      console.log(`All ${commitShas.length} commits pushed successfully`);
    } else {
      console.log("No files to commit");
    }
  } catch (error) {
    console.error("Error pushing changes:", error);
    process.exit(1);
  }
}

pushChanges();
