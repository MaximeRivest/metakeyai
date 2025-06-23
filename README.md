> ⚠️ **AI Generated Content Warning**
> 
> This README is AI-generated and incomplete. We're still working on proper documentation.
> Please check back later for comprehensive setup and usage instructions.


# MetaKeyAI 

A powerful AI-enhanced productivity tool built with Electron and Python, featuring voice recording, clipboard management, and intelligent text processing.

## 📥 Download

**Ready to try MetaKeyAI?** Download the latest release for your platform:

[![Download Latest Release](https://img.shields.io/github/v/release/maximerivest/metakeyai?style=for-the-badge&logo=github&label=Download%20Latest)](https://github.com/maximerivest/metakeyai/releases/latest)

### Platform-Specific Downloads

| Platform | Download | Notes |
|----------|----------|-------|
| 🪟 **Windows** | [Download .exe](https://github.com/maximerivest/metakeyai/releases/latest) | Run the installer |
| 🍎 **macOS** | [Download .zip](https://github.com/maximerivest/metakeyai/releases/latest) | Extract and run |
| 🐧 **Linux** | [Download .AppImage](https://github.com/maximerivest/metakeyai/releases/latest) | Make executable and run |

### Quick Start
1. Download the file for your platform
2. Install/extract and run the application
3. The app will automatically set up Python environment on first launch
4. Start voice recording and AI processing!

---

## 🚀 Quick Start

### Python Setup (Recommended)

MetaKeyAI can automatically set up Python using [UV](https://docs.astral.sh/uv/), a fast Python package manager. UV provides several advantages:

- **Automatic Python Installation**: UV can install and manage Python versions for you
- **Fast Dependency Resolution**: Significantly faster than pip
- **Isolated Environments**: Each project gets its own clean environment
- **Cross-Platform**: Works consistently on Windows, macOS, and Linux

#### Option 1: Auto Setup (Recommended)
1. Click **"Auto Setup"** in the Python settings
2. Choose **"Install UV to User Config"** to keep UV within MetaKeyAI's configuration
3. UV will automatically:
   - Install itself to your MetaKeyAI config directory
   - Install a compatible Python version (3.11)
   - Create an isolated project environment
   - Install all required dependencies (FastAPI, DSPy, etc.)

#### Option 2: Manual UV Installation
If you prefer to install UV system-wide:

```bash
# macOS and Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows (PowerShell)
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# Alternative: Using pip
pip install uv

# Alternative: Using pipx
pipx install uv
```

Then use **"Auto Setup"** in MetaKeyAI settings.

#### Option 3: Custom Python
If you have an existing Python installation:
1. Click **"Custom Python"** 
2. MetaKeyAI will auto-discover Python installations
3. Select your preferred Python and install missing dependencies

### Features

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

### Python Setup Issues

**UV Installation Fails**:
- Check internet connectivity
- Try manual UV installation from [UV docs](https://docs.astral.sh/uv/getting-started/installation/)
- Use custom Python setup as fallback

**Auto Setup Verification Fails**:
- Reset Python setup in settings
- Try custom Python setup
- Check if antivirus is blocking UV

**Dependencies Missing**:
- Use the "Install Dependencies" button in custom Python setup
- Manually install: `pip install fastapi uvicorn pydantic dspy-ai`
- Reset and retry auto setup

### General Issues

- Restart the application after Python setup changes
- Check the console logs for detailed error messages
- Reset configuration if settings become corrupted

## Configuration

MetaKeyAI stores its configuration in:
- **Windows**: `%APPDATA%/metakeyai/`
- **macOS**: `~/Library/Application Support/metakeyai/`
- **Linux**: `~/.config/metakeyai/`

This includes:
- Python environment and dependencies
- UV installation (if using user config option)
- Keyboard shortcuts and settings
- Spell configurations

## Python Environment Details

When using auto-setup, MetaKeyAI creates a UV project structure:

```
<config-dir>/python-project/
├── pyproject.toml          # Project configuration
├── .python-version         # Python version specification
├── uv.lock                 # Locked dependencies (auto-generated)
├── README.md               # Environment documentation
├── .venv/                  # Virtual environment
└── src/                    # Python source code
    ├── metakeyai_daemon.py # Main daemon
    └── spells/             # Custom spells
```

The project uses modern Python packaging standards:
- `pyproject.toml` for dependency specification
- `.python-version` for Python version pinning
- `uv.lock` for reproducible builds
- Isolated virtual environment

### Dependencies

Core Python dependencies managed by UV:
- **FastAPI**: Web API framework for the Python daemon
- **Uvicorn**: ASGI server for running the API
- **Pydantic**: Data validation and settings management
- **DSPy**: LLM integration and AI capabilities

### Build Process

The application is built using Electron Forge and includes:
- Automatic Python environment bundling
- Cross-platform binary distribution
- Python script packaging and deployment

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with both auto and custom Python setups
5. Submit a pull request

For Python-related development:
- Use the UV project in `<config>/python-project/`
- Add new spells to `src/spells/`
- Test with the integrated daemon API

## Troubleshooting

### Python Setup Issues

**UV Installation Fails**:
- Check internet connectivity
- Try manual UV installation from [UV docs](https://docs.astral.sh/uv/getting-started/installation/)
- Use custom Python setup as fallback

**Auto Setup Verification Fails**:
- Reset Python setup in settings
- Try custom Python setup
- Check if antivirus is blocking UV

**Dependencies Missing**:
- Use the "Install Dependencies" button in custom Python setup
- Manually install: `pip install fastapi uvicorn pydantic dspy-ai`
- Reset and retry auto setup

### General Issues

- Restart the application after Python setup changes
- Check the console logs for detailed error messages
- Reset configuration if settings become corrupted

## License

This project is licensed under the GNU General Public License v3.0 or later - see the [LICENSE](LICENSE) file for details.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0) 