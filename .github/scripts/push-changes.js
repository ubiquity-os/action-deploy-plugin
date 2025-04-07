const fs = require('fs');
const path = require('path');
const github = require('@actions/github');
const glob = require('glob');
const { execSync } = require('child_process'); // Added
const crypto = require('crypto'); // Added

// Read inputs from environment variables
const manifestPathInput = process.env.MANIFEST_PATH;
const commitMessage = process.env.COMMIT_MESSAGE;
const githubToken = process.env.GITHUB_TOKEN;
const githubWorkspace = process.env.GITHUB_WORKSPACE; // GitHub Actions provides this
const githubRefName = process.env.GITHUB_REF_NAME; // GitHub Actions provides this

if (!manifestPathInput || !commitMessage || !githubToken || !githubWorkspace || !githubRefName) {
  console.error('Missing required environment variables (MANIFEST_PATH, COMMIT_MESSAGE, GITHUB_TOKEN, GITHUB_WORKSPACE, GITHUB_REF_NAME)');
  process.exit(1);
}

// Function to create a blob for a file, handling large files appropriately
async function createBlobForFile(octokit, owner, repo, filepath) {
  const fileSize = fs.statSync(filepath).size;
  const fileContent = fs.readFileSync(filepath); // Read content regardless for API path

  // For smaller files (using 1MB threshold), use the GitHub API directly
  if (fileSize < 1000000) { // Using 1MB threshold
    console.log(`File ${path.basename(filepath)} (${fileSize} bytes) - using API`);
    // Use octokit.request for consistency with original script's blob creation method
    return await octokit.request('POST /repos/{owner}/{repo}/git/blobs', {
        owner: owner,
        repo: repo,
        content: fileContent.toString('base64'),
        encoding: 'base64'
      });
  }

  // For larger files, use git hash-object locally
  console.log(`File ${path.basename(filepath)} (${fileSize} bytes) - using Git CLI fallback`);

  // Create a temporary directory for the large files if it doesn't exist
  // Assuming script runs in workspace root where .git exists
  const tempDir = path.join(githubWorkspace, '.git-temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  // Create a unique filename to avoid collisions using the absolute path
  const hash = crypto.createHash('md5').update(filepath).digest('hex');
  const tempFile = path.join(tempDir, hash);

  // Copy the file to the temp location
  fs.copyFileSync(filepath, tempFile);

  // Get the blob hash using git hash-object and write object locally
  // Ensure command runs in the workspace directory
  const objectHash = execSync(`git hash-object -w "${tempFile}"`, { cwd: githubWorkspace }).toString().trim();

  // Delete the temp file
  fs.unlinkSync(tempFile);

  // Return the SHA in the same format as the API response
  console.log(`Local blob created for ${path.basename(filepath)} with SHA: ${objectHash}`);
  return { data: { sha: objectHash } };
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
      ref
    });
    console.log(`Current commit SHA: ${currentCommit.data.object.sha}`);

    const treeEntries = [];
    const manifestFullPath = path.resolve(githubWorkspace, manifestPathInput); // Need full path for reading/hashing
    const manifestRelativePath = path.relative(githubWorkspace, manifestFullPath); // Relative path for tree

    // Process manifest file using the helper function
    console.log('Processing manifest file:', manifestRelativePath);
    const manifestBlob = await createBlobForFile(octokit, owner, repo, manifestFullPath);
    treeEntries.push({
      path: manifestRelativePath, // Use relative path for tree
      mode: '100644',
      type: 'blob',
      sha: manifestBlob.data.sha,
    });
    console.log(`Added manifest blob with SHA: ${manifestBlob.data.sha}`);


    // Process dist files using the helper function
    const distPath = path.join(githubWorkspace, 'dist/'); // Assuming dist is relative to workspace
    const distFiles = glob.sync(distPath + '**/*.{js,cjs,map,json}'); // Use glob relative to CWD (workspace)

    console.log(`Processing ${distFiles.length} dist files...`);
    for (const fileFullPath of distFiles) { // fileFullPath is absolute path from glob
      const relativePath = path.relative(githubWorkspace, fileFullPath); // Relative path for tree
      console.log(`Processing file: ${relativePath}`);

      const blob = await createBlobForFile(octokit, owner, repo, fileFullPath);
      treeEntries.push({
        path: relativePath, // Use relative path
        mode: '100644',
        type: 'blob',
        sha: blob.data.sha,
      });
      console.log(`Added blob for ${relativePath} with SHA: ${blob.data.sha}`);
    }

    // Create tree, commit, and update ref (same as before)
    console.log('Creating tree...');
    const newTree = await octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: currentCommit.data.object.sha,
      tree: treeEntries,
    });
    console.log(`Tree created with SHA: ${newTree.data.sha}`);

    console.log('Creating commit...');
    const newCommit = await octokit.rest.git.createCommit({
      owner,
      repo,
      message: commitMessage, // Use env var
      tree: newTree.data.sha,
      parents: [currentCommit.data.object.sha]
    });
    console.log(`Commit created with SHA: ${newCommit.data.sha}`);

    console.log(`Updating ref ${ref}...`);
    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref,
      sha: newCommit.data.sha,
      force: true // Force push like before
    });

    console.log('Changes committed via API successfully. Remember to git push separately if large files were processed locally.');
  } catch (error) {
    console.error('Error pushing changes:', error);
    process.exit(1);
  }
}

pushChanges();
