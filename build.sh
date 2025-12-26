#!/bin/bash
# Dragon Extension Build Script
# Builds Chrome and Firefox extension packages from source

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$SCRIPT_DIR/src"
DIST_DIR="$SCRIPT_DIR/dist"

# Get version from Chrome manifest
get_version() {
    grep '"version"' "$SRC_DIR/chrome/manifest.json" | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+' | head -1
}

# Show usage
usage() {
    echo "Dragon Extension Build Script"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  (no args)   Build both Chrome and Firefox"
    echo "  chrome      Build Chrome only"
    echo "  firefox     Build Firefox only"
    echo "  clean       Clean dist directory"
    echo "  --version   Show current version"
    echo "  --bump      Bump patch version in both manifests"
    echo ""
}

# Clean dist directory
clean() {
    echo -e "${YELLOW}🧹 Cleaning dist directory...${NC}"
    rm -rf "$DIST_DIR"
    echo -e "${GREEN}✓ Cleaned${NC}"
}

# Copy common files to a target directory
copy_common() {
    local target="$1"
    echo -e "${BLUE}  → Copying common files...${NC}"
    
    # Copy common files
    cp "$SRC_DIR/common/browser-compat.js" "$target/"
    cp "$SRC_DIR/common/popup.css" "$target/"
    cp "$SRC_DIR/common/popup.js" "$target/"
    cp "$SRC_DIR/common/popup.html" "$target/"
    
    # Copy icons
    mkdir -p "$target/icons"
    cp "$SRC_DIR/common/icons/"*.png "$target/icons/"
    
    # Also copy icons to root for manifest compatibility
    cp "$SRC_DIR/common/icons/"*.png "$target/"
    
    # Copy modules
    mkdir -p "$target/modules"
    cp "$SRC_DIR/common/modules/"*.js "$target/modules/"
    cp "$SRC_DIR/common/modules/"*.html "$target/modules/"
}

# Build Chrome extension
build_chrome() {
    local version=$(get_version)
    echo -e "${GREEN}📦 Building Chrome extension v$version...${NC}"
    
    local chrome_dist="$DIST_DIR/chrome"
    mkdir -p "$chrome_dist"
    
    # Copy common files
    copy_common "$chrome_dist"
    
    # Copy Chrome-specific files
    echo -e "${BLUE}  → Copying Chrome-specific files...${NC}"
    cp "$SRC_DIR/chrome/manifest.json" "$chrome_dist/"
    cp "$SRC_DIR/chrome/background.js" "$chrome_dist/"
    cp "$SRC_DIR/chrome/content.js" "$chrome_dist/"
    cp "$SRC_DIR/chrome/offscreen.html" "$chrome_dist/"
    cp "$SRC_DIR/chrome/offscreen.js" "$chrome_dist/"
    cp "$SRC_DIR/chrome/privacy-policy.html" "$chrome_dist/"
    cp "$SRC_DIR/chrome/browser-polyfill.js" "$chrome_dist/"
    
    # Create ZIP
    echo -e "${BLUE}  → Creating ZIP package...${NC}"
    cd "$chrome_dist"
    zip -r "../dragon-chrome-v$version.zip" . -x "*.DS_Store" > /dev/null
    cd "$SCRIPT_DIR"
    
    echo -e "${GREEN}✓ Chrome build complete: dist/dragon-chrome-v$version.zip${NC}"
}

# Build Firefox extension
build_firefox() {
    local version=$(get_version)
    echo -e "${GREEN}📦 Building Firefox extension v$version...${NC}"
    
    local firefox_dist="$DIST_DIR/firefox"
    mkdir -p "$firefox_dist"
    
    # Copy common files
    copy_common "$firefox_dist"
    
    # Copy Firefox-specific files
    echo -e "${BLUE}  → Copying Firefox-specific files...${NC}"
    cp "$SRC_DIR/firefox/manifest.json" "$firefox_dist/"
    cp "$SRC_DIR/firefox/background.js" "$firefox_dist/"
    cp "$SRC_DIR/firefox/content.js" "$firefox_dist/"
    cp "$SRC_DIR/firefox/privacy-policy.html" "$firefox_dist/"
    
    # Create ZIP
    echo -e "${BLUE}  → Creating ZIP package...${NC}"
    cd "$firefox_dist"
    zip -r "../dragon-firefox-v$version.zip" . -x "*.DS_Store" > /dev/null
    cd "$SCRIPT_DIR"
    
    echo -e "${GREEN}✓ Firefox build complete: dist/dragon-firefox-v$version.zip${NC}"
}

# Bump version
bump_version() {
    local current=$(get_version)
    local major=$(echo $current | cut -d. -f1)
    local minor=$(echo $current | cut -d. -f2)
    local patch=$(echo $current | cut -d. -f3)
    local new_patch=$((patch + 1))
    local new_version="$major.$minor.$new_patch"
    
    echo -e "${YELLOW}🔄 Bumping version: $current → $new_version${NC}"
    
    # Update Chrome manifest
    sed -i '' "s/\"version\": \"$current\"/\"version\": \"$new_version\"/" "$SRC_DIR/chrome/manifest.json"
    echo -e "${GREEN}  ✓ Updated src/chrome/manifest.json${NC}"
    
    # Update Firefox manifest
    sed -i '' "s/\"version\": \"$current\"/\"version\": \"$new_version\"/" "$SRC_DIR/firefox/manifest.json"
    echo -e "${GREEN}  ✓ Updated src/firefox/manifest.json${NC}"
    
    echo -e "${GREEN}✓ Version bumped to $new_version${NC}"
}

# Main
case "$1" in
    "")
        clean
        build_chrome
        build_firefox
        echo ""
        echo -e "${GREEN}🎉 All builds complete!${NC}"
        echo -e "  Chrome: ${BLUE}dist/dragon-chrome-v$(get_version).zip${NC}"
        echo -e "  Firefox: ${BLUE}dist/dragon-firefox-v$(get_version).zip${NC}"
        ;;
    "chrome")
        clean
        build_chrome
        ;;
    "firefox")
        clean
        build_firefox
        ;;
    "clean")
        clean
        ;;
    "--version")
        echo "Dragon Extension v$(get_version)"
        ;;
    "--bump")
        bump_version
        ;;
    "-h"|"--help")
        usage
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        usage
        exit 1
        ;;
esac
