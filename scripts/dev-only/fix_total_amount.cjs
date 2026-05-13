const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
    });
}

const regex = /([a-zA-Z0-9_.]+)\.totalAmount !== undefined \? \1\.totalAmount :/g;

['pages', 'components', 'services'].forEach(dir => {
    walk(dir, filePath => {
        if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
            let content = fs.readFileSync(filePath, 'utf8');
            if (regex.test(content)) {
                let newContent = content.replace(regex, '$1.totalAmount ??');
                fs.writeFileSync(filePath, newContent, 'utf8');
                console.log('Updated ' + filePath);
            }
        }
    });
});
