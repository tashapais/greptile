# Greptile - AI-Powered Changelog Generator

Greptile is a tool that uses AI to automatically generate changelogs from your git commit history, making it easy to keep your users updated about changes to your product.

## Features

- **CLI Tool**: Quickly generate changelogs from your git commits
- **Web Interface**: Public-facing website to display your changelogs
- **AI-Powered**: Uses AI to summarize changes in a user-friendly way
- **Customizable**: Control the date range and title of your changelogs

## Getting Started

### Prerequisites

- Node.js 18+
- Git
- OpenAI API key

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/greptile.git
cd greptile

# Install dependencies
npm install

# Install globally (optional)
npm install -g .

# Copy and edit the environment variables file
cp env.sample .env
# Edit .env and add your OpenAI API key
```

### Usage

#### Generate a changelog

```bash
# If installed globally
greptile generate --since "2 weeks ago" --until "today"

# If not installed globally
node bin/greptile.js generate --since "2 weeks ago" --until "today"
```

Available options:
- `--since <date>`: Start date for commits (e.g., "1 week ago", "2023-01-01")
- `--until <date>`: End date for commits (default: "now")
- `--title <title>`: Custom title for the changelog (optional)
- `--output <path>`: Custom output file path (optional)

#### Start the web server

```bash
# If installed globally
greptile serve

# If not installed globally
node bin/greptile.js serve
```

Available options:
- `--port <number>`: Port to listen on (default: 3000 or PORT from .env)

## How It Works

1. **Data Collection**: Greptile uses the `simple-git` library to fetch commit history from your Git repository.
2. **AI Processing**: The commit history is sent to OpenAI's API, which analyzes the commits and generates a user-friendly changelog.
3. **Data Storage**: The generated changelog is stored as JSON in the `data` directory.
4. **Web Display**: A simple Express.js server serves the changelog data through a clean web interface.

## Examples

Check out the `examples` directory for some usage examples:

```bash
# Run the basic usage example
./examples/basic-usage.sh
```

## Technical Architecture

- **CLI Tool**: Built with Node.js and Commander.js for parsing command line arguments
- **Web Interface**: Simple Express.js server with EJS templates for rendering pages
- **Data Storage**: Changelogs stored as JSON files for simplicity
- **AI Integration**: OpenAI API for generating human-readable changelog entries

## Design Decisions

- **Simple File Storage**: We chose to use simple JSON files instead of a database to make the tool lightweight and easy to set up. For most use cases, the changelog data will be small enough that a database is unnecessary.

- **EJS Templates**: EJS provides a simple templating system that works well for server-rendered pages. It's easy to learn and doesn't add much complexity.

- **Express.js**: Express is a minimal and flexible web framework that's perfect for serving a simple changelog site.

- **OpenAI Integration**: We use the OpenAI API to analyze git commits and generate human-readable changelog entries. This allows the tool to create changelogs that focus on what's important to users rather than technical implementation details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT 