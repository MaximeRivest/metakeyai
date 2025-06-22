# MetaKeyAI

A powerful AI-enhanced productivity tool built with Electron and Python, featuring voice recording, clipboard management, and intelligent text processing.

## 🚀 Quick Start

### Prerequisites

MetaKeyAI automatically manages its Python environment using **UV** (a fast Python package manager). If UV is not installed on your system, the app will offer to install it automatically on first run.

### Installation

1. **Download and install** the latest release for your platform
2. **Launch the application** - it will automatically:
   - Detect if UV is installed
   - Offer to install UV if not found (with user permission)
   - Set up the Python environment automatically
   - Install all required dependencies

### Manual UV Installation (Optional)

If you prefer to install UV manually before running the app:

**Linux/macOS:**
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

**Windows (PowerShell):**
```powershell
irm https://astral.sh/uv/install.ps1 | iex
```

## 🎯 Features

- **🎤 Voice Recording**: Record and transcribe voice using multiple audio backends
- **📋 Clipboard Management**: Advanced clipboard history with navigation
- **🐍 Python Spells**: Execute custom Python scripts with DSPy integration
- **🔄 Auto-Environment**: Automatic Python environment management via UV
- **🌐 Cross-Platform**: Works on Windows, macOS, and Linux

## 🛠️ Development

### Setup

```bash
# Clone the repository
git clone <repository-url>
cd metakeyai

# Install Node.js dependencies
npm install

# Set up Python environment (automatic)
npm run setup:python

# Set up audio dependencies
npm run setup-audio

# Start development server
npm start
```

### Build

```bash
# Build Python components
npm run build:python

# Build Electron app
npm run make
```

## 🏗️ Architecture

### UV-Based Distribution

MetaKeyAI uses **UV** for Python dependency management:

- **Development**: `uv run python src/python_scripts/metakeyai_daemon.py`
- **Production**: `uv run --project resources python src/python_scripts/metakeyai_daemon.py`

### Benefits of UV

- ⚡ **Fast**: 10-100x faster than pip
- 🔒 **Reliable**: Deterministic dependency resolution
- 🎯 **Simple**: Single tool for all Python needs
- 🌍 **Cross-platform**: Works identically on all systems

### No More PyInstaller

We've eliminated PyInstaller in favor of UV's native execution:

- ✅ Smaller distribution size
- ✅ Faster builds
- ✅ Better debugging
- ✅ Easier maintenance

## 🔧 Configuration

Set environment variables for API keys:

```bash
export OPENAI_API_KEY="your-openai-api-key"
export METAKEYAI_LLM="gpt-4"  # Optional: specify model
```

## 📦 Distribution

The app automatically handles:

1. **UV Installation**: Prompts user to install UV if needed
2. **Environment Setup**: Creates isolated Python environment
3. **Dependency Management**: Installs all required packages
4. **Runtime Execution**: Runs Python components via UV

## 🎵 Audio Setup

The app supports multiple audio recording methods:

1. **SoX** (preferred)
2. **FFmpeg** (fallback)
3. **PowerShell Speech** (Windows fallback)

Audio dependencies are installed automatically via `npm run setup-audio`.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

[Your License Here]

---

**Powered by UV** 🚀 - The next-generation Python package manager

## Features

- Voice recording and audio processing
- Python integration with DSPy
- Cross-platform support (Windows, macOS, Linux)
- Real-time audio visualization
- AI spell system for text processing

## Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up audio dependencies: `npm run setup-audio`
4. Build the Python environment: `npm run build:python`
5. Run the application: `npm start`

### Audio Recording Setup

MetaKeyAI requires audio recording capabilities for voice input. See [AUDIO_SETUP.md](./AUDIO_SETUP.md) for detailed setup instructions.

**Quick setup**: `npm run setup-audio`

### Python Environment

The application uses Python for AI processing. The build process automatically sets up a Python virtual environment with all required dependencies.

## Development

### Available Scripts

- `npm start` - Start the development server
- `npm run make` - Build the application for distribution
- `npm run setup-audio` - Set up audio recording dependencies
- `npm run build:python` - Build the Python environment
- `npm test` - Run tests (when available)

### Project Structure

```
metakeyai/
├── src/                          # Main application source
│   ├── audio-recorder.ts         # Audio recording implementation
│   ├── python-daemon.ts          # Python integration
│   ├── python_scripts/           # Python AI scripts
│   │   ├── metakeyai_daemon.py   # Main Python server
│   │   └── spells/               # AI processing modules
│   └── types/                    # TypeScript definitions
├── resources/                    # Application resources
│   ├── binaries/                 # Platform-specific binaries
│   └── python/                   # Python distribution
├── scripts/                      # Build and setup scripts
└── .github/workflows/            # CI/CD configuration
```

## Audio Recording

The application supports multiple audio recording methods with automatic fallback:

1. **SoX** (Recommended) - Cross-platform audio processing
2. **FFmpeg** - Universal multimedia framework  
3. **PowerShell** - Windows-specific fallback
4. **Native APIs** - Platform-specific implementations (future)

### Supported Platforms

| Platform | SoX | FFmpeg | PowerShell | Status |
|----------|-----|--------|------------|---------|
| Linux    | ✅  | ✅     | ❌         | Stable  |
| macOS    | ✅  | ✅     | ❌         | Stable  |
| Windows  | ✅  | ✅     | ✅         | Stable  |

## Troubleshooting

### Common Issues

1. **Audio recording not working**: Run `npm run setup-audio` to install dependencies
2. **Python environment issues**: Run `npm run build:python` to rebuild
3. **Permission errors**: Ensure proper file permissions for binaries

For detailed troubleshooting, see [AUDIO_SETUP.md](./AUDIO_SETUP.md).

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test on your platform
5. Submit a pull request

Please ensure:
- Audio functionality works on your platform
- Python integration tests pass
- Code follows the existing style

## License

[Your License Here]

## Support

For issues and questions:
- Check [AUDIO_SETUP.md](./AUDIO_SETUP.md) for setup problems
- Review GitHub Issues for known problems
- Include platform details when reporting bugs 