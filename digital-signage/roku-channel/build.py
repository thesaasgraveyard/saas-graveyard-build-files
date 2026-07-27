#!/usr/bin/env python3
"""
build.py  —  Digital Signage Roku Channel Builder

Run this script after editing source/config.brs to package
the channel into a .zip file ready to upload to your Roku.

Usage:
    python3 build.py

Output:
    digital-signage.zip   (created in the same folder as this script)
"""

import os
import zipfile
import sys

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
OUTPUT_ZIP  = os.path.join(SCRIPT_DIR, "digital-signage.zip")
CONFIG_FILE = os.path.join(SCRIPT_DIR, "source", "config.brs")

# Files and folders that must be included in the channel zip
REQUIRED_DIRS = ["source", "components", "images"]
REQUIRED_FILES = ["manifest"]


def check_config():
    """Warn if the user forgot to update the URL."""
    with open(CONFIG_FILE, "r") as f:
        content = f.read()
    if "YOUR_GOOGLE_APPS_SCRIPT_URL_HERE" in content:
        print()
        print("⚠️  WARNING: You haven't set your playlist URL yet!")
        print("   Open  source/config.brs  and replace:")
        print('   YOUR_GOOGLE_APPS_SCRIPT_URL_HERE')
        print("   with your actual Google Apps Script Web App URL.")
        print()
        ans = input("   Build anyway? (y/n): ").strip().lower()
        if ans != "y":
            print("Cancelled. Edit config.brs first, then re-run build.py")
            sys.exit(0)
    else:
        print("✅  config.brs looks good — URL is set.")


def build():
    check_config()

    if os.path.exists(OUTPUT_ZIP):
        os.remove(OUTPUT_ZIP)

    file_count = 0
    with zipfile.ZipFile(OUTPUT_ZIP, "w", zipfile.ZIP_DEFLATED) as zf:
        for item in REQUIRED_FILES:
            full = os.path.join(SCRIPT_DIR, item)
            if os.path.isfile(full):
                zf.write(full, item)
                file_count += 1
            else:
                print(f"❌  Missing required file: {item}")
                sys.exit(1)

        for folder in REQUIRED_DIRS:
            folder_path = os.path.join(SCRIPT_DIR, folder)
            if not os.path.isdir(folder_path):
                print(f"❌  Missing required folder: {folder}/")
                sys.exit(1)
            for root, dirs, files in os.walk(folder_path):
                for fname in files:
                    if fname.startswith("."):
                        continue
                    full_path = os.path.join(root, fname)
                    arc_path  = os.path.relpath(full_path, SCRIPT_DIR)
                    zf.write(full_path, arc_path)
                    file_count += 1

    size_kb = os.path.getsize(OUTPUT_ZIP) / 1024
    print()
    print(f"✅  Built successfully!")
    print(f"   File:  {OUTPUT_ZIP}")
    print(f"   Size:  {size_kb:.1f} KB")
    print(f"   Files: {file_count}")
    print()
    print("Next steps:")
    print("  1. Enable Developer Mode on your Roku (see Setup Guide)")
    print("  2. Open  http://<ROKU-IP-ADDRESS>  in your browser")
    print("  3. Upload  digital-signage.zip  via the web interface")
    print("  4. The channel will appear on your Roku home screen")


if __name__ == "__main__":
    build()
