const fs = require('fs');
const path = require('path');

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let lines = content.split('\n');
    let changed = false;

    // First do the easy ones (when we don't have onClick)
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (line.includes('className=') && line.includes('fixed inset-0') && !line.includes('onClick=')) {
            // Find the closest variable condition above
            let closeVariable = null;
            let handler = null;
            for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
                let prevLine = lines[j];
                const match = prevLine.match(/{\s*([a-zA-Z0-9_]+)\s*&&\s*\(/);
                if (match) {
                    closeVariable = match[1];
                    let isBoolean = closeVariable.startsWith('show') || closeVariable.startsWith('is');
                    if (isBoolean) {
                       let setter = 'set' + closeVariable.charAt(0).toUpperCase() + closeVariable.slice(1);
                       handler = `onClick={() => ${setter}(false)}`;
                    } else {
                       let setter = 'set' + closeVariable.charAt(0).toUpperCase() + closeVariable.slice(1);
                       handler = `onClick={() => ${setter}(null)}`;
                    }
                    break;
                }
            }
            if (handler) {
                // Add handler to the div and stopProp to its first child
                lines[i] = line.replace('>', ` ${handler}>`);
                if (i + 1 < lines.length && lines[i+1].includes('<div ') && !lines[i+1].includes('onClick=')) {
                    lines[i+1] = lines[i+1].replace('>', ` onClick={(e) => e.stopPropagation()}>`);
                } else if (i + 2 < lines.length && lines[i+2].includes('<div ') && !lines[i+2].includes('onClick=')) {
                    lines[i+2] = lines[i+2].replace('>', ` onClick={(e) => e.stopPropagation()}>`);
                }
                changed = true;
            }
        }
    }
    
    // Now some specific onClick handlers that need stopPropagation on children
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (line.includes('className=') && line.includes('fixed inset-0') && line.includes('onClick=')) {
            if (i + 1 < lines.length && lines[i+1].includes('<div ') && !lines[i+1].includes('onClick=')) {
                lines[i+1] = lines[i+1].replace('>', ` onClick={(e) => e.stopPropagation()}>`);
                changed = true;
            }
            if (i + 2 < lines.length && lines[i+1] && !lines[i+1].includes('<div ') && lines[i+2].includes('<div ') && !lines[i+2].includes('onClick=')) {
                lines[i+2] = lines[i+2].replace('>', ` onClick={(e) => e.stopPropagation()}>`);
                changed = true;
            }
        }
    }
    
    if (changed) {
        fs.writeFileSync(filePath, lines.join('\n'));
        console.log('Patched: ' + filePath);
    }
}

function walk(dir) {
    let list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = dir + '/' + file;
        let stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            walk(file);
        } else {
            if (file.endsWith('.tsx') && !file.includes('node_modules')) {
                processFile(file);
            }
        }
    });
}

walk('./pages');
walk('./components');
