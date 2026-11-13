// Stamps the app icon into the Windows .exe. electron-builder normally does this itself, but
// that step is switched off here ("signAndEditExecutable": false) because its helper download
// fails to unpack on Windows machines without Developer Mode.
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const rcedit = require('rcedit');
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  await rcedit(exe, {
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    'version-string': { ProductName: 'Offline LaTeX Studio', FileDescription: 'Offline LaTeX Studio' }
  });
};
