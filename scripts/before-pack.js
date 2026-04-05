'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

/**
 * electron-builder beforePack hook.
 *
 * Verifies that the platform-specific native helper exists before packaging.
 * On Linux this is the compiled Rust binary; on Windows it is the PowerShell script.
 *
 * Run before building:
 *   Linux:   npm run build:helper:linux
 *   Windows: no extra step needed (PowerShell script is in source tree)
 */
exports.default = async function beforePack(context) {
  const platform = context.electronPlatformName; // 'linux' | 'win32' | 'darwin'

  if (platform === 'linux') {
    const helperBin = path.join(
      root,
      'native-helper',
      'conquer-helper',
      'target',
      'release',
      'conquer-helper',
    );

    if (!fs.existsSync(helperBin)) {
      throw new Error(
        `\n\nLinux native helper binary not found:\n  ${helperBin}\n\n` +
        `Build it first with:\n  npm run build:helper:linux\n\n` +
        `This requires the Rust toolchain. Install via:\n  https://rustup.rs\n` +
        `and then: sudo apt-get install libx11-dev libxtst-dev libxi-dev\n`,
      );
    }

    // Ensure the binary is executable
    try {
      fs.chmodSync(helperBin, 0o755);
    } catch (_) {
      // Non-fatal: electron-builder sets permissions itself
    }

    console.log(`[before-pack] Linux helper binary found: ${helperBin}`);
  }

  if (platform === 'win32') {
    const helperScript = path.join(
      root,
      'native-helper',
      'conquer-helper-spike.ps1',
    );

    if (!fs.existsSync(helperScript)) {
      throw new Error(
        `\n\nWindows PowerShell helper not found:\n  ${helperScript}\n` +
        `Ensure native-helper/conquer-helper-spike.ps1 is present in the repository.\n`,
      );
    }

    console.log(`[before-pack] Windows helper script found: ${helperScript}`);
  }
};
