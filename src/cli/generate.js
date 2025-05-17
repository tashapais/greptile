import simpleGit from 'simple-git';
import { OpenAI } from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import chalk from 'chalk';

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
    try {
      const gitDir = await git.revparse(['--show-toplevel']);
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
    
    console.log(chalk.blue('Analyzing commits and generating changelog...'));
    
    // Generate changelog using OpenAI
    const changelog = await generateChangelogWithAI(commits, options, repoName, repoUrl);
    
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
 * Generate changelog with AI
 */
async function generateChangelogWithAI(commits, options, repoName, repoUrl) {
  // Format commits for the AI
  const commitsText = commits.map(c => 
    `${c.hash} | ${c.date} | ${c.author} | ${c.subject}`
  ).join('\n');
  
  // Generate title if not provided
  const title = options.title || generateTitle(commits, repoName);
  
  // Prepare prompt for OpenAI
  const prompt = `
I need a changelog for the repository "${repoName}" based on the following git commits. 
Please categorize the changes into sections like "New Features", "Improvements", "Bug Fixes", etc.
Format them as bullet points that are clear and user-focused.
Only include changes that would be relevant to users of the product.
Make your entries specific to the actual commit messages and content, not generic examples.
If a commit message doesn't clearly indicate a user-facing change, you may use generic language but try to be relevant to the repository.
Commits:

${commitsText}
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a technical writer tasked with creating changelogs from git commits. Focus on what matters to users, not implementation details. Be specific to the actual commits, not generic examples." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
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
      entries
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
 * Generate a title based on the date range
 */
function generateTitle(commits, repoName) {
  const dateFormat = { month: 'long', day: 'numeric', year: 'numeric' };
  
  if (commits.length === 0) {
    return repoName ? `${repoName} Changelog` : 'Changelog';
  }
  
  try {
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