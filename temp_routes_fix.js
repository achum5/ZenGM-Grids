// Fix for the server routes - remove literal newlines
const fs = require('fs');
const content = fs.readFileSync('server/routes.ts', 'utf8');
const fixed = content.replace(/\\n/g, '\n');  
fs.writeFileSync('server/routes.ts', fixed);
console.log('Fixed newlines in routes.ts');