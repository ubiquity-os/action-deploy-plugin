const fs = require("fs");
const path = require("path");

function reassembleParts(dir) {
  const files = fs.readdirSync(dir);
  const partGroups = {};

  files.forEach((file) => {
    const match = file.match(/^(.*)\.part(\d+)$/);
    if (match) {
      const base = match[1];
      if (!partGroups[base]) partGroups[base] = [];
      partGroups[base].push({ file, index: parseInt(match[2], 10) });
    }
  });

  for (const base in partGroups) {
    const parts = partGroups[base].sort((a, b) => a.index - b.index);
    const outPath = path.join(dir, base);
    const writeStream = fs.createWriteStream(outPath);
    parts.forEach((part) => {
      const partPath = path.join(dir, part.file);
      const data = fs.readFileSync(partPath);
      writeStream.write(data);
    });
    writeStream.end();
    // Optionally remove parts after assembly
    parts.forEach((part) => fs.unlinkSync(path.join(dir, part.file)));
    console.log(`Reassembled ${outPath}`);
  }
}

// Call this before your main logic
reassembleParts(path.join(process.env.GITHUB_WORKSPACE, "dist"));
