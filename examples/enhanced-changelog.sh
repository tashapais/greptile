#!/bin/bash

# Make sure you've set up your OpenAI API key
if [ -z "$OPENAI_API_KEY" ]; then
  echo "Please set your OpenAI API key first:"
  echo "export OPENAI_API_KEY=your_api_key_here"
  exit 1
fi

# Generate an enhanced changelog with code analysis
echo "Generating enhanced changelog with code analysis..."
greptile generate --since "2 weeks ago" --until "now" --use-greptile

# Start the web server to view the changelog
echo "Starting web server to view the changelog..."
greptile serve 