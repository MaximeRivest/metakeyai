import type { ForgeConfig } from '@electron-forge/shared-types';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    extraResource: [
      'resources',
      'requirements.txt'
    ],
    // Ignore Python environment during ASAR packaging (it should be external)
    ignore: [
      /python-env/,
      /\.pyc$/,
      /__pycache__/
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'metakeyai'
      },
      platforms: ['win32']
    },
    {
      name: '@electron-forge/maker-zip',
      config: {},
      platforms: ['darwin']
    },
    {
      name: '@reforged/maker-appimage',
      config: {
        options: {
          // You can add options here, e.g., categories
          // categories: ['Utility']
        }
      },
      platforms: ['linux']
    }
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/visualizer.html',
            js: './src/visualizer.ts',
            name: 'visualizer_window',
          },
          {
            html: './src/pastille.html',
            js: './src/pastille.ts',
            name: 'pastille_window',
          },
          {
            html: './src/settings.html',
            js: './src/settings.ts',
            name: 'settings_window',
          },
          {
            html: './src/spell-book.html',
            js: './src/spell-book.ts',
            name: 'spell_book_window',
          },
        ],
      },
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
