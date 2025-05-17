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
    
    // Get git log
    const commits = await getCommits(options.since, options.until);
    
    if (commits.length === 0) {
      console.log(chalk.yellow('No commits found in the specified date range.'));
      return;
    }
    
    console.log(chalk.green(`Found ${commits.length} commits.`));
    console.log(chalk.blue('Analyzing commits and generating changelog...'));
    
    // Generate changelog using OpenAI
    const changelog = await generateChangelogWithAI(commits, options);
    
    // Save changelog
    await saveChangelog(changelog);
    
    console.log(chalk.green('Changelog generated successfully!'));
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
  const logOptions = [
    '--pretty=format:%h|%an|%ad|%s',
    '--date=iso',
    `--since="${since}"`,
    `--until="${until}"`
  ];
  
  const log = await git.log(logOptions);
  
  if (!log || !log.all) {
    return [];
  }

  // Parse raw log into structured format
  const rawLog = log.all.join('\n');
  
  return rawLog.split('\n').map(line => {
    const [hash, author, date, subject] = line.split('|');
    return { hash, author, date, subject };
  });
}

/**
 * Generate changelog with AI
 */
async function generateChangelogWithAI(commits, options) {
  // Format commits for the AI
  const commitsText = commits.map(c => 
    `${c.hash} | ${c.date} | ${c.author} | ${c.subject}`
  ).join('\n');
  
  // Generate title if not provided
  const title = options.title || generateTitle(commits);
  
  // Prepare prompt for OpenAI
  const prompt = `
I need a changelog based on the following git commits. 
Please categorize the changes into sections like "New Features", "Improvements", "Bug Fixes", etc.
Format them as bullet points that are clear and user-focused.
Only include changes that would be relevant to users of the product.
Commits:

${commitsText}
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a technical writer tasked with creating changelogs from git commits. Focus on what matters to users, not implementation details." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
    });

    const content = response.choices[0].message.content.trim();
    
    // Process the content into structured format
    const entries = processChangelogContent(content);
    
    return {
      id: Date.now().toString(),
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
function generateTitle(commits) {
  const dateFormat = { month: 'long', day: 'numeric', year: 'numeric' };
  
  if (commits.length === 0) {
    return 'Changelog';
  }
  
  // Sort commits by date
  commits.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  const firstDate = new Date(commits[0].date);
  const lastDate = new Date(commits[commits.length - 1].date);
  
  const firstDateStr = firstDate.toLocaleDateString('en-US', dateFormat);
  const lastDateStr = lastDate.toLocaleDateString('en-US', dateFormat);
  
  if (firstDateStr === lastDateStr) {
    return `Changes for ${firstDateStr}`;
  }
  
  return `Changes from ${firstDateStr} to ${lastDateStr}`;
}

/**
 * Save the changelog to a JSON file
 */
async function saveChangelog(changelog) {
  try {
    // Create data directory if it doesn't exist
    await fs.mkdir(dataDir, { recursive: true });
    
    // Check if changelogs.json exists
    let changelogs = [];
    const changelogsPath = path.join(dataDir, 'changelogs.json');
    
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
    
    console.log(chalk.green(`Changelog saved to ${changelogsPath}`));
  } catch (error) {
    console.error(chalk.red('Error saving changelog:'), error.message);
    throw error;
  }
} 