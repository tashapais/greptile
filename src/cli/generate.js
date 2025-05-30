import simpleGit from 'simple-git';
import { OpenAI } from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import chalk from 'chalk';
import axios from 'axios';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = path.join(__dirname, '../../data');

const git = simpleGit();
let openai;

// Initialize OpenAI client if API key is available
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

/**
 * Get repository name from remote URL
 */
async function getRepoInfo() {
  try {
    // Get remote URLs
    const remotes = await git.remote(['get-url', 'origin']);
    
    let repoName = 'unknown-repo';
    let repoUrl = '';
    
    if (remotes) {
      const remoteUrl = remotes.trim();
      
      // Extract repo name and URL
      if (remoteUrl.includes('github.com')) {
        const match = remoteUrl.match(/github\.com[/:](.*?)(\.git)?$/);
        if (match) {
          repoName = match[1].replace('/', '-');
          repoUrl = `https://github.com/${match[1]}`;
        }
      } else if (remoteUrl.includes('gitlab.com')) {
        const match = remoteUrl.match(/gitlab\.com[/:](.*?)(\.git)?$/);
        if (match) {
          repoName = match[1].replace('/', '-');
          repoUrl = `https://gitlab.com/${match[1]}`;
        }
      } else {
        // Try to extract just the repo name from the path
        const parts = remoteUrl.split('/');
        repoName = parts[parts.length - 1].replace('.git', '');
      }
    } else {
      // If no remote, use the folder name
      const gitDir = await git.revparse(['--show-toplevel']);
      repoName = path.basename(gitDir);
    }
    
    return { repoName, repoUrl };
  } catch (error) {
    console.error(chalk.yellow('Warning: Could not determine repository info:'), error.message);
    return { repoName: 'unknown-repo', repoUrl: '' };
  }
}

/**
 * Generate a changelog based on git commit history
 */
export async function generateChangelog(options) {
  try {
    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error(chalk.red('Error: OPENAI_API_KEY environment variable is not set'));
      console.error(chalk.yellow('Please set your OpenAI API key to use the changelog generator'));
      process.exit(1);
    }

    console.log(chalk.blue(`Generating changelog from "${options.since}" to "${options.until}"...`));
    
    // Get current git repository path
    let gitDir;
    try {
      gitDir = await git.revparse(['--show-toplevel']);
      console.log(chalk.blue(`Using git repository at: ${gitDir}`));
    } catch (err) {
      console.log(chalk.yellow('Warning: Could not determine git repository path'));
    }
    
    // Get repository info
    const { repoName, repoUrl } = await getRepoInfo();
    console.log(chalk.blue(`Repository: ${repoName}${repoUrl ? ` (${repoUrl})` : ''}`));
    
    // Get git log
    const commits = await getCommits(options.since, options.until);
    
    if (commits.length === 0) {
      console.log(chalk.yellow('No commits found in the specified date range.'));
      return;
    }
    
    console.log(chalk.green(`Found ${commits.length} commits.`));
    
    // Print some info about the commits for debugging
    commits.forEach((commit, index) => {
      console.log(chalk.blue(`Commit ${index + 1}:`));
      console.log(chalk.blue(`  Hash: ${commit.hash}`));
      console.log(chalk.blue(`  Author: ${commit.author}`));
      console.log(chalk.blue(`  Date: ${commit.date}`));
      console.log(chalk.blue(`  Subject: ${commit.subject}`));
    });
    
    // Get changed files and perform code analysis if requested
    let codeAnalysis = null;
    if (options.useGreptile) {
      try {
        console.log(chalk.blue('Getting file changes for better context...'));
        
        // Collect all changed files across commits
        let allChangedFiles = [];
        for (const commit of commits) {
          const files = await getChangedFilesInCommit(commit.hash);
          allChangedFiles.push(...files);
        }
        
        // Remove duplicates and make paths absolute
        allChangedFiles = [...new Set(allChangedFiles)];
        
        if (allChangedFiles.length > 0) {
          console.log(chalk.green(`Found ${allChangedFiles.length} changed files.`));
          
          // Try using Greptile API first
          if (process.env.GREPTILE_API_KEY) {
            codeAnalysis = await analyzeCodeWithGreptile(gitDir, allChangedFiles, commits);
          }
          
          // Fall back to OpenAI if Greptile fails or no API key
          if (!codeAnalysis && process.env.OPENAI_API_KEY) {
            console.log(chalk.blue('Falling back to OpenAI for code analysis...'));
            codeAnalysis = await analyzeCodeWithOpenAI(gitDir, allChangedFiles);
          }
        } else {
          console.log(chalk.yellow('No changed files found to analyze.'));
        }
      } catch (err) {
        console.log(chalk.yellow(`Warning: Error analyzing code changes: ${err.message}`));
      }
    }
    
    console.log(chalk.blue('Analyzing commits and generating changelog...'));
    
    // Generate changelog using AI
    const changelog = await generateChangelogWithAI(commits, options, repoName, repoUrl, codeAnalysis);
    
    // Save changelog
    await saveChangelog(changelog, repoName);
    
    console.log(chalk.green('Changelog generated successfully!'));
    console.log(chalk.blue(`Repository: ${repoName}`));
    console.log(chalk.blue(`Title: ${changelog.title}`));
    console.log(chalk.blue(`Date: ${changelog.date}`));
    console.log(chalk.blue(`Entries: ${changelog.entries.length}`));
    console.log(chalk.yellow(`Run 'greptile serve' to view the changelog on the web`));
  } catch (error) {
    console.error(chalk.red('Error generating changelog:'), error.message);
    process.exit(1);
  }
}

/**
 * Get commits from the git repository
 */
async function getCommits(since, until) {
  try {
    // Use a more direct approach with simpleGit
    const options = ['--date=iso'];
    
    if (since) {
      options.push(`--since="${since}"`);
    }
    
    if (until && until !== 'now') {
      options.push(`--until="${until}"`);
    }
    
    console.log(chalk.blue(`Git log options: ${options.join(' ')}`));
    
    const logs = await git.log(options);
    
    console.log(chalk.green(`Raw log entries: ${logs.total}`));
    
    if (logs.total === 0) {
      return [];
    }
    
    return logs.all.map(commit => ({
      hash: commit.hash,
      author: commit.author_name,
      date: commit.date,
      subject: commit.message.split('\n')[0]
    }));
  } catch (error) {
    console.error(chalk.red('Error getting git commits:'), error.message);
    return [];
  }
}

/**
 * Get changed files in a specific commit
 */
async function getChangedFilesInCommit(commitHash) {
  try {
    // Check if this is the first commit in the repository
    const isFirstCommit = await isFirstCommitInRepo(commitHash);
    
    if (isFirstCommit) {
      // For the first commit, get all files added
      const result = await git.show(['--name-only', '--pretty=format:', commitHash]);
      return result.split('\n').filter(Boolean);
    } else {
      // For other commits, get the diff with parent
      const result = await git.diff(['--name-only', `${commitHash}^..${commitHash}`]);
      return result.split('\n').filter(Boolean);
    }
  } catch (error) {
    console.log(chalk.yellow(`Warning: Error getting changed files for commit ${commitHash}: ${error.message}`));
    return [];
  }
}

/**
 * Check if a commit is the first commit in the repository
 */
async function isFirstCommitInRepo(commitHash) {
  try {
    // Try to get the parent of this commit
    const result = await git.raw(['rev-parse', `${commitHash}^`]);
    return false; // If we get here, it has a parent, so it's not the first commit
  } catch (error) {
    // If we get an error, it likely means there's no parent, so it's the first commit
    return true;
  }
}

/**
 * Use Greptile API to analyze code changes
 */
async function analyzeCodeWithGreptile(gitDir, changedFiles, commits) {
  if (!process.env.GREPTILE_API_KEY) {
    console.log(chalk.yellow('Skipping Greptile analysis - API key not found'));
    return null;
  }
  
  try {
    console.log(chalk.blue('Analyzing codebase with Greptile API...'));
    
    // Get the current repository URL
    let repoUrl = '';
    try {
      const remotes = await git.remote(['get-url', 'origin']);
      if (remotes) {
        repoUrl = remotes.trim();
      }
    } catch (error) {
      console.log(chalk.yellow(`Warning: Unable to get repository URL: ${error.message}`));
    }
    
    if (!repoUrl) {
      console.log(chalk.yellow('Unable to determine repository URL, skipping Greptile analysis'));
      return null;
    }
    
    // Parse the repository information
    const repoInfo = parseRepositoryUrl(repoUrl);
    if (!repoInfo) {
      console.log(chalk.yellow('Unable to parse repository information, skipping Greptile analysis'));
      return null;
    }
    
    console.log(chalk.blue(`Identified repository: ${repoInfo.owner}/${repoInfo.repo}`));
    
    // Step 1: First we need to index the repository if it hasn't been indexed yet
    console.log(chalk.blue('Indexing repository with Greptile...'));
    
    try {
      const indexResponse = await axios({
        method: 'post',
        url: 'https://api.greptile.com/v2/repositories',
        headers: {
          'Authorization': `Bearer ${process.env.GREPTILE_API_KEY}`,
          'Content-Type': 'application/json',
          'X-GitHub-Token': process.env.GITHUB_TOKEN || ''
        },
        data: {
          remote: 'github',
          repository: `${repoInfo.owner}/${repoInfo.repo}`,
          branch: 'main', // Default to main, could be made configurable
          reload: true,
          notify: false
        }
      });
      
      console.log(chalk.green('Repository indexing request sent successfully'));
      
      // Wait a moment for indexing to complete (real implementation would check status)
      console.log(chalk.blue('Waiting for indexing to complete...'));
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      console.log(chalk.yellow(`Warning: Error indexing repository: ${error.message}`));
      if (error.response) {
        // If we get a 409, the repo is already indexed, which is fine
        if (error.response.status === 409) {
          console.log(chalk.green('Repository is already indexed, proceeding with query'));
        } else {
          console.log(chalk.yellow(`Status: ${error.response.status}`));
          console.log(chalk.yellow(`Data: ${JSON.stringify(error.response.data, null, 2)}`));
          
          // Additional guidance for specific error conditions
          if (error.response.status === 401) {
            console.log(chalk.yellow('Error: Authentication failed. Check your GREPTILE_API_KEY and GITHUB_TOKEN values.'));
          } else if (error.response.status === 403) {
            console.log(chalk.yellow('Error: Permission denied. Ensure your API key and GitHub token have sufficient permissions.'));
          } else if (error.response.status === 400) {
            console.log(chalk.yellow('Error: Bad request. Please check your query parameters.'));
          }
          
          console.log(chalk.blue('Falling back to OpenAI for code analysis...'));
          return null;
        }
      } else {
        console.log(chalk.blue('Falling back to OpenAI for code analysis...'));
        return null;
      }
    }
    
    // Step 2: Now we can query the repository
    console.log(chalk.blue('Querying repository for changelog information...'));
    
    // Check if commits array exists and has items
    if (!commits || !Array.isArray(commits) || commits.length === 0) {
      console.log(chalk.yellow('Warning: No commits provided for Greptile analysis'));
      commits = [];
    }
    
    // Format commit info for the prompt
    const commitInfo = commits.map(c => 
      `${c.hash.substring(0, 8)}: ${c.subject}`
    ).join('\n');
    
    const prompt = `
    Analyze the following SPECIFIC COMMITS from the repository "${repoInfo.owner}/${repoInfo.repo}" to generate a detailed changelog:
    
    RECENT COMMITS TO ANALYZE:
    ${commitInfo || "No specific commits provided - analyze the repository in general"}
    
    Focus SPECIFICALLY on these commits and provide:
    1. What specific features, improvements, or bug fixes were implemented in THESE commits
    2. How these specific changes benefit users directly
    3. Accurate categorization (New Features, Improvements, Bug Fixes, API Changes, Breaking Changes)
    4. Details about user-facing impacts of these exact commits
    
    Avoid generic descriptions. Be precise about what changed in THESE SPECIFIC COMMITS.
    
    Format the response as a detailed analysis that clearly explains each commit's impact for a changelog.
    `;
    
    const response = await axios({
      method: 'post',
      url: 'https://api.greptile.com/v2/query',
      headers: {
        'Authorization': `Bearer ${process.env.GREPTILE_API_KEY}`,
        'Content-Type': 'application/json',
        'X-GitHub-Token': process.env.GITHUB_TOKEN || ''
      },
      data: {
        messages: [
          {
            id: "msg_" + Date.now(),
            content: prompt,
            role: "user"
          }
        ],
        repositories: [
          {
            remote: 'github',
            repository: `${repoInfo.owner}/${repoInfo.repo}`,
            branch: 'main', // Default to main, could be made configurable
            // Include relevant time range information if available
            timeRange: commits.length > 0 ? {
              // Use the date of the oldest commit as since
              since: new Date(commits[commits.length - 1].date).toISOString(),
              // Use the date of the newest commit as until
              until: new Date(commits[0].date).toISOString()
            } : undefined
          }
        ],
        sessionId: "session_" + Date.now(),
        stream: false,
        genius: true
      }
    });
    
    if (response.data && response.data.message) {
      console.log(chalk.green('Greptile analysis successful!'));
      
      // Log the full response for analysis
      const logDir = path.join(__dirname, '../../logs');
      await fs.mkdir(logDir, { recursive: true });
      const logFile = path.join(logDir, `greptile-response-${Date.now()}.json`);
      await fs.writeFile(logFile, JSON.stringify(response.data, null, 2), 'utf8');
      console.log(chalk.blue(`Full Greptile response logged to: ${logFile}`));
      
      // Format the analysis with sources
      let formattedAnalysis = `ANALYSIS:\n${response.data.message}\n\n`;
      
      // Add sources if available
      if (response.data.sources && response.data.sources.length > 0) {
        formattedAnalysis += `SOURCES:\n`;
        formattedAnalysis += response.data.sources.map(source => {
          return `${source.filepath} (Lines ${source.linestart}-${source.lineend}):\n${source.summary || 'No summary provided'}`;
        }).join('\n\n');
      }
      
      return formattedAnalysis;
    } else {
      console.log(chalk.yellow('Greptile API returned no analysis data'));
      return null;
    }
  } catch (error) {
    console.log(chalk.yellow(`Warning: Error using Greptile API: ${error.message}`));
    if (error.response) {
      console.log(chalk.yellow(`Status: ${error.response.status}`));
      console.log(chalk.yellow(`Data: ${JSON.stringify(error.response.data, null, 2)}`));
      
      // Additional guidance for specific error conditions
      if (error.response.status === 401) {
        console.log(chalk.yellow('Error: Authentication failed. Check your GREPTILE_API_KEY and GITHUB_TOKEN values.'));
      } else if (error.response.status === 403) {
        console.log(chalk.yellow('Error: Permission denied. Ensure your API key and GitHub token have sufficient permissions.'));
      } else if (error.response.status === 400) {
        console.log(chalk.yellow('Error: Bad request. Please check your query parameters.'));
      }
    }
    
    console.log(chalk.blue('Falling back to OpenAI for code analysis...'));
    return null;
  }
}

/**
 * Parse a repository URL to extract owner and repo name
 */
function parseRepositoryUrl(url) {
  // Handle SSH URLs like git@github.com:owner/repo.git
  let sshMatch = url.match(/git@github\.com:([^\/]+)\/([^\.]+)(?:\.git)?$/);
  if (sshMatch) {
    return {
      owner: sshMatch[1],
      repo: sshMatch[2]
    };
  }
  
  // Handle HTTPS URLs like https://github.com/owner/repo.git
  let httpsMatch = url.match(/https:\/\/github\.com\/([^\/]+)\/([^\.]+)(?:\.git)?$/);
  if (httpsMatch) {
    return {
      owner: httpsMatch[1],
      repo: httpsMatch[2]
    };
  }
  
  return null;
}

/**
 * Analyze code with OpenAI as a fallback
 */
async function analyzeCodeWithOpenAI(gitDir, changedFiles) {
  if (!process.env.OPENAI_API_KEY) {
    console.log(chalk.yellow('Skipping OpenAI code analysis - API key not found'));
    return null;
  }
  
  try {
    console.log(chalk.blue('Analyzing codebase with OpenAI...'));
    
    // Group files by type to analyze similar files together
    const filesByType = {};
    for (const file of changedFiles) {
      const ext = path.extname(file).toLowerCase() || 'noext';
      if (!filesByType[ext]) {
        filesByType[ext] = [];
      }
      filesByType[ext].push(file);
    }
    
    // Get file contents by type
    const contentsByType = {};
    for (const [ext, files] of Object.entries(filesByType)) {
      contentsByType[ext] = await getFilesContent(files, gitDir);
    }
    
    // Analyze each file type separately to avoid token limits
    const analyses = [];
    for (const [ext, contents] of Object.entries(contentsByType)) {
      if (Object.keys(contents).length === 0) continue;
      
      console.log(chalk.blue(`Analyzing ${Object.keys(contents).length} ${ext} files...`));
      
      const fileContents = Object.entries(contents)
        .slice(0, 5) // Limit to 5 files per type to avoid token issues
        .map(([file, content]) => {
          // Truncate very large files
          const truncated = content.length > 10000 
            ? content.substring(0, 5000) + '\n... [file truncated] ...\n' + content.substring(content.length - 5000)
            : content;
          return `FILE: ${file}\n\`\`\`\n${truncated}\n\`\`\``;
        })
        .join('\n\n');
      
      if (!fileContents) continue;
      
      const prompt = `
I need an analysis of the following changed ${ext} files to generate a changelog.
For each file, please:
1. Identify the SPECIFIC functionality that was added, modified, or fixed
2. Determine if it's a new feature, improvement, bugfix, or breaking change
3. Explain how these exact changes impact users - not general file purpose
4. Provide concrete details about what was changed and why it matters

Changed files:
${fileContents}

Focus ONLY on what was actually changed in these specific files, not their general purpose. 
Be specific about the actual modifications and avoid generic descriptions.
Format your response as a concise, user-focused analysis of these exact changes.
`;

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo", // Using standard model for individual file types
        messages: [
          { 
            role: "system", 
            content: "You are an expert code analyzer that understands codebases deeply. Your task is to analyze code files and provide concise insights for changelog generation. Focus on what matters to end users and be very concise." 
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.3, // Lower temperature for more factual analysis
      });

      analyses.push(response.choices[0].message.content.trim());
    }
    
    // Combine all analyses
    if (analyses.length > 0) {
      console.log(chalk.green('OpenAI code analysis successful!'));
      
      // Log the full OpenAI analyses for comparison
      const logDir = path.join(__dirname, '../../logs');
      await fs.mkdir(logDir, { recursive: true });
      const logFile = path.join(logDir, `openai-response-${Date.now()}.json`);
      await fs.writeFile(logFile, JSON.stringify(analyses, null, 2), 'utf8');
      console.log(chalk.blue(`Full OpenAI analyses logged to: ${logFile}`));
      
      return analyses.join('\n\n---\n\n');
    }
    
    return null;
  } catch (error) {
    console.log(chalk.yellow(`Warning: Error using OpenAI for code analysis: ${error.message}`));
    return null;
  }
}

/**
 * Get file content for analysis
 */
async function getFilesContent(filePaths, gitDir) {
  const result = {};
  
  for (const filePath of filePaths) {
    try {
      // Skip binary files, node_modules, etc.
      if (
        filePath.includes('node_modules') || 
        filePath.match(/\.(jpg|jpeg|png|gif|svg|ico|woff|woff2|ttf|eot|otf|mp4|webm|ogg|mp3|wav|flac|aac|zip|tar|gz|rar|exe|dll|so|bin|dat)$/i)
      ) {
        continue;
      }
      
      // Construct absolute path if gitDir is provided
      const fullPath = gitDir ? path.join(gitDir, filePath) : filePath;
      
      // Check if file exists
      try {
        await fs.access(fullPath);
      } catch (err) {
        continue;
      }
      
      const content = await fs.readFile(fullPath, 'utf8');
      
      // Only include files with reasonable size
      if (content.length < 100000) { // 100KB limit
        result[filePath] = content;
      }
    } catch (error) {
      // Skip files that can't be read
      continue;
    }
  }
  
  return result;
}

/**
 * Generate changelog with AI
 */
async function generateChangelogWithAI(commits, options, repoName, repoUrl, codeAnalysis) {
  // Format commits for the AI with more detail
  const commitsText = commits.map(c => 
    `${c.hash.substring(0, 8)} | ${c.date} | ${c.author} | ${c.subject}`
  ).join('\n');
  
  // Generate title if not provided
  const title = options.title || await generateTitle(commits, repoName, codeAnalysis);
  
  // Limit codeAnalysis to reduce token usage
  let trimmedAnalysis = null;
  if (codeAnalysis) {
    // Keep only the first part of the analysis
    const maxLength = 3000;
    trimmedAnalysis = codeAnalysis.length > maxLength 
      ? codeAnalysis.substring(0, maxLength) + '... [analysis truncated]'
      : codeAnalysis;
  }
  
  // Enhanced prompt with more context and direction
  let prompt = `
You are a senior developer and technical writer generating a detailed changelog for the repository "${repoName}".

COMMITS:
${commitsText}

TASK:
Create a comprehensive, informative changelog based on these commits that will be valuable to users of this software.

INSTRUCTIONS:
1. Analyze each commit carefully to understand the actual changes made
2. Categorize changes into relevant sections (New Features, Improvements, Bug Fixes, Security, Documentation, etc.)
3. Focus on user-facing impacts, not implementation details
4. Be specific and descriptive - avoid generic phrases like "various improvements" or "enhanced functionality"
5. Each bullet point should clearly explain WHAT changed and HOW it benefits users
6. Use technical terminology appropriate for the target audience (developers)
7. If a commit seems ambiguous, make a reasonable inference based on the repository context
8. For each change, include specific details about what was added, modified, or fixed
9. Highlight breaking changes or API modifications prominently

FORMATTING REQUIREMENTS:
- Each section should have a clear heading (## Section Name)
- Each change should be a bullet point (- Change description)
- Group related changes together
- Use sub-bullets for related details if needed
- Keep bullet points concise but informative (1-2 sentences)
- Make each bullet point unique - don't repeat similar content with different wording

WHAT NOT TO DO:
- Don't use generic descriptions like "Added user-centered design"
- Don't be vague about what was changed
- Don't repeat the same information in multiple sections
- Don't focus on implementation details unless they directly impact users
- Don't use placeholder text or filler content

EXAMPLES OF GOOD ENTRIES:
- Added multi-repository support that organizes changelogs by repository name and stores them in separate files
- Improved commit parsing algorithm to properly handle the first commit in a repository, fixing the "ambiguous argument" error
- Enhanced the web UI by removing redundant repository names and dates for a cleaner, more readable interface

Remember to focus on what would matter to end users or developers using this software.
`;

  // Add Greptile analysis to prompt if available
  if (trimmedAnalysis) {
    prompt += `\nADDITIONAL CODEBASE ANALYSIS (partial):\n${trimmedAnalysis}\n\nIncorporate this partial codebase analysis into your changelog to provide more accurate and detailed information about the changes.`;
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are an expert technical writer specialized in creating detailed, informative changelogs from git commits. You understand programming concepts deeply and can interpret commit messages to extract meaningful information for users. Focus ONLY on the specific commits provided - do not make up generic changes. Be specific and informative about exactly what changed in these commits and how it impacts users. Avoid vague descriptions." },
        { role: "user", content: prompt }
      ],
      temperature: 0.5, // Lower temperature for more deterministic output
      max_tokens: 1000, // Limit output size to avoid token limits
    });

    const content = response.choices[0].message.content.trim();
    
    // Process the content into structured format
    const entries = processChangelogContent(content);
    
    return {
      id: Date.now().toString(),
      repoName,
      repoUrl,
      title,
      date: new Date().toISOString().split('T')[0],
      timeRange: {
        since: options.since,
        until: options.until
      },
      entries,
      hasGreptileAnalysis: !!codeAnalysis
    };
  } catch (error) {
    console.error(chalk.red('Error calling OpenAI API:'), error.message);
    throw error;
  }
}

/**
 * Process the AI-generated changelog content into structured format
 */
function processChangelogContent(content) {
  const sections = content.split(/#{1,3} /).filter(s => s.trim());
  const entries = [];
  
  for (const section of sections) {
    const lines = section.split('\n');
    const category = lines[0].trim().replace(/:/g, '');
    
    const items = lines
      .slice(1)
      .filter(line => line.trim().startsWith('-') || line.trim().startsWith('*'))
      .map(line => line.trim().replace(/^[*-] /, ''));
    
    if (items.length > 0) {
      entries.push({
        category,
        items
      });
    }
  }
  
  // If no clear sections were found, use a default category
  if (entries.length === 0 && content.trim()) {
    const items = content
      .split('\n')
      .filter(line => line.trim().startsWith('-') || line.trim().startsWith('*'))
      .map(line => line.trim().replace(/^[*-] /, ''));
    
    if (items.length > 0) {
      entries.push({
        category: 'Changes',
        items
      });
    } else {
      // Just split by newlines if no bullet points
      entries.push({
        category: 'Changes',
        items: content.split('\n').filter(line => line.trim())
      });
    }
  }
  
  return entries;
}

/**
 * Generate a title based on code analysis and commit content
 */
function generateTitle(commits, repoName, codeAnalysis) {
  try {
    // If we have code analysis, generate a descriptive title
    if (codeAnalysis && commits.length > 0) {
      // Use OpenAI to generate a concise, meaningful title
      return generateDescriptiveTitle(commits, repoName, codeAnalysis);
    }
    
    // Default date-based title as fallback
    const dateFormat = { month: 'long', day: 'numeric', year: 'numeric' };
    
    if (commits.length === 0) {
      return repoName ? `${repoName} Changelog` : 'Changelog';
    }
    
    // Validate dates before sorting
    commits = commits.filter(commit => {
      const date = new Date(commit.date);
      return !isNaN(date.getTime());
    });
    
    if (commits.length === 0) {
      return repoName ? `${repoName} Recent Changes` : 'Recent Changes';
    }
    
    commits.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const firstDate = new Date(commits[0].date);
    const lastDate = new Date(commits[commits.length - 1].date);
    
    // Verify dates are valid
    if (isNaN(firstDate.getTime()) || isNaN(lastDate.getTime())) {
      console.log(chalk.yellow('Warning: Invalid date detected in commits'));
      return repoName ? `${repoName} Recent Changes` : 'Recent Changes';
    }
    
    const firstDateStr = firstDate.toLocaleDateString('en-US', dateFormat);
    const lastDateStr = lastDate.toLocaleDateString('en-US', dateFormat);
    
    const prefix = repoName ? `${repoName}: ` : '';
    
    if (firstDateStr === lastDateStr) {
      return `${prefix}Changes for ${firstDateStr}`;
    }
    
    return `${prefix}Changes from ${firstDateStr} to ${lastDateStr}`;
  } catch (error) {
    console.log(chalk.yellow(`Warning: Error generating title: ${error.message}`));
    return repoName ? `${repoName} Recent Changes` : 'Recent Changes';
  }
}

/**
 * Generate a descriptive title using OpenAI
 */
async function generateDescriptiveTitle(commits, repoName, codeAnalysis) {
  // Limit codeAnalysis to reduce token usage
  let trimmedAnalysis = codeAnalysis;
  if (codeAnalysis && codeAnalysis.length > 2000) {
    // Keep only the first part of the analysis up to 2000 chars
    trimmedAnalysis = codeAnalysis.substring(0, 2000) + '... [analysis truncated]';
  }
  
  const prompt = `
Generate a concise, descriptive title for a changelog of the repository "${repoName}" based on the following information:

COMMITS:
${commits.slice(0, 5).map(c => `${c.subject}`).join('\n')}
${commits.length > 5 ? `... and ${commits.length - 5} more` : ''}

${trimmedAnalysis ? `CODE ANALYSIS (partial):\n${trimmedAnalysis}` : ''}

Requirements for the title:
1. Be specific about the main features or improvements
2. Keep it under 80 characters
3. No generic titles like "Updates and improvements"
4. No dates in the title
5. Focus on the most impactful user-facing changes
6. Return ONLY the title text with no quotes or formatting
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You generate concise, meaningful titles for changelogs based on commit messages and code analysis. Return only the title text with no additional explanation or formatting." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 40, // Limit response size
    });

    const title = response.choices[0].message.content.trim()
      .replace(/^["']|["']$/g, '') // Remove quotes if present
      .replace(/\.$/g, '');        // Remove trailing period if present
    
    return title;
  } catch (error) {
    console.log(chalk.yellow(`Error generating title: ${error.message}`));
    // Fallback to a simple repo-based title
    return `${repoName} Updates`;
  }
}

/**
 * Save the changelog to a JSON file
 */
async function saveChangelog(changelog, repoName) {
  try {
    // Create data directory if it doesn't exist
    await fs.mkdir(dataDir, { recursive: true });
    
    // Create a filename based on the repository name
    const repoFileName = repoName.replace(/[^\w\-]/g, '_').toLowerCase();
    const changelogsPath = path.join(dataDir, `${repoFileName}.json`);
    
    console.log(chalk.blue(`Using changelog file: ${changelogsPath}`));
    
    // Check if repo-specific changelog file exists
    let changelogs = [];
    try {
      const data = await fs.readFile(changelogsPath, 'utf8');
      changelogs = JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is invalid, start with empty array
    }
    
    // Add new changelog
    changelogs.unshift(changelog);
    
    // Save to file
    await fs.writeFile(changelogsPath, JSON.stringify(changelogs, null, 2), 'utf8');
    
    // Also maintain a registry of all repositories
    await updateRepoRegistry(repoName, changelog.repoUrl);
    
    console.log(chalk.green(`Changelog saved to ${changelogsPath}`));
  } catch (error) {
    console.error(chalk.red('Error saving changelog:'), error.message);
    throw error;
  }
}

/**
 * Update the repository registry
 */
async function updateRepoRegistry(repoName, repoUrl) {
  try {
    const registryPath = path.join(dataDir, 'repo-registry.json');
    
    let registry = [];
    try {
      const data = await fs.readFile(registryPath, 'utf8');
      registry = JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is invalid, start with empty array
    }
    
    // Check if repo exists in registry
    const existingIndex = registry.findIndex(r => r.name === repoName);
    const repoData = {
      name: repoName,
      url: repoUrl,
      filename: repoName.replace(/[^\w\-]/g, '_').toLowerCase() + '.json',
      lastUpdated: new Date().toISOString()
    };
    
    if (existingIndex >= 0) {
      registry[existingIndex] = repoData;
    } else {
      registry.push(repoData);
    }
    
    await fs.writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf8');
  } catch (error) {
    console.log(chalk.yellow('Warning: Error updating repository registry:'), error.message);
    // Don't throw - this is not critical functionality
  }
} 