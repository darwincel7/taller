import fs from 'fs';
import path from 'path';

function walk(dir, callback) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    if (fs.statSync(dirPath).isDirectory()) {
      walk(dirPath, callback);
    } else {
      callback(dirPath);
    }
  });
}

const targets = ['services'];

targets.forEach(target => {
  if (fs.existsSync(target)) {
    if (fs.statSync(target).isDirectory()) {
      walk(target, filePath => {
        if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
          processFile(filePath);
        }
      });
    } else {
      processFile(target);
    }
  }
});

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  if (content.includes('gemini-3-flash-preview')) {
    let newContent = content.replace(/gemini-3-flash-preview/g, 'gemini-2.5-flash');
    fs.writeFileSync(filePath, newContent, 'utf-8');
    console.log(`Replaced in ${filePath}`);
  }
}

