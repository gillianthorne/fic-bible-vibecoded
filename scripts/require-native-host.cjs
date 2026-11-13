// electron-builder beforeBuild hook.
//
// SQLite is compiled from source on the machine doing the build, and that
// can't target another OS. Building the Linux package on Windows (or the
// reverse) would ship a binary for the wrong platform, so refuse instead.
exports.default = async function requireNativeHost(context) {
  const target = context.platform.nodeName
  if (target !== process.platform) {
    throw new Error(
      `Cannot build the ${target} package on ${process.platform}: the native SQLite ` +
        `module must be compiled on ${target}. Run this build on a ${target} machine.`
    )
  }
  // Also guard the "force_build" flag: without it the rebuild silently
  // compiles nothing and the app can't open its database.
  if (process.env.npm_package_config_node_gyp_force_build !== '1') {
    throw new Error('Run packaging through the npm scripts (npm run dist:win / dist:linux).')
  }
  return true
}
