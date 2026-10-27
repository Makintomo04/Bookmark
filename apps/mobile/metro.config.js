// Expo's Metro config, with Sentry's additions so crash reports' stack traces match the uploaded source maps
// (BOO-54), watching the monorepo for packages/shared. The web app isn't part of the phone
// app, and its builds and edits (.next, new files) crashed Metro's file watcher, so it's left out.
const path = require("path");
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);
const web = path.resolve(__dirname, "../web").replace(/[\^$.*+?()[\]{}|]/g, "\$&");
config.resolver.blockList = [].concat(config.resolver.blockList ?? [], new RegExp(`^${web}[\\/].*`));

module.exports = config;
