#!/bin/bash

# Simple wrapper for the Code Usage Analyzer

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Code Usage Analyzer${NC}"
echo "======================"

# Check if node is available
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js is required but not installed.${NC}"
    exit 1
fi

# Function to show usage
show_usage() {
    echo -e "${YELLOW}Usage:${NC}"
    echo "  ./scripts/analyze.sh <file> [class-name] [output-file] [options]"
    echo ""
    echo -e "${YELLOW}Options:${NC}"
    echo "  --short              Generate short report without usage context"
    echo "  --context-lines N    Number of context lines to show (default: 3)"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo "  # Analyze a class with full context (default):"
    echo "  ./scripts/analyze.sh src/user-data-manager.ts UserDataManager"
    echo ""
    echo "  # Generate short report without usage context:"
    echo "  ./scripts/analyze.sh src/utils.ts \"\" \"\" --short"
    echo ""
    echo "  # Save output to file with custom context lines:"
    echo "  ./scripts/analyze.sh src/my-class.ts MyClass analysis.txt --context-lines 5"
    echo ""
    echo -e "${YELLOW}Common use cases:${NC}"
    echo "  • Find unused methods in a class with detailed context"
    echo "  • Identify internal-only methods and see how they're used"
    echo "  • Clean up dead code before refactoring"
    echo "  • Audit codebase for unused functions with usage examples"
}

# Parse arguments
if [ $# -eq 0 ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_usage
    exit 0
fi

# Parse arguments
FILE="$1"
CLASS_NAME="$2" 
OUTPUT_FILE="$3"
shift 3 # Remove first 3 arguments, rest are options

EXTRA_ARGS=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --short|--no-context)
            EXTRA_ARGS="$EXTRA_ARGS --short"
            shift
            ;;
        --context-lines)
            EXTRA_ARGS="$EXTRA_ARGS --context-lines $2"
            shift 2
            ;;
        *)
            EXTRA_ARGS="$EXTRA_ARGS $1"
            shift
            ;;
    esac
done

# Validate file exists
if [ ! -f "$FILE" ]; then
    echo -e "${RED}❌ Error: File '$FILE' not found.${NC}"
    exit 1
fi

# Build command
CMD="node scripts/analyze-unused-code.js -f \"$FILE\""

if [ -n "$CLASS_NAME" ]; then
    CMD="$CMD -c \"$CLASS_NAME\""
fi

if [ -n "$OUTPUT_FILE" ]; then
    CMD="$CMD -o \"$OUTPUT_FILE\""
fi

# Add extra arguments
if [ -n "$EXTRA_ARGS" ]; then
    CMD="$CMD $EXTRA_ARGS"
fi

# Add verbose flag for better user experience
CMD="$CMD --verbose"

# Run the analyzer
echo -e "${GREEN}📁 Analyzing: $FILE${NC}"
if [ -n "$CLASS_NAME" ]; then
    echo -e "${GREEN}🏗️  Class: $CLASS_NAME${NC}"
fi
echo ""

eval $CMD

echo ""
echo -e "${GREEN}✅ Analysis complete!${NC}"

if [ -n "$OUTPUT_FILE" ]; then
    echo -e "${BLUE}📄 Report saved to: $OUTPUT_FILE${NC}"
fi 