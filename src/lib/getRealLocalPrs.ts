import path from "path";
import fs from "fs";
import { execFileSync } from "child_process";
import { prisma } from "@/src/lib/prisma";

function git(args: string[], cwd: string, options?: { stdio?: "ignore" | ("ignore" | "pipe" | "inherit")[] }) {
  return execFileSync("git", args, { cwd, ...options });
}

export async function getRealLocalPrs(repoPath: string, repoId: string) {
  try {
    const resolvedPath = path.isAbsolute(repoPath) ? repoPath : path.resolve(process.cwd(), repoPath);
    if (!fs.existsSync(resolvedPath)) return null;

    try {
      git(["rev-parse", "--is-inside-work-tree"], resolvedPath, { stdio: "ignore" });
    } catch {
      return null;
    }

    const branchesBuffer = git(
      ["branch", "--format=%(refname:short)|%(objectname:short)|%(subject)|%(authorname)"],
      resolvedPath
    );
    const branches = branchesBuffer.toString().trim().split("\n").filter(Boolean);

    let baseBranch = "main";
    try {
      baseBranch = git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], resolvedPath)
        .toString()
        .trim()
        .replace("origin/", "");
    } catch {
      try {
        git(["show-ref", "--verify", "--quiet", "refs/heads/main"], resolvedPath);
        baseBranch = "main";
      } catch {
        try {
          git(["show-ref", "--verify", "--quiet", "refs/heads/master"], resolvedPath);
          baseBranch = "master";
        } catch {
          baseBranch = "main";
        }
      }
    }

    const prs: any[] = [];
    let idIndex = 1000;

    for (const bLine of branches) {
      const [branchName, hash, msg, author] = bLine.split("|");
      if (!branchName || branchName === baseBranch || branchName.includes("heads/")) continue;

      const cleanBranch = branchName.trim();
      const prId = `real-pr-${repoId}-${cleanBranch.replace(/\//g, "-")}`;

      const existingPr = await prisma.pullRequest.findUnique({ where: { id: prId } });
      if (existingPr) {
        prs.push(existingPr);
        continue;
      }

      let filesList: any[] = [];
      try {
        const changedFilesBuffer = git(
          ["diff", "--name-status", `${baseBranch}...${cleanBranch}`],
          resolvedPath
        );
        const changedFilesLines = changedFilesBuffer.toString().trim().split("\n").filter(Boolean);

        for (const fLine of changedFilesLines) {
          const parts = fLine.split(/\s+/);
          const statusChar = parts[0];
          const filename = parts[1];
          if (!filename) continue;

          let originalContent = "";
          let modifiedContent = "";
          let diffStr = "";

          try {
            diffStr = git(["diff", `${baseBranch}...${cleanBranch}`, "--", filename], resolvedPath).toString();
          } catch {}

          try {
            originalContent = git(["show", `${baseBranch}:${filename}`], resolvedPath, {
              stdio: ["ignore", "pipe", "ignore"],
            }).toString();
          } catch {}

          try {
            modifiedContent = git(["show", `${cleanBranch}:${filename}`], resolvedPath, {
              stdio: ["ignore", "pipe", "ignore"],
            }).toString();
          } catch {}

          const additions = diffStr.split("\n").filter(l => l.startsWith("+") && !l.startsWith("+++")).length;
          const deletions = diffStr.split("\n").filter(l => l.startsWith("-") && !l.startsWith("---")).length;

          filesList.push({
            filename,
            status: statusChar === "A" ? "added" : statusChar === "D" ? "deleted" : "modified",
            additions,
            deletions,
            originalContent,
            modifiedContent,
            diff: diffStr
          });
        }
      } catch (err) {
        console.error(`Git diff failed for branch ${cleanBranch}`, err);
      }

      if (filesList.length === 0) continue;

      await prisma.pullRequest.deleteMany({ where: { id: prId } });

      await prisma.pullRequest.create({
        data: {
          id: prId,
          repoId: repoId,
          title: `PR from local: ${cleanBranch}`,
          sourceBranch: cleanBranch,
          targetBranch: baseBranch,
          status: "Pending",
          author: author || "Local Dev",
          commitHash: hash || "HEAD",
          createdAt: new Date().toISOString(),
          description: msg || `Auto-detected branch representing local code changes.`
        }
      });

      for (const file of filesList) {
        const fileId = `file-real-${idIndex++}`;
        await prisma.prFile.deleteMany({ where: { id: fileId } });
        await prisma.prFile.create({
          data: {
            id: fileId,
            prId: prId,
            filename: file.filename,
            status: file.status,
            additions: file.additions,
            deletions: file.deletions,
            originalContent: file.originalContent,
            modifiedContent: file.modifiedContent,
            diff: file.diff
          }
        });
      }

      prs.push({
        id: prId,
        repoId,
        title: `PR from local: ${cleanBranch}`,
        sourceBranch: cleanBranch,
        targetBranch: baseBranch,
        status: "Pending",
        author: author || "Local Dev",
        commitHash: hash || "HEAD",
        createdAt: new Date().toISOString(),
        description: msg || `Auto-detected branch representing local code changes.`
      });
    }

    return prs;
  } catch (e) {
    console.warn("Failed scanning Git directory content", e);
    return null;
  }
}
