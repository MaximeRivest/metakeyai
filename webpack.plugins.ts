import type IForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ForkTsCheckerWebpackPlugin: typeof IForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const CopyWebpackPlugin = require('copy-webpack-plugin');

export const plugins = [
  new ForkTsCheckerWebpackPlugin({
    logger: 'webpack-infrastructure',
  }),
  new CopyWebpackPlugin({
    patterns: [
      {
        from: 'src/python_scripts',
        to: 'python_scripts',
      },
      {
        from: 'src/shared-styles.css',
        to: 'shared-styles.css',
      },
      // Note: JavaScript files are handled by webpack entry points in forge.config.ts
      // Only static assets like CSS need to be copied
    ],
  }),
];
