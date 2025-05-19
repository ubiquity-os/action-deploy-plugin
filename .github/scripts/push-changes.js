
const fs = require("fs");
const path = require("path");
const github = require("@actions/github");
const glob = require("glob");

const manifestPathInput = process.env.MANIFEST_PATH;
const commitMessage = process.env.COMMIT_MESSAGE;
const githubToken = process.env.GITHUB_TOKEN;
const githubWorkspace = process.env.GITHUB_WORKSPACE;
const githubRefName = process.env.GITHUB_REF_NAME;

// Set max file size for single commit (in bytes)
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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

// Helper function to split content into chunks
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
    const regularFilesToCommit = [];
    const largeFilesToCommit = [];

    console.log("Processing manifest file:", manifestRelativePath);
    regularFilesToCommit.push({
      path: manifestRelativePath,
      content: fs.readFileSync(manifestFullPath, "utf8"),
    });

    const distPath = path.join(githubWorkspace, "dist/");
    const distFiles = glob.sync(distPath + "**/*.{js,cjs,map,json}");
    console.log(`Processing ${distFiles.length} dist files...`);

    for (const file of distFiles) {
      const relativePath = path.relative(githubWorkspace, file);
      const fileStats = fs.statSync(file);
      console.log(`Processing file: ${relativePath} (${fileStats.size} bytes)`);

      // Categorize files based on size
      if (fileStats.size > MAX_FILE_SIZE) {
        console.log(`Large file detected: ${relativePath}. Will commit in chunks.`);

        // Read file as a buffer for both text and binary files
        const fileContent = fs.readFileSync(file);

        // Calculate appropriate chunk size - using a slightly smaller size to be safe
        const chunkSize = Math.floor(MAX_FILE_SIZE * 0.9);
        const chunks = splitContentIntoChunks(fileContent, chunkSize);

        largeFilesToCommit.push({
          path: relativePath,
          chunks: chunks,
          totalChunks: chunks.length
        });

        console.log(`Split ${relativePath} into ${chunks.length} sequential commits`);
      } else {
        // For regular files, handle as before
        regularFilesToCommit.push({
          path: relativePath,
          content: fs.readFileSync(file, "utf8"),
        });
      }
    }

    const commitShas = [];

    // First, commit all regular (small) files
    for (const fileInfo of regularFilesToCommit) {
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

    // Then handle large files with sequential chunk commits
    for (const largeFile of largeFilesToCommit) {
      // For large files, we'll commit each chunk sequentially to the same file path
      let startPosition = 0;
      for (let i = 0; i < largeFile.chunks.length; i++) {
        const chunk = largeFile.chunks[i];
        const chunkSize = chunk.length;
        const endPosition = startPosition + chunkSize;

        // Determine the commit operation based on chunk position
        let operation = "appending to";
        if (i === 0) {
          operation = "creating";
        }

        console.log(`${operation} ${largeFile.path} (chunk ${i+1}/${largeFile.totalChunks}, bytes ${startPosition}-${endPosition-1})`);

        // Convert chunk to base64 for binary safety
        const base64Content = Buffer.from(chunk).toString('base64');

        // Create a blob for this chunk
        const blob = await octokit.rest.git.createBlob({
          owner,
          repo,
          content: base64Content,
          encoding: 'base64'
        });

        // Get the latest tree
        const latestCommit = await octokit.rest.git.getCommit({
          owner,
          repo,
          commit_sha: parentCommitSha
        });

        // Prepare tree entry for this chunk
        const treeEntry = {
          path: largeFile.path,
          mode: "100644",
          type: "blob",
          sha: blob.data.sha
        };

        // Create a new tree with this chunk
        const newTree = await octokit.rest.git.createTree({
          owner,
          repo,
          base_tree: i === 0 ? parentCommitSha : null, // Only use base_tree for first chunk
          tree: [treeEntry]
        });

        // Create a commit for this chunk
        const newCommit = await octokit.rest.git.createCommit({
          owner,
          repo,
          message: `${commitMessage}\n\n${largeFile.path} (chunk ${i+1}/${largeFile.totalChunks})`,
          tree: newTree.data.sha,
          parents: [parentCommitSha]
        });

        commitShas.push(newCommit.data.sha);
        parentCommitSha = newCommit.data.sha;
        console.log(`Created commit for chunk ${i+1}/${largeFile.totalChunks} of ${largeFile.path}: ${newCommit.data.sha}`);

        startPosition = endPosition;
      }
    }

    // Update the reference to point to the last commit
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