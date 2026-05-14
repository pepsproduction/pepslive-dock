const fs = require('fs');

function checkInlineScript(file) {
  const html = fs.readFileSync(file, 'utf8');
  const match = html.match(/<script>([\s\S]*)<\/script>/);
  if (!match) throw new Error(`Missing inline script in ${file}`);
  new Function(match[1]);
  console.log(`${file}: inline script syntax OK`);
}

function checkScript(file) {
  new Function(fs.readFileSync(file, 'utf8'));
  console.log(`${file}: syntax OK`);
}

checkInlineScript('PepsLive_Dock_V1.html');
checkScript('bridge/google_apps_script_save_result.gs');
