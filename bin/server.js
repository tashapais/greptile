#!/usr/bin/env node

import { startServer } from '../src/web/server.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Debug: Set up file paths and check data directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = path.join(__dirname, '../data');

async function debugLogFiles() {
  try {
    console.log('Data directory path:', dataDir);
    
    // Check if data directory exists
    const dirExists = await fs.access(dataDir).then(() => true).catch(() => false);
    console.log('Data directory exists:', dirExists);
    
    if (dirExists) {
      // List files in data directory
      const files = await fs.readdir(dataDir);
      console.log('Files in data directory:', files);
      
      // Check registry file
      const registryPath = path.join(dataDir, 'repo-registry.json');
      const registryExists = await fs.access(registryPath).then(() => true).catch(() => false);
      console.log('Registry file exists:', registryExists);
      
      if (registryExists) {
        const registryContent = await fs.readFile(registryPath, 'utf8');
        console.log('Registry content:', registryContent);
      }
    }
  } catch (error) {
    console.error('Debug error:', error);
  }
}

// Run debug logging
debugLogFiles();

// Default port from environment variables or 3000
const port = process.env.PORT || 3000;

// Start the server
startServer({ port });

// Let Vercel know we're running
console.log(`Greptile changelog server running on port ${port}`); 