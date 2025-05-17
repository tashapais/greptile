#!/bin/bash

# Make sure you've set up your OpenAI API key
if [ -z "$OPENAI_API_KEY" ]; then
  echo "Please set your OpenAI API key first:"
  echo "export OPENAI_API_KEY=your_api_key_here"
  exit 1
fi

# Generate a changelog for the last week
echo "Generating changelog for the last week..."
greptile generate --since "1 week ago" --until "now"

# Start the web server to view the changelog
echo "Starting web server to view the changelog..."
greptile serve 