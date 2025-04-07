const fs = require('fs');
const path = require('path');
const github = require('@actions/github');
const glob = require('glob');

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

const manifestPath = path.relative(githubWorkspace, manifestPathInput); // Make relative to workspace for git

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

    // Add manifest.json using content
    console.log('Processing file:', manifestPath);
    const manifestFullPath = path.resolve(githubWorkspace, manifestPath); // Need full path for reading
    const manifestContent = fs.readFileSync(manifestFullPath, 'utf8');
    treeEntries.push({
      path: manifestPath, // Use relative path for tree
      mode: '100644',
      type: 'blob',
      content: manifestContent,
    });

    // Process dist files: create blobs and add SHAs to tree
    const distPath = path.join(githubWorkspace, 'dist/');
    const distFiles = glob.sync(distPath + '**/*.{js,cjs,map,json}');

    console.log(`Processing ${distFiles.length} dist files...`);
    for (const file of distFiles) {
      const relativePath = path.relative(githubWorkspace, file); // Relative path for tree
      // Get file size
      const stats = fs.statSync(file); // Use full path for stat
      const fileSizeInBytes = stats.size;
      const fileSizeInMegabytes = fileSizeInBytes / (1024 * 1024);

      console.log(`Processing file: ${relativePath}, Size: ${fileSizeInMegabytes.toFixed(2)} MB`);

      // Check if file exceeds 100MB limit
      if (fileSizeInMegabytes > 100) {
        console.error(`ERROR: File ${relativePath} exceeds the 100MB blob size limit.`);
        // Optionally, exit early: process.exit(1);
      }

      // Read file as buffer and encode to Base64
      const fileBuffer = fs.readFileSync(file);
      const fileContentBase64 = fileBuffer.toString('base64');

      // Create the blob using octokit.request with Base64 encoding
      console.log(`Creating Base64 blob for ${relativePath}... (file content: ${fileContentBase64.length} characters)`);
      const blob = await octokit.request('POST /repos/{owner}/{repo}/git/blobs', {
        owner: owner,
        repo: repo,
        content: fileContentBase64, // Use Base64 content
        encoding: 'base64',       // Specify Base64 encoding
      });
      console.log(`Blob created for ${relativePath} with SHA: ${blob.data.sha}`);

      // Add blob SHA to the tree
      treeEntries.push({
        path: relativePath, // Use relative path
        mode: '100644',
        type: 'blob',
        sha: blob.data.sha,
      });
      console.log(`Added blob for ${relativePath} with SHA: ${blob.data.sha}`);
    }

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

    console.log('Changes pushed successfully');
  } catch (error) {
    console.error('Error pushing changes:', error);
    process.exit(1);
  }
}

pushChanges();
